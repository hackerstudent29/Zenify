import webpush from 'web-push';
import { prisma } from '../utils/prisma';
import { config } from '../config/env';

// VAPID keys: Use process.env or provide deterministic development keys
let vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
let vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (!vapidPublicKey || !vapidPrivateKey) {
  // Generate a dev fallback keypair
  const generated = webpush.generateVAPIDKeys();
  vapidPublicKey = generated.publicKey;
  vapidPrivateKey = generated.privateKey;
}

webpush.setVapidDetails(
  'mailto:notifications@zenify.music',
  vapidPublicKey,
  vapidPrivateKey
);

export class WebPushService {
  /**
   * Return public VAPID key for frontend registration
   */
  static getPublicKey(): string {
    return vapidPublicKey!;
  }

  /**
   * Register or update a Web Push subscription
   */
  static async registerSubscription(
    userId: string,
    sub: {
      endpoint: string;
      p256dh: string;
      auth: string;
      userAgent?: string;
    }
  ) {
    return prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      update: {
        userId,
        p256dh: sub.p256dh,
        auth: sub.auth,
        userAgent: sub.userAgent || undefined,
        lastSeenAt: new Date(),
      },
      create: {
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        userAgent: sub.userAgent,
      },
    });
  }

  /**
   * Remove a Web Push subscription
   */
  static async removeSubscription(userId: string, endpoint: string) {
    return prisma.pushSubscription.deleteMany({
      where: {
        userId,
        endpoint,
      },
    });
  }

  /**
   * Dispatches push notification with 3-per-day user fatigue capping
   */
  static async sendNotification(
    userId: string,
    payload: {
      title: string;
      body: string;
      icon?: string;
      url?: string;
    }
  ): Promise<{ sent: number; failed: number }> {
    // 1. Check user notification preference
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (pref && !pref.newReleases) {
      return { sent: 0, failed: 0 };
    }

    // 2. Daily fatigue cap: maximum 3 notifications per user per day
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const pushesToday = await prisma.notification.count({
      where: {
        userId,
        type: 'new_release',
        createdAt: { gte: startOfDay },
      },
    });

    if (pushesToday >= 3) {
      console.log(`[WebPush] User ${userId} reached daily push cap (3/3). Skipping push.`);
      return { sent: 0, failed: 0 };
    }

    // 3. Fetch active subscriptions
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) {
      return { sent: 0, failed: 0 };
    }

    const payloadString = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/images/icon-192.png',
      badge: '/images/badge-72.png',
      data: {
        url: payload.url || '/',
      },
    });

    let sent = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webpush.sendNotification(pushSubscription, payloadString);
        sent++;
      } catch (err: any) {
        failed++;
        // Delete dead subscription if HTTP 404 or 410 (unsubscribed / expired)
        if (err.statusCode === 404 || err.statusCode === 410) {
          console.log(`[WebPush] Deleting expired subscription for user ${userId}: ${sub.endpoint}`);
          await prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } }).catch(() => {});
        } else {
          console.warn(`[WebPush] Delivery error: ${err.message}`);
        }
      }
    }

    return { sent, failed };
  }
}

