"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GlassCard } from '@/components/ui/GlassCard';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { IosToggle } from '@/components/ui/IosToggle';
import { SEO } from '@/components/shared/SEO';
import {
  Radio,
  Users,
  Sparkles,
  ArrowRight,
  Music2,
  ShieldCheck,
  Play,
  Share2,
  Headphones,
  Check,
  Disc3,
  Sliders
} from 'lucide-react';
import api from '@/lib/api';
import notify from '@/lib/notify';
import { useAuthStore } from '@/store/authStore';

export default function TogetherHubPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const [joinCode, setJoinCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);

  // Room creation settings
  const [sessionMode, setSessionMode] = useState<'dj' | 'collab'>('dj');
  const [guestCanQueue, setGuestCanQueue] = useState(true);
  const [guestCanChat, setGuestCanChat] = useState(true);

  const handleCreateSession = async () => {
    setIsCreating(true);
    try {
      const guestId = !isAuthenticated
        ? (sessionStorage.getItem('zenify_guest_id') || `guest_${Math.random().toString(36).slice(2, 9)}`)
        : undefined;
      if (guestId) sessionStorage.setItem('zenify_guest_id', guestId);

      const res = await api.post('/together/rooms', {
        mode: sessionMode,
        guestCanQueue,
        guestCanChat,
        guestId,
        guestName: user?.name || user?.username || 'Host DJ',
      });

      if (res.data?.success && res.data?.roomCode) {
        notify('Session created! Connecting...', 'success');
        sessionStorage.setItem(`zenify_ticket_${res.data.roomCode}`, res.data.ticket);
        router.push(`/together/${res.data.roomCode}`);
      }
    } catch (err: any) {
      notify(err.response?.data?.message || 'Failed to create session', 'error');
    } finally {
      setIsCreating(false);
      setCreateSheetOpen(false);
    }
  };

  const handleJoinSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = joinCode.trim().toUpperCase();
    if (cleanCode.length < 6) {
      notify('Please enter a 6-character room code', 'error');
      return;
    }

    setIsJoining(true);
    try {
      const guestId = !isAuthenticated
        ? (sessionStorage.getItem('zenify_guest_id') || `guest_${Math.random().toString(36).slice(2, 9)}`)
        : undefined;
      if (guestId) sessionStorage.setItem('zenify_guest_id', guestId);

      const res = await api.post(`/together/rooms/${cleanCode}/join`, {
        guestId,
        guestName: user?.name || user?.username || `Listener ${Math.floor(100 + Math.random() * 900)}`,
      });

      if (res.data?.success && res.data?.ticket) {
        sessionStorage.setItem(`zenify_ticket_${cleanCode}`, res.data.ticket);
        router.push(`/together/${cleanCode}`);
      }
    } catch (err: any) {
      notify(err.response?.data?.message || 'Session not found or has expired', 'error');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="min-h-screen pt-24 sm:pt-28 md:pt-32 pb-32 px-4 sm:px-6 md:px-8 max-w-5xl mx-auto space-y-8 sm:space-y-12 select-none">
      <SEO
        title="Listen Together – Zenify"
        description="Stream in real-time synchronization with friends. Sub-millisecond NTP audio lockstep, shared queue, live chat and emoji bursts."
        path="/together"
      />

      {/* Hero Showcase Card */}
      <GlassCard className="p-6 sm:p-10 md:p-12 relative overflow-hidden rounded-3xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
        {/* Ambient Gradient Glow */}
        <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-brand/20 blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-purple-600/15 blur-[100px] pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8 md:gap-12 text-center md:text-left">
          <div className="space-y-4 max-w-xl">
            {/* Pill Header Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand/15 border border-brand/30 text-brand text-[11px] sm:text-[12px] font-bold uppercase tracking-widest">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>Real-Time Audio Sync</span>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black font-oswald uppercase text-white tracking-tight leading-none">
              Listen Together. <br className="hidden sm:inline" />
              <span className="text-brand">Sync Every Beat.</span>
            </h1>

            <p className="text-white/65 font-libre text-sm sm:text-base leading-relaxed max-w-lg">
              Stream music with friends in sub-millisecond synchronization. Take the aux as a solo DJ or collaborate in real-time with a live shared queue and instant chat.
            </p>

            {/* Action Buttons Row */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3 justify-center md:justify-start">
              <button
                type="button"
                onClick={() => setCreateSheetOpen(true)}
                disabled={isCreating}
                className="w-full sm:w-auto h-12 px-7 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[11px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 shadow-xl"
              >
                <Sparkles className="w-4 h-4 text-brand" />
                <span>Start a Session</span>
              </button>

              <a
                href="#join-section"
                className="w-full sm:w-auto h-12 px-6 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-white text-[11px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Enter Room Code</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Vinyl & Visual Stage Graphic */}
          <div className="relative w-44 h-44 sm:w-56 sm:h-56 shrink-0 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-brand/30 to-purple-500/20 blur-2xl animate-pulse" />
            <div className="relative w-40 h-40 sm:w-48 sm:h-48 rounded-full bg-zinc-900/90 border border-white/15 flex items-center justify-center shadow-2xl">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-zinc-950 border border-brand/40 flex items-center justify-center relative">
                <Disc3 className="w-10 h-10 sm:w-12 sm:h-12 text-brand animate-spin" style={{ animationDuration: '6s' }} />
                <div className="absolute inset-0 rounded-full border border-dashed border-white/15" />
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Join Session Section */}
      <div id="join-section" className="scroll-mt-28">
        <GlassCard className="p-6 sm:p-8 rounded-3xl border border-white/10 relative overflow-hidden">
          <div className="max-w-2xl">
            <h2 className="text-xl sm:text-2xl font-bold font-oswald uppercase text-white tracking-wide mb-2 flex items-center gap-2.5">
              <Headphones className="w-5 h-5 text-brand" />
              <span>Have an Invite Code?</span>
            </h2>
            <p className="text-white/55 font-libre text-sm mb-6 leading-relaxed">
              Enter the 6-character room code shared by your friend to jump straight into their synchronized audio stream.
            </p>

            <form onSubmit={handleJoinSession} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1 sm:max-w-xs">
                <input
                  type="text"
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder="ABC123"
                  className="w-full h-12 px-4 rounded-xl bg-white/[0.06] border border-white/15 text-white font-mono text-center text-xl sm:text-2xl uppercase tracking-[0.25em] placeholder:text-white/20 focus:outline-none focus:border-brand transition-colors shadow-inner"
                />
              </div>

              <button
                type="submit"
                disabled={isJoining || joinCode.length < 6}
                className="h-12 px-7 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[11px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer shadow-lg"
              >
                <span>{isJoining ? 'Connecting...' : 'Join Session'}</span>
                <ArrowRight className="w-4 h-4 text-brand" />
              </button>
            </form>
          </div>
        </GlassCard>
      </div>

      {/* Feature Highlights Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        <GlassCard className="p-6 rounded-2xl border border-white/10 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="font-bold font-oswald uppercase text-white text-[16px] tracking-wide">
            Sub-Millisecond NTP Sync
          </h3>
          <p className="text-white/55 font-libre text-xs sm:text-sm leading-relaxed">
            Continuous round-trip ping calculations and micro-drift adjustment keep every device in exact musical lockstep.
          </p>
        </GlassCard>

        <GlassCard className="p-6 rounded-2xl border border-white/10 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center">
            <Music2 className="w-5 h-5" />
          </div>
          <h3 className="font-bold font-oswald uppercase text-white text-[16px] tracking-wide">
            Collaborative Aux
          </h3>
          <p className="text-white/55 font-libre text-xs sm:text-sm leading-relaxed">
            Host as a solo DJ or let everyone search and queue their favorite tracks with real-time shared playback control.
          </p>
        </GlassCard>

        <GlassCard className="p-6 rounded-2xl border border-white/10 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <h3 className="font-bold font-oswald uppercase text-white text-[16px] tracking-wide">
            Reactions & Live Chat
          </h3>
          <p className="text-white/55 font-libre text-xs sm:text-sm leading-relaxed">
            Send floating emoji bursts and real-time room messages as the songs play without interrupting the stream.
          </p>
        </GlassCard>
      </div>

      {/* Create Session Bottom Sheet / Modal */}
      <BottomSheet
        isOpen={createSheetOpen}
        onClose={() => setCreateSheetOpen(false)}
        title="Start Listen Together"
        subtitle="Configure your synchronized audio space"
      >
        <div className="space-y-6 py-2">
          {/* Mode Selector */}
          <div className="space-y-2.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-white/50">
              Session Mode
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSessionMode('dj')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  sessionMode === 'dj'
                    ? 'bg-brand/15 border-brand text-white shadow-lg shadow-brand/10'
                    : 'bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/[0.08]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-bold text-[14px] text-white">DJ Mode</div>
                  {sessionMode === 'dj' && <Check className="w-4 h-4 text-brand" />}
                </div>
                <div className="text-[12px] text-white/50 mt-1 leading-relaxed">
                  Only you (the host) control play, pause, seek, and track selection.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSessionMode('collab')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  sessionMode === 'collab'
                    ? 'bg-brand/15 border-brand text-white shadow-lg shadow-brand/10'
                    : 'bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/[0.08]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-bold text-[14px] text-white">Collaborative</div>
                  {sessionMode === 'collab' && <Check className="w-4 h-4 text-brand" />}
                </div>
                <div className="text-[12px] text-white/50 mt-1 leading-relaxed">
                  All listeners can queue, skip, and vote on upcoming songs together.
                </div>
              </button>
            </div>
          </div>

          {/* Permissions Toggles */}
          <div className="space-y-4 pt-3 border-t border-white/10">
            <IosToggle
              checked={guestCanQueue}
              onCheckedChange={setGuestCanQueue}
              label="Allow listeners to add tracks to queue"
            />
            <IosToggle
              checked={guestCanChat}
              onCheckedChange={setGuestCanChat}
              label="Enable live in-room chat"
            />
          </div>

          <button
            type="button"
            onClick={handleCreateSession}
            disabled={isCreating}
            className="w-full h-12 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[11px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer disabled:opacity-50 mt-4 shadow-xl"
          >
            <Play className="w-4 h-4 fill-current text-brand" />
            <span>{isCreating ? 'Creating Room...' : 'Launch Session'}</span>
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
