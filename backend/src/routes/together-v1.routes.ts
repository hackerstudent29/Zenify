import crypto from 'crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../utils/prisma';
import { AchievementService } from '../services/together/achievement.service';
import { QueueManagementService } from '../services/together/queue-management.service';
import { RoomAnalyticsService } from '../services/together/room-analytics.service';
import { roomEventService } from '../services/together/room-event.service';
import { RoomMembershipService } from '../services/together/room-membership.service';
import { RoomPhase2Service } from '../services/together/room-phase2.service';
import { ActorIdentity, RoomSessionService } from '../services/together/room-session.service';
import { roomStore } from '../services/together/room-store';
import { RoomHttpError } from '../services/together/room-types';

async function resolveActor(
  server: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  allowNewGuest = false
): Promise<ActorIdentity> {
  await server.optionalAuthenticate(request, reply);
  const authUser = request.user as any;
  const authId = authUser?.id || authUser?.userId || authUser?.sub;

  if (authId) {
    const dbUser = await prisma.user
      .findUnique({
        where: { id: String(authId) },
        select: { id: true, name: true, avatarUrl: true },
      })
      .catch(() => null);
    return {
      userId: String(authId),
      username: dbUser?.name || authUser?.name || authUser?.username || 'Listener',
      avatarUrl: dbUser?.avatarUrl || authUser?.avatarUrl || null,
      isGuest: false,
      ip: request.ip,
    };
  }

  const ticketHeader =
    (request.headers['x-together-ticket'] as string | undefined) ||
    ((request.query as any)?.ticket as string | undefined);
  if (ticketHeader) {
    const verified = RoomSessionService.verifyTicket(ticketHeader);
    if (verified) {
      return {
        userId: verified.userId,
        username: verified.username,
        avatarUrl: verified.avatarUrl ?? null,
        isGuest: verified.isGuest,
        ip: request.ip,
      };
    }
  }

  const body = (request.body as any) || {};
  const guestIdHeader = (request.headers['x-guest-id'] as string | undefined) || body.guestId;
  const guestName = body.guestName || (request.headers['x-guest-name'] as string | undefined);

  if (guestIdHeader && typeof guestIdHeader === 'string' && guestIdHeader.trim()) {
    return {
      userId: guestIdHeader.trim().startsWith('guest_')
        ? guestIdHeader.trim()
        : `guest_${guestIdHeader.trim()}`,
      username: String(guestName || 'Guest').trim().slice(0, 64) || 'Guest',
      avatarUrl: null,
      isGuest: true,
      ip: request.ip,
    };
  }

  if (allowNewGuest) {
    return {
      userId: `guest_${crypto.randomBytes(6).toString('hex')}`,
      username: String(guestName || 'Guest').trim().slice(0, 64) || 'Guest',
      avatarUrl: null,
      isGuest: true,
      ip: request.ip,
    };
  }

  throw new RoomHttpError(401, 'AUTH_REQUIRED', 'Missing authentication token or room ticket.');
}

async function withIdempotency(
  request: FastifyRequest,
  actorId: string,
  scope: string,
  fn: () => Promise<any>
) {
  const key = (request.headers['idempotency-key'] as string | undefined)?.trim();
  if (!key) return fn();
  const cacheKey = `idemp:${scope}:${actorId}:${key}`;
  const cached = await roomStore.getJson<any>(cacheKey);
  if (cached) return cached;
  const res = await fn();
  await roomStore.setJson(cacheKey, res, 86400);
  return res;
}

function sendError(reply: FastifyReply, err: any) {
  if (err instanceof RoomHttpError) {
    return reply.status(err.status).send({
      error: err.code,
      code: err.code,
      message: err.message,
      ...(err.extra || {}),
    });
  }
  const status = err?.statusCode || 500;
  return reply.status(status).send({
    error: 'INTERNAL_ERROR',
    code: 'INTERNAL_ERROR',
    message: err?.message || 'Unexpected Room Together error',
  });
}

export async function togetherV1Routes(server: FastifyInstance) {
  server.setErrorHandler((err, _req, reply) => {
    return sendError(reply, err);
  });

  // ---- ROOM LIFECYCLE & CONFIG ------------------------------------------------

  server.post('/rooms', async (request, reply) => {
    try {
      const actor = await resolveActor(server, request, reply, true);
      const body = (request.body as any) || {};
      const config = body.config || body;
      const visibility = (config.visibility ?? body.visibility) as string | undefined;
      const isPrivate =
        config.isPrivate ??
        body.isPrivate ??
        (visibility ? visibility.toUpperCase() !== 'PUBLIC' : false);
      const rawDur =
        config.durationMinutes !== undefined ? config.durationMinutes : body.durationMinutes;
      const result = await withIdempotency(request, actor.userId, 'create_room', () =>
        RoomSessionService.createRoom(actor, {
          mode: body.mode ?? config.mode,
          name: config.name ?? body.name,
          description: config.description ?? body.description,
          coverUrl: config.coverUrl ?? body.coverUrl,
          isPrivate,
          password: config.password ?? body.password,
          maxMembers: config.maxMembers ?? config.maxParticipants ?? body.maxMembers ?? body.maxParticipants,
          durationMinutes: rawDur,
          inviteMode: config.inviteMode ?? body.inviteMode,
          allowListenersAddQueue:
            config.allowListenersAddQueue ?? body.allowListenersAddQueue,
          allowListenersSkip: config.allowListenersSkip ?? body.allowListenersSkip,
          enabledRoles: config.enabledRoles ?? body.enabledRoles,
          permissions: config.permissions ?? body.permissions,
        })
      );
      return reply.status(201).send(result);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.get('/rooms/:code', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      let actorId: string | undefined;
      try {
        const actor = await resolveActor(server, request, reply, false);
        actorId = actor.userId;
      } catch {
        // Allow anonymous room preview for non-private basic details or fetch snapshot
      }
      const snapshot = await RoomSessionService.getRoomSnapshot(code, actorId);
      return reply.send(snapshot);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.post('/rooms/:code/join', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const actor = await resolveActor(server, request, reply, true);
      const body = (request.body as any) || {};
      const res = await withIdempotency(request, actor.userId, `join:${code.toUpperCase()}`, () =>
        RoomSessionService.joinRoom(actor, {
          code,
          password: body.password,
          inviteToken: body.inviteToken,
        })
      );
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.post('/invites/join', async (request, reply) => {
    try {
      const actor = await resolveActor(server, request, reply, true);
      const body = (request.body as any) || {};
      if (!body.token) {
        throw new RoomHttpError(400, 'MISSING_TOKEN', 'Invite token is required.');
      }
      const res = await RoomPhase2Service.joinByInviteToken(String(body.token), actor);
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.post('/rooms/:code/leave', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const actor = await resolveActor(server, request, reply, false);
      await RoomSessionService.leaveRoom(code, actor.userId);
      return reply.send({ ok: true });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.post('/rooms/:code/close', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const actor = await resolveActor(server, request, reply, false);
      const res = await RoomSessionService.closeRoom(code, actor.userId, 'HOST_ENDED');
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.patch('/rooms/:code/config', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const actor = await resolveActor(server, request, reply, false);
      const config = await RoomSessionService.updateConfig(
        code,
        actor.userId,
        (request.body as any) || {}
      );
      return reply.send({ config });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Legacy alias for /api/together/rooms/:code/settings
  server.patch('/rooms/:code/settings', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const actor = await resolveActor(server, request, reply, false);
      const body = (request.body as any) || {};
      const config = await RoomSessionService.updateConfig(code, actor.userId, {
        ...body,
        inviteMode: body.requiresApproval ? 'APPROVAL' : body.inviteMode,
        allowListenersAddQueue: body.guestCanQueue ?? body.allowListenersAddQueue,
      });
      return reply.send({ config });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Legacy alias for DELETE /api/together/rooms/:code
  server.delete('/rooms/:code', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const actor = await resolveActor(server, request, reply, false);
      const res = await RoomSessionService.closeRoom(code, actor.userId, 'HOST_ENDED');
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.post('/rooms/:code/cover', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const actor = await resolveActor(server, request, reply, false);
      const file = await (request as any).file();
      if (!file) {
        throw new RoomHttpError(400, 'MISSING_FILE', 'Image file is required.');
      }
      const buffer = await file.toBuffer();
      const coverUrl = await RoomSessionService.uploadCover(code, actor.userId, buffer);
      return reply.send({ coverUrl });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // ---- AUDIT & ACTIVITY FEED --------------------------------------------------

  server.get('/rooms/:code/audit', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const { limit } = (request.query as any) || {};
      const items = await roomEventService.getActivityFeed(code, Number(limit) || 60);
      return reply.send({ items, events: items });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.get('/rooms/:code/activity', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const { limit } = (request.query as any) || {};
      const items = await roomEventService.getActivityFeed(code, Number(limit) || 60);
      return reply.send({ items, events: items });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // ---- MEMBERSHIP, ROLES, MODERATION, JOIN REQUESTS ---------------------------

  server.patch('/rooms/:code/members/:userId/role', async (request, reply) => {
    try {
      const { code, userId } = request.params as { code: string; userId: string };
      const actor = await resolveActor(server, request, reply, false);
      const { role } = (request.body as any) || {};
      const res = await RoomMembershipService.setMemberRole(code, actor.userId, userId, role);
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  const handleTransfer = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { code } = request.params as { code: string };
      const actor = await resolveActor(server, request, reply, false);
      const body = (request.body as any) || {};
      const toUserId = body.toUserId || body.userId;
      if (!toUserId) throw new RoomHttpError(400, 'MISSING_USER', 'Target userId is required.');
      const res = await RoomMembershipService.transferHost(code, actor.userId, toUserId);
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  };
  server.post('/rooms/:code/transfer', handleTransfer);
  server.post('/rooms/:code/transfer-host', handleTransfer);

  server.delete('/rooms/:code/members/:userId', async (request, reply) => {
    try {
      const { code, userId } = request.params as { code: string; userId: string };
      const actor = await resolveActor(server, request, reply, false);
      const res = await RoomMembershipService.kickOrBlockMember(
        code,
        actor.userId,
        userId,
        false
      );
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.post('/rooms/:code/members/:userId/kick', async (request, reply) => {
    try {
      const { code, userId } = request.params as { code: string; userId: string };
      const actor = await resolveActor(server, request, reply, false);
      const res = await RoomMembershipService.kickOrBlockMember(
        code,
        actor.userId,
        userId,
        false
      );
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.post('/rooms/:code/members/:userId/block', async (request, reply) => {
    try {
      const { code, userId } = request.params as { code: string; userId: string };
      const actor = await resolveActor(server, request, reply, false);
      const body = (request.body as any) || {};
      const res = await RoomMembershipService.kickOrBlockMember(
        code,
        actor.userId,
        userId,
        true,
        body.reason
      );
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.post('/rooms/:code/blocks', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const actor = await resolveActor(server, request, reply, false);
      const body = (request.body as any) || {};
      if (!body.userId) throw new RoomHttpError(400, 'MISSING_USER', 'userId is required.');
      const res = await RoomMembershipService.kickOrBlockMember(
        code,
        actor.userId,
        body.userId,
        true,
        body.reason
      );
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.get('/rooms/:code/blocks', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const actor = await resolveActor(server, request, reply, false);
      const blocks = await RoomMembershipService.listBlocked(code, actor.userId);
      return reply.send({ blocks });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.delete('/rooms/:code/blocks/:userId', async (request, reply) => {
    try {
      const { code, userId } = request.params as { code: string; userId: string };
      const actor = await resolveActor(server, request, reply, false);
      const res = await RoomMembershipService.unblockMember(code, actor.userId, userId);
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.get('/rooms/:code/join-requests', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const actor = await resolveActor(server, request, reply, false);
      const requests = await RoomMembershipService.listJoinRequests(code, actor.userId);
      return reply.send({ requests });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.post('/rooms/:code/join-requests/:requestId/approve', async (request, reply) => {
    try {
      const { code, requestId } = request.params as { code: string; requestId: string };
      const actor = await resolveActor(server, request, reply, false);
      const res = await RoomMembershipService.resolveJoinRequest(
        code,
        actor.userId,
        requestId,
        'APPROVE'
      );
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  const handleRejectJoin = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { code, requestId } = request.params as { code: string; requestId: string };
      const actor = await resolveActor(server, request, reply, false);
      const res = await RoomMembershipService.resolveJoinRequest(
        code,
        actor.userId,
        requestId,
        'REJECT'
      );
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  };
  server.post('/rooms/:code/join-requests/:requestId/reject', handleRejectJoin);
  server.post('/rooms/:code/join-requests/:requestId/deny', handleRejectJoin);

  // ---- QUEUE, PLAYBACK & SONG REQUESTS ----------------------------------------

  server.post('/rooms/:code/queue', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const actor = await resolveActor(server, request, reply, false);
      const body = (request.body as any) || {};
      const track = body.track || body;
      const res = await withIdempotency(request, actor.userId, `qadd:${code.toUpperCase()}`, () =>
        QueueManagementService.addTrack(code, actor.userId, track)
      );
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.post('/rooms/:code/queue/reorder', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const actor = await resolveActor(server, request, reply, false);
      const body = (request.body as any) || {};
      let fromIndex = body.fromIndex as number | undefined;
      if (fromIndex === undefined && body.itemId) {
        const snap = await RoomSessionService.getRoomSnapshot(code);
        fromIndex = snap.queue.findIndex((q: any) => q.id === body.itemId);
      }
      const res = await QueueManagementService.reorderQueue(
        code,
        actor.userId,
        Number(fromIndex),
        Number(body.toIndex),
        body.baseRevision !== undefined ? Number(body.baseRevision) : undefined
      );
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.delete('/rooms/:code/queue/:itemId', async (request, reply) => {
    try {
      const { code, itemId } = request.params as { code: string; itemId: string };
      const actor = await resolveActor(server, request, reply, false);
      const { baseRevision } = (request.query as any) || {};
      const res = await QueueManagementService.removeQueueItem(
        code,
        actor.userId,
        itemId,
        baseRevision !== undefined ? Number(baseRevision) : undefined
      );
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.post('/rooms/:code/playback/seek', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const actor = await resolveActor(server, request, reply, false);
      const body = (request.body as any) || {};
      const posMs = Number(body.positionMs ?? (Number(body.positionSec || 0) * 1000));
      const res = await QueueManagementService.seekPlayback(code, actor.userId, posMs);
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.get('/rooms/:code/requests', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const requests = await QueueManagementService.listRequests(code);
      return reply.send({ requests });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.post('/rooms/:code/requests/:id/approve', async (request, reply) => {
    try {
      const { code, id } = request.params as { code: string; id: string };
      const actor = await resolveActor(server, request, reply, false);
      const res = await QueueManagementService.reviewRequest(code, actor.userId, id, 'APPROVE');
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.post('/rooms/:code/requests/:id/reject', async (request, reply) => {
    try {
      const { code, id } = request.params as { code: string; id: string };
      const actor = await resolveActor(server, request, reply, false);
      const res = await QueueManagementService.reviewRequest(code, actor.userId, id, 'REJECT');
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  const handleCancelReq = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { code, id } = request.params as { code: string; id: string };
      const actor = await resolveActor(server, request, reply, false);
      const res = await QueueManagementService.reviewRequest(code, actor.userId, id, 'CANCEL');
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  };
  server.post('/rooms/:code/requests/:id/cancel', handleCancelReq);
  server.delete('/rooms/:code/requests/:id', handleCancelReq);

  // ---- PHASE 2: LYRICS (Existing LyricsOrchestrator), BOOKMARKS, REACTIONS, INVITES, CHAT, THEME, DJ, RECS ----

  server.get('/lyrics', async (request, reply) => {
    try {
      const q = (request.query as any) || {};
      const res = await RoomPhase2Service.getLyrics({
        trackId: q.trackId,
        title: q.title || '',
        artist: q.artist || '',
        album: q.album,
        durationSec: q.durationSec ? Number(q.durationSec) : undefined,
      });
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.post('/rooms/:code/bookmarks', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const actor = await resolveActor(server, request, reply, false);
      const bookmark = await RoomPhase2Service.createBookmark(
        code,
        actor.userId,
        (request.body as any) || {}
      );
      return reply.status(201).send({ bookmark });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.get('/rooms/:code/bookmarks', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const bookmarks = await RoomPhase2Service.listBookmarks(code);
      return reply.send({ bookmarks });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.delete('/rooms/:code/bookmarks/:id', async (request, reply) => {
    try {
      const { code, id } = request.params as { code: string; id: string };
      const actor = await resolveActor(server, request, reply, false);
      const res = await RoomPhase2Service.deleteBookmark(code, actor.userId, id);
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.post('/rooms/:code/reactions', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const actor = await resolveActor(server, request, reply, false);
      const body = (request.body as any) || {};
      const res = await RoomPhase2Service.sendReaction(
        code,
        actor.userId,
        body.emoji,
        body.positionMs !== undefined ? Number(body.positionMs) : undefined,
        body.trackId
      );
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.get('/rooms/:code/reactions/timeline', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const { trackId } = (request.query as any) || {};
      const res = await RoomPhase2Service.getReactionTimeline(code, trackId);
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.post('/rooms/:code/invites', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const actor = await resolveActor(server, request, reply, false);
      const invite = await RoomPhase2Service.createInvite(
        code,
        actor.userId,
        (request.body as any) || {}
      );
      return reply.status(201).send({ invite, ...invite });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.get('/rooms/:code/invites', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const actor = await resolveActor(server, request, reply, false);
      const invites = await RoomPhase2Service.listInvites(code, actor.userId);
      return reply.send({ invites });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.delete('/rooms/:code/invites/:id', async (request, reply) => {
    try {
      const { code, id } = request.params as { code: string; id: string };
      const actor = await resolveActor(server, request, reply, false);
      const res = await RoomPhase2Service.revokeInvite(code, actor.userId, id);
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.post('/rooms/:code/chat', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const actor = await resolveActor(server, request, reply, false);
      const body = (request.body as any) || {};
      const message = await RoomPhase2Service.sendChat(
        code,
        actor.userId,
        body.text,
        body.replyToId,
        body.replyToText
      );
      return reply.status(201).send({ message });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.patch('/rooms/:code/chat/:id', async (request, reply) => {
    try {
      const { code, id } = request.params as { code: string; id: string };
      const actor = await resolveActor(server, request, reply, false);
      const body = (request.body as any) || {};
      const res = await RoomPhase2Service.editChat(code, actor.userId, id, body.text);
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.delete('/rooms/:code/chat/:id', async (request, reply) => {
    try {
      const { code, id } = request.params as { code: string; id: string };
      const actor = await resolveActor(server, request, reply, false);
      const res = await RoomPhase2Service.deleteChat(code, actor.userId, id);
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.patch('/rooms/:code/theme', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const actor = await resolveActor(server, request, reply, false);
      const theme = await RoomPhase2Service.updateTheme(
        code,
        actor.userId,
        (request.body as any) || {}
      );
      return reply.send({ theme });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  const handleDjSettings = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { code } = request.params as { code: string };
      const actor = await resolveActor(server, request, reply, false);
      const djSettings = await RoomPhase2Service.updateDjSettings(
        code,
        actor.userId,
        (request.body as any) || {}
      );
      return reply.send({ djSettings });
    } catch (err) {
      return sendError(reply, err);
    }
  };
  server.patch('/rooms/:code/dj-settings', handleDjSettings);
  server.patch('/rooms/:code/dj', handleDjSettings);

  const handleAnnounce = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { code } = request.params as { code: string };
      const actor = await resolveActor(server, request, reply, false);
      const body = (request.body as any) || {};
      const res = await RoomPhase2Service.postAnnouncement(
        code,
        actor.userId,
        body.text ?? '',
        body.durationMinutes
      );
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  };
  server.post('/rooms/:code/announcements', handleAnnounce);
  server.post('/rooms/:code/announce', handleAnnounce);

  server.patch('/rooms/:code/me/preferences', async (request, reply) => {
    try {
      const actor = await resolveActor(server, request, reply, false);
      const body = (request.body as any) || {};
      const privacy = await RoomAnalyticsService.updatePrivacy(actor.userId, {
        shareListeningStats:
          body.shareListeningActivity ?? body.shareListeningStats,
      });
      return reply.send({ privacy });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.get('/rooms/:code/recommendations', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const actor = await resolveActor(server, request, reply, true);
      const q = (request.query as any) || {};
      const res = await RoomPhase2Service.getRecommendations(code, actor.userId, {
        trackId: q.trackId,
        title: q.title,
        artist: q.artist,
      });
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.post('/rooms/:code/recommendations/:recId/add', async (request, reply) => {
    try {
      const { code, recId } = request.params as { code: string; recId: string };
      const actor = await resolveActor(server, request, reply, false);
      const res = await RoomPhase2Service.addRecommendationToRoom(code, actor.userId, recId);
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.post('/rooms/:code/recommendations/:recId/feedback', async (request, reply) => {
    try {
      const { code, recId } = request.params as { code: string; recId: string };
      const actor = await resolveActor(server, request, reply, false);
      const body = (request.body as any) || {};
      const rawKind = String(body.kind || body.action || 'like').toLowerCase();
      const action =
        rawKind === 'dislike' ? 'dislike' : rawKind === 'skip' ? 'skip' : 'like';
      const res = await RoomPhase2Service.submitRecFeedback(
        code,
        actor.userId,
        recId,
        action
      );
      return reply.send(res);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // ---- STATS, RECAPS, ACHIEVEMENTS, INSIGHTS ----------------------------------

  server.get('/rooms/:code/stats', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const stats = await RoomAnalyticsService.getRoomStats(code);
      return reply.send(stats);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.get('/recaps/:code', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const recap = await RoomAnalyticsService.getRecap(code);
      return reply.send({ recap, ...(recap as any) });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.post('/recaps/:code', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const recap = await RoomAnalyticsService.generateAndStoreRecap(code);
      return reply.send({ recap, ...(recap as any) });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.get('/achievements', async (request, reply) => {
    try {
      const actor = await resolveActor(server, request, reply, true);
      const achievements = await AchievementService.listForUser(actor.userId);
      return reply.send({ achievements });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.get('/insights', async (request, reply) => {
    try {
      const actor = await resolveActor(server, request, reply, false);
      const { range } = (request.query as any) || {};
      const tz = request.headers['x-timezone'] as string | undefined;
      const data = await RoomAnalyticsService.getInsights(actor.userId, range || 'month', tz);
      return reply.send(data);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.get('/insights/sessions/:sessionId', async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      const stats = await RoomAnalyticsService.getRoomStats(sessionId);
      return reply.send(stats);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.get('/insights/privacy', async (request, reply) => {
    try {
      const actor = await resolveActor(server, request, reply, false);
      const privacy = await RoomAnalyticsService.getPrivacy(actor.userId);
      return reply.send({ privacy, ...privacy });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.patch('/insights/privacy', async (request, reply) => {
    try {
      const actor = await resolveActor(server, request, reply, false);
      const body = (request.body as any) || {};
      const privacy = await RoomAnalyticsService.updatePrivacy(actor.userId, {
        shareListeningStats: body.saveHistory ?? body.shareListeningStats,
        showInRoomHistory: body.showInRoomHistory ?? body.saveHistory,
      });
      return reply.send({ privacy, ...privacy });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  const handleDeleteInsights = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const actor = await resolveActor(server, request, reply, false);
      await RoomAnalyticsService.deleteUserHistory(actor.userId);
      return reply.send({ ok: true });
    } catch (err) {
      return sendError(reply, err);
    }
  };
  server.delete('/insights', handleDeleteInsights);
  server.delete('/insights/history', handleDeleteInsights);
}

/**
 * Public routes for Android App Links verification & web invite landing fallback.
 */
export async function togetherPublicRoutes(server: FastifyInstance) {
  server.get('/.well-known/assetlinks.json', async (_req, reply) => {
    const fingerprintsRaw = process.env.ANDROID_SHA256_FINGERPRINTS || '';
    const fingerprints = fingerprintsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return reply.type('application/json').send([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: process.env.ANDROID_PACKAGE_NAME || 'com.example.zenify_mobile',
          sha256_cert_fingerprints:
            fingerprints.length > 0
              ? fingerprints
              : ['00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00'],
        },
      },
    ]);
  });

  server.get('/room/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const { invite } = (request.query as any) || {};
    const cleanCode = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const room = await prisma.togetherRoom
      .findUnique({ where: { code: cleanCode }, select: { name: true, description: true, coverUrl: true } })
      .catch(() => null);
    const deepLink = `zenify://room/${cleanCode}${invite ? `?invite=${encodeURIComponent(invite)}` : ''}`;
    const title = (room?.name || `Join Room ${cleanCode}`).replace(/</g, '&lt;');

    return reply.type('text/html').send(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Zenify Room Together</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#121214;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
.box{max-width:400px;text-align:center}.btn{display:inline-block;margin-top:20px;padding:14px 28px;border-radius:999px;background:#fa2d48;color:#fff;text-decoration:none;font-weight:700}</style>
</head><body><div class="box"><h1>${title}</h1><p>Open in Zenify to listen together in real time.</p>
<a class="btn" href="${deepLink}">Open in Zenify</a></div></body></html>`);
  });
}
