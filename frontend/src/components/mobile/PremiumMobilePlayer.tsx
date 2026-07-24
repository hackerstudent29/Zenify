"use client";

import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate, LayoutGroup } from "framer-motion";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/authStore";
import { 
 Play, Pause, SkipBack, SkipForward, 
 Heart, MoreVertical, ChevronDown, User,
 ListMusic, Sparkles, ScrollText, PlusCircle, Bookmark,
 Download
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn, getTrackCover, formatArtists } from "@/lib/utils";
import * as Slider from "@radix-ui/react-slider";
import { audioEngine } from "@/lib/audio-engine";
import { MobileScrubber, MiniPlayerProgress } from "./../player/PlayerProgress";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuTrigger,
 DropdownMenuSeparator,
 DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { LiquidBackground } from "../shared/LiquidBackground";
import { LyricsView } from "../shared/LyricsView";
import { AnimatedHeartButton } from "@/components/ui/AnimatedHeartButton";
import { AnimatedShareButton } from "@/components/ui/AnimatedShareButton";
import { MarqueeText } from "../shared/MarqueeText";

// ------------------------------------------------------------------
// Image Cache
// ------------------------------------------------------------------
const imageCache = new Set<string>();
function preloadImage(url: string): void {
 if (!url || imageCache.has(url)) return;
 imageCache.add(url);
 const img = new Image();
 img.src = url;
}

// ------------------------------------------------------------------
// HorizontalSwipeArea
// ------------------------------------------------------------------
interface SwipeAreaProps {
 onSwipeLeft: () => void;
 onSwipeRight: () => void;
 children: React.ReactNode;
 className?: string;
 enabled?: boolean;
}

function HorizontalSwipeArea({ onSwipeLeft, onSwipeRight, children, className, enabled = true }: SwipeAreaProps) {
 const startX = useRef(0);
 const startY = useRef(0);
 const isDeterminate = useRef(false);
 const isHorizontal = useRef(false);

 const onTouchStart = useCallback((e: React.TouchEvent) => {
 startX.current = e.touches[0].clientX;
 startY.current = e.touches[0].clientY;
 isDeterminate.current = false;
 isHorizontal.current = false;
 }, []);

 const onTouchMove = useCallback((e: React.TouchEvent) => {
 if (!enabled) return;
 const dx = e.touches[0].clientX - startX.current;
 const dy = e.touches[0].clientY - startY.current;
 const adx = Math.abs(dx);
 const ady = Math.abs(dy);

 if (!isDeterminate.current && (adx > 2 || ady > 2)) {
 isDeterminate.current = true;
 isHorizontal.current = adx > ady;
 }

 if (isHorizontal.current) {
 if (e.cancelable) e.preventDefault();
 e.stopPropagation();
 }
 }, [enabled]);

 const onTouchEnd = useCallback((e: React.TouchEvent) => {
 if (!enabled || !isDeterminate.current || !isHorizontal.current) return;
 const dx = e.changedTouches[0].clientX - startX.current;
 if (isHorizontal.current) {
 e.stopPropagation();
 if (dx < -30) onSwipeLeft();
 else if (dx > 30) onSwipeRight();
 }
 }, [enabled, onSwipeLeft, onSwipeRight]);

 return (
 <div
 className={cn(className, "touch-pan-y")}
 onTouchStart={onTouchStart}
 onTouchMove={onTouchMove}
 onTouchEnd={onTouchEnd}
 onTouchCancel={() => { isDeterminate.current = false; }}
 >
 {children}
 </div>
 );
}

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------
export function PremiumMobilePlayer({ hidePlayer = false }: { hidePlayer?: boolean }) {
  const { 
    isFullScreenPlayerOpen, 
    setFullScreenPlayerOpen, 
    isQueueOpen, 
    setIsQueueOpen,
    setAudioFxOpen,
    openDownloadModal,
    isLyricsOpen,
    setIsLyricsOpen,
  } = useUIStore();
 
 const router = useRouter();
 const queryClient = useQueryClient();
 const { user } = useAuthStore();
 const isGlassmorphism = user?.preferences?.globalPlayerStyle === "glassmorphism";

 const { 
 currentTrack, 
 isPlaying, 
 togglePlay, 
 playNext, 
 playPrev, 
 duration,
 } = usePlayerStore();

 // ── Queries & Mutations ──────────────────────────────────────────────
 const { data: likedTrackIds } = useQuery({
 queryKey: ['liked-track-ids'],
 queryFn: async () => {
 try {
  const res = await api.get('/tracks/liked');
  const arr = Array.isArray(res.data) ? res.data : (res.data?.items || []);
  return arr.map((t: any) => t.id);
 } catch (e) {
 return [];
 }
 },
 staleTime: 1000 * 60 * 5,
 });

 const toggleLikeMutation = useMutation({
 mutationFn: async (trackId: string) => {
 await api.post(`/tracks/${trackId}/like`);
 },
 onMutate: async (trackId: string) => {
 await queryClient.cancelQueries({ queryKey: ['liked-track-ids'] });
 const previousLikedIds = queryClient.getQueryData<string[]>(['liked-track-ids']);
 const newLikedIds = previousLikedIds ? (
 previousLikedIds.includes(trackId)
 ? previousLikedIds.filter(id => id !== trackId)
 : [...previousLikedIds, trackId]
 ) : [trackId];
 queryClient.setQueryData(['liked-track-ids'], newLikedIds);
 return { previousLikedIds };
 },
 onError: (err, trackId, context) => {
 if (context?.previousLikedIds) {
 queryClient.setQueryData(['liked-track-ids'], context.previousLikedIds);
 }
 },
 onSettled: () => {
 queryClient.invalidateQueries({ queryKey: ['liked-track-ids'] });
 queryClient.invalidateQueries({ queryKey: ['liked-tracks'] });
 }
 });

 const isLiked = likedTrackIds?.includes(currentTrack?.id || "") ?? false;

 // ── Local State ──────────────────────────────────────────────────────
 const [stablecover, setStableCover] = useState(getTrackCover(currentTrack));
 const [swipeDirection, setSwipeDirection] = useState(1); // 1 = next, -1 = prev
  const [isUserScrollingLyrics, setIsUserScrollingLyrics] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

 // Performance Optimization: Prevent canvas mounting & heavy filtering during scaling/morph transitions
 const [isTransitionComplete, setIsTransitionComplete] = useState(false);

 const dragY = useMotionValue(0);
 const dragScale = useTransform(dragY, [0, 400], [1, 0.9]);
 const dragOpacity = useTransform(dragY, [0, 400], [1, 0.4]);
 const dragRadius = useTransform(dragY, [0, 200], ["0px", "16px"]);

 const handleNext = useCallback(() => {
 setSwipeDirection(1);
 playNext(true);
 }, [playNext]);

 const handlePrev = useCallback(() => {
 setSwipeDirection(-1);
 playPrev();
 }, [playPrev]);

 // Reset transition complete state and drag position
 useEffect(() => {
 if (isFullScreenPlayerOpen) {
 dragY.set(0);
 const timer = setTimeout(() => setIsTransitionComplete(true), 600);
 return () => clearTimeout(timer);
 } else {
 setIsTransitionComplete(false);
 dragY.set(0);
 }
 }, [isFullScreenPlayerOpen, dragY]);

 // ── Image preloading ─────────────────────────────────────────────────
 useEffect(() => {
 if (!currentTrack) return;
 const nextUrl = getTrackCover(currentTrack);
 preloadImage(nextUrl);
 if (imageCache.has(nextUrl)) {
 setStableCover(nextUrl);
 } else {
 const img = new Image();
 img.src = nextUrl;
 img.onload = () => setStableCover(nextUrl);
 img.onerror = () => setStableCover(nextUrl); // fallback
 }
 }, [currentTrack?.id]);

 // Reset lyrics mode to album art view when song changes
 useEffect(() => {
   if (currentTrack?.id) {
     setIsLyricsOpen(false);
   }
 }, [currentTrack?.id, setIsLyricsOpen]);

 // ── Idle Timer ───────────────────────────────────────────────────────
  const resetIdleTimer = useCallback(() => {
  setIsIdle(false);
  if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
  idleTimerRef.current = setTimeout(() => {
    setIsIdle(true);
  }, 5000);
  }, []);

   useEffect(() => {
     if (isFullScreenPlayerOpen) {
       const events = ['touchstart', 'touchmove', 'mousedown', 'click'];
       const handler = () => resetIdleTimer();
       events.forEach(e => window.addEventListener(e, handler, { passive: true }));
       resetIdleTimer();
       return () => {
         events.forEach(e => window.removeEventListener(e, handler));
         if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
       };
     } else {
       setIsIdle(false);
     }
   }, [isFullScreenPlayerOpen, resetIdleTimer]);

 const closingSpring = useMemo(() => ({
 type: "spring" as const,
 stiffness: 500,
 damping: 30,
 mass: 0.5,
 }), []);

   const showBottomControls = isTransitionComplete && (
     !isLyricsOpen || (!isIdle && !isUserScrollingLyrics)
   );

  if (!currentTrack) return null;

 return (
 <LayoutGroup id="mobile-player-group">
 <AnimatePresence mode="popLayout" initial={false}>
 {hidePlayer ? null : !isFullScreenPlayerOpen ? (
 /* MINI PLAYER VIEW */
 <motion.div
 key="mini-player"
 layoutId="player-shell"
 initial={{ opacity: 0, y: 100 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: 100 }}
 transition={closingSpring}
 className={cn(
 "fixed z-[300] pointer-events-auto",
 "left-3 right-3"
 )}
 style={{ 
 bottom: "calc(76px + env(safe-area-inset-bottom, 0px))",
 height: "60px",
 willChange: "transform"
 }}
 >
 {/* Mini Pod Background */}
 <motion.div 
 layoutId="mini-pod-bg"
 className={cn(
 "absolute inset-0 shadow-[0_-4px_20px_rgba(0,0,0,0.5)] rounded-full",
 isGlassmorphism 
 ? "border border-white/10 bg-white/5 backdrop-blur-xl ring-1 ring-white/5" 
 : "bg-[#1c1c1e] border border-white/10"
 )}
 transition={closingSpring}
 />

 {/* Progress Line */}
 <MiniPlayerProgress />

 <HorizontalSwipeArea
 enabled={true}
 onSwipeLeft={handleNext}
 onSwipeRight={handlePrev}
 className="relative h-full flex items-center px-4 cursor-pointer"
 >
 {/* Inner flex wrapper handles opening the immersive player when clicking the blank space / center */}
 <div className="flex-1 flex items-center min-w-0 h-full" onClick={() => setFullScreenPlayerOpen(true)}>
 <motion.div 
 layoutId="album-art-container"
 className="w-11 h-11 rounded-[4px] overflow-hidden shadow-lg relative shrink-0 ring-1 ring-white/10 bg-zinc-900"
 transition={closingSpring}
 >
 <AnimatePresence mode="popLayout" initial={false}>
 <motion.img
 key={currentTrack.id}
 layoutId="album-art"
 src={stablecover}
 className="w-full h-full object-cover pointer-events-none"
 initial={{ opacity: 0, x: swipeDirection > 0 ? 40 : -40 }}
 animate={{ opacity: 1, x: 0 }}
 exit={{ opacity: 0, x: swipeDirection > 0 ? -40 : 40 }}
 transition={closingSpring}
 />
 </AnimatePresence>
 </motion.div>

 <div className="flex flex-col min-w-0 flex-1 pl-3 items-start justify-center h-full">
 <MarqueeText
 className="text-[13px] font-bold text-white leading-normal cursor-pointer hover:text-[#ff2d55] transition-colors max-w-full font-sans"
 >
 <span
 onClick={(e) => {
 e.stopPropagation();
 router.push(`/track/${currentTrack.id}`);
 }}
 >
 {currentTrack.title}
 </span>
 </MarqueeText>
 <MarqueeText className="text-[11px] text-white/40 font-medium mt-0.5 inline-block font-sans max-w-full">
 <motion.span layoutId="track-artist">
 {formatArtists(currentTrack)}
 </motion.span>
 </MarqueeText>
 </div>
 </div>

 <motion.div 
 className="flex items-center gap-2 shrink-0 pr-0.5 relative z-50" 
 onPointerDown={(e) => e.stopPropagation()}
 onClick={(e) => e.stopPropagation()}
 >
 <button
 onClick={(e) => { e.stopPropagation(); togglePlay(); }}
 className="w-10 h-10 flex items-center justify-center text-white"
 >
 {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
 </button>
 <button
 onClick={(e) => { e.stopPropagation(); handleNext(); }}
 className="w-10 h-10 flex items-center justify-center text-white"
 >
 <SkipForward size={24} fill="currentColor" />
 </button>
 </motion.div>
 </HorizontalSwipeArea>
 </motion.div>
 ) : (
 /* FULL SCREEN PLAYER VIEW */
 <motion.div
 key="full-player-shell"
 layoutId="player-shell"
 initial={{ borderRadius: "16px" }}
 animate={{ borderRadius: "0px" }}
 exit={{ borderRadius: "16px", opacity: 0 }}
 transition={closingSpring}
 className="fixed inset-0 z-[1100] bg-black overflow-hidden flex flex-col pointer-events-auto"
 >
 <motion.div
 style={{ 
 y: dragY, 
 scale: dragScale,
 opacity: dragOpacity,
 borderRadius: dragRadius,
 }}
 className="absolute inset-0 w-full h-full flex flex-col"
 drag="y"
 dragConstraints={{ top: 0 }}
 dragElastic={0.05}
 onDragEnd={(_, info) => {
 if (info.velocity.y > 500 || info.offset.y > 150) {
 dragY.set(0);
 setFullScreenPlayerOpen(false);
 } else {
 animate(dragY, 0, closingSpring);
 }
 }}
 >
    {/* Background */}
    <div className="absolute inset-0 z-0 overflow-hidden bg-black">
      <LiquidBackground coverUrl={stablecover} />
      <motion.div 
        animate={{ opacity: isLyricsOpen ? 1 : 0 }}
        transition={{ duration: 0.5 }}
        className="absolute inset-0 bg-white/15 mix-blend-overlay pointer-events-none z-10"
      />
    </div>

 <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 bg-white/20 rounded-full z-10" />

  {/* Top Bar - Fades in once transition completes */}
  <motion.div 
    animate={{ 
      opacity: (isTransitionComplete && !isIdle && (!isLyricsOpen || !isUserScrollingLyrics)) ? 1 : 0, 
      y: (isTransitionComplete && !isIdle && (!isLyricsOpen || !isUserScrollingLyrics)) ? 0 : -20 
    }}
    className="relative z-10 flex items-center px-5 pt-[calc(env(safe-area-inset-top,20px)+24px)] mb-1 transition-all duration-700"
  >
    <button onClick={() => setFullScreenPlayerOpen(false)} className="w-10 h-10 flex items-center justify-center text-white active:scale-75 transition-all">
      <ChevronDown size={32} strokeWidth={2.5} />
    </button>
    <div className="absolute left-1/2 -translate-x-1/2 w-[60%] text-center h-10 top-[calc(env(safe-area-inset-top,20px)+24px)] pointer-events-auto">
      <AnimatePresence mode="wait">
      {isLyricsOpen ? (
        <motion.div 
          key="top-lyrics-info"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center justify-center w-full h-full"
        >
          <MarqueeText 
            text={currentTrack.title} 
            className="text-[17px] font-bold leading-tight text-center max-w-full font-brand tracking-tight text-white drop-shadow-sm"
          />
          <span className="text-[12px] text-white/60 font-medium block truncate max-w-full font-sans tracking-wide">
            {formatArtists(currentTrack)}
          </span>
        </motion.div>
      ) : (
        <motion.div 
          key="top-now-playing"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="flex flex-row items-center justify-center gap-1.5 h-full"
        >
          {isPlaying && (
            <div className="flex items-end gap-[2px] h-[10px]">
              {[0.3, 0.7, 0.4, 0.9].map((d, i) => (
                <motion.div
                  key={i}
                  animate={{ height: ["30%", "100%", "30%"] }}
                  transition={{ duration: 0.8 + i * 0.1, repeat: Infinity, ease: "easeInOut", delay: d }}
                  className="w-[2.5px] bg-brand rounded-full origin-bottom"
                />
              ))}
            </div>
          )}
          <span className="text-[10px] font-black text-white/40 tracking-[0.2em] uppercase">Now Playing</span>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  </motion.div>

 {/* Central Area: 3D Flipping Card (Art to Lyrics transition) */}
 <div className="flex-1 flex flex-col items-center justify-center px-6 min-h-0 relative z-10 w-full">
 <div
   className={cn(
     "w-full h-full flex items-center justify-center transition-all duration-700 ease-[cubic-bezier(0.3,0,0,1)]",
     isLyricsOpen ? "max-h-[70vh] -mt-4" : "max-h-[440px] short:max-h-[300px]"
   )}
   style={{ perspective: "1000px", WebkitPerspective: "1000px" }}
 >
 <motion.div
 animate={{ rotateY: isLyricsOpen ? 180 : 0 }}
 transition={{ duration: 0.5, ease: "easeInOut" }}
 style={{ transformStyle: "preserve-3d", WebkitTransformStyle: "preserve-3d" }}
 className="w-full h-full relative flex items-center justify-center"
 >
 {/* Front Side: Album Cover */}
 <motion.div
 style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
 className={cn(
 "absolute inset-0 w-full h-full flex items-center justify-center",
 isLyricsOpen ? "pointer-events-none" : "pointer-events-auto"
 )}
 >
 <motion.div
  layoutId="album-art-container"
  animate={{ 
    scale: isPlaying ? 1 : 0.85,
    opacity: isPlaying ? 1 : 0.8 
  }}
  transition={{ duration: 0.5, ease: [0.3, 0, 0, 1] }}
  className="mobile-artwork-container shadow-2xl rounded-2xl overflow-hidden cursor-pointer border border-white/10"
  onClick={isLyricsOpen ? undefined : () => setIsLyricsOpen(true)}
  >
 <HorizontalSwipeArea
 enabled={true}
 onSwipeLeft={handleNext}
 onSwipeRight={handlePrev}
 className="w-full h-full"
 >
 <AnimatePresence mode="popLayout" initial={false}>
 <motion.img
 key={currentTrack.id}
 layoutId="album-art"
 src={stablecover}
 className="w-full h-full object-cover pointer-events-none"
 initial={{ opacity: 0, x: swipeDirection > 0 ? 300 : -300 }}
 animate={{ opacity: 1, x: 0 }}
 exit={{ opacity: 0, x: swipeDirection > 0 ? -300 : 300 }}
 transition={closingSpring}
 />
 </AnimatePresence>
 </HorizontalSwipeArea>
 </motion.div>
 </motion.div>

 {/* Back Side: Lyrics */}
 <motion.div
 style={{ 
 backfaceVisibility: "hidden", 
 WebkitBackfaceVisibility: "hidden",
 rotateY: 180 
 }}
 className={cn(
 "absolute inset-0 w-full flex items-center justify-center",
 isLyricsOpen ? "pointer-events-auto h-full" : "pointer-events-none h-full"
 )}
 onClick={(e) => e.stopPropagation()}
 >
 <div className={cn("w-full h-full transition-all duration-700", isIdle ? "scale-105" : "scale-100")}>
 <LyricsView
 trackId={currentTrack.id}
 title={currentTrack.title}
 artist={currentTrack.artist?.name}
 rawLyrics={currentTrack.lyrics}
 isLyricsOpen={isLyricsOpen}
 isMobile={true}
 isIdle={isIdle}
 duration={duration}
 transparent={true}
 onUserScrollChange={setIsUserScrollingLyrics}
 />
 </div>
 </motion.div>
 </motion.div>
 </div>
 </div>

 {/* Player Controls - Fades in/out and slides down on manual scroll */}
   <motion.div
   initial={{ opacity: 0, y: 20 }}
   animate={{ 
     opacity: showBottomControls ? 1 : 0, 
     y: showBottomControls ? (isIdle && !isLyricsOpen ? -36 : 0) : 100,
     pointerEvents: showBottomControls ? "auto" : "none"
   }}
   transition={closingSpring}
   className={cn(
     "w-full flex flex-col px-6 z-10 shrink-0 transition-all duration-700 ease-[cubic-bezier(0.3,0,0,1)]",
    isLyricsOpen ? "absolute bottom-0 pb-[calc(env(safe-area-inset-bottom,20px)+16px)] bg-gradient-to-t from-black/80 to-transparent" : "pb-[calc(env(safe-area-inset-bottom,20px)+32px)] relative"
  )}
  >
  {/* Meta */}
  <div
    className={cn(
      "flex flex-col w-full px-1 mobile-controls-meta text-left transition-all duration-500 ease-[cubic-bezier(0.3,0,0,1)] overflow-hidden",
      (isIdle || isLyricsOpen) 
        ? "opacity-0 pointer-events-none max-h-0 mt-0 mb-0 scale-95" 
        : "opacity-100 max-h-[150px] mt-6 mb-4"
    )}
  >
  <div className="flex flex-row items-center justify-between w-full">
  <MarqueeText
  text={currentTrack.title}
  className={cn(
  "font-bold text-white tracking-tight flex-1 py-0.5 cursor-pointer hover:text-[#ff2d55] transition-all font-brand text-left",
  currentTrack.title.length > 25 ? "text-[20px] leading-none" : "text-[24px] leading-none"
  )}
  >
  <AnimatePresence mode="wait">
  <motion.span
  key={`mobile-track-title-${currentTrack.id}`}
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -10 }}
  transition={{ duration: 0.2 }}
  onClick={() => {
  setFullScreenPlayerOpen(false);
  setTimeout(() => router.push(`/track/${currentTrack.id}`), 50);
  }}
  className="inline-block font-brand"
  >
  {currentTrack.title}
  </motion.span>
  </AnimatePresence>
  </MarqueeText>
  <DropdownMenu>
   <DropdownMenuTrigger asChild>
   <motion.button 
     whileTap={{ scale: 0.7, rotate: 90 }}
     whileHover={{ scale: 1.15 }}
     transition={{ type: "spring", stiffness: 400, damping: 17 }}
     className="w-10 h-10 flex items-center justify-end text-white/70 hover:text-white shrink-0 outline-none"
   >
     <MoreVertical size={24} />
   </motion.button>
   </DropdownMenuTrigger>
  <DropdownMenuPortal>
  <DropdownMenuContent align="end" className="w-56 bg-zinc-900/95 border-white/10 backdrop-blur-xl rounded-2xl p-2 z-[1200]">
  <DropdownMenuItem onSelect={() => {
  if (currentTrack.artist?.id) {
  setFullScreenPlayerOpen(false);
  setTimeout(() => router.push(`/artist/${currentTrack.artist.id}`), 50);
  }
  }}>
  <User size={18} className="mr-3 opacity-40" />
  <span className="font-bold">Go to Artist</span>
  </DropdownMenuItem>
  <DropdownMenuItem onSelect={() => {
  openDownloadModal(currentTrack);
  }}>
  <Download size={18} className="mr-3 opacity-40" />
  <span className="font-bold">Download Track</span>
  </DropdownMenuItem>
  </DropdownMenuContent>
  </DropdownMenuPortal>
  </DropdownMenu>
  </div>
  <MarqueeText text={currentTrack.artist?.name} className="w-full mt-1 text-left">
  <AnimatePresence mode="wait">
  <motion.button
  key={`mobile-track-artist-${currentTrack.id}`}
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -10 }}
  transition={{ duration: 0.2 }}
  onClick={() => {
  if (currentTrack.artist?.id) {
  setFullScreenPlayerOpen(false);
  setTimeout(() => router.push(`/artist/${currentTrack.artist.id}`), 50);
  }
  }}
  className="text-brand text-[16px] font-medium text-left active:text-brand/80 font-sans inline-block"
  >
  {formatArtists(currentTrack)}
  </motion.button>
  </AnimatePresence>
  </MarqueeText>
  </div>

  {/* Scrubber */}
  <div className={cn("transition-transform duration-700 ease-[cubic-bezier(0.3,0,0,1)] z-20", isLyricsOpen && "mt-4")}>
  <MobileScrubber isLyricsOpen={isLyricsOpen} />
  </div>

  {/* Playback */}
   <motion.div
     animate={{
       height: isIdle ? 0 : "auto",
       opacity: isIdle ? 0 : 1,
       marginBottom: isIdle ? 0 : (isLyricsOpen ? 16 : 32),
       pointerEvents: isIdle ? "none" : "auto"
     }}
    transition={{ duration: 0.5, ease: [0.3, 0, 0, 1] }}
    className={cn(
      "flex items-center justify-center gap-10 text-white mobile-controls-playback overflow-hidden",
      isLyricsOpen && "scale-90"
    )}
  >
  <button onClick={handlePrev} className="w-14 h-14 flex items-center justify-center active:scale-75 transition-transform active:duration-0 duration-150 mobile-btn-secondary">
  <SkipBack size={36} className="mobile-icon-secondary" fill="currentColor" strokeWidth={0} />
  </button>
  <button onClick={() => togglePlay()} className={cn("w-20 h-20 flex items-center justify-center active:scale-90 transition-transform active:duration-0 duration-150 mobile-btn-primary", !isPlaying ? "text-brand" : "")}>
  {isPlaying ? (
  <Pause size={56} className="mobile-icon-primary" fill="currentColor" strokeWidth={0} />
  ) : (
  <Play size={56} className="mobile-icon-primary ml-2" fill="currentColor" strokeWidth={0} />
  )}
  </button>
  <button onClick={handleNext} className="w-14 h-14 flex items-center justify-center active:scale-75 transition-transform active:duration-0 duration-150 mobile-btn-secondary">
  <SkipForward size={36} className="mobile-icon-secondary" fill="currentColor" strokeWidth={0} />
  </button>
  </motion.div>

  {/* Actions Bar */}
  <motion.div
    animate={{
      height: isIdle ? 0 : "auto",
      opacity: isIdle ? 0 : 1,
      pointerEvents: isIdle ? "none" : "auto"
    }}
    transition={{ duration: 0.5, ease: [0.3, 0, 0, 1] }}
    className="flex items-center justify-between px-2 w-full max-w-[340px] mx-auto overflow-hidden"
  >
  <AnimatedHeartButton
    isLiked={isLiked}
    size={24}
    onToggleLike={() => toggleLikeMutation.mutate(currentTrack.id)}
  />
  <button onClick={() => setIsLyricsOpen(!isLyricsOpen)} className={cn("w-11 h-11 flex items-center justify-center transition-all", isLyricsOpen ? "text-brand opacity-100" : "text-white")}>
  <ScrollText size={26} />
  </button>
  <button onClick={() => setAudioFxOpen(true)} className="w-11 h-11 flex items-center justify-center text-white"><Sparkles size={24} /></button>
  <button onClick={() => setIsQueueOpen(!isQueueOpen)} className={cn("w-11 h-11 flex items-center justify-center transition-all", isQueueOpen ? "text-brand opacity-100" : "text-white")}>
  <ListMusic size={26} />
  </button>
  </motion.div>
  </motion.div>
  </motion.div>
 </motion.div>
 )}
 </AnimatePresence>
 </LayoutGroup>
 );
}
