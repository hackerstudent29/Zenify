"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track } from "@/store/player";
import { useAuthStore } from "@/store/authStore";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { Button } from "@/components/ui/button";
import { Play, Pause, Info, Plus, Music, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ContentRow } from "@/components/shared/ContentRow";
import { getMediaUrl } from "@/lib/utils";
import { MobileHomePage } from "@/components/mobile/MobileHomePage";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function Home() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const { currentTrack, isPlaying, togglePlay, setTrack } = usePlayerStore();
  const openDownloadModal = useUIStore(state => state.openDownloadModal);

  const { data: featuredTracks, isLoading: isFeaturedLoading } = useQuery({
    queryKey: ['tracks-featured-v2'],
    queryFn: async () => {
      const res = await api.get('/tracks/featured');
      return res.data as Track[];
    },
    staleTime: 1000 * 60 * 30, // 30 mins
    gcTime: 1000 * 60 * 60, // 1 hour
    refetchOnMount: true,
  });

  const { data: trendingTracks, isLoading: isTrendingLoading } = useQuery({
    queryKey: ['tracks-trending-v2'],
    queryFn: async () => {
      const res = await api.get('/tracks/trending');
      return res.data as Track[];
    },
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    refetchOnMount: true,
  });

  const { data: allTracks, isLoading: isAllLoading } = useQuery({
    queryKey: ['tracks-all-v2'],
    queryFn: async () => {
      const res = await api.get('/tracks');
      return res.data.items as Track[];
    },
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
    refetchOnMount: true,
  });

  const isError = !isFeaturedLoading && !isTrendingLoading && !isAllLoading && !allTracks && !currentTrack;

  if (isError) {
    console.error("Connection error details:", {
      apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3000/api',
      featured: !!featuredTracks,
      all: !!allTracks
    });

    return (
      <div className="flex flex-col items-center justify-center h-[80vh] gap-6 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <Info className="text-red-500 w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-white uppercase tracking-widest">Connection Refused</h2>
          <p className="text-xs text-white/40 max-w-xs leading-relaxed uppercase tracking-wider font-bold">The Archive is currently unreachable. Please check your connection or try again.</p>
          <p className="text-[10px] text-white/20 uppercase tracking-[0.2em] mt-4">
            Attempting: {process.env.NEXT_PUBLIC_API_URL || 'Local Engine (3000)'}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => window.location.reload()}
          className="rounded-full px-8 bg-white/5 border-white/10 hover:bg-white/10"
        >
          Retry Connection
        </Button>
      </div>
    );
  }

  const isLoading = (isFeaturedLoading || isTrendingLoading || isAllLoading) && !currentTrack;

  if (isLoading && !isAuthenticated) {
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
  const chillPicks = allTracks ? [...allTracks].reverse().slice(0, 12) : [];

  const formatTime = (time: number) => {
    if (!time) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Dynamic Hero Track - Prioritize current playback (Last Played)
  const heroTrackFallback = featuredTracks?.[0] || allTracks?.[0];
  const displayTrack = currentTrack || heroTrackFallback;

  const { duration } = usePlayerStore();

  return isMobile ? <MobileHomePage /> : (
    <div className="space-y-8 md:space-y-12 pb-24 pt-2 md:pt-4">
      {/* COMPACT HERO SECTION */}
      <div className="px-4 md:px-6">
        <div className="relative h-[360px] rounded-3xl overflow-hidden group shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] border border-white/5">
          {/* Dynamic Background with slower, elegant transition */}
          <AnimatePresence>
            <motion.div
              key={displayTrack?.id || 'empty'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, ease: "easeInOut" }}
              className="absolute inset-0 bg-cover bg-center bg-no-repeat"
              style={{
                backgroundImage: `linear-gradient(rgba(8,8,9,0.3), rgba(8,8,9,0.95)), url(${getMediaUrl(displayTrack?.coverUrl) || 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=1200&q=80'})`,
              }}
            >
              <div className="absolute inset-0 bg-black/20" />
            </motion.div>
          </AnimatePresence>

          {/* Floating particle effect/Glow */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-accent/5 to-transparent opacity-50" />
            <motion.div
              animate={{
                opacity: [0.3, 0.6, 0.3],
                scale: [1, 1.1, 1],
                x: [0, 20, 0],
                y: [0, -20, 0]
              }}
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -top-20 -right-20 w-80 h-80 bg-accent/20 blur-[100px] rounded-full"
            />
          </div>

          <div className="relative h-full flex items-center p-6 md:p-14 gap-6 md:gap-14 bg-gradient-to-t from-[#080809] via-transparent to-transparent">
            {/* Cinematic Blur Reveal Album Cover */}
            <div>
              <div className="hidden md:block w-52 h-52 lg:w-64 lg:h-64 shrink-0 relative group/cover rounded-2xl overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] border border-white/10 ring-1 ring-white/5">
                <img
                  src={getMediaUrl(displayTrack?.coverUrl) || 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=800&q=80'}
                  className="w-full h-full object-cover transition-all duration-1000 group-hover:scale-105"
                  alt={displayTrack?.title}
                />

                {/* 8D Visualizer in Hero */}
                <AnimatePresence>
                  {isPlaying && currentTrack?.id === displayTrack?.id && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute bottom-4 left-4 flex items-center justify-center pointer-events-none z-10"
                    >
                      <div className="flex items-end gap-[3px] h-6">
                        {[0.2, 0.4, 0.1, 0.5, 0.3].map((delay, i) => (
                          <motion.div
                            key={i}
                            animate={{
                              height: ["30%", "100%", "40%", "80%", "30%"],
                            }}
                            transition={{
                              duration: 0.8,
                              repeat: Infinity,
                              ease: "easeInOut",
                              delay: delay
                            }}
                            className="w-1.5 bg-rose-500 rounded-full shadow-[0_0_15px_rgba(244,63,94,0.5)]"
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-hidden">
              <span className="text-[11px] font-black text-rose-500 uppercase tracking-[0.6em] block">
                @{displayTrack?.artist.name ? displayTrack.artist.name.replace(/\s+/g, '').toLowerCase() : "ZenifyStudio"}
              </span>

              <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-white tracking-tighter leading-[0.9] font-brand py-1 drop-shadow-2xl truncate">
                {displayTrack?.title || "Limitless Audio"}
              </h1>

              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-white/50 text-sm md:text-lg font-medium">
                  <span>{displayTrack?.artist.name || "Collective Arts"}</span>
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  <span className="text-rose-500 font-black tracking-widest text-xs md:text-sm">
                    {formatTime(duration)}
                  </span>
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  <span className="uppercase tracking-[0.2em] text-[10px] md:text-xs">
                    {displayTrack?.genre || 'Ambient'}
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    onClick={() => {
                      if (!displayTrack) return;
                      useUIStore.getState().setPlayerMinimized(false);
                      if (currentTrack?.id === displayTrack?.id) {
                        togglePlay();
                      } else {
                        setTrack(displayTrack);
                      }
                    }}
                    className="flex items-center gap-3 px-8 py-3 rounded-full border border-white/20 text-white font-black hover:bg-white hover:text-black transition-all duration-300 shadow-xl group/play"
                  >
                    {isPlaying && currentTrack?.id === displayTrack?.id ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                    <span className="text-[12px] tracking-[0.2em]">
                      {isPlaying && currentTrack?.id === displayTrack?.id ? 'PAUSE' : 'PLAY'}
                    </span>
                  </button>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => displayTrack && openDownloadModal(displayTrack)}
                      className="rounded-full h-12 w-12 border border-rose-500/30 bg-rose-500/10 backdrop-blur-xl text-rose-500 hover:bg-rose-500 hover:text-white transition-all shadow-[0_0_20px_rgba(244,63,94,0.2)]"
                    >
                      <Download size={20} />
                    </Button>
                    <Button
                      variant="ghost"
                      className="rounded-full h-12 w-12 border border-white/20 text-white hover:bg-white hover:text-black transition-all"
                    >
                      <Plus size={20} />
                    </Button>
                    <Button
                      variant="ghost"
                      className="rounded-full h-12 w-12 border border-white/20 text-white hover:bg-white hover:text-black transition-all"
                    >
                      <Info size={20} />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* DENSE CONTENT ROWS */}
      <div className="space-y-12 px-4 md:px-6">
        {(!allTracks || allTracks.length === 0) && !isAllLoading ? (
          <div className="flex flex-col items-center justify-center py-24 px-6 text-center border border-dashed border-white/5 rounded-3xl bg-white/[0.02]">
            <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-6">
              <Music className="text-violet-500 w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2 uppercase tracking-widest">The Archive is Empty</h2>
            <p className="text-sm text-white/40 max-w-sm mb-8 leading-relaxed font-medium">Your sonic journey begins here. Be the first to upload a frequency to the Zenify network.</p>
            <Button
              onClick={() => router.push('/admin/upload')}
              className="rounded-full px-8 bg-violet-600 hover:bg-violet-500 text-white font-bold uppercase tracking-wider text-[10px]"
            >
              Upload First Track
            </Button>
          </div>
        ) : (
          <>
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
          </>
        )}

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
