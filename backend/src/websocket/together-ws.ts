import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { prisma } from '../utils/prisma';
import { QueueManagementService } from '../services/together/queue-management.service';
import { roomEventService } from '../services/together/room-event.service';
import { RoomMembershipService } from '../services/together/room-membership.service';
import { RoomPhase2Service } from '../services/together/room-phase2.service';
import { RoomSessionService } from '../services/together/room-session.service';
import { roomStore } from '../services/together/room-store';
import { RoomWsEnvelope } from '../services/together/room-types';

interface ConnectedClient {
  socket: WebSocket;
  userId: string;
  username: string;
  roomCode: string;
  role: string;
  lastHeartbeatAt: number;
}

const roomSockets = new Map<string, Set<ConnectedClient>>();

function safeSend(ws: WebSocket, data: any): void {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  } catch {
    // Socket may be mid-close
  }
}

function broadcastEnvelope(
  roomCode: string,
  envelope: RoomWsEnvelope,
  legacyFlat?: Record<string, any>
): void {
  const code = roomCode.toUpperCase();
  const clients = roomSockets.get(code);
  if (!clients || clients.size === 0) return;

  const wireObj = legacyFlat ? { ...envelope, ...legacyFlat } : envelope;
  const serialized = JSON.stringify(wireObj);
  for (const c of clients) {
    try {
      if (c.socket.readyState === WebSocket.OPEN) {
        c.socket.send(serialized);
      }
    } catch {
      // ignore closed socket
    }
  }
}

export async function registerTogetherWebSocket(server: FastifyInstance): Promise<void> {
  roomEventService.registerBroadcaster(broadcastEnvelope);

  // Server heartbeat loop every 15s (close dead sockets at > 45s)
  const hbTimer = setInterval(() => {
    const now = Date.now();
    for (const [code, clients] of roomSockets.entries()) {
      for (const c of clients) {
        if (now - c.lastHeartbeatAt > 60_000) {
          try {
            c.socket.terminate();
          } catch {}
          clients.delete(c);
          continue;
        }
        safeSend(c.socket, {
          type: 'HEARTBEAT',
          roomId: code,
          schemaVersion: 1,
          serverTime: now,
          serverTimestampMs: now,
        });
      }
      if (clients.size === 0) roomSockets.delete(code);
    }
  }, 15_000);
  hbTimer.unref?.();

  server.get(
    '/ws/together',
    { websocket: true },
    async (connection: any, request: any) => {
      const socket: WebSocket = connection.socket ?? connection;
      const query = (request.query as Record<string, string>) || {};

      let roomCode = '';
      let userId = '';
      let username = 'Listener';
      let role = 'LISTENER';

      // 1. Ticket auth (primary) OR Bearer JWT + roomCode
      const ticket = query.ticket;
      if (ticket) {
        const verified = RoomSessionService.verifyTicket(ticket);
        if (!verified) {
          safeSend(socket, { type: 'ERROR', code: 'INVALID_TICKET', message: 'Invalid or expired session ticket' });
          socket.close();
          return;
        }
        roomCode = verified.roomCode.toUpperCase();
        userId = verified.userId;
        username = verified.username;
        role = verified.role;
      } else if (query.token && query.roomCode) {
        try {
          const decoded = (await server.jwt.verify(query.token)) as any;
          userId = String(decoded?.id || decoded?.userId || decoded?.sub || '');
          roomCode = String(query.roomCode).trim().toUpperCase();
          username = decoded?.name || 'Listener';
        } catch {
          safeSend(socket, { type: 'ERROR', code: 'INVALID_TOKEN', message: 'Invalid auth token' });
          socket.close();
          return;
        }
      } else {
        safeSend(socket, { type: 'ERROR', code: 'MISSING_TICKET', message: 'Missing session ticket' });
        socket.close();
        return;
      }

      const room = await prisma.togetherRoom.findUnique({ where: { code: roomCode } }).catch(() => null);
      if (!room || room.state === 'CLOSED' || room.state === 'EXPIRED') {
        safeSend(socket, { type: 'ROOM_CLOSED', reason: room?.endedReason || 'EXPIRED', recapReady: true });
        socket.close();
        return;
      }

      // Ensure membership row is active on reconnect
      const member = await prisma.togetherRoomMember.findUnique({
        where: { roomCode_userId: { roomCode, userId } },
      });
      if (!member) {
        safeSend(socket, { type: 'ERROR', code: 'NOT_A_MEMBER', message: 'Not a member of this room' });
        socket.close();
        return;
      }
      if (member.leftAt !== null) {
        await prisma.togetherRoomMember.update({
          where: { roomCode_userId: { roomCode, userId } },
          data: { leftAt: null, lastSeenAt: new Date() },
        });
      } else {
        await prisma.togetherRoomMember.update({
          where: { roomCode_userId: { roomCode, userId } },
          data: { lastSeenAt: new Date() },
        });
      }

      roomStore.updatePresence(roomCode, userId, {
        lastSeenMs: Date.now(),
        isPlaying: room.playbackState === 'playing',
        bufferReady: true,
      });

      const client: ConnectedClient = {
        socket,
        userId,
        username: member.displayName || username,
        roomCode,
        role: userId === room.hostId ? 'HOST' : member.role,
        lastHeartbeatAt: Date.now(),
      };

      if (!roomSockets.has(roomCode)) roomSockets.set(roomCode, new Set());
      roomSockets.get(roomCode)!.add(client);

      // Initial snapshot or delta replay if client provided lastSeq
      const lastSeqParam = query.lastSeq ? parseInt(query.lastSeq, 10) : NaN;
      if (!Number.isNaN(lastSeqParam) && lastSeqParam > 0) {
        const replay = await roomEventService.getReplaySince(roomCode, lastSeqParam);
        if (!replay.requiresResync) {
          for (const ev of replay.events) {
            safeSend(socket, ev);
          }
        } else {
          const snapshot = await RoomSessionService.getRoomSnapshot(roomCode, userId);
          safeSend(socket, {
            eventId: crypto.randomUUID(),
            schemaVersion: 1,
            roomId: roomCode,
            type: 'INIT_STATE',
            seq: snapshot.seq,
            revision: snapshot.queueRevision,
            serverTimestampMs: Date.now(),
            actorId: userId,
            payload: snapshot,
            state: snapshot,
          });
        }
      } else {
        const snapshot = await RoomSessionService.getRoomSnapshot(roomCode, userId);
        safeSend(socket, {
          eventId: crypto.randomUUID(),
          schemaVersion: 1,
          roomId: roomCode,
          type: 'INIT_STATE',
          seq: snapshot.seq,
          revision: snapshot.queueRevision,
          serverTimestampMs: Date.now(),
          actorId: userId,
          payload: snapshot,
          state: snapshot,
        });
      }

      socket.on('message', async (rawBuf: Buffer) => {
        let msg: any;
        try {
          msg = JSON.parse(rawBuf.toString());
        } catch {
          return;
        }
        const type = String(msg?.type || '').toUpperCase();
        const commandId = msg?.commandId as string | undefined;
        client.lastHeartbeatAt = Date.now();
        roomStore.updatePresence(roomCode, userId, { lastSeenMs: Date.now() });

        try {
          switch (type) {
            case 'HEARTBEAT_ACK': {
              await prisma.togetherRoomMember
                .update({
                  where: { roomCode_userId: { roomCode, userId } },
                  data: { lastSeenAt: new Date() },
                })
                .catch(() => undefined);
              if (typeof msg.offsetMs === 'number') {
                roomStore.updatePresence(roomCode, userId, {
                  offsetMs: Math.round(msg.offsetMs),
                  isPlaying: msg.isPlaying ?? true,
                });
              }
              break;
            }

            case 'SYNC_PING': {
              safeSend(socket, {
                type: 'SYNC_PONG',
                roomId: roomCode,
                schemaVersion: 1,
                clientSentAtMs: msg.clientSentAtMs ?? Date.now(),
                serverReceivedAtMs: Date.now(),
                serverTimestampMs: Date.now(),
              });
              break;
            }

            case 'RESUME': {
              const lastSeq = Number(msg.lastSeq ?? 0);
              const replay = await roomEventService.getReplaySince(roomCode, lastSeq);
              if (!replay.requiresResync) {
                for (const ev of replay.events) safeSend(socket, ev);
              } else {
                const snapshot = await RoomSessionService.getRoomSnapshot(roomCode, userId);
                safeSend(socket, {
                  eventId: crypto.randomUUID(),
                  schemaVersion: 1,
                  roomId: roomCode,
                  type: 'INIT_STATE',
                  seq: snapshot.seq,
                  revision: snapshot.queueRevision,
                  serverTimestampMs: Date.now(),
                  actorId: userId,
                  payload: snapshot,
                  state: snapshot,
                });
              }
              break;
            }

            case 'REQUEST_RESYNC': {
              const snapshot = await RoomSessionService.getRoomSnapshot(roomCode, userId);
              safeSend(socket, {
                eventId: crypto.randomUUID(),
                schemaVersion: 1,
                roomId: roomCode,
                type: 'INIT_STATE',
                seq: snapshot.seq,
                revision: snapshot.queueRevision,
                serverTimestampMs: Date.now(),
                actorId: userId,
                payload: snapshot,
                state: snapshot,
              });
              break;
            }

            case 'HOST_PLAY': {
              await QueueManagementService.playTrackOrResume(
                roomCode,
                userId,
                msg.trackId,
                Number(msg.positionSec ?? (msg.positionMs ? msg.positionMs / 1000 : 0)),
                msg.track
              );
              break;
            }

            case 'HOST_PAUSE': {
              await QueueManagementService.pausePlayback(
                roomCode,
                userId,
                msg.positionSec !== undefined ? Number(msg.positionSec) : undefined
              );
              break;
            }

            case 'HOST_SEEK':
            case 'SEEK_TO': {
              const ms =
                msg.positionMs !== undefined
                  ? Number(msg.positionMs)
                  : Number(msg.positionSec || 0) * 1000;
              await QueueManagementService.seekPlayback(roomCode, userId, ms);
              break;
            }

            case 'QUEUE_ADD': {
              if (!roomStore.checkRateLimit(`ws_queue:${roomCode}:${userId}`, 5, 1000)) {
                safeSend(socket, { type: 'ERROR', code: 'RATE_LIMITED', message: 'Slow down adding tracks' });
                return;
              }
              const res = await QueueManagementService.addTrack(
                roomCode,
                userId,
                msg.track || msg
              );
              if (res.kind === 'REQUESTED') {
                safeSend(socket, { type: 'REQUEST_SUBMITTED', request: res.request });
              }
              break;
            }

            case 'QUEUE_REMOVE': {
              await QueueManagementService.removeQueueItem(
                roomCode,
                userId,
                String(msg.itemId),
                msg.baseRevision !== undefined ? Number(msg.baseRevision) : undefined
              );
              break;
            }

            case 'QUEUE_REORDER': {
              await QueueManagementService.reorderQueue(
                roomCode,
                userId,
                Number(msg.fromIndex),
                Number(msg.toIndex),
                msg.baseRevision !== undefined ? Number(msg.baseRevision) : undefined
              );
              break;
            }

            case 'SKIP_VOTE': {
              await QueueManagementService.voteOrForceSkip(
                roomCode,
                userId,
                Boolean(msg.force)
              );
              break;
            }

            case 'CHAT_MESSAGE': {
              if (!roomStore.checkRateLimit(`ws_chat:${roomCode}:${userId}`, 5, 1000)) {
                safeSend(socket, { type: 'ERROR', code: 'RATE_LIMITED', message: 'Chat rate limit exceeded' });
                return;
              }
              await RoomPhase2Service.sendChat(
                roomCode,
                userId,
                String(msg.text || ''),
                msg.replyToId,
                msg.replyToText
              );
              break;
            }

            case 'REACTION':
            case 'HOST_REACTION': {
              if (!roomStore.checkRateLimit(`ws_react:${roomCode}:${userId}`, 10, 1000)) {
                return;
              }
              await RoomPhase2Service.sendReaction(
                roomCode,
                userId,
                String(msg.emoji || '🔥'),
                msg.positionMs !== undefined ? Number(msg.positionMs) : undefined,
                msg.trackId
              );
              break;
            }

            case 'BUFFER_READY': {
              roomStore.updatePresence(roomCode, userId, {
                bufferReady: msg.ready !== undefined ? Boolean(msg.ready) : true,
              });
              broadcastEnvelope(roomCode, roomEventService.buildEphemeral(
                roomCode,
                'MEMBER_BUFFER_READY',
                0,
                0,
                { userId, ready: msg.ready !== undefined ? Boolean(msg.ready) : true },
                userId
              ), { userId, ready: msg.ready !== undefined ? Boolean(msg.ready) : true });
              break;
            }

            case 'LEAVE_ROOM': {
              await RoomSessionService.leaveRoom(roomCode, userId);
              socket.close();
              break;
            }

            default:
              break;
          }

          if (commandId) {
            safeSend(socket, { type: 'ACK', commandId, ok: true });
          }
        } catch (err: any) {
          safeSend(socket, {
            type: 'ERROR',
            commandId,
            code: err?.code || 'WS_COMMAND_ERROR',
            message: err?.message || 'Action failed',
            ...(err?.extra || {}),
          });
        }
      });

      socket.on('close', () => {
        const set = roomSockets.get(roomCode);
        if (set) {
          set.delete(client);
          if (set.size === 0) roomSockets.delete(roomCode);
        }
      });
    }
  );
}
