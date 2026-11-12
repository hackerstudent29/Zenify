import { prisma } from '../../utils/prisma';
import { RoomAnalyticsService } from './room-analytics.service';
import { roomEventService } from './room-event.service';
import { RoomSessionService } from './room-session.service';
import { roomStore } from './room-store';
import { normalizeRole } from './room-types';

const TICK_INTERVAL_MS = 15_000;
const HOST_FAILOVER_MS = 90_000;
const MEMBER_STALE_MS = 10 * 60_000;
const EMPTY_ROOM_CLOSE_MS = 10 * 60_000;

export class RoomLifecycleScheduler {
  private static timer: NodeJS.Timeout | null = null;
  private static running = false;
  private static warnedRooms = new Map<string, { w5: boolean; w1: boolean }>();
  private static emptySince = new Map<string, number>();
  private static lastRetentionRun = 0;

  static start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        console.warn('[RoomLifecycleScheduler] Tick error:', err?.message || err);
      });
    }, TICK_INTERVAL_MS);
    this.timer.unref?.();
    console.log('[RoomLifecycleScheduler] Started (15s interval)');
  }

  static stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  static async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = Date.now();
      const nowDate = new Date(now);

      const activeRooms = await prisma.togetherRoom.findMany({
        where: { state: { in: ['ACTIVE', 'PAUSED', 'EMPTY'] } },
        take: 100,
      });

      for (const room of activeRooms) {
        const code = room.code;

        // 1. Duration expiry & T-5m / T-1m warnings
        if (room.expiresAt) {
          const remainingMs = room.expiresAt.getTime() - now;
          if (remainingMs <= 0) {
            await RoomSessionService.closeRoom(code, 'system', 'EXPIRED').catch(() => undefined);
            this.warnedRooms.delete(code);
            this.emptySince.delete(code);
            continue;
          }
          const warnState = this.warnedRooms.get(code) ?? { w5: false, w1: false };
          if (remainingMs <= 5 * 60_000 && !warnState.w5) {
            warnState.w5 = true;
            this.warnedRooms.set(code, warnState);
            await roomEventService
              .emit({
                roomCode: code,
                type: 'ROOM_ENDING_SOON',
                actorId: 'system',
                payload: { remainingSeconds: Math.round(remainingMs / 1000) },
              })
              .catch(() => undefined);
          } else if (remainingMs <= 60_000 && !warnState.w1) {
            warnState.w1 = true;
            this.warnedRooms.set(code, warnState);
            await roomEventService
              .emit({
                roomCode: code,
                type: 'ROOM_ENDING_SOON',
                actorId: 'system',
                payload: { remainingSeconds: Math.round(remainingMs / 1000) },
              })
              .catch(() => undefined);
          }
        }

        // 2. Active member inspection (presence / failover / empty auto-close)
        const members = await prisma.togetherRoomMember.findMany({
          where: { roomCode: code, leftAt: null },
          orderBy: { joinedAt: 'asc' },
        });

        const presenceMap = roomStore.getRoomPresenceMap(code);
        const onlineMembers = members.filter((m) => {
          const p = presenceMap.get(m.userId);
          const seenAt = p?.lastSeenMs ?? m.lastSeenAt.getTime();
          return now - seenAt < 45_000;
        });

        // Clean up members disconnected > 10m
        for (const m of members) {
          const p = presenceMap.get(m.userId);
          const seenAt = p?.lastSeenMs ?? m.lastSeenAt.getTime();
          if (now - seenAt > MEMBER_STALE_MS && m.userId !== room.hostId) {
            await prisma.togetherRoomMember
              .update({
                where: { roomCode_userId: { roomCode: code, userId: m.userId } },
                data: { leftAt: nowDate },
              })
              .catch(() => undefined);
            roomStore.removePresence(code, m.userId);
            await RoomAnalyticsService.closeSession(code, m.userId).catch(() => undefined);
          }
        }

        // Empty check
        if (members.length === 0 || (onlineMembers.length === 0 && now - room.updatedAt.getTime() > 60_000)) {
          const startedEmptyAt = this.emptySince.get(code) ?? now;
          this.emptySince.set(code, startedEmptyAt);
          if (now - startedEmptyAt >= EMPTY_ROOM_CLOSE_MS) {
            await RoomSessionService.closeRoom(code, 'system', 'EMPTY').catch(() => undefined);
            this.emptySince.delete(code);
            continue;
          }
        } else {
          this.emptySince.delete(code);
        }

        // Host disconnect failover (> 90s offline while another online member exists)
        const hostMember = members.find((m) => m.userId === room.hostId);
        const hostSeenMs = hostMember
          ? (presenceMap.get(room.hostId)?.lastSeenMs ?? hostMember.lastSeenAt.getTime())
          : 0;
        const candidates = onlineMembers.filter((m) => m.userId !== room.hostId);
        if (now - hostSeenMs > HOST_FAILOVER_MS && candidates.length > 0) {
          const priority = { CO_HOST: 4, MODERATOR: 3, DJ: 3, MEMBER: 2, LISTENER: 1 } as Record<string, number>;
          candidates.sort(
            (a, b) =>
              (priority[normalizeRole(b.role)] || 0) - (priority[normalizeRole(a.role)] || 0) ||
              a.joinedAt.getTime() - b.joinedAt.getTime()
          );
          const nextHost = candidates[0];
          await prisma
            .$transaction([
              prisma.togetherRoom.update({ where: { code }, data: { hostId: nextHost.userId } }),
              prisma.togetherRoomMember.updateMany({
                where: { roomCode: code, userId: room.hostId },
                data: { role: 'CO_HOST' },
              }),
              prisma.togetherRoomMember.update({
                where: { roomCode_userId: { roomCode: code, userId: nextHost.userId } },
                data: { role: 'HOST' },
              }),
            ])
            .catch(() => undefined);

          await roomEventService
            .emit({
              roomCode: code,
              type: 'HOST_TRANSFERRED',
              actorId: 'system',
              payload: {
                fromUserId: room.hostId,
                toUserId: nextHost.userId,
                newHostName: nextHost.displayName,
                reason: 'HOST_TIMEOUT',
              },
              auditAction: 'HOST_TRANSFER',
              auditTargetId: nextHost.userId,
              auditMetadata: { actorName: 'System', targetName: nextHost.displayName },
            })
            .catch(() => undefined);
        }

        // Analytics tick (15s)
        if (members.length > 0) {
          await RoomAnalyticsService.tickActiveRoomSeconds(
            code,
            room.hostId,
            room.playbackState === 'playing',
            members.map((m) => ({
              userId: m.userId,
              role: normalizeRole(m.role),
              isGuest: m.isGuest,
            })),
            15
          ).catch(() => undefined);
        }
      }

      // 3. Expire stale pending join requests & song requests (30m)
      const staleReqCutoff = new Date(now - 30 * 60_000);
      await Promise.all([
        prisma.togetherJoinRequest.updateMany({
          where: { status: 'PENDING', expiresAt: { lt: nowDate } },
          data: { status: 'EXPIRED' },
        }),
        prisma.togetherSongRequest.updateMany({
          where: { status: 'PENDING', createdAt: { lt: staleReqCutoff } },
          data: { status: 'EXPIRED' },
        }),
      ]).catch(() => undefined);

      // 4. Purge memory store & periodic DB retention cleanup (every 6h)
      roomStore.purgeExpiredMemoryEntries();
      if (now - this.lastRetentionRun > 6 * 3600_000) {
        this.lastRetentionRun = now;
        await RoomAnalyticsService.cleanupRetention();
      }
    } finally {
      this.running = false;
    }
  }
}

