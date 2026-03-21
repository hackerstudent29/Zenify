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
}

export function LyricsView({ trackId, title, artist, currentTime, isLyricsOpen, rawLyrics, isMobile }: LyricsViewProps) {
    const { data, isLoading } = useQuery({
        queryKey: ['lyrics', trackId],
        queryFn: async () => {
            const res = await api.get(`/metadata/sync-lyrics`, {
                params: { title, artist, rawLyrics }
            });
            return res.data?.syncedTokens || [];
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
            const res = await api.post('/metadata/translate-lyrics', { lyrics: rawText, targetLang: 'English' });
            
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

        for (let i = 0; i < data.length; i++) {
            result.push(data[i]);
            
            // Large Gaps (Instrumental breaks)
            if (i < data.length - 1) {
                const gap = data[i+1].time - data[i].time;
                if (gap > 12) {
                    result.push({ time: data[i].time + 2, text: "...", isMarker: true });
                    result.push({ time: data[i].time + (gap / 2), text: "🎵", isMarker: true });
                } else if (gap > 6) {
                    result.push({ time: data[i].time + 2, text: "...", isMarker: true });
                }
            }
        }

        // Outro/Postlude
        const lastTime = data[data.length - 1].time;
        result.push({ time: lastTime + 3, text: "...", isMarker: true });
        result.push({ time: lastTime + 6, text: "🎵", isMarker: true });

        return result;
    }, [data]);

    // Find active index in processed lines
    let activeIndex = 0;
    for (let i = 0; i < processedLines.length; i++) {
        if (currentTime >= processedLines[i].time) activeIndex = i;
        else break;
    }

    if (isLoading) {
        // ... (skeleton code stays same)
        return (
            <div className="flex flex-col items-center gap-8 w-full h-full justify-center px-12">
                {[...Array(4)].map((_, i) => (
                    <motion.div
                        key={i}
                        animate={{ opacity: [0.1, 0.3, 0.1] }}
                        transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                        className={cn(
                            "w-full bg-white/10 rounded-full",
                            isMobile ? "h-8" : "h-10",
                            i === 0 ? "w-3/4" : i === 3 ? "w-2/3" : "w-full"
                        )}
                    />
                ))}
            </div>
        );
    }

    if (processedLines.length === 0) {
        return (
            <div className="h-full w-full flex items-center justify-center">
                <motion.p 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.5 }}
                    className="text-white/20 text-xs font-bold uppercase tracking-[0.2em]"
                >
                    Lyrics Unavailable
                </motion.p>
            </div>
        );
    }

    const lineHeight = isMobile ? 70 : 85;

    return (
        <div className="h-full w-full relative overflow-hidden mask-vertical-fade">
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
                animate={{ y: -(activeIndex * lineHeight) - (lineHeight / 2) }}
                transition={{ 
                    type: "spring", 
                    stiffness: 100, 
                    damping: 24, 
                    mass: 0.6,
                    restDelta: 0.001
                }}
                className="absolute left-0 right-0 flex flex-col items-center top-[50%]"
                style={{ willChange: "transform" }}
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
                                "flex items-center justify-center px-4 md:px-10 text-center transition-all duration-700 select-none cursor-pointer group",
                                isActive 
                                    ? "text-white opacity-100 scale-100" 
                                    : "text-white/20 opacity-40 scale-95 hover:opacity-100"
                            )}
                            style={{ 
                                height: lineHeight,
                                minHeight: lineHeight,
                                filter: isActive ? "blur(0)" : `blur(${Math.min(distance * 0.8, 6)}px)`,
                                fontSize: line.isMarker
                                    ? (isActive ? "32px" : "20px")
                                    : (isMobile 
                                        ? (isActive ? "22px" : "16px")
                                        : (isActive ? "32px" : "24px")),
                                fontWeight: isActive ? 800 : 500,
                                lineHeight: "1.25",
                                width: "100%"
                            }}
                        >
                            <span 
                                className={cn(
                                    "overflow-hidden drop-shadow-md transition-all duration-500",
                                    line.isMarker ? "" : (isMobile ? "max-w-[85%]" : "max-w-[70%]")
                                )}
                                style={{
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    wordBreak: 'break-word',
                                    letterSpacing: line.text === "..." ? "0.3em" : "normal"
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
