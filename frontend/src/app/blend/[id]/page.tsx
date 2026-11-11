"use client";

import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import notify from '@/lib/notify';
import { usePlayerStore } from '@/store/player';
import { useUIStore } from '@/store/ui';
import { SEO } from '@/components/shared/SEO';
import { MediaActionButtons } from '@/components/shared/MediaActionButtons';
import { JioSaavnSongTable } from '@/app/artist/[id]/components/JioSaavnSongTable';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { SkeletonRow } from '@/components/ui/SkeletonRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { Sparkles, RotateCcw, Share2, LogOut, HeartHandshake } from 'lucide-react';

export default function BlendDetailPage() {
  const params = useParams() as any;
  const sessionId = params.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const { currentTrack, isPlaying, setQueue, setTrack } = usePlayerStore();
  const { openShareSheet } = useUIStore();

  // Fetch blend details
  const { data: blend, isLoading, isError, refetch } = useQuery({
    queryKey: ['blend', sessionId],
    queryFn: async () => {
      const res = await api.get(`/me/blend/${sessionId}`);
      return res.data;
    },
    enabled: !!sessionId,
  });

  const tracks: any[] = useMemo(() => blend?.tracks || [], [blend?.tracks]);
  const partner = blend?.partner;
  const currentUser = blend?.currentUser;
  const matchScore = Math.round(blend?.matchScore || 0);
  const sharedArtists: string[] = blend?.sharedArtists || [];

  // Liked tracks for table
  const { data: likedTrackIds = [] } = useQuery<string[]>({
    queryKey: ['liked-track-ids'],
    queryFn: async () => {
      const res = await api.get('tracks/liked');
      return (res.data || []).map((t: any) => t.id || t.trackId);
    },
  });

  const handleToggleLike = async (trackId: string) => {
    const prev = likedTrackIds;
    const isLiked = prev.includes(trackId);
    const updated = isLiked ? prev.filter((id) => id !== trackId) : [...prev, trackId];
    queryClient.setQueryData(['liked-track-ids'], updated);

    try {
      await api.post(`tracks/${trackId}/like`);
      queryClient.invalidateQueries({ queryKey: ['liked-track-ids'] });
    } catch {
      queryClient.setQueryData(['liked-track-ids'], prev);
    }
  };

  // Refresh blend mutation
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/me/blend/${sessionId}/refresh`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blend', sessionId] });
      notify('Blend playlist updated!', 'success');
    },
    onError: () => {
      notify('Failed to refresh Blend.', 'error');
    },
  });

  // Leave blend mutation
  const leaveMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/me/blend/${sessionId}`);
    },
    onSuccess: () => {
      notify('You left the Blend.', 'success');
      queryClient.invalidateQueries({ queryKey: ['my-blends'] });
      navigate('/blend');
    },
    onError: () => {
      notify('Failed to leave Blend.', 'error');
    },
  });

  const handlePlayAll = () => {
    if (!tracks || tracks.length === 0) return;
    useUIStore.getState().setPlayerMinimized(false);
    setQueue(tracks);
    setTrack(tracks[0]);
  };

  const handleShuffle = () => {
    if (!tracks || tracks.length === 0) return;
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    useUIStore.getState().setPlayerMinimized(false);
    setQueue(shuffled);
    setTrack(shuffled[0]);
  };

  const handlePlayTrack = (track: any) => {
    const idx = tracks.findIndex((t) => t.id === track.id);
    useUIStore.getState().setPlayerMinimized(false);
    if (idx !== -1) {
      setQueue(tracks);
      setTrack(tracks[idx]);
    } else {
      setTrack(track);
    }
  };

  const handleShare = () => {
    if (!blend) return;
    openShareSheet({
      type: 'playlist',
      playlist: {
        id: `blend-${sessionId}`,
        name: `Blend with ${partner?.name || 'Friend'}`,
        coverUrl: tracks[0]?.coverUrl,
      },
    });
  };

  const isCurrentBlendPlaying = isPlaying && tracks.some((t) => t.id === currentTrack?.id);

  return (
    <div
      className="min-h-screen text-white select-none pt-24 sm:pt-28 md:pt-32 pb-24 px-4 sm:px-6 md:px-8 font-sans"
      style={{ paddingRight: 'calc(var(--rp-w) + var(--row-gutter, 28px))' }}
    >
      <SEO
        title={`Blend with ${partner?.name || 'Friend'} – Zenify`}
        description={`Shared musical playlist. ${matchScore}% Taste Match.`}
        path="/blend"
        noindex={true}
      />

      <div className="max-w-6xl mx-auto space-y-8">
        {isLoading && (
          <div className="space-y-4">
            <div className="h-48 rounded-3xl bg-white/5 animate-pulse" />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        )}

        {!isLoading && isError && (
          <div className="pt-12 max-w-md mx-auto">
            <EmptyState
              icon={Sparkles}
              title="Blend Not Found"
              description="This Blend may have been removed or you may not have permission to view it."
              actionLabel="Back to Blends"
              onAction={() => navigate('/blend')}
            />
          </div>
        )}

        {!isLoading && !isError && blend && (
          <>
            {/* Hero Header */}
            <div className="flex flex-col md:flex-row items-center md:items-end gap-6 sm:gap-8 pb-4">
              {/* Overlapping Dual Avatars */}
              <div className="relative flex items-center justify-center shrink-0 w-44 h-44 sm:w-56 sm:h-56">
                <div className="absolute left-2 sm:left-4 w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-gradient-to-tr from-rose-600 to-amber-500 p-1 shadow-2xl border-4 border-black z-10 overflow-hidden">
                  {currentUser?.avatarUrl ? (
                    <img src={currentUser.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <div className="w-full h-full rounded-full bg-neutral-900 flex items-center justify-center font-black text-xl">
                      {currentUser?.name?.slice(0, 2).toUpperCase() || 'YOU'}
                    </div>
                  )}
                </div>

                <div className="absolute right-2 sm:right-4 w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-gradient-to-tr from-blue-600 to-teal-400 p-1 shadow-2xl border-4 border-black z-20 overflow-hidden">
                  {partner?.avatarUrl ? (
                    <img src={partner.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <div className="w-full h-full rounded-full bg-neutral-900 flex items-center justify-center font-black text-xl">
                      {partner?.name?.slice(0, 2).toUpperCase() || 'FR'}
                    </div>
                  )}
                </div>

                {/* Match score badge floating between avatars */}
                <div className="absolute -bottom-2 z-30 px-3.5 py-1 rounded-full bg-brand text-white text-xs font-black tracking-wider uppercase shadow-xl border border-white/20 flex items-center gap-1.5">
                  <HeartHandshake className="w-3.5 h-3.5" />
                  {matchScore}% MATCH
                </div>
              </div>

              {/* Title, Shared Artists & Actions */}
              <div className="flex-1 text-center md:text-left space-y-2">
                <span className="text-[11px] font-bold tracking-widest text-brand uppercase">
                  ZENIFY BLEND • UPDATED DAILY
                </span>

                <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white">
                  Blend with {partner?.name || 'Friend'}
                </h1>

                {sharedArtists.length > 0 && (
                  <p className="text-xs sm:text-sm text-white/70 max-w-xl leading-relaxed">
                    You both listen to{' '}
                    <span className="font-semibold text-white">
                      {sharedArtists.slice(0, 3).map((a) => a.charAt(0).toUpperCase() + a.slice(1)).join(', ')}
                    </span>
                    {sharedArtists.length > 3 && ` and ${sharedArtists.length - 3} others`}.
                  </p>
                )}

                <div className="text-xs text-white/40 font-medium pt-1">
                  {tracks.length} Songs • Combined tastes of {currentUser?.name || 'You'} & {partner?.name || 'Friend'}
                </div>

                {/* Media Actions */}
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-2">
                  <MediaActionButtons
                    isPlaying={isCurrentBlendPlaying}
                    onPlay={handlePlayAll}
                    onShuffle={handleShuffle}
                    extraAction={
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleShare}
                          className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/85 outline-none transition-colors duration-150 hover:bg-white/[0.18] hover:text-white"
                          title="Share Blend"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => refreshMutation.mutate()}
                          disabled={refreshMutation.isPending}
                          className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/85 outline-none transition-colors duration-150 hover:bg-white/[0.18] hover:text-white disabled:opacity-40"
                          title="Refresh Blend Tracklist"
                        >
                          <RotateCcw className={`w-4 h-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
                        </button>

                        <button
                          onClick={() => setIsLeaveModalOpen(true)}
                          className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/10 text-rose-400 outline-none transition-colors duration-150 hover:bg-rose-500/20 hover:text-rose-300"
                          title="Leave Blend"
                        >
                          <LogOut className="w-4 h-4" />
                        </button>
                      </div>
                    }
                  />
                </div>
              </div>
            </div>

            {/* Song Table */}
            <div className="pt-4">
              <JioSaavnSongTable
                tracks={tracks}
                currentTrackId={currentTrack?.id}
                isPlaying={isPlaying}
                likedTrackIds={likedTrackIds}
                onPlayTrack={handlePlayTrack}
                onToggleLike={handleToggleLike}
                showArtist={true}
              />
            </div>
          </>
        )}
      </div>

      {/* Leave Confirmation Sheet */}
      <ConfirmSheet
        isOpen={isLeaveModalOpen}
        onClose={() => setIsLeaveModalOpen(false)}
        onConfirm={() => leaveMutation.mutate()}
        title="Leave Blend?"
        message={`Leaving will remove your shared playlist with ${partner?.name || 'this friend'}. You can always create a new Blend anytime.`}
        confirmLabel="Leave Blend"
        isDestructive={true}
      />
    </div>
  );
}

