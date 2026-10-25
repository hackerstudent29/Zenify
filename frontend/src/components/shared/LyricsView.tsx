"use client";

import React from "react";
import { motion, useMotionValue, animate, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { ScrollText, Minus, Plus, Timer, Music2, X } from "lucide-react";
import { LiquidLyricsLine } from "./LiquidLyricsLine";
import { transliterateLineRuleBased, transliterateTextRuleBased } from '@/lib/indic-transliterator';
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
 /** Close callback for split-screen and fullview headers */
 onClose?: () => void;
}

export function cleanLyricText(text: string): string {
  if (!text) return "";
  const trimmed = text.trim();
  if (trimmed === "• • •") return "• • •";
  
  // Convert explicit instrumental and musical bridge markers to 3 dots
  if (/^(\[|\()?\s*(instrumental|music|solo|interlude|guitar solo|bgm|musical interlude)\s*(\]|\))?$/i.test(trimmed)) {
    return "• • •";
  }

  // Catch common Genius/Musixmatch garbage lines
  if (/Português|Türkçe|Español|Việt|Italiano|Français|Deutsch/i.test(text)) return "";
  if (/^\d+$/.test(trimmed)) return ""; // raw numbers like "107"
  if (trimmed.toLowerCase() === "lyrics") return "";
  if (text.toLowerCase().includes("lyrics") && text.length < 60) {
    if (text.toLowerCase().endsWith("lyrics")) return "";
  }

  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/\[\d{1,2}:\d{2}[^\]]*\]/g, " ")
    // 1. Remove artist tags or bracketed section names like [Chorus] (unless instrumental)
    .replace(/\[\s*(chorus|verse|intro|outro|bridge|male|female|view|vocal|hook|pre-chorus|refrain|spoken)[^\]]*\]/gi, "")
    // 2. Remove parenthesized tags like (Chorus), (Male), (Spoken)
    .replace(/\(\s*(chorus|verse|intro|outro|bridge|male|female|view|vocal|hook|pre-chorus|refrain|spoken)([^)]*?)\)/gi, "")
    // 3. Remove prefixes/colons like "Male:", "Chorus:", "View:", "Singer:" at the start of the line
    .replace(/^\s*(chorus|verse|intro|outro|bridge|male|female|view|vocal|hook|pre-chorus|refrain|singer)\s*:\s*/gi, "")
    // 4. Remove standalone metadata keywords
    .replace(/\b(chorus|verse|intro|outro|bridge|male|female|view|vocal|hook|pre-chorus|refrain)\b/gi, "")
    // 5. Cleanup remaining empty/whitespace parentheses
    .replace(/\(\s*\)/g, "")
    // 6. Ensure space after punctuation glued to words
    .replace(/([,;:!?])([A-Za-z0-9\u0B80-\u0D7F])/g, "$1 $2")
    // 7. Clean extra spaces
    .replace(/\s+/g, " ")
    .trim();
}



export function LyricsView({ trackId, title, artist, isLyricsOpen, rawLyrics, isMobile, isIdle, duration, isFullscreen, transparent, albumArt, onUserScrollChange, onClose }: LyricsViewProps) {
  const queryClient = useQueryClient();
  const [refetchInterval, setRefetchInterval] = React.useState<number | false>(5000);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['lyrics', trackId, title, artist],
    queryFn: async () => {
      if (!title) return { syncedTokens: [], source: undefined as string | undefined, status: 'not_found' as const };
      try {
        const res = await api.post(`metadata/sync-lyrics`, {
          trackId, title, artist, rawLyrics, duration
        });
        return { 
          status: (res.data?.status || 'available') as string,
          message: res.data?.message as string | undefined,
          syncedTokens: res.data?.syncedTokens || [], 
          source: res.data?.source as string | undefined,
          romanizedLyrics: res.data?.romanizedLyrics as string | undefined,
          romanizedSyncedLyrics: res.data?.romanizedSyncedLyrics as any[] | undefined,
          romanizedLang: res.data?.romanizedLang as string | undefined,
        };
      } catch (err: any) {
        if (err.response?.status === 404) return { syncedTokens: [], source: undefined, status: 'not_found' as const };
        return { syncedTokens: [], source: undefined, status: 'failed' as const };
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

  const romanizedSynced = data?.romanizedSyncedLyrics || currentTrack?.romanizedSyncedLyrics;
  const romanizedPlain = data?.romanizedLyrics || currentTrack?.romanizedLyrics;
  const romanizedLang = data?.romanizedLang || currentTrack?.romanizedLang;

  const hasRomanized = Boolean(
    (Array.isArray(romanizedSynced) && romanizedSynced.length > 0) ||
    (typeof romanizedPlain === "string" && romanizedPlain.trim().length > 0)
  );

  const hasRegionalScript = React.useMemo(() => {
    const sample = [
      rawLyrics || "",
      ...(data?.syncedTokens?.map((t: any) => t.text) || []),
      ...(currentTrack?.synced_lyrics?.map((t: any) => t.text) || []),
      title || "",
    ].join(" ");
    return /[\u0900-\u0D7F]/.test(sample);
  }, [rawLyrics, data?.syncedTokens, currentTrack?.synced_lyrics, title]);

  const canTranslate = hasRomanized || hasRegionalScript;

  const handleModeChange = (romanized: boolean) => {
    setIsRomanized(romanized);
    try {
      localStorage.setItem("zenify_lyrics_lang_mode", romanized ? "romanized" : "original");
    } catch {}

    // Call background worker to persist transliteration or connect Deepgram if not already stored
    if (romanized && trackId && !hasRomanized) {
      api.post('metadata/romanize-track', { trackId })
        .then(res => {
          if (res.data?.success) {
            queryClient.invalidateQueries({ queryKey: ['lyrics', trackId, title, artist] });
          }
        })
        .catch(err => {
          console.warn("[LyricsView] Background romanization notice:", err.message);
        });
    }
  };

  const romanizedLabel = React.useMemo(() => {
    const lang = (romanizedLang || "").toLowerCase();
    if (lang.includes("ta") || lang.includes("tamil")) return "Tanglish";
    if (lang.includes("hi") || lang.includes("hindi")) return "Hinglish";
    if (lang.includes("te") || lang.includes("telugu")) return "Tenglish";
    if (lang.includes("kn") || lang.includes("kannada")) return "Kanglish";
    if (lang.includes("ml") || lang.includes("malayalam")) return "Manglish";
    if (lang.includes("bn") || lang.includes("bengali")) return "Benglish";
    if (lang.includes("pa") || lang.includes("punjabi")) return "Punjabi";
    if (lang.includes("gu") || lang.includes("gujarati")) return "Gujlish";

    // Detect from actual characters if romanizedLang not set
    const sample = [rawLyrics || "", ...(data?.syncedTokens?.map((t: any) => t.text) || []), title || ""].join(" ");
    for (const ch of sample) {
      const code = ch.charCodeAt(0);
      if (code >= 0x0B80 && code <= 0x0BFF) return "Tanglish";
      if (code >= 0x0900 && code <= 0x097F) return "Hinglish";
      if (code >= 0x0C00 && code <= 0x0C7F) return "Tenglish";
      if (code >= 0x0C80 && code <= 0x0CFF) return "Kanglish";
      if (code >= 0x0D00 && code <= 0x0D7F) return "Manglish";
      if (code >= 0x0980 && code <= 0x09FF) return "Benglish";
      if (code >= 0x0A00 && code <= 0x0A7F) return "Punjabi";
      if (code >= 0x0A80 && code <= 0x0AFF) return "Gujlish";
    }
    return "Tanglish";
  }, [romanizedLang, rawLyrics, data?.syncedTokens, title]);

    React.useEffect(() => {
    const hasSync = Boolean(data?.syncedTokens && data.syncedTokens.length > 0);
    const hasRom = Boolean(data?.romanizedLyrics || (data?.romanizedSyncedLyrics && data.romanizedSyncedLyrics.length > 0));
    if (data?.status === 'processing') {
      setRefetchInterval(2500); // Actively poll while background worker synchronizes
    } else if (hasSync && hasRom) {
      setRefetchInterval(false);
    } else if (hasSync && !hasRom) {
      setRefetchInterval(3000);
    } else if (data?.status === 'not_found' || data?.status === 'failed') {
      setRefetchInterval(false);
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

  // Guaranteed synced romanization: STRICTLY anchored to baseSynced timestamps so Tanglish/English timing is 100% identical!
  const activeData = React.useMemo(() => {
    const baseSynced = (data?.syncedTokens && data.syncedTokens.length > 0)
      ? data.syncedTokens
      : (Array.isArray(currentTrack?.synced_lyrics) ? currentTrack.synced_lyrics : []);

    if (!isRomanized) {
      return baseSynced;
    }

    // When Romanized/Tanglish is active, use baseSynced as the absolute master clock:
    // Every single line and syllable preserves its exact time, endTime, and word timestamps!
    if (baseSynced.length > 0) {
      const romLines = (typeof romanizedPlain === "string" && romanizedPlain.trim().length > 0)
        ? romanizedPlain.split("\n").map(l => l.trim()).filter(Boolean)
        : null;

      const hasPrecomputedSynced = Array.isArray(romanizedSynced) && romanizedSynced.length > 0;

      return baseSynced.map((token: any, idx: number) => {
        const precomputedToken = hasPrecomputedSynced ? romanizedSynced[idx] : null;
        const text = precomputedToken?.text || (romLines && romLines[idx]) || transliterateLineRuleBased(token.text || "");

        // Word-level syllable timestamps strictly preserved from baseSynced
        const words = token.words?.map((w: any, wIdx: number) => ({
          ...w, // Preserves time, endTime!
          word: (precomputedToken?.words && precomputedToken.words[wIdx]?.word) || transliterateLineRuleBased(w.word || "")
        }));

        return {
          ...token, // Preserves time, endTime, isInterlude!
          text,
          words: words || token.words
        };
      });
    }

    if (Array.isArray(romanizedSynced) && romanizedSynced.length > 0) {
      return romanizedSynced;
    }

    return [];
  }, [isRomanized, romanizedSynced, romanizedPlain, data?.syncedTokens, currentTrack?.synced_lyrics]);

  const activePlainLyrics = React.useMemo(() => {
    if (!isRomanized) return rawLyrics;
    if (typeof romanizedPlain === "string" && romanizedPlain.trim().length > 0) {
      return romanizedPlain;
    }
    if (rawLyrics && rawLyrics.trim().length > 0) {
      return transliterateTextRuleBased(rawLyrics);
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
      const rawLines = activePlainLyrics.split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0);

      const expandedLines: string[] = [];
      for (const line of rawLines) {
        const words = line.split(/\s+/);
        if (words.length > 8 || line.length > 50) {
          const mid = Math.ceil(words.length / 2);
          expandedLines.push(words.slice(0, mid).join(' '));
          expandedLines.push(words.slice(mid).join(' '));
        } else {
          expandedLines.push(line);
        }
      }

      return expandedLines
        .map((line: string) => ({
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

    // Preserve complete authentic lyric lines without artificial fragmentation or cutting down lyrics
    const splitLines = baseLines;

    // 2. Insert virtual interlude lines (triple dots) for intro, breaks (> 3.2s), and outro
    const result: any[] = [];
    const trackDur = duration || usePlayerStore.getState().duration || 0;

    // Intro instrumental interlude
    if (splitLines.length > 0 && splitLines[0].time > 3.2 && splitLines[0].text !== '• • •') {
      result.push({
        time: 0,
        endTime: Math.max(0.5, splitLines[0].time - 0.3),
        text: "• • •",
        isInterlude: true
      });
    }

    for (let i = 0; i < splitLines.length; i++) {
      const currentLine = splitLines[i];
      if (currentLine.text === '• • •') {
        currentLine.isInterlude = true;
      }
      result.push(currentLine);
      
      const nextLine = splitLines[i + 1];
      if (nextLine) {
        // Calculate the actual silence duration between the end of this line and start of next
        const wordCount = currentLine.text ? currentLine.text.trim().split(/\s+/).length : 0;
        const estimatedDuration = Math.min(Math.max(2.0, wordCount * 0.55), Math.max(0.5, nextLine.time - currentLine.time)); 
        const lineEndTime = currentLine.endTime ? currentLine.endTime : (currentLine.time + estimatedDuration);
        
        const actualSilence = nextLine.time - lineEndTime;
        
        // Show 3 dots if there is a musical break >= 3.2 seconds
        if (actualSilence >= 3.2 && nextLine.text !== '• • •') {
          result.push({
            time: lineEndTime + 0.3,
            endTime: Math.max(lineEndTime + 0.8, nextLine.time - 0.2),
            text: "• • •",
            isInterlude: true
          });
        }
      }
    }

    // Outro instrumental interlude
    if (result.length > 0 && trackDur > 0) {
      const lastLine = result[result.length - 1];
      const lastWordCount = lastLine.text ? lastLine.text.trim().split(/\s+/).length : 0;
      const lastLineEnd = lastLine.endTime || (lastLine.time + Math.max(2.5, lastWordCount * 0.6));
      if (trackDur - lastLineEnd >= 4.5 && lastLine.text !== '• • •') {
        result.push({
          time: lastLineEnd + 0.5,
          endTime: trackDur - 0.5,
          text: "• • •",
          isInterlude: true
        });
      }
    }

    return result;
  }, [activeData, activePlainLyrics, duration, data?.source]);

 // 60fps RAF smoothTime rendering & active index calculation (unified single RAF loop)
  const initialTime = React.useMemo(() => {
    const audio = audioEngine.getActiveAudioElement();
    const t = (audio && Number.isFinite(audio.currentTime)) 
      ? audio.currentTime 
      : usePlayerStore.getState().currentTime;
    return Math.max(0, t + (currentTrack?.lyricsOffset || 0) / 1000);
  }, [currentTrack?.lyricsOffset]);
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

  const [activeIndex, setActiveIndex] = React.useState(() => {
    const audio = audioEngine.getActiveAudioElement();
    const t = (audio && Number.isFinite(audio.currentTime)) 
      ? audio.currentTime 
      : usePlayerStore.getState().currentTime;
    const targetT = Math.max(0, t + (currentTrack?.lyricsOffset || 0) / 1000);
    if (processedLines && processedLines.length > 0) {
      let idx = 0;
      for (let i = 0; i < processedLines.length; i++) {
        if (targetT >= processedLines[i].time) idx = i;
        else break;
      }
      return idx;
    }
    return 0;
  });
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
      if (isFullscreen) centerRatio = 0.38;
      else if (isSidebar) centerRatio = 0.35;
      else if (isMobile) centerRatio = isIdle ? 0.45 : 0.35;

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
        let scrollDuration = 500; // ms
        if (nextLineTime && Number.isFinite(nextLineTime)) {
          const gap = nextLineTime - currentLineTime;
          if (gap > 0) {
            scrollDuration = Math.min(500, Math.max(200, gap * 580));
          }
        }

        // Apple Music fluid kinetic scroll: creamy tracking without spring bounce or snapping
        const animDuration = Math.min(0.55, Math.max(0.28, scrollDuration / 1000));
        scrollAnimRef.current = animate(el.scrollTop, finalScrollTop, {
          duration: animDuration,
          ease: [0.22, 1, 0.36, 1],
          onUpdate: (v) => { if (el) el.scrollTop = v; },
          onComplete: () => {
            setTimeout(() => { isProgrammaticScroll.current = false; }, 200);
          }
        });
      }
    }
  }, [activeIndex, isUserScrolling, containerHeight, trackId, isLyricsOpen, isFullscreen, isMobile, isIdle, isLoading, data]);

  // Guard flag & timer to prevent mobile ghost-clicks and accidental seeking on underlying lyric lines
  const isSyncingRef = React.useRef(false);
  const syncGuardTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const touchStartYRef = React.useRef<number | null>(null);
  const touchMovedRef = React.useRef(false);

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
    
    // Prevent double execution and block clicks on underlying lyrics lines for 1000ms
    isSyncingRef.current = true;
    if (syncGuardTimerRef.current) clearTimeout(syncGuardTimerRef.current);
    syncGuardTimerRef.current = setTimeout(() => {
      isSyncingRef.current = false;
    }, 1000);

    userScrollIntentRef.current = false;
    isFirstScroll.current = false;
    isProgrammaticScroll.current = true;
    if (scrollAnimRef.current) scrollAnimRef.current.stop();

    const el = containerRef.current;
    const activeEl = activeLineRef.current;
    if (el && activeEl) {
      const isSidebar = !isFullscreen && !isMobile;
      const clientH = el.clientHeight || 360;
      let centerRatio = 0.5;
      if (isFullscreen) centerRatio = 0.38;
      else if (isSidebar) centerRatio = 0.35;
      else if (isMobile) centerRatio = isIdle ? 0.45 : 0.35;

      const containerCenter = clientH * centerRatio;
      const targetScrollTop = activeEl.offsetTop - containerCenter + (activeEl.clientHeight / 2);
      const maxScroll = el.scrollHeight - el.clientHeight;
      const finalScrollTop = Math.max(0, Math.min(maxScroll, targetScrollTop));

      scrollAnimRef.current = animate(el.scrollTop, finalScrollTop, {
        type: "spring",
        stiffness: 140,
        damping: 24,
        mass: 0.8,
        onUpdate: (v) => { if (el) el.scrollTop = v; },
        onComplete: () => {
          setTimeout(() => { isProgrammaticScroll.current = false; }, 300);
        }
      });
    }

    setIsUserScrolling(false);
  }, [isFullscreen, isMobile, isIdle]);


  const [showLoading, setShowLoading] = React.useState(false);
  
  React.useEffect(() => {
    const hasLyricsInMemory = Boolean(
      (data?.syncedTokens && data.syncedTokens.length > 0) ||
      (currentTrack?.synced_lyrics && currentTrack.synced_lyrics.length > 0) ||
      (data as any)?.plainLyrics ||
      rawLyrics ||
      processedLines.length > 0
    );
    if (isLoading && !hasLyricsInMemory) {
      setShowLoading(true);
      const timer = setTimeout(() => setShowLoading(false), 2000);
      return () => clearTimeout(timer);
    } else {
      setShowLoading(false);
    }
  }, [isLoading, trackId, data, currentTrack?.synced_lyrics, rawLyrics, processedLines.length]);

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
    if (data?.status === 'processing' || (isLoading && !data)) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center select-none animate-fadeIn">
          <div className="w-10 h-10 rounded-full border-2 border-brand border-t-transparent animate-spin mb-4" />
          <p className="text-sm font-bold tracking-widest uppercase text-white/80 font-brand">Synchronizing Lyrics</p>
          <p className="text-xs text-white/40 mt-1 max-w-xs">{data?.message || 'Searching line-by-line timing...'}</p>
        </div>
      );
    }
    return (
      <div className="h-full w-full flex flex-col items-center justify-center opacity-50 select-none">
        <ScrollText size={48} className="mb-4 text-white/40" />
        <p className="text-sm font-medium text-white/70">No lyrics available for this recording</p>
      </div>
    );
  }

  const isUnsynced = processedLines && processedLines[0]?.isUnsynced;
  const showUnmasked = isUnsynced;

  // Elevated Top Header Controls Bar (Minimal round pill style, compact language option, compact offset & close X)
  const renderTopControls = () => {
    const showSyncOffset = processedLines.length > 0 && !isUnsynced && data?.source !== 'QUICKLRC';
    if (!canTranslate && !showSyncOffset && !onClose) return null;

    return (
      <div 
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 w-full px-4 py-2 flex items-center justify-between gap-3 z-40 bg-transparent border-none relative select-none"
      >
        {/* Language Changing Button (OG vs EN) Minimal Compact Style */}
        {canTranslate ? (
          <div className="flex items-center gap-0.5 p-0.5 rounded-full bg-zinc-900/60 hover:bg-zinc-900/90 backdrop-blur-xl border border-white/10 select-none transition-all">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleModeChange(false);
              }}
              className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase transition-all cursor-pointer",
                !isRomanized ? "bg-brand text-white shadow-sm font-black" : "text-white/60 hover:text-white"
              )}
            >
              OG
            </button>
            <span className="text-white/20 text-[9px] font-light select-none">/</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleModeChange(true);
              }}
              className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase transition-all cursor-pointer",
                isRomanized ? "bg-brand text-white shadow-sm font-black" : "text-white/60 hover:text-white"
              )}
            >
              {romanizedLabel || "EN"}
            </button>
          </div>
        ) : <div />}

        {/* Right side: Sync ±0.5s Offset Component & Close X Component with minimal footprint */}
        <div className="flex items-center gap-3 select-none">
          {showSyncOffset && (
            <div className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-zinc-900/60 hover:bg-zinc-900/90 backdrop-blur-xl border border-white/10 text-white/70 transition-all">
              <button
                type="button"
                onClick={() => handleOffsetChange(-500)}
                className="p-0.5 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                title="Delay lyrics (-0.5s)"
              >
                <Minus size={11} />
              </button>
              <button
                type="button"
                onClick={() => handleOffsetChange(0)}
                className={cn(
                  "text-[9px] font-bold px-1 py-0.5 rounded w-9 text-center cursor-pointer transition-colors",
                  lyricsOffsetMs !== 0 ? "text-brand font-black" : "text-white/60"
                )}
                title="Reset offset"
              >
                {(lyricsOffsetMs / 1000).toFixed(1)}s
              </button>
              <button
                type="button"
                onClick={() => handleOffsetChange(500)}
                className="p-0.5 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                title="Advance lyrics (+0.5s)"
              >
                <Plus size={11} />
              </button>
            </div>
          )}

          {onClose && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="w-7 h-7 rounded-full bg-zinc-900/60 hover:bg-zinc-800 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all cursor-pointer active:scale-90"
              title="Close lyrics"
            >
              <X size={14} />
            </button>
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
          (transparent || isFullscreen) ? "bg-transparent border-none shadow-none" : "glass-panel"
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
          <div className={cn("flex flex-col gap-8 pb-24", isFullscreen ? "max-w-5xl mx-auto" : "")}>
            {processedLines.map((line: any, idx: number) => (
              <p
                key={`${trackId}-unsynced-${idx}`}
                className={cn(
                  "text-white/80 text-center leading-[1.65] font-semibold tracking-normal",
                  isMobile ? "text-[20px]" : (isFullscreen ? "text-[28px]" : "text-[22px]")
                )}
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
 (transparent || isFullscreen) ? "bg-transparent border-none shadow-none" : "glass-panel"
 )}
 >
 {renderTopControls()}

 <div 
   className="flex-1 min-h-0 w-full relative overflow-hidden"
   style={{
     WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 12%, black 86%, transparent 100%)',
     maskImage: 'linear-gradient(to bottom, transparent 0%, black 12%, black 86%, transparent 100%)'
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
 isFullscreen ? (isMobile ? "px-6 gap-5 max-w-full mx-auto" : "px-10 gap-7 max-w-5xl mx-auto") : (isMobile ? "px-4 items-center gap-5" : "px-6 items-center gap-5")
 )}
 >
 {/* Spacer block to push the very first line precisely to the vertical focal zone */}
  <div className="w-full shrink-0 pointer-events-none" style={{ height: isMobile ? "28vh" : (isFullscreen ? "38vh" : "40vh") }} />

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
 className={cn(
 "w-full flex items-center shrink-0",
 isFullscreen 
 ? (line.isInterlude ? "justify-center" : "justify-start")
 : "justify-center"
 )}
 >
 <div
 className={cn(
 "inline-block max-w-full transition-opacity select-none",
 line.isInterlude || line.isUnsynced ? "cursor-default pointer-events-none" : "cursor-pointer hover:opacity-95"
 )}
 onTouchStart={() => {
   if (isSyncingRef.current) return;
   touchMovedRef.current = false;
 }}
  onTouchMove={(e) => {
   if (touchStartYRef.current !== null && Math.abs(e.touches[0].clientY - touchStartYRef.current) > 10) {
     touchMovedRef.current = true;
   }
 }}
 onClick={(e) => {
   e.stopPropagation();
   e.preventDefault();
   if (touchMovedRef.current) return;
   if (isSyncingRef.current) return;
   if (line.isInterlude || line.isUnsynced) return;
   const audio = audioEngine.getActiveAudioElement();
   if (audio) {
     isSeekingRef.current = true;
     const trackDuration = (audio.duration && Number.isFinite(audio.duration) && audio.duration > 0)
       ? audio.duration
       : (duration || usePlayerStore.getState().duration || 9999);

     // Safeguard seeking within playable/seekable boundaries to prevent browser ended/error loop back to 00:00
     let maxSeek = Math.max(0, trackDuration - 1.2);
     try {
       if (audio.seekable && audio.seekable.length > 0) {
         const seekableEnd = audio.seekable.end(audio.seekable.length - 1);
         if (seekableEnd > 1) {
           maxSeek = Math.min(maxSeek, seekableEnd - 0.5);
         }
       }
     } catch {}

     const targetAudioTime = Math.max(0, Math.min(line.time - offsetRef.current - 0.15, maxSeek));
     
     setActiveIndex(idx);
     smoothTimeValue.set(line.time);

     try {
       audio.currentTime = targetAudioTime;
     } catch (seekErr) {
       console.warn("[LyricsView] Seek error:", seekErr);
     }

     const { setCurrentTime, setIsPlaying } = usePlayerStore.getState();
     setCurrentTime(targetAudioTime);
     setIsPlaying(true);
     setIsUserScrolling(false);

     audioEngine.resume();
     if (audio.paused) {
       audio.play().catch(err => {
         if (err?.name === 'AbortError' || err?.message?.includes('interrupted')) return;
         console.warn("[LyricsView] audio.play() after seek failed:", err);
       });
     }
     const targetVol = usePlayerStore.getState().volume ?? 1;
     audioEngine.setVolume(targetVol);

     // Smoothly and immediately glide the lyrics view directly to the clicked line
     const el = containerRef.current;
     const clickedEl = e.currentTarget.parentElement;
     if (el && clickedEl) {
       const clientH = el.clientHeight || 360;
       let centerRatio = 0.5;
       if (isFullscreen) centerRatio = 0.38;
       else if (isMobile) centerRatio = 0.35;
       else centerRatio = 0.35;

       const containerCenter = clientH * centerRatio;
       const targetScrollTop = clickedEl.offsetTop - containerCenter + (clickedEl.clientHeight / 2);
       const maxScroll = el.scrollHeight - el.clientHeight;
       const finalScrollTop = Math.max(0, Math.min(maxScroll, targetScrollTop));

       isProgrammaticScroll.current = true;
       if (scrollAnimRef.current) scrollAnimRef.current.stop();
       scrollAnimRef.current = animate(el.scrollTop, finalScrollTop, {
         duration: 0.52,
         ease: [0.22, 1, 0.36, 1],
         onUpdate: (v) => { if (el) el.scrollTop = v; },
         onComplete: () => {
           setTimeout(() => { isProgrammaticScroll.current = false; }, 150);
         }
       });
     }

     const onSeeked = () => {
       isSeekingRef.current = false;
       audio.removeEventListener('seeked', onSeeked);
     };
     audio.addEventListener('seeked', onSeeked, { once: true });
     setTimeout(() => {
       isSeekingRef.current = false;
     }, 600);
   }
 }}
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
 </div>
 );
 })}

  {/* Spacer block to push the very last line precisely to the vertical focal zone */}
  <div className="w-full shrink-0 pointer-events-none" style={{ height: isMobile ? "32vh" : (isFullscreen ? "62vh" : "40vh") }} />

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

 {/* Floating Glass Pill "Sync Now" button at the right side bottom in all screens */}
 <AnimatePresence>
   {isUserScrolling && (
     <motion.button
        type="button"
        initial={{ opacity: 0, scale: 0.85, y: isMobile ? -16 : 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.85, y: isMobile ? -16 : 16 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        onPointerDown={(e) => {
          e.stopPropagation();
          isSyncingRef.current = true;
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          isSyncingRef.current = true;
        }}
        onTouchEnd={(e) => {
          e.stopPropagation();
          e.preventDefault();
          handleSyncToSong(e);
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          handleSyncToSong(e);
        }}
        className={cn(
          "flex items-center gap-2.5 px-4 py-2 rounded-full bg-zinc-950/95 hover:bg-black backdrop-blur-2xl border border-white/30 text-brand shadow-2xl transition-all active:scale-95 cursor-pointer select-none group min-h-[42px]",
          isMobile 
            ? "fixed top-14 right-4 landscape:top-4 landscape:right-4 z-[200]" 
            : "fixed sm:absolute bottom-3 right-4 sm:bottom-4 sm:right-6 z-[100]"
        )}
      >
        <ScrollText size={15} className="text-brand shrink-0 group-hover:scale-110 transition-transform pointer-events-none" />
        <span className="text-xs font-bold uppercase tracking-wider text-white pointer-events-none">Sync Now</span>
      </motion.button>
   )}
 </AnimatePresence>

 </div>
 );
}
