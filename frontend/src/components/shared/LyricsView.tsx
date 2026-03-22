"use client";

import React from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { Languages, Loader2, Sparkles } from "lucide-react";

interface LyricsViewProps {
    trackId?: string;
    title?: string;
    artist?: string;
    currentTime: number;
    isLyricsOpen: boolean;
    rawLyrics?: string;
    isMobile?: boolean;
    duration?: number;
}

export function LyricsView({ trackId, title, artist, currentTime, isLyricsOpen, rawLyrics, isMobile, duration }: LyricsViewProps) {
    const { data, isLoading, refetch, isFetching } = useQuery({
        queryKey: ['lyrics', trackId],
        queryFn: async () => {
            try {
                const res = await api.get(`metadata/sync-lyrics`, {
                    params: { title, artist, rawLyrics, duration }
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
    
    const [isTranslating, setIsTranslating] = React.useState(false);
    const [translatedData, setTranslatedData] = React.useState<any[] | null>(null);
    const [translationError, setTranslationError] = React.useState(false);

    const handleTranslate = async () => {
        if (translatedData) {
            setTranslatedData(null);
            return;
        }

        setIsTranslating(true);
        setTranslationError(false);
        try {
            // We need a combined string to translate
            const rawText = data.map((l: any) => l.text).join('\n');
            const res = await api.post('metadata/translate-lyrics', { lyrics: rawText, targetLang: 'English' });
            
            if (res.data?.translated) {
                const lines = res.data.translated.split('\n');
                const matched = data.map((orig: any, i: number) => ({
                    ...orig,
                    text: lines[i] || orig.text
                }));
                setTranslatedData(matched);
            }
        } catch (err) {
            setTranslationError(true);
        } finally {
            setIsTranslating(false);
        }
    };

    const activeData = translatedData || data || [];

    // Process lines to inject instrumental markers
    const processedLines = React.useMemo(() => {
        if (!activeData || activeData.length === 0) return [];
        const result = [];
        const firstLineTime = activeData[0].time;

        // Intro/Prelude
        if (firstLineTime > 4) {
            result.push({ time: 0, text: "🎵", isMarker: true });
            if (firstLineTime > 8) {
                result.push({ time: 2, text: "...", isMarker: true });
            }
        }

        for (let i = 0; i < activeData.length; i++) {
            result.push(activeData[i]);
            
            // Large Gaps (Instrumental breaks)
            if (i < activeData.length - 1) {
                const gap = activeData[i+1].time - activeData[i].time;
                if (gap > 12) {
                    result.push({ time: activeData[i].time + 2, text: "...", isMarker: true });
                    result.push({ time: activeData[i].time + (gap / 2), text: "🎵", isMarker: true });
                } else if (gap > 6) {
                    result.push({ time: activeData[i].time + 2, text: "...", isMarker: true });
                }
            }
        }

        // Outro/Postlude
        const lastTime = data[data.length - 1].time;
        result.push({ time: lastTime + 3, text: "...", isMarker: true });
        result.push({ time: lastTime + 6, text: "🎵", isMarker: true });

        return result;
    }, [activeData]);

    // Find active index in processed lines
    let activeIndex = 0;
    for (let i = 0; i < processedLines.length; i++) {
        if (currentTime >= processedLines[i].time) activeIndex = i;
        else break;
    }

    if (isLoading) {
        return (
            <div className="flex w-full h-full items-center justify-center">
                <Loader2 className="animate-spin text-white/40" size={20} />
            </div>
        );
    }

    if (processedLines.length === 0) {
        return (
            <div className="h-full w-full flex flex-col items-center justify-center px-8 gap-4">
                <motion.p 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.5 }}
                    className="text-white/40 text-[10px] text-center font-black uppercase tracking-[0.3em]"
                >
                    Lyrics Unavailable
                </motion.p>
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="px-5 py-2.5 rounded-full bg-white/5 border border-white/10 text-white/60 text-[11px] font-bold hover:bg-white/10 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                    {isFetching ? (
                        <Loader2 size={14} className="animate-spin" />
                    ) : (
                        <Sparkles size={14} className="text-brand" />
                    )}
                    {isFetching ? 'Searching...' : 'Deep Search Lyrics'}
                </motion.button>
            </div>
        );
    }

    const lineHeight = isMobile ? 54 : 68;

    return (
        <div className="h-full w-full relative overflow-hidden mask-vertical-fade-aggressive">
            {/* Translation controls */}
            <div className="absolute top-4 right-4 z-[60] flex items-center gap-2">
                <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={handleTranslate}
                    disabled={isTranslating}
                    className={cn(
                        "p-2.5 rounded-full border border-white/10 flex items-center gap-2 transition-all",
                        translatedData ? "bg-brand text-black" : "bg-white/5 text-white/40 hover:text-white"
                    )}
                >
                    {isTranslating ? (
                        <Loader2 className="animate-spin" size={14} />
                    ) : (
                        <Languages size={14} />
                    )}
                    <span className="text-[10px] font-black uppercase tracking-widest hidden md:inline">
                        {translatedData ? 'English' : 'AI Translate'}
                    </span>
                </motion.button>
            </div>

            <motion.div 
                animate={{ y: -(activeIndex * lineHeight) }}
                transition={{ 
                    type: "spring", 
                    stiffness: 150, 
                    damping: 28, 
                    mass: 0.4,
                    restDelta: 0.001
                }}
                className="absolute left-0 right-0 flex flex-col items-center top-[calc(50%-34px)]"
                style={{ 
                    willChange: "transform",
                    top: isMobile ? "calc(50% - 27px)" : "calc(50% - 34px)"
                }}
            >
                {processedLines.map((line: any, idx: number) => {
                    const isActive = idx === activeIndex;
                    const distance = Math.abs(idx - activeIndex);
                    
                    return (
                        <motion.div
                            key={`${idx}-${line.time}`}
                            onClick={() => {
                                const audio = document.querySelector('audio') as HTMLAudioElement;
                                if (audio) audio.currentTime = line.time;
                            }}
                            className={cn(
                                "flex items-center justify-center px-6 md:px-12 text-center transition-all duration-700 select-none cursor-pointer group",
                                isActive 
                                    ? "text-white opacity-100 scale-100" 
                                    : "text-white/40 opacity-50 scale-95 hover:text-white/80"
                            )}
                            style={{ 
                                height: lineHeight,
                                minHeight: lineHeight,
                                overflow: 'hidden',
                                filter: isActive ? "blur(0)" : `blur(${Math.min(distance * 2, 8)}px)`,
                                fontSize: line.isMarker
                                    ? (isActive ? "32px" : "20px")
                                    : (isMobile 
                                        ? (isActive ? "20px" : "15px")
                                        : (isActive ? "28px" : "20px")),
                                fontWeight: isActive ? 900 : 600,
                                lineHeight: "1.1",
                                width: "100%"
                            }}
                        >
                            <span 
                                className={cn(
                                    "drop-shadow-lg transition-all duration-500 leading-tight",
                                    line.isMarker ? "" : (isMobile ? "max-w-[95%]" : "max-w-[90%]")
                                )}
                                style={{
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                    textAlign: 'center'
                                }}
                            >
                                {line.text}
                            </span>
                        </motion.div>
                    );
                })}
            </motion.div>
        </div>
    );
}
