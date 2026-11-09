"use client";

import React, {
  useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from "react";
import {
  AnimatePresence, MotionConfig, animate, motion, motionValue,
  useMotionValue, useMotionValueEvent,
  type PanInfo,
} from "framer-motion";
import { useRouter } from "next/navigation";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { SwiftUIForward, SwiftUIBackward, SwiftUIQueue } from "@/components/ui/SwiftUIIcons";
import { ArtistLinks } from "@/components/shared/ArtistLinks";
import { TrackActionsDropdown } from "@/components/shared/TrackActionsDropdown";
import { cn, getTrackCover } from "@/lib/utils";
import { MobileScrubber, MiniPlayerProgress } from "./../player/PlayerProgress";
import { DynamicBackground } from "../shared/DynamicBackground";
import { LyricsView } from "../shared/LyricsView";
import { glassSurface, glassInset, GLASS_DROP } from "@/components/mobile/glass";
import {
  FONT_STACK, SPRING, SPRING_SOFT,
  GlassButton, LikeButton, Marquee, PlateButton, PlayPauseButton, PlayerStyles, SpringButton,
  SFFx, SFLyrics, SFMore, SFRepeat, SFShuffle,
  useAutoHideIdle, useTrackLike,
} from "@/components/player/PlayerKit";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/* ------------------------------------------------------------------ */
/*  Math helpers                                                       */
/* ------------------------------------------------------------------ */
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 below `a`, 1 above `b`, smooth S-curve in between */
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------ */
/*  Tunables                                                           */
/* ------------------------------------------------------------------ */
const PAUSED = 0.86;        // artwork scale while paused
const ART_BASE = 420;       // artwork is laid out at max size and only ever scaled DOWN (stays crisp)
const BIG_R = 14;
const HEAD_R = 10;
const MINI_R = 9;
const PILL_H = 58;
const PILL_R = PILL_H / 2;   // fully round
const PILL_SIDE = 12;
const MINI_ART = 42;
const MINI_PAD = 8;         // art inset inside the pill
const MINI_BOTTOM = 78;     // 8 gap + 62 dock + 8 safety gap above it
const HEADER_H = 68;        // compact lyrics header height (inside the middle region)
const HEAD_ART = 56;

// One spring drives open / close / release. Slightly over-damped: no bounce past the edges.
const SHEET = { type: "spring", stiffness: 340, damping: 36, mass: 1, restDelta: 0.4, restSpeed: 0.4 } as const;
const LYRICS_SPRING = { type: "spring", stiffness: 260, damping: 30, mass: 1 } as const;
const PAUSE_SPRING = { type: "spring", stiffness: 300, damping: 22, mass: 0.6 } as const;

/* ------------------------------------------------------------------ */
/*  Cover: swap only once decoded                                      */
/* ------------------------------------------------------------------ */
const imageCache = new Set<string>();

function useShownCover(track: any) {
  const cover: string = track ? getTrackCover(track) : "";
  const [shown, setShown] = useState({ id: track?.id as string | undefined, cover });
  useEffect(() => {
    if (!track) return;
    let dead = false;
    const commit = () => !dead && setShown({ id: track.id, cover });
    if (!cover || imageCache.has(cover)) { commit(); return () => { dead = true; }; }
    const img = new Image();
    img.src = cover;
    const ok = () => { imageCache.add(cover); commit(); };
    if (img.decode) img.decode().then(ok).catch(commit);
    else { img.onload = ok; img.onerror = commit; }
    return () => { dead = true; };
  }, [track?.id, cover]);
  return shown;
}

/* ------------------------------------------------------------------ */
/*  Track menu (⋯)                                                     */
/* ------------------------------------------------------------------ */
function TrackMenu({ track }: { track: any; onLeave?: (to: string) => void }) {
  return (
    <TrackActionsDropdown
      track={track}
      align="end"
      trigger={
        <GlassButton title="More">
          <SFMore size={18} />
        </GlassButton>
      }
    />
  );
}

const slide = {
  enter: (d: number) => ({ opacity: 0, x: d * 56, scale: 1.04 }),
  center: { opacity: 1, x: 0, scale: 1 },
  exit: (d: number) => ({ opacity: 0, x: -d * 56, scale: 0.98 }),
};
const textSlide = {
  enter: (d: number) => ({ opacity: 0, x: d * 28 }),
  center: { opacity: 1, x: 0 },
  exit: (d: number) => ({ opacity: 0, x: -d * 28 }),
};

/* ------------------------------------------------------------------ */
/*  Geometry                                                           */
/* ------------------------------------------------------------------ */
interface MiniGeo {
  W: number;
  H: number;
  mini: { left: number; top: number; w: number; h: number };
  miniArt: { left: number; rel: number; size: number }; // rel = top offset inside the pill
}
interface Geo extends MiniGeo {
  big: { left: number; top: number; size: number };   // inside sheet content coordinates
  head: { left: number; top: number; size: number };
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/*                                                                     */
/*  ONE source of truth: sheetY (0 = fully open, travel = docked).     */
/*  Shell rect, corner radius, artwork, every text block, and the      */
/*  mini-player ghost are all derived from it in `apply()`, so drag,   */
/*  open, close and flick-release follow the exact same trajectory.    */
/*                                                                     */
/*  The sheet is a *shell* that morphs into the mini player's pill:    */
/*   - the shell's top edge follows the finger 1:1                     */
/*   - its content is anchored to that top edge, so the artwork        */
/*     always rides INSIDE the tab and can never leave it              */
/*   - in the last ~55% it narrows/rounds into the exact pill rect     */
/*   - the mesh background fades into the same glass the mini uses,    */
/*     so the swap to the real mini player is invisible               */
/* ------------------------------------------------------------------ */
export function PremiumMobilePlayer({ hidePlayer = false }: { hidePlayer?: boolean }) {
  const router = useRouter();

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const playNext = usePlayerStore((s) => s.playNext);
  const playPrev = usePlayerStore((s) => s.playPrev);
  const duration = usePlayerStore((s) => s.duration);
  const isShuffled = usePlayerStore((s) => s.isShuffled);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const repeatMode = usePlayerStore((s) => s.repeatMode);
  const toggleRepeat = usePlayerStore((s) => s.toggleRepeat);

  const isOpen = useUIStore((s) => s.isFullScreenPlayerOpen);
  const setOpen = useUIStore((s) => s.setFullScreenPlayerOpen);
  const isQueueOpen = useUIStore((s) => s.isQueueOpen);
  const setIsQueueOpen = useUIStore((s) => s.setIsQueueOpen);
  const isAudioFxOpen = useUIStore((s) => s.isAudioFxOpen);
  const setAudioFxOpen = useUIStore((s) => s.setAudioFxOpen);
  const isLyricsOpen = useUIStore((s) => s.isLyricsOpen);
  const setIsLyricsOpen = useUIStore((s) => s.setIsLyricsOpen);

  const { liked, toggle: toggleLike } = useTrackLike(currentTrack?.id);
  const shown = useShownCover(currentTrack);

  const dirRef = useRef(1);
  const [isUserScrollingLyrics, setIsUserScrollingLyrics] = useState(false);
  const idle = useAutoHideIdle(isOpen, 5000);
  const showLyrics = useDeferredValue(isLyricsOpen);
  const [vp, setVp] = useState({ w: 0, h: 0 });

  /* ── refs ── */
  const miniShellRef = useRef<HTMLDivElement>(null);
  const miniArtRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);

  const miniGeo = useRef<MiniGeo | null>(null);
  const geo = useRef<Geo | null>(null);
  const travel = useRef(800);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const hidePlayerRef = useRef(hidePlayer);
  hidePlayerRef.current = hidePlayer;
  const dragOpen = useRef(false);
  const anim = useRef<{ stop: () => void } | null>(null);
  const panBase = useRef(0);

  /* ── motion values ── */
  const sheetY = useMotionValue(900);          // 0 = open, travel = docked
  const L = useMotionValue(isLyricsOpen ? 1 : 0); // lyrics-mode progress
  const pause = useMotionValue(isPlaying ? 1 : PAUSED);
  const artX = useMotionValue(0);              // horizontal swipe on artwork

  const m = useMemo(
    () => ({
      // shell
      top: motionValue(0), left: motionValue(0), right: motionValue(0), bottom: motionValue(0),
      rTop: motionValue(0), rBot: motionValue(0),
      shellOp: motionValue(1), shadowOp: motionValue(0),
      glassOp: motionValue(0), glassDisplay: motionValue("none"),
      meshOp: motionValue(1), cx: motionValue(0),
      // content groups
      grabOp: motionValue(1), grabPE: motionValue("auto"),
      metaOp: motionValue(1), metaY: motionValue(0),
      scrubOp: motionValue(1), scrubY: motionValue(0),
      transOp: motionValue(1), transY: motionValue(0),
      lyricsOp: motionValue(1), lyricsY: motionValue(0),
      headOp: motionValue(0), headY: motionValue(8),
      ghostOp: motionValue(1), ghostY: motionValue(0),
      // artwork
      artX: motionValue(0), artY: motionValue(0), artS: motionValue(1),
      artR: motionValue(BIG_R), artShadow: motionValue("none"),
    }),
    []
  );

  /* ------------------------------------------------------------------ */
  /*  apply(): derive every visual from sheetY / L / pause / artX        */
  /* ------------------------------------------------------------------ */
  const apply = useCallback(() => {
    const g = geo.current;
    if (!g) return;

    const D = Math.max(1, g.mini.top);
    const v = clamp(sheetY.get(), 0, D);
    const q = v / D;              // 0 = open, 1 = docked
    const p = 1 - q;
    const r = smooth(0.45, 1, q); // "shrink into pill" phase (last 55%)
    const Lv = L.get();
    const Lc = clamp(Lv);

    /* shell: top edge = finger (1:1); sides/bottom/radius morph to the pill in the last phase */
    m.top.set(v);
    m.left.set(g.mini.left * r);
    m.right.set((g.W - g.mini.left - g.mini.w) * r);
    m.bottom.set((g.H - g.mini.top - g.mini.h) * r);
    m.rTop.set(PILL_R * clamp(v / 120));
    m.rBot.set(PILL_R * r);
    m.cx.set(-g.mini.left * r); // keeps content screen-aligned while the shell narrows
    m.shellOp.set(hidePlayerRef.current ? 1 - smooth(0.7, 1, q) : 1);
    m.shadowOp.set(smooth(0.6, 1, q));

    /* background: mesh fades into the SAME glass the mini player uses → invisible handoff */
    const glass = smooth(0.55, 0.95, q);
    m.glassOp.set(glass);
    m.glassDisplay.set(glass < 0.01 ? "none" : "block");
    m.meshOp.set(1 - smooth(0.7, 1, q));

    /* text / controls: each group rises from below + fades, staggered. Closing is the exact reverse. */
    const grab = smooth(0.5, 0.9, p);
    m.grabOp.set(grab);
    m.grabPE.set(p > 0.5 ? "auto" : "none");

    const meta = smooth(0.28, 0.66, p);
    m.metaOp.set(meta);
    m.metaY.set((1 - meta) * 26);

    const scrub = smooth(0.38, 0.76, p);
    m.scrubOp.set(scrub);
    m.scrubY.set((1 - scrub) * 32);

    const trans = smooth(0.46, 0.86, p);
    m.transOp.set(trans);
    m.transY.set((1 - trans) * 40);

    const lyr = smooth(0.34, 0.74, p);
    m.lyricsOp.set(lyr);
    m.lyricsY.set((1 - lyr) * 22);

    const head = smooth(0.3, 0.7, p) * smooth(0.25, 0.8, Lc);
    m.headOp.set(head);
    m.headY.set((1 - smooth(0.25, 0.8, Lc)) * 8 + (1 - smooth(0.3, 0.7, p)) * 14);

    /* mini-player ghost row (title / artist / buttons) arrives last, rising into place */
    const ghost = smooth(0.8, 1, q);
    m.ghostOp.set(ghost);
    m.ghostY.set((1 - ghost) * 10);

    /* artwork: big ⇄ compact (lyrics) blended by L, then → mini by q, all in sheet-content space */
    const k = pause.get();
    let size = lerp(g.big.size, g.head.size, Lc);
    let x = lerp(g.big.left, g.head.left, Lc);
    let y = lerp(g.big.top, g.head.top, Lc);

    // paused shrink only applies to the big, fully-open state and fades as it docks
    const kk = 1 - (1 - k) * (1 - Lc) * (1 - q);
    const ks = size * kk;
    x += (size - ks) / 2;
    y += (size - ks) / 2;
    size = ks;

    x += artX.get() * (1 - Lc) * (1 - q); // swipe-to-skip nudge

    const qa = q; // art rides inside the tab: linear in q, can't outrun the shell
    x = lerp(x, g.miniArt.left, qa);
    y = lerp(y, g.miniArt.rel, qa);
    size = lerp(size, g.miniArt.size, qa);

    const s = Math.max(0.01, size / ART_BASE);
    m.artX.set(x);
    m.artY.set(y);
    m.artS.set(s);
    m.artR.set(lerp(lerp(BIG_R, HEAD_R, Lc), MINI_R, qa) / s);
    m.artShadow.set(
      `0 0 0 1px rgba(255,255,255,0.1), 0 ${(24 * (1 - qa)).toFixed(1)}px ${(48 * (1 - qa)).toFixed(1)}px rgba(0,0,0,${(
        0.5 * (1 - qa) * (1 - 0.5 * Lc)
      ).toFixed(3)})`
    );
  }, [sheetY, L, pause, artX, m]);

  useMotionValueEvent(sheetY, "change", apply);
  useMotionValueEvent(L, "change", apply);
  useMotionValueEvent(pause, "change", apply);
  useMotionValueEvent(artX, "change", apply);

  /* ------------------------------------------------------------------ */
  /*  Measuring                                                          */
  /* ------------------------------------------------------------------ */
  const measureMini = useCallback(() => {
    const W = window.innerWidth;
    const Hh = window.innerHeight;
    let mini = { left: PILL_SIDE, top: Hh - MINI_BOTTOM - PILL_H, w: W - PILL_SIDE * 2, h: PILL_H };
    let art = { left: mini.left + MINI_PAD, rel: (PILL_H - MINI_ART) / 2, size: MINI_ART };
    const el = miniShellRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 0) {
        mini = { left: r.left, top: r.top, w: r.width, h: r.height };
        const a = miniArtRef.current?.getBoundingClientRect();
        if (a && a.width > 0) art = { left: a.left, rel: a.top - r.top, size: a.width };
      }
    }
    miniGeo.current = { W, H: Hh, mini, miniArt: art };
    travel.current = mini.top;
    if (!isOpenRef.current && !dragOpen.current) sheetY.set(mini.top);
  }, [sheetY]);

  const measureAll = useCallback(() => {
    measureMini();
    const content = contentRef.current;
    const slot = slotRef.current;
    const region = regionRef.current;
    const mg = miniGeo.current;
    if (!content || !slot || !region || !mg) return;

    const c = content.getBoundingClientRect();
    const s = slot.getBoundingClientRect();
    const r = region.getBoundingClientRect();
    if (!s.width) return;

    geo.current = {
      ...mg,
      big: { left: s.left - c.left, top: s.top - c.top, size: s.width },
      head: { left: r.left - c.left + 24, top: r.top - c.top + 4, size: HEAD_ART },
    };
    apply();
  }, [measureMini, apply]);

  useIsoLayoutEffect(() => {
    const update = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    update();
    measureMini();
    const onResize = () => { update(); measureMini(); if (isOpenRef.current) measureAll(); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measureMini, measureAll]);

  // Measure before first paint of the sheet so there is never an un-morphed frame
  useIsoLayoutEffect(() => {
    if (isOpen) measureAll();
  }, [isOpen, measureAll]);

  // Layout moves (idle collapse, lyrics toggle) → keep artwork glued to its slot
  useEffect(() => {
    if (!isOpen || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measureAll());
    if (regionRef.current) ro.observe(regionRef.current);
    if (slotRef.current) ro.observe(slotRef.current);
    return () => ro.disconnect();
  }, [isOpen, measureAll]);

  /* ------------------------------------------------------------------ */
  /*  Sheet motion                                                       */
  /* ------------------------------------------------------------------ */
  const stopAnim = useCallback(() => {
    anim.current?.stop();
    anim.current = null;
  }, []);

  const runTo = useCallback(
    (to: number, velocity = 0, done?: () => void) => {
      stopAnim();
      anim.current = animate(sheetY, to, { ...SHEET, velocity, onComplete: done });
    },
    [sheetY, stopAnim]
  );

  const closeSheet = useCallback(() => {
    runTo(travel.current, 0, () => {
      anim.current = null;
      setOpen(false);
    });
  }, [runTo, setOpen]);

  const leaveTo = useCallback(
    (to: string) => {
      closeSheet();
      setTimeout(() => router.push(to), 120);
    },
    [router, closeSheet]
  );

  // Open by tap / programmatic trigger. Closed state parks sheetY at the dock position.
  useEffect(() => {
    if (!isOpen) {
      stopAnim();
      sheetY.set(travel.current);
      return;
    }
    if (dragOpen.current) return;
    runTo(0);
    return () => stopAnim();
  }, [isOpen, runTo, stopAnim, sheetY]);

  // Lyrics mode: artwork glides between big ⇄ compact header
  useEffect(() => {
    const c = animate(L, isLyricsOpen ? 1 : 0, LYRICS_SPRING);
    return () => c.stop();
  }, [isLyricsOpen, L]);

  // Pause → artwork breathes
  useEffect(() => {
    const c = animate(pause, isPlaying ? 1 : PAUSED, PAUSE_SPRING);
    return () => c.stop();
  }, [isPlaying, pause]);

  useEffect(() => {
    dirRef.current = 1;
  }, [currentTrack?.id]);

  useEffect(() => {
    if (currentTrack?.id) setIsLyricsOpen(false);
  }, [currentTrack?.id, setIsLyricsOpen]);

  // Strictly prevent mobile browser pull-to-refresh while fullview player is open
  useEffect(() => {
    if (!isOpen) return;

    const html = document.documentElement;
    const body = document.body;

    html.classList.add("fullview-player-open");
    body.classList.add("fullview-player-open");

    const prevHtmlOverscroll = html.style.overscrollBehaviorY;
    const prevBodyOverscroll = body.style.overscrollBehaviorY;
    html.style.overscrollBehaviorY = "none";
    body.style.overscrollBehaviorY = "none";

    let touchStartY = 0;
    let touchStartX = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const deltaY = e.touches[0].clientY - touchStartY;
      const deltaX = e.touches[0].clientX - touchStartX;

      if (deltaY > 0 && Math.abs(deltaY) > Math.abs(deltaX)) {
        const target = e.target as HTMLElement | null;
        const scrollable = target?.closest?.(".overflow-y-auto, .overflow-auto") as HTMLElement | null;
        if (scrollable && scrollable.scrollTop > 0) return; // let lyrics scroll
        if (e.cancelable) e.preventDefault();
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      html.classList.remove("fullview-player-open");
      body.classList.remove("fullview-player-open");
      html.style.overscrollBehaviorY = prevHtmlOverscroll;
      body.style.overscrollBehaviorY = prevBodyOverscroll;
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, [isOpen]);

  /* ------------------------------------------------------------------ */
  /*  Gestures                                                           */
  /* ------------------------------------------------------------------ */
  const handleNext = useCallback(() => {
    dirRef.current = 1;
    playNext(true);
  }, [playNext]);

  const handlePrev = useCallback(() => {
    dirRef.current = -1;
    playPrev();
  }, [playPrev]);

  const beginSheetDrag = () => {
    stopAnim();
    panBase.current = sheetY.get();
  };
  const dragSheet = (dy: number) => {
    sheetY.set(clamp(panBase.current + dy, 0, travel.current));
  };
  /** Release the sheet: flick/threshold decides, spring inherits finger velocity */
  const releaseSheet = (vy: number) => {
    const D = travel.current;
    const v = sheetY.get();
    const shouldClose = vy > 320 || (v > 90 && vy > -320);
    if (shouldClose) {
      runTo(D, vy, () => {
        anim.current = null;
        setOpen(false);
      });
    } else {
      runTo(0, vy);
    }
  };

  /* mini player: swipe up opens sheet (finger-tracked); swipe horizontal skips */
  const miniX = useMotionValue(0);
  const gesture = useRef<"none" | "x" | "y">("none");
  const panned = useRef(false);

  const miniPanStart = () => {
    gesture.current = "none";
    panned.current = false;
  };

  const miniPan = (_: PointerEvent, i: PanInfo) => {
    if (gesture.current === "none") {
      if (Math.hypot(i.offset.x, i.offset.y) < 6) return;
      gesture.current = Math.abs(i.offset.x) > Math.abs(i.offset.y) ? "x" : "y";
      panned.current = true;
      if (gesture.current === "y" && i.offset.y < 0 && !isOpenRef.current) {
        dragOpen.current = true;
        stopAnim();
        panBase.current = travel.current;
        setOpen(true);
      }
    }
    if (gesture.current === "x") {
      miniX.set(i.offset.x * 0.8);
    } else if (dragOpen.current) {
      dragSheet(i.offset.y);
    }
  };

  const miniPanEnd = (_: PointerEvent, i: PanInfo) => {
    if (gesture.current === "x") {
      if (i.offset.x < -56 || i.velocity.x < -500) handleNext();
      else if (i.offset.x > 56 || i.velocity.x > 500) handlePrev();
      animate(miniX, 0, SPRING_SOFT);
    } else if (dragOpen.current) {
      dragOpen.current = false;
      const D = travel.current;
      const v = sheetY.get();
      const vy = i.velocity.y;
      const shouldOpen = vy < -280 || (v < D * 0.8 && vy < 280);
      if (shouldOpen) runTo(0, vy);
      else
        runTo(D, vy, () => {
          anim.current = null;
          setOpen(false);
        });
    }
    gesture.current = "none";
  };

  /* grabber / compact header: drag down to close */
  const sheetPanStart = () => beginSheetDrag();
  const sheetPan = (_: PointerEvent, i: PanInfo) => dragSheet(i.offset.y);
  const sheetPanEnd = (_: PointerEvent, i: PanInfo) => releaseSheet(i.velocity.y);

  /* artwork area: drag down closes, swipe up opens lyrics, horizontal swipe skips */
  const artPanGesture = useRef<"none" | "x" | "y">("none");

  const onArtPanStart = () => {
    artPanGesture.current = "none";
    beginSheetDrag();
  };

  const onArtPan = (_: PointerEvent, info: PanInfo) => {
    if (isLyricsOpen) return;
    if (artPanGesture.current === "none") {
      if (Math.hypot(info.offset.x, info.offset.y) < 6) return;
      artPanGesture.current = Math.abs(info.offset.x) > Math.abs(info.offset.y) ? "x" : "y";
    }
    if (artPanGesture.current === "x") {
      artX.set(info.offset.x * 0.7);
    } else if (info.offset.y > 0) {
      dragSheet(info.offset.y);
    }
  };

  const onArtPanEnd = (_: PointerEvent, info: PanInfo) => {
    if (isLyricsOpen) return;
    if (artPanGesture.current === "x") {
      if (info.offset.x < -60 || info.velocity.x < -400) handleNext();
      else if (info.offset.x > 60 || info.velocity.x > 400) handlePrev();
      animate(artX, 0, SPRING_SOFT);
      if (sheetY.get() > 0.5) runTo(0); // safety: never leave the sheet half-dragged
    } else if (artPanGesture.current === "y") {
      if (info.offset.y > 0 || sheetY.get() > 0.5) {
        releaseSheet(info.velocity.y);
      } else if (info.offset.y < -35 || info.velocity.y < -250) {
        setIsLyricsOpen(true);
      }
    }
    // keep "y"/"x" until after onTap has had a chance to read it
    setTimeout(() => { artPanGesture.current = "none"; }, 0);
  };

  /* Idle auto-hide flags */
  const hideScrubber = isLyricsOpen && idle;
  const hideTransport = idle || (isLyricsOpen && isUserScrollingLyrics);

  if (!currentTrack) return null;

  const art = (
    <AnimatePresence mode="popLayout" initial={false} custom={dirRef.current}>
      <motion.img
        key={shown.id}
        src={shown.cover}
        alt=""
        draggable={false}
        custom={dirRef.current}
        variants={slide}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ x: SPRING_SOFT, scale: SPRING_SOFT, opacity: { duration: 0.24 } }}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
    </AnimatePresence>
  );

  const artistGrey = "text-white/55 hover:text-white/55";

  return (
    <MotionConfig reducedMotion="user">
      <PlayerStyles />

      {/* ───────────── MINI PLAYER ─────────────
          Hidden (not faded) while the sheet exists. The sheet's shell docks into this exact
          rect with the exact same glass, then React swaps them in one commit: no overlap,
          no see-through frame, no pop. */}
      {!hidePlayer && (
        <motion.div
          ref={miniShellRef}
          key="mini-player"
          onPanStart={miniPanStart}
          onPan={miniPan}
          onPanEnd={miniPanEnd}
          className="fixed left-3 right-3 z-[300] select-none"
          style={{
            bottom: `calc(${MINI_BOTTOM}px + env(safe-area-inset-bottom, 0px))`,
            height: PILL_H,
            touchAction: "none",
            opacity: isOpen ? 0 : 1,
            pointerEvents: isOpen ? "none" : "auto",
            fontFamily: FONT_STACK,
          }}
        >
          <div className="absolute inset-0 rounded-full" style={glassSurface} />
          <MiniPlayerProgress />

          <div className="relative flex h-full items-center pl-2 pr-1.5">
            <motion.div
              style={{ x: miniX }}
              className="flex h-full min-w-0 flex-1 cursor-pointer items-center"
              onClick={() => {
                if (panned.current) {
                  panned.current = false;
                  return;
                }
                setOpen(true);
              }}
            >
              <div
                ref={miniArtRef}
                className="relative shrink-0 overflow-hidden bg-zinc-800 shadow-md ring-1 ring-white/10"
                style={{ width: MINI_ART, height: MINI_ART, borderRadius: MINI_R }}
              >
                {art}
              </div>

              <div className="relative ml-3 h-full min-w-0 flex-1">
                <AnimatePresence mode="popLayout" initial={false} custom={dirRef.current}>
                  <motion.div
                    key={currentTrack.id}
                    custom={dirRef.current}
                    variants={textSlide}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ x: SPRING_SOFT, opacity: { duration: 0.2 } }}
                    className="absolute inset-0 flex min-w-0 flex-col justify-center"
                  >
                    <Marquee align="left">
                      <span className="pl-px text-[15px] font-semibold leading-[19px] tracking-[-0.015em] text-white">
                        {currentTrack.title}
                      </span>
                    </Marquee>
                    <Marquee align="left">
                      <span
                        className="pl-px text-[14px] leading-[18px] text-white/55"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ArtistLinks track={currentTrack} maxArtists={3} linkClassName={artistGrey} />
                      </span>
                    </Marquee>
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>

            <div
              className="relative z-10 flex shrink-0 items-center gap-0.5"
              onClick={(e) => e.stopPropagation()}
              onPointerDownCapture={(e) => e.stopPropagation()}
            >
              <PlayPauseButton isPlaying={isPlaying} onToggle={togglePlay} size={28} className="h-10 w-10" />
              <SpringButton onClick={handleNext} className="h-10 w-10 text-white" title="Next">
                <SwiftUIForward size={24} fill="currentColor" />
              </SpringButton>
            </div>
          </div>
        </motion.div>
      )}

      {/* ───────────── FULL SCREEN SHEET (shell that morphs into the pill) ───────────── */}
      {isOpen && (
        <motion.div
          key="sheet-shell"
          className="fixed z-[1100] select-none"
          style={{
            top: m.top,
            left: m.left,
            right: m.right,
            bottom: m.bottom,
            borderTopLeftRadius: m.rTop,
            borderTopRightRadius: m.rTop,
            borderBottomLeftRadius: m.rBot,
            borderBottomRightRadius: m.rBot,
            opacity: m.shellOp,
            fontFamily: FONT_STACK,
            WebkitFontSmoothing: "antialiased",
          }}
        >
          {/* shadow lives outside the clip so it isn't cut off */}
          <motion.div
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{ opacity: m.shadowOp, boxShadow: GLASS_DROP }}
          />

          {/* clip */}
          <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: "inherit" }}>
            {/* glass = identical to the mini player's, fades in as the shell docks */}
            <motion.div
              className="absolute inset-0"
              style={{
                ...glassInset,
                borderRadius: "inherit",
                display: m.glassDisplay,
                opacity: m.glassOp,
              }}
            />

            {/* content: fixed full-screen size, anchored to the shell's top edge,
                counter-shifted in x so it stays screen-aligned while the shell narrows */}
            <motion.div
              ref={contentRef}
              className="absolute left-0 top-0 flex flex-col overscroll-none"
              style={{
                x: m.cx,
                width: vp.w || "100vw",
                height: vp.h || "100dvh",
                overscrollBehavior: "none",
                touchAction: isLyricsOpen ? "pan-y" : "none",
              }}
            >
              {/* Fluid mesh background (fixed size → never re-layouts while the shell resizes) */}
              <motion.div
                className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-[#121214]"
                style={{ opacity: m.meshOp }}
              >
                <DynamicBackground surface="fullPlayer" coverUrl={shown.cover} paused={!isPlaying} />
                <div
                  className="ps-t-soft absolute inset-0 bg-black/25"
                  style={{ opacity: isLyricsOpen ? 1 : 0 }}
                />
              </motion.div>

              {/* Mini-player ghost row: same layout as the real mini; fades/rises in as we dock */}
              <motion.div
                className="pointer-events-none absolute left-3 right-3 top-0 z-10"
                style={{ height: PILL_H, opacity: m.ghostOp, y: m.ghostY }}
              >
                <MiniPlayerProgress />
                <div className="relative flex h-full items-center pl-2 pr-1.5">
                  <div className="flex h-full min-w-0 flex-1 items-center">
                    <div className="shrink-0" style={{ width: MINI_ART, height: MINI_ART }} />
                    <div className="relative ml-3 flex h-full min-w-0 flex-1 flex-col justify-center">
                      <Marquee key={`gt-${currentTrack.id}`} align="left">
                        <span className="pl-px text-[15px] font-semibold leading-[19px] tracking-[-0.015em] text-white">
                          {currentTrack.title}
                        </span>
                      </Marquee>
                      <Marquee key={`ga-${currentTrack.id}`} align="left">
                        <span className="pl-px text-[14px] leading-[18px] text-white/55">
                          <ArtistLinks track={currentTrack} maxArtists={3} linkClassName={artistGrey} />
                        </span>
                      </Marquee>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <PlayPauseButton isPlaying={isPlaying} onToggle={() => {}} size={28} className="h-10 w-10" />
                    <div className="flex h-10 w-10 items-center justify-center text-white">
                      <SwiftUIForward size={24} fill="currentColor" />
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Artwork: ONE element for big, compact (lyrics) and mini. Transform-only. */}
              <motion.div
                className="pointer-events-none absolute left-0 top-0 z-20 overflow-hidden bg-zinc-800"
                style={{
                  width: ART_BASE,
                  height: ART_BASE,
                  x: m.artX,
                  y: m.artY,
                  scale: m.artS,
                  borderRadius: m.artR,
                  boxShadow: m.artShadow,
                  transformOrigin: "0 0",
                  willChange: "transform",
                }}
              >
                {art}
              </motion.div>

              {/* Grabber handle (drag down to close or tap) */}
              <motion.div
                onPanStart={sheetPanStart}
                onPan={sheetPan}
                onPanEnd={sheetPanEnd}
                onTap={closeSheet}
                className="relative z-30 flex shrink-0 cursor-grab touch-none items-center justify-center pb-3 pt-[calc(env(safe-area-inset-top,0px)+12px)] active:cursor-grabbing"
                style={{ opacity: m.grabOp, pointerEvents: m.grabPE as any }}
              >
                <div className="h-[5px] w-9 rounded-full bg-white/35" />
              </motion.div>

              {/* Middle region: artwork slot / compact header / lyrics */}
              <motion.div
                ref={regionRef}
                className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-6"
                style={{ touchAction: isLyricsOpen ? "pan-y" : "none", overscrollBehavior: "none" }}
                onPanStart={!isLyricsOpen ? onArtPanStart : undefined}
                onPan={!isLyricsOpen ? onArtPan : undefined}
                onPanEnd={!isLyricsOpen ? onArtPanEnd : undefined}
                onTap={
                  !isLyricsOpen
                    ? () => {
                        if (artPanGesture.current === "none") setIsLyricsOpen(true);
                      }
                    : undefined
                }
              >
                {/* Invisible slot: defines where the big artwork lives. Always laid out. */}
                <div
                  ref={slotRef}
                  className="pointer-events-none shrink-0"
                  style={{
                    width: "min(100%, max(240px, calc(100dvh - 460px)), 420px)",
                    aspectRatio: "1",
                  }}
                />

                {/* Compact header (lyrics mode): artwork glides here, text rises in */}
                <motion.div
                  onPanStart={sheetPanStart}
                  onPan={sheetPan}
                  onPanEnd={sheetPanEnd}
                  className="absolute inset-x-0 top-0 z-20 flex touch-none items-start gap-3 px-6 pt-1"
                  style={{
                    height: HEADER_H,
                    opacity: m.headOp,
                    y: m.headY,
                    pointerEvents: isLyricsOpen ? "auto" : "none",
                  }}
                >
                  <div
                    className="h-14 w-14 shrink-0 cursor-pointer"
                    onClick={() => setIsLyricsOpen(false)}
                    title="Back to artwork"
                  />
                  <div className="flex h-14 min-w-0 flex-1 flex-col justify-center">
                    <Marquee key={`ht-${currentTrack.id}`} align="left">
                      <span className="pl-px text-[17px] font-semibold leading-[22px] tracking-[-0.015em] text-white">
                        {currentTrack.title}
                      </span>
                    </Marquee>
                    <Marquee key={`ha-${currentTrack.id}`} align="left">
                      <span className="pl-px text-[15px] leading-[20px] text-white/60">
                        <ArtistLinks track={currentTrack} maxArtists={3} onClick={closeSheet} />
                      </span>
                    </Marquee>
                  </div>
                  <div
                    className="flex h-14 shrink-0 items-center gap-2"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <LikeButton circle liked={liked} onToggle={toggleLike} size={16} />
                    <TrackMenu track={currentTrack} onLeave={leaveTo} />
                  </div>
                </motion.div>

                {/* Lyrics */}
                <motion.div
                  className="absolute inset-x-0 bottom-0"
                  style={{ top: HEADER_H, opacity: m.lyricsOp, y: m.lyricsY }}
                >
                  <AnimatePresence>
                    {isLyricsOpen && showLyrics && (
                      <motion.div
                        key="lyrics"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ y: SPRING_SOFT, opacity: { duration: 0.28 } }}
                        className="absolute inset-0"
                      >
                        <div
                          className="ps-t-soft h-full w-full"
                          style={{
                            transform: idle ? "scale(1.05)" : "scale(1)",
                            transformOrigin: "50% 38%",
                          }}
                        >
                          <LyricsView
                            trackId={currentTrack.id}
                            title={currentTrack.title}
                            artist={currentTrack.artist?.name}
                            rawLyrics={currentTrack.lyrics}
                            isLyricsOpen={isLyricsOpen}
                            isMobile={true}
                            isFullscreen={true}
                            isIdle={idle}
                            duration={duration}
                            transparent={true}
                            onUserScrollChange={setIsUserScrollingLyrics}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </motion.div>

              {/* Bottom block: track info, seekbar, playback actions.
                  Each group has an OUTER wrapper (drag-driven rise + fade) and an INNER wrapper
                  (idle / lyrics collapse) so the two animations never fight over one property. */}
              <div
                className="relative z-10 shrink-0 px-6 pb-[calc(env(safe-area-inset-bottom,0px)+18px)] pt-2"
                style={{ touchAction: isLyricsOpen ? "pan-y" : "none" }}
              >
                {/* Meta (title / artist / like / more) */}
                <motion.div style={{ opacity: m.metaOp, y: m.metaY }}>
                  <AnimatePresence initial={false}>
                    {!isLyricsOpen && (
                      <motion.div
                        key="meta"
                        initial={{ height: 0, opacity: 0, marginBottom: 0 }}
                        animate={{
                          height: idle ? 0 : "auto",
                          opacity: idle ? 0 : 1,
                          marginBottom: idle ? 0 : 12,
                        }}
                        exit={{ height: 0, opacity: 0, marginBottom: 0 }}
                        transition={{
                          height: { type: "spring", stiffness: 300, damping: 30 },
                          opacity: { duration: 0.25 },
                          marginBottom: { type: "spring", stiffness: 300, damping: 30 },
                        }}
                        className="flex items-center gap-3 overflow-hidden"
                        style={{ pointerEvents: idle ? "none" : "auto" }}
                      >
                        <div className="min-w-0 flex-1">
                          <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                              key={currentTrack.id}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -8 }}
                              transition={{ duration: 0.2 }}
                            >
                              <Marquee align="left">
                                <span
                                  className="cursor-pointer pl-px text-[22px] font-semibold leading-[28px] tracking-[-0.02em] text-white"
                                  onClick={() => leaveTo(`/track/${currentTrack.id}`)}
                                >
                                  {currentTrack.title}
                                </span>
                              </Marquee>
                              <Marquee align="left">
                                <span className="pl-px text-[17px] leading-[22px] text-white/60">
                                  <ArtistLinks
                                    track={currentTrack}
                                    maxArtists={3}
                                    linkClassName="text-white/60 hover:text-white transition-colors"
                                    onClick={closeSheet}
                                  />
                                </span>
                              </Marquee>
                            </motion.div>
                          </AnimatePresence>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <LikeButton circle liked={liked} onToggle={toggleLike} size={16} />
                          <TrackMenu track={currentTrack} onLeave={leaveTo} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* Scrubber */}
                <motion.div style={{ opacity: m.scrubOp, y: m.scrubY }}>
                  <motion.div
                    animate={{
                      height: hideScrubber ? 0 : "auto",
                      opacity: hideScrubber ? 0 : 1,
                      marginTop: hideScrubber ? 0 : idle ? 4 : 0,
                    }}
                    transition={{
                      height: { type: "spring", stiffness: 300, damping: 30 },
                      opacity: { duration: 0.25 },
                      marginTop: { type: "spring", stiffness: 300, damping: 30 },
                    }}
                    className="mx-auto w-full max-w-[420px] overflow-hidden"
                    style={{ pointerEvents: hideScrubber ? "none" : "auto" }}
                  >
                    <MobileScrubber isLyricsOpen={isLyricsOpen} />
                  </motion.div>
                </motion.div>

                {/* Transport + secondary tools */}
                <motion.div style={{ opacity: m.transOp, y: m.transY }}>
                  <motion.div
                    animate={{
                      height: hideTransport ? 0 : "auto",
                      opacity: hideTransport ? 0 : 1,
                      marginTop: hideTransport ? 0 : 12,
                    }}
                    transition={{
                      height: { type: "spring", stiffness: 300, damping: 30 },
                      opacity: { duration: 0.25 },
                      marginTop: { type: "spring", stiffness: 300, damping: 30 },
                    }}
                    className="mx-auto w-full max-w-[420px] overflow-hidden"
                    style={{ pointerEvents: hideTransport ? "none" : "auto" }}
                  >
                    <div className="flex items-center justify-between">
                      <PlateButton
                        size={42}
                        active={isShuffled}
                        onClick={toggleShuffle}
                        title={`Shuffle: ${isShuffled ? "On" : "Off"}`}
                      >
                        <SFShuffle size={19} />
                      </PlateButton>
                      <SpringButton onClick={handlePrev} className="h-12 w-12 text-white" title="Previous">
                        <SwiftUIBackward size={30} fill="currentColor" />
                      </SpringButton>
                      <PlayPauseButton
                        isPlaying={isPlaying}
                        onToggle={togglePlay}
                        size={42}
                        className="h-14 w-14"
                      />
                      <SpringButton onClick={handleNext} className="h-12 w-12 text-white" title="Next">
                        <SwiftUIForward size={30} fill="currentColor" />
                      </SpringButton>
                      <PlateButton
                        size={42}
                        active={repeatMode !== "off"}
                        onClick={toggleRepeat}
                        title={`Repeat: ${repeatMode}`}
                        className="relative"
                      >
                        <SFRepeat size={19} />
                        <AnimatePresence>
                          {(repeatMode === "one" || repeatMode === "two") && (
                            <motion.span
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0, opacity: 0 }}
                              transition={SPRING}
                              className="pointer-events-none absolute inset-0 flex items-center justify-center text-[7px] font-black"
                            >
                              {repeatMode === "one" ? "1" : "2"}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </PlateButton>
                    </div>

                    {/* Secondary Tools: FX, Lyrics, Queue */}
                    <div className="mx-auto mt-5 flex max-w-[300px] items-center justify-between">
                      <PlateButton
                        size={44}
                        active={isAudioFxOpen}
                        onClick={() => setAudioFxOpen(!isAudioFxOpen)}
                        title="Studio FX"
                      >
                        <SFFx size={22} />
                      </PlateButton>
                      <PlateButton
                        size={44}
                        active={isLyricsOpen}
                        onClick={() => setIsLyricsOpen(!isLyricsOpen)}
                        title="Lyrics"
                      >
                        <SFLyrics size={22} />
                      </PlateButton>
                      <PlateButton
                        size={44}
                        active={isQueueOpen}
                        onClick={() => setIsQueueOpen(!isQueueOpen)}
                        title="Queue"
                      >
                        <SwiftUIQueue size={22} stroke="currentColor" />
                      </PlateButton>
                    </div>
                  </motion.div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </MotionConfig>
  );
}