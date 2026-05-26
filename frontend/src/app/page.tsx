"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track } from "@/store/player";
import { TopPickCard } from "@/components/shared/TopPickCard";
import { useAuthStore } from "@/store/authStore";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { Button } from "@/components/ui/button";
import { Play, Pause, Info, Music } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ContentRow } from "@/components/shared/ContentRow";
import { getMediaUrl, cn, cleanTitle, formatDisplayTitle, getTrackCover } from "@/lib/utils";
import { MobileHomePage } from "@/components/mobile/MobileHomePage";
import { ReactiveAudioBackground } from "@/components/player/ReactiveAudioBackground";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function Home() {
  const isMobile = useIsMobile();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const { currentTrack, isPlaying, togglePlay, setTrack, duration } = usePlayerStore();
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    if (isPlaying) setHasInteracted(true);
  }, [isPlaying]);
  const openDownloadModal = useUIStore(state => state.openDownloadModal);
  const pathname = usePathname();
  const isFullScreenPlayerOpen = useUIStore(state => state.isFullScreenPlayerOpen);
  const isHomeActive = pathname === '/' && !isFullScreenPlayerOpen;

  const { data: homepageData, isLoading: isAllLoading } = useQuery({
    queryKey: ['homepage-sections-v2'],
    queryFn: async () => {
      const res = await api.get('/homepage');
      return res.data;
    },
    staleTime: 1000 * 60 * 5,
  });

  // Extract items but strictly filter out non-playable entities (Artists/Albums) from the "Tracks" stream
  const allTracks = homepageData?.sections?.flatMap((s: any) => s.items || []).filter((item: any) => !item.isArtist && !item.isAlbum) || [];
  
  // Featured/Trending should also be strictly tracks for hero display
  const trendingSection = homepageData?.sections?.find((s: any) => s.type === 'trending');
  const trendingTracks = trendingSection?.items?.filter((item: any) => !item.isArtist && !item.isAlbum) || [];
  
  const featuredTracks = trendingTracks.length > 0 ? trendingTracks : allTracks;


  const isError = !isAllLoading && !homepageData && !currentTrack;

  if (isError) {
    console.error("Connection error details:", {
      apiUrl: import.meta.env.NEXT_PUBLIC_API_URL || 'Local Engine (3000)',
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
            Attempting: {import.meta.env.NEXT_PUBLIC_API_URL || 'Local Engine (3000)'}
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

  const isLoading = isAllLoading && !currentTrack;
  
  const formatTime = (time: number) => {
    if (!time) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };
  
  // Define displayTrack
  const heroTrackFallback = featuredTracks?.[0] || allTracks?.[0];
  const displayTrack = hasInteracted ? currentTrack : null;
  const displayTitle = formatDisplayTitle(displayTrack?.title);
  const isVeryLongTitle = (displayTitle || "").length > 25;
  const isLongTitle = (displayTitle || "").length > 18;

  // Background Preloading logic (Mirroring PCFullScreenPlayer for perfect sync)
  const [loadedCover, setLoadedCover] = useState("/logo.png");

  useEffect(() => {
    if (!displayTrack) return;
    const coverToLoad = getTrackCover(displayTrack);
    
    // Quick skip if same
    if (coverToLoad === loadedCover) return;

    const img = new Image();
    img.src = coverToLoad;
    img.onload = () => {
      setLoadedCover(coverToLoad);
    };
  }, [displayTrack?.id]);

  if (!isMounted) {
    return <div className="h-screen w-full bg-background" />;
  }

  return isMobile ? <MobileHomePage /> : (
    <div className="space-y-8 md:space-y-12 pb-24 pt-2 md:pt-4">

      <AnimatePresence mode="wait">
        {displayTrack && (
          <motion.div 
            key="hero-showcase"
            initial={{ height: 0, opacity: 0, marginTop: -20 }}
            animate={{ height: 'auto', opacity: 1, marginTop: 0 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="px-4 md:px-6 mb-12 overflow-hidden"
          >
            <div className="relative h-[380px] w-full group overflow-hidden rounded-xl shadow-[0_45px_130px_-20px_rgba(0,0,0,1)] border border-white/10 bg-black">
              {isHomeActive && (
                <ReactiveAudioBackground 
                    coverUrl={loadedCover} 
                    track={displayTrack}
                    className="opacity-100"
                    speedMultiplier={2.2}
                    variant="hero"
                />
              )}
            
              <div className="relative h-full w-full p-6 lg:p-10 flex items-center z-20">
                <div className="flex items-center gap-12 lg:gap-14 w-full mx-auto">
                  {/* Artwork Section */}
                  <motion.div 
                    initial={{ opacity: 0, x: -50, scale: 0.9 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
                    className="shrink-0 relative group/art"
                  >
                    <div className="w-48 h-48 sm:w-56 sm:h-56 md:w-64 md:h-64 relative rounded-lg overflow-hidden shadow-[0_32px_80px_-16px_rgba(0,0,0,0.8)] border border-white/10 ring-1 ring-white/5 bg-zinc-900 transition-all duration-700">
                      <img
                        src={getMediaUrl(displayTrack.coverUrl) || '/logo.png'}
                        className="w-full h-full object-cover"
                        alt={displayTrack.title}
                      />
                      {/* Glass Polish layer for depth */}
                      <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-white/5 pointer-events-none" />
                    </div>
                  </motion.div>

                  {/* Content Area */}
                  <div className="flex-1 text-left min-w-0">
                    <motion.div 
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.8, delay: 0.2 }}
                      className="space-y-4 min-w-0 w-full"
                    >
                      <h1 className={cn(
                        "font-normal text-white tracking-widest font-brand drop-shadow-2xl leading-none max-w-full py-2 truncate whitespace-nowrap",
                        isVeryLongTitle 
                          ? "text-3xl md:text-4xl lg:text-5xl" 
                          : isLongTitle 
                            ? "text-4xl md:text-5xl lg:text-6xl" 
                            : "text-5xl md:text-6xl lg:text-7xl"
                      )}>
                        {displayTitle}
                      </h1>
                      
                      <div className="flex items-center gap-4 text-[12px] font-bold tracking-[0.2em]">
                         <span className="text-white/60">{formatDisplayTitle(displayTrack.artist?.name) || "Zenify Artist"}</span>
                         <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                         <span className="text-brand tabular-nums">{formatTime(duration)}</span>
                         <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                         <span className="text-white/60">{formatDisplayTitle(displayTrack.genre) || "Electronic"}</span>
                      </div>
                    </motion.div>

                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.8, delay: 0.4 }}
                      className="flex items-center pt-10"
                    >
                      <button 
                        onClick={togglePlay}
                        className={cn(
                          "h-12 px-10 rounded-full flex items-center gap-3 transition-all active:scale-95 group/play shadow-2xl relative overflow-hidden",
                          isPlaying && currentTrack?.id === displayTrack.id
                            ? "bg-white/5 border border-white/10 text-white"
                            : "bg-brand/10 border border-brand/30 text-brand hover:bg-brand/20 hover:border-brand shadow-brand/10"
                        )}
                      >
                        {isPlaying && currentTrack?.id === displayTrack.id ? (
                          <>
                            <Pause size={18} fill="currentColor" strokeWidth={0} />
                            <span className="text-[10px] font-black uppercase tracking-[0.3em]">PAUSE</span>
                          </>
                        ) : (
                          <>
                            <Play size={18} fill="currentColor" strokeWidth={0} className="ml-0.5" />
                            <span className="text-[10px] font-black uppercase tracking-[0.3em]">PLAY NOW</span>
                          </>
                        )}
                        <div className={cn(
                          "absolute inset-0 opacity-0 group-hover/play:opacity-20 transition-opacity blur-xl",
                          isPlaying ? "bg-white" : "bg-brand"
                        )} />
                      </button>
                    </motion.div>
                  </div>
                </div>

                <div className="absolute bottom-10 right-12 flex items-center gap-3 select-none opacity-40">
                  <span className="text-[10px] font-black uppercase tracking-[0.5em] text-white/50">
                    @{displayTrack.artist?.name?.replace(/\s+/g, '').toLowerCase() || "zenify"}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>



      <div className="space-y-16 px-4 md:px-6 mt-6">
        <ContentRow
          title="Featured Now"
          subtitle="TOP PICKS FROM THE EDITORIAL TEAM"
          items={featuredTracks || []}
          seeAllHref="/featured"
        />
        {(!allTracks || allTracks.length === 0) && !isAllLoading ? (
          <div className="flex flex-col items-center justify-center py-24 px-6 text-center border border-dashed border-white/5 rounded-3xl bg-white/[0.02]">
            <div className="w-16 h-16 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center mb-6">
              <Music className="text-brand w-8 h-8" />
            </div>
            <h2 className={cn(
              "text-xl font-bold mb-2 uppercase tracking-widest transition-colors duration-500",
              user?.role === 'ADMIN' ? "text-white" : "text-brand drop-shadow-[0_0_8px_rgba(var(--accent-brand-rgb),0.4)]"
            )}>
              {user?.role === 'ADMIN' ? "The Archive is Empty" : "Coming Soon"}
            </h2>
            <p className={cn(
              "text-sm max-w-sm mb-8 leading-relaxed font-medium transition-colors duration-500",
              user?.role === 'ADMIN' ? "text-white/40" : "text-brand/60"
            )}>
              {user?.role === 'ADMIN'
                ? "Your sonic journey begins here. Be the first to upload a frequency to the Zenify network."
                : "We are currently adding new music to the archive. This section will be ready for you very soon!"
              }
            </p>
            {user?.role === 'ADMIN' && (
              <Button
                onClick={() => router.push('/admin')}
                className="rounded-full h-10 px-8 bg-brand hover:bg-brand text-white font-bold uppercase tracking-wider text-[10px]"
              >
                Admin Console
              </Button>
            )}
          </div>
        ) : (
          <>
            {homepageData?.sections?.map((section: any) => (
              section.items && section.items.length > 0 && (
                <ContentRow
                  key={section.type}
                  title={section.title}
                  subtitle={section.subtitle}
                  items={section.items}
                />
              )
            ))}
          </>
        )}
      </div>
    </div>
  );
}
