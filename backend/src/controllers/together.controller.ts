import { FastifyRequest, FastifyReply } from 'fastify';
import { TogetherRoomService } from '../services/together-room.service';
import { config } from '../config/env';

export class TogetherController {
  /**
   * Create a new room
   */
  static async createRoom(request: FastifyRequest, reply: FastifyReply) {
    if (!config.FEATURE_TOGETHER && config.NODE_ENV === 'production') {
      return reply.status(403).send({ error: 'Feature disabled', message: 'Listen Together is currently disabled.' });
    }

    const user = (request as any).user;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    }

    const body = (request.body as any) || {};
    const { room, ticket } = await TogetherRoomService.createRoom(
      {
        id: user.userId || user.id,
        name: user.name || user.username,
        image: user.image || user.avatar,
      },
      {
        mode: body.mode || 'dj',
        requiresApproval: body.requiresApproval,
        guestCanQueue: body.guestCanQueue,
        guestCanChat: body.guestCanChat,
      }
    );

    return reply.status(201).send({
      success: true,
      roomCode: room.roomCode,
      room,
      ticket,
    });
  }

  /**
   * Get room overview
   */
  static async getRoom(request: FastifyRequest<{ Params: { code: string } }>, reply: FastifyReply) {
    const { code } = request.params;
    const room = await TogetherRoomService.getRoom(code);
    if (!room) {
      return reply.status(404).send({ error: 'Not Found', message: 'Session not found or has expired' });
    }

    // Return sanitized overview (don't leak private session data to unauthenticated viewers)
    return reply.send({
      roomCode: room.roomCode,
      mode: room.mode,
      memberCount: room.members.length,
      requiresApproval: room.settings.requiresApproval,
      guestCanQueue: room.settings.guestCanQueue,
      guestCanChat: room.settings.guestCanChat,
      currentTrack: room.player.track,
      isPlaying: room.player.state === 'playing',
    });
  }

  /**
   * Join an existing room and get WebSocket ticket
   */
  static async joinRoom(request: FastifyRequest<{ Params: { code: string } }>, reply: FastifyReply) {
    if (!config.FEATURE_TOGETHER && config.NODE_ENV === 'production') {
      return reply.status(403).send({ error: 'Feature disabled', message: 'Listen Together is currently disabled.' });
    }

    const user = (request as any).user;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    }

    const { code } = request.params;
    try {
      const { room, ticket } = await TogetherRoomService.joinRoom(code, {
        id: user.userId || user.id,
        name: user.name || user.username,
        image: user.image || user.avatar,
      });

      return reply.send({
        success: true,
        room,
        ticket,
      });
    } catch (err: any) {
      return reply.status(404).send({ error: 'Not Found', message: err.message || 'Unable to join session' });
    }
  }

  /**
   * Update room settings
   */
  static async updateSettings(request: FastifyRequest<{ Params: { code: string } }>, reply: FastifyReply) {
    const user = (request as any).user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const { code } = request.params;
    const body = (request.body as any) || {};

    try {
      const updated = await TogetherRoomService.updateSettings(code, user.userId || user.id, body);
      return reply.send({ success: true, room: updated });
    } catch (err: any) {
      return reply.status(400).send({ error: 'Bad Request', message: err.message });
    }
  }

  /**
   * Transfer host to another listener
   */
  static async transferHost(request: FastifyRequest<{ Params: { code: string } }>, reply: FastifyReply) {
    const user = (request as any).user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const { code } = request.params;
    const { newHostId } = (request.body as any) || {};
    if (!newHostId) {
      return reply.status(400).send({ error: 'Bad Request', message: 'newHostId is required' });
    }

    try {
      const updated = await TogetherRoomService.transferHost(code, user.userId || user.id, newHostId);
      return reply.send({ success: true, room: updated });
    } catch (err: any) {
      return reply.status(400).send({ error: 'Bad Request', message: err.message });
    }
  }

  /**
   * Close session
   */
  static async closeRoom(request: FastifyRequest<{ Params: { code: string } }>, reply: FastifyReply) {
    const user = (request as any).user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const { code } = request.params;
    try {
      await TogetherRoomService.closeRoom(code, user.userId || user.id);
      return reply.send({ success: true, message: 'Room closed' });
    } catch (err: any) {
      return reply.status(400).send({ error: 'Bad Request', message: err.message });
    }
  }
}

