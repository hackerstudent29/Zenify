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
import { getTrackCover, formatArtists, formatDisplayTitle } from '@/lib/utils';
import api from '@/lib/api';
import notify from '@/lib/notify';
import {
  Play,
  Pause,
  SkipForward,
  Share2,
  Copy,
  Users,
  MessageSquare,
  ListMusic,
  Radio,
  Crown,
  Volume2,
  Send,
  X,
  Disc3,
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

  const [activeTab, setActiveTab] = useState<'queue' | 'chat'>('queue');
  const [chatInput, setChatInput] = useState('');
  const [copied, setCopied] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Connect on mount using ticket or fetch a new ticket
  useEffect(() => {
    if (!roomCode) return;

    const connectToRoom = async () => {
      let ticket = sessionStorage.getItem(`zenify_ticket_${roomCode}`);
      if (!ticket) {
        try {
          const res = await api.post(`/together/rooms/${roomCode}/join`);
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

  // Auto-scroll chat
  useEffect(() => {
    if (activeTab === 'chat') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [room?.chat, activeTab]);

  const handleCopyLink = () => {
    const inviteUrl = `${window.location.origin}/j/${roomCode}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    notify('Invite link copied!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    togetherClient.sendChatMessage(chatInput.trim());
    setChatInput('');
  };

  const handleReactionClick = (emoji: string) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
    togetherClient.sendReaction(emoji);
  };

  const handleTapToSync = () => {
    const audio = (window as any)._zenifyAudio || document.querySelector('audio');
    if (audio) {
      audio.play().catch(() => {});
    }
    setNeedsTapToPlay(false);
  };

  const isHost = selfRole === 'host' || room?.hostId === room?.members.find((m) => m.role === 'host')?.userId;
  const canControl = isHost || room?.mode === 'collab';

  const trackToDisplay = room?.player?.track || currentTrack;
  const members = room?.members || [];

  return (
    <div className="min-h-screen px-4 sm:px-8 py-6 max-w-5xl mx-auto space-y-6 relative overflow-hidden">
      <SEO title={`Session ${roomCode} – Listen Together – Zenify`} path={`/together/${roomCode}`} />

      {/* Floating Reactions Overlay */}
      <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
        <AnimatePresence>
          {reactions.map((r) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: '80vh', scale: 0.6 }}
              animate={{ opacity: 1, y: '20vh', scale: 1.4 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 2.4, ease: 'easeOut' }}
              onAnimationComplete={() => removeReaction(r.id)}
              style={{ left: `${r.xPercent}%` }}
              className="absolute text-4xl select-none drop-shadow-lg"
            >
              <span>{r.emoji}</span>
              <span className="block text-[10px] text-white/70 font-bold bg-black/60 px-1.5 py-0.5 rounded-full text-center">
                {r.username}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand/15 border border-brand/30 text-brand">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span className="font-mono font-bold tracking-widest text-[14px]">{roomCode}</span>
          </div>

          <button
            type="button"
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-white text-[12px] font-semibold transition-all active:scale-95 cursor-pointer"
          >
            {copied ? <Copy className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Share'}</span>
          </button>
        </div>

        {/* Sync Status Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-[11px] font-medium text-white/70">
          <span
            className={`w-2 h-2 rounded-full ${
              Math.abs(driftMs) < 100 ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-amber-400'
            }`}
          />
          <span>{isConnected ? 'In Sync' : 'Connecting...'}</span>
          <span className="text-white/40">|</span>
          <span className="font-mono text-white/50">{latencyMs}ms RTT</span>
        </div>
      </div>

      {/* Autoplay Unlock Pill (if browser blocked sound) */}
      {needsTapToPlay && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-2xl bg-gradient-to-r from-brand to-rose-600 text-white flex items-center justify-between shadow-xl cursor-pointer"
          onClick={handleTapToSync}
        >
          <div className="flex items-center gap-3">
            <Volume2 className="w-5 h-5 animate-bounce" />
            <div>
              <div className="font-bold text-[14px]">Audio is muted by your browser</div>
              <div className="text-[12px] text-white/80">Tap here to sync with the room's stream.</div>
            </div>
          </div>
          <button
            type="button"
            className="px-4 py-2 rounded-full bg-white text-brand font-bold text-[13px] active:scale-95 shadow"
          >
            Tap to Sync
          </button>
        </motion.div>
      )}

      {/* Main Grid: Track & Stage on Left, Shared Controls/Tabs on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Stage & Artwork */}
        <GlassCard className="lg:col-span-7 p-6 sm:p-8 flex flex-col items-center text-center space-y-6">
          <div className="relative w-56 h-56 sm:w-64 sm:h-64 mt-2">
            {/* Spinning Vinyl behind cover */}
            <div
              className={`absolute -right-4 inset-y-2 w-full rounded-full bg-black/90 border border-white/20 shadow-2xl flex items-center justify-center transition-transform duration-1000 ${
                isPlaying ? 'rotate-180 scale-100' : 'scale-90 opacity-60'
              }`}
            >
              <div className="w-16 h-16 rounded-full bg-brand/20 border border-brand/40 flex items-center justify-center">
                <Disc3 className="w-6 h-6 text-brand" />
              </div>
            </div>

            {/* Front Cover Art */}
            <div className="relative z-10 w-full h-full rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-zinc-900">
              <img
                src={trackToDisplay ? getTrackCover(trackToDisplay) : '/images/placeholder.png'}
                alt="Track Cover"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Track Info */}
          <div className="space-y-1 max-w-md">
            <h2 className="text-xl sm:text-2xl font-bold text-white truncate">
              {trackToDisplay ? formatDisplayTitle(trackToDisplay.title) : 'Waiting for music...'}
            </h2>
            <p className="text-white/60 text-[14px] truncate">
              {trackToDisplay ? formatArtists(trackToDisplay.artists || trackToDisplay.artist) : 'The DJ has not started a track yet'}
            </p>
          </div>

          {/* Equalizer Indicator */}
          {isPlaying && (
            <div className="h-6 flex items-center justify-center">
              <Equalizer playing={isPlaying} />
            </div>
          )}

          {/* Playback Controls (DJ or Collab) */}
          {canControl && (
            <div className="flex items-center gap-4 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (isPlaying) {
                    togetherClient.pause();
                  } else if (trackToDisplay) {
                    togetherClient.play(trackToDisplay);
                  }
                }}
                className="w-14 h-14 rounded-full bg-white hover:bg-white/90 text-black flex items-center justify-center shadow-lg active:scale-95 transition-all cursor-pointer"
              >
                {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
              </button>
            </div>
          )}

          {/* Reaction Bar */}
          <div className="pt-4 border-t border-white/10 w-full flex items-center justify-center gap-2 sm:gap-3">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleReactionClick(emoji)}
                className="w-10 h-10 rounded-full bg-white/[0.06] hover:bg-white/[0.14] active:scale-125 transition-all flex items-center justify-center text-xl cursor-pointer"
                title={`Send ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Connected Listeners Avatar Stack */}
          <div className="w-full pt-2 flex items-center justify-between text-left">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-white/50" />
              <span className="text-[13px] font-semibold text-white/80">{members.length} Listening</span>
            </div>
            <AvatarStack
              avatars={members.map((m) => ({
                id: m.userId,
                name: m.username,
                src: m.avatar,
              }))}
              max={6}
            />
          </div>
        </GlassCard>

        {/* Right Column: Shared Queue & Live In-Room Chat Tabs */}
        <GlassCard className="lg:col-span-5 p-5 flex flex-col h-[580px]">
          {/* Segmented Control Switch */}
          <div className="mb-4">
            <SegmentedControl
              id="together-room-tabs"
              options={[
                { value: 'queue', label: `Shared Queue (${room?.queue?.length || 0})` },
                { value: 'chat', label: `Live Chat (${room?.chat?.length || 0})` },
              ]}
              value={activeTab}
              onChange={(val) => setActiveTab(val as 'queue' | 'chat')}
            />
          </div>

          {/* TAB 1: SHARED QUEUE */}
          {activeTab === 'queue' && (
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar">
              {room?.queue && room.queue.length > 0 ? (
                room.queue.map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition-colors border border-white/5 group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-[12px] font-mono text-white/40 w-4">{idx + 1}</span>
                      <img
                        src={getTrackCover(item.track)}
                        alt="Art"
                        className="w-10 h-10 rounded-lg object-cover bg-zinc-800 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-white truncate max-w-[160px]">
                          {formatDisplayTitle(item.track.title)}
                        </div>
                        <div className="text-[11px] text-white/50 truncate max-w-[160px]">
                          Added by {item.addedByName}
                        </div>
                      </div>
                    </div>

                    {canControl && (
                      <button
                        type="button"
                        onClick={() => togetherClient.removeQueue(item.id)}
                        className="text-white/40 hover:text-rose-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-white/40 space-y-2">
                  <ListMusic className="w-8 h-8 opacity-40" />
                  <p className="text-[13px]">No upcoming tracks in the shared queue.</p>
                </div>
              )}
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
                        <p className="text-white/70 leading-relaxed break-words">{msg.text}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-white/40 space-y-2">
                    <MessageSquare className="w-8 h-8 opacity-40" />
                    <p className="text-[13px]">Be the first to say something in room chat!</p>
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
                  className="flex-1 h-10 px-3.5 rounded-xl bg-white/[0.06] border border-white/10 text-white text-[13px] placeholder:text-white/30 focus:outline-none focus:border-brand"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center disabled:opacity-40 active:scale-95 transition-all cursor-pointer shrink-0"
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
