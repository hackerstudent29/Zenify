"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useTogetherStore } from '@/store/togetherStore';
import { togetherClient } from '@/services/together-client';
import { usePlayerStore } from '@/store/player';
import { GlassCard } from '@/components/ui/GlassCard';
import { AvatarStack } from '@/components/ui/AvatarStack';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Equalizer } from '@/components/ui/Equalizer';
import { SEO } from '@/components/shared/SEO';
import { ArtistLinks } from '@/components/shared/ArtistLinks';
import { getTrackCover, formatArtists, formatDisplayTitle, formatDuration } from '@/lib/utils';
import { useDebounce } from 'use-debounce';
import { useQuery } from '@tanstack/react-query';
import * as Slider from '@radix-ui/react-slider';
import api from '@/lib/api';
import notify from '@/lib/notify';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Share2,
  Copy,
  Users,
  MessageSquare,
  ListMusic,
  Radio,
  Crown,
  Volume2,
  VolumeX,
  Send,
  X,
  Disc3,
  LogOut,
  Search,
  Plus,
  Check,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

const REACTION_EMOJIS = ['❤️', '🔥', '👏', '😭', '💃', '🎧'];

export default function TogetherRoomPage() {
  const params = useParams() as any;
  const router = useRouter();
  const roomCode = String(params?.code || '').toUpperCase();

  const {
    room,
    isConnected,
    selfRole,
    clockOffsetMs,
    driftMs,
    latencyMs,
    reactions,
    needsTapToPlay,
    setNeedsTapToPlay,
    removeReaction,
  } = useTogetherStore();

  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const setVolume = usePlayerStore((s) => s.setVolume);

  const [activeTab, setActiveTab] = useState<'queue' | 'chat'>('queue');
  const [chatInput, setChatInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery] = useDebounce(searchQuery, 350);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);

  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Connect on mount using ticket or join room
  useEffect(() => {
    if (!roomCode) return;

    const connectToRoom = async () => {
      let ticket = sessionStorage.getItem(`zenify_ticket_${roomCode}`);
      if (!ticket) {
        try {
          const guestId = sessionStorage.getItem('zenify_guest_id');
          const res = await api.post(`/together/rooms/${roomCode}/join`, {
            guestId,
          });
          ticket = res.data?.ticket;
        } catch (err: any) {
          notify(err.response?.data?.message || 'Could not join session', 'error');
          router.push('/together');
          return;
        }
      }

      if (ticket) {
        togetherClient.connect(roomCode, ticket);
      }
    };

    connectToRoom();

    return () => {
      togetherClient.disconnect();
    };
  }, [roomCode, router]);

  // Auto-scroll chat on new message
  useEffect(() => {
    if (activeTab === 'chat') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [room?.chat, activeTab]);

  // Live Track Search for Queue
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['together-queue-search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery.trim()) return [];
      const res = await api.get('search', { params: { q: debouncedQuery.trim(), limit: 12 } });
      return res.data?.tracks || [];
    },
    enabled: !!debouncedQuery.trim(),
  });

  const handleCopyLink = () => {
    const inviteUrl = `${window.location.origin}/j/${roomCode}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    notify('Invite link copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeaveRoom = () => {
    togetherClient.disconnect();
    notify('Left session', 'info');
    router.push('/together');
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    togetherClient.sendChatMessage(chatInput.trim());
    setChatInput('');
  };

  const handleReactionClick = (emoji: string) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(12);
    togetherClient.sendReaction(emoji);
  };

  const handleTapToSync = () => {
    const audio = (window as any)._zenifyAudio || document.querySelector('audio');
    if (audio) {
      audio.play().catch(() => {});
    }
    setNeedsTapToPlay(false);
  };

  const handleAddTrackToQueue = (track: any) => {
    togetherClient.addQueue(track);
    notify(`Queued "${track.title}"`, 'success');
    setSearchQuery('');
  };

  const isHost = selfRole === 'host' || room?.hostId === room?.members.find((m) => m.role === 'host')?.userId;
  const canControl = isHost || room?.mode === 'collab';
  const trackToDisplay = room?.player?.track || currentTrack;
  const members = room?.members || [];

  const displayTime = isScrubbing ? scrubValue : currentTime;
  const displayDuration = duration || trackToDisplay?.duration || 0;
  const remainingTime = Math.max(0, displayDuration - displayTime);

  return (
    <div className="min-h-screen pt-24 sm:pt-28 pb-32 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 relative overflow-hidden select-none">
      <SEO title={`Session ${roomCode} – Listen Together – Zenify`} path={`/together/${roomCode}`} />

      {/* Floating Reactions Overlay */}
      <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
        <AnimatePresence>
          {reactions.map((r) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: '85vh', scale: 0.6 }}
              animate={{ opacity: 1, y: '18vh', scale: 1.3 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 2.2, ease: 'easeOut' }}
              onAnimationComplete={() => removeReaction(r.id)}
              style={{ left: `${Math.max(10, Math.min(85, r.xPercent))}%` }}
              className="absolute text-4xl select-none drop-shadow-2xl flex flex-col items-center pointer-events-none"
            >
              <span className="filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">{r.emoji}</span>
              <span className="block mt-1 text-[9px] text-white/80 font-bold bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-full text-center border border-white/10">
                {r.username}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4 rounded-2xl bg-zinc-900/60 backdrop-blur-xl border border-white/10 shadow-lg">
        {/* Left: Leave Button & Room Code */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleLeaveRoom}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.08] hover:bg-rose-500/20 hover:text-rose-400 text-white/80 text-[12px] font-semibold transition-all active:scale-95 cursor-pointer border border-white/10"
            title="Leave Session"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Leave</span>
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-brand/15 border border-brand/30 text-brand">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span className="font-mono font-bold tracking-widest text-[13px] sm:text-[14px]">{roomCode}</span>
          </div>

          <button
            type="button"
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-[12px] font-semibold transition-all active:scale-95 cursor-pointer border border-white/10"
            title="Share Room Link"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Share'}</span>
          </button>
        </div>

        {/* Right: Mode & NTP Status */}
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/10 text-[11px] font-bold uppercase tracking-wider text-white/70">
            {room?.mode === 'collab' ? 'Collaborative' : 'DJ Mode'}
          </span>

          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-white/[0.06] border border-white/10 text-[11px] font-medium text-white/70">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected
                  ? Math.abs(driftMs) < 100
                    ? 'bg-emerald-400 shadow-sm shadow-emerald-400/80 animate-pulse'
                    : 'bg-amber-400'
                  : 'bg-rose-500'
              }`}
            />
            <span className="hidden sm:inline">{isConnected ? 'In Sync' : 'Connecting...'}</span>
            <span className="text-white/30 hidden sm:inline">|</span>
            <span className="font-mono text-white/50">{latencyMs || 0}ms</span>
          </div>
        </div>
      </div>

      {/* Autoplay Unlock Banner (when browser blocks auto sound) */}
      {needsTapToPlay && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-2xl bg-gradient-to-r from-brand via-rose-600 to-brand text-white flex items-center justify-between shadow-xl cursor-pointer border border-white/20"
          onClick={handleTapToSync}
        >
          <div className="flex items-center gap-3">
            <Volume2 className="w-5 h-5 animate-bounce" />
            <div>
              <div className="font-bold text-[14px]">Audio is muted by your browser</div>
              <div className="text-[12px] text-white/85">Tap here to sync audio with the room immediately.</div>
            </div>
          </div>
          <button
            type="button"
            className="px-4 py-2 rounded-xl bg-white text-brand font-bold text-[12px] uppercase tracking-wider active:scale-95 shadow"
          >
            Tap to Sync
          </button>
        </motion.div>
      )}

      {/* Main Grid: Player Stage on Left (7 cols), Queue & Chat on Right (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Player Stage */}
        <GlassCard className="lg:col-span-7 p-6 sm:p-8 flex flex-col items-center text-center space-y-6 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
          {/* Ambient Glow */}
          <div className="absolute -top-32 inset-x-0 h-64 bg-brand/20 blur-[90px] pointer-events-none" />

          {/* Vinyl & Artwork Showcase */}
          <div className="relative w-44 h-44 sm:w-56 sm:h-56 md:w-60 md:h-60 mt-2 shrink-0">
            {/* Spinning Vinyl behind cover */}
            <div
              className={`absolute -right-4 inset-y-2 w-full rounded-full bg-black/90 border border-white/20 shadow-2xl flex items-center justify-center transition-all duration-700 ${
                isPlaying ? 'rotate-180 scale-100 opacity-95' : 'scale-90 opacity-40'
              }`}
            >
              <div className="w-16 h-16 rounded-full bg-zinc-950 border border-brand/50 flex items-center justify-center">
                <Disc3 className="w-6 h-6 text-brand animate-spin" style={{ animationDuration: '4s' }} />
              </div>
            </div>

            {/* Front Cover Art */}
            <div className="relative z-10 w-full h-full rounded-2xl overflow-hidden shadow-2xl border border-white/15 bg-zinc-900">
              <img
                src={trackToDisplay ? getTrackCover(trackToDisplay) : '/images/placeholder.png'}
                alt="Track Cover"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Track Info */}
          <div className="space-y-1.5 max-w-md w-full px-2">
            <h2 className="text-xl sm:text-2xl font-bold font-oswald uppercase text-white truncate tracking-wide">
              {trackToDisplay ? formatDisplayTitle(trackToDisplay.title) : 'Waiting for track...'}
            </h2>
            <div className="text-white/60 font-libre text-[13px] sm:text-[14px] truncate">
              {trackToDisplay ? (
                <ArtistLinks track={trackToDisplay} linkClassName="hover:underline text-white/70 hover:text-white" />
              ) : (
                'Select a song from the queue to start playing'
              )}
            </div>
          </div>

          {/* Equalizer Indicator */}
          {isPlaying && (
            <div className="h-5 flex items-center justify-center">
              <Equalizer playing={isPlaying} />
            </div>
          )}

          {/* Scrubber / Progress Bar */}
          <div className="w-full max-w-md space-y-1 pt-1">
            <Slider.Root
              className="relative flex items-center select-none touch-none w-full h-5 cursor-pointer"
              value={[Math.min(displayTime, displayDuration || 1)]}
              max={displayDuration || 1}
              step={0.5}
              disabled={!canControl}
              onValueChange={([val]) => {
                if (!canControl) return;
                setIsScrubbing(true);
                setScrubValue(val);
              }}
              onValueCommit={([val]) => {
                if (!canControl) return;
                setIsScrubbing(false);
                togetherClient.seek(val);
              }}
            >
              <Slider.Track className="relative grow rounded-full overflow-hidden h-[5px] bg-white/20">
                <Slider.Range className="absolute h-full rounded-full bg-brand" />
              </Slider.Track>
              {canControl && (
                <Slider.Thumb className="block w-3 h-3 rounded-full bg-white shadow-md outline-none hover:scale-125 transition-transform" />
              )}
            </Slider.Root>

            <div className="flex items-center justify-between text-[11px] font-mono text-white/50 px-0.5">
              <span>{formatDuration(displayTime)}</span>
              <span>-{formatDuration(remainingTime)}</span>
            </div>
          </div>

          {/* Playback Controls (Host / Collab) */}
          <div className="flex items-center justify-center gap-5 pt-1">
            {canControl && (
              <button
                type="button"
                onClick={() => togetherClient.seek(0)}
                className="p-2 text-white/70 hover:text-white active:scale-90 transition-transform cursor-pointer"
                title="Rewind to start"
              >
                <SkipBack className="w-5 h-5 fill-current" />
              </button>
            )}

            {canControl && (
              <button
                type="button"
                onClick={() => {
                  if (isPlaying) {
                    togetherClient.pause();
                  } else if (trackToDisplay) {
                    togetherClient.play(trackToDisplay);
                  }
                }}
                className="w-14 h-14 rounded-full bg-white hover:bg-white/90 text-black flex items-center justify-center shadow-2xl active:scale-95 transition-all cursor-pointer"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
              </button>
            )}

            {canControl && (
              <button
                type="button"
                onClick={() => togetherClient.skipNext()}
                className="p-2 text-white/70 hover:text-white active:scale-90 transition-transform cursor-pointer"
                title="Skip to next queued track"
              >
                <SkipForward className="w-5 h-5 fill-current" />
              </button>
            )}
          </div>

          {/* Reaction Bar */}
          <div className="pt-3 border-t border-white/10 w-full flex items-center justify-between sm:justify-center gap-1.5 sm:gap-3">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleReactionClick(emoji)}
                className="w-10 h-10 rounded-xl bg-white/[0.06] hover:bg-white/[0.14] active:scale-125 transition-all flex items-center justify-center text-xl cursor-pointer border border-white/5"
                title={`Send ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Connected Listeners Footer */}
          <div className="w-full pt-2 flex items-center justify-between text-left border-t border-white/5">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-brand" />
              <span className="text-[12px] font-bold text-white/80 uppercase tracking-wider">
                {members.length} {members.length === 1 ? 'Listener' : 'Listeners'}
              </span>
            </div>
            <AvatarStack
              avatars={members.map((m) => ({
                id: m.userId,
                name: m.role === 'host' ? `${m.username} (Host)` : m.username,
                src: m.avatar,
              }))}
              max={6}
            />
          </div>
        </GlassCard>

        {/* Right Column: Shared Queue & Live In-Room Chat */}
        <GlassCard className="lg:col-span-5 p-5 flex flex-col h-[520px] sm:h-[580px] lg:h-[620px] rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
          {/* Segmented Control Tabs */}
          <div className="mb-3.5">
            <SegmentedControl
              id="together-room-tabs"
              options={[
                { value: 'queue', label: `Queue (${room?.queue?.length || 0})` },
                { value: 'chat', label: `Live Chat (${room?.chat?.length || 0})` },
              ]}
              value={activeTab}
              onChange={(val) => setActiveTab(val as 'queue' | 'chat')}
            />
          </div>

          {/* TAB 1: SHARED QUEUE */}
          {activeTab === 'queue' && (
            <div className="flex-1 flex flex-col min-h-0 space-y-3">
              {/* In-Queue Live Song Search & Add */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search song to add to queue..."
                  className="w-full h-10 pl-9 pr-8 rounded-xl bg-white/[0.06] border border-white/10 text-white text-[13px] placeholder:text-white/35 focus:outline-none focus:border-brand transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Search Results Dropdown Overlay */}
              {searchQuery.trim() && (
                <div className="max-h-56 overflow-y-auto rounded-xl bg-zinc-900 border border-white/15 p-2 space-y-1 shadow-2xl z-20">
                  {isSearching ? (
                    <div className="p-3 text-center text-xs text-white/50">Searching music catalog...</div>
                  ) : searchResults && searchResults.length > 0 ? (
                    searchResults.map((track: any) => (
                      <div
                        key={track.id}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.08] transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <img
                            src={getTrackCover(track)}
                            alt="Cover"
                            className="w-8 h-8 rounded-md object-cover bg-zinc-800 shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="text-[12px] font-semibold text-white truncate">
                              {formatDisplayTitle(track.title)}
                            </div>
                            <div className="text-[10px] text-white/50 truncate">
                              {formatArtists(track.artists || track.artist)}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAddTrackToQueue(track)}
                          className="px-2.5 py-1 rounded-lg bg-brand/20 hover:bg-brand text-brand hover:text-white text-[11px] font-bold flex items-center gap-1 transition-all shrink-0 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Queue</span>
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 text-center text-xs text-white/50">No matching songs found.</div>
                  )}
                </div>
              )}

              {/* Shared Queue List */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar">
                {room?.queue && room.queue.length > 0 ? (
                  room.queue.map((item, idx) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition-colors border border-white/5 group"
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <span className="text-[11px] font-mono text-white/40 w-4 shrink-0">{idx + 1}</span>
                        <img
                          src={getTrackCover(item.track)}
                          alt="Art"
                          className="w-10 h-10 rounded-lg object-cover bg-zinc-800 shrink-0 border border-white/10"
                        />
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-white truncate">
                            {formatDisplayTitle(item.track.title)}
                          </div>
                          <div className="text-[11px] text-white/50 truncate">
                            Added by <span className="text-white/70">{item.addedByName}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {canControl && (
                          <button
                            type="button"
                            onClick={() => {
                              togetherClient.play(item.track, 0);
                              togetherClient.removeQueue(item.id);
                            }}
                            className="p-1.5 rounded-lg text-white/60 hover:text-brand hover:bg-brand/10 transition-colors"
                            title="Play now"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                          </button>
                        )}

                        {canControl && (
                          <button
                            type="button"
                            onClick={() => togetherClient.removeQueue(item.id)}
                            className="p-1.5 rounded-lg text-white/40 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title="Remove from queue"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-white/40 space-y-2.5">
                    <ListMusic className="w-10 h-10 opacity-30 text-brand" />
                    <p className="text-[13px] font-medium text-white/60">The shared queue is empty.</p>
                    <p className="text-[11px] text-white/40 max-w-xs">
                      Search any track above to queue up your circle's playlist.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: LIVE IN-ROOM CHAT */}
          {activeTab === 'chat' && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 no-scrollbar">
                {room?.chat && room.chat.length > 0 ? (
                  room.chat.map((msg) => (
                    <div key={msg.id} className="flex items-start gap-2.5 text-[13px]">
                      <div className="w-7 h-7 rounded-full bg-brand/20 border border-brand/40 flex items-center justify-center shrink-0 text-[11px] font-bold text-white uppercase overflow-hidden">
                        {msg.avatar ? (
                          <img src={msg.avatar} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                          msg.username[0]
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white/90 text-[12px]">{msg.username}</span>
                          <span className="text-[10px] text-white/40">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-white/75 leading-relaxed break-words mt-0.5 bg-white/[0.04] p-2 rounded-xl rounded-tl-none border border-white/5 inline-block max-w-full">
                          {msg.text}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-white/40 space-y-2">
                    <MessageSquare className="w-10 h-10 opacity-30 text-brand" />
                    <p className="text-[13px] text-white/60 font-medium">Say hello to the room!</p>
                    <p className="text-[11px] text-white/40">Send live reactions and messages while listening.</p>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Chat Input Bar */}
              <form onSubmit={handleSendChat} className="pt-3 border-t border-white/10 flex items-center gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Say something to the room..."
                  maxLength={200}
                  className="flex-1 h-10 px-3.5 rounded-xl bg-white/[0.06] border border-white/10 text-white text-[13px] placeholder:text-white/30 focus:outline-none focus:border-brand transition-colors"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center disabled:opacity-40 active:scale-95 transition-all cursor-pointer shrink-0 shadow-lg"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
