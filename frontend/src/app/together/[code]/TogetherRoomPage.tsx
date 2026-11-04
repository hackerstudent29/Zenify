"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useTogetherStore } from '@/store/togetherStore';
import { togetherClient } from '@/services/together-client';
import { usePlayerStore } from '@/store/player';
import { Equalizer } from '@/components/ui/Equalizer';
import { SEO } from '@/components/shared/SEO';
import { ArtistLinks } from '@/components/shared/ArtistLinks';
import { getTrackCover, formatArtists, formatDisplayTitle, formatDuration } from '@/lib/utils';
import { useDebounce } from 'use-debounce';
import { useQuery } from '@tanstack/react-query';
import * as Slider from '@radix-ui/react-slider';
import api from '@/lib/api';
import notify from '@/lib/notify';
import { FONT, SURFACE, FIELD, spring, softSpring, press, Segmented } from '@/components/together/kit';
import {
  Play, Pause, SkipForward, SkipBack, Share2, Users, MessageSquare, ListMusic, Crown,
  Volume1, Volume2, VolumeX, Send, X, LogOut, Search, Plus, Check, RefreshCw, WifiOff,
  ChevronUp, ChevronDown, UserX, MoreHorizontal, ChevronLeft, ArrowDown,
} from 'lucide-react';

/* ───────────────────────── constants & helpers ───────────────────────── */

const REACTION_EMOJIS = ['❤️', '🔥', '👏', '😭', '💃', '🎧'];
const CHAT_MAX = 200;
const CHAT_COOLDOWN_MS = 700;
const REACTION_COOLDOWN_MS = 350;
const MAX_VISIBLE_REACTIONS = 24; // keeps 50+ listener rooms smooth
const PLACEHOLDER = '/logo.png';

type Tab = 'queue' | 'chat' | 'people';

/** Optional server features: call them if the client implements them, tell the user if not. */
const clientHas = (name: string) => typeof (togetherClient as any)?.[name] === 'function';
const clientCall = (name: string, ...args: any[]) => {
  const fn = (togetherClient as any)?.[name];
  if (typeof fn === 'function') {
    fn.apply(togetherClient, args);
    return true;
  }
  notify('This action isn’t available yet', 'info');
  return false;
};

/** Only allow http(s)/relative/data-image avatar URLs. */
const safeSrc = (src?: string | null) =>
  src && /^(https?:\/\/|\/|data:image\/)/i.test(src) ? src : undefined;

const initials = (name?: string) => (name?.trim()[0] || '?').toUpperCase();

function Avatar({ name, src, size = 32 }: { name?: string; src?: string | null; size?: number }) {
  const url = safeSrc(src);
  const [hasError, setHasError] = useState(false);
  return (
    <span
      className="inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#3a3a3c] font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {url && !hasError ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setHasError(true)}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}

/* ───────────────────────── page ───────────────────────── */

export default function TogetherRoomPage() {
  const params = useParams() as any;
  const router = useRouter();
  const roomCode = String(params?.code || '').toUpperCase();

  const room = useTogetherStore((s) => s.room);
  const isConnected = useTogetherStore((s) => s.isConnected);
  const selfRole = useTogetherStore((s) => s.selfRole);
  const selfId = useTogetherStore((s) => s.selfId);
  const driftMs = useTogetherStore((s) => s.driftMs);
  const latencyMs = useTogetherStore((s) => s.latencyMs);
  const reactions = useTogetherStore((s) => s.reactions);
  const needsTapToPlay = useTogetherStore((s) => s.needsTapToPlay);
  const setNeedsTapToPlay = useTogetherStore((s) => s.setNeedsTapToPlay);
  const removeReaction = useTogetherStore((s) => s.removeReaction);

  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const setVolume = usePlayerStore((s) => s.setVolume);

  const [activeTab, setActiveTab] = useState<Tab>('queue');
  const [chatInput, setChatInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery] = useDebounce(searchQuery, 350);
  const [peopleFilter, setPeopleFilter] = useState('');
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [seenChatCount, setSeenChatCount] = useState(0);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [showSync, setShowSync] = useState(false);
  const [lastVolume, setLastVolume] = useState(0.8);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const lastChatAt = useRef(0);
  const lastReactAt = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  /* ── connection lifecycle ── */
  useEffect(() => {
    if (!roomCode) return;
    let cancelled = false;

    const connect = async () => {
      let ticket: string | null = null;
      try { ticket = sessionStorage.getItem(`zenify_ticket_${roomCode}`); } catch { /* blocked */ }

      if (!ticket) {
        try {
          const guestId = (() => { try { return sessionStorage.getItem('zenify_guest_id'); } catch { return null; } })();
          const res = await api.post(`/together/rooms/${roomCode}/join`, { guestId });
          ticket = res.data?.ticket;
        } catch (err: any) {
          if (cancelled) return;
          notify(err?.response?.data?.message || 'Couldn’t join this session', 'error');
          routerRef.current.replace('/together');
          return;
        }
      }
      if (!cancelled && ticket) togetherClient.connect(roomCode, ticket);
    };

    connect();
    return () => {
      cancelled = true;
      togetherClient.disconnect();
    };
  }, [roomCode]);

  /* ── derived state ── */
  const members: any[] = room?.members || [];
  const hostMember = members.find((m) => m.role === 'host');
  const isHost = selfRole === 'host' || (!!selfId && hostMember?.userId === selfId);
  const settings: any = (room as any)?.settings || {};
  const maxListeners: number | undefined = (room as any)?.maxListeners ?? settings.maxListeners;
  const canControl = isHost || room?.mode === 'collab';
  const canQueue = isHost || settings.guestCanQueue !== false;
  const canChat = isHost || settings.guestCanChat !== false;
  const canReact = isHost || settings.guestCanReact !== false;
  const roomName: string = (room as any)?.name || `Session ${roomCode}`;
  const trackToDisplay = room?.player?.track || currentTrack;
  const cover = trackToDisplay ? getTrackCover(trackToDisplay) : PLACEHOLDER;
  const queue = room?.queue || [];
  const chat = room?.chat || [];

  const sortedMembers = useMemo(() => {
    const q = peopleFilter.trim().toLowerCase();
    return [...members]
      .filter((m) => !q || m.username?.toLowerCase().includes(q))
      .sort((a, b) => (a.role === 'host' ? -1 : b.role === 'host' ? 1 : (a.username || '').localeCompare(b.username || '')));
  }, [members, peopleFilter]);

  const displayDuration = duration || trackToDisplay?.duration || 0;
  const displayTime = isScrubbing ? scrubValue : currentTime;
  const remaining = Math.max(0, displayDuration - displayTime);
  const unread = activeTab === 'chat' ? 0 : Math.max(0, chat.length - seenChatCount);
  const syncState = !isConnected ? 'offline' : Math.abs(driftMs) < 100 ? 'good' : 'drift';

  /* ── chat scroll behaviour: only follow if the reader is at the bottom ── */
  useEffect(() => {
    if (activeTab !== 'chat') return;
    setSeenChatCount((prev) => (prev !== chat.length ? chat.length : prev));
    const el = chatScrollRef.current;
    if (el && stickToBottom) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [chat.length, activeTab, stickToBottom]);

  const onChatScroll = () => {
    const el = chatScrollRef.current;
    if (!el) return;
    setStickToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  /* ── catalog search for queue ── */
  const { data: searchResults, isLoading: isSearching, isError: searchFailed } = useQuery({
    queryKey: ['together-queue-search', debouncedQuery],
    queryFn: async () => {
      const q = debouncedQuery.trim();
      if (!q) return [];
      const res = await api.get('search', { params: { q, limit: 12 } });
      return res.data?.tracks || [];
    },
    enabled: !!debouncedQuery.trim(),
    staleTime: 60_000,
  });

  /* ── actions ── */
  const handleShare = async () => {
    const url = `${window.location.origin}/j/${roomCode}`;
    try {
      if (navigator.share && /Mobi|Android|iPad/i.test(navigator.userAgent)) {
        await navigator.share({ title: roomName, text: 'Listen with me on Zenify', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      notify('Invite link copied', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch { /* user dismissed share sheet */ }
  };

  const leaveRoom = () => {
    togetherClient.disconnect();
    router.push('/together');
  };

  const sendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || !canChat) return;
    const now = Date.now();
    if (now - lastChatAt.current < CHAT_COOLDOWN_MS) {
      notify('You’re sending messages too fast', 'info');
      return;
    }
    lastChatAt.current = now;
    togetherClient.sendChatMessage(text.slice(0, CHAT_MAX));
    setChatInput('');
    setStickToBottom(true);
  };

  const sendReaction = (emoji: string) => {
    if (!canReact) return;
    const now = Date.now();
    if (now - lastReactAt.current < REACTION_COOLDOWN_MS) return;
    lastReactAt.current = now;
    if (navigator.vibrate) navigator.vibrate(10);
    togetherClient.sendReaction(emoji);
  };

  const tapToSync = () => {
    const audio: HTMLAudioElement | null = (window as any)._zenifyAudio || document.querySelector('audio');
    audio?.play().catch(() => {});
    setNeedsTapToPlay(false);
  };

  const togglePlay = useCallback(() => {
    if (!canControl) return;
    if (isPlaying) togetherClient.pause();
    else if (trackToDisplay) togetherClient.play(trackToDisplay);
    else if (queue[0]) {
      togetherClient.play(queue[0].track, 0);
      togetherClient.removeQueue(queue[0].id);
    }
  }, [canControl, isPlaying, trackToDisplay, queue]);

  const addToQueue = (track: any) => {
    if (!canQueue) return;
    togetherClient.addQueue(track);
    notify(`Added “${track.title}”`, 'success');
    setSearchQuery('');
  };

  const playNow = (item: any) => {
    togetherClient.play(item.track, 0);
    togetherClient.removeQueue(item.id);
  };

  const toggleMute = () => {
    if (volume > 0) { setLastVolume(volume); setVolume(0); }
    else setVolume(lastVolume || 0.8);
  };

  const resync = () => {
    if (clientHas('requestSync')) clientCall('requestSync');
    else {
      togetherClient.disconnect();
      setTimeout(() => {
        try {
          const t = sessionStorage.getItem(`zenify_ticket_${roomCode}`);
          if (t) togetherClient.connect(roomCode, t);
        } catch { /* blocked */ }
      }, 250);
    }
    notify('Resyncing…', 'info');
    setShowSync(false);
  };

  /* ── keyboard shortcuts (Space, ←/→ seek, M mute, / search) ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t?.closest('input, textarea, [contenteditable="true"], [role="slider"]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'ArrowRight' && canControl) togetherClient.seek(Math.min(displayDuration, currentTime + 5));
      else if (e.key === 'ArrowLeft' && canControl) togetherClient.seek(Math.max(0, currentTime - 5));
      else if (e.key.toLowerCase() === 'm') toggleMute();
      else if (e.key === '/') { e.preventDefault(); setActiveTab('queue'); setTimeout(() => searchInputRef.current?.focus(), 50); }
      else if (e.key === 'Escape') { setMenuFor(null); setShowSync(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canControl, displayDuration, currentTime, togglePlay]);

  /* ── lock screen / headset controls ── */
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !trackToDisplay) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: formatDisplayTitle(trackToDisplay.title),
        artist: formatArtists((trackToDisplay as any).artists || (trackToDisplay as any).artist),
        album: roomName,
        artwork: [{ src: cover, sizes: '512x512' }],
      });
      navigator.mediaSession.setActionHandler('play', canControl ? togglePlay : null);
      navigator.mediaSession.setActionHandler('pause', canControl ? togglePlay : null);
      navigator.mediaSession.setActionHandler('nexttrack', canControl ? () => togetherClient.skipNext() : null);
    } catch { /* unsupported */ }
  }, [trackToDisplay, cover, roomName, canControl, togglePlay]);

  /* warn before accidentally closing the tab mid-session */
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (isConnected && members.length > 1) e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isConnected, members.length]);

  const VolIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const visibleReactions = reactions.slice(-MAX_VISIBLE_REACTIONS);
  const requestLeave = () => (members.length > 1 ? setConfirmLeave(true) : leaveRoom());

  const iconBtn = 'grid h-9 w-9 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white';

  /* ───────────── render ───────────── */
  return (
    <div
      style={{ fontFamily: FONT }}
      className="relative min-h-[100dvh] select-none overflow-hidden bg-black pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(4.5rem,env(safe-area-inset-top))] text-white antialiased sm:pt-20"
    >
      <SEO title={`${roomName} – Listen Together – Zenify`} path={`/together/${roomCode}`} />

      {/* Floating reactions */}
      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
        <AnimatePresence>
          {visibleReactions.map((r: any) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: '85vh', scale: 0.6 }}
              animate={{ opacity: 1, y: '20vh', scale: 1.2 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 2.2, ease: 'easeOut' }}
              onAnimationComplete={() => removeReaction(r.id)}
              style={{ left: `${Math.max(8, Math.min(88, r.xPercent))}%` }}
              className="absolute flex flex-col items-center"
            >
              <span className="text-4xl">{r.emoji}</span>
              <span className="mt-1 max-w-[90px] truncate rounded-full bg-[#2c2c2e] px-2 py-0.5 text-[10px] font-medium text-white/85">
                {r.username}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="mx-auto max-w-[1100px] space-y-3 px-3 sm:px-6 lg:px-8">
        {/* Connection banner */}
        <AnimatePresence>
          {!isConnected && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={softSpring}
              role="status"
              className="overflow-hidden rounded-xl bg-[#2c2c2e] text-amber-300"
            >
              <div className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium">
                <WifiOff className="h-4 w-4" /> Reconnecting to the session…
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toolbar */}
        <header className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <motion.button {...press} type="button" onClick={requestLeave} className={iconBtn} aria-label="Leave session">
              <ChevronLeft className="h-5 w-5" />
            </motion.button>
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-semibold leading-tight">{roomName}</h1>
              <p className="truncate text-[12px] leading-tight text-white/45">
                {roomCode} · {room?.mode === 'collab' ? 'Everyone controls' : 'DJ mode'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <motion.button
                {...press}
                type="button"
                onClick={() => setShowSync((v) => !v)}
                className="flex h-9 items-center gap-2 rounded-full bg-[#1c1c1e] px-3 text-[12px] font-medium text-white/80 hover:bg-[#2c2c2e]"
                aria-haspopup="dialog"
                aria-expanded={showSync}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    syncState === 'good' ? 'bg-emerald-400' : syncState === 'drift' ? 'bg-amber-400' : 'bg-rose-500'
                  }`}
                />
                <span className="hidden sm:inline">
                  {syncState === 'good' ? 'In sync' : syncState === 'drift' ? 'Adjusting' : 'Offline'}
                </span>
              </motion.button>
              <AnimatePresence>
                {showSync && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94 }}
                    transition={spring}
                    role="dialog"
                    aria-label="Sync details"
                    className="absolute right-0 top-11 z-30 w-56 origin-top-right rounded-2xl bg-[#2c2c2e] p-4 shadow-2xl"
                  >
                    <dl className="space-y-2 text-[13px]">
                      <div className="flex justify-between"><dt className="text-white/50">Latency</dt><dd className="tabular-nums">{latencyMs || 0} ms</dd></div>
                      <div className="flex justify-between"><dt className="text-white/50">Drift</dt><dd className="tabular-nums">{Math.round(driftMs || 0)} ms</dd></div>
                    </dl>
                    <motion.button
                      {...press}
                      type="button"
                      onClick={resync}
                      className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-white/10 text-[13px] font-semibold hover:bg-white/15"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Resync now
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <motion.button
              {...press}
              type="button"
              onClick={handleShare}
              className="flex h-9 items-center gap-1.5 rounded-full bg-brand px-4 text-[13px] font-semibold text-white"
            >
              {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
              {copied ? 'Copied' : 'Invite'}
            </motion.button>

            <motion.button
              {...press}
              type="button"
              onClick={requestLeave}
              className={`${iconBtn} hidden hover:!bg-rose-500/15 hover:!text-rose-300 sm:grid`}
              aria-label="Leave session"
            >
              <LogOut className="h-4 w-4" />
            </motion.button>
          </div>
        </header>

        {/* Autoplay unlock */}
        {needsTapToPlay && (
          <motion.button
            {...press}
            type="button"
            onClick={tapToSync}
            className="flex w-full items-center justify-between gap-3 rounded-2xl bg-brand p-4 text-left"
          >
            <span className="flex items-center gap-3">
              <Volume2 className="h-5 w-5 shrink-0" />
              <span>
                <span className="block text-[14px] font-semibold">Your browser muted the audio</span>
                <span className="block text-[12px] text-white/85">Tap to join the room’s sound.</span>
              </span>
            </span>
            <span className="rounded-full bg-white px-4 py-2 text-[12px] font-semibold text-brand">Tap to sync</span>
          </motion.button>
        )}

        {/* Layout: stacked (phone) → 2-col (tablet) → player + side panel (desktop) */}
        <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-4">
          {/* ───── Now playing ───── */}
          <section className={`${SURFACE} flex flex-col items-center gap-4 p-5 sm:p-6`} aria-label="Now playing">
            <motion.div
              key={cover}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: isPlaying ? 1 : 0.9 }}
              transition={softSpring}
              className="aspect-square w-full max-w-[min(100%,320px)] overflow-hidden rounded-xl bg-[#2c2c2e] shadow-[0_20px_40px_-12px_rgba(0,0,0,0.6)]"
            >
              <img
                src={cover}
                alt={trackToDisplay ? `${formatDisplayTitle(trackToDisplay.title)} cover art` : 'No track playing'}
                className="h-full w-full object-cover"
                onError={(e) => {
                  const target = e.currentTarget as HTMLImageElement;
                  if (!target.src.endsWith('/logo.png')) {
                    target.src = PLACEHOLDER;
                  }
                }}
              />
            </motion.div>

            <div className="w-full max-w-[320px] space-y-0.5 text-left">
              <div className="flex items-center justify-between gap-3">
                <h2 className="truncate text-[19px] font-semibold tracking-tight">
                  {trackToDisplay ? formatDisplayTitle(trackToDisplay.title) : 'Nothing playing'}
                </h2>
                {isPlaying && <Equalizer playing={isPlaying} />}
              </div>
              <div className="truncate text-[15px] text-white/55">
                {trackToDisplay ? (
                  <ArtistLinks track={trackToDisplay} linkClassName="hover:underline text-white/60 hover:text-white" />
                ) : canQueue ? 'Search for a song to start' : 'Waiting for the host'}
              </div>
            </div>

            {/* Scrubber */}
            <div className="w-full max-w-[320px]">
              <Slider.Root
                className="group relative flex h-5 w-full touch-none select-none items-center"
                value={[Math.min(displayTime, displayDuration || 1)]}
                max={displayDuration || 1}
                step={0.5}
                disabled={!canControl || !trackToDisplay}
                aria-label="Playback position"
                onValueChange={([v]) => { setIsScrubbing(true); setScrubValue(v); }}
                onValueCommit={([v]) => { setIsScrubbing(false); togetherClient.seek(v); }}
              >
                <Slider.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-white/20 transition-all group-hover:h-2">
                  <Slider.Range className="absolute h-full rounded-full bg-white/90" />
                </Slider.Track>
                {canControl && <Slider.Thumb className="block h-3.5 w-3.5 rounded-full bg-white shadow outline-none focus-visible:ring-2 focus-visible:ring-brand" />}
              </Slider.Root>
              <div className="mt-0.5 flex justify-between text-[11px] font-medium tabular-nums text-white/45">
                <span>{formatDuration(displayTime)}</span>
                <span>-{formatDuration(remaining)}</span>
              </div>
            </div>

            {/* Transport */}
            <div className="flex items-center justify-center gap-8">
              <motion.button
                {...press}
                type="button"
                disabled={!canControl}
                onClick={() => togetherClient.seek(0)}
                className="p-2 text-white/80 hover:text-white disabled:opacity-30"
                aria-label="Restart track"
              >
                <SkipBack className="h-7 w-7 fill-current" />
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.9 }}
                transition={spring}
                type="button"
                disabled={!canControl}
                onClick={togglePlay}
                className="grid h-16 w-16 place-items-center rounded-full bg-white text-black disabled:opacity-40"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="h-7 w-7 fill-current" /> : <Play className="ml-1 h-7 w-7 fill-current" />}
              </motion.button>
              <motion.button
                {...press}
                type="button"
                disabled={!canControl}
                onClick={() => togetherClient.skipNext()}
                className="p-2 text-white/80 hover:text-white disabled:opacity-30"
                aria-label="Next track"
              >
                <SkipForward className="h-7 w-7 fill-current" />
              </motion.button>
            </div>

            {!canControl && <p className="text-[12px] text-white/45">Only the host controls playback in this room.</p>}

            {/* Volume */}
            <div className="flex w-full max-w-[320px] items-center gap-3">
              <button type="button" onClick={toggleMute} className="p-1 text-white/60 hover:text-white" aria-label={volume === 0 ? 'Unmute' : 'Mute'}>
                <VolIcon className="h-4 w-4" />
              </button>
              <Slider.Root
                className="group relative flex h-5 flex-1 touch-none select-none items-center"
                value={[volume]}
                max={1}
                step={0.01}
                aria-label="Volume"
                onValueChange={([v]) => setVolume(v)}
              >
                <Slider.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-white/20">
                  <Slider.Range className="absolute h-full rounded-full bg-white/70" />
                </Slider.Track>
                <Slider.Thumb className="block h-3 w-3 rounded-full bg-white opacity-0 shadow outline-none transition group-hover:opacity-100 focus-visible:opacity-100" />
              </Slider.Root>
              <Volume2 className="h-4 w-4 text-white/40" aria-hidden />
            </div>

            {/* Reactions */}
            {canReact && (
              <div className="flex w-full max-w-[320px] items-center justify-between rounded-full bg-[#2c2c2e] p-1">
                {REACTION_EMOJIS.map((emoji) => (
                  <motion.button
                    key={emoji}
                    whileTap={{ scale: 1.35 }}
                    transition={spring}
                    type="button"
                    onClick={() => sendReaction(emoji)}
                    className="grid h-10 w-10 place-items-center rounded-full text-xl hover:bg-white/10"
                    aria-label={`Send ${emoji}`}
                  >
                    {emoji}
                  </motion.button>
                ))}
              </div>
            )}
          </section>

          {/* ───── Side panel: Queue / Chat / People ───── */}
          <section
            className={`${SURFACE} flex h-[520px] flex-col p-3 sm:h-[580px] md:h-[640px] lg:h-[calc(100dvh-9.5rem)] lg:min-h-[480px]`}
            aria-label="Room panel"
          >
            <div className="relative mb-3">
              <Segmented<Tab>
                id="room-tabs"
                value={activeTab}
                onChange={setActiveTab}
                options={[
                  { value: 'queue', label: `Up next${queue.length ? ` · ${queue.length}` : ''}` },
                  { value: 'chat', label: 'Chat' },
                  { value: 'people', label: `People · ${members.length}` },
                ]}
              />
              <AnimatePresence>
                {unread > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={spring}
                    className="absolute -top-1.5 left-1/2 grid h-5 min-w-5 -translate-x-1/2 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-bold"
                  >
                    {unread > 99 ? '99+' : unread}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            {/* UP NEXT */}
            {activeTab === 'queue' && (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                {canQueue ? (
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                    <input
                      ref={searchInputRef}
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search songs  ( / )"
                      aria-label="Search songs to add"
                      className={`${FIELD} h-10 pl-10 pr-9`}
                    />
                    {searchQuery && (
                      <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-white/50 hover:text-white">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="rounded-xl bg-[#2c2c2e] px-3 py-2 text-[12px] text-white/50">The host turned off adding songs.</p>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {searchQuery.trim() && canQueue ? (
                    <ul>
                      {isSearching && <li className="p-6 text-center text-[13px] text-white/50">Searching…</li>}
                      {searchFailed && <li className="p-6 text-center text-[13px] text-rose-300">Search failed. Try again.</li>}
                      {!isSearching && !searchFailed && searchResults?.length === 0 && (
                        <li className="p-6 text-center text-[13px] text-white/50">No results for “{searchQuery.trim()}”.</li>
                      )}
                      {searchResults?.map((track: any) => (
                        <li key={track.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/[0.05]">
                          <img
                            src={getTrackCover(track)}
                            alt=""
                            loading="lazy"
                            className="h-11 w-11 shrink-0 rounded-md bg-[#2c2c2e] object-cover"
                            onError={(e) => {
                              const t = e.currentTarget as HTMLImageElement;
                              if (!t.src.endsWith('/logo.png')) t.src = '/logo.png';
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-medium">{formatDisplayTitle(track.title)}</p>
                            <p className="truncate text-[12px] text-white/50">{formatArtists(track.artists || track.artist)}</p>
                          </div>
                          <motion.button
                            {...press}
                            type="button"
                            onClick={() => addToQueue(track)}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#2c2c2e] text-brand hover:bg-brand hover:text-white"
                            aria-label={`Add ${track.title} to queue`}
                          >
                            <Plus className="h-4 w-4" />
                          </motion.button>
                        </li>
                      ))}
                    </ul>
                  ) : queue.length > 0 ? (
                    <ul>
                      <AnimatePresence initial={false}>
                        {queue.map((item: any, idx: number) => (
                          <motion.li
                            key={item.id}
                            layout
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -24 }}
                            transition={spring}
                            className="group flex items-center gap-3 rounded-xl p-2 hover:bg-white/[0.05]"
                          >
                            <img
                              src={getTrackCover(item.track)}
                              alt=""
                              loading="lazy"
                              className="h-12 w-12 shrink-0 rounded-md bg-[#2c2c2e] object-cover"
                              onError={(e) => {
                                const t = e.currentTarget as HTMLImageElement;
                                if (!t.src.endsWith('/logo.png')) t.src = '/logo.png';
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[14px] font-medium">{formatDisplayTitle(item.track.title)}</p>
                              <p className="truncate text-[12px] text-white/50">
                                {formatArtists(item.track.artists || item.track.artist)} · {item.addedByName}
                              </p>
                            </div>
                            {canControl && (
                              <div className="flex shrink-0 items-center opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                                {isHost && clientHas('moveQueue') && (
                                  <>
                                    <button type="button" disabled={idx === 0} onClick={() => clientCall('moveQueue', item.id, idx - 1)} className="p-1.5 text-white/50 hover:text-white disabled:opacity-20" aria-label="Move up"><ChevronUp className="h-4 w-4" /></button>
                                    <button type="button" disabled={idx === queue.length - 1} onClick={() => clientCall('moveQueue', item.id, idx + 1)} className="p-1.5 text-white/50 hover:text-white disabled:opacity-20" aria-label="Move down"><ChevronDown className="h-4 w-4" /></button>
                                  </>
                                )}
                                <button type="button" onClick={() => playNow(item)} className="p-1.5 text-white/70 hover:text-brand" aria-label="Play now"><Play className="h-4 w-4 fill-current" /></button>
                                <button type="button" onClick={() => togetherClient.removeQueue(item.id)} className="p-1.5 text-white/50 hover:text-rose-400" aria-label="Remove from queue"><X className="h-4 w-4" /></button>
                              </div>
                            )}
                          </motion.li>
                        ))}
                      </AnimatePresence>
                    </ul>
                  ) : (
                    <div className="grid h-full place-items-center p-6 text-center">
                      <div className="space-y-2">
                        <ListMusic className="mx-auto h-9 w-9 text-white/25" />
                        <p className="text-[15px] font-medium text-white/70">Nothing queued</p>
                        <p className="mx-auto max-w-[220px] text-[13px] text-white/40">
                          {canQueue ? 'Search above to add the first song.' : 'Songs the host adds will show up here.'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CHAT */}
            {activeTab === 'chat' && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="relative min-h-0 flex-1">
                  <div
                    ref={chatScrollRef}
                    onScroll={onChatScroll}
                    role="log"
                    aria-live="polite"
                    className="h-full space-y-2 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {chat.length === 0 ? (
                      <div className="grid h-full place-items-center p-6 text-center">
                        <div className="space-y-2">
                          <MessageSquare className="mx-auto h-9 w-9 text-white/25" />
                          <p className="text-[15px] font-medium text-white/70">No messages yet</p>
                          <p className="text-[13px] text-white/40">Say hello to the room.</p>
                        </div>
                      </div>
                    ) : (
                      chat.map((msg: any) => {
                        const mine = !!selfId && msg.userId === selfId;
                        return (
                          <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 8, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={spring}
                            className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}
                          >
                            {!mine && <Avatar name={msg.username} src={msg.avatar} size={28} />}
                            <div className={`flex max-w-[80%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                              {!mine && <span className="mb-0.5 px-1 text-[11px] font-medium text-white/50">{msg.username}</span>}
                              <p
                                className={`break-words rounded-[18px] px-3.5 py-2 text-[14px] leading-snug ${
                                  mine ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md bg-[#2c2c2e] text-white/90'
                                }`}
                                title={new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              >
                                {msg.text}
                              </p>
                            </div>
                          </motion.div>
                        );
                      })
                    )}
                  </div>
                  <AnimatePresence>
                    {!stickToBottom && chat.length > 0 && (
                      <motion.button
                        initial={{ opacity: 0, y: 8, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={spring}
                        type="button"
                        onClick={() => { setStickToBottom(true); chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' }); }}
                        className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#3a3a3c] px-3 py-1.5 text-[12px] font-medium shadow-lg"
                      >
                        <ArrowDown className="h-3.5 w-3.5" /> Latest
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>

                {canChat ? (
                  <form onSubmit={sendChat} className="mt-3 flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Message"
                        maxLength={CHAT_MAX}
                        aria-label="Chat message"
                        enterKeyHint="send"
                        className={`${FIELD} h-10 rounded-full pl-4 pr-12`}
                      />
                      {chatInput.length > CHAT_MAX - 40 && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] tabular-nums text-white/40">{CHAT_MAX - chatInput.length}</span>
                      )}
                    </div>
                    <motion.button {...press} type="submit" disabled={!chatInput.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand disabled:opacity-30" aria-label="Send message">
                      <Send className="h-4 w-4" />
                    </motion.button>
                  </form>
                ) : (
                  <p className="mt-3 rounded-xl bg-[#2c2c2e] px-3 py-2 text-center text-[12px] text-white/50">Chat is turned off in this room.</p>
                )}
              </div>
            )}

            {/* PEOPLE */}
            {activeTab === 'people' && (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <div className="flex items-center justify-between px-1 text-[12px] text-white/50">
                  <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {members.length}{maxListeners ? ` of ${maxListeners}` : ''} listening</span>
                  {maxListeners && members.length >= maxListeners && <span className="font-medium text-amber-300">Room full</span>}
                </div>

                {members.length > 8 && (
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                    <input
                      type="search"
                      value={peopleFilter}
                      onChange={(e) => setPeopleFilter(e.target.value)}
                      placeholder="Find a listener"
                      aria-label="Find a listener"
                      className={`${FIELD} h-10 pl-10 pr-3`}
                    />
                  </div>
                )}

                <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {sortedMembers.length === 0 && <li className="p-6 text-center text-[13px] text-white/45">No one matches “{peopleFilter}”.</li>}
                  {sortedMembers.map((m) => {
                    const isSelf = !!selfId && m.userId === selfId;
                    const showMenu = isHost && !isSelf && m.role !== 'host' && (clientHas('kickMember') || clientHas('transferHost'));
                    return (
                      <li key={m.userId} className="relative flex items-center gap-3 rounded-xl p-2 hover:bg-white/[0.05]">
                        <Avatar name={m.username} src={m.avatar} size={36} />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate text-[14px] font-medium">
                            {m.username}{isSelf && <span className="text-white/40">(you)</span>}
                            {m.role === 'host' && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-label="Host" />}
                          </p>
                          <p className="text-[12px] text-white/40">{m.role === 'host' ? 'Host' : 'Listener'}</p>
                        </div>
                        {showMenu && (
                          <>
                            <button type="button" onClick={() => setMenuFor(menuFor === m.userId ? null : m.userId)} className="grid h-8 w-8 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white" aria-label={`Actions for ${m.username}`} aria-haspopup="menu">
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                            <AnimatePresence>
                              {menuFor === m.userId && (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.92, y: -4 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.94 }}
                                  transition={spring}
                                  role="menu"
                                  className="absolute right-2 top-11 z-20 w-48 origin-top-right overflow-hidden rounded-xl bg-[#3a3a3c] p-1 shadow-2xl"
                                >
                                  {clientHas('transferHost') && (
                                    <button role="menuitem" type="button" onClick={() => { clientCall('transferHost', m.userId); setMenuFor(null); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-brand">
                                      <Crown className="h-4 w-4" /> Make host
                                    </button>
                                  )}
                                  {clientHas('kickMember') && (
                                    <button role="menuitem" type="button" onClick={() => { clientCall('kickMember', m.userId); setMenuFor(null); notify(`Removed ${m.username}`, 'info'); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-rose-300 hover:bg-rose-500 hover:text-white">
                                      <UserX className="h-4 w-4" /> Remove from session
                                    </button>
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Leave confirmation (iOS alert style) */}
      <AnimatePresence>
        {confirmLeave && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4"
            onClick={() => setConfirmLeave(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={spring}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="leave-title"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[290px] rounded-[20px] bg-[#2c2c2e] p-5 text-center"
            >
              <h3 id="leave-title" className="text-[16px] font-semibold">Leave this session?</h3>
              <p className="mt-1.5 text-[13px] text-white/55">
                {isHost && room?.mode === 'dj'
                  ? 'You’re the DJ. Playback may stop for everyone.'
                  : 'You can rejoin anytime with the code.'}
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <motion.button {...press} type="button" autoFocus onClick={() => setConfirmLeave(false)} className="h-10 rounded-xl bg-white/10 text-[14px] font-semibold hover:bg-white/15">Stay</motion.button>
                <motion.button {...press} type="button" onClick={leaveRoom} className="h-10 rounded-xl bg-rose-500 text-[14px] font-semibold hover:bg-rose-400">Leave</motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}