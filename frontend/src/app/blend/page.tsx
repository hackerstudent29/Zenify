"use client";

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import notify from '@/lib/notify';
import { SEO } from '@/components/shared/SEO';
import { GlassCard } from '@/components/ui/GlassCard';
import { SkeletonRow } from '@/components/ui/SkeletonRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { Users, Plus, Copy, Check, Share2, Sparkles, ArrowRight, HeartHandshake } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function BlendHubPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  // Fetch active blends
  const { data, isLoading } = useQuery({
    queryKey: ['my-blends'],
    queryFn: async () => {
      const res = await api.get('/me/blend');
      return res.data?.blends || [];
    },
  });

  const blends = data || [];

  // Create invite mutation
  const createInviteMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/me/blend/create');
      return res.data;
    },
    onSuccess: (resData) => {
      setInviteToken(resData.token);
      notify('Blend invite generated!', 'success');
    },
    onError: (err: any) => {
      notify(err.response?.data?.message || 'Failed to create invite.', 'error');
    },
  });

  const handleCopyLink = () => {
    if (!inviteToken) return;
    const link = `${window.location.origin}/blend/join/${inviteToken}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    notify('Invite link copied!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;

    // Extract raw token from full URL or standalone code
    let token = joinCode.trim();
    if (token.includes('/blend/join/')) {
      token = token.split('/blend/join/')[1].split('?')[0].split('/')[0];
    }

    try {
      setIsJoining(true);
      const res = await api.post('/me/blend/join', { token });
      notify('Joined Blend successfully!', 'success');
      queryClient.invalidateQueries({ queryKey: ['my-blends'] });
      navigate(`/blend/${res.data.sessionId}`);
    } catch (err: any) {
      notify(err.response?.data?.error || 'Invalid or expired invite token.', 'error');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div
      className="min-h-screen text-white select-none pt-24 sm:pt-28 md:pt-32 pb-24 px-4 sm:px-6 md:px-8 font-sans"
      style={{ paddingRight: 'calc(var(--rp-w) + var(--row-gutter, 28px))' }}
    >
      <SEO
        title="Blend - Zenify"
        description="Mix your music taste with friends. Two listeners, one shared daily playlist with taste match scores."
      />

      <div className="max-w-4xl mx-auto space-y-10">
        {/* Header Hero */}
        <div className="space-y-3 text-center sm:text-left">
          <span className="text-[11px] font-bold tracking-widest text-brand uppercase">
            SHARED TASTE • UPDATED DAILY
          </span>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white flex items-center justify-center sm:justify-start gap-3">
            Blend
            <HeartHandshake className="w-8 h-8 text-brand" />
          </h1>
          <p className="text-sm sm:text-base text-white/70 max-w-xl leading-relaxed">
            Combine your listening history with a friend into a shared 50-song playlist that updates
            daily with your mutual favorites and taste match percentage.
          </p>
        </div>

        {/* Action Banners: Create & Join */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Create Blend */}
          <GlassCard className="p-6 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-brand/20 border border-brand/30 flex items-center justify-center text-brand">
                <Plus className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Create a Blend</h3>
              <p className="text-xs text-white/60 leading-relaxed">
                Invite a friend with a private link. As soon as they accept, your shared playlist is born.
              </p>
            </div>

            {inviteToken ? (
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-2 p-2 rounded-xl bg-black/40 border border-white/10 text-xs font-mono truncate">
                  <span className="truncate flex-1 text-white/80">
                    {typeof window !== 'undefined' ? `${window.location.origin}/blend/join/${inviteToken}` : inviteToken}
                  </span>
                </div>
                <button
                  onClick={handleCopyLink}
                  className="w-full h-10 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer shadow"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied to Clipboard' : 'Copy Invite Link'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => createInviteMutation.mutate()}
                disabled={createInviteMutation.isPending}
                className="h-10 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer shadow"
              >
                <Plus className="w-4 h-4" />
                {createInviteMutation.isPending ? 'Generating...' : 'Invite a Friend'}
              </button>
            )}
          </GlassCard>

          {/* Join Blend */}
          <GlassCard className="p-6 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Join a Blend</h3>
              <p className="text-xs text-white/60 leading-relaxed">
                Received an invite from a friend? Paste their link or token below to create your blend.
              </p>
            </div>

            <form onSubmit={handleJoin} className="space-y-2 pt-2">
              <input
                type="text"
                placeholder="Paste invite link or token..."
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-brand transition"
              />
              <button
                type="submit"
                disabled={isJoining || !joinCode.trim()}
                className="w-full h-10 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer shadow disabled:opacity-40"
              >
                <ArrowRight className="w-4 h-4" />
                {isJoining ? 'Joining...' : 'Join Blend'}
              </button>
            </form>
          </GlassCard>
        </div>

        {/* Existing Blends List */}
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight text-white">Your Blends</h2>
            <span className="text-xs text-white/40">{blends.length} Active</span>
          </div>

          {isLoading && (
            <div className="space-y-3">
              <SkeletonRow />
              <SkeletonRow />
            </div>
          )}

          {!isLoading && blends.length === 0 && (
            <EmptyState
              icon={Sparkles}
              title="No Blends Yet"
              description="Invite a friend or enter a link above to discover your shared music taste."
              actionLabel="Create Your First Blend"
              onAction={() => createInviteMutation.mutate()}
            />
          )}

          {!isLoading && blends.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {blends.map((b: any) => (
                <div
                  key={b.id}
                  onClick={() => navigate(`/blend/${b.id}`)}
                  className="group p-5 rounded-2xl bg-white/5 hover:bg-white/[0.08] border border-white/10 transition-all duration-200 cursor-pointer flex items-center justify-between"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    {/* Dual avatar preview */}
                    <div className="relative flex items-center shrink-0">
                      <div className="w-11 h-11 rounded-full bg-neutral-800 border-2 border-black overflow-hidden flex items-center justify-center font-bold text-xs">
                        {b.partner?.avatarUrl ? (
                          <img src={b.partner.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          b.partner?.name?.slice(0, 2).toUpperCase() || 'FR'
                        )}
                      </div>
                    </div>

                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-white truncate group-hover:text-brand transition">
                        Blend with {b.partner?.name || 'Friend'}
                      </h4>
                      <p className="text-xs text-white/50">{b.trackCount} Tracks</p>
                    </div>
                  </div>

                  {/* Match score pill */}
                  <div className="px-3 py-1 rounded-full bg-brand/15 border border-brand/30 text-brand text-xs font-bold font-mono shrink-0">
                    {Math.round(b.matchScore)}% Match
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

