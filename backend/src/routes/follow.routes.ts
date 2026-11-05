import { FastifyInstance } from 'fastify';
import { FollowController } from '../controllers/follow.controller';

export async function followRoutes(server: FastifyInstance) {
  // Follow / unfollow artist
  server.post(
    '/following/:artistId',
    { preHandler: [server.authenticate], config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    FollowController.followArtist
  );

  server.delete(
    '/following/:artistId',
    { preHandler: [server.authenticate], config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    FollowController.unfollowArtist
  );

  // Followed artists list & status
  server.get(
    '/following',
    { preHandler: [server.authenticate], config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    FollowController.getFollowedArtists
  );

  server.get(
    '/following/status',
    { preHandler: [server.optionalAuthenticate], config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    FollowController.getFollowingStatus
  );

  // New releases timeline
  server.get(
    '/releases',
    { preHandler: [server.authenticate], config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    FollowController.getReleasesTimeline
  );

  // Web Push Subscriptions
  server.post(
    '/push-subscriptions',
    { preHandler: [server.authenticate], config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    FollowController.registerPushSubscription
  );

  server.delete(
    '/push-subscriptions',
    { preHandler: [server.authenticate], config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    FollowController.deletePushSubscription
  );

  server.get(
    '/push-subscriptions/key',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    FollowController.getVapidPublicKey
  );

  // Notification Preferences
  server.get(
    '/notification-preferences',
    { preHandler: [server.authenticate], config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    FollowController.getNotificationPreferences
  );

  server.patch(
    '/notification-preferences',
    { preHandler: [server.authenticate], config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    FollowController.updateNotificationPreferences
  );
}
