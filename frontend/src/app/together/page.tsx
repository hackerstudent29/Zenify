"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GlassCard } from '@/components/ui/GlassCard';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { IosToggle } from '@/components/ui/IosToggle';
import { SEO } from '@/components/shared/SEO';
import { Radio, Users, Sparkles, ArrowRight, Music2, ShieldCheck, Play } from 'lucide-react';
import api from '@/lib/api';
import notify from '@/lib/notify';
import { useAuthStore } from '@/store/authStore';

export default function TogetherHubPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [joinCode, setJoinCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);

  // Room creation settings
  const [sessionMode, setSessionMode] = useState<'dj' | 'collab'>('dj');
  const [guestCanQueue, setGuestCanQueue] = useState(true);
  const [guestCanChat, setGuestCanChat] = useState(true);

  const handleCreateSession = async () => {
    if (!isAuthenticated) {
      notify('Please sign in to start a Listen Together session', 'error');
      router.push('/login');
      return;
    }

    setIsCreating(true);
    try {
      const res = await api.post('/together/rooms', {
        mode: sessionMode,
        guestCanQueue,
        guestCanChat,
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

    if (!isAuthenticated) {
      notify('Please sign in to join a session', 'error');
      router.push('/login');
      return;
    }

    setIsJoining(true);
    try {
      const res = await api.post(`/together/rooms/${cleanCode}/join`);
      if (res.data?.success) {
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
    <div className="min-h-screen px-4 sm:px-8 py-10 max-w-4xl mx-auto space-y-10">
      <SEO title="Listen Together – Zenify" description="Synchronized streaming with your circle in real time." path="/together" />

      {/* Hero Showcase */}
      <GlassCard className="p-8 md:p-12 relative overflow-hidden text-center md:text-left flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="space-y-4 max-w-md z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand/15 text-brand text-[12px] font-bold uppercase tracking-wider">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>Listen Together</span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white">
            Sync Every Beat. In Real Time.
          </h1>
          <p className="text-white/60 text-[15px] sm:text-[16px] leading-relaxed">
            Listen to songs with friends in perfect sub-millisecond synchronization. Control the aux as the DJ or collaborate on a shared queue.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
            <button
              type="button"
              onClick={() => setCreateSheetOpen(true)}
              disabled={isCreating}
              className="w-full sm:w-auto h-12 px-6 rounded-full bg-brand text-white font-semibold text-[15px] flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-brand/20 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Start a Session</span>
            </button>
          </div>
        </div>

        {/* Visual Graphic */}
        <div className="relative w-48 h-48 md:w-56 md:h-56 shrink-0 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-brand/30 to-purple-500/20 blur-2xl animate-pulse" />
          <div className="relative w-40 h-40 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center shadow-2xl">
            <div className="w-24 h-24 rounded-full bg-brand/10 border border-brand/30 flex items-center justify-center">
              <Users className="w-10 h-10 text-brand" />
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Join Session Box */}
      <GlassCard className="p-6 sm:p-8">
        <h2 className="text-xl font-bold text-white mb-2">Have an Invite Code?</h2>
        <p className="text-white/50 text-[14px] mb-6">Enter the 6-character room code to hop into a live session.</p>

        <form onSubmit={handleJoinSession} className="flex flex-col sm:flex-row items-center gap-3">
          <input
            type="text"
            maxLength={6}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            className="w-full sm:w-64 h-12 px-4 rounded-xl bg-white/[0.06] border border-white/10 text-white font-mono text-center text-xl uppercase tracking-widest placeholder:text-white/20 focus:outline-none focus:border-brand transition-colors"
          />
          <button
            type="submit"
            disabled={isJoining || joinCode.length < 6}
            className="w-full sm:w-auto h-12 px-6 rounded-xl bg-white hover:bg-white/90 text-black font-semibold text-[14px] flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
          >
            <span>{isJoining ? 'Joining...' : 'Join Session'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </GlassCard>

      {/* Feature Highlights Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <GlassCard className="p-5 space-y-2">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-white text-[15px]">NTP Synchronized</h3>
          <p className="text-white/50 text-[13px] leading-relaxed">
            Continuous clock offset calculation and micro-drift adjustments keep audio in seamless lockstep.
          </p>
        </GlassCard>

        <GlassCard className="p-5 space-y-2">
          <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center">
            <Music2 className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-white text-[15px]">Collaborative Aux</h3>
          <p className="text-white/50 text-[13px] leading-relaxed">
            Host as a solo DJ or let everyone queue up their favorite hits and vote on what plays next.
          </p>
        </GlassCard>

        <GlassCard className="p-5 space-y-2">
          <div className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-white text-[15px]">Reactions & Chat</h3>
          <p className="text-white/50 text-[13px] leading-relaxed">
            Send real-time floating emoji bursts and ephemeral in-room messages as the music plays.
          </p>
        </GlassCard>
      </div>

      {/* Create Session Sheet */}
      <BottomSheet
        isOpen={createSheetOpen}
        onClose={() => setCreateSheetOpen(false)}
        title="Start Listen Together"
        subtitle="Set up your shared music space"
      >
        <div className="space-y-6 py-2">
          {/* Mode Selector */}
          <div className="space-y-2">
            <label className="text-[12px] font-bold text-white/40 uppercase tracking-wider">Session Mode</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSessionMode('dj')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  sessionMode === 'dj'
                    ? 'bg-brand/15 border-brand text-white shadow-md'
                    : 'bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/[0.08]'
                }`}
              >
                <div className="font-bold text-[15px]">DJ Mode</div>
                <div className="text-[12px] text-white/50 mt-1">Only you control play, pause, and track selection.</div>
              </button>

              <button
                type="button"
                onClick={() => setSessionMode('collab')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  sessionMode === 'collab'
                    ? 'bg-brand/15 border-brand text-white shadow-md'
                    : 'bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/[0.08]'
                }`}
              >
                <div className="font-bold text-[15px]">Collaborative</div>
                <div className="text-[12px] text-white/50 mt-1">All listeners can queue, skip, and reorder songs.</div>
              </button>
            </div>
          </div>

          {/* Permissions Toggles */}
          <div className="space-y-4 pt-2 border-t border-white/10">
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
            className="w-full h-12 rounded-xl bg-brand text-white font-bold text-[15px] flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50 mt-4"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{isCreating ? 'Creating...' : 'Launch Room'}</span>
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

