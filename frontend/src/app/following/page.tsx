"use client";

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { GlassCard } from '@/components/ui/GlassCard';
import { FollowButton } from '@/components/shared/FollowButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRow } from '@/components/ui/SkeletonRow';
import { SEO } from '@/components/shared/SEO';
import { PushManager } from '@/lib/push-manager';
import api from '@/lib/api';
import notify from '@/lib/notify';
import { Users, Bell, Sparkles, Disc3, ArrowRight } from 'lucide-react';

export default function FollowingPage() {
  const router = useRouter();
  const [isEnablingPush, setIsEnablingPush] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(
    typeof window !== 'undefined' && PushManager.getPermission() === 'granted'
  );

  // 1. Fetch followed artists
  const { data: followData, isLoading: isArtistsLoading } = useQuery({
    queryKey: ['followed-artists'],
    queryFn: async () => {
      const res = await api.get('/me/following?limit=50');
      return res.data;
    },
  });

  // 2. Fetch new releases timeline
  const { data: releaseData, isLoading: isReleasesLoading } = useQuery({
    queryKey: ['releases-timeline'],
    queryFn: async () => {
      const res = await api.get('/me/releases?limit=20');
      return res.data?.releases || [];
    },
  });

  const artists = followData?.artists || [];
  const releases = releaseData || [];

  const handleEnablePush = async () => {
    setIsEnablingPush(true);
    try {
      const success = await PushManager.subscribeToNewReleases();
      if (success) {
        setPushEnabled(true);
        notify('Release notifications enabled!', 'success');
      } else {
        notify('Push permission was not granted.', 'warning');
      }
    } catch (err: any) {
      notify(err.message || 'Failed to enable push notifications', 'error');
    } finally {
      setIsEnablingPush(false);
    }
  };

  return (
    <div className="min-h-screen px-4 sm:px-8 pt-24 sm:pt-28 md:pt-32 pb-32 max-w-6xl mx-auto space-y-10">
      <SEO title="Following – Zenify" description="Artists you follow and their latest releases." path="/following" noindex={true} />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">Following</h1>
          <p className="text-white/50 text-[14px] mt-1">Keep track of your favorite artists and never miss a new drop.</p>
        </div>

        {/* Push Notification Banner */}
        {!pushEnabled && PushManager.isSupported() && (
          <button
            type="button"
            onClick={handleEnablePush}
            disabled={isEnablingPush}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-brand/15 hover:bg-brand/25 border border-brand/30 text-brand font-semibold text-[13px] active:scale-95 transition-all cursor-pointer self-start sm:self-auto disabled:opacity-50"
          >
            <Bell className="w-4 h-4" />
            <span>{isEnablingPush ? 'Enabling...' : 'Get Release Alerts'}</span>
          </button>
        )}
      </div>

      {/* SECTION 1: NEW RELEASES TIMELINE */}
      {releases.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand" />
              <h2 className="text-lg font-bold text-white tracking-wide">New Releases</h2>
            </div>
            <span className="text-[12px] text-white/40">{releases.length} recent drops</span>
          </div>

          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 snap-x snap-mandatory">
            {releases.map((release: any) => (
              <div
                key={release.id}
                onClick={() => router.push(`/album/${release.albumProviderId}`)}
                className="w-44 shrink-0 snap-start space-y-2.5 p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 transition-all cursor-pointer group"
              >
                <div className="w-full aspect-square rounded-xl overflow-hidden bg-zinc-900 shadow-md relative">
                  <img
                    src={release.coverUrl || '/logo.png'}
                    alt={release.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[9px] font-bold text-white uppercase tracking-wider">
                    New
                  </span>
                </div>
                <div>
                  <div className="text-[13px] font-bold text-white truncate group-hover:text-brand transition-colors">
                    {release.title}
                  </div>
                  <div className="text-[11px] text-white/50 truncate">{release.artistName}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 2: FOLLOWED ARTISTS GRID */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-white/50" />
            <h2 className="text-lg font-bold text-white tracking-wide">Followed Artists</h2>
          </div>
          <span className="text-[12px] text-white/40">{artists.length} artists</span>
        </div>

        {isArtistsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="p-4 rounded-2xl bg-white/[0.04] space-y-3 flex flex-col items-center text-center">
                <div className="w-24 h-24 rounded-full bg-white/10 animate-pulse" />
                <div className="w-20 h-4 rounded bg-white/10 animate-pulse" />
              </div>
            ))}
          </div>
        ) : artists.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {artists.map((artist: any) => (
              <GlassCard
                key={artist.id}
                onClick={() => router.push(`/artist/${artist.artistProviderId}`)}
                className="p-5 flex flex-col items-center text-center space-y-3.5 hover:bg-white/[0.08] transition-all cursor-pointer group"
              >
                <div className="w-24 h-24 rounded-full overflow-hidden bg-zinc-800 shadow-lg border border-white/10 shrink-0">
                  <img
                    src={artist.artistImage || '/logo.png'}
                    alt={artist.artistName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="w-full min-w-0">
                  <div className="font-bold text-[14px] text-white truncate group-hover:text-brand transition-colors">
                    {artist.artistName}
                  </div>
                  <div className="text-[11px] text-white/50 truncate">Artist</div>
                </div>
                <FollowButton
                  artistId={artist.artistProviderId}
                  artistName={artist.artistName}
                  artistImage={artist.artistImage}
                  compact
                  className="w-full mt-1"
                />
              </GlassCard>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="No artists followed yet"
            description="Follow your favorite music makers to get instant alerts and tracks in your library."
            actionLabel="Discover Artists"
            onAction={() => router.push('/discover')}
          />
        )}
      </div>
    </div>
  );
}

