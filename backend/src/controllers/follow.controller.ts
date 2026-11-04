import { FastifyRequest, FastifyReply } from 'fastify';
import { FollowService } from '../services/follow.service';
import { WebPushService } from '../services/web-push.service';
import { prisma } from '../utils/prisma';
import { config } from '../config/env';

export class FollowController {
  /**
   * Follow an artist
   * POST /api/me/following/:artistId
   */
  static async followArtist(
    request: FastifyRequest<{ Params: { artistId: string } }>,
    reply: FastifyReply
  ) {
    if (!config.FEATURE_FOLLOW && config.NODE_ENV === 'production') {
      return reply.status(403).send({ error: 'Feature disabled', message: 'Following artists is disabled.' });
    }

    const user = (request as any).user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const { artistId } = request.params;
    const body = (request.body as any) || {};

    const artistName = String(body.name || body.artistName || 'Artist').trim();
    const artistImage = body.image || body.artistImage;

    const result = await FollowService.followArtist(user.userId || user.id, artistId, artistName, artistImage);
    return reply.status(200).send(result);
  }

  /**
   * Unfollow an artist
   * DELETE /api/me/following/:artistId
   */
  static async unfollowArtist(
    request: FastifyRequest<{ Params: { artistId: string } }>,
    reply: FastifyReply
  ) {
    const user = (request as any).user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const { artistId } = request.params;
    const result = await FollowService.unfollowArtist(user.userId || user.id, artistId);
    return reply.status(200).send(result);
  }

  /**
   * Get list of followed artists
   * GET /api/me/following
   */
  static async getFollowedArtists(
    request: FastifyRequest<{ Querystring: { page?: string; limit?: string } }>,
    reply: FastifyReply
  ) {
    const user = (request as any).user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const page = Math.max(1, parseInt(request.query.page || '1', 10));
    const limit = Math.max(1, Math.min(50, parseInt(request.query.limit || '20', 10)));

    const result = await FollowService.getFollowedArtists(user.userId || user.id, page, limit);
    return reply.send(result);
  }

  /**
   * Bulk check following status
   * GET /api/me/following/status?artistIds=id1,id2
   */
  static async getFollowingStatus(
    request: FastifyRequest<{ Querystring: { artistIds?: string } }>,
    reply: FastifyReply
  ) {
    const user = (request as any).user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const rawIds = request.query.artistIds || '';
    const artistIds = rawIds.split(',').map((s) => s.trim()).filter(Boolean);

    const result = await FollowService.isFollowingBatch(user.userId || user.id, artistIds);
    return reply.send({ status: result });
  }

  /**
   * Releases timeline for followed artists
   * GET /api/me/releases
   */
  static async getReleasesTimeline(
    request: FastifyRequest<{ Querystring: { limit?: string } }>,
    reply: FastifyReply
  ) {
    const user = (request as any).user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const limit = Math.max(1, Math.min(50, parseInt(request.query.limit || '30', 10)));
    const releases = await FollowService.getNewReleasesTimeline(user.userId || user.id, limit);
    return reply.send({ releases });
  }

  /**
   * Register Web Push Subscription
   * POST /api/me/push-subscriptions
   */
  static async registerPushSubscription(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const body = (request.body as any) || {};
    if (!body.endpoint || !body.p256dh || !body.auth) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Missing subscription keys' });
    }

    await WebPushService.registerSubscription(user.userId || user.id, {
      endpoint: body.endpoint,
      p256dh: body.p256dh,
      auth: body.auth,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(201).send({ success: true, message: 'Push subscription registered' });
  }

  /**
   * Delete Push Subscription
   * DELETE /api/me/push-subscriptions
   */
  static async deletePushSubscription(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const body = (request.body as any) || {};
    if (!body.endpoint) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Missing endpoint' });
    }

    await WebPushService.removeSubscription(user.userId || user.id, body.endpoint);
    return reply.send({ success: true, message: 'Push subscription removed' });
  }

  /**
   * Get VAPID public key
   * GET /api/me/push-subscriptions/key
   */
  static async getVapidPublicKey(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send({ publicKey: WebPushService.getPublicKey() });
  }

  /**
   * Notification preferences
   * GET /api/me/notification-preferences
   */
  static async getNotificationPreferences(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const pref = await prisma.notificationPreference.findUnique({
      where: { userId: user.userId || user.id },
    });

    return reply.send(
      pref || {
        newReleases: true,
        dailyDigest: false,
        mutedArtists: [],
      }
    );
  }

  /**
   * Update notification preferences
   * PATCH /api/me/notification-preferences
   */
  static async updateNotificationPreferences(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const body = (request.body as any) || {};
    const updated = await prisma.notificationPreference.upsert({
      where: { userId: user.userId || user.id },
      update: {
        newReleases: body.newReleases,
        dailyDigest: body.dailyDigest,
        mutedArtists: body.mutedArtists,
      },
      create: {
        userId: user.userId || user.id,
        newReleases: body.newReleases ?? true,
        dailyDigest: body.dailyDigest ?? false,
        mutedArtists: body.mutedArtists || [],
      },
    });

    return reply.send({ success: true, preferences: updated });
  }
}

