"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

export function KaraokePainterView({
    lines,
    setLines,
    isPlaying,
    currentTime,
    audioRef,
    duration,
    commitHistory,
    undo,
    redo,
    canUndo,
    canRedo
}: KaraokePainterViewProps) {
    const [isPainting, setIsPainting] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [selectedWord, setSelectedWord] = useState<{ lineIdx: number; wordIdx: number } | null>(null);
    const [activeLineMenu, setActiveLineMenu] = useState<number | null>(null);
    const [showTooltip, setShowTooltip] = useState(true);

    const [editingLineIdx, setEditingLineIdx] = useState<number | null>(null);
    const [editingText, setEditingText] = useState("");
    const [lastPaintedWord, setLastPaintedWord] = useState<{ l: number; w: number } | null>(null);
    const longPressTimeout = useRef<NodeJS.Timeout | null>(null);

    // Hide tooltip after 3 seconds
    useEffect(() => {
        const timer = setTimeout(() => {
            setShowTooltip(false);
        }, 3000);
        return () => clearTimeout(timer);
    }, []);

    const startEditing = useCallback((lIdx: number, text: string) => {
        setEditingLineIdx(lIdx);
        setEditingText(text || "");
    }, []);

    const saveEditing = useCallback(() => {
        if (editingLineIdx === null) return;
        commitHistory();
        setLines(prev => {
            const updated = [...prev];
            const line = updated[editingLineIdx];
            const oldWords = line.words || [];
            const newWordsStr = editingText.split(' ').filter(w => w.length > 0);
            
            const newWords = newWordsStr.map((nw, i) => ({
                word: nw,
                time: oldWords[i]?.time || 0,
                endTime: oldWords[i]?.endTime
            }));

            updated[editingLineIdx] = {
                ...line,
                text: editingText,
                words: newWords
            };
            return updated;
        });
        setEditingLineIdx(null);
    }, [editingLineIdx, editingText, commitHistory, setLines]);

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
            
            if (words[wordIdx].time > 0 && time > words[wordIdx].time) {
                words[wordIdx] = { ...words[wordIdx], endTime: time };
                line.words = words;
                
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
                if (!lastPaintedWord || lastPaintedWord.l !== lIdx || lastPaintedWord.w !== wIdx) {
                    if (lastPaintedWord) {
                        markWordEnd(lastPaintedWord.l, lastPaintedWord.w);
                    }
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

    const handleLineTouchStart = (lIdx: number) => {
        longPressTimeout.current = setTimeout(() => {
            setActiveLineMenu(lIdx === activeLineMenu ? null : lIdx);
        }, 500);
    };

    const handleLineTouchEnd = () => {
        if (longPressTimeout.current) {
            clearTimeout(longPressTimeout.current);
            longPressTimeout.current = null;
        }
    };

    const handleSplitLine = (lIdx: number) => {
        if (!selectedWord || selectedWord.lineIdx !== lIdx) {
            alert("Please tap/select a word boundary in this line to choose where to split.");
            return;
        }
        const wIdx = selectedWord.wordIdx;
        commitHistory();
        setLines(prev => {
            const updated = [...prev];
            const line = updated[lIdx];
            const currentWords = line.words || [];
            if (wIdx < 0 || wIdx >= currentWords.length - 1) return prev;

            const leftWords = currentWords.slice(0, wIdx + 1);
            const rightWords = currentWords.slice(wIdx + 1);

            updated[lIdx] = {
                ...line,
                text: leftWords.map(x => x.word).join(' '),
                words: leftWords,
                endTime: leftWords[leftWords.length - 1].endTime
            };

            updated.splice(lIdx + 1, 0, {
                time: rightWords[0].time || null,
                endTime: rightWords[rightWords.length - 1].endTime,
                text: rightWords.map(x => x.word).join(' '),
                synced: rightWords[0].time > 0,
                words: rightWords
            });

            return updated;
        });
        setSelectedWord(null);
    };

    const handleMergeLine = (lIdx: number) => {
        if (lIdx >= lines.length - 1) return;
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
    };

    return (
        <div 
            className="w-full h-full bg-[#08080a]/95 flex flex-col items-center overflow-hidden touch-none select-none relative"
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={handlePointerDown}
            onTouchStart={handleTouchStart}
            onPointerMove={handlePointerMove}
            onTouchMove={handlePointerMove}
        >
            {/* Top Status Header inside workspace */}
            <div className="absolute top-4 left-0 right-0 flex justify-between items-center px-6 z-20 pointer-events-none">
                <div className="flex gap-2 pointer-events-auto">
                    <button 
                        onClick={undo} 
                        disabled={!canUndo} 
                        className="bg-white/5 p-2 rounded-xl text-white/50 hover:text-white disabled:opacity-20 backdrop-blur-md border border-white/10 hover:border-white/20 transition-all"
                        title="Undo"
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
                    </button>
                    <button 
                        onClick={redo} 
                        disabled={!canRedo} 
                        className="bg-white/5 p-2 rounded-xl text-white/50 hover:text-white disabled:opacity-20 backdrop-blur-md border border-white/10 hover:border-white/20 transition-all"
                        title="Redo"
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>
                    </button>
                </div>

                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-2 rounded-full text-xs font-semibold shadow-xl backdrop-blur-md flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", isPainting ? "bg-rose-500 animate-ping" : "bg-emerald-500")} />
                    {isPainting ? "PAINTING SYNCS..." : "Right-Click & Paint Words (Touch & Drag on Mobile)"}
                </div>

                <div className="w-[80px]" />
            </div>

            {/* Instruction Tooltip on Mount */}
            <AnimatePresence>
                {showTooltip && (
                    <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-[#121216]/90 border border-rose-500/20 text-rose-300 px-4 py-2.5 rounded-2xl text-xs font-semibold shadow-[0_0_20px_rgba(244,63,94,0.15)] backdrop-blur-xl pointer-events-none flex items-center gap-2"
                    >
                        <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                        </span>
                        Hold & Drag to Paint
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main scroll container with touch-action none during paint */}
            <div 
                ref={containerRef}
                className={cn(
                    "w-full h-full overflow-y-auto pt-[35vh] pb-[50vh] px-4 md:px-8 scrollbar-none scroll-smooth",
                    isPainting ? "touch-none" : "touch-pan-y"
                )}
                style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}
            >
                <div className="max-w-4xl mx-auto flex flex-col gap-8 md:gap-10">
                    {lines.map((line, lIdx) => {
                        const isCurrentLine = lIdx === activeIndex;
                        const isEditing = editingLineIdx === lIdx;
                        const showControls = activeLineMenu === lIdx;

                        return (
                            <div 
                                key={lIdx} 
                                data-active={isCurrentLine}
                                onTouchStart={() => handleLineTouchStart(lIdx)}
                                onTouchEnd={handleLineTouchEnd}
                                className={cn(
                                    "flex flex-wrap items-center justify-center gap-x-2.5 md:gap-x-3.5 gap-y-2 md:gap-y-3.5 text-xl md:text-3xl font-bold transition-all duration-300 relative group py-2 px-6 rounded-2xl border border-transparent",
                                    isCurrentLine || isEditing ? "opacity-100 scale-[1.01]" : "opacity-30 hover:opacity-60",
                                    isCurrentLine && "bg-white/[0.02] border-white/5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]",
                                    (!line.words || line.words.length === 0) && !isEditing ? "h-14 border-2 border-dashed border-white/10 rounded-2xl min-w-[220px]" : "cursor-text"
                                )}
                                onDoubleClick={() => startEditing(lIdx, line.text)}
                            >
                                {/* Insert line action inside layout */}
                                <div className="absolute -left-14 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1.5 z-30 pointer-events-auto">
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            commitHistory();
                                            setLines(prev => {
                                                const updated = [...prev];
                                                updated.splice(lIdx + 1, 0, { time: null, text: "", synced: false, words: [] });
                                                return updated;
                                            });
                                            setEditingLineIdx(lIdx + 1);
                                            setEditingText("");
                                        }}
                                        className="bg-white/5 hover:bg-emerald-500/20 p-2 rounded-xl text-white/40 hover:text-emerald-400 border border-white/5 transition-all" 
                                        title="Insert line below"
                                    >
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                                    </button>
                                </div>
                                
                                {isEditing ? (
                                    <input 
                                        autoFocus
                                        value={editingText}
                                        onChange={e => setEditingText(e.target.value)}
                                        onBlur={saveEditing}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') saveEditing();
                                            if (e.key === 'Escape') setEditingLineIdx(null);
                                        }}
                                        className="w-full max-w-2xl bg-black/40 border border-rose-500/30 rounded-2xl px-5 py-2.5 text-center text-white focus:outline-none focus:ring-1 focus:ring-rose-500/50"
                                    />
                                ) : (
                                    <>
                                        {line.words?.map((w, wIdx) => {
                                            const isWordSelected = selectedWord?.lineIdx === lIdx && selectedWord?.wordIdx === wIdx;
                                            const isWordPainting = isPainting && lastPaintedWord?.l === lIdx && lastPaintedWord?.w === wIdx;
                                            const isWordSynced = w.time > 0;

                                            // Determine active clip percentage for word flow fill
                                            let fillPct = 0;
                                            if (isWordSynced) {
                                                if (currentTime >= w.time) {
                                                    if (w.endTime && currentTime >= w.endTime) {
                                                        fillPct = 100;
                                                    } else {
                                                        const dur = (w.endTime || (w.time + 0.8)) - w.time;
                                                        fillPct = Math.min(100, Math.max(0, ((currentTime - w.time) / dur) * 100));
                                                    }
                                                }
                                            }

                                            return (
                                                <div key={wIdx} className="relative flex items-center">
                                                    <span 
                                                        data-word-span="true"
                                                        data-lidx={lIdx}
                                                        data-widx={wIdx}
                                                        onPointerDown={(e) => {
                                                            if (e.pointerType === 'mouse' && e.button !== 2) {
                                                                // Left click selects/toggles splits
                                                                e.stopPropagation();
                                                                setSelectedWord(isWordSelected ? null : { lineIdx: lIdx, wordIdx: wIdx });
                                                                return;
                                                            }
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
                                                        className={cn(
                                                            "relative cursor-pointer select-none rounded-full px-3.5 py-1.5 text-xs md:text-sm font-semibold transition-all duration-200 border",
                                                            isWordSynced 
                                                                ? "bg-gradient-to-r from-pink-500/20 via-rose-500/20 to-purple-600/20 text-white border-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.15)]"
                                                                : "bg-white/5 border-white/10 text-white/50 hover:text-white/80 hover:bg-white/10",
                                                            isWordPainting && "border-rose-400 animate-pulse ring-2 ring-rose-400/50 shadow-[0_0_15px_rgba(244,63,94,0.4)]",
                                                            isWordSelected && "ring-2 ring-rose-500 border-rose-500 text-white scale-[1.05] shadow-[0_0_18px_rgba(244,63,94,0.6)]"
                                                        )}
                                                    >
                                                        <span>{w.word}</span>
                                                        
                                                        {/* Text Paint Overlay */}
                                                        {isWordSynced && (
                                                            <span 
                                                                className="absolute inset-0 flex items-center justify-center pointer-events-none text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-pink-500 font-bold"
                                                                style={{
                                                                    clipPath: `inset(0 ${100 - fillPct}% 0 0)`
                                                                }}
                                                            >
                                                                {w.word}
                                                            </span>
                                                        )}
                                                    </span>

                                                    {/* Badge timestamp displays for debug / DAW layout accuracy */}
                                                    {w.time > 0 && (
                                                        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] font-mono opacity-40 whitespace-nowrap text-zinc-400 pointer-events-none">
                                                            {w.time.toFixed(1)}s
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {/* PC hover / Mobile long-press Line Action buttons */}
                                        <div className={cn(
                                            "absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 transition-all duration-200 pointer-events-auto z-30",
                                            showControls || "opacity-0 group-hover:opacity-100"
                                        )}>
                                            {/* Split Line Button */}
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleSplitLine(lIdx);
                                                }}
                                                className="bg-white/5 border border-white/10 hover:border-rose-500/30 hover:bg-rose-500/10 p-2 rounded-xl text-zinc-400 hover:text-rose-400 transition-all flex items-center justify-center"
                                                title="Split line at boundary"
                                            >
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="9.8" y1="8.2" x2="21" y2="12"/><line x1="9.8" y1="15.8" x2="21" y2="12"/>
                                                </svg>
                                            </button>

                                            {/* Merge with Next Button */}
                                            {lIdx < lines.length - 1 && (
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleMergeLine(lIdx);
                                                    }}
                                                    className="bg-white/5 border border-white/10 hover:border-rose-500/30 hover:bg-rose-500/10 p-2 rounded-xl text-zinc-400 hover:text-rose-400 transition-all flex items-center justify-center"
                                                    title="Merge with next line"
                                                >
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Premium glass scroll masks */}
            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#08080a] to-transparent pointer-events-none z-10" />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#08080a]/90 to-transparent pointer-events-none z-10" />
        </div>
    );
}
