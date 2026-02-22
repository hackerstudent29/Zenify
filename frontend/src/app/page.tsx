"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track } from "@/store/player";
import { useAuthStore } from "@/store/authStore";
import { usePlayerStore } from "@/store/player";
import { Button } from "@/components/ui/button";
import { Play, Pause, Info, Plus, Music } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ContentRow } from "@/components/shared/ContentRow";
import { getMediaUrl } from "@/lib/utils";

export default function Home() {
  const router = useRouter();
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

  const isError = !isFeaturedLoading && !isTrendingLoading && !isAllLoading && (!featuredTracks || !allTracks);

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

  const isLoading = isFeaturedLoading || isTrendingLoading || isAllLoading;

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
  const chillPicks = allTracks?.reverse().slice(0, 12) || [];

  // Dynamic Hero Track - reflect current playback or fallback to featured
  const heroTrackFallback = featuredTracks?.[0] || allTracks?.[0];
  const displayTrack = currentTrack || heroTrackFallback;

  return (
    <div className="space-y-8 md:space-y-12 pb-24 pt-2 md:pt-4">
      {/* COMPACT HERO SECTION */}
      <div className="px-4 md:px-6">
        <div className="relative h-[360px] rounded-3xl overflow-hidden group shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)]">
          {/* Dynamic Background with slower, elegant transition */}
          <AnimatePresence mode="wait">
            <motion.div
              key={displayTrack?.id}
              initial={{ opacity: 0, scale: 1.1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              className="absolute inset-0 transition-transform duration-[30s] ease-linear group-hover:scale-110 bg-cover bg-center bg-no-repeat"
              style={{
                backgroundImage: `linear-gradient(rgba(8,8,9,0.2), rgba(8,8,9,0.95)), url(${getMediaUrl(displayTrack?.coverUrl) || 'https://picsum.photos/1200/800'})`,
              }}
            />
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
            <motion.div
              key={displayTrack?.id}
              initial={{ opacity: 0, filter: "blur(20px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              transition={{ duration: 1.8, ease: "easeOut" }}
            >
              <motion.div
                animate={{
                  y: [0, -4, 0]
                }}
                transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
                className="hidden md:block w-52 h-52 lg:w-64 lg:h-64 shrink-0 relative group/cover rounded-2xl overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] border border-white/10 ring-1 ring-white/5"
              >
                <img
                  src={getMediaUrl(displayTrack?.coverUrl) || 'https://picsum.photos/600/600'}
                  className="w-full h-full object-cover transition-all duration-1000 group-hover:scale-105"
                  alt={displayTrack?.title}
                />

                {/* Subtle Reflection */}
                <div className="absolute inset-0 bg-gradient-to-tr from-white/5 via-transparent to-transparent opacity-0 group-hover/cover:opacity-100 transition-opacity duration-1000" />

                {isPlaying && currentTrack?.id === displayTrack?.id && (
                  <div className="absolute bottom-5 left-5 flex gap-1.5 items-end h-8">
                    <motion.div animate={{ height: [8, 24, 12, 20, 8] }} transition={{ duration: 1.2, repeat: Infinity }} className="w-1.5 bg-accent rounded-full" />
                    <motion.div animate={{ height: [16, 20, 28, 12, 16] }} transition={{ duration: 1.0, repeat: Infinity }} className="w-1.5 bg-accent rounded-full" />
                    <motion.div animate={{ height: [20, 12, 20, 28, 16] }} transition={{ duration: 1.3, repeat: Infinity }} className="w-1.5 bg-accent rounded-full" />
                    <motion.div animate={{ height: [12, 28, 16, 8, 20] }} transition={{ duration: 1.5, repeat: Infinity }} className="w-1.5 bg-accent rounded-full" />
                  </div>
                )}
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 1.5 }}
              className="flex-1 max-w-2xl space-y-6"
            >
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded bg-accent/20 border border-accent/40 text-accent text-[9px] font-black uppercase tracking-[0.2em]">
                  {currentTrack?.id === displayTrack?.id ? 'System Live' : "Top Pick"}
                </span>
                <div className="h-px w-8 bg-white/20" />
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-[0.3em]">
                  {currentTrack?.id === displayTrack?.id ? 'Audio Synchronized' : 'Featured Production'}
                </span>
              </div>

              <h1 className="text-4xl md:text-7xl font-black text-white tracking-tighter leading-[0.85] drop-shadow-2xl font-brand truncate max-w-[800px] py-1">
                {displayTrack?.title || "Limitless Audio"}
              </h1>

              <div className="space-y-1">
                <p className="text-xl font-medium text-white/70 drop-shadow-lg italic">
                  {displayTrack?.artist.name || "Collective Arts"}
                </p>
                <p className="text-sm text-white/40 max-w-lg leading-relaxed line-clamp-2 uppercase tracking-widest font-semibold">
                  {displayTrack?.genre || 'Sonic'} • {displayTrack?.id.toString().slice(0, 8).toUpperCase()}
                </p>
              </div>

              <div className="flex items-center gap-3 md:gap-4 pt-2 md:pt-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => displayTrack && (currentTrack?.id === displayTrack?.id ? togglePlay() : setTrack(displayTrack))}
                  className="flex items-center gap-3 md:gap-4 bg-white px-6 md:px-8 py-2.5 md:py-3.5 rounded-full text-black hover:bg-accent hover:text-white transition-all duration-300"
                >
                  {isPlaying && currentTrack?.id === displayTrack?.id ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                  <span className="text-[11px] font-black uppercase tracking-[0.2em]">
                    {isPlaying && currentTrack?.id === displayTrack?.id ? 'Pause Transmission' : 'Play Sequence'}
                  </span>
                </motion.button>

                <div className="flex items-center gap-2">
                  <Button variant="ghost" className="rounded-full h-12 w-12 border border-white/5 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all">
                    <Plus size={18} />
                  </Button>
                  <Button variant="ghost" className="rounded-full h-12 w-12 border border-white/5 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all">
                    <Info size={18} />
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>


      {/* DENSE CONTENT ROWS */}
      <div className="space-y-12">
        {(!allTracks || allTracks.length === 0) && !isLoading ? (
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
