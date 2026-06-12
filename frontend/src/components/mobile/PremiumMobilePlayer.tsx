"use client";

import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate, LayoutGroup } from "framer-motion";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/authStore";
import { 
 Play, Pause, SkipBack, SkipForward, 
 Heart, MoreVertical, ChevronDown, User,
 ListMusic, Sparkles, Mic2, PlusCircle, Bookmark,
 Download
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn, getTrackCover } from "@/lib/utils";
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
import { AuroraBackground } from "../shared/AuroraBackground";
import { useAlbumColor } from "@/hooks/useAlbumColor";
import { LyricsView } from "../shared/LyricsView";
import { MarqueeText } from "../shared/MarqueeText";

// ------------------------------------------------------------------
// Image Cache
// ------------------------------------------------------------------
const imageCache = new Set<string>();
function preloadImage(url: string): void {
 if (!url || imageCache.has(url)) return;
 imageCache.add(url);
 const img = new Image();
 img.crossOrigin = 'anonymous'; // Fix Safari NO-CORS cache tainting
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
 return (res.data as any[]).map((t: any) => t.id);
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
 const colors = useAlbumColor(stablecover, currentTrack?.palette);
 const [swipeDirection, setSwipeDirection] = useState(1); // 1 = next, -1 = prev
 const [isLyricsOpen, setIsLyricsOpen] = useState(false);
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

 // Reset transition complete state and drag position when minimized
 useEffect(() => {
 if (!isFullScreenPlayerOpen) {
 setIsTransitionComplete(false);
 dragY.set(0);
 }
 }, [isFullScreenPlayerOpen, dragY]);

 // ── Image preloading ────────────────────────────────----------------─
 useEffect(() => {
 if (!currentTrack) return;
 const nextUrl = getTrackCover(currentTrack);
 preloadImage(nextUrl);
 if (imageCache.has(nextUrl)) {
 setStableCover(nextUrl);
 } else {
 const img = new Image();
 img.crossOrigin = 'anonymous'; // Fix Safari NO-CORS cache tainting
 img.src = nextUrl;
 img.onload = () => setStableCover(nextUrl);
 img.onerror = () => setStableCover(nextUrl); // fallback
 }
 }, [currentTrack?.id]);

 // ── Idle Timer ───────────────────────────────────────────────────────
 const resetIdleTimer = useCallback(() => {
 setIsIdle(false);
 if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
 idleTimerRef.current = setTimeout(() => setIsIdle(true), 5000);
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
 }, [isFullScreenPlayerOpen, isLyricsOpen, resetIdleTimer]);

 const closingSpring = useMemo(() => ({
 type: "spring" as const,
 stiffness: 500,
 damping: 30,
 mass: 0.5,
 }), []);

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
 {currentTrack.artist?.name || 'Unknown Artist'}
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
 style={{ 
 y: dragY, 
 scale: dragScale,
 opacity: dragOpacity,
 borderRadius: dragRadius,
 }}
 initial={{ borderRadius: "16px" }}
 animate={{ borderRadius: "0px" }}
 exit={{ borderRadius: "16px", opacity: 0 }}
 transition={closingSpring}
 className="fixed inset-0 z-[1100] bg-black overflow-hidden flex flex-col pointer-events-auto"
 drag="y"
 dragConstraints={{ top: 0 }}
 dragElastic={0.05}
 onDragEnd={(_, info) => {
 if (info.velocity.y > 500 || info.offset.y > 150) {
 setFullScreenPlayerOpen(false);
 } else {
 animate(dragY, 0, closingSpring);
 }
 }}
 onAnimationComplete={() => {
 if (isFullScreenPlayerOpen) {
 setIsTransitionComplete(true);
 }
 }}
 >
 {/* Background */}
 <div 
 className="absolute inset-0 z-0 overflow-hidden transition-colors duration-1000"
 style={{ backgroundColor: isLyricsOpen ? (colors[0] || '#111') : 'black' }}
 >
 {!isLyricsOpen && <AuroraBackground colors={colors} speed="slow" />}
 <motion.div 
 animate={{ opacity: isLyricsOpen ? 0.8 : 0 }}
 transition={{ duration: 0.5 }}
 className="absolute inset-0 bg-black z-10 pointer-events-none"
 />
 </div>

 <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 bg-white/20 rounded-full z-10" />

 {/* Top Bar - Fades in once transition completes */}
 <motion.div 
 animate={{ opacity: (isTransitionComplete && !isIdle) ? 1 : 0, y: (isTransitionComplete && !isIdle) ? 0 : -20 }}
 className="relative z-10 flex items-center px-5 pt-[calc(env(safe-area-inset-top,20px)+24px)] mb-1 transition-all duration-700"
 >
 <button onClick={() => setFullScreenPlayerOpen(false)} className="w-10 h-10 flex items-center justify-center text-white active:scale-75 transition-all">
 <ChevronDown size={32} strokeWidth={2.5} />
 </button>
 <div className="absolute left-1/2 -translate-x-1/2 flex flex-row items-center justify-center gap-1.5" style={{ top: 'calc(env(safe-area-inset-top, 20px) + 30px)' }}>
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
 </div>
 </motion.div>

 {/* Central Area: 3D Flipping Card (Art to Lyrics transition) */}
 <div className="flex-1 flex flex-col items-center justify-center px-6 min-h-0 relative z-10 w-full">
 <div className="w-full h-full max-h-[440px] short:max-h-[300px] flex items-center justify-center" style={{ perspective: "1000px" }}>
 <motion.div
 animate={{ rotateY: isLyricsOpen ? 180 : 0 }}
 transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
 style={{ transformStyle: "preserve-3d" }}
 className="w-full h-full relative flex items-center justify-center"
 >
 {/* Front Side: Album Cover */}
 <motion.div
 style={{ backfaceVisibility: "hidden" }}
 className={cn(
 "absolute inset-0 w-full h-full flex items-center justify-center",
 isLyricsOpen ? "pointer-events-none" : "pointer-events-auto"
 )}
 >
 <motion.div
 layoutId="album-art-container"
 className="mobile-artwork-container shadow-2xl rounded-2xl overflow-hidden cursor-pointer border border-white/10"
 onClick={() => setIsLyricsOpen(!isLyricsOpen)}
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
 rotateY: 180 
 }}
 className={cn(
 "absolute inset-0 w-full flex items-center justify-center",
 isLyricsOpen ? "pointer-events-auto h-[75vh]" : "pointer-events-none h-full",
 isIdle ? "h-[85vh] -mt-10" : ""
 )}
 onClick={() => setIsLyricsOpen(!isLyricsOpen)}
 >
 <div className={cn("w-full h-full transition-all duration-700", isIdle ? "scale-105" : "scale-100")}>
 <LyricsView
 trackId={currentTrack.id}
 title={currentTrack.title}
 artist={currentTrack.artist?.name}
 rawLyrics={currentTrack.lyrics}
 isLyricsOpen={isLyricsOpen}
 isMobile={true}
 duration={duration}
 transparent={true}
 />
 </div>
 </motion.div>
 </motion.div>
 </div>
 </div>

 {/* Player Controls - Fades in once transition completes */}
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: isTransitionComplete ? 1 : 0, y: isTransitionComplete ? 0 : 20 }}
 transition={closingSpring}
 className={cn(
 "w-full flex flex-col px-8 z-10 shrink-0 transition-all duration-700 ease-[cubic-bezier(0.3,0,0,1)]",
 isLyricsOpen ? "absolute bottom-0 pb-[calc(env(safe-area-inset-bottom,20px)+16px)] bg-gradient-to-t from-black/80 to-transparent" : "pb-[calc(env(safe-area-inset-bottom,20px)+32px)] relative",
 isIdle && isLyricsOpen ? "translate-y-full opacity-0 pointer-events-none" : "translate-y-0 opacity-100 pointer-events-auto"
 )}
 >
 {/* Meta */}
 <motion.div layoutId="track-meta" className={cn("flex flex-col w-full mt-6 mb-4 px-1 mobile-controls-meta text-left transition-all duration-700 ease-[cubic-bezier(0.3,0,0,1)]", isIdle ? "opacity-0 -translate-y-6 pointer-events-none" : "opacity-100 translate-y-0 pointer-events-auto", isLyricsOpen && "hidden")}>
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
 className="inline-block"
 >
 {currentTrack.title}
 </motion.span>
 </AnimatePresence>
 </MarqueeText>
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <button className="w-10 h-10 flex items-center justify-end text-white/50 shrink-0"><MoreVertical size={26} /></button>
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
 {currentTrack.artist?.name || "Unknown Artist"}
 </motion.button>
 </AnimatePresence>
 </MarqueeText>
 </motion.div>

 {/* Scrubber */}
 <div className={cn("transition-transform duration-700 ease-[cubic-bezier(0.3,0,0,1)] z-20", isIdle && !isLyricsOpen ? "-translate-y-[80px]" : "translate-y-0", isLyricsOpen && "mt-4")}>
 <MobileScrubber />
 </div>

 {/* Playback */}
 <div className={cn("flex items-center justify-center gap-10 mb-8 text-white mobile-controls-playback transition-all duration-700 ease-[cubic-bezier(0.3,0,0,1)]", isIdle && !isLyricsOpen ? "opacity-0 translate-y-8 pointer-events-none" : "opacity-100 translate-y-0 pointer-events-auto", isLyricsOpen && "mb-4 scale-90")}>
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
 </div>

 {/* Actions Bar */}
 <div className={cn("flex items-center justify-between px-2 w-full max-w-[340px] mx-auto transition-all duration-700 ease-[cubic-bezier(0.3,0,0,1)]", isIdle && !isLyricsOpen ? "opacity-0 translate-y-12 pointer-events-none" : "opacity-100 translate-y-0 pointer-events-auto")}>
 <button
 onClick={() => toggleLikeMutation.mutate(currentTrack.id)}
 className="w-11 h-11 flex items-center justify-center outline-none bg-transparent"
 >
 <motion.div
 whileTap={{ scale: 0.7 }}
 animate={{ scale: isLiked ? [1, 1.4, 1] : 1 }}
 transition={{ duration: 0.35, ease: "easeOut" }}
 className={cn(isLiked ? "text-brand" : "text-white")}
 >
 <Heart size={24} className={cn(isLiked && "fill-current")} />
 </motion.div>
 </button>
 <button onClick={() => setIsLyricsOpen(!isLyricsOpen)} className={cn("w-11 h-11 flex items-center justify-center transition-all", isLyricsOpen ? "text-brand opacity-100" : "text-white")}>
 <Mic2 size={26} />
 </button>
 <button onClick={() => setAudioFxOpen(true)} className="w-11 h-11 flex items-center justify-center text-white"><Sparkles size={24} /></button>
 <button onClick={() => setIsQueueOpen(!isQueueOpen)} className={cn("w-11 h-11 flex items-center justify-center transition-all", isQueueOpen ? "text-brand opacity-100" : "text-white")}>
 <ListMusic size={26} />
 </button>
 </div>
 </motion.div>
 </motion.div>
 )}
 </AnimatePresence>
 </LayoutGroup>
 );
}
