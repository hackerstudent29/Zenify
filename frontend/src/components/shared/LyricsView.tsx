"use client";

import React from "react";
import { animate, motionValue, useMotionValue, motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { ScrollText, Music2 } from "lucide-react";
import { LiquidLyricsLine, LyricsStyles } from "./LiquidLyricsLine";
import { LyricsToolbar, LyricsSyncPill } from "./LyricsToolbar";
import { transliterateLineRuleBased, transliterateTextRuleBased } from "@/lib/indic-transliterator";
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
  isFullscreen?: boolean;
  isSidebar?: boolean;
  transparent?: boolean;
  albumArt?: string;
  onUserScrollChange?: (scrolling: boolean) => void;
  onClose?: () => void;
}

export function cleanLyricText(text: string): string {
  if (!text) return "";
  const trimmed = text.trim();
  if (trimmed === "• • •") return "• • •";
  if (/^(\[|\()?\s*(instrumental|music|solo|interlude|guitar solo|bgm|musical interlude)\s*(\]|\))?$/i.test(trimmed)) return "• • •";
  if (/Português|Türkçe|Español|Việt|Italiano|Français|Deutsch/i.test(text)) return "";
  if (/^\d+$/.test(trimmed)) return "";
  if (trimmed.toLowerCase() === "lyrics") return "";
  if (text.toLowerCase().includes("lyrics") && text.length < 60 && text.toLowerCase().endsWith("lyrics")) return "";

  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/\[\d{1,2}:\d{2}[^\]]*\]/g, " ")
    .replace(/\[\s*(chorus|verse|intro|outro|bridge|male|female|view|vocal|hook|pre-chorus|refrain|spoken)[^\]]*\]/gi, "")
    .replace(/\(\s*(chorus|verse|intro|outro|bridge|male|female|view|vocal|hook|pre-chorus|refrain|spoken)([^)]*?)\)/gi, "")
    .replace(/^\s*(chorus|verse|intro|outro|bridge|male|female|view|vocal|hook|pre-chorus|refrain|singer)\s*:\s*/gi, "")
    .replace(/\b(chorus|verse|intro|outro|bridge|male|female|view|vocal|hook|pre-chorus|refrain)\b/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/([,;:!?])([A-Za-z0-9\u0B80-\u0D7F])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/** how many lines around the active one get a real staggered spring (the rest jump silently off-screen) */
const WINDOW = 9;
/** start moving this many seconds early so the spring settles right when the next line begins */
const LEAD = 0.12;
/** spring for the line-follow motion */
const FOLLOW = { type: "spring" as const, stiffness: 165, damping: 23, mass: 1, restDelta: 0.15 };

/* ── Sidebar-only tuning (compact column: fewer lines on screen, softer & a touch bouncier follow) ── */
const WINDOW_SB = 7;
const LEAD_SB = 0.14;
const FOLLOW_SB = { type: "spring" as const, stiffness: 150, damping: 20.5, mass: 0.95, restDelta: 0.15 };
/** seconds of extra delay per line below the active one (the "waterfall") */
const STAGGER = 0.04;
const STAGGER_SB = 0.034;
const STAGGER_MAX = 5;
const STAGGER_MAX_SB = 6;

export function LyricsView({
  trackId, title, artist, isLyricsOpen, rawLyrics, isMobile, isSidebar, isIdle, duration,
  isFullscreen, transparent, onUserScrollChange, onClose,
}: LyricsViewProps) {
  const queryClient = useQueryClient();
  const [refetchInterval, setRefetchInterval] = React.useState<number | false>(5000);

  /* ───────────────────────── data ───────────────────────── */
  const { data, isLoading } = useQuery({
    queryKey: ["lyrics", trackId, title, artist],
    queryFn: async () => {
      if (!title) return { syncedTokens: [], source: undefined as string | undefined, status: "not_found" as const };
      try {
        const res = await api.post(`metadata/sync-lyrics`, { trackId, title, artist, rawLyrics, duration });
        return {
          status: (res.data?.status || "available") as string,
          message: res.data?.message as string | undefined,
          syncedTokens: res.data?.syncedTokens || [],
          source: res.data?.source as string | undefined,
          romanizedLyrics: res.data?.romanizedLyrics as string | undefined,
          romanizedSyncedLyrics: res.data?.romanizedSyncedLyrics as any[] | undefined,
          romanizedLang: res.data?.romanizedLang as string | undefined,
        };
      } catch (err: any) {
        if (err.response?.status === 404) return { syncedTokens: [], source: undefined, status: "not_found" as const };
        return { syncedTokens: [], source: undefined, status: "failed" as const };
      }
    },
    enabled: isLyricsOpen && !!title,
    staleTime: 10000,
    refetchInterval,
  });

  const currentTrack = usePlayerStore((s) => s.currentTrack);

  const [isRomanized, setIsRomanized] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("zenify_lyrics_lang_mode") === "romanized"; } catch { return false; }
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
    try { localStorage.setItem("zenify_lyrics_lang_mode", romanized ? "romanized" : "original"); } catch {}
    if (romanized && trackId && !hasRomanized) {
      api.post("metadata/romanize-track", { trackId })
        .then((res) => { if (res.data?.success) queryClient.invalidateQueries({ queryKey: ["lyrics", trackId, title, artist] }); })
        .catch((err) => console.warn("[LyricsView] Background romanization notice:", err.message));
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
    if (data?.status === "processing") setRefetchInterval(2500);
    else if (hasSync && hasRom) setRefetchInterval(false);
    else if (hasSync && !hasRom) setRefetchInterval(3000);
    else if (data?.status === "not_found" || data?.status === "failed") setRefetchInterval(false);
    else setRefetchInterval(4000);
  }, [data]);

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

  React.useEffect(() => {
    const handler = (e: any) => {
      if (e.detail && e.detail.id === trackId) queryClient.invalidateQueries({ queryKey: ["lyrics-sync", trackId] });
    };
    window.addEventListener("zenify:track-updated", handler);
    return () => window.removeEventListener("zenify:track-updated", handler);
  }, [trackId, queryClient]);

  // Romanized text is always anchored to the original timestamps so both languages stay in sync
  const activeData = React.useMemo(() => {
    const baseSynced = data?.syncedTokens && data.syncedTokens.length > 0
      ? data.syncedTokens
      : Array.isArray(currentTrack?.synced_lyrics) ? currentTrack.synced_lyrics : [];
    if (!isRomanized) return baseSynced;

    if (baseSynced.length > 0) {
      const romLines = typeof romanizedPlain === "string" && romanizedPlain.trim().length > 0
        ? romanizedPlain.split("\n").map((l) => l.trim()).filter(Boolean)
        : null;
      const hasPre = Array.isArray(romanizedSynced) && romanizedSynced.length > 0;
      return baseSynced.map((token: any, idx: number) => {
        const pre = hasPre ? romanizedSynced[idx] : null;
        const text = pre?.text || (romLines && romLines[idx]) || transliterateLineRuleBased(token.text || "");
        const words = token.words?.map((w: any, wi: number) => ({
          ...w,
          word: (pre?.words && pre.words[wi]?.word) || transliterateLineRuleBased(w.word || ""),
        }));
        return { ...token, text, words: words || token.words };
      });
    }
    if (Array.isArray(romanizedSynced) && romanizedSynced.length > 0) return romanizedSynced;
    return [];
  }, [isRomanized, romanizedSynced, romanizedPlain, data?.syncedTokens, currentTrack?.synced_lyrics]);

  const activePlainLyrics = React.useMemo(() => {
    if (!isRomanized) return rawLyrics;
    if (typeof romanizedPlain === "string" && romanizedPlain.trim().length > 0) return romanizedPlain;
    if (rawLyrics && rawLyrics.trim().length > 0) return transliterateTextRuleBased(rawLyrics);
    return rawLyrics;
  }, [isRomanized, romanizedPlain, rawLyrics]);

  const processedLines = React.useMemo(() => {
    if (data?.source === "INSTRUMENTAL" || activePlainLyrics?.trim().toLowerCase() === "instrumental") {
      return [{ time: 0, text: "• • •", isInstrumental: true }] as any[];
    }

    if ((!activeData || activeData.length === 0) && activePlainLyrics && activePlainLyrics.trim() !== "") {
      const rawLines = activePlainLyrics.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
      const expanded: string[] = [];
      for (const line of rawLines) {
        const ws = line.split(/\s+/);
        if (ws.length > 8 || line.length > 50) {
          const mid = Math.ceil(ws.length / 2);
          expanded.push(ws.slice(0, mid).join(" "), ws.slice(mid).join(" "));
        } else expanded.push(line);
      }
      return expanded
        .map((line) => ({ time: -999999, text: cleanLyricText(line), isUnsynced: true }))
        .filter((l) => l.text.length > 0) as any[];
    }

    if (!activeData || !Array.isArray(activeData)) return [];
    const base = activeData
      .map((line: any) => ({ ...line, time: parseFloat(line.time || 0), text: cleanLyricText(line.text) }))
      .filter((l: any) => l.text.length > 0)
      .sort((a: any, b: any) => a.time - b.time);

    const result: any[] = [];
    const trackDur = duration || usePlayerStore.getState().duration || 0;

    if (base.length > 0 && base[0].time > 3.2 && base[0].text !== "• • •") {
      result.push({ time: 0, endTime: Math.max(0.5, base[0].time - 0.3), text: "• • •", isInterlude: true });
    }
    for (let i = 0; i < base.length; i++) {
      const cur = base[i];
      if (cur.text === "• • •") cur.isInterlude = true;
      result.push(cur);
      const next = base[i + 1];
      if (next) {
        const wc = cur.text ? cur.text.trim().split(/\s+/).length : 0;
        const est = Math.min(Math.max(2.0, wc * 0.55), Math.max(0.5, next.time - cur.time));
        const end = cur.endTime ? cur.endTime : cur.time + est;
        if (next.time - end >= 3.2 && next.text !== "• • •") {
          result.push({ time: end + 0.3, endTime: Math.max(end + 0.8, next.time - 0.2), text: "• • •", isInterlude: true });
        }
      }
    }
    if (result.length > 0 && trackDur > 0) {
      const lastL = result[result.length - 1];
      const wc = lastL.text ? lastL.text.trim().split(/\s+/).length : 0;
      const lastEnd = lastL.endTime || lastL.time + Math.max(2.5, wc * 0.6);
      if (trackDur - lastEnd >= 4.5 && lastL.text !== "• • •") {
        result.push({ time: lastEnd + 0.5, endTime: trackDur - 0.5, text: "• • •", isInterlude: true });
      }
    }
    return result;
  }, [activeData, activePlainLyrics, duration, data?.source]);

  const isUnsyncedSet = !!processedLines[0]?.isUnsynced;

  /* ───────────────────────── clock ───────────────────────── */
  const lyricsOffsetMs = currentTrack?.lyricsOffset || 0;
  const offsetRef = React.useRef(lyricsOffsetMs / 1000);
  React.useEffect(() => { offsetRef.current = lyricsOffsetMs / 1000; }, [lyricsOffsetMs]);

  const initialTime = React.useMemo(() => {
    const audio = audioEngine.getActiveAudioElement();
    const t = audio && Number.isFinite(audio.currentTime) ? audio.currentTime : usePlayerStore.getState().currentTime;
    return Math.max(0, t + (currentTrack?.lyricsOffset || 0) / 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId]);
  const smoothTimeValue = useMotionValue(initialTime);
  const isSeekingRef = React.useRef(false);

  const setLyricsOffsetStore = usePlayerStore((s) => s.setLyricsOffset);
  const offsetDebounce = React.useRef<any>(null);
  const handleOffsetChange = React.useCallback((deltaMs: number) => {
    if (!trackId) return;
    const next = deltaMs === 0 ? 0 : lyricsOffsetMs + deltaMs;
    setLyricsOffsetStore(next);
    if (offsetDebounce.current) clearTimeout(offsetDebounce.current);
    offsetDebounce.current = setTimeout(() => {
      api.post(`tracks/${trackId}/lyrics-offset`, { offset: next }).catch(console.error);
    }, 500);
  }, [trackId, lyricsOffsetMs, setLyricsOffsetStore]);

  /* ───────────────────────── scroll engine ─────────────────────────
   * Auto mode: native scrollTop stays 0; every line has its own spring-driven translateY,
   * with a small delay that grows with distance below the active line → Apple's waterfall.
   * Manual mode (user wheel/touch): transforms are folded into the real scrollTop so nothing jumps.
   * Only transforms move during playback — no layout, no scrollTop writes.
   * ─────────────────────────────────────────────────────────── */
  const containerRef = React.useRef<HTMLDivElement>(null);
  const rowEls = React.useRef<(HTMLDivElement | null)[]>([]);
  const geo = React.useRef({ tops: [] as number[], hs: [] as number[], clientH: 360 });
  const ys = React.useMemo(() => processedLines.map(() => motionValue(0)), [processedLines]);
  const ysRef = React.useRef(ys);
  ysRef.current = ys;

  const linesRef = React.useRef<any[]>(processedLines);
  linesRef.current = processedLines;

  // sidebar flag lives in a ref so the (stable) goTo / RAF callbacks always see the latest value
  const sidebarRef = React.useRef(!!isSidebar);
  sidebarRef.current = !!isSidebar;
  const windowSize = isSidebar ? WINDOW_SB : WINDOW;

  const [activeIndex, setActiveIndex] = React.useState(() => {
    const audio = audioEngine.getActiveAudioElement();
    const t = audio && Number.isFinite(audio.currentTime) ? audio.currentTime : usePlayerStore.getState().currentTime;
    const tt = Math.max(0, t + (currentTrack?.lyricsOffset || 0) / 1000);
    let idx = -1;
    for (let i = 0; i < processedLines.length; i++) { if (tt >= processedLines[i].time) idx = i; else break; }
    return idx;
  });
  const activeRef = React.useRef(activeIndex);

  const [containerHeight, setContainerHeight] = React.useState(360);
  // sidebar: active line sits a little lower than before so the line above it can breathe
  const ratio = isFullscreen ? 0.38 : isSidebar ? 0.22 : isMobile ? (isIdle ? 0.42 : 0.3) : 0.35;
  const ratioRef = React.useRef(ratio);
  ratioRef.current = ratio;

  const [isUserScrolling, setIsUserScrolling] = React.useState(false);
  const manualRef = React.useRef(false);
  const progRef = React.useRef(false);
  const userScrolledRef = React.useRef(false);
  const idleTimer = React.useRef<any>(null);
  const guardUntil = React.useRef(0);
  const intentUntil = React.useRef(0); // only wheel / touch can start manual mode

  const markProg = () => {
    progRef.current = true;
    requestAnimationFrame(() => requestAnimationFrame(() => { progRef.current = false; }));
  };

  const measure = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const g = geo.current;
    g.clientH = el.clientHeight || 360;
    g.tops = rowEls.current.map((r) => (r ? r.offsetTop : 0));
    g.hs = rowEls.current.map((r) => (r ? r.offsetHeight : 0));
  }, []);

  const targetFor = (i: number) => {
    const g = geo.current;
    return (g.tops[i] ?? 0) + (g.hs[i] ?? 0) / 2 - g.clientH * ratioRef.current;
  };

  const goTo = React.useCallback((i: number, instant = false) => {
    if (manualRef.current) return;
    const arr = ysRef.current;
    if (!arr.length) return;
    const idx = Math.max(0, Math.min(arr.length - 1, i));
    const S = targetFor(idx);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const sb = sidebarRef.current;
    const win = sb ? WINDOW_SB : WINDOW;
    const spring = sb ? FOLLOW_SB : FOLLOW;
    const stagger = sb ? STAGGER_SB : STAGGER;
    const staggerMax = sb ? STAGGER_MAX_SB : STAGGER_MAX;
    for (let k = 0; k < arr.length; k++) {
      const d = k - idx;
      const y = arr[k];
      if (instant || reduce || Math.abs(d) > win) { y.stop(); y.set(-S); continue; }
      animate(y, -S, { ...spring, delay: d > 0 ? Math.min(d, staggerMax) * stagger : 0 });
    }
  }, []);

  const enterManual = React.useCallback((silent: boolean) => {
    const el = containerRef.current;
    if (!el || manualRef.current) return;
    const arr = ysRef.current;
    const act = Math.max(0, activeRef.current);
    const yAct = arr[act]?.get() ?? 0;
    markProg();
    el.scrollTop = Math.max(0, el.scrollTop - yAct);
    arr.forEach((y) => { y.stop(); y.set(0); });
    manualRef.current = true;
    if (!silent) setIsUserScrolling(true);
  }, []);

  const exitManual = React.useCallback(() => {
    const el = containerRef.current;
    if (!el || !manualRef.current) return;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    const c = el.scrollTop;
    markProg();
    el.scrollTop = 0;
    ysRef.current.forEach((y) => { y.stop(); y.set(-c); });
    manualRef.current = false;
    userScrolledRef.current = false;
    intentUntil.current = 0;
    setIsUserScrolling(false);
    goTo(activeRef.current);
  }, [goTo]);

  const restartIdle = React.useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => exitManual(), 4000);
  }, [exitManual]);

  React.useEffect(() => { onUserScrollChange?.(isUserScrolling); }, [isUserScrolling, onUserScrollChange]);

  // geometry
  React.useLayoutEffect(() => {
    measure();
    goTo(activeRef.current, true);
  }, [processedLines, isFullscreen, isMobile, isSidebar, containerHeight, measure, goTo]);

  React.useEffect(() => { goTo(activeRef.current); }, [ratio, goTo]);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const sync = () => setContainerHeight(el.clientHeight);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    document.fonts?.ready?.then(() => { measure(); goTo(activeRef.current, true); });
    return () => ro.disconnect();
  }, [isLoading, processedLines.length, measure, goTo]);

  // reset on track / mode change
  React.useEffect(() => {
    manualRef.current = false;
    userScrolledRef.current = false;
    setIsUserScrolling(false);
    if (containerRef.current) { markProg(); containerRef.current.scrollTop = 0; }
    goTo(activeRef.current, true);
  }, [trackId, isLyricsOpen, isFullscreen, goTo]);

  // wheel (non-passive so the first notch can hand over from transforms to real scroll)
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.stopPropagation();
      if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      intentUntil.current = performance.now() + 1500;
      if (!manualRef.current) {
        e.preventDefault();
        enterManual(false);
        el.scrollTop += e.deltaY;
      }
      userScrolledRef.current = true;
      setIsUserScrolling(true);
      restartIdle();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [enterManual, restartIdle, isLoading, processedLines.length]);

  const onScroll = () => {
    if (progRef.current) return;
    if (!manualRef.current) {
      // not caused by the user (scroll anchoring, resize…) → quietly put it back
      if (performance.now() > intentUntil.current) {
        const el = containerRef.current;
        if (el && el.scrollTop !== 0) { markProg(); el.scrollTop = 0; }
        return;
      }
      enterManual(false);
    }
    userScrolledRef.current = true;
    setIsUserScrolling(true);
    restartIdle();
  };
  const onTouchStart = () => {
    intentUntil.current = performance.now() + 60_000;
    userScrolledRef.current = false;
    if (!manualRef.current) enterManual(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
  };
  const onTouchEnd = () => {
    if (!userScrolledRef.current) setTimeout(() => { if (!userScrolledRef.current) exitManual(); }, 160);
    else restartIdle();
  };

  React.useEffect(() => () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (offsetDebounce.current) clearTimeout(offsetDebounce.current);
  }, []);

  /* RAF: clock smoothing + active-line tracking */
  React.useEffect(() => {
    let raf = 0;
    let lastReal = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) { lastReal = performance.now(); return; }
      if (isSeekingRef.current) { lastReal = performance.now(); return; }
      const now = performance.now();
      const dt = (now - lastReal) / 1000;
      lastReal = now;

      const audio = audioEngine.getActiveAudioElement();
      const playing = usePlayerStore.getState().isPlaying;
      const cur = smoothTimeValue.get();
      let t: number;
      if ((audio && !audio.paused) || playing) {
        const real = Math.max(0, ((audio && !audio.paused) ? audio.currentTime : usePlayerStore.getState().currentTime) + offsetRef.current);
        t = Math.abs(cur - real) > 0.5 ? real : cur + (real - cur) * Math.min(1, dt * 10);
      } else {
        t = Math.max(0, usePlayerStore.getState().currentTime + offsetRef.current);
      }
      smoothTimeValue.set(t);

      const lines = linesRef.current;
      if (!lines.length || lines[0].isUnsynced) return;
      const tt = t + (sidebarRef.current ? LEAD_SB : LEAD);
      let n = activeRef.current;
      while (n + 1 < lines.length && tt >= lines[n + 1].time) n++;
      while (n >= 0 && tt < lines[n].time) n--;
      if (n !== activeRef.current) {
        activeRef.current = n;
        setActiveIndex(n);
        goTo(n);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [smoothTimeValue, trackId, goTo]);

  /* tap a line → seek */
  const handleLineClick = (idx: number, line: any) => {
    if (performance.now() < guardUntil.current) return;
    if (line.isInterlude || line.isUnsynced) return;
    const audio = audioEngine.getActiveAudioElement();
    if (!audio) return;

    isSeekingRef.current = true;
    const trackDuration = audio.duration && Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration
      : duration || usePlayerStore.getState().duration || 9999;
    let maxSeek = Math.max(0, trackDuration - 1.2);
    try {
      if (audio.seekable && audio.seekable.length > 0) {
        const end = audio.seekable.end(audio.seekable.length - 1);
        if (end > 1) maxSeek = Math.min(maxSeek, end - 0.5);
      }
    } catch {}
    const target = Math.max(0, Math.min(line.time - offsetRef.current - 0.15, maxSeek));

    activeRef.current = idx;
    setActiveIndex(idx);
    smoothTimeValue.set(line.time);
    try { audio.currentTime = target; } catch (err) { console.warn("[LyricsView] Seek error:", err); }

    const { setCurrentTime, setIsPlaying } = usePlayerStore.getState();
    setCurrentTime(target);
    setIsPlaying(true);
    audioEngine.resume();
    if (audio.paused) {
      audio.play().catch((err) => {
        if (err?.name === "AbortError" || err?.message?.includes("interrupted")) return;
        console.warn("[LyricsView] audio.play() after seek failed:", err);
      });
    }
    audioEngine.setVolume(usePlayerStore.getState().volume ?? 1);

    if (manualRef.current) exitManual(); else goTo(idx);

    const done = () => { isSeekingRef.current = false; };
    audio.addEventListener("seeked", done, { once: true });
    setTimeout(done, 600);
  };

  const handleSync = () => {
    guardUntil.current = performance.now() + 700;
    exitManual();
  };

  /* ───────────────────────── loading / empty states ───────────────────────── */
  const [showLoading, setShowLoading] = React.useState(false);
  React.useEffect(() => {
    const has = Boolean(
      (data?.syncedTokens && data.syncedTokens.length > 0) ||
      (currentTrack?.synced_lyrics && currentTrack.synced_lyrics.length > 0) ||
      (data as any)?.plainLyrics || rawLyrics || processedLines.length > 0
    );
    if (isLoading && !has) {
      setShowLoading(true);
      const t = setTimeout(() => setShowLoading(false), 2000);
      return () => clearTimeout(t);
    }
    setShowLoading(false);
  }, [isLoading, trackId, data, currentTrack?.synced_lyrics, rawLyrics, processedLines.length]);

  if (showLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-white/10 border-t-white/80" />
      </div>
    );
  }

  const isInstrumental =
    data?.source === "INSTRUMENTAL" ||
    (processedLines.length === 1 && (processedLines[0].text === "• • •" || processedLines[0].isInstrumental)) ||
    activePlainLyrics?.trim().toLowerCase() === "instrumental";

  if (isInstrumental) {
    return (
      <div className="flex h-full w-full select-none flex-col items-center justify-center p-6 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/5">
          <Music2 size={24} className="text-white/70" />
        </div>
        <p className="text-[13px] font-semibold tracking-[0.18em] text-white/70 uppercase">Instrumental</p>
        <p className="mt-1 text-xs text-white/40">This track contains no vocal lyrics</p>
      </div>
    );
  }

  if (processedLines.length === 0) {
    if (data?.status === "processing" || (isLoading && !data)) {
      return (
        <div className="flex h-full w-full select-none flex-col items-center justify-center p-6 text-center">
          <div className="mb-4 h-9 w-9 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <p className="text-[13px] font-semibold tracking-[0.18em] text-white/80 uppercase">Synchronizing Lyrics</p>
          <p className="mt-1 max-w-xs text-xs text-white/40">{data?.message || "Searching line-by-line timing…"}</p>
        </div>
      );
    }
    return (
      <div className="flex h-full w-full select-none flex-col items-center justify-center opacity-60">
        <ScrollText size={44} className="mb-4 text-white/40" />
        <p className="text-sm font-medium text-white/70">No lyrics available for this recording</p>
      </div>
    );
  }

  /* ───────────────────────── chrome ───────────────────────── */
  const showOffset = !isUnsyncedSet && data?.source !== "QUICKLRC";
  const toolbar = (
    <LyricsToolbar
      placement={isSidebar ? "top-left" : "top-right"}
      compact={!!isSidebar}
      canTranslate={canTranslate}
      isRomanized={isRomanized}
      romanizedLabel={romanizedLabel}
      onModeChange={handleModeChange}
      showOffset={showOffset}
      offsetMs={lyricsOffsetMs}
      onOffset={handleOffsetChange}
      onClose={!isMobile && !isSidebar ? onClose : undefined}
      hidden={isUserScrolling || !!isIdle}
    />
  );

  const shell = cn("relative flex h-full w-full flex-col overflow-hidden", (transparent || isFullscreen) ? "bg-transparent" : "glass-panel");

  if (isUnsyncedSet) {
    return (
      <div className={shell}>
        <LyricsStyles />
        <div
          className={cn(
            "relative z-10 h-full min-h-0 w-full select-text overflow-y-auto scrollbar-none",
            isSidebar ? "px-4 pb-4 pt-14" : isMobile ? "p-4" : "p-6"
          )}
          style={{ msOverflowStyle: "none", scrollbarWidth: "none", overscrollBehavior: "contain" }}
        >
          <div className={cn("flex flex-col pb-28", isSidebar ? "gap-5" : "gap-8", isFullscreen ? "mx-auto max-w-5xl" : "")}>
            {processedLines.map((line: any, i: number) => (
              <p
                key={`${trackId}-u-${i}`}
                className={cn(
                  "text-left font-semibold text-white/85",
                  isSidebar ? "text-[17px] leading-[1.4] tracking-[-0.01em]" : "leading-[1.6]",
                  !isSidebar && (isMobile ? "text-[20px]" : isFullscreen ? "text-[28px]" : "text-[22px]")
                )}
              >
                {line.text}
              </p>
            ))}
          </div>
        </div>
        {toolbar}
      </div>
    );
  }

  const topSpacer = Math.round(containerHeight * ratio);

  // sidebar: softer, longer fade at the top (under the compact toolbar) and bottom (above the player)
  const maskGradient = isSidebar
    ? "linear-gradient(to bottom, transparent 0, #000 12%, #000 80%, transparent 100%)"
    : "linear-gradient(to bottom, transparent 0, #000 9%, #000 84%, transparent 100%)";

  return (
    <div className={shell}>
      <LyricsStyles />
      <div
        className="relative h-full min-h-0 w-full flex-1 overflow-hidden"
        style={{
          WebkitMaskImage: maskGradient,
          maskImage: maskGradient,
        }}
      >
        <div
          ref={containerRef}
          className="relative z-10 h-full w-full select-none overflow-y-auto scrollbar-none"
          style={{ msOverflowStyle: "none", scrollbarWidth: "none", overscrollBehavior: "contain", overflowAnchor: "none", WebkitOverflowScrolling: "touch" }}
          onScroll={onScroll}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <style dangerouslySetInnerHTML={{ __html: ".scrollbar-none::-webkit-scrollbar{display:none!important}" }} />
          <div className={cn("relative flex w-full flex-col items-start text-left", isFullscreen ? "mx-auto max-w-5xl px-8" : isSidebar ? "px-3.5" : isMobile ? "px-4" : "px-6")}>
            <div className="w-full shrink-0" style={{ height: topSpacer }} />

            {processedLines.map((line: any, idx: number) => {
              const dist = idx - activeIndex;
              const next = processedLines[idx + 1]?.time;
              const rawEnd = line.endTime && line.endTime > line.time ? line.endTime : next && next > line.time ? next : line.time + 3.5;
              const end = Math.max(line.time + 0.8, rawEnd);
              return (
                <LiquidLyricsLine
                  key={`${trackId}-${idx}`}
                  rowRef={(el) => { rowEls.current[idx] = el; }}
                  y={ys[idx]}
                  smoothTimeValue={smoothTimeValue}
                  text={line.text}
                  isCurrent={idx === activeIndex}
                  isPast={idx < activeIndex}
                  dist={Math.max(-4, Math.min(5, dist))}
                  lineStartTime={line.time}
                  lineEndTime={end}
                  words={line.words}
                  isFullscreen={isFullscreen}
                  isMobile={isMobile}
                  isSidebar={isSidebar}
                  lineIndex={idx}
                  isInterlude={line.isInterlude || line.text === "• • •" || line.isInstrumental}
                  isUserScrolling={isUserScrolling}
                  inWindow={Math.abs(dist) <= windowSize}
                  onClick={() => handleLineClick(idx, line)}
                />
              );
            })}

            {/* credits */}
            <motion.div
              style={{ y: ys[ys.length - 1] }}
              className={cn(
                "flex w-full flex-col items-center opacity-40",
                isSidebar ? "mt-10 gap-2 pb-4" : "mt-16 gap-3 pb-6"
              )}
            >
              <div className={cn("flex items-center justify-center rounded-full border border-white/10 bg-white/5", isSidebar ? "h-9 w-9" : "h-11 w-11")}>
                <svg width={isSidebar ? 18 : 22} height={isSidebar ? 18 : 22} viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="10" width="3" height="4" rx="1.5" fill="currentColor" />
                  <rect x="8" y="6" width="3" height="12" rx="1.5" fill="currentColor" />
                  <rect x="13" y="3" width="3" height="18" rx="1.5" fill="currentColor" />
                  <rect x="18" y="8" width="3" height="8" rx="1.5" fill="currentColor" />
                </svg>
              </div>
              <div className={cn("text-center text-white/55", isSidebar ? "space-y-0.5 text-[11px]" : "space-y-1 text-xs")}>
                <p className="font-semibold text-white/80">{title}</p>
                <p>Written & Performed by {artist}</p>
                <p className={cn("border-t border-white/10 tracking-widest uppercase", isSidebar ? "mt-1.5 pt-1.5 text-[9px]" : "mt-2 pt-2 text-[10px]")}>
                  Provided by <span className="font-zenify">zenify</span> Lyrics Engine
                </p>
              </div>
            </motion.div>

            <div className="w-full shrink-0" style={{ height: Math.round(containerHeight * 0.62) }} />
          </div>
        </div>
      </div>

      {toolbar}
      <LyricsSyncPill show={isUserScrolling} onSync={handleSync} position={isMobile ? "top" : "bottom"} compact={!!isSidebar} />
    </div>
  );
}