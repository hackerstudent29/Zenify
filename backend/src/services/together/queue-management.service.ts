import crypto from 'crypto';
import { prisma } from '../../utils/prisma';
import { RoomAnalyticsService } from './room-analytics.service';
import { roomEventService } from './room-event.service';
import { RoomPermissionService } from './room-permission.service';
import { RoomSessionService, sanitizeTrackDTO } from './room-session.service';
import { roomStore } from './room-store';
import {
  normalizeRequestMode,
  normalizeRole,
  RoomHttpError,
  TogetherQueueItemDTO,
} from './room-types';

export class QueueManagementService {
  /**
   * Adds a track or creates a SongRequest depending on DJ `requestMode` and member role.
   */
  static async addTrack(roomCode: string, actorId: string, rawTrack: any) {
    const code = roomCode.trim().toUpperCase();
    const track = sanitizeTrackDTO(rawTrack);

    return roomStore.withRoomLock(code, async () => {
      const [room, member] = await Promise.all([
        prisma.togetherRoom.findUnique({ where: { code } }),
        prisma.togetherRoomMember.findUnique({
          where: { roomCode_userId: { roomCode: code, userId: actorId } },
        }),
      ]);
      if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
      if (!member || member.leftAt !== null) {
        throw new RoomHttpError(403, 'NOT_A_MEMBER', 'Join the room first.');
      }
      if (room.state === 'CLOSED' || room.state === 'EXPIRED') {
        throw new RoomHttpError(410, 'ROOM_CLOSED', 'Room has closed.');
      }

      const role = actorId === room.hostId ? 'HOST' : normalizeRole(member.role);
      const isPrivileged = role === 'HOST' || role === 'CO_HOST' || role === 'MODERATOR';
      const requestMode = normalizeRequestMode(room.requestMode);

      if (room.queueLocked && !isPrivileged) {
        throw new RoomHttpError(403, 'QUEUE_LOCKED', 'Queue is locked by the DJ.');
      }

      if (!isPrivileged && !room.allowListenersAddQueue && room.mode === 'dj' && requestMode === 'HOST_ONLY') {
        throw new RoomHttpError(403, 'FORBIDDEN', 'Only the host can add tracks right now.');
      }

      // Check DJ request approval flow for non-privileged users
      const requiresRequestApproval =
        !isPrivileged &&
        (requestMode === 'APPROVAL' || (room.mode === 'dj' && requestMode !== 'ANYONE' && !room.allowListenersAddQueue));

      if (requiresRequestApproval || (!isPrivileged && requestMode === 'LIMITED')) {
        if (requiresRequestApproval) {
          const pendingCount = await prisma.togetherSongRequest.count({
            where: { roomCode: code, requesterId: actorId, status: 'PENDING' },
          });
          if (pendingCount >= (room.requestMaxPerUser || 3)) {
            throw new RoomHttpError(
              429,
              'REQUEST_LIMIT_REACHED',
              `You can have at most ${room.requestMaxPerUser || 3} pending requests.`
            );
          }
          const reqRow = await prisma.togetherSongRequest.create({
            data: {
              roomCode: code,
              requesterId: actorId,
              requesterName: member.displayName,
              trackId: track.id,
              trackJson: track as any,
              status: 'PENDING',
            },
          });

          const reqDto = {
            id: reqRow.id,
            roomCode: code,
            userId: actorId,
            username: member.displayName,
            trackId: track.id,
            track,
            status: 'PENDING',
            createdAtMs: reqRow.createdAt.getTime(),
          };

          await roomEventService.emit({
            roomCode: code,
            type: 'SONG_REQUESTED',
            actorId,
            payload: { request: reqDto },
            auditAction: 'SONG_REQUESTED',
            auditMetadata: { actorName: member.displayName, trackTitle: track.title },
          });

          return { kind: 'REQUESTED' as const, request: reqDto };
        }
      }

      // Direct queue insertion with revision increment inside DB transaction
      return this.insertQueueItemLocked(code, room, member, track);
    });
  }

  private static async insertQueueItemLocked(
    code: string,
    room: any,
    member: { userId: string; displayName: string },
    track: any
  ) {
    const queue = (Array.isArray(room.queue) ? [...room.queue] : []) as TogetherQueueItemDTO[];
    if (queue.length >= 250) {
      throw new RoomHttpError(400, 'QUEUE_LIMIT', 'Queue limit of 250 tracks reached.');
    }

    const item: TogetherQueueItemDTO = {
      id: `q_${crypto.randomBytes(6).toString('hex')}`,
      trackId: track.id,
      track,
      addedByUserId: member.userId,
      addedByName: member.displayName,
      addedAt: Date.now(),
    };
    queue.push(item);

    const startImmediately = !room.currentTrackId;
    const nextRev = room.queueRevision + 1;

    await prisma.togetherRoom.update({
      where: { code },
      data: {
        queue: queue as any,
        queueRevision: nextRev,
        ...(startImmediately
          ? {
              currentTrackId: track.id,
              currentTrack: track as any,
              playbackState: 'playing',
              playbackPositionMs: BigInt(0),
              startedAtServerMs: BigInt(Date.now()),
              skipVotes: [],
            }
          : {}),
      },
    });

    await RoomAnalyticsService.incrementCounter(code, member.userId, 'songsAdded', 1).catch(
      () => undefined
    );

    if (startImmediately) {
      const members = await prisma.togetherRoomMember.findMany({
        where: { roomCode: code, leftAt: null },
        select: { userId: true, isGuest: true },
      });
      await RoomAnalyticsService.recordTrackPlay(code, track, members, member.userId).catch(
        () => undefined
      );
    }

    await roomEventService.emit({
      roomCode: code,
      type: 'QUEUE_UPDATED',
      actorId: member.userId,
      revision: nextRev,
      payload: {
        queue,
        queueRevision: nextRev,
        addedItem: item,
        currentTrack: startImmediately ? track : room.currentTrack,
      },
      auditAction: 'QUEUE_ADD',
      auditMetadata: { actorName: member.displayName, trackTitle: track.title },
      legacyFlat: { queue, queueRevision: nextRev },
    });

    if (startImmediately) {
      await roomEventService.emit({
        roomCode: code,
        type: 'PLAY_AT',
        actorId: member.userId,
        revision: nextRev,
        payload: {
          trackId: track.id,
          track,
          positionSec: 0,
          positionMs: 0,
          startedAtServerMs: Date.now(),
        },
        legacyFlat: {
          trackId: track.id,
          track,
          positionSec: 0,
          startedAtServerMs: Date.now(),
        },
      });
    }

    return { kind: 'QUEUED' as const, item, queue, queueRevision: nextRev };
  }

  static async reorderQueue(
    roomCode: string,
    actorId: string,
    fromIndex: number,
    toIndex: number,
    baseRevision?: number
  ) {
    const code = roomCode.trim().toUpperCase();
    return roomStore.withRoomLock(code, async () => {
      const [room, actor] = await Promise.all([
        prisma.togetherRoom.findUnique({ where: { code } }),
        prisma.togetherRoomMember.findUnique({
          where: { roomCode_userId: { roomCode: code, userId: actorId } },
        }),
      ]);
      if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
      if (!actor || actor.leftAt !== null) {
        throw new RoomHttpError(403, 'NOT_A_MEMBER', 'Not an active member.');
      }
      RoomPermissionService.requirePermission(room, actor, 'REORDER_QUEUE');

      if (baseRevision !== undefined && baseRevision !== room.queueRevision) {
        throw new RoomHttpError(
          409,
          'QUEUE_CONFLICT',
          'Queue changed on another device. Syncing latest queue.',
          {
            currentRevision: room.queueRevision,
            queue: room.queue,
          }
        );
      }

      const queue = (Array.isArray(room.queue) ? [...room.queue] : []) as unknown as TogetherQueueItemDTO[];
      if (
        fromIndex < 0 ||
        fromIndex >= queue.length ||
        toIndex < 0 ||
        toIndex >= queue.length
      ) {
        throw new RoomHttpError(400, 'INVALID_INDEX', 'Queue index out of bounds.');
      }

      const [moved] = queue.splice(fromIndex, 1);
      queue.splice(toIndex, 0, moved);
      const nextRev = room.queueRevision + 1;

      await prisma.togetherRoom.update({
        where: { code },
        data: { queue: queue as any, queueRevision: nextRev },
      });

      await roomEventService.emit({
        roomCode: code,
        type: 'QUEUE_UPDATED',
        actorId,
        revision: nextRev,
        payload: { queue, queueRevision: nextRev },
        legacyFlat: { queue, queueRevision: nextRev },
      });

      return { queue, queueRevision: nextRev };
    });
  }

  static async removeQueueItem(
    roomCode: string,
    actorId: string,
    itemId: string,
    baseRevision?: number
  ) {
    const code = roomCode.trim().toUpperCase();
    return roomStore.withRoomLock(code, async () => {
      const [room, actor] = await Promise.all([
        prisma.togetherRoom.findUnique({ where: { code } }),
        prisma.togetherRoomMember.findUnique({
          where: { roomCode_userId: { roomCode: code, userId: actorId } },
        }),
      ]);
      if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
      if (!actor || actor.leftAt !== null) {
        throw new RoomHttpError(403, 'NOT_A_MEMBER', 'Not an active member.');
      }

      if (baseRevision !== undefined && baseRevision !== room.queueRevision) {
        throw new RoomHttpError(409, 'QUEUE_CONFLICT', 'Queue conflict detected.', {
          currentRevision: room.queueRevision,
          queue: room.queue,
        });
      }

      const queue = (Array.isArray(room.queue) ? [...room.queue] : []) as unknown as TogetherQueueItemDTO[];
      const target = queue.find((q) => q.id === itemId);
      if (!target) throw new RoomHttpError(404, 'ITEM_NOT_FOUND', 'Queue item not found.');

      const isSelfAdded = target.addedByUserId === actorId;
      if (!isSelfAdded) {
        RoomPermissionService.requirePermission(room, actor, 'REMOVE_QUEUE');
      }

      const nextQueue = queue.filter((q) => q.id !== itemId);
      const nextRev = room.queueRevision + 1;

      await prisma.togetherRoom.update({
        where: { code },
        data: { queue: nextQueue as any, queueRevision: nextRev },
      });

      await roomEventService.emit({
        roomCode: code,
        type: 'QUEUE_UPDATED',
        actorId,
        revision: nextRev,
        payload: { queue: nextQueue, queueRevision: nextRev, removedId: itemId },
        legacyFlat: { queue: nextQueue, queueRevision: nextRev },
      });

      return { queue: nextQueue, queueRevision: nextRev };
    });
  }

  static async listRequests(roomCode: string) {
    const code = roomCode.trim().toUpperCase();
    const rows = await prisma.togetherSongRequest.findMany({
      where: { roomCode: code },
      orderBy: { createdAt: 'desc' },
      take: 80,
    });
    return rows.map((r) => ({
      id: r.id,
      roomCode: r.roomCode,
      userId: r.requesterId,
      username: r.requesterName,
      trackId: r.trackId,
      track: r.trackJson,
      status: r.status,
      reviewedBy: r.reviewedBy,
      createdAtMs: r.createdAt.getTime(),
    }));
  }

  static async reviewRequest(
    roomCode: string,
    actorId: string,
    requestId: string,
    action: 'APPROVE' | 'REJECT' | 'CANCEL'
  ) {
    const code = roomCode.trim().toUpperCase();
    return roomStore.withRoomLock(code, async () => {
      const [room, actor, reqRow] = await Promise.all([
        prisma.togetherRoom.findUnique({ where: { code } }),
        prisma.togetherRoomMember.findUnique({
          where: { roomCode_userId: { roomCode: code, userId: actorId } },
        }),
        prisma.togetherSongRequest.findUnique({ where: { id: requestId } }),
      ]);
      if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
      if (!reqRow || reqRow.roomCode !== code) {
        throw new RoomHttpError(404, 'REQUEST_NOT_FOUND', 'Song request not found.');
      }

      if (action === 'CANCEL') {
        if (reqRow.requesterId !== actorId) {
          throw new RoomHttpError(403, 'FORBIDDEN', 'Only the requester can cancel.');
        }
        await prisma.togetherSongRequest.update({
          where: { id: requestId },
          data: { status: 'CANCELLED', reviewedBy: actorId, reviewedAt: new Date() },
        });
        await roomEventService.emit({
          roomCode: code,
          type: 'SONG_REQUEST_UPDATED',
          actorId,
          payload: { id: requestId, status: 'CANCELLED' },
        });
        return { id: requestId, status: 'CANCELLED' };
      }

      RoomPermissionService.requirePermission(room, actor, 'REVIEW_REQUESTS');
      const nextStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

      await prisma.togetherSongRequest.update({
        where: { id: requestId },
        data: { status: nextStatus, reviewedBy: actorId, reviewedAt: new Date() },
      });

      if (nextStatus === 'APPROVED') {
        await this.insertQueueItemLocked(
          code,
          room,
          { userId: reqRow.requesterId, displayName: reqRow.requesterName },
          reqRow.trackJson
        );
      }

      await roomEventService.emit({
        roomCode: code,
        type: 'SONG_REQUEST_UPDATED',
        actorId,
        payload: { id: requestId, status: nextStatus },
        auditAction: nextStatus === 'APPROVED' ? 'SONG_REQUEST_APPROVED' : 'SONG_REQUEST_REJECTED',
        auditTargetId: reqRow.requesterId,
        auditMetadata: {
          actorName: actor?.displayName ?? 'Host',
          trackTitle: (reqRow.trackJson as any)?.title,
        },
      });

      return { id: requestId, status: nextStatus };
    });
  }

  /**
   * Playback transport transitions: PLAY_AT, PAUSE_AT, SEEK_TO, SKIP / advance.
   */
  static async playTrackOrResume(
    roomCode: string,
    actorId: string,
    trackId?: string,
    positionSec = 0,
    trackObj?: any
  ) {
    const code = roomCode.trim().toUpperCase();
    return roomStore.withRoomLock(code, async () => {
      const [room, actor] = await Promise.all([
        prisma.togetherRoom.findUnique({ where: { code } }),
        prisma.togetherRoomMember.findUnique({
          where: { roomCode_userId: { roomCode: code, userId: actorId } },
        }),
      ]);
      if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
      if (!actor || actor.leftAt !== null) {
        throw new RoomHttpError(403, 'NOT_A_MEMBER', 'Not an active member.');
      }
      RoomPermissionService.requirePermission(room, actor, 'PLAY_PAUSE');

      const queue = (Array.isArray(room.queue) ? room.queue : []) as unknown as TogetherQueueItemDTO[];
      let selectedTrack = trackObj ? sanitizeTrackDTO(trackObj) : (room.currentTrack as any);
      if (trackId) {
        const inQueue = queue.find((q) => q.trackId === trackId || q.id === trackId);
        if (inQueue) selectedTrack = inQueue.track;
      } else if (!selectedTrack && queue.length > 0) {
        selectedTrack = queue[0].track;
      }

      if (!selectedTrack) {
        throw new RoomHttpError(400, 'NO_TRACK', 'No track selected or queued.');
      }

      const posMs = Math.max(0, Math.round((positionSec || 0) * 1000));
      const nowMs = Date.now();
      const changedTrack = selectedTrack.id !== room.currentTrackId;

      await prisma.togetherRoom.update({
        where: { code },
        data: {
          currentTrackId: selectedTrack.id,
          currentTrack: selectedTrack as any,
          playbackState: 'playing',
          playbackPositionMs: BigInt(posMs),
          startedAtServerMs: BigInt(nowMs),
          ...(changedTrack ? { skipVotes: [] } : {}),
        },
      });

      if (changedTrack) {
        const members = await prisma.togetherRoomMember.findMany({
          where: { roomCode: code, leftAt: null },
          select: { userId: true, isGuest: true },
        });
        await RoomAnalyticsService.recordTrackPlay(code, selectedTrack, members, actorId).catch(
          () => undefined
        );
      }

      await roomEventService.emit({
        roomCode: code,
        type: 'PLAY_AT',
        actorId,
        revision: room.queueRevision,
        payload: {
          trackId: selectedTrack.id,
          track: selectedTrack,
          positionSec: posMs / 1000,
          positionMs: posMs,
          playbackRate: room.playbackRate || 1.0,
          startedAtServerMs: nowMs,
        },
        auditAction: changedTrack ? 'PLAY_AT' : undefined,
        auditMetadata: changedTrack
          ? { actorName: actor.displayName, trackTitle: selectedTrack.title }
          : undefined,
        legacyFlat: {
          trackId: selectedTrack.id,
          track: selectedTrack,
          positionSec: posMs / 1000,
          startedAtServerMs: nowMs,
        },
      });

      return { trackId: selectedTrack.id, positionMs: posMs, startedAtServerMs: nowMs };
    });
  }

  static async pausePlayback(roomCode: string, actorId: string, positionSec?: number) {
    const code = roomCode.trim().toUpperCase();
    return roomStore.withRoomLock(code, async () => {
      const [room, actor] = await Promise.all([
        prisma.togetherRoom.findUnique({ where: { code } }),
        prisma.togetherRoomMember.findUnique({
          where: { roomCode_userId: { roomCode: code, userId: actorId } },
        }),
      ]);
      if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
      RoomPermissionService.requirePermission(room, actor, 'PLAY_PAUSE');

      const posMs =
        positionSec !== undefined
          ? Math.max(0, Math.round(positionSec * 1000))
          : RoomSessionService.computeLivePositionMs(room);

      await prisma.togetherRoom.update({
        where: { code },
        data: {
          playbackState: 'paused',
          playbackPositionMs: BigInt(posMs),
          startedAtServerMs: null,
        },
      });

      await roomEventService.emit({
        roomCode: code,
        type: 'PAUSE_AT',
        actorId,
        revision: room.queueRevision,
        payload: { positionSec: posMs / 1000, positionMs: posMs },
        auditAction: 'PAUSE_AT',
        auditMetadata: { actorName: actor?.displayName ?? 'Member' },
        legacyFlat: { positionSec: posMs / 1000 },
      });

      return { positionMs: posMs };
    });
  }

  static async seekPlayback(roomCode: string, actorId: string, positionMs: number) {
    const code = roomCode.trim().toUpperCase();
    return roomStore.withRoomLock(code, async () => {
      const [room, actor] = await Promise.all([
        prisma.togetherRoom.findUnique({ where: { code } }),
        prisma.togetherRoomMember.findUnique({
          where: { roomCode_userId: { roomCode: code, userId: actorId } },
        }),
      ]);
      if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
      RoomPermissionService.requirePermission(room, actor, 'SEEK');

      const clampedMs = Math.max(0, Math.round(positionMs));
      const nowMs = Date.now();

      await prisma.togetherRoom.update({
        where: { code },
        data: {
          playbackPositionMs: BigInt(clampedMs),
          startedAtServerMs: room.playbackState === 'playing' ? BigInt(nowMs) : null,
        },
      });

      await roomEventService.emit({
        roomCode: code,
        type: 'SEEK_TO',
        actorId,
        revision: room.queueRevision,
        payload: {
          positionSec: clampedMs / 1000,
          positionMs: clampedMs,
          startedAtServerMs: nowMs,
        },
        auditAction: 'SEEK_TO',
        auditMetadata: { actorName: actor?.displayName ?? 'Member' },
        legacyFlat: { positionSec: clampedMs / 1000, startedAtServerMs: nowMs },
      });

      return { positionMs: clampedMs };
    });
  }

  static async voteOrForceSkip(roomCode: string, actorId: string, force = false) {
    const code = roomCode.trim().toUpperCase();
    return roomStore.withRoomLock(code, async () => {
      const [room, actor, activeCount] = await Promise.all([
        prisma.togetherRoom.findUnique({ where: { code } }),
        prisma.togetherRoomMember.findUnique({
          where: { roomCode_userId: { roomCode: code, userId: actorId } },
        }),
        prisma.togetherRoomMember.count({ where: { roomCode: code, leftAt: null } }),
      ]);
      if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
      if (!actor || actor.leftAt !== null) {
        throw new RoomHttpError(403, 'NOT_A_MEMBER', 'Not active in room.');
      }

      const role = actorId === room.hostId ? 'HOST' : normalizeRole(actor.role);
      const isMod = role === 'HOST' || role === 'CO_HOST' || role === 'MODERATOR';

      if (force || isMod) {
        return this.advanceQueueTrack(code, room, actorId, actor.displayName);
      }

      if (!room.allowListenersSkip && room.mode === 'dj') {
        throw new RoomHttpError(403, 'FORBIDDEN', 'Skip voting is disabled by the DJ.');
      }

      const votes = new Set<string>(Array.isArray(room.skipVotes) ? (room.skipVotes as string[]) : []);
      votes.add(actorId);
      const threshold = Math.max(1, Math.ceil(activeCount * 0.5));

      if (votes.size >= threshold) {
        return this.advanceQueueTrack(code, room, actorId, actor.displayName);
      }

      const voteList = Array.from(votes);
      await prisma.togetherRoom.update({
        where: { code },
        data: { skipVotes: voteList as any },
      });

      await roomEventService.emit({
        roomCode: code,
        type: 'SKIP_VOTE_UPDATE',
        actorId,
        payload: { skipVotes: voteList, required: threshold },
        legacyFlat: { skipVotes: voteList, required: threshold },
      });

      return { skipped: false, skipVotes: voteList, required: threshold };
    });
  }

  private static async advanceQueueTrack(
    code: string,
    room: any,
    actorId: string,
    actorName: string
  ) {
    const queue = (Array.isArray(room.queue) ? [...room.queue] : []) as TogetherQueueItemDTO[];
    let nextTrack: any = null;
    if (queue.length > 0) {
      const curIdx = queue.findIndex((q) => q.trackId === room.currentTrackId);
      if (curIdx >= 0 && curIdx + 1 < queue.length) {
        nextTrack = queue[curIdx + 1].track;
      } else if (curIdx < 0) {
        nextTrack = queue[0].track;
      } else if (queue.length > 1) {
        queue.shift();
        nextTrack = queue[0]?.track ?? null;
      }
    }

    const nowMs = Date.now();
    const nextRev = room.queueRevision + 1;

    await prisma.togetherRoom.update({
      where: { code },
      data: {
        queue: queue as any,
        queueRevision: nextRev,
        currentTrackId: nextTrack?.id ?? null,
        currentTrack: nextTrack ? (nextTrack as any) : null,
        playbackState: nextTrack ? 'playing' : 'paused',
        playbackPositionMs: BigInt(0),
        startedAtServerMs: nextTrack ? BigInt(nowMs) : null,
        skipVotes: [],
      },
    });

    await RoomAnalyticsService.incrementCounter(code, actorId, 'skipsTriggered', 1).catch(
      () => undefined
    );

    await roomEventService.emit({
      roomCode: code,
      type: 'SKIP_TRIGGERED',
      actorId,
      revision: nextRev,
      payload: { track: nextTrack, queue, queueRevision: nextRev },
      auditAction: 'SKIP',
      auditMetadata: { actorName, trackTitle: nextTrack?.title },
      legacyFlat: { nextTrack, queue },
    });

    if (nextTrack) {
      await roomEventService.emit({
        roomCode: code,
        type: 'PLAY_AT',
        actorId,
        revision: nextRev,
        payload: {
          trackId: nextTrack.id,
          track: nextTrack,
          positionSec: 0,
          positionMs: 0,
          startedAtServerMs: nowMs,
        },
        legacyFlat: {
          trackId: nextTrack.id,
          track: nextTrack,
          positionSec: 0,
          startedAtServerMs: nowMs,
        },
      });
    }

    return { skipped: true, nextTrack, queueRevision: nextRev };
  }
}
