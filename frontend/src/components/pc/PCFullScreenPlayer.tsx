"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import {
 Play,
 Pause,
 SkipBack,
 SkipForward,
 X,
 Minimize2,
 Shuffle,
 Repeat,
 Heart,
 Sparkles,
 ListMusic,
 ScrollText,
 MoreHorizontal,
} from "lucide-react";
import { getMediaUrl, cn, cleanTitle, getTrackCover, formatArtists } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArtistLinks } from "@/components/shared/ArtistLinks";
import { AnimatedHeartButton } from "@/components/ui/AnimatedHeartButton";
import * as Slider from "@radix-ui/react-slider";
import { audioEngine } from "@/lib/audio-engine";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { LiquidBackground } from "../shared/LiquidBackground";
import { PCFullScreenScrubber } from "./../player/PlayerProgress";
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuTrigger,
 DropdownMenuSub,
 DropdownMenuSubTrigger,
 DropdownMenuSubContent,
 DropdownMenuPortal,
 DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

import { LyricsView } from "../shared/LyricsView";
import { MarqueeText } from "@/components/shared/MarqueeText";

const SPRING = { type: "spring", stiffness: 180, damping: 26, mass: 0.9 } as const;
const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const;

export function PCFullScreenPlayer() {
 const router = useRouter();
 const {
 setFullScreenPlayerOpen,
 setPlayerMinimized,
 isPlayerMinimized,
 isLyricsOpen,
 setIsLyricsOpen,
 isQueueOpen,
 setIsQueueOpen,
 setAudioFxOpen,
 } = useUIStore();
 const {
 currentTrack,
 isPlaying,
 togglePlay,
 playNext,
 playPrev,
 isShuffled,
 toggleShuffle,
 repeatMode,
 toggleRepeat,
 } = usePlayerStore();
 const queryClient = useQueryClient();
 const { isAuthenticated, user } = useAuthStore();
 const openDownloadModal = useUIStore(state => state.openDownloadModal);
 const showReactiveBg = user?.preferences?.fullviewReactiveBg !== false;

 const { data: likedTrackIds } = useQuery({
 queryKey: ['liked-track-ids'],
 queryFn: async () => {
 if (!isAuthenticated) return [];
 const res = await api.get('/tracks/liked');
 const arr = Array.isArray(res.data) ? res.data : (res.data?.items || []);
 return arr.map((t: any) => t.id);
 },
 enabled: isAuthenticated
 });

 const isLiked = currentTrack ? likedTrackIds?.includes(currentTrack.id) : false;

 const toggleLikeMutation = useMutation({
 mutationFn: async () => {
 if (!currentTrack) return;
 await api.post(`/tracks/${currentTrack.id}/like`);
 },
 onMutate: async () => {
 if (!currentTrack) return { previousLikedIds: undefined };
 await queryClient.cancelQueries({ queryKey: ['liked-track-ids'] });
 const previousLikedIds = queryClient.getQueryData<string[]>(['liked-track-ids']);
 const newLikedIds = previousLikedIds ? (
 previousLikedIds.includes(currentTrack.id)
 ? previousLikedIds.filter(id => id !== currentTrack.id)
 : [...previousLikedIds, currentTrack.id]
 ) : [currentTrack.id];
 queryClient.setQueryData(['liked-track-ids'], newLikedIds);
 return { previousLikedIds };
 },
 onError: (_err, _vars, context) => {
 if (context?.previousLikedIds !== undefined) {
 queryClient.setQueryData(['liked-track-ids'], context.previousLikedIds);
 }
 },
 onSettled: () => {
 queryClient.invalidateQueries({ queryKey: ['liked-track-ids'] });
 queryClient.invalidateQueries({ queryKey: ['liked-tracks'] });
 }
 });

 const { data: playlists } = useQuery({
 queryKey: ['my-playlists'],
 queryFn: async () => {
 try {
 const res = await api.get('/playlists/my');
 const arr = Array.isArray(res.data) ? res.data : (res.data?.items || []);
 return arr as { id: string, name: string }[];
 } catch (e) { return []; }
 },
 enabled: !!queryClient.getQueryData(['auth-token']) || isAuthenticated
 });

 const addToPlaylistMutation = useMutation({
 mutationFn: async (playlistId: string) => {
 if (!currentTrack) return;
 await api.post(`/playlists/${playlistId}/tracks`, { trackId: currentTrack.id });
 },
 onSuccess: (_, playlistId) => {
 queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] });
 }
 });

 // --- Universal 5-second idle timer (always active in full-screen) ---
 const [isIdle, setIsIdle] = useState(false);
 const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

 const resetIdleTimer = useCallback(() => {
 setIsIdle(false);
 if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
 idleTimerRef.current = setTimeout(() => {
 setIsIdle(true);
 }, 5000);
 }, []);

 useEffect(() => {
 const events = ['mousedown', 'mousemove', 'scroll', 'touchstart'];
 const handler = () => resetIdleTimer();
 events.forEach(e => window.addEventListener(e, handler));
 resetIdleTimer();
 return () => {
 events.forEach(e => window.removeEventListener(e, handler));
 if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
 };
 }, [resetIdleTimer]);

 const [swipeDirection, setSwipeDirection] = useState(1);

 const handleNext = useCallback(() => {
 setSwipeDirection(1);
 playNext(true);
 }, [playNext]);

 const handlePrev = useCallback(() => {
 setSwipeDirection(-1);
 playPrev();
 }, [playPrev]);



 const [loadedCover, setLoadedCover] = useState(currentTrack ? getTrackCover(currentTrack) : "/logo.png");

 useEffect(() => {
 if (!currentTrack) return;
 const nextCover = getTrackCover(currentTrack);
 if (nextCover === loadedCover) return;

 const img = new Image();
 img.src = nextCover;
 img.onload = () => {
 setLoadedCover(nextCover);
 };
 }, [currentTrack?.id]);

 if (!currentTrack) return null;

 return (
 <motion.div
 initial={{ y: "100%", opacity: 0 }}
 animate={{ y: 0, opacity: 1 }}
 exit={{ y: "100%", opacity: 0 }}
 transition={{
 type: "spring",
 stiffness: 420,
 damping: 38,
 mass: 0.8
 }}
 style={{ zIndex: 850 }}
 className="fixed inset-0 bg-black overflow-hidden font-sans"
 onClick={() => setFullScreenPlayerOpen(false)}
 >
 {/* Reactive Background with Premium Apple Music Liquid Glassmorphism */}
 {showReactiveBg ? (
 <div 
 className="absolute inset-0 z-0 transition-colors duration-1000 bg-black"
 >
 <LiquidBackground coverUrl={loadedCover} />
 <motion.div 
 animate={{ opacity: isLyricsOpen ? 0.4 : 0 }}
 transition={{ duration: 0.5 }}
 className="absolute inset-0 bg-black z-10 pointer-events-none"
 />
 </div>
 ) : (
 <div className="absolute inset-0 bg-black pointer-events-none" />
 )}

 {/* Top-right controls — fade on idle */}
 <motion.div
 className="absolute top-8 right-10 z-50 flex items-center gap-4"
 animate={{ opacity: isIdle ? 0 : 1, pointerEvents: isIdle ? 'none' : 'auto' }}
 transition={{ duration: 0.5 }}
 >
 <button
 onClick={(e) => { e.stopPropagation(); setFullScreenPlayerOpen(false); }}
 className="p-2 text-white/40 hover:text-white transition-all transform active:scale-90"
 title="Minimize to Global Player"
 >
 <Minimize2 size={20} strokeWidth={1.5} />
 </button>
 <button
 onClick={(e) => {
 e.stopPropagation();
 setFullScreenPlayerOpen(false);
 usePlayerStore.setState({ currentTrack: null, isPlaying: false });
 const audio = document.querySelector('audio');
 if (audio) { audio.pause(); audio.src = ''; }
 }}
 className="p-2 text-white/40 hover:text-white transition-all transform active:scale-90"
 title="Close All Players"
 >
 <X size={22} strokeWidth={2} />
 </button>
 </motion.div>

 {/* ============================================================
 MAIN LAYOUT: Flex row, split-screen when lyrics open
 ============================================================ */}
 <motion.div
 layout
 transition={SPRING}
 className={cn(
 "relative z-10 flex h-full items-center justify-center pt-12 pb-6",
 isLyricsOpen ? "pl-16 pr-6 gap-16" : "px-6 gap-0"
 )}
 onClick={(e) => e.stopPropagation()}
 >
 {/* LEFT PANEL: Artwork + Controls */}
 <motion.div
 layout
 transition={SPRING}
 className={cn(
 "flex flex-col items-center shrink-0",
 isLyricsOpen ? "w-[400px] lg:w-[440px] -translate-x-8 gap-6" : "w-full max-w-lg translate-x-0 gap-6"
 )}
 >
 {/* Artwork - ALWAYS visible */}
 <motion.div
 layout
 layoutId={`fs-album-art-container-${currentTrack.id}`}
 animate={{ 
   scale: isPlaying ? 1 : 0.85,
   opacity: isPlaying ? 1 : 0.8 
 }}
 transition={{ duration: 0.5, ease: [0.3, 0, 0, 1] }}
 className={cn(
 "relative shrink-0 rounded-lg overflow-hidden shadow-xl aspect-square border border-white/10",
 isLyricsOpen
 ? "w-[280px] h-[280px] lg:w-[320px] lg:h-[320px]"
 : "w-[240px] h-[240px] lg:w-[280px] lg:h-[280px]"
 )}
 >
 <AnimatePresence mode="wait">
 <motion.img
 key={currentTrack.id}
 layout
 layoutId={`fs-album-art-${currentTrack.id}`}
 src={loadedCover}
 className="w-full h-full object-cover pointer-events-none"
 initial={{ opacity: 0, x: swipeDirection > 0 ? 200 : -200 }}
 animate={{ opacity: 1, x: 0 }}
 exit={{ opacity: 0, x: swipeDirection > 0 ? -200 : 200 }}
 transition={{ type: "spring", stiffness: 350, damping: 32 }}
 alt={currentTrack.title}
 />
 </AnimatePresence>
 {/* Tap to open lyrics */}
 {!isLyricsOpen && (
 <button
 onClick={(e) => { e.stopPropagation(); setIsLyricsOpen(true); }}
 className="absolute inset-0 w-full h-full bg-transparent cursor-pointer"
 />
 )}
 </motion.div>

 {/* Track Details & Controls Container */}
 <div className="w-full space-y-4 pt-2">
 {/* Track Info (Title/Artist) - Hides on Idle */}
 <div
 className={cn(
 "text-center mx-auto transition-all duration-[500ms] ease-[cubic-bezier(0.3,0,0,1)]",
 isLyricsOpen
 ? "w-full max-w-[400px]"
 : "w-full max-w-[540px]",
 isIdle ? "opacity-0 -translate-y-5 pointer-events-none" : "opacity-100 translate-y-0 pointer-events-auto"
 )}
 >
 <MarqueeText text={currentTrack.title} className="text-xl md:text-3xl font-bold tracking-tight text-white mb-1 leading-normal pt-1.5 drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] cursor-pointer hover:text-brand transition-colors font-brand">
 <AnimatePresence mode="wait">
 <motion.span 
 key={`pc-track-title-${currentTrack.id}`}
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -10 }}
 transition={{ duration: 0.2 }}
 onClick={() => {
 setFullScreenPlayerOpen(false);
 router.push(`/track/${currentTrack.id}`);
 }}
 className="font-medium font-brand inline-block"
 >
 {cleanTitle(currentTrack.title)}
 </motion.span>
 </AnimatePresence>
 </MarqueeText>
 <MarqueeText text={currentTrack.artist?.name} className="w-full">
 <div className="flex justify-center">
 <AnimatePresence mode="wait">
 <motion.div
 key={`pc-track-artist-${currentTrack.id}`}
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -10 }}
 transition={{ duration: 0.2 }}
 >
 <ArtistLinks
    track={currentTrack}
    className="text-[11px] text-white/70 font-bold tracking-widest uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] font-sans"
    onClick={() => setFullScreenPlayerOpen(false)}
  />
 </motion.div>
 </AnimatePresence>
 </div>
 </MarqueeText>
 </div>

 {/* Progress Slider (Playbar) - ALWAYS visible */}
 <div className={cn(
 "w-full mx-auto transition-all duration-[500ms] ease-[cubic-bezier(0.3,0,0,1)]",
 isLyricsOpen ? "max-w-[380px] lg:max-w-[420px]" : "max-w-[360px] lg:max-w-[400px]",
 isIdle ? "-translate-y-[68px]" : "translate-y-0"
 )}>
 <PCFullScreenScrubber isLyricsOpen={isLyricsOpen} />
 </div>

 {/* Playback Controls Row - Hides on Idle */}
 <div
 className={cn(
 "grid grid-cols-[1fr_auto_1fr] items-center w-full max-w-[480px] mx-auto h-14 transition-all duration-[500ms] ease-[cubic-bezier(0.3,0,0,1)]",
 isIdle ? "opacity-0 translate-y-8 pointer-events-none" : "opacity-100 translate-y-0 pointer-events-auto"
 )}
 >
 {/* Left Secondary Controls */}
 <div className="flex flex-row items-center justify-end gap-1.5">
 <button
 onClick={toggleShuffle}
 className={cn(
 "transition-all active:scale-90 p-1.5",
 isShuffled ? "text-brand" : "text-white/50 hover:text-white"
 )}
 title="Shuffle"
 >
 <Shuffle size={16} strokeWidth={2.5} />
 </button>

 <button
 onClick={toggleRepeat}
 className={cn(
 "relative transition-all active:scale-90 p-1.5",
 repeatMode !== "off" ? "text-brand" : "text-white/50 hover:text-white"
 )}
 title={`Repeat: ${repeatMode}`}
 >
 <Repeat size={16} strokeWidth={repeatMode !== 'off' ? 2.5 : 2} />
 {repeatMode !== "off" && (
 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
 <span className="text-[6px] font-black mt-0.5">
 {repeatMode === "one" ? "1" : repeatMode === "two" ? "2" : "∞"}
 </span>
 </div>
 )}
 </button>

 <AnimatedHeartButton
    isLiked={isLiked}
    size={16}
    onToggleLike={() => toggleLikeMutation.mutate()}
  />
 </div>

 {/* Main Playback Controls */}
 <div className="flex flex-row items-center justify-center gap-1.5 px-2">
 <button onClick={handlePrev} className="w-10 h-10 flex items-center justify-center active:scale-75 transition-transform active:duration-0 duration-150 mobile-btn-secondary">
 <SkipBack size={20} className="mobile-icon-secondary" fill="currentColor" strokeWidth={0} />
 </button>

 <button
 onClick={(e) => { e.stopPropagation(); togglePlay(); }}
 className={cn("w-14 h-14 flex items-center justify-center active:scale-90 transition-transform active:duration-0 duration-150 mobile-btn-primary text-rose-500 drop-shadow-[0_0_12px_rgba(244,63,94,0.3)]", !isPlaying ? "" : "")}
 >
 {isPlaying ? (
 <Pause size={32} fill="currentColor" strokeWidth={0} />
 ) : (
 <Play size={32} className="ml-1.5" fill="currentColor" strokeWidth={0} />
 )}
 </button>

 <button onClick={() => handleNext()} className="w-10 h-10 flex items-center justify-center active:scale-75 transition-transform active:duration-0 duration-150 mobile-btn-secondary">
 <SkipForward size={20} className="mobile-icon-secondary" fill="currentColor" strokeWidth={0} />
 </button>
 </div>

 {/* Right Secondary Controls */}
 <div className="flex flex-row items-center justify-start gap-1.5">
 <button
 onClick={() => setAudioFxOpen(true)}
 className="text-white/50 hover:text-white transition-all active:scale-90 p-1.5"
 title="StudioFX Engine"
 >
 <Sparkles size={16} strokeWidth={2} />
 </button>

 <button
 onClick={() => setIsLyricsOpen(!isLyricsOpen)}
 className={cn(
 "transition-all active:scale-90 p-1.5",
 isLyricsOpen ? "text-brand drop-shadow-[0_0_8px_rgba(var(--accent-brand-rgb),0.5)]" : "text-white/50 hover:text-white"
 )}
 title="Lyrics"
 >
 <ScrollText size={16} strokeWidth={2} />
 </button>

 <button
 onClick={() => setIsQueueOpen(!isQueueOpen)}
 className={cn(
 "transition-all active:scale-90 p-1.5",
 isQueueOpen ? "text-brand drop-shadow-[0_0_8px_rgba(var(--accent-brand-rgb),0.5)]" : "text-white/50 hover:text-white"
 )}
 title="Queue"
 >
 <ListMusic size={16} strokeWidth={2} />
 </button>
 </div>
 </div>

 {/* Lossless Indicator - Hides on Idle */}
 <div
 className={cn(
 "flex justify-center pt-1 transition-all duration-[500ms] ease-[cubic-bezier(0.3,0,0,1)]",
 isIdle ? "opacity-0 translate-y-2 pointer-events-none" : "opacity-20 translate-y-0 pointer-events-auto"
 )}
 >
 <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-white/10 bg-white/5">
 <div className="flex gap-[1px] items-center">
 {[1, 2, 3].map((i) => (
 <div key={i} className="w-[1px] h-1.5 bg-white rounded-full" />
 ))}
 </div>
 <span className="text-[7px] font-black uppercase tracking-[0.2em] text-white">Lossless</span>
 </div>
 </div>
 </div>
 </motion.div>

 {/* RIGHT PANEL: Full Lyrics — only when isLyricsOpen */}
 <AnimatePresence>
 {isLyricsOpen && (
 <motion.div
 key="lyrics-panel"
 initial={{ opacity: 0, x: 60, filter: "blur(12px)" }}
 animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
 exit={{ opacity: 0, x: 60, filter: "blur(12px)" }}
 transition={{ type: "spring", stiffness: 280, damping: 28, mass: 0.6 }}
 className="flex-1 h-[calc(100vh-120px)] max-w-3xl relative"
 onClick={(e) => e.stopPropagation()}
 >
 {/* Close button */}
 <button
 onClick={() => setIsLyricsOpen(false)}
 className="absolute top-2 right-4 z-20 text-white/30 hover:text-white transition-colors"
 >
 <X size={18} />
 </button>

 <LyricsView
 trackId={currentTrack.id}
 title={cleanTitle(currentTrack.title)}
 artist={currentTrack.artist?.name}
 rawLyrics={currentTrack.lyrics}
 isLyricsOpen={isLyricsOpen}
 isFullscreen={true}
 transparent={showReactiveBg}
 />
 </motion.div>
 )}
 </AnimatePresence>
 </motion.div>
 </motion.div>
 );
}
