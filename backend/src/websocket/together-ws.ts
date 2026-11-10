import { FastifyInstance, FastifyRequest } from 'fastify';
import { WebSocket } from 'ws';
import { TogetherRoomService, TogetherTicket, TogetherRoomState } from '../services/together-room.service';

interface SocketClient {
  ws: WebSocket;
  userId: string;
  username: string;
  avatar?: string;
  role: 'host' | 'listener';
  roomCode: string;
  isAlive: boolean;
}

// Active connected sockets grouped by roomCode
const roomSockets = new Map<string, Set<SocketClient>>();

function broadcastToRoom(roomCode: string, payload: any, excludeUserId?: string) {
  const sockets = roomSockets.get(roomCode);
  if (!sockets) return;

  const data = JSON.stringify(payload);
  for (const client of sockets) {
    if (excludeUserId && client.userId === excludeUserId) continue;
    if (client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(data);
      } catch (err) {
        console.warn(`[TogetherWS] Broadcast error to ${client.userId}:`, err);
      }
    }
  }
}

export async function registerTogetherWebSocket(server: FastifyInstance) {
  // 25-second server-initiated heartbeat ping to satisfy Heroku 55-second router timeout
  const heartbeatInterval = setInterval(() => {
    const now = Date.now();
    for (const [code, clients] of roomSockets.entries()) {
      for (const client of clients) {
        if (!client.isAlive) {
          try {
            client.ws.terminate();
          } catch (e) {}
          clients.delete(client);
          continue;
        }
        client.isAlive = false;
        if (client.ws.readyState === WebSocket.OPEN) {
          try {
            client.ws.send(JSON.stringify({ type: 'HEARTBEAT', serverTime: now }));
          } catch (e) {}
        }
      }
      if (clients.size === 0) {
        roomSockets.delete(code);
      }
    }
  }, 25_000);

  server.addHook('onClose', (_instance, done) => {
    clearInterval(heartbeatInterval);
    done();
  });

  server.get(
    '/ws/together',
    { websocket: true },
    async (connection: any, req: FastifyRequest<{ Querystring: { ticket?: string } }>) => {
      // Compatibility with @fastify/websocket v11 (connection.socket or connection)
      const socket: WebSocket = connection.socket || connection;
      const ticketId = req.query.ticket;

      if (!ticketId) {
        socket.send(JSON.stringify({ type: 'ERROR', message: 'Missing session ticket' }));
        socket.close(4001, 'Missing ticket');
        return;
      }

      const ticket: TogetherTicket | null = await TogetherRoomService.verifyAndConsumeTicket(ticketId);
      if (!ticket) {
        socket.send(JSON.stringify({ type: 'ERROR', message: 'Invalid or expired session ticket' }));
        socket.close(4002, 'Invalid ticket');
        return;
      }

      const { roomCode, userId, username, avatar, role } = ticket;
      const room = await TogetherRoomService.getRoom(roomCode);
      if (!room) {
        socket.send(JSON.stringify({ type: 'ERROR', message: 'Room has expired' }));
        socket.close(4003, 'Room expired');
        return;
      }

      // Add to room socket pool
      if (!roomSockets.has(roomCode)) {
        roomSockets.set(roomCode, new Set());
      }
      const client: SocketClient = {
        ws: socket,
        userId,
        username,
        avatar,
        role,
        roomCode,
        isAlive: true,
      };
      roomSockets.get(roomCode)!.add(client);

      // Send initial synchronized room state to the joining client
      socket.send(
        JSON.stringify({
          type: 'INIT_STATE',
          room,
          self: { userId, username, avatar, role },
          serverTime: Date.now(),
        })
      );

      // Notify others in the room
      broadcastToRoom(
        roomCode,
        {
          type: 'MEMBER_JOINED',
          member: {
            userId,
            username,
            avatar,
            role,
            joinedAt: Date.now(),
            lastPing: Date.now(),
          },
          members: room.members,
        },
        userId
      );

      // Handle incoming messages
      socket.on('message', async (raw: any) => {
        try {
          const payload = JSON.parse(raw.toString());
          client.isAlive = true;

          switch (payload.type) {
            case 'HEARTBEAT_ACK': {
              client.isAlive = true;
              break;
            }

            // NTP Clock Synchronization
            case 'SYNC_PING': {
              const now = Date.now();
              socket.send(
                JSON.stringify({
                  type: 'SYNC_PONG',
                  t0: payload.t0,
                  t1: now,
                  t2: now,
                })
              );
              break;
            }

            // Playback: Host Play with 1500ms Scheduled Barrier for sub-second sync
            case 'HOST_PLAY': {
              const currentRoom = await TogetherRoomService.getRoom(roomCode);
              if (!currentRoom) return;
              if (currentRoom.hostId !== userId && currentRoom.mode !== 'collab') {
                socket.send(JSON.stringify({ type: 'ERROR', message: 'Only DJ or host can control playback' }));
                return;
              }

              const startAtServerMs = Date.now() + 1500; // 1.5s barrier for device buffering & lockstep start
              const track = payload.track || currentRoom.player.track;
              const positionSec = Number(payload.positionSec) || 0;

              currentRoom.player = {
                trackId: track?.id || null,
                track,
                state: 'playing',
                positionSec,
                startedAtServerMs: startAtServerMs,
              };
              currentRoom.skipVotes = [];
              await TogetherRoomService.saveRoom(currentRoom);

              broadcastToRoom(roomCode, {
                type: 'PLAY_AT',
                trackId: track?.id,
                track,
                positionSec,
                startAtServerMs,
                initiatedBy: username,
                skipVotes: [],
                seq: currentRoom.seq,
              });
              break;
            }

            // Playback: Host Pause
            case 'HOST_PAUSE': {
              const currentRoom = await TogetherRoomService.getRoom(roomCode);
              if (!currentRoom) return;
              if (currentRoom.hostId !== userId && currentRoom.mode !== 'collab') return;

              const positionSec = Number(payload.positionSec) || currentRoom.player.positionSec;
              currentRoom.player.state = 'paused';
              currentRoom.player.positionSec = positionSec;
              currentRoom.player.startedAtServerMs = 0;
              await TogetherRoomService.saveRoom(currentRoom);

              broadcastToRoom(roomCode, {
                type: 'PAUSE_AT',
                positionSec,
                serverTime: Date.now(),
                initiatedBy: username,
              });
              break;
            }

            // Playback: Seek
            case 'HOST_SEEK': {
              const currentRoom = await TogetherRoomService.getRoom(roomCode);
              if (!currentRoom) return;
              if (currentRoom.hostId !== userId && currentRoom.mode !== 'collab') return;

              const positionSec = Number(payload.positionSec) || 0;
              const isPlaying = currentRoom.player.state === 'playing';
              const startAtServerMs = isPlaying ? Date.now() + 300 : 0;

              currentRoom.player.positionSec = positionSec;
              currentRoom.player.startedAtServerMs = startAtServerMs;
              await TogetherRoomService.saveRoom(currentRoom);

              broadcastToRoom(roomCode, {
                type: 'SEEK_TO',
                positionSec,
                state: currentRoom.player.state,
                startAtServerMs,
                serverTime: Date.now(),
              });
              break;
            }

            // Queue: Add track
            case 'QUEUE_ADD': {
              const currentRoom = await TogetherRoomService.getRoom(roomCode);
              if (!currentRoom) return;
              if (!currentRoom.settings.guestCanQueue && currentRoom.hostId !== userId) {
                socket.send(JSON.stringify({ type: 'ERROR', message: 'Guest queuing is disabled in this room' }));
                return;
              }

              const { room: updatedRoom, item } = await TogetherRoomService.addQueueItem(roomCode, payload.track, {
                id: userId,
                name: username,
              });

              broadcastToRoom(roomCode, {
                type: 'QUEUE_UPDATED',
                queue: updatedRoom.queue,
                addedItem: item,
              });
              break;
            }

            // Queue: Remove track
            case 'QUEUE_REMOVE': {
              const updatedRoom = await TogetherRoomService.removeQueueItem(roomCode, payload.itemId);
              broadcastToRoom(roomCode, {
                type: 'QUEUE_UPDATED',
                queue: updatedRoom.queue,
              });
              break;
            }

            // Queue: Reorder
            case 'QUEUE_REORDER': {
              const updatedRoom = await TogetherRoomService.reorderQueue(
                roomCode,
                payload.startIndex,
                payload.endIndex
              );
              broadcastToRoom(roomCode, {
                type: 'QUEUE_UPDATED',
                queue: updatedRoom.queue,
              });
              break;
            }

            // Skip Vote with configurable threshold
            case 'SKIP_VOTE': {
              const result = await TogetherRoomService.voteSkip(roomCode, userId);
              if (result.skipped) {
                broadcastToRoom(roomCode, {
                  type: 'PLAY_AT',
                  trackId: result.room.player.trackId,
                  track: result.room.player.track,
                  positionSec: 0,
                  startAtServerMs: result.room.player.startedAtServerMs,
                  initiatedBy: 'Vote Skip',
                  skipVotes: [],
                  seq: result.room.seq,
                });
                broadcastToRoom(roomCode, {
                  type: 'QUEUE_UPDATED',
                  queue: result.room.queue,
                  seq: result.room.seq,
                });
              } else {
                broadcastToRoom(roomCode, {
                  type: 'SKIP_VOTES_UPDATED',
                  votes: result.votes,
                  needed: result.needed,
                  voters: result.room.skipVotes,
                });
              }
              break;
            }

            // Reaction with real-time aggregated counters (❤️, 🔥, 👏, 😭, 💃, 🎧)
            case 'REACTION': {
              const emoji = String(payload.emoji || '❤️').slice(0, 4);
              const currentRoom = await TogetherRoomService.getRoom(roomCode);
              if (currentRoom) {
                if (!currentRoom.reactions) currentRoom.reactions = {};
                currentRoom.reactions[emoji] = (currentRoom.reactions[emoji] || 0) + 1;
                await TogetherRoomService.saveRoom(currentRoom);
              }
              broadcastToRoom(roomCode, {
                type: 'REACTION',
                id: crypto.randomUUID(),
                userId,
                username,
                emoji,
                reactions: currentRoom?.reactions || {},
                timestamp: Date.now(),
              });
              break;
            }

            // Client requests full room snapshot (e.g. sequence gap or reconnect)
            case 'REQUEST_RESYNC': {
              const currentRoom = await TogetherRoomService.getRoom(roomCode);
              if (currentRoom) {
                socket.send(
                  JSON.stringify({
                    type: 'INIT_STATE',
                    room: currentRoom,
                    self: { userId, username, avatar, role },
                    serverTime: Date.now(),
                  })
                );
              }
              break;
            }

            // Chat Message
            case 'CHAT_MESSAGE': {
              const currentRoom = await TogetherRoomService.getRoom(roomCode);
              if (!currentRoom) return;
              if (!currentRoom.settings.guestCanChat && currentRoom.hostId !== userId) {
                return;
              }

              const text = String(payload.text || '').trim();
              if (!text) return;

              const { room: updatedRoom, chatItem } = await TogetherRoomService.addChatMessage(roomCode, {
                userId,
                username,
                avatar,
                text,
              });

              broadcastToRoom(roomCode, {
                type: 'CHAT_MESSAGE',
                chatItem,
              });
              break;
            }

            // Buffer ready acknowledgement from listener
            case 'BUFFER_READY': {
              broadcastToRoom(roomCode, {
                type: 'MEMBER_BUFFER_READY',
                userId,
                trackId: payload.trackId,
              });
              break;
            }
          }
        } catch (err) {
          console.warn('[TogetherWS] Message handling error:', err);
        }
      });

      // Handle socket disconnect
      socket.on('close', async () => {
        const sockets = roomSockets.get(roomCode);
        if (sockets) {
          sockets.delete(client);
          if (sockets.size === 0) {
            roomSockets.delete(roomCode);
          }
        }

        const updatedRoom = await TogetherRoomService.removeMember(roomCode, userId);
        if (updatedRoom) {
          broadcastToRoom(roomCode, {
            type: 'MEMBER_LEFT',
            userId,
            username,
            newHostId: updatedRoom.hostId,
            members: updatedRoom.members,
          });
        }
      });
    }
  );
}

