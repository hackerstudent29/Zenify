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
    currentTime: number;
    isLyricsOpen: boolean;
    rawLyrics?: string;
    isMobile?: boolean;
    duration?: number;
    /** When true, renders in the fullscreen split-screen panel (wider, larger fonts) */
    isFullscreen?: boolean;
    /** When true, removes the black card background so lyrics float over the aurora */
    transparent?: boolean;
}

export function cleanLyricText(text: string): string {
    if (!text) return "";
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



export function LyricsView({ trackId, title, artist, currentTime, isLyricsOpen, rawLyrics, isMobile, duration, isFullscreen, transparent }: LyricsViewProps) {
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
    const smoothTimeValue = useMotionValue(currentTime);
    React.useEffect(() => {
        let rafId: number;
        const tick = () => {
            const audio = audioEngine.getActiveAudioElement();
            if (audio && !audio.paused) {
                smoothTimeValue.set(audio.currentTime);
            } else {
                smoothTimeValue.set(currentTime);
            }
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
    }, [currentTime, smoothTimeValue]);

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
                if (gap > 7.0) {
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
        let rafId: number;
        const tick = () => {
            const audio = audioEngine.getActiveAudioElement();
            const currentT = (audio && !audio.paused) ? audio.currentTime : currentTime;
            
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

            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
    }, [currentTime]);

    const [isUserScrolling, setIsUserScrolling] = React.useState(false);
    const scrollTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
    const isFirstScroll = React.useRef(true);
    const activeLineRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        isFirstScroll.current = true;
        setIsUserScrolling(false);
    }, [trackId]);

    const handleUserScroll = React.useCallback(() => {
        setIsUserScrolling(true);
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => {
            setIsUserScrolling(false);
        }, 5000); // Resume auto-scroll after 5 seconds of inactivity
    }, []);

    React.useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const onInteraction = () => {
            handleUserScroll();
        };

        el.addEventListener("wheel", onInteraction, { passive: true });
        el.addEventListener("touchmove", onInteraction, { passive: true });

        return () => {
            el.removeEventListener("wheel", onInteraction);
            el.removeEventListener("touchmove", onInteraction);
            if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        };
    }, [handleUserScroll]);

    React.useEffect(() => {
        const el = containerRef.current;
        const activeEl = activeLineRef.current;
        if (el && activeEl && !isUserScrolling) {
            const containerCenter = el.clientHeight / 2;
            const targetScrollTop = activeEl.offsetTop - containerCenter + (activeEl.clientHeight / 2);
            
            const maxScroll = el.scrollHeight - el.clientHeight;
            const finalScrollTop = Math.max(0, Math.min(maxScroll, targetScrollTop));

            if (isFirstScroll.current) {
                el.scrollTop = finalScrollTop;
                isFirstScroll.current = false;
            } else {
                animate(el.scrollTop, finalScrollTop, {
                    type: "spring",
                    stiffness: 100,
                    damping: 20,
                    mass: 0.8,
                    onUpdate: (val) => {
                        el.scrollTop = val;
                    }
                });
            }
        }
    }, [activeIndex, isUserScrolling, containerHeight]);

    if (isLoading) {
        return (
            <div className="h-full w-full flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-white/10 border-t-brand rounded-full animate-spin" />
            </div>
        );
    }

    if (processedLines.length === 0) {
        return (
            <div className={cn(
                "h-full w-full flex flex-col justify-center gap-4",
                isFullscreen ? "items-start px-10" : "items-center px-8"
            )}>
                <Mic2 size={32} className="text-white/20 mb-2" />
                <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.3em]">
                    Lyrics Unavailable
                </p>
                <button
                    onClick={() => refetch()}
                    className="px-5 py-2.5 rounded-full bg-white/5 border border-white/10 text-white/40 text-[11px] font-bold"
                >
                    {isFetching ? 'Searching...' : 'Try Again'}
                </button>
            </div>
        );
    }

    return (
        <div 
            className={cn(
                "h-full w-full relative overflow-hidden rounded-2xl",
                transparent 
                    ? "bg-transparent" 
                    : "bg-black/85 border border-white/5 backdrop-blur-xl shadow-2xl"
            )}
        >
            {/* Scroll Container */}
            <div 
                ref={containerRef} 
                className={cn("h-full w-full overflow-y-auto scrollbar-none select-none relative", isMobile ? "p-2" : "p-6")}
                style={{
                    msOverflowStyle: "none",
                    scrollbarWidth: "none",
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
                    {/* Padding at top to ensure first item can reach center safely */}
                    <div style={{ height: containerHeight / 2 - 30 }} className="shrink-0" />
                    
                    {processedLines.map((line: any, idx: number) => {
                        const isCurrent  = idx === activeIndex;
                        const isPast     = idx < activeIndex;
                        const isUpcoming = idx > activeIndex;
                        const dist       = idx - activeIndex;

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
                                        audio.currentTime = line.time;
                                        const { setCurrentTime } = usePlayerStore.getState();
                                        setCurrentTime(line.time);
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
                                    isInterlude={line.isInterlude}
                                    isRightAligned={isFullscreen && idx % 2 !== 0}
                                />
                            </div>
                        );
                    })}

                    {/* Padding at bottom to ensure last item can reach center safely */}
                    <div style={{ height: containerHeight / 2 - 30 }} className="shrink-0" />
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
                                animate(el.scrollTop, finalScrollTop, {
                                    type: "spring",
                                    stiffness: 100,
                                    damping: 20,
                                    mass: 0.8,
                                    onUpdate: (val) => {
                                        el.scrollTop = val;
                                    }
                                });
                            }
                        }}
                        className="absolute bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-black/60 hover:bg-black/80 border border-white/10 text-white rounded-full text-xs font-bold shadow-2xl backdrop-blur-xl transition-all active:scale-95 cursor-pointer select-none"
                    >
                        <Mic2 size={13} className="text-red-500 animate-pulse" />
                        Sync to Song
                    </motion.button>
                )}
            </AnimatePresence>

            {/* Gradient Masks */}
            <div className={cn("absolute inset-x-0 top-0 h-24 bg-gradient-to-b to-transparent pointer-events-none z-10", transparent ? "from-transparent via-transparent" : "from-black via-black/40")} />
            <div className={cn("absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t to-transparent pointer-events-none z-10", transparent ? "from-transparent via-transparent" : "from-black via-black/40")} />
        </div>
    );
}
