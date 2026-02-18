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

  // Hero Track - pick the first featured or first all
  const heroTrack = featuredTracks?.[0] || allTracks?.[0];

  return (
    <div className="space-y-12 pb-24 pt-4">
      {/* COMPACT HERO SECTION */}
      <div className="px-6">
        <div className="relative h-[320px] rounded-2xl overflow-hidden group shadow-2xl">
          {/* Dynamic Background with slower, elegant transition */}
          <AnimatePresence mode="wait">
            <motion.div
              key={heroTrack?.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 transition-transform duration-[20s] ease-linear group-hover:scale-110"
              style={{
                background: `linear-gradient(rgba(8,8,9,0.2), rgba(8,8,9,0.9)), url(${heroTrack?.coverUrl || 'https://picsum.photos/1200/800'})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }}
            />
          </AnimatePresence>

          {/* Glass Overlay for Content */}
          <div className="relative h-full flex flex-col justify-end p-8 lg:p-12 gap-4">
            <div className="max-w-2xl space-y-4">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-accent text-[9px] font-black uppercase tracking-widest text-white shadow-lg shadow-accent/20">
                  Editor's Choice
                </span>
                <div className="h-px w-8 bg-white/20" />
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Featured New Release</span>
              </div>

              <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tighter leading-none drop-shadow-2xl">
                {heroTrack?.title || "Limitless Audio"}
              </h1>
              <p className="text-base font-medium text-white/60 truncate max-w-lg drop-shadow-lg">
                Dive into the latest soundscape by <strong className="text-white">{heroTrack?.artist.name || "Collective Arts"}</strong>.
                A perfectly balanced journey through modern rhythms.
              </p>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={() => heroTrack && setTrack(heroTrack)}
                  className="bg-white text-black hover:bg-accent hover:text-white rounded-full px-8 py-6 font-bold text-xs uppercase tracking-widest transition-all shadow-xl"
                >
                  <Play className="mr-2 h-4 w-4 fill-current" />
                  Listen Now
                </Button>
                <Button variant="ghost" className="rounded-full h-12 w-12 p-0 text-white/60 hover:text-white hover:bg-white/10">
                  <Plus size={20} />
                </Button>
                <Button variant="ghost" className="rounded-full h-12 w-12 p-0 text-white/60 hover:text-white hover:bg-white/10">
                  <Info size={20} />
                </Button>
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
