"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track } from "@/store/player";
import { useAuthStore } from "@/store/authStore";
import { usePlayerStore } from "@/store/player";
import { Button } from "@/components/ui/button";
import { Play, Pause, Info, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ContentRow } from "@/components/shared/ContentRow";

export default function Home() {
  const { user, isAuthenticated } = useAuthStore();
  const { currentTrack, isPlaying, togglePlay, setTrack } = usePlayerStore();

  const { data: featuredTracks, isLoading: isFeaturedLoading } = useQuery({
    queryKey: ['tracks-featured'],
    queryFn: async () => {
      const res = await api.get('/tracks/featured');
      return res.data as Track[];
    },
    enabled: isAuthenticated
  });

  const { data: trendingTracks, isLoading: isTrendingLoading } = useQuery({
    queryKey: ['tracks-trending'],
    queryFn: async () => {
      const res = await api.get('/tracks/trending');
      return res.data as Track[];
    },
    enabled: isAuthenticated
  });

  const { data: allTracks, isLoading: isAllLoading } = useQuery({
    queryKey: ['tracks-all'],
    queryFn: async () => {
      const res = await api.get('/tracks');
      return res.data.items as Track[];
    },
    enabled: isAuthenticated
  });

  if (isFeaturedLoading || isTrendingLoading || isAllLoading || !isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] gap-6">
        <div className="w-12 h-12 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center animate-pulse">
          <div className="w-2 h-2 rounded-full bg-accent animate-ping" />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-muted-dark animate-pulse">Synchronizing with Archive</p>
      </div>
    );
  }

  const newReleases = allTracks?.slice(0, 12) || [];
  const madeForYou = allTracks?.slice(10, 22) || [];
  const focusWave = allTracks?.filter(t => t.genre === 'Focus').slice(0, 12) || [];
  const chillPicks = allTracks?.reverse().slice(0, 12) || [];

  // Dynamic Hero Track - reflect current playback or fallback to featured
  const heroTrackFallback = featuredTracks?.[0] || allTracks?.[0];
  const displayTrack = currentTrack || heroTrackFallback;

  return (
    <div className="space-y-12 pb-24 pt-4">
      {/* COMPACT HERO SECTION */}
      <div className="px-6">
        <div className="relative h-[320px] rounded-2xl overflow-hidden group shadow-2xl">
          {/* Dynamic Background with slower, elegant transition */}
          <AnimatePresence mode="wait">
            <motion.div
              key={displayTrack?.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 transition-transform duration-[20s] ease-linear group-hover:scale-110"
              style={{
                background: `linear-gradient(rgba(8,8,9,0.2), rgba(8,8,9,0.9)), url(${displayTrack?.coverUrl || 'https://picsum.photos/1200/800'})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }}
            />
          </AnimatePresence>

          {/* Glass Overlay for Content */}
          <div className="relative h-full flex items-center p-8 lg:p-12 gap-8 lg:gap-12 bg-gradient-to-t from-black via-black/40 to-transparent">
            {/* Prominent Album Cover Sync */}
            <motion.div
              key={displayTrack?.id}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="hidden md:block w-48 h-48 lg:w-60 lg:h-60 shrink-0 relative group/cover rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/5"
            >
              <img
                src={displayTrack?.coverUrl || 'https://picsum.photos/600/600'}
                className="w-full h-full object-cover transition-transform duration-1000 group-hover/cover:scale-110"
                alt={displayTrack?.title}
              />
              {isPlaying && currentTrack?.id === displayTrack?.id && (
                <div className="absolute bottom-3 right-3 flex gap-1 items-end h-6">
                  <div className="w-1 bg-accent animate-[bounce_1s_infinite_0.1s]" />
                  <div className="w-1 bg-accent animate-[bounce_1s_infinite_0.2s]" />
                  <div className="w-1 bg-accent animate-[bounce_1s_infinite_0.3s]" />
                </div>
              )}
            </motion.div>

            <div className="flex-1 max-w-2xl space-y-5">
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 rounded bg-accent/20 border border-accent/30 text-accent text-[9px] font-black uppercase tracking-widest">
                  {currentTrack?.id === displayTrack?.id ? 'Now Playing' : "Editor's Choice"}
                </span>
                <div className="h-px w-8 bg-white/10" />
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest text-nowrap">
                  {currentTrack?.id === displayTrack?.id ? 'Live Audio' : 'Featured New Release'}
                </span>
              </div>

              <h1 className="text-4xl lg:text-7xl font-black text-white tracking-tighter leading-[0.9] drop-shadow-2xl font-brand">
                {displayTrack?.title || "Limitless Audio"}
              </h1>
              <p className="text-lg font-medium text-white/50 max-w-lg drop-shadow-lg leading-relaxed">
                {currentTrack?.id === displayTrack?.id ? 'You are currently vibing to ' : 'Experience the latest masterpiece by '}
                <span className="text-white font-bold">{displayTrack?.artist.name || "Collective Arts"}</span>.
              </p>

              <div className="flex items-center gap-6 pt-4">
                <button
                  onClick={() => displayTrack && (currentTrack?.id === displayTrack?.id ? togglePlay() : setTrack(displayTrack))}
                  className="flex items-center gap-3 text-white hover:text-accent transition-all group/btn"
                >
                  <div className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center group-hover/btn:border-accent group-hover/btn:bg-accent/10 transition-all">
                    {isPlaying && currentTrack?.id === displayTrack?.id ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
                  </div>
                  <span className="text-sm font-bold uppercase tracking-[0.2em]">
                    {isPlaying && currentTrack?.id === displayTrack?.id ? 'Pause Stream' : 'Listen Now'}
                  </span>
                </button>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" className="rounded-full h-12 w-12 p-0 text-white/60 hover:text-white hover:bg-white/10 transition-colors">
                    <Plus size={20} />
                  </Button>
                  <Button variant="ghost" className="rounded-full h-12 w-12 p-0 text-white/60 hover:text-white hover:bg-white/10 transition-colors">
                    <Info size={20} />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* DENSE CONTENT ROWS */}
      <div className="space-y-12">
        <ContentRow
          title="Featured Now"
          subtitle="Top picks from the editorial team"
          items={featuredTracks || []}
          seeAllHref="/featured"
        />

        <ContentRow
          title="Trending Sounds"
          subtitle="What the community is vibing to"
          items={trendingTracks || []}
          seeAllHref="/trending"
        />

        <ContentRow
          title="Made For You"
          subtitle="Precision curation based on your taste"
          items={madeForYou}
        />

        <ContentRow
          title="New Arrivals"
          subtitle="Freshly pressed from the studio"
          items={newReleases}
        />

        <ContentRow
          title="Deep Focus"
          subtitle="Minimalist textures for maximum output"
          items={focusWave}
        />

        <ContentRow
          title="Recently Discovered"
          subtitle="New additions to the expanding archive"
          items={chillPicks}
        />

        {/* Additional Category Based Row */}
        <ContentRow
          title="Midnight Lounge"
          subtitle="Smooth lo-fi for the after-hours"
          items={allTracks?.filter(t => t.genre === 'Lo-Fi').slice(0, 12) || []}
        />

        <ContentRow
          title="Essential Classics"
          subtitle="Foundation tracks that defined the sound"
          items={allTracks?.slice(22, 34) || []}
        />
      </div>
    </div>
  );
}
