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
import { getMediaUrl, cn, cleanTitle } from "@/lib/utils";
import { MobileHomePage } from "@/components/mobile/MobileHomePage";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function Home() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const { currentTrack, isPlaying, togglePlay, setTrack } = usePlayerStore();
  const openDownloadModal = useUIStore(state => state.openDownloadModal);

  const { data: homepageData, isLoading: isAllLoading } = useQuery({
    queryKey: ['homepage-sections-v2'],
    queryFn: async () => {
      const res = await api.get('/homepage');
      return res.data;
    },
    staleTime: 1000 * 60 * 5,
    refetchOnMount: true,
  });

  const allTracks = homepageData?.sections?.find((s: any) => s.type === 'most_played')?.items || [];
  const featuredTracks = homepageData?.sections?.find((s: any) => s.type === 'trending')?.items || [];
  const trendingTracks = homepageData?.sections?.find((s: any) => s.type === 'trending')?.items || [];


  const isError = !isAllLoading && !allTracks && !currentTrack;

  if (isError) {
    console.error("Connection error details:", {
      apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://10.28.127.186:3000/api',
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

  const isLoading = isAllLoading && !currentTrack;

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

  const newReleases = allTracks || [];
  const focusWave = allTracks?.filter(t => t.genre === 'Focus') || [];

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
      <AnimatePresence>
        {currentTrack && (
          <motion.div
            initial={{ opacity: 0, height: 0, scale: 0.95 }}
            animate={{ opacity: 1, height: "auto", scale: 1 }}
            exit={{ opacity: 0, height: 0, scale: 0.95 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="px-4 md:px-6 mb-8 overflow-hidden"
          >
            <div className="relative h-[360px] rounded-3xl overflow-hidden group shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] border border-white/5">
              {/* Label name - bottom right corner */}
              <div className="absolute bottom-4 right-6 z-20 pointer-events-none">
                <span className="text-[11px] font-semibold text-white/40 font-sans tracking-normal">
                  @{displayTrack?.artist.name ? displayTrack.artist.name.replace(/\s+/g, '').toLowerCase() : 'zenifystudio'}
                </span>
              </div>
              {/* Album art as blurred bg */}
              <AnimatePresence>
                <motion.div
                  key={displayTrack?.id || 'empty'}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.2, ease: "easeInOut" }}
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `url(${getMediaUrl(displayTrack?.coverUrl) || '/logo.png'})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'blur(40px)',
                    transform: 'scale(1.15)',
                  }}
                />
              </AnimatePresence>
              {/* Dark overlay on top of blurred bg */}
              <div className="absolute inset-0 bg-black/70" />

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
                <div className="shrink-0">
                  <div className="w-48 h-48 sm:w-56 sm:h-56 md:w-64 md:h-64 relative group/cover rounded-3xl overflow-hidden shadow-[0_32px_80px_-16px_rgba(0,0,0,0.8)] border border-white/10 ring-1 ring-white/5 bg-zinc-900">
                    <img
                      src={getMediaUrl(displayTrack?.coverUrl) || '/logo.png'}
                      className="w-full h-full object-cover"
                      alt={displayTrack?.title}
                    />

                    {/* Micro Visualizer Overlay (4 Lines) */}
                    <AnimatePresence>
                      {isPlaying && currentTrack?.id === displayTrack?.id && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute bottom-4 left-4 flex items-center justify-center pointer-events-none z-10"
                        >
                          <div className="flex items-end gap-[4px] h-6">
                            {[0.2, 0.4, 0.1, 0.5].map((delay, i) => (
                              <motion.div
                                key={i}
                                animate={{
                                  height: ["30%", "100%", "30%"],
                                }}
                                transition={{
                                  duration: 0.8,
                                  repeat: Infinity,
                                  ease: "easeInOut",
                                  delay: delay
                                }}
                                className="w-[5px] bg-brand rounded-full shadow-[0_0_15px_rgba(var(--accent-brand-rgb),0.6)]"
                              />
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="flex-1 space-y-2 min-w-0">


                  <h1 className="text-3xl md:text-4xl lg:text-5xl font-medium text-white tracking-tighter leading-tight font-brand pt-2 pb-1 drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)] line-clamp-2 break-words">
                    {cleanTitle(displayTrack?.title) || "Limitless Audio"}
                  </h1>

                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-white/70 text-base md:text-xl font-medium">
                      <span>{displayTrack?.artist.name || "Collective Arts"}</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                      <span className="text-brand font-bold tracking-widest text-sm md:text-base">
                        {formatTime(duration)}
                      </span>
                      <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                      <span className="tracking-[0.15em] text-xs md:text-sm">
                        {displayTrack?.genre || 'Ambient'}
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          if (!displayTrack) return;
                          useUIStore.getState().setPlayerMinimized(false);
                          if (currentTrack?.id === displayTrack?.id) {
                            togglePlay();
                          } else {
                            setTrack(displayTrack);
                          }
                        }}
                        className="rounded-full h-12 px-6 border border-brand/40 bg-transparent text-brand hover:bg-transparent hover:text-brand active:bg-transparent transition-none flex items-center gap-3 group/play font-black tracking-[0.2em] uppercase text-xs"
                      >
                        <div className="flex items-center justify-center">
                          {isPlaying && currentTrack?.id === displayTrack?.id ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
                        </div>
                        <span>
                          {isPlaying && currentTrack?.id === displayTrack?.id ? 'PAUSE' : 'PLAY NOW'}
                        </span>
                      </Button>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          onClick={() => displayTrack && openDownloadModal(displayTrack)}
                          className="rounded-full h-12 w-12 border border-brand/30 bg-brand/10 backdrop-blur-xl text-brand hover:bg-brand hover:text-white transition-all shadow-[0_0_20px_rgba(var(--accent-brand-rgb),0.2)]"
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* DENSE CONTENT ROWS */}
      <div className="space-y-12 px-4 md:px-6">
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
