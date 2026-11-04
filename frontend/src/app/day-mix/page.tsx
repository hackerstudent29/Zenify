"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { usePlayerStore } from '@/store/player';
import { useUIStore } from '@/store/ui';
import { SEO } from '@/components/shared/SEO';
import { MediaActionButtons } from '@/components/shared/MediaActionButtons';
import { JioSaavnSongTable } from '@/app/artist/[id]/components/JioSaavnSongTable';
import { SkeletonRow } from '@/components/ui/SkeletonRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { Sparkles, Sun, CloudSun, Sunset, Moon, Share2, Disc3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

type DayMixSlot = 'morning' | 'afternoon' | 'evening' | 'late_night';

interface SlotMeta {
  slot: DayMixSlot;
  title: string;
  subtitle: string;
  badge: string;
  hoursDescription: string;
  gradient: {
    from: string;
    via?: string;
    to: string;
    accent: string;
  };
}

const SLOTS_CONFIG: Record<DayMixSlot, { icon: typeof Sun; label: string }> = {
  morning: { icon: Sun, label: 'Morning' },
  afternoon: { icon: CloudSun, label: 'Afternoon' },
  evening: { icon: Sunset, label: 'Evening' },
  late_night: { icon: Moon, label: 'Late Night' },
};

export default function DayMixPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedSlot, setSelectedSlot] = useState<DayMixSlot | undefined>(undefined);

  const { currentTrack, isPlaying, setQueue, setTrack } = usePlayerStore();
  const { openShareSheet } = useUIStore();

  // Fetch Day Mix data
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['day-mix', selectedSlot],
    queryFn: async () => {
      const url = selectedSlot ? `/me/day-mix?slot=${selectedSlot}` : '/me/day-mix';
      const res = await api.get(url);
      return res.data;
    },
    staleTime: 1000 * 60 * 15, // 15 mins
  });

  const slot: DayMixSlot = data?.slot || selectedSlot || 'morning';
  const meta: SlotMeta | undefined = data?.meta;
  const tracks: any[] = useMemo(() => data?.tracks || [], [data?.tracks]);

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
    if (!meta) return;
    const firstTrack = tracks[0];
    openShareSheet({
      type: 'playlist',
      playlist: {
        id: `day-mix-${slot}`,
        name: meta.title,
        coverUrl: firstTrack?.coverUrl,
      },
    });
  };

  const currentSlotPlaying = isPlaying && tracks.some((t) => t.id === currentTrack?.id);

  const backgroundGradient = useMemo(() => {
    if (!meta?.gradient) {
      return 'linear-gradient(180deg, rgba(225, 29, 72, 0.25) 0%, rgba(18, 18, 20, 0) 100%)';
    }
    const { from, via, to } = meta.gradient;
    if (via) {
      return `linear-gradient(180deg, ${from}33 0%, ${via}22 45%, ${to}00 100%)`;
    }
    return `linear-gradient(180deg, ${from}33 0%, ${to}00 100%)`;
  }, [meta]);

  return (
    <div
      className="min-h-screen text-white select-none pt-24 sm:pt-28 md:pt-32 pb-24 px-4 sm:px-6 md:px-8 transition-colors duration-500 font-sans"
      style={{
        paddingRight: 'calc(var(--rp-w) + var(--row-gutter, 28px))',
      }}
    >
      <SEO
        title={`${meta?.title || 'Day Mix'} - Zenify`}
        description={meta?.subtitle || 'Personalized flow crafted for the rhythms of your day.'}
      />

      {/* Atmospheric dynamic gradient backdrop */}
      <div
        className="fixed inset-0 pointer-events-none -z-10 transition-all duration-700 opacity-60"
        style={{ background: backgroundGradient }}
      />

      <div className="max-w-6xl mx-auto space-y-8">
        {/* Time-of-day Slot Selector Tabs */}
        <div className="flex items-center justify-center sm:justify-start">
          <div className="flex items-center gap-1 p-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-x-auto max-w-full">
            {(Object.keys(SLOTS_CONFIG) as DayMixSlot[]).map((s) => {
              const item = SLOTS_CONFIG[s];
              const Icon = item.icon;
              const isSelected = slot === s;

              return (
                <button
                  key={s}
                  onClick={() => setSelectedSlot(s)}
                  className={cn(
                    'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap',
                    isSelected
                      ? 'bg-brand text-white shadow-lg shadow-brand/20 font-bold'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Hero Section */}
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
              title="Mix Unavailable"
              description="Unable to compile your Day Mix at the moment. Please try again shortly."
              actionLabel="Try Again"
              onAction={() => refetch()}
            />
          </div>
        )}

        {!isLoading && !isError && meta && (
          <>
            <div className="flex flex-col md:flex-row items-center md:items-end gap-6 sm:gap-8 pb-4">
              {/* Cover Artwork Showcase */}
              <div className="relative w-44 h-44 sm:w-56 sm:h-56 rounded-[28px] overflow-hidden shadow-2xl border border-white/10 shrink-0 bg-neutral-900 group">
                {tracks[0]?.coverUrl ? (
                  <img
                    src={tracks[0].coverUrl}
                    alt={meta.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-950 text-white/40">
                    <Disc3 className="w-16 h-16 animate-spin text-white/20" />
                  </div>
                )}

                {/* Subtle frosted badge over artwork */}
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-bold tracking-widest text-white uppercase">
                  {meta.hoursDescription}
                </div>
              </div>

              {/* Title & Metadata */}
              <div className="flex-1 text-center md:text-left space-y-2">
                <span className="inline-block text-[11px] font-bold tracking-widest text-brand uppercase">
                  {meta.badge}
                </span>

                <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white">
                  {meta.title}
                </h1>

                <p className="text-sm sm:text-base text-white/70 max-w-xl leading-relaxed">
                  {meta.subtitle}
                </p>

                <div className="text-xs text-white/40 font-medium pt-1">
                  {tracks.length} Songs • Approximately{' '}
                  {Math.round(
                    tracks.reduce((acc, t) => acc + (t.duration || 0), 0) / 60
                  )}{' '}
                  minutes
                </div>

                {/* Media Action Buttons */}
                <MediaActionButtons
                  isPlaying={currentSlotPlaying}
                  onPlay={handlePlayAll}
                  onShuffle={handleShuffle}
                  extraAction={
                    <button
                      onClick={handleShare}
                      className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/85 outline-none transition-colors duration-150 hover:bg-white/[0.18] hover:text-white"
                      title="Share Day Mix"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                  }
                />
              </div>
            </div>

            {/* Tracklist using JioSaavnSongTable */}
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
    </div>
  );
}
