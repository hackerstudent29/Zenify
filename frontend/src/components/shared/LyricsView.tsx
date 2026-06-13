"use client";

import React from "react";
import { motion, useMotionValue, animate, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { Mic2 } from "lucide-react";
import { LiquidLyricsLine } from "./LiquidLyricsLine";
import { audioEngine } from "@/lib/audio-engine";
import { usePlayerStore } from "@/store/player";

interface LyricsViewProps {
 trackId: string;
 title: string;
 artist: string;
 isLyricsOpen: boolean;
 rawLyrics?: string;
 isMobile?: boolean;
 isIdle?: boolean;
 duration?: number;
 /** When true, renders in the fullscreen split-screen panel (wider, larger fonts) */
 isFullscreen?: boolean;
 /** When true, removes the black card background so lyrics float over the aurora */
 transparent?: boolean;
 /** Album art URL for blurred atmospheric backdrop (Apple Music style) */
 albumArt?: string;
}

export function cleanLyricText(text: string): string {
 if (!text) return "";
 
 // Catch common Genius/Musixmatch garbage lines
 if (/Português|Türkçe|Español|Việt|Italiano|Français|Deutsch/i.test(text)) return "";
 if (/^\d+$/.test(text.trim())) return ""; // raw numbers like "107"
 if (text.trim().toLowerCase() === "lyrics") return "";
 if (text.toLowerCase().includes("lyrics") && text.length < 60) {
 // e.g. "Without A Warning Lyrics"
 // We'll just strip the word "Lyrics" or drop it entirely if it looks like a header
 if (text.toLowerCase().endsWith("lyrics")) return "";
 }

 return text
 // 1. Remove all square brackets and their contents (typically artist tags or section names like [Chorus])
 .replace(/\[[^\]]*\]/g, "")
 // 2. Remove parenthesized tags like (Chorus), (Male), (Instrumental), (Music), (Solo)
 .replace(/\(\s*(chorus|verse|intro|outro|bridge|male|female|view|vocal|hook|pre-chorus|refrain|music|instrumental|solo|spoken)([^)]*?)\)/gi, "")
 // 3. Remove prefixes/colons like "Male:", "Chorus:", "View:", "Singer:" at the start of the line
 .replace(/^\s*(chorus|verse|intro|outro|bridge|male|female|view|vocal|hook|pre-chorus|refrain|singer)\s*:\s*/gi, "")
 // 4. Remove standalone metadata keywords
 .replace(/\b(chorus|verse|intro|outro|bridge|male|female|view|vocal|hook|pre-chorus|refrain|instrumental)\b/gi, "")
 // 5. Cleanup remaining empty/whitespace parentheses
 .replace(/\(\s*\)/g, "")
 // 6. Clean extra spaces
 .replace(/\s+/g, " ")
 .trim();
}



export function LyricsView({ trackId, title, artist, isLyricsOpen, rawLyrics, isMobile, isIdle, duration, isFullscreen, transparent, albumArt }: LyricsViewProps) {
 const { data, isLoading, refetch, isFetching } = useQuery({
 queryKey: ['lyrics', trackId, title, artist],
 queryFn: async () => {
 if (!title) return [];
 try {
 const res = await api.post(`metadata/sync-lyrics`, {
 trackId, title, artist, rawLyrics, duration
 });
 return res.data?.syncedTokens || [];
 } catch (err: any) {
 if (err.response?.status === 404) return [];
 throw err;
 }
 },
 enabled: isLyricsOpen && !!title,
 staleTime: 1000 * 60 * 60,
 });



 // 60fps RAF smoothTime rendering using Framer Motion values (no react re-renders)
 const initialTime = React.useMemo(() => usePlayerStore.getState().currentTime, []);
 const smoothTimeValue = useMotionValue(initialTime);
 React.useEffect(() => {
 let rafId: number;
 let lastRealTime = performance.now();
 let lastAudioTime = -1;

 const tick = () => {
 const now = performance.now();
 const dt = (now - lastRealTime) / 1000;
 lastRealTime = now;

 const audio = audioEngine.getActiveAudioElement();
 if (audio && !audio.paused) {
 // If the user seeks or audio drifts heavily, snap to it.
 // Otherwise trust our smooth performance.now() extrapolation!
 const drift = Math.abs(smoothTimeValue.get() - audio.currentTime);
 if (drift > 0.25) {
 smoothTimeValue.set(audio.currentTime);
 lastAudioTime = audio.currentTime;
 } else {
 smoothTimeValue.set(smoothTimeValue.get() + dt * audio.playbackRate);
 }
 } else if (audio && audio.paused) {
 smoothTimeValue.set(audio.currentTime);
 } else {
 smoothTimeValue.set(usePlayerStore.getState().currentTime);
 }
 rafId = requestAnimationFrame(tick);
 };
 rafId = requestAnimationFrame(tick);
 return () => cancelAnimationFrame(rafId);
 }, [smoothTimeValue]);

 const containerRef = React.useRef<HTMLDivElement>(null);
 const [containerHeight, setContainerHeight] = React.useState(360);

 React.useEffect(() => {
 if (containerRef.current) {
 setContainerHeight(containerRef.current.clientHeight);
 }
 }, [isLyricsOpen]);

 React.useEffect(() => {
 const handleResize = () => {
 if (containerRef.current) {
 setContainerHeight(containerRef.current.clientHeight);
 }
 };
 window.addEventListener('resize', handleResize);
 return () => window.removeEventListener('resize', handleResize);
 }, []);

 const activeData = data || [];
 const processedLines = React.useMemo(() => {
 if (!activeData || !Array.isArray(activeData)) return [];
 const baseLines = activeData.map((line: any) => {
 const cleanedText = cleanLyricText(line.text);
 return {
 ...line,
 time: parseFloat(line.time || 0),
 text: cleanedText
 };
 }).filter((line: any) => line.text.length > 0)
 .sort((a: any, b: any) => a.time - b.time);

 // 1. Skip splitting lines, just use base lines
 const splitLines: any[] = baseLines;

 // 2. Insert virtual interlude lines (triple dots) for long instrumental breaks (greater than 7.0 seconds)
 const result: any[] = [];
 for (let i = 0; i < splitLines.length; i++) {
 result.push(splitLines[i]);
 
 const currentLine = splitLines[i];
 const nextLine = splitLines[i + 1];
 if (nextLine) {
 const gap = nextLine.time - currentLine.time;
 if (gap > 5.0) {
 // Estimate the duration of the current line
 const wordCount = currentLine.text ? currentLine.text.split(/\s+/).length : 0;
 const durationEstimate = Math.min(Math.max(1.8, 1.0 + wordCount * 0.3), 3.5);
 
 // Insert virtual line starting after the current line ends
 result.push({
 time: currentLine.time + durationEstimate,
 text: "• • •",
 isInterlude: true
 });
 }
 }
 }
 return result;
 }, [activeData, duration]);

 const [activeIndex, setActiveIndex] = React.useState(0);
 const processedLinesRef = React.useRef(processedLines);
 
 React.useEffect(() => {
 processedLinesRef.current = processedLines;
 }, [processedLines]);

 React.useEffect(() => {
 setActiveIndex(0);
 if (containerRef.current) {
 containerRef.current.scrollTop = 0;
 }
 }, [trackId]);

 React.useEffect(() => {
 let rafId: number;
 const tick = () => {
 const storeState = usePlayerStore.getState();
 // Prevent calculating new index if the track hasn't fully loaded yet or track IDs mismatch
 if (storeState.currentTrack?.id === trackId) {
 const audio = audioEngine.getActiveAudioElement();
 const currentT = (audio && !audio.paused) ? audio.currentTime : storeState.currentTime;
 
 let newIndex = 0;
 const lines = processedLinesRef.current;
 for (let i = 0; i < lines.length; i++) {
 if (currentT >= lines[i].time) newIndex = i;
 else break;
 }
 
 setActiveIndex(prevIndex => {
 if (prevIndex !== newIndex) return newIndex;
 return prevIndex;
 });
 }

 rafId = requestAnimationFrame(tick);
 };
 rafId = requestAnimationFrame(tick);
 return () => cancelAnimationFrame(rafId);
 }, [trackId]);

 const [isUserScrolling, setIsUserScrolling] = React.useState(false);
 const scrollTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
 const isFirstScroll = React.useRef(true);
 const activeLineRef = React.useRef<HTMLDivElement>(null);

 React.useEffect(() => {
 isFirstScroll.current = true;
 setIsUserScrolling(false);
 }, [trackId, isLyricsOpen, isFullscreen]);

 const handleUserScroll = React.useCallback(() => {
 setIsUserScrolling(true);
 if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
 scrollTimeoutRef.current = setTimeout(() => {
 setIsUserScrolling(false);
 }, 3000); // Resume auto-scroll after 3 seconds of inactivity
 }, []);

 const isProgrammaticScroll = React.useRef(false);

 React.useEffect(() => {
 const el = containerRef.current;
 if (!el) return;

 const onInteraction = () => {
 if (isProgrammaticScroll.current) return;
 handleUserScroll();
 };

 el.addEventListener("wheel", onInteraction, { passive: true });
 el.addEventListener("touchmove", onInteraction, { passive: true });
 el.addEventListener("pointerdown", onInteraction, { passive: true });

 return () => {
 el.removeEventListener("wheel", onInteraction);
 el.removeEventListener("touchmove", onInteraction);
 el.removeEventListener("pointerdown", onInteraction);
 if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
 };
 }, [handleUserScroll]);

 const scrollAnimRef = React.useRef<any>(null);

 React.useEffect(() => {
 const el = containerRef.current;
 const activeEl = activeLineRef.current;
 if (el && activeEl && !isUserScrolling) {
   const isSidebar = !isFullscreen && !isMobile;
   const clientH = el.clientHeight || 360;
   
   let centerRatio = 0.5;
   if (isSidebar) centerRatio = 0.35;
   else if (isMobile) centerRatio = isIdle ? 0.5 : 0.35;

   const containerCenter = clientH * centerRatio;
 const targetScrollTop = activeEl.offsetTop - containerCenter + (activeEl.clientHeight / 2);
 const maxScroll = el.scrollHeight - el.clientHeight;
 const finalScrollTop = Math.max(0, Math.min(maxScroll, targetScrollTop));

 if (isFirstScroll.current) {
 if (scrollAnimRef.current) scrollAnimRef.current.stop();
 isProgrammaticScroll.current = true;
 el.scrollTop = finalScrollTop;
 setTimeout(() => { isProgrammaticScroll.current = false; }, 50);
 isFirstScroll.current = false;
 } else {
 if (scrollAnimRef.current) scrollAnimRef.current.stop();
 isProgrammaticScroll.current = true;
 scrollAnimRef.current = animate(el.scrollTop, finalScrollTop, {
 type: "spring",
 stiffness: 80,
 damping: 20,
 mass: 1,
 onUpdate: (latest) => {
 el.scrollTop = latest;
 },
 onComplete: () => {
 isProgrammaticScroll.current = false;
 }
 });
 }
 }
 return () => {
 if (scrollAnimRef.current) {
 scrollAnimRef.current.stop();
 isProgrammaticScroll.current = false;
 }
 };
 }, [activeIndex, isUserScrolling, containerHeight]);

 if (isLoading) {
 return (
 <div className="h-full w-full flex items-center justify-center">
 <div className="w-10 h-10 border-4 border-white/10 border-t-brand rounded-full animate-spin" />
 </div>
 );
 }

 if (processedLines.length === 0) {
 if (rawLyrics && rawLyrics.trim() !== '') {
 const lines = rawLyrics.split('\n').filter(line => line.trim() !== '');
 return (
 <div 
 className={cn(
 "w-full h-full relative overflow-hidden transition-all duration-500",
 transparent ? "bg-transparent" : "bg-black/85 border border-white/5 backdrop-blur-xl shadow-2xl"
 )}
 >
 <div 
 className={cn("h-full w-full overflow-y-auto scrollbar-none", isMobile ? "p-4" : "p-10")}
 style={{ msOverflowStyle: "none", scrollbarWidth: "none" }}
 >
 <style dangerouslySetInnerHTML={{__html: `
 .scrollbar-none::-webkit-scrollbar { display: none !important; }
 `}} />
 <div className="flex flex-col w-full relative items-center text-center gap-6 pb-10 mt-10">
 {lines.map((line, idx) => (
 <p key={idx} className="text-xl md:text-2xl lg:text-3xl font-bold text-white/70 hover:text-white transition-colors duration-300 ease-out">
 {line}
 </p>
 ))}

 {/* Outro / Credits Section */}
 <div className="w-full flex flex-col items-center justify-center gap-4 mt-20 mb-10 opacity-40 hover:opacity-80 transition-opacity">
 <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shadow-xl">
 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
 <rect x="3" y="10" width="3" height="4" rx="1.5" fill="currentColor" />
 <rect x="8" y="6" width="3" height="12" rx="1.5" fill="currentColor" />
 <rect x="13" y="3" width="3" height="18" rx="1.5" fill="currentColor" />
 <rect x="18" y="8" width="3" height="8" rx="1.5" fill="currentColor" />
 </svg>
 </div>
 <div className="text-center text-xs text-white/50 space-y-1">
 <p className="font-semibold text-white/80">{title}</p>
 <p>Written & Performed by {artist}</p>
 <p className="text-[10px] uppercase tracking-widest mt-2 pt-2 border-t border-white/10">Provided by <span className="font-zenify">zenify</span> Lyrics Engine</p>
 </div>
 </div>
 </div>
 </div>
 </div>
 );
 }

 return (
 <div className="h-full w-full flex flex-col items-center justify-center opacity-50">
 <Mic2 size={48} className="mb-4" />
 <p>No synced lyrics found for this track.</p>
 </div>
 );
 }

 return (
 <div 
 className={cn(
 "w-full h-full relative overflow-hidden transition-all duration-500",
 transparent 
 ? "bg-transparent" 
 : "bg-black/85 border border-white/5 backdrop-blur-xl shadow-2xl"
 )}
 >
 {/* Blurred album art atmospheric backdrop — Apple Music style */}
 {albumArt && (
 <div
 aria-hidden="true"
 className="absolute inset-0 z-0 pointer-events-none"
 style={{
 backgroundImage: `url(${albumArt})`,
 backgroundSize: 'cover',
 backgroundPosition: 'center',
 filter: 'blur(80px) saturate(1.8) brightness(0.3)',
 transform: 'scale(1.15)', // prevents blur edge artifacts
 willChange: 'transform',
 }}
 />
 )}
 {/* Scroll Container */}
 <div 
 ref={containerRef} 
 className={cn("h-full w-full overflow-y-auto scrollbar-none select-none relative z-10", isMobile ? "p-2" : "p-6")}
 style={{
 msOverflowStyle: "none",
 scrollbarWidth: "none",
 maskImage: isMobile 
    ? (isUserScrolling 
        ? "linear-gradient(to bottom, transparent 0%, black 10%, black 70%, transparent 85%)" 
        : "linear-gradient(to bottom, transparent 0%, black 15%, black 65%, transparent 80%)")
    : (isUserScrolling 
        ? "linear-gradient(to bottom, transparent 0%, black 5%, black 95%, transparent 100%)" 
        : "linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)"),
 WebkitMaskImage: isMobile 
    ? (isUserScrolling 
        ? "linear-gradient(to bottom, transparent 0%, black 10%, black 70%, transparent 85%)" 
        : "linear-gradient(to bottom, transparent 0%, black 15%, black 65%, transparent 80%)")
    : (isUserScrolling 
        ? "linear-gradient(to bottom, transparent 0%, black 5%, black 95%, transparent 100%)" 
        : "linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)"),
 willChange: 'transform',
 transform: 'translateZ(0)',
 }}
 >
 <style dangerouslySetInnerHTML={{__html: `
 .scrollbar-none::-webkit-scrollbar {
 display: none !important;
 }
 `}} />

 <div
 className={cn(
 "flex flex-col w-full relative",
 isFullscreen ? "px-10 gap-12" : (isMobile ? "px-2 items-center gap-6" : "px-8 items-center gap-10")
 )}
 >
 {/* Spacer block to push the very first line precisely to the vertical center of the viewport */}
  <div className="w-full shrink-0 pointer-events-none" style={{ height: isMobile ? "50vh" : (isFullscreen ? "50vh" : "40vh") }} />

 {processedLines.map((line: any, idx: number) => {
 const isCurrent = idx === activeIndex;
 const isPast = idx < activeIndex;
 const isUpcoming = idx > activeIndex;
 const dist = idx - activeIndex;

 // Calculate line end time
 const lineEndTime = processedLines[idx + 1]?.time || (duration ?? line.time + 4.0);

 return (
 <div
 key={`${trackId}-${idx}`}
 ref={isCurrent ? activeLineRef : null}
 onClick={(e) => {
 e.stopPropagation();
 e.preventDefault();
 if (line.isInterlude) return;
 const audio = audioEngine.getActiveAudioElement();
 if (audio) {
 // Add a 200ms buffer so it plays from the very start of the vocal breath
 const seekTime = Math.max(0, line.time - 0.2);
 audio.currentTime = seekTime;
 const { setCurrentTime } = usePlayerStore.getState();
 setCurrentTime(seekTime);
 setIsUserScrolling(false);
 }
 }}
 className={cn(
 "w-full flex items-center shrink-0 cursor-pointer",
 isFullscreen 
 ? (line.isInterlude ? "justify-center" : (idx % 2 !== 0 ? "justify-end" : "justify-start"))
 : "justify-center"
 )}
 >
 <LiquidLyricsLine
 text={line.text}
 isCurrent={isCurrent}
 isPast={isPast}
 isUpcoming={isUpcoming}
 distFromActive={dist}
 smoothTimeValue={smoothTimeValue}
 lineStartTime={line.time}
 lineEndTime={lineEndTime}
 isFullscreen={isFullscreen}
 isMobile={isMobile}
 isIdle={isIdle}
 isInterlude={line.isInterlude}
 isRightAligned={isFullscreen && idx % 2 !== 0}
 words={line.words}
 isUserScrolling={isUserScrolling}
 />
 </div>
 );
 })}

  {/* Spacer block to push the very last line precisely to the vertical center of the viewport */}
  <div className="w-full shrink-0 pointer-events-none" style={{ height: isMobile ? "50vh" : (isFullscreen ? "50vh" : "40vh") }} />

  {/* Outro / Credits Section */}
  <div className="w-full flex flex-col items-center justify-center gap-4 mt-10 mb-10 opacity-40 hover:opacity-80 transition-opacity">
 <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shadow-xl">
 {/* Zenify Logo (Audio Lines) */}
 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
 <rect x="3" y="10" width="3" height="4" rx="1.5" fill="currentColor" />
 <rect x="8" y="6" width="3" height="12" rx="1.5" fill="currentColor" />
 <rect x="13" y="3" width="3" height="18" rx="1.5" fill="currentColor" />
 <rect x="18" y="8" width="3" height="8" rx="1.5" fill="currentColor" />
 </svg>
 </div>
 <div className="text-center text-xs text-white/50 space-y-1">
 <p className="font-semibold text-white/80">{title}</p>
 <p>Written & Performed by {artist}</p>
 <p className="text-[10px] uppercase tracking-widest mt-2 pt-2 border-t border-white/10">Provided by <span className="font-zenify">zenify</span> Lyrics Engine</p>
 </div>
 </div>

 {/* Spacer block to allow the very last line to reach the vertical center of the viewport without clipping */}
  <div className="w-full shrink-0 pointer-events-none" style={{ height: isMobile ? "50vh" : (isFullscreen ? "50vh" : "60vh") }} />

 </div>
 </div>

 {/* Floating manual sync button */}
 <AnimatePresence>
 {isUserScrolling && (
 <motion.button
 initial={{ opacity: 0, y: 15 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: 15 }}
 onClick={() => {
 setIsUserScrolling(false);
 isFirstScroll.current = false;
 const el = containerRef.current;
 const activeEl = activeLineRef.current;
 if (el && activeEl) {
 const containerCenter = el.clientHeight / 2;
 const targetScrollTop = activeEl.offsetTop - containerCenter + (activeEl.clientHeight / 2);
 const maxScroll = el.scrollHeight - el.clientHeight;
 const finalScrollTop = Math.max(0, Math.min(maxScroll, targetScrollTop));
 el.scrollTo({ top: finalScrollTop, behavior: 'smooth' });
 }
 }}
 className="absolute bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-black/60 hover:bg-black/80 border border-white/10 text-white rounded-full text-xs font-bold shadow-2xl backdrop-blur-xl transition-all active:scale-95 cursor-pointer select-none"
 >
 <Mic2 size={13} className="text-red-500 animate-pulse" />
 Sync to Song
 </motion.button>
 )}
 </AnimatePresence>

 </div>
 );
}
