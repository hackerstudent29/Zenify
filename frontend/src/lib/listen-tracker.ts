import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

export interface PendingListenEvent {
  clientEventId: string;
  trackId: string;
  artistIds?: string[];
  albumId?: string;
  language?: string;
  msPlayed: number;
  durationMs: number;
  completed: boolean;
  skipped: boolean;
  source: string;
  hour: number;
  timestamp: number;
}

const STORAGE_KEY = "zenify_pending_listens";
const MAX_OFFLINE_QUEUE = 100;
const BATCH_FLUSH_INTERVAL = 15000; // 15 seconds
const LISTEN_THRESHOLD_SEC = 30; // 30s threshold

class ListenTrackerService {
  private activeSessionId: string | null = null;
  private currentTrackId: string | null = null;
  private currentTrackMetadata: {
    artistIds?: string[];
    albumId?: string;
    language?: string;
    durationMs?: number;
  } = {};
  private accumulatedMs: number = 0;
  private lastUpdateTime: number = 0;
  private thresholdReported: boolean = false;
  private isFlushing: boolean = false;
  private flushTimer: any = null;

  constructor() {
    if (typeof window !== "undefined") {
      // Periodic background batch flusher
      this.flushTimer = setInterval(() => this.flushQueue(), BATCH_FLUSH_INTERVAL);

      // Online event listener to immediately retry offline events
      window.addEventListener("online", () => this.flushQueue());
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          this.flushQueue();
        }
      });
    }
  }

  /**
   * Start a new playback tracking session for a track
   */
  public startTrackSession(track: {
    id: string;
    artistId?: string;
    artist?: { id?: string };
    albumId?: string;
    album?: { id?: string };
    language?: string;
    duration?: number;
  }) {
    if (!track || !track.id) return;

    // Conclude previous session if any without report
    if (this.currentTrackId && this.activeSessionId && !this.thresholdReported && this.accumulatedMs >= 5000) {
      this.recordSkip();
    }

    this.currentTrackId = track.id;
    const randPart = typeof crypto !== 'undefined' && crypto.getRandomValues
      ? Array.from(crypto.getRandomValues(new Uint8Array(4)), b => b.toString(16).padStart(2, '0')).join('')
      : Date.now().toString(36);
    this.activeSessionId = `evt_${track.id}_${Date.now()}_${randPart}`;
    this.accumulatedMs = 0;
    this.lastUpdateTime = Date.now();
    this.thresholdReported = false;

    const artistId = track.artistId || track.artist?.id;
    const albumId = track.albumId || track.album?.id;
    const durationMs = track.duration ? (track.duration > 10000 ? track.duration : track.duration * 1000) : 0;

    this.currentTrackMetadata = {
      artistIds: artistId ? [artistId] : [],
      albumId,
      language: track.language,
      durationMs,
    };
  }

  /**
   * Periodic playback heartbeat from audio timeupdate
   */
  public updateProgress(currentTimeSec: number, isPlaying: boolean) {
    if (!this.currentTrackId || !isPlaying) {
      this.lastUpdateTime = Date.now();
      return;
    }

    const now = Date.now();
    const elapsedSinceLastUpdate = now - this.lastUpdateTime;
    this.lastUpdateTime = now;

    // Only accumulate if elapsed time is reasonable (e.g. < 2 seconds) to avoid background jump bugs
    if (elapsedSinceLastUpdate > 0 && elapsedSinceLastUpdate < 2500) {
      this.accumulatedMs += elapsedSinceLastUpdate;
    }

    // Check if 30-second threshold has just been crossed
    if (!this.thresholdReported && this.accumulatedMs >= LISTEN_THRESHOLD_SEC * 1000) {
      this.thresholdReported = true;
      this.queueEvent({
        completed: false,
        skipped: false,
      });
    }
  }

  /**
   * Record natural track completion
   */
  public recordCompletion() {
    if (!this.currentTrackId || !this.activeSessionId) return;

    this.queueEvent({
      completed: true,
      skipped: false,
    });

    // Reset current session
    this.currentTrackId = null;
    this.activeSessionId = null;
    this.accumulatedMs = 0;
  }

  /**
   * Record skipped track
   */
  public recordSkip() {
    if (!this.currentTrackId || !this.activeSessionId) return;

    // Only record skip if played for at least 3 seconds and not already completed
    if (this.accumulatedMs >= 3000) {
      this.queueEvent({
        completed: false,
        skipped: true,
      });
    }

    this.currentTrackId = null;
    this.activeSessionId = null;
    this.accumulatedMs = 0;
  }

  /**
   * Enqueue a listen event into offline-resilient storage
   */
  private queueEvent(options: { completed: boolean; skipped: boolean }) {
    if (!this.currentTrackId || !this.activeSessionId) return;

    const event: PendingListenEvent = {
      clientEventId: `${this.activeSessionId}_${options.completed ? "comp" : options.skipped ? "skip" : "thresh"}`,
      trackId: this.currentTrackId,
      artistIds: this.currentTrackMetadata.artistIds,
      albumId: this.currentTrackMetadata.albumId,
      language: this.currentTrackMetadata.language,
      msPlayed: Math.round(this.accumulatedMs),
      durationMs: Math.round(this.currentTrackMetadata.durationMs || 0),
      completed: options.completed,
      skipped: options.skipped,
      source: "player",
      hour: new Date().getHours(),
      timestamp: Date.now(),
    };

    const queue = this.loadQueue();
    // Dedup by clientEventId
    if (!queue.some((e) => e.clientEventId === event.clientEventId)) {
      queue.push(event);
      if (queue.length > MAX_OFFLINE_QUEUE) {
        queue.shift(); // Evict oldest
      }
      this.saveQueue(queue);
    }

    // Attempt instant flush
    this.flushQueue();
  }

  /**
   * Flush pending queue to server
   */
  public async flushQueue() {
    if (this.isFlushing || typeof window === "undefined" || !navigator.onLine) return;

    // Only authenticated users can record personal listen events
    const isAuthenticated = useAuthStore.getState().isAuthenticated;
    if (!isAuthenticated) return;

    const queue = this.loadQueue();
    if (queue.length === 0) return;

    this.isFlushing = true;
    const batch = queue.slice(0, 25);

    try {
      const payload = batch.map((item) => ({
        clientEventId: item.clientEventId,
        trackId: item.trackId,
        artistIds: item.artistIds,
        albumId: item.albumId,
        language: item.language,
        msPlayed: item.msPlayed,
        durationMs: item.durationMs,
        completed: item.completed,
        skipped: item.skipped,
        source: item.source,
        hour: item.hour,
      }));

      await api.post("/activity/listen-event", { events: payload });

      // Remove successfully delivered events from queue
      const sentIds = new Set(batch.map((b) => b.clientEventId));
      const remaining = this.loadQueue().filter((e) => !sentIds.has(e.clientEventId));
      this.saveQueue(remaining);
    } catch (err: any) {
      // If network error, retain in queue for next flush attempt
      console.warn("[ListenTracker] Offline or server error, retained in queue:", err?.message);
    } finally {
      this.isFlushing = false;
    }
  }

  private loadQueue(): PendingListenEvent[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveQueue(queue: PendingListenEvent[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch {}
  }
}

export const listenTracker = new ListenTrackerService();
