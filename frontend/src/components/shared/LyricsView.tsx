"use client";

import React from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { Mic2 } from "lucide-react";

interface LyricsViewProps {
    trackId: string;
    title: string;
    artist: string;
    currentTime: number;
    isLyricsOpen: boolean;
    rawLyrics?: string;
    isMobile?: boolean;
    duration?: number;
}

export function LyricsView({ trackId, title, artist, currentTime, isLyricsOpen, rawLyrics, isMobile, duration }: LyricsViewProps) {
    const { data, isLoading, refetch, isFetching } = useQuery({
        queryKey: ['lyrics', trackId, title, artist],
        queryFn: async () => {
            if (!title) return [];
            try {
                const res = await api.post(`metadata/sync-lyrics`, {
                    title, artist, rawLyrics, duration
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

    const activeData = data || [];
    const processedLines = React.useMemo(() => {
        if (!activeData || !Array.isArray(activeData)) return [];
        return activeData.map((line: any) => ({
            ...line,
            time: parseFloat(line.time || 0)
        }));
    }, [activeData]);

    let activeIndex = 0;
    for (let i = 0; i < processedLines.length; i++) {
        if (currentTime >= processedLines[i].time) activeIndex = i;
        else break;
    }

    // Dynamic sizing to ensure 2 lines max on mobile
    const LINE_HEIGHT = isMobile ? 54 : 68;
    const CONTAINER_HEIGHT = 360;

    if (isLoading) {
        return (
            <div className="h-full w-full flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-white/10 border-t-brand rounded-full animate-spin" />
            </div>
        );
    }

    if (processedLines.length === 0) {
        return (
            <div className="h-full w-full flex flex-col items-center justify-center px-8 gap-4">
                <Mic2 size={32} className="text-white/20 mb-2" />
                <p className="text-white/40 text-[10px] text-center font-black uppercase tracking-[0.3em]">
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
        <div className="h-full w-full relative overflow-hidden rounded-[24px]">
            <motion.div 
                className="absolute left-0 right-0 px-8 flex flex-col items-center pointer-events-none"
                initial={false}
                animate={{ 
                    y: -(activeIndex * LINE_HEIGHT) + (CONTAINER_HEIGHT / 2) - (LINE_HEIGHT / 2)
                }}
                transition={{ 
                    type: "spring", 
                    stiffness: 140, 
                    damping: 26, 
                    mass: 0.4
                }}
            >
                {processedLines.map((line: any, idx: number) => {
                    const distance = Math.abs(idx - activeIndex);
                    const isCurrent = idx === activeIndex;
                    
                    const opacity = isCurrent ? 1 : (distance === 1 ? 0.35 : 0.06);
                    const scale = isCurrent ? 1 : 0.94;

                    return (
                        <div
                            key={`${trackId}-${idx}`}
                            style={{ height: LINE_HEIGHT }}
                            className="w-full flex items-center justify-center pointer-events-auto"
                            onClick={(e) => {
                                e.stopPropagation();
                                const audio = document.querySelector('audio');
                                if (audio) audio.currentTime = line.time;
                            }}
                        >
                            <motion.p 
                                animate={{ opacity, scale }}
                                className={cn(
                                    "leading-[1.15] text-center select-none cursor-pointer px-2 line-clamp-2 break-words text-balance",
                                    isCurrent ? "font-black" : "font-bold"
                                )}
                                style={{
                                    fontSize: isCurrent 
                                        ? (isMobile ? "19px" : "28px") 
                                        : (isMobile ? "15px" : "20px"),
                                    color: isCurrent ? 'var(--accent)' : 'white'
                                }}
                            >
                                {line.text}
                            </motion.p>
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
