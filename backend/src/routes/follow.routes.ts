import { FastifyInstance } from 'fastify';
import { FollowController } from '../controllers/follow.controller';

export async function followRoutes(server: FastifyInstance) {
  // Follow / unfollow artist
  server.post(
    '/following/:artistId',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    FollowController.followArtist
  );

  server.delete(
    '/following/:artistId',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    FollowController.unfollowArtist
  );

  // Followed artists list & status
  server.get(
    '/following',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    FollowController.getFollowedArtists
  );

  server.get(
    '/following/status',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    FollowController.getFollowingStatus
  );

  // New releases timeline
  server.get(
    '/releases',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    FollowController.getReleasesTimeline
  );

  // Web Push Subscriptions
  server.post(
    '/push-subscriptions',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    FollowController.registerPushSubscription
  );

  server.delete(
    '/push-subscriptions',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
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
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    FollowController.getNotificationPreferences
  );

  server.patch(
    '/notification-preferences',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    FollowController.updateNotificationPreferences
  );
}

