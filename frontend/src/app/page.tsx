"use client";

import { useHomepageData } from "@/hooks/useHomepageData";
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
import { LiquidBackground } from "@/components/shared/LiquidBackground";
import { useIsMobile } from "@/hooks/useIsMobile";

const SPRING = { type: "spring", stiffness: 180, damping: 26, mass: 0.9 } as const;

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
 const isLyricsOpen = useUIStore(state => state.isLyricsOpen);
 const isHomeActive = pathname === '/' && !isFullScreenPlayerOpen && !isLyricsOpen;

 const { sections, isLoading: isAllLoading, isError: fetchError } = useHomepageData();

 // Extract items but strictly filter out non-playable entities (Artists/Albums/Moods/Playlists) from the "Tracks" stream
 const allTracks = sections?.flatMap((s: any) => s.items || []).filter((item: any) => 
 !item.isArtist && !item.isAlbum && !item.isMood && !item.isPlaylist
 ) || [];
 
 // Featured/Trending should also be strictly tracks for hero display
 const trendingSection = sections?.find((s: any) => s.type === 'trending');
 const trendingTracks = trendingSection?.items?.filter((item: any) => 
 !item.isArtist && !item.isAlbum && !item.isMood && !item.isPlaylist
 ) || [];
 
 const featuredTracks = trendingTracks.length > 0 ? trendingTracks : allTracks;


 const isError = !isAllLoading && sections.length === 0 && !currentTrack && fetchError;

 if (isError) {
 console.error("Connection error details:", {
 apiUrl: (import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL) || 'Local Engine (3000)',
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
 Attempting: {(import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL) || 'Local Engine (3000)'}
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
    <div className="space-y-8 md:space-y-12 pb-24 pt-[80px] md:pt-[88px] min-h-screen bg-background">

 <AnimatePresence mode="wait">
 {displayTrack && (
 <motion.div 
 key="hero-showcase"
 initial={{ height: 0, opacity: 0, marginTop: -20 }}
 animate={{ height: 'auto', opacity: 1, marginTop: 0 }}
 exit={{ height: 0, opacity: 0 }}
 transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} className="px-4 md:px-6 mb-12"
 >
 <motion.div layout transition={SPRING} className={cn("relative w-full group overflow-hidden rounded-xl shadow-[0_45px_130px_-20px_rgba(0,0,0,0.5)] border border-white/20 bg-black/40 backdrop-blur-md", isLyricsOpen ? "h-[310px]" : "h-[380px]")} style={{ isolation: "isolate", transform: "translateZ(0)" }}>
 {isHomeActive ? (
 <div className="absolute inset-0 z-0">
 <LiquidBackground coverUrl={loadedCover} />
 </div>
 ) : (
 !(isLyricsOpen || isFullScreenPlayerOpen) && (
 <div className="absolute inset-0 z-0 opacity-40">
 <div 
 className="absolute inset-0"
 style={{
 background: `radial-gradient(circle at 20% 30%, #222 0%, transparent 70%), radial-gradient(circle at 80% 70%, #111 0%, transparent 70%)`,
 backgroundSize: '150% 150%',
 animation: 'mist-drift 8s ease-in-out infinite alternate',
 filter: 'blur(60px)'
 }}
 />
 </div>
 )
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
 <motion.div layout transition={SPRING} className={cn("relative rounded-lg overflow-hidden shadow-[0_32px_80px_-16px_rgba(0,0,0,0.8)] border border-white/10 ring-1 ring-white/5 bg-zinc-900", isLyricsOpen ? "w-[150px] md:w-[170px] lg:w-[185px] xl:w-[200px] h-[150px] md:h-[170px] lg:h-[185px] xl:h-[200px]" : "w-[42vw] sm:w-[200px] md:w-[240px] lg:w-[260px] xl:w-[280px] h-[42vw] sm:h-[200px] md:h-[240px] lg:h-[260px] xl:h-[280px]")}>
 <img
 src={getMediaUrl(displayTrack.coverUrl) || '/logo.png'}
 className="w-full h-full object-cover"
 alt={displayTrack.title}
 />
 {/* Glass Polish layer for depth */}
 <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-white/5 pointer-events-none" />
 </motion.div>
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
 "font-normal text-white tracking-widest font-brand drop-shadow-2xl leading-none max-w-full py-2 truncate whitespace-nowrap transition-all",
 isLyricsOpen
 ? (isVeryLongTitle ? "text-2xl md:text-3xl lg:text-4xl" : "text-3xl md:text-4xl lg:text-5xl")
 : (isVeryLongTitle ? "text-3xl md:text-4xl lg:text-5xl" : isLongTitle ? "text-4xl md:text-5xl lg:text-6xl" : "text-5xl md:text-6xl lg:text-7xl")
 )}>
 {displayTitle}
 </h1>
 
 <div className="flex items-center gap-4 text-[12px] font-bold tracking-[0.2em]">
 <span className="text-white/60">{formatDisplayTitle(displayTrack.artist?.name) || <><span className="font-zenify">zenify</span> Artist</>}</span>
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
 ? "bg-white/5 border border-white/10 text-brand"
 : "bg-zinc-900/10 border border-brand/30 text-brand hover:bg-zinc-900/20 hover:border-brand shadow-brand/10"
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
 </motion.div>
 </motion.div>
 )}
 </AnimatePresence>



 <div className="space-y-16 px-0 mt-6">
 {(!allTracks || allTracks.length === 0) && !isAllLoading ? (
 <div className="flex flex-col items-center justify-center py-24 px-6 text-center border border-dashed border-white/5 rounded-3xl bg-white/[0.02] mx-4 md:mx-6">
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
 ? <>Your sonic journey begins here. Be the first to upload a frequency to the <span className="font-zenify">zenify</span> network.</>
 : "We are currently adding new music to the archive. This section will be ready for you very soon!"
 }
 </p>
 {user?.role === 'ADMIN' && (
 <Button
 onClick={() => router.push('/admin')}
 className="rounded-full h-10 px-8 bg-white/10 text-brand border border-white/5 hover:bg-white/20 font-bold uppercase tracking-wider text-[10px]"
 >
 Admin Console
 </Button>
 )}
 </div>
 ) : (
 <>
 {sections?.map((section: any) => (
 (section.isLoading || (section.items && section.items.length > 0)) && (
 <ContentRow
 key={section.type}
 title={section.title}
 subtitle={section.subtitle}
 items={section.items}
 isLoading={section.isLoading}
 seeAllHref={`/section/${section.type}`}
 />
 )
 ))}</>
 )}
 </div>
 </div>
 );
}
