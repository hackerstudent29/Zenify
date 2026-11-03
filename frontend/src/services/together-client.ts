import { useTogetherStore } from '@/store/togetherStore';
import { usePlayerStore } from '@/store/player';
import { audioEngine } from '@/lib/audio-engine';
import { getApiBaseUrl } from '@/lib/utils';

interface SyncSample {
  rtt: number;
  offset: number;
}

class TogetherClient {
  private ws: WebSocket | null = null;
  private roomCode: string | null = null;
  private syncSamples: SyncSample[] = [];
  private syncInterval: any = null;
  private driftInterval: any = null;
  private startBarrierTimer: any = null;
  private reconnectTimer: any = null;
  private currentTicket: string | null = null;

  private getNowMs(): number {
    return typeof performance !== 'undefined' ? performance.timeOrigin + performance.now() : Date.now();
  }

  private getWsUrl(ticket: string): string {
    const apiBase = getApiBaseUrl();
    const wsProto = apiBase.startsWith('https') ? 'wss:' : 'ws:';
    const host = apiBase.replace(/^https?:\/\//, '').replace(/\/api$/, '');
    return `${wsProto}//${host}/ws/together?ticket=${encodeURIComponent(ticket)}`;
  }

  /**
   * Connect to session WebSocket using single-use ticket
   */
  public connect(roomCode: string, ticket: string) {
    this.disconnect();
    this.roomCode = roomCode;
    this.currentTicket = ticket;

    const wsUrl = this.getWsUrl(ticket);
    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      console.error('[TogetherClient] Failed to create WebSocket:', err);
      return;
    }

    this.ws.onopen = () => {
      useTogetherStore.getState().setConnected(true);
      this.runInitialClockSync();
      this.startIntervals();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (e) {
        console.warn('[TogetherClient] Failed to parse message:', e);
      }
    };

    this.ws.onerror = (err) => {
      console.warn('[TogetherClient] WebSocket error:', err);
    };

    this.ws.onclose = () => {
      useTogetherStore.getState().setConnected(false);
      this.stopIntervals();
    };
  }

  /**
   * NTP Clock Synchronization
   */
  private runInitialClockSync() {
    this.syncSamples = [];
    let count = 0;
    const interval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN || count >= 8) {
        clearInterval(interval);
        return;
      }
      this.sendSyncPing();
      count++;
    }, 60);
  }

  private sendSyncPing() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const t0 = this.getNowMs();
    this.ws.send(JSON.stringify({ type: 'SYNC_PING', t0 }));
  }

  private handleSyncPong(msg: { t0: number; t1: number; t2: number }) {
    const t3 = this.getNowMs();
    const { t0, t1, t2 } = msg;

    const rtt = Math.max(0, (t3 - t0) - (t2 - t1));
    const offset = ((t1 - t0) + (t2 - t3)) / 2;

    this.syncSamples.push({ rtt, offset });
    if (this.syncSamples.length >= 4) {
      // Sort by RTT and take the median offset
      const sorted = [...this.syncSamples].sort((a, b) => a.rtt - b.rtt);
      const median = sorted[Math.floor(sorted.length / 2)];
      useTogetherStore.getState().setClockOffset(median.offset);
      useTogetherStore.getState().setLatency(Math.round(median.rtt / 2));
    }
  }

  /**
   * Handle incoming socket messages
   */
  private handleMessage(data: any) {
    switch (data.type) {
      case 'HEARTBEAT': {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'HEARTBEAT_ACK' }));
        }
        break;
      }

      case 'INIT_STATE': {
        useTogetherStore.getState().setRoom(data.room);
        useTogetherStore.getState().setSelfRole(data.self.role);
        break;
      }

      case 'SYNC_PONG': {
        this.handleSyncPong(data);
        break;
      }

      case 'PLAY_AT': {
        this.handlePlayAt(data);
        break;
      }

      case 'PAUSE_AT': {
        this.handlePauseAt(data);
        break;
      }

      case 'SEEK_TO': {
        this.handleSeekTo(data);
        break;
      }

      case 'QUEUE_UPDATED': {
        useTogetherStore.getState().updateRoom({ queue: data.queue });
        break;
      }

      case 'REACTION': {
        useTogetherStore.getState().addReaction(data.emoji, data.username);
        break;
      }

      case 'CHAT_MESSAGE': {
        useTogetherStore.getState().addChatMessage(data.chatItem);
        break;
      }

      case 'MEMBER_JOINED': {
        useTogetherStore.getState().updateRoom({ members: data.members });
        break;
      }

      case 'MEMBER_LEFT': {
        useTogetherStore.getState().updateRoom({
          members: data.members,
          hostId: data.newHostId,
        });
        break;
      }

      case 'ERROR': {
        console.warn('[TogetherClient] Server error:', data.message);
        break;
      }
    }
  }

  /**
   * Synchronized Play with 500ms barrier
   */
  private handlePlayAt(data: { track: any; positionSec: number; startAtServerMs: number }) {
    if (this.startBarrierTimer) {
      clearTimeout(this.startBarrierTimer);
      this.startBarrierTimer = null;
    }

    const { track, positionSec, startAtServerMs } = data;
    const offset = useTogetherStore.getState().clockOffsetMs;
    const targetLocalFireTime = startAtServerMs - offset;
    const now = this.getNowMs();
    const waitMs = Math.max(0, targetLocalFireTime - now);

    const playerStore = usePlayerStore.getState();
    const currentTrack = playerStore.currentTrack;

    // Load track if different
    if (!currentTrack || currentTrack.id !== track.id) {
      playerStore.setTrack(track, [track]);
    }

    // Schedule play at exact barrier moment
    this.startBarrierTimer = setTimeout(() => {
      const audio = audioEngine.getActiveAudioElement();
      if (audio) {
        audio.currentTime = positionSec;
        audio.playbackRate = 1.0;
        audio.play().catch((err: any) => {
          if (err.name === 'NotAllowedError') {
            useTogetherStore.getState().setNeedsTapToPlay(true);
          }
        });
      }
      playerStore.setIsPlaying(true);
      useTogetherStore.getState().updateRoom({
        player: {
          trackId: track.id,
          track,
          state: 'playing',
          positionSec,
          startedAtServerMs: startAtServerMs,
        },
      });
    }, waitMs);
  }

  /**
   * Synchronized Pause
   */
  private handlePauseAt(data: { positionSec: number }) {
    if (this.startBarrierTimer) {
      clearTimeout(this.startBarrierTimer);
      this.startBarrierTimer = null;
    }

    const audio = audioEngine.getActiveAudioElement();
    if (audio) {
      audio.pause();
      audio.currentTime = data.positionSec;
      audio.playbackRate = 1.0;
    }
    usePlayerStore.getState().setIsPlaying(false);
    useTogetherStore.getState().updateRoom({
      player: {
        ...(useTogetherStore.getState().room?.player || {
          trackId: null,
          track: null,
          startedAtServerMs: 0,
        }),
        state: 'paused',
        positionSec: data.positionSec,
      },
    });
  }

  /**
   * Synchronized Seek
   */
  private handleSeekTo(data: { positionSec: number; startAtServerMs: number; state: string }) {
    const audio = audioEngine.getActiveAudioElement();
    if (audio) {
      audio.currentTime = data.positionSec;
    }
    usePlayerStore.getState().setCurrentTime(data.positionSec);
  }

  /**
   * Micro-drift corrector (runs every 2 seconds)
   */
  private startIntervals() {
    this.stopIntervals();

    // 30-second NTP re-sync
    this.syncInterval = setInterval(() => {
      this.sendSyncPing();
    }, 30_000);

    // 2-second drift checker
    this.driftInterval = setInterval(() => {
      const room = useTogetherStore.getState().room;
      if (!room || room.player.state !== 'playing' || !room.player.startedAtServerMs) {
        return;
      }

      const audio = audioEngine.getActiveAudioElement();
      if (!audio || audio.paused) return;

      const offset = useTogetherStore.getState().clockOffsetMs;
      const serverNow = this.getNowMs() + offset;
      const elapsedSec = Math.max(0, (serverNow - room.player.startedAtServerMs) / 1000);
      const targetSec = room.player.positionSec + elapsedSec;
      const actualSec = audio.currentTime;

      const driftMs = Math.round((actualSec - targetSec) * 1000);
      useTogetherStore.getState().setDrift(driftMs);

      // Micro adjustment strategy
      const absDrift = Math.abs(driftMs);
      if (absDrift < 80) {
        // Imperceptible, keep normal speed
        if (audio.playbackRate !== 1.0) audio.playbackRate = 1.0;
      } else if (absDrift <= 1000) {
        // 80ms - 1000ms: micro-adjust playback rate smoothly
        if (driftMs < 0) {
          // Audio is lagging behind, speed up slightly
          audio.playbackRate = 1.03;
        } else {
          // Audio is ahead, slow down slightly
          audio.playbackRate = 0.97;
        }
      } else {
        // Greater than 1000ms: hard seek
        audio.currentTime = targetSec;
        audio.playbackRate = 1.0;
      }
    }, 2000);
  }

  private stopIntervals() {
    if (this.syncInterval) clearInterval(this.syncInterval);
    if (this.driftInterval) clearInterval(this.driftInterval);
    if (this.startBarrierTimer) clearTimeout(this.startBarrierTimer);
    this.syncInterval = null;
    this.driftInterval = null;
    this.startBarrierTimer = null;
  }

  /**
   * Dispatchers for actions
   */
  public play(track: any, positionSec = 0) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'HOST_PLAY', track, positionSec }));
  }

  public pause(positionSec?: number) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const audio = audioEngine.getActiveAudioElement();
    const pos = positionSec !== undefined ? positionSec : (audio?.currentTime || 0);
    this.ws.send(JSON.stringify({ type: 'HOST_PAUSE', positionSec: pos }));
  }

  public seek(positionSec: number) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'HOST_SEEK', positionSec }));
  }

  public addQueue(track: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'QUEUE_ADD', track }));
  }

  public removeQueue(itemId: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'QUEUE_REMOVE', itemId }));
  }

  public reorderQueue(startIndex: number, endIndex: number) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'QUEUE_REORDER', startIndex, endIndex }));
  }

  public sendReaction(emoji: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'REACTION', emoji }));
  }

  public sendChatMessage(text: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'CHAT_MESSAGE', text }));
  }

  public disconnect() {
    this.stopIntervals();
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    useTogetherStore.getState().leaveRoom();
  }
}

export const togetherClient = new TogetherClient();

