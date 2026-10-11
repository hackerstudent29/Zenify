"use client";

import React from "react";
import { motion, useMotionValue, animate, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { ScrollText, Minus, Plus, Timer, Music2 } from "lucide-react";
import { LiquidLyricsLine } from "./LiquidLyricsLine";
import { transliterateLineRuleBased } from '@/lib/indic-transliterator';
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
 /** Callback when user manual scroll starts/stops */
 onUserScrollChange?: (scrolling: boolean) => void;
}

export function cleanLyricText(text: string): string {
 if (!text) return "";
 if (text.trim() === "• • •") return "• • •";
 
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



export function LyricsView({ trackId, title, artist, isLyricsOpen, rawLyrics, isMobile, isIdle, duration, isFullscreen, transparent, albumArt, onUserScrollChange }: LyricsViewProps) {
  const queryClient = useQueryClient();
  const [refetchInterval, setRefetchInterval] = React.useState<number | false>(5000);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['lyrics', trackId, title, artist],
    queryFn: async () => {
      if (!title) return { syncedTokens: [], source: undefined as string | undefined };
      try {
        const res = await api.post(`metadata/sync-lyrics`, {
          trackId, title, artist, rawLyrics, duration
        });
        return { 
          syncedTokens: res.data?.syncedTokens || [], 
          source: res.data?.source as string | undefined,
          romanizedLyrics: res.data?.romanizedLyrics as string | undefined,
          romanizedSyncedLyrics: res.data?.romanizedSyncedLyrics as any[] | undefined,
          romanizedLang: res.data?.romanizedLang as string | undefined,
        };
      } catch (err: any) {
        if (err.response?.status === 404) return { syncedTokens: [], source: undefined as string | undefined };
        throw err;
      }
    },
    enabled: isLyricsOpen && !!title,
    staleTime: 10000,
    refetchInterval: refetchInterval,
  });

  const currentTrack = usePlayerStore(state => state.currentTrack);

  const [isRomanized, setIsRomanized] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("zenify_lyrics_lang_mode") === "romanized";
    } catch {
      return false;
    }
  });

  const handleModeChange = (romanized: boolean) => {
    setIsRomanized(romanized);
    try {
      localStorage.setItem("zenify_lyrics_lang_mode", romanized ? "romanized" : "original");
    } catch {}
  };

  const romanizedSynced = data?.romanizedSyncedLyrics || currentTrack?.romanizedSyncedLyrics;
  const romanizedPlain = data?.romanizedLyrics || currentTrack?.romanizedLyrics;
  const romanizedLang = data?.romanizedLang || currentTrack?.romanizedLang;

  const hasRomanized = Boolean(
    (Array.isArray(romanizedSynced) && romanizedSynced.length > 0) ||
    (typeof romanizedPlain === "string" && romanizedPlain.trim().length > 0)
  );

  const romanizedLabel = React.useMemo(() => {
    const lang = (romanizedLang || "").toLowerCase();
    if (lang.includes("ta") || lang.includes("tamil")) return "Tanglish";
    if (lang.includes("hi") || lang.includes("hindi")) return "Hinglish";
    if (lang.includes("te") || lang.includes("telugu")) return "Tenglish";
    if (lang.includes("kn") || lang.includes("kannada")) return "Kanglish";
    if (lang.includes("ml") || lang.includes("malayalam")) return "Manglish";
    if (lang.includes("bn") || lang.includes("bengali")) return "Benglish";
    if (lang.includes("pa") || lang.includes("punjabi")) return "Punglish";
    if (lang.includes("gu") || lang.includes("gujarati")) return "Gujlish";
    return "Tanglish";
  }, [romanizedLang]);

    React.useEffect(() => {
    const hasSync = Boolean(data?.syncedTokens && data.syncedTokens.length > 0);
    const hasRom = Boolean(data?.romanizedLyrics || (data?.romanizedSyncedLyrics && data.romanizedSyncedLyrics.length > 0));
    if (hasSync && hasRom) {
      setRefetchInterval(false);
    } else if (hasSync && !hasRom) {
      setRefetchInterval(3000);
    } else {
      setRefetchInterval(4000);
    }
  }, [data]);

  // Synchronize incoming background lyrics/romanization into active player store immediately
  React.useEffect(() => {
    if (data?.syncedTokens?.length || data?.romanizedSyncedLyrics?.length || data?.romanizedLyrics) {
      const store = usePlayerStore.getState() as any;
      if (store.updateCurrentTrackData && store.currentTrack?.id === trackId) {
        store.updateCurrentTrackData({
          id: trackId,
          synced_lyrics: data.syncedTokens,
          romanizedLyrics: data.romanizedLyrics,
          romanizedSyncedLyrics: data.romanizedSyncedLyrics,
          romanizedLang: data.romanizedLang,
        });
      }
    }
  }, [data, trackId]);

  // Listen to background track enrich events for zero-refresh screen updates
  React.useEffect(() => {
    const handleTrackUpdated = (e: any) => {
      const detail = e.detail;
      if (detail && detail.id === trackId) {
        queryClient.invalidateQueries({ queryKey: ['lyrics-sync', trackId] });
      }
    };
    window.addEventListener('zenify:track-updated', handleTrackUpdated);
    return () => window.removeEventListener('zenify:track-updated', handleTrackUpdated);
  }, [trackId, queryClient]);

  // Guaranteed synced romanization: Never drops sync or unblurs all lines when changing language
  const activeData = React.useMemo(() => {
    const baseSynced = (data?.syncedTokens && data.syncedTokens.length > 0)
      ? data.syncedTokens
      : (Array.isArray(currentTrack?.synced_lyrics) ? currentTrack.synced_lyrics : []);

    if (!isRomanized) {
      return baseSynced;
    }

    // 1. If pre-computed romanized synced tokens exist, use them
    if (Array.isArray(romanizedSynced) && romanizedSynced.length > 0) {
      return romanizedSynced;
    }

    // 2. If plain romanized lyrics exist and base synced lyrics exist, project plain romanized lines onto synced timestamps!
    if (baseSynced.length > 0 && typeof romanizedPlain === "string" && romanizedPlain.trim().length > 0) {
      const romLines = romanizedPlain.split("\n").map(l => l.trim()).filter(Boolean);
      if (romLines.length > 0) {
        return baseSynced.map((token: any, idx: number) => ({
          ...token,
          text: romLines[idx] || transliterateLineRuleBased(token.text || ""),
          words: token.words ? token.words.map((w: any) => ({ ...w, word: transliterateLineRuleBased(w.word || "") })) : undefined
        }));
      }
    }

    // 3. Fallback: rule-based instant transliteration over base synced tokens so sync never breaks!
    if (baseSynced.length > 0) {
      return baseSynced.map((token: any) => ({
        ...token,
        text: transliterateLineRuleBased(token.text || ""),
        words: token.words ? token.words.map((w: any) => ({ ...w, word: transliterateLineRuleBased(w.word || "") })) : undefined
      }));
    }

    return [];
  }, [isRomanized, romanizedSynced, romanizedPlain, data?.syncedTokens, currentTrack?.synced_lyrics]);

  const activePlainLyrics = React.useMemo(() => {
    if (isRomanized && typeof romanizedPlain === "string" && romanizedPlain.trim().length > 0) {
      return romanizedPlain;
    }
    return rawLyrics;
  }, [isRomanized, romanizedPlain, rawLyrics]);

  const processedLines = React.useMemo(() => {
    // If explicitly marked as instrumental
    if (data?.source === 'INSTRUMENTAL' || activePlainLyrics?.trim().toLowerCase() === 'instrumental') {
      return [{ time: 0, text: '• • •', isInstrumental: true }];
    }

    // Fallback if no synced lyrics but raw plain text lyrics exist
    if ((!activeData || activeData.length === 0) && activePlainLyrics && activePlainLyrics.trim() !== '') {
      return activePlainLyrics.split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0)
        .map((line: string, idx: number) => ({
          time: -999999,
          text: cleanLyricText(line),
          isUnsynced: true
        }))
        .filter((line: any) => line.text.length > 0);
    }

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
        // Calculate the actual silence duration between the end of this line and start of next
        const wordCount = currentLine.text ? currentLine.text.trim().split(/\s+/).length : 0;
        
        // Use true endTime if available, else estimate generously (so we don't cut off slow singing)
        const estimatedDuration = Math.min(Math.max(2.5, wordCount * 0.6), nextLine.time - currentLine.time); 
        const lineEndTime = currentLine.endTime ? currentLine.endTime : (currentLine.time + estimatedDuration);
        
        const actualSilence = nextLine.time - lineEndTime;
        
        // Only show dots if there's at least 6 seconds of pure silence
        if (actualSilence > 6.0) {
          result.push({
            time: lineEndTime + 0.5, // Start dots slightly after the singer finishes
            text: "• • •",
            isInterlude: true
          });
        }
      }
    }
    return result;
  }, [activeData, activePlainLyrics, duration, data?.source]);

 // 60fps RAF smoothTime rendering & active index calculation (unified single RAF loop)
  const initialTime = React.useMemo(() => usePlayerStore.getState().currentTime, []);
  const smoothTimeValue = useMotionValue(initialTime);
  const isSeekingRef = React.useRef(false);

  const setLyricsOffsetStore = usePlayerStore(state => state.setLyricsOffset);
  const lyricsOffsetMs = currentTrack?.lyricsOffset || 0;
  const offsetRef = React.useRef(lyricsOffsetMs / 1000);
  const debounceTimerRef = React.useRef<any>(null);
  
  React.useEffect(() => {
    offsetRef.current = lyricsOffsetMs / 1000;
  }, [lyricsOffsetMs]);

  const handleOffsetChange = React.useCallback((deltaMs: number) => {
    if (!trackId) return;
    const newOffset = deltaMs === 0 ? 0 : lyricsOffsetMs + deltaMs;
    setLyricsOffsetStore(newOffset);
    
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      api.post(`tracks/${trackId}/lyrics-offset`, { offset: newOffset }).catch(console.error);
    }, 500);
  }, [trackId, lyricsOffsetMs, setLyricsOffsetStore]);

  const [activeIndex, setActiveIndex] = React.useState(0);
  const processedLinesRef = React.useRef<any[]>([]);
  
  React.useEffect(() => {
    processedLinesRef.current = processedLines;
  }, [processedLines]);

  React.useEffect(() => {
    let rafId: number;
    let lastRealTime = performance.now();

    const tick = () => {
      if (isSeekingRef.current) {
        lastRealTime = performance.now();
        rafId = requestAnimationFrame(tick);
        return;
      }
      const now = performance.now();
      const dt = (now - lastRealTime) / 1000;
      lastRealTime = now;

      let currentT: number;
      const audio = audioEngine.getActiveAudioElement();
      const isPlaying = usePlayerStore.getState().isPlaying;

      if (audio && !audio.paused) {
        const actualTime = Math.max(0, audio.currentTime + offsetRef.current);
        const currentSmooth = smoothTimeValue.get();
        const drift = Math.abs(currentSmooth - actualTime);
        if (drift > 0.5) {
          smoothTimeValue.set(actualTime);
        } else {
          // Silky-smooth exponential lerp to eliminate 250ms HTML5 audio clock jitter
          const lerped = currentSmooth + (actualTime - currentSmooth) * Math.min(1, dt * 10);
          smoothTimeValue.set(lerped);
        }
        currentT = smoothTimeValue.get();
      } else if (isPlaying) {
        const storeTime = Math.max(0, usePlayerStore.getState().currentTime + offsetRef.current);
        const currentSmooth = smoothTimeValue.get();
        const drift = Math.abs(currentSmooth - storeTime);
        if (drift > 0.5) {
          smoothTimeValue.set(storeTime);
        } else {
          const lerped = currentSmooth + (storeTime - currentSmooth) * Math.min(1, dt * 10);
          smoothTimeValue.set(lerped);
        }
        currentT = smoothTimeValue.get();
      } else {
        currentT = Math.max(0, usePlayerStore.getState().currentTime + offsetRef.current);
        smoothTimeValue.set(currentT);
      }

      // Calculate active line index in the same RAF tick
      const lines = processedLinesRef.current;
      if (lines && lines.length > 0) {
        let newIndex = -1;
        for (let i = 0; i < lines.length; i++) {
          if (currentT >= lines[i].time) newIndex = i;
          else break;
        }
        setActiveIndex(prevIndex => (prevIndex !== newIndex ? newIndex : prevIndex));
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [smoothTimeValue, trackId]);

 const containerRef = React.useRef<HTMLDivElement>(null);
 const [containerHeight, setContainerHeight] = React.useState(360);

  React.useEffect(() => {
    if (containerRef.current) {
      setContainerHeight(containerRef.current.clientHeight);
    }
  }, [isLyricsOpen, isLoading, data]);

 React.useEffect(() => {
 const handleResize = () => {
 if (containerRef.current) {
 setContainerHeight(containerRef.current.clientHeight);
 }
 };
 window.addEventListener('resize', handleResize);
 return () => window.removeEventListener('resize', handleResize);
 }, []);

  const [isUserScrolling, setIsUserScrolling] = React.useState(false);
  const scrollTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const isFirstScroll = React.useRef(true);
  const activeLineRef = React.useRef<HTMLDivElement>(null);
  
  // Track explicit user intent (wheel or touch) to prevent passive mouse hover/move from triggering unblur
  const userScrollIntentRef = React.useRef(false);

  React.useEffect(() => {
    if (onUserScrollChange) {
      onUserScrollChange(isUserScrolling);
    }
  }, [isUserScrolling, onUserScrollChange]);

  React.useEffect(() => {
    isFirstScroll.current = true;
    setIsUserScrolling(false);
    userScrollIntentRef.current = false;
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [trackId, isLyricsOpen, isFullscreen]);

  const triggerUserScroll = React.useCallback(() => {
    if (isProgrammaticScroll.current) return;
    
    // Stop any ongoing programmatic animation if user forces scroll
    if (scrollAnimRef.current) {
      scrollAnimRef.current.stop();
    }
    
    setIsUserScrolling(true);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      setIsUserScrolling(false);
      userScrollIntentRef.current = false;
    }, 4000);
  }, []);

  // User manual scroll detection — only fires on actual scroll activity
  const handleScroll = () => {
    if (isProgrammaticScroll.current) return;
    // Only activate user scrolling mode if the user explicitly used wheel or touch drag
    if (userScrollIntentRef.current) {
      triggerUserScroll();
    }
  };

  // Explicit user wheel interaction
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (isProgrammaticScroll.current) return;
    userScrollIntentRef.current = true;
    triggerUserScroll();
  };

  // Explicit user touch interaction
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (isProgrammaticScroll.current) return;
    userScrollIntentRef.current = true;
    triggerUserScroll();
  };
  
  const isProgrammaticScroll = React.useRef(false);

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  const scrollAnimRef = React.useRef<any>(null);

  React.useEffect(() => {
    const el = containerRef.current;
    const activeEl = activeLineRef.current;

    // Skip programmatic scroll if lyrics are unsynced
    const isUnsynced = processedLinesRef.current?.[0]?.isUnsynced;
    if (isUnsynced) return;

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

      const diff = Math.abs(el.scrollTop - finalScrollTop);
      if (isFirstScroll.current) {
        isProgrammaticScroll.current = true;
        el.scrollTop = finalScrollTop;
        setTimeout(() => { isProgrammaticScroll.current = false; }, 250);
        isFirstScroll.current = false;
      } else if (diff >= 1.5) {
        isProgrammaticScroll.current = true;
        if (scrollAnimRef.current) scrollAnimRef.current.stop();
        
        // Dynamically scale scroll duration based on line time gap (prevents scroll lag on fast lyrics)
        const currentLineTime = processedLinesRef.current?.[activeIndex]?.time || 0;
        const nextLineTime = processedLinesRef.current?.[activeIndex + 1]?.time;
        let scrollDuration = 400; // ms
        if (nextLineTime && Number.isFinite(nextLineTime)) {
          const gap = nextLineTime - currentLineTime;
          if (gap > 0) {
            scrollDuration = Math.min(400, Math.max(180, gap * 550));
          }
        }

                // Butter-smooth fluid spring scroll for both fullscreen and sidebar
        const springParams = isFullscreen
          ? { stiffness: 85, damping: 22, mass: 0.85 }
          : { stiffness: 110, damping: 24, mass: 0.9 };

                scrollAnimRef.current = animate(el.scrollTop, finalScrollTop, {
          type: "spring",
          ...springParams,
          onUpdate: (v) => { el.scrollTop = v; },
          onComplete: () => {
            setTimeout(() => { isProgrammaticScroll.current = false; }, 250);
          }
        });
      }
    }
  }, [activeIndex, isUserScrolling, containerHeight, trackId, isLyricsOpen, isFullscreen, isMobile, isIdle, isLoading, data]);

  // Guard flag & timer to prevent mobile ghost-clicks and accidental seeking on underlying lyric lines
  const isSyncingRef = React.useRef(false);
  const syncGuardTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    return () => {
      if (syncGuardTimerRef.current) clearTimeout(syncGuardTimerRef.current);
    };
  }, []);

  const handleSyncToSong = React.useCallback((e?: React.SyntheticEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    
    // Prevent double execution and block clicks on underlying lyrics lines for 650ms
    isSyncingRef.current = true;
    if (syncGuardTimerRef.current) clearTimeout(syncGuardTimerRef.current);
    syncGuardTimerRef.current = setTimeout(() => {
      isSyncingRef.current = false;
    }, 650);

    setIsUserScrolling(false);
    userScrollIntentRef.current = false;
    isFirstScroll.current = false;

    const el = containerRef.current;
    const activeEl = activeLineRef.current;
    if (el && activeEl) {
      const isSidebar = !isFullscreen && !isMobile;
      const clientH = el.clientHeight || 360;
      let centerRatio = 0.5;
      if (isSidebar) centerRatio = 0.35;
      else if (isMobile) centerRatio = isIdle ? 0.5 : 0.35;

      const containerCenter = clientH * centerRatio;
      const targetScrollTop = activeEl.offsetTop - containerCenter + (activeEl.clientHeight / 2);
      const maxScroll = el.scrollHeight - el.clientHeight;
      const finalScrollTop = Math.max(0, Math.min(maxScroll, targetScrollTop));
      el.scrollTo({ top: finalScrollTop, behavior: 'smooth' });
    }
  }, [isFullscreen, isMobile, isIdle]);


  const [showLoading, setShowLoading] = React.useState(false);
  
  React.useEffect(() => {
    if (isLoading) {
      setShowLoading(true);
      const timer = setTimeout(() => setShowLoading(false), 2000); // 2 seconds max loading spinner
      return () => clearTimeout(timer);
    } else {
      setShowLoading(false);
    }
  }, [isLoading, trackId]);

  if (showLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-white/10 border-t-white/80 rounded-full animate-spin" />
      </div>
    );
  }

  const isInstrumental = data?.source === 'INSTRUMENTAL' || 
    (activeData.length === 1 && (activeData[0].text === '• • •' || activeData[0].text?.toLowerCase() === 'instrumental')) ||
    (processedLines.length === 1 && (processedLines[0].text === '• • •' || processedLines[0].isInstrumental)) ||
    (activePlainLyrics?.trim().toLowerCase() === 'instrumental');

  if (isInstrumental) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-center p-6 select-none animate-fadeIn">
        <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/50 mb-3 backdrop-blur-md shadow-lg">
          <Music2 size={24} className="text-white/70" />
        </div>
        <p className="text-sm font-bold tracking-widest uppercase text-white/70 font-brand">Instrumental</p>
        <p className="text-xs text-white/40 mt-1">This track contains no vocal lyrics</p>
      </div>
    );
  }

  if (processedLines.length === 0) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center opacity-50">
        <ScrollText size={48} className="mb-4" />
        <p>No synced lyrics found for this track.</p>
      </div>
    );
  }

  const isUnsynced = processedLines && processedLines[0]?.isUnsynced;
  const showUnmasked = isUnsynced;

  // Elevated Top Header Controls Bar (Moved completely ABOVE the lyrics area to prevent accidental mistouches across all screen sizes)
  const renderTopControls = () => {
    const showSyncOffset = processedLines.length > 0 && !isUnsynced && data?.source !== 'QUICKLRC';
    if (!hasRomanized && !isUserScrolling && !showSyncOffset) return null;

    return (
      <div 
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 w-full px-4 py-2.5 flex items-center justify-between gap-2 z-40 bg-zinc-950/80 backdrop-blur-md border-b border-white/5 relative"
      >
        {/* Language Changing Button (Original vs Romanized/Tanglish) */}
        {hasRomanized ? (
          <div className="flex items-center p-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 shadow-md">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleModeChange(false);
              }}
              className={cn(
                "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer select-none",
                !isRomanized ? "bg-brand text-white shadow-sm" : "text-white/60 hover:text-white"
              )}
            >
              Original
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleModeChange(true);
              }}
              className={cn(
                "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer select-none",
                isRomanized ? "bg-brand text-white shadow-sm" : "text-white/60 hover:text-white"
              )}
            >
              {romanizedLabel}
            </button>
          </div>
        ) : <div />}

        {/* Sync Controls: Sync to Song button + Timing offset */}
        <div className="flex items-center gap-2">
          <AnimatePresence>
            {isUserScrolling && (
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSyncToSong(e);
                }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand/20 hover:bg-brand/30 border border-brand/40 text-brand text-[10px] font-bold uppercase tracking-wider shadow-md transition-all active:scale-95 cursor-pointer select-none"
              >
                <ScrollText size={12} className="text-brand shrink-0 animate-pulse" />
                <span>Sync to Song</span>
              </motion.button>
            )}
          </AnimatePresence>

          {showSyncOffset && (
            <div className="flex items-center gap-0.5 bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/10 text-white/70">
              <button
                type="button"
                onClick={() => handleOffsetChange(-500)}
                className="p-1 hover:text-white hover:bg-white/10 rounded-full cursor-pointer"
                title="Delay lyrics (-0.5s)"
              >
                <Minus size={11} />
              </button>
              <button
                type="button"
                onClick={() => handleOffsetChange(0)}
                className={cn(
                  "text-[9px] font-bold px-1.5 py-0.5 rounded w-10 text-center cursor-pointer",
                  lyricsOffsetMs !== 0 ? "text-brand bg-brand/20" : "text-white/50"
                )}
                title="Reset offset"
              >
                {(lyricsOffsetMs / 1000).toFixed(1)}s
              </button>
              <button
                type="button"
                onClick={() => handleOffsetChange(500)}
                className="p-1 hover:text-white hover:bg-white/10 rounded-full cursor-pointer"
                title="Advance lyrics (+0.5s)"
              >
                <Plus size={11} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Unsynced (plain text) lyrics: render as a normal, fully-visible scrollable block
  // so the user can read and scroll naturally — no programmatic centering needed.
  if (isUnsynced) {
    return (
      <div
        className={cn(
          "w-full h-full flex flex-col relative overflow-hidden transition-all duration-500",
          transparent ? "bg-transparent" : "glass-panel"
        )}
      >
        {renderTopControls()}
        <div
          ref={containerRef}
          className={cn("flex-1 min-h-0 w-full overflow-y-auto scrollbar-none select-text relative z-10", isMobile ? "p-4" : "p-6")}
          style={{ msOverflowStyle: "none", scrollbarWidth: "none" }}
          onScroll={handleScroll}
          onWheel={handleWheel}
          onTouchMove={handleTouchMove}
        >
          <div className={cn("flex flex-col gap-3 pb-20", isFullscreen ? "max-w-5xl mx-auto" : "")}>
            {processedLines.map((line: any, idx: number) => (
              <p
                key={`${trackId}-unsynced-${idx}`}
                className="text-white/70 text-center text-base leading-relaxed"
              >
                {line.text}
              </p>
            ))}
          </div>
        </div>
      </div>
    );
  }

 return (
 <div 
 className={cn(
 "w-full h-full flex flex-col relative overflow-hidden transition-all duration-500",
 transparent 
 ? "bg-transparent" 
 : "glass-panel"
 )}
 >
 {renderTopControls()}

 <div 
   className="flex-1 min-h-0 w-full relative overflow-hidden"
   style={{
     WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
     maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)'
   }}
 >
 {/* Scroll Container */}
 <div 
 ref={containerRef} 
 className={cn("h-full w-full overflow-y-auto scrollbar-none select-none relative z-10", isMobile ? "p-2" : "p-6")}
  style={{
    msOverflowStyle: "none",
    scrollbarWidth: "none",
    willChange: 'transform',
    transform: 'translateZ(0)',
    WebkitOverflowScrolling: "touch",
  }}
  onScroll={handleScroll}
  onWheel={handleWheel}
  onTouchMove={handleTouchMove}
 >
 <style dangerouslySetInnerHTML={{__html: `
 .scrollbar-none::-webkit-scrollbar {
 display: none !important;
 }
 `}} />

 <div
 className={cn(
 "flex flex-col relative w-full",
 isFullscreen ? (isMobile ? "px-4 gap-8 max-w-full mx-auto" : "px-10 gap-12 max-w-5xl mx-auto") : (isMobile ? "px-2 items-center gap-6" : "px-8 items-center gap-10")
 )}
 >
 {/* Spacer block to push the very first line precisely to the vertical center of the viewport */}
  <div className="w-full shrink-0 pointer-events-none" style={{ height: isMobile ? "50vh" : (isFullscreen ? "50vh" : "40vh") }} />

 {processedLines.map((line: any, idx: number) => {
 const isCurrent = idx === activeIndex;
 const isPast = idx < activeIndex;
 const isUpcoming = idx > activeIndex;
 const dist = idx - activeIndex;

  // Calculate line end time (strictly bounded to next line's start time to prevent double-line filling)
  const nextLineTime = processedLines[idx + 1]?.time;
  const rawEndTime = line.endTime && line.endTime > line.time 
    ? line.endTime 
    : (nextLineTime && nextLineTime > line.time ? nextLineTime : line.time + 3.5);
  const lineEndTime = Math.max(line.time + 0.8, rawEndTime);

 return (
 <div
 key={`${trackId}-${idx}`}
 ref={(isCurrent || (activeIndex === -1 && idx === 0)) ? activeLineRef : null}
 onClick={(e) => {
    e.stopPropagation();
    e.preventDefault();
    // CRITICAL: Block accidental seeks if the user clicked or tapped "Sync to Song"
    if (isSyncingRef.current) return;
    if (line.isInterlude || line.isUnsynced) return;
    const audio = audioEngine.getActiveAudioElement();
    if (audio) {
      // Add a 200ms buffer so it plays from the very start of the vocal breath
      const seekTime = Math.max(0, line.time - 0.2);
      isSeekingRef.current = true;
      setActiveIndex(idx);
      smoothTimeValue.set(seekTime);
      audio.currentTime = seekTime;
      const { setCurrentTime } = usePlayerStore.getState();
      setCurrentTime(seekTime);
      setIsUserScrolling(false);
      setTimeout(() => {
        isSeekingRef.current = false;
      }, 400);
    }
  }}
 className={cn(
 "w-full flex items-center shrink-0 cursor-pointer",
 isFullscreen 
 ? (line.isInterlude ? "justify-center" : "justify-start")
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
 isUnsynced={line.isUnsynced}
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
 </div>

 </div>
 );
}
