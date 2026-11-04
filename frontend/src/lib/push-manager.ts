import api from '@/lib/api';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export class PushManager {
  /**
   * Check if web push is supported in this browser
   */
  static isSupported(): boolean {
    return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  /**
   * Check current notification permission
   */
  static getPermission(): NotificationPermission {
    if (!this.isSupported()) return 'denied';
    return Notification.permission;
  }

  /**
   * Subscribe to Web Push notifications for new releases
   */
  static async subscribeToNewReleases(): Promise<boolean> {
    if (!this.isSupported()) {
      throw new Error('Web Push notifications are not supported by this browser.');
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    if (!registration) {
      throw new Error('Service Worker is not ready.');
    }

    // Fetch server VAPID public key
    const res = await api.get('/me/push-subscriptions/key');
    const vapidPublicKey = res.data?.publicKey;
    if (!vapidPublicKey) {
      throw new Error('Failed to obtain server push key.');
    }

    // Subscribe with pushManager
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
    });

    const subJson = subscription.toJSON();
    if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
      throw new Error('Invalid subscription keys received from browser.');
    }

    // Register on backend
    await api.post('/me/push-subscriptions', {
      endpoint: subJson.endpoint,
      p256dh: subJson.keys.p256dh,
      auth: subJson.keys.auth,
    });

    return true;
  }

  /**
   * Unsubscribe from Web Push
   */
  static async unsubscribe(): Promise<boolean> {
    if (!this.isSupported()) return true;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await api.delete('/me/push-subscriptions', {
          data: { endpoint: subscription.endpoint },
        });
        await subscription.unsubscribe();
      }
      return true;
    } catch (err) {
      console.warn('[PushManager] Unsubscribe error:', err);
      return false;
    }
  }
}

