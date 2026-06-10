"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { SyncedLine, SyncedWord } from './LyricSyncStudio';
import { cn } from '@/lib/utils';
import { cleanLyricText } from '@/components/shared/LyricsView';

interface KaraokePainterViewProps {
    lines: SyncedLine[];
    setLines: React.Dispatch<React.SetStateAction<SyncedLine[]>>;
    isPlaying: boolean;
    currentTime: number;
    audioRef: React.RefObject<HTMLAudioElement>;
    duration: number;
    commitHistory: () => void;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
}

export function KaraokePainterView({ lines, setLines, isPlaying, currentTime, audioRef, duration, commitHistory, undo, redo, canUndo, canRedo }: KaraokePainterViewProps) {
    const [isPainting, setIsPainting] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [activeIndex, setActiveIndex] = useState(0);

    // Initial word parsing if lines don't have words
    useEffect(() => {
        setLines(prev => {
            let changed = false;
            const newLines = prev.map(line => {
                if (!line.words || line.words.length === 0) {
                    changed = true;
                    const cleaned = cleanLyricText(line.text);
                    const words = cleaned.split(' ').filter(w => w.length > 0);
                    return {
                        ...line,
                        words: words.map(w => ({ word: w, time: 0, endTime: undefined }))
                    };
                }
                return line;
            });
            return changed ? newLines : prev;
        });
    }, [lines.length, setLines]);

    // Auto-scroll logic
    useEffect(() => {
        let newIndex = 0;
        for (let i = 0; i < lines.length; i++) {
            const t = lines[i].time ?? (lines[i].words?.[0]?.time || 0);
            if (t > 0 && currentTime >= t) {
                newIndex = i;
            } else if (t > 0) {
                break;
            }
        }
        setActiveIndex(newIndex);
    }, [currentTime, lines]);

    useEffect(() => {
        if (!isPainting && containerRef.current) {
            const activeEl = containerRef.current.querySelector('[data-active="true"]') as HTMLElement;
            if (activeEl) {
                const containerCenter = containerRef.current.clientHeight / 2;
                const targetScrollTop = activeEl.offsetTop - containerCenter + (activeEl.clientHeight / 2);
                containerRef.current.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
            }
        }
    }, [activeIndex, isPainting]);

    const [lastPaintedWord, setLastPaintedWord] = useState<{l: number, w: number} | null>(null);

    useEffect(() => {
        const handlePointerUp = () => {
            setIsPainting(false);
            setLastPaintedWord(null);
        };
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('touchend', handlePointerUp);
        return () => {
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('touchend', handlePointerUp);
        };
    }, []);

    const markWordStart = useCallback((lineIdx: number, wordIdx: number) => {
        if (!audioRef.current) return;
        const time = audioRef.current.currentTime;
        
        setLines(prev => {
            const updated = [...prev];
            const line = { ...updated[lineIdx] };
            const words = [...(line.words || [])];
            
            words[wordIdx] = { ...words[wordIdx], time, endTime: undefined }; // Reset endTime if repainting
            line.words = words;
            
            // If it's the first word, also set the line time
            if (wordIdx === 0 || line.time === null || line.time === 0) {
                line.time = time;
                line.synced = true;
            }
            updated[lineIdx] = line;
            return updated;
        });
    }, [audioRef, setLines]);

    const markWordEnd = useCallback((lineIdx: number, wordIdx: number) => {
        if (!audioRef.current) return;
        const time = audioRef.current.currentTime;

        setLines(prev => {
            const updated = [...prev];
            const line = { ...updated[lineIdx] };
            const words = [...(line.words || [])];
            
            // Only set end time if start time exists and is before current time
            if (words[wordIdx].time > 0 && time > words[wordIdx].time) {
                words[wordIdx] = { ...words[wordIdx], endTime: time };
                line.words = words;
                
                // If it's the last word, set the line endTime
                if (wordIdx === words.length - 1) {
                    line.endTime = time;
                }
                updated[lineIdx] = line;
            }
            return updated;
        });
    }, [audioRef, setLines]);

    const handlePointerMove = useCallback((e: React.PointerEvent | React.TouchEvent) => {
        if (!isPainting) return;
        
        let clientX = 0;
        let clientY = 0;
        
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as React.PointerEvent).clientX;
            clientY = (e as React.PointerEvent).clientY;
        }

        const el = document.elementFromPoint(clientX, clientY) as HTMLElement;
        const wordSpan = el?.closest('[data-word-span="true"]') as HTMLElement;
        
        if (wordSpan) {
            const lIdx = parseInt(wordSpan.getAttribute('data-lidx') || '-1', 10);
            const wIdx = parseInt(wordSpan.getAttribute('data-widx') || '-1', 10);
            
            if (lIdx !== -1 && wIdx !== -1) {
                // If we moved to a new word
                if (!lastPaintedWord || lastPaintedWord.l !== lIdx || lastPaintedWord.w !== wIdx) {
                    // End previous word if there was one
                    if (lastPaintedWord) {
                        markWordEnd(lastPaintedWord.l, lastPaintedWord.w);
                    }
                    // Start new word
                    markWordStart(lIdx, wIdx);
                    setLastPaintedWord({ l: lIdx, w: wIdx });
                }
            }
        }
    }, [isPainting, lastPaintedWord, markWordStart, markWordEnd]);

    const handlePointerDown = (e: React.PointerEvent) => {
        // Only allow right-click (button === 2) on mouse, or touch
        if (e.pointerType === 'mouse' && e.button !== 2) return;
        commitHistory();
        setIsPainting(true);
    };

    const handleTouchStart = () => {
        commitHistory();
        setIsPainting(true);
    };

    return (
        <div 
            className="w-full h-full bg-black/80 flex flex-col items-center overflow-hidden touch-none select-none relative"
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={handlePointerDown}
            onTouchStart={handleTouchStart}
            onPointerMove={handlePointerMove}
            onTouchMove={handlePointerMove}
        >
            <div className="absolute top-4 left-0 right-0 flex justify-between px-6 z-20 pointer-events-none">
                {/* Undo/Redo Controls */}
                <div className="flex gap-2 pointer-events-auto">
                    <button onClick={undo} disabled={!canUndo} className="bg-black/50 p-2 rounded-full text-white/50 hover:text-white disabled:opacity-30 backdrop-blur-md border border-white/10 transition-all">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
                    </button>
                    <button onClick={redo} disabled={!canRedo} className="bg-black/50 p-2 rounded-full text-white/50 hover:text-white disabled:opacity-30 backdrop-blur-md border border-white/10 transition-all">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>
                    </button>
                </div>

                <div className="bg-brand/20 border border-brand/30 text-brand px-4 py-2 rounded-full text-xs font-bold shadow-xl backdrop-blur-md flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", isPainting ? "bg-red-500 animate-pulse" : "bg-emerald-500")} />
                    {isPainting ? "PAINTING..." : "Right-click & drag to sync (Mobile: Swipe)"}
                </div>
                
                <div className="w-[88px]" /> {/* Spacer for centering */}
            </div>

            <div 
                ref={containerRef}
                className="w-full h-full overflow-y-auto pt-[30vh] pb-[50vh] px-4 md:px-8 scrollbar-none scroll-smooth"
                style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}
            >
                <div className="max-w-3xl mx-auto flex flex-col gap-6 md:gap-8">
                    {lines.map((line, lIdx) => {
                        if (!line.words || line.words.length === 0) return null;
                        const isCurrentLine = lIdx === activeIndex;

                        return (
                            <div 
                                key={lIdx} 
                                data-active={isCurrentLine}
                                className={cn(
                                    "flex flex-wrap justify-center gap-x-2 md:gap-x-3 gap-y-1 md:gap-y-2 text-xl md:text-4xl font-bold transition-opacity duration-300 relative group",
                                    isCurrentLine ? "opacity-100" : "opacity-30 hover:opacity-60"
                                )}
                            >
                                <div className="absolute -left-12 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1 z-30">
                                    <button 
                                        onClick={() => {
                                            commitHistory();
                                            setLines(prev => {
                                                const updated = [...prev];
                                                updated.splice(lIdx + 1, 0, { time: null, text: "", synced: false, words: [] });
                                                return updated;
                                            });
                                        }}
                                        className="bg-white/10 hover:bg-emerald-500/50 p-1.5 rounded-md text-white/50 hover:text-white" title="Insert line below"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                                    </button>
                                </div>
                                
                                {line.words.map((w, wIdx) => {
                                    // Determine fill based on time
                                    let fillPct = 0;
                                    if (w.time > 0) {
                                        if (currentTime >= w.time) {
                                            if (w.endTime && currentTime >= w.endTime) {
                                                fillPct = 100;
                                            } else {
                                                // Interpolate
                                                const dur = (w.endTime || (w.time + 1)) - w.time;
                                                fillPct = Math.min(100, Math.max(0, ((currentTime - w.time) / dur) * 100));
                                            }
                                        }
                                    }

                                    return (
                                        <React.Fragment key={wIdx}>
                                        <span 
                                            data-word-span="true"
                                            data-lidx={lIdx}
                                            data-widx={wIdx}
                                            onPointerDown={(e) => {
                                                // Handle single clicks for non-dragging scenarios
                                                if (e.pointerType === 'mouse' && e.button !== 2) return;
                                                if (!isPainting) {
                                                    commitHistory();
                                                    markWordStart(lIdx, wIdx);
                                                    setLastPaintedWord({ l: lIdx, w: wIdx });
                                                }
                                            }}
                                            onContextMenu={(e) => e.preventDefault()}
                                            onPointerUp={(e) => {
                                                if (!isPainting && lastPaintedWord?.l === lIdx && lastPaintedWord?.w === wIdx) {
                                                    markWordEnd(lIdx, wIdx);
                                                    setLastPaintedWord(null);
                                                }
                                            }}
                                            className="relative cursor-crosshair px-1 py-1 rounded hover:bg-white/5 transition-colors"
                                        >
                                            <span className="text-white/20">{w.word}</span>
                                            
                                            {/* Fill Overlay */}
                                            <span 
                                                className="absolute top-1 left-1 pointer-events-none text-transparent bg-clip-text bg-gradient-to-br from-brand to-rose-400"
                                                style={{
                                                    clipPath: `inset(0 ${100 - fillPct}% 0 0)`
                                                }}
                                            >
                                                {w.word}
                                            </span>

                                            {/* Visible times */}
                                            {w.time > 0 && (
                                                <div className={cn("absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] font-mono whitespace-nowrap", w.endTime ? "text-emerald-400" : "text-brand")}>
                                                    {w.time.toFixed(1)}{w.endTime ? ` - ${w.endTime.toFixed(1)}` : ''}
                                                </div>
                                            )}
                                        </span>
                                        
                                        {/* Split word trigger */}
                                        {wIdx < line.words!.length - 1 && (
                                            <button 
                                                className="opacity-0 group-hover:opacity-100 w-2 hover:bg-white/20 mx-0.5 rounded cursor-col-resize z-20"
                                                title="Split line here"
                                                onClick={() => {
                                                    commitHistory();
                                                    setLines(prev => {
                                                        const updated = [...prev];
                                                        const currentWords = updated[lIdx].words!;
                                                        const leftWords = currentWords.slice(0, wIdx + 1);
                                                        const rightWords = currentWords.slice(wIdx + 1);
                                                        
                                                        updated[lIdx] = {
                                                            ...updated[lIdx],
                                                            text: leftWords.map(x=>x.word).join(' '),
                                                            words: leftWords,
                                                            endTime: leftWords[leftWords.length-1].endTime
                                                        };
                                                        
                                                        updated.splice(lIdx + 1, 0, {
                                                            time: rightWords[0].time || null,
                                                            endTime: rightWords[rightWords.length-1].endTime,
                                                            text: rightWords.map(x=>x.word).join(' '),
                                                            synced: rightWords[0].time > 0,
                                                            words: rightWords
                                                        });
                                                        return updated;
                                                    });
                                                }}
                                            />
                                        )}
                                        </React.Fragment>
                                    );
                                })}

                                {/* Merge with next line trigger */}
                                {lIdx < lines.length - 1 && (
                                    <button 
                                        onClick={() => {
                                            commitHistory();
                                            setLines(prev => {
                                                const updated = [...prev];
                                                const nextLine = updated[lIdx + 1];
                                                updated[lIdx] = {
                                                    ...updated[lIdx],
                                                    text: updated[lIdx].text + " " + nextLine.text,
                                                    words: [...(updated[lIdx].words || []), ...(nextLine.words || [])],
                                                    endTime: nextLine.endTime || updated[lIdx].endTime
                                                };
                                                updated.splice(lIdx + 1, 1);
                                                return updated;
                                            });
                                        }}
                                        className="absolute -right-12 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 bg-white/10 hover:bg-brand/50 p-1.5 rounded-md text-white/50 hover:text-white transition-all z-30" 
                                        title="Merge with next line"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Gradients */}
            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black to-transparent pointer-events-none" />
            <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
        </div>
    );
}
