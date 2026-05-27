"use client";

import React from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { Mic2 } from "lucide-react";
import { LiquidLyricsLine } from "./LiquidLyricsLine";

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
}

export function cleanLyricText(text: string): string {
    if (!text) return "";
    return text
        // 1. Remove bracketed and parenthesized tags like [Chorus], [Male: Name], (Chorus), (Male)
        .replace(/\[\s*(chorus|verse|intro|outro|bridge|male|female|view|vocal|hook|pre-chorus|refrain)([^\]]*?)\]/gi, "")
        .replace(/\(\s*(chorus|verse|intro|outro|bridge|male|female|view|vocal|hook|pre-chorus|refrain)([^\)]*?)\)/gi, "")
        // 2. Remove prefixes/colons like "Male:", "Chorus:", "View:"
        .replace(/^\s*(chorus|verse|intro|outro|bridge|male|female|view|vocal|hook|pre-chorus|refrain)\s*:\s*/gi, "")
        // 3. Remove standalone keywords (case insensitive, surrounding whitespace/newlines)
        .replace(/\b(chorus|verse|intro|outro|bridge|male|female|view|vocal|hook|pre-chorus|refrain)\b/gi, "")
        // 4. Cleanup remaining empty/whitespace brackets/parentheses
        .replace(/\[\s*\]/g, "")
        .replace(/\(\s*\)/g, "")
        // 5. Clean extra spaces
        .replace(/\s+/g, " ")
        .trim();
}

function splitTextRecursively(text: string, startTime: number, endTime: number): { time: number, text: string }[] {
    const trimmed = text.trim();
    if (!trimmed) return [];

    const duration = Math.max(0.1, endTime - startTime);
    const words = trimmed.split(/\s+/);

    // If total words is less than 6, we should NOT split it at all (this guarantees no sub-line has less than 3 words)
    if (words.length < 6) {
        return [{ time: startTime, text: trimmed }];
    }

    // If it has punctuation (comma, semicolon, pipe), let's see if we can split it
    const puncRegex = /[,;|]+/;
    if (puncRegex.test(trimmed)) {
        const parts = trimmed.split(puncRegex).map(p => p.trim()).filter(p => p.length > 0);
        // Only split if every part has at least 3 words
        const allPartsHaveMin3Words = parts.every(part => part.split(/\s+/).length >= 3);
        if (parts.length > 1 && allPartsHaveMin3Words) {
            const interval = duration / parts.length;
            const result: { time: number, text: string }[] = [];
            parts.forEach((part, index) => {
                result.push(...splitTextRecursively(part, startTime + index * interval, startTime + (index + 1) * interval));
            });
            return result;
        }
    }

    // If text is extremely long (say, > 45 chars) and has at least 6 words, we can split it in half
    if (trimmed.length > 45 && words.length >= 6) {
        const mid = Math.ceil(words.length / 2);
        const part1 = words.slice(0, mid).join(' ');
        const part2 = words.slice(mid).join(' ');
        
        // Check if both parts have at least 3 words
        if (words.slice(0, mid).length >= 3 && words.slice(mid).length >= 3) {
            const interval = duration / 2;
            return [
                ...splitTextRecursively(part1, startTime, startTime + interval),
                ...splitTextRecursively(part2, startTime + interval, endTime)
            ];
        }
    }

    return [{ time: startTime, text: trimmed }];
}

function splitLyricLine(line: any, nextTime: number) {
    const text = line.text.trim();
    const endTime = nextTime;
    const startTime = line.time;

    const parts = splitTextRecursively(text, startTime, endTime);
    return parts.map(part => ({
        ...line,
        time: part.time,
        text: part.text
    }));
}

export function LyricsView({ trackId, title, artist, currentTime, isLyricsOpen, rawLyrics, isMobile, duration, isFullscreen }: LyricsViewProps) {
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

    // 60fps RAF smoothTime rendering removed to prevent render frame lagging

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

        // 1. Split long lines / comma lines into sub-lines
        const splitLines: any[] = [];
        for (let i = 0; i < baseLines.length; i++) {
            const currentLine = baseLines[i];
            const nextLine = baseLines[i + 1];
            const lineEnd = nextLine ? nextLine.time : (duration ?? currentLine.time + 4.0);
            
            const subLines = splitLyricLine(currentLine, lineEnd);
            splitLines.push(...subLines);
        }

        // 2. Insert virtual interlude lines (triple dots) for gaps greater than 4.5 seconds
        const result: any[] = [];
        for (let i = 0; i < splitLines.length; i++) {
            result.push(splitLines[i]);
            
            const currentLine = splitLines[i];
            const nextLine = splitLines[i + 1];
            if (nextLine) {
                const gap = nextLine.time - currentLine.time;
                if (gap > 4.5) {
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

    let activeIndex = 0;
    for (let i = 0; i < processedLines.length; i++) {
        if (currentTime >= processedLines[i].time) activeIndex = i;
        else break;
    }

    // Heights — give the bigger liquid font enough room
    const LINE_HEIGHT = isFullscreen ? 72 : (isMobile ? 60 : 68);

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
        <div ref={containerRef} className="h-full w-full relative overflow-hidden rounded-2xl bg-black/85 border border-white/5 backdrop-blur-xl shadow-2xl p-6">
            <motion.div
                className={cn(
                    "absolute left-0 right-0 flex flex-col pointer-events-none",
                    isFullscreen ? "px-10" : "px-8 items-center"
                )}
                initial={false}
                animate={{
                    y: -(activeIndex * LINE_HEIGHT) + (containerHeight / 2) - (LINE_HEIGHT / 2)
                }}
                transition={{
                    ease: [0.16, 1, 0.3, 1],
                    duration: 0.55
                }}
            >
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
                            style={{ height: LINE_HEIGHT }}
                            className={cn(
                                "w-full flex items-center pointer-events-auto",
                                isFullscreen ? "justify-start" : "justify-center"
                            )}
                        >
                            <LiquidLyricsLine
                                text={line.text}
                                isCurrent={isCurrent}
                                isPast={isPast}
                                isUpcoming={isUpcoming}
                                distFromActive={dist}
                                currentTime={currentTime}
                                lineStartTime={line.time}
                                lineEndTime={lineEndTime}
                                onClick={() => {
                                    const audio = document.querySelector('audio');
                                    if (audio) audio.currentTime = line.time;
                                }}
                                isFullscreen={isFullscreen}
                                isMobile={isMobile}
                                isInterlude={line.isInterlude}
                            />
                        </div>
                    );
                })}
            </motion.div>

            {/* Gradient Masks */}
            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black via-black/40 to-transparent pointer-events-none z-10" />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none z-10" />
        </div>
    );
}
