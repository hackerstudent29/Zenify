"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track } from "@/store/player";
import { useAuthStore } from "@/store/authStore";
import { usePlayerStore } from "@/store/player";
import { Button } from "@/components/ui/button";
import { Play, Pause, Info, Plus, Music, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ContentRow } from "@/components/shared/ContentRow";
import { getMediaUrl } from "@/lib/utils";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
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
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] gap-6 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <Info className="text-red-500 w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-white uppercase tracking-widest">Connection Refused</h2>
          <p className="text-xs text-white/40 max-w-xs leading-relaxed uppercase tracking-wider font-bold">The Archive is currently unreachable.</p>
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
        <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-muted-dark animate-pulse">Synchronizing</p>
      </div>
    );
  }

  const displayTrack = currentTrack || featuredTracks?.[0] || allTracks?.[0];

  return (
    <div className="space-y-12 pb-24 pt-4 px-4 md:px-8">
      {/* HERO SPOTLIGHT */}
      <div className="relative mb-8 md:mb-16">
        <div className="relative h-[400px] md:h-[600px] rounded-[2rem] md:rounded-[3rem] overflow-hidden group/hero border border-white/5 shadow-2xl">
          <div className="absolute inset-0 bg-[#0E0F13]">
            <AnimatePresence mode="wait">
              <motion.img
                key={displayTrack?.id}
                initial={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
                animate={{ opacity: 0.4, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.95, filter: 'blur(20px)' }}
                transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                src={getMediaUrl(displayTrack?.coverUrl) || `https://api.dicebear.com/7.x/identicon/svg?seed=${displayTrack?.id}`}
                className="w-full h-full object-cover"
              />
            </AnimatePresence>
            <div className="absolute inset-0 bg-gradient-to-t from-[#0E0F13] via-[#0E0F13]/40 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0E0F13] via-transparent to-transparent" />
          </div>

          <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-16">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="max-w-3xl space-y-4 md:space-y-8"
            >
              <div className="flex items-center gap-3">
                <div className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-[10px] md:text-[11px] font-bold text-white/60 tracking-[0.2em] uppercase">
                  {currentTrack?.id === displayTrack?.id ? 'Live Frequency' : 'Editorial Spotlight'}
                </div>
                {displayTrack?.genre && (
                  <div className="px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-[10px] md:text-[11px] font-bold text-accent tracking-[0.2em] uppercase">
                    {displayTrack.genre}
                  </div>
                )}
              </div>

              <div className="space-y-1 md:space-y-2">
                <h1 className="text-4xl md:text-8xl font-black text-white tracking-tighter leading-[0.9] drop-shadow-2xl">
                  {displayTrack?.title}
                </h1>
                <p className="text-lg md:text-2xl font-medium text-white/50 tracking-tight flex items-center gap-3">
                  {displayTrack?.artist.name}
                  {displayTrack?.isFeatured && <Sparkles size={16} className="text-amber-400" />}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 md:gap-4 pt-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => displayTrack && (currentTrack?.id === displayTrack?.id ? togglePlay() : setTrack(displayTrack))}
                  className="flex items-center justify-center gap-3 md:gap-4 bg-white px-6 md:px-8 py-3 md:py-3.5 rounded-full text-black hover:bg-accent hover:text-white transition-all duration-300 shadow-xl"
                >
                  {isPlaying && currentTrack?.id === displayTrack?.id ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                  <span className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em]">
                    {isPlaying && currentTrack?.id === displayTrack?.id ? 'Pause' : 'Play Sequence'}
                  </span>
                </motion.button>

                <div className="flex items-center gap-2">
                  <Button variant="ghost" className="rounded-full h-10 w-10 md:h-12 md:w-12 border border-white/5 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all">
                    <Plus size={18} />
                  </Button>
                  <Button variant="ghost" className="hidden md:flex rounded-full h-12 w-12 border border-white/5 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all">
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
              title="Trending"
              subtitle="What's hot right now"
              items={trendingTracks || []}
              seeAllHref="/trending"
            />
            <ContentRow
              title="New Releases"
              subtitle="Fresh from the network"
              items={allTracks?.slice(0, 12) || []}
            />
          </>
        )}
      </div>
    </div>
  );
}
