import crypto from 'crypto';
import { prisma } from '../../utils/prisma';
import { RoomWsEnvelope } from './room-types';

export type RoomEventBroadcaster = (
  roomCode: string,
  envelope: RoomWsEnvelope,
  legacyFlat?: Record<string, any>
) => void;

export interface EmitEventInput {
  roomCode: string;
  type: string;
  actorId?: string | null;
  payload: Record<string, any>;
  revision?: number;
  auditAction?: string;
  auditTargetId?: string | null;
  auditMetadata?: Record<string, any>;
  legacyFlat?: Record<string, any>;
  skipPersist?: boolean;
}

class RoomEventServiceImpl {
  private broadcaster: RoomEventBroadcaster | null = null;

  public registerBroadcaster(fn: RoomEventBroadcaster): void {
    this.broadcaster = fn;
  }

  /**
   * Atomically increments `rooms.seq`, persists to `room_events` (and optional `room_audit`),
   * and fans out the versioned WebSocket envelope.
   */
  public async emit(input: EmitEventInput): Promise<RoomWsEnvelope> {
    const code = input.roomCode.trim().toUpperCase();
    const now = Date.now();
    const eventId = crypto.randomUUID();

    if (input.skipPersist) {
      const env: RoomWsEnvelope = {
        eventId,
        schemaVersion: 1,
        roomId: code,
        type: input.type,
        seq: 0,
        revision: input.revision ?? 0,
        serverTimestampMs: now,
        actorId: input.actorId ?? null,
        payload: input.payload,
      };
      this.broadcaster?.(code, env, input.legacyFlat);
      return env;
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.togetherRoom.update({
        where: { code },
        data: { seq: { increment: 1 } },
        select: { seq: true, queueRevision: true },
      });

      const seqNum = Number(updated.seq);
      const rev = input.revision ?? updated.queueRevision;

      await tx.togetherRoomEvent.create({
        data: {
          eventId,
          roomCode: code,
          seq: updated.seq,
          type: input.type,
          actorId: input.actorId ?? null,
          payload: input.payload as any,
        },
      });

      if (input.auditAction && input.actorId) {
        await tx.togetherRoomAudit.create({
          data: {
            roomCode: code,
            actorId: input.actorId,
            action: input.auditAction,
            targetId: input.auditTargetId ?? null,
            metadata: (input.auditMetadata ?? input.payload) as any,
          },
        });
      }

      return { seqNum, rev };
    });

    const envelope: RoomWsEnvelope = {
      eventId,
      schemaVersion: 1,
      roomId: code,
      type: input.type,
      seq: result.seqNum,
      revision: result.rev,
      serverTimestampMs: now,
      actorId: input.actorId ?? null,
      payload: input.payload,
    };

    this.broadcaster?.(code, envelope, input.legacyFlat);
    return envelope;
  }

  /**
   * Sends a targeted ephemeral envelope without persisting or consuming a `seq` number (e.g. ACK, SYNC_PONG).
   */
  public buildEphemeral(
    roomCode: string,
    type: string,
    seq: number,
    revision: number,
    payload: Record<string, any>,
    actorId: string | null = null
  ): RoomWsEnvelope {
    return {
      eventId: crypto.randomUUID(),
      schemaVersion: 1,
      roomId: roomCode.toUpperCase(),
      type,
      seq,
      revision,
      serverTimestampMs: Date.now(),
      actorId,
      payload,
    };
  }

  /**
   * Replays missed persisted events after reconnect (`RESUME { lastSeq }`).
   * If gap > 200 events, signals caller to send full snapshot instead.
   */
  public async getReplaySince(
    roomCode: string,
    lastSeq: number,
    maxReplay = 200
  ): Promise<{ requiresResync: boolean; events: RoomWsEnvelope[] }> {
    const code = roomCode.trim().toUpperCase();
    const room = await prisma.togetherRoom.findUnique({
      where: { code },
      select: { seq: true, queueRevision: true },
    });
    if (!room) return { requiresResync: true, events: [] };

    const currentSeq = Number(room.seq);
    if (lastSeq < 0 || currentSeq - lastSeq > maxReplay) {
      return { requiresResync: true, events: [] };
    }
    if (lastSeq >= currentSeq) {
      return { requiresResync: false, events: [] };
    }

    const rows = await prisma.togetherRoomEvent.findMany({
      where: {
        roomCode: code,
        seq: { gt: BigInt(lastSeq) },
      },
      orderBy: { seq: 'asc' },
      take: maxReplay,
    });

    // If oldest retained event has seq > lastSeq + 1, history was pruned -> resync
    if (rows.length > 0 && Number(rows[0].seq) > lastSeq + 1) {
      return { requiresResync: true, events: [] };
    }

    return {
      requiresResync: false,
      events: rows.map((r) => ({
        eventId: r.eventId,
        schemaVersion: 1 as const,
        roomId: r.roomCode,
        type: r.type,
        seq: Number(r.seq),
        revision: room.queueRevision,
        serverTimestampMs: r.createdAt.getTime(),
        actorId: r.actorId,
        payload: (r.payload as Record<string, any>) ?? {},
      })),
    };
  }

  /**
   * Builds human-readable timeline items matching Flutter `ActivityEvent` (`activity_feed.dart`).
   */
  public async getActivityFeed(roomCode: string, limit = 60) {
    const code = roomCode.trim().toUpperCase();
    const [audits, members] = await Promise.all([
      prisma.togetherRoomAudit.findMany({
        where: { roomCode: code },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.togetherRoomMember.findMany({
        where: { roomCode: code },
        select: { userId: true, displayName: true },
      }),
    ]);

    const nameMap = new Map(members.map((m) => [m.userId, m.displayName]));

    return audits.map((a) => {
      const meta = (a.metadata as Record<string, any>) ?? {};
      const actorName =
        meta.actorName || nameMap.get(a.actorId) || (a.actorId === 'system' ? 'System' : 'Member');
      const targetName =
        meta.targetName || (a.targetId ? nameMap.get(a.targetId) || a.targetId : undefined);
      const trackTitle = meta.trackTitle || meta.title;

      let description = meta.description as string | undefined;
      if (!description) {
        switch (a.action) {
          case 'ROOM_CREATED':
            description = `${actorName} started this room`;
            break;
          case 'MEMBER_JOINED':
            description = `${actorName} joined the room`;
            break;
          case 'MEMBER_LEFT':
            description = `${actorName} left the room`;
            break;
          case 'QUEUE_ADD':
            description = `${actorName} added ${trackTitle ? `"${trackTitle}"` : 'a track'}`;
            break;
          case 'PLAY_AT':
            description = `${actorName} started playback${trackTitle ? ` · ${trackTitle}` : ''}`;
            break;
          case 'PAUSE_AT':
            description = `${actorName} paused playback`;
            break;
          case 'SEEK_TO':
            description = `${actorName} seeked playback`;
            break;
          case 'ROLE_CHANGE':
            description = `${actorName} updated ${targetName ?? 'member'}'s role to ${meta.newRole ?? meta.role ?? 'member'}`;
            break;
          case 'HOST_TRANSFER':
            description = `${actorName} transferred host to ${targetName ?? 'a member'}`;
            break;
          case 'MEMBER_KICKED':
            description = `${actorName} removed ${targetName ?? 'a member'}`;
            break;
          case 'MEMBER_BLOCKED':
            description = `${actorName} blocked ${targetName ?? 'a member'}`;
            break;
          case 'SONG_REQUESTED':
            description = `${actorName} requested ${trackTitle ? `"${trackTitle}"` : 'a track'}`;
            break;
          case 'SONG_REQUEST_APPROVED':
            description = `${actorName} approved ${trackTitle ? `"${trackTitle}"` : 'a request'}`;
            break;
          case 'SONG_REQUEST_REJECTED':
            description = `${actorName} declined ${trackTitle ? `"${trackTitle}"` : 'a request'}`;
            break;
          case 'BOOKMARK_ADDED':
            description = `${actorName} bookmarked ${trackTitle ? `"${trackTitle}"` : 'a moment'}`;
            break;
          case 'THEME_CHANGED':
            description = `${actorName} updated the room theme`;
            break;
          case 'ANNOUNCE':
            description = `${actorName} pinned an announcement`;
            break;
          case 'ROOM_CLOSED':
            description = `Room closed (${meta.reason ?? 'ENDED'})`;
            break;
          default:
            description = `${actorName}: ${a.action.toLowerCase().replace(/_/g, ' ')}`;
        }
      }

      return {
        id: a.id.toString(),
        type: a.action,
        actorName,
        targetName: targetName ?? null,
        description,
        timestampMs: a.createdAt.getTime(),
      };
    });
  }
}

export const roomEventService = new RoomEventServiceImpl();

