"use client";

import React, {
  useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from "react";
import {
  AnimatePresence, LayoutGroup, MotionConfig, animate, motion, motionValue,
  useMotionValue, useMotionValueEvent, useTransform,
  type MotionValue, type PanInfo,
} from "framer-motion";
import { ListPlus, RefreshCw, User, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/authStore";
import { useRefetchAudio } from "@/hooks/useRefetchAudio";
import { useRefetchLyrics } from "@/hooks/useRefetchLyrics";
import { RefetchLyricsSubMenu } from "@/components/shared/RefetchLyricsSubMenu";
import { SwiftUIForward, SwiftUIBackward, SwiftUIQueue } from "@/components/ui/SwiftUIIcons";
import { ArtistLinks } from "@/components/shared/ArtistLinks";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { cn, getTrackCover, getArtistTarget } from "@/lib/utils";
import { MobileScrubber, MiniPlayerProgress } from "./../player/PlayerProgress";
import { DynamicBackground } from "../shared/DynamicBackground";
import { LyricsView } from "../shared/LyricsView";
import {
  FONT_STACK, SHEET_SPRING, SPRING, SPRING_SOFT,
  GlassButton, LikeButton, Marquee, PlateButton, PlayPauseButton, PlayerStyles, SpringButton,
  SFFx, SFLyrics, SFMore, SFRepeat, SFShuffle,
  useAutoHideIdle, useTrackLike,
} from "@/components/player/PlayerKit";

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
/*  MorphWrap — pixel-exact artwork travel between mini player & sheet */
/*                                                                      */
/*  Coordinates and scale are derived from sheetY so dragging, opening, */
/*  and closing share the exact same mathematical trajectory.          */
/* ------------------------------------------------------------------ */
const PAUSED = 0.86;
const BIG_R = 14;
const MINI_R = 8;

interface GeoRect {
  fullLeft: number;
  fullTop: number;
  fullSize: number;
  miniLeft: number;
  miniTop: number;
  miniSize: number;
}

function MorphWrap({
  sheetY, miniRef, H, paused, children,
}: {
  sheetY: MotionValue<number>;
  miniRef: React.RefObject<HTMLDivElement>;
  H: number;
  paused: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const geo = useRef<GeoRect | null>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const s = useMotionValue(1);
  const radius = useMotionValue(BIG_R);
  const pause = useMotionValue(paused ? PAUSED : 1);

  const update = useCallback(() => {
    const g = geo.current;
    if (!g) return;
    const v = sheetY.get();
    const q = Math.min(1, Math.max(0, v / H)); // 0 = fully open, 1 = docked in mini player
    const k0 = pause.get(); // 0.86 when paused, 1 when playing

    if (!g.miniSize || !g.fullSize) {
      const sh = (g.fullSize - g.fullSize * k0) / 2;
      x.set(sh);
      y.set(sh);
      s.set(k0);
      radius.set(BIG_R / k0);
      return;
    }

    // Geometry scaling
    const sGeo = 1 + (g.miniSize / g.fullSize - 1) * q;
    // Paused shrink fades smoothly as the artwork docks
    const kEffective = 1 - (1 - k0) * (1 - q);
    const sTotal = sGeo * kEffective;
    // Center offset so pause shrink centers itself around the box
    const pauseShift = (g.fullSize * sGeo - g.fullSize * sTotal) / 2;

    // Translation targeting the mini player bounding rect
    const targetX = (g.miniLeft - g.fullLeft) * q + pauseShift;
    // - v cancels the parent sheet translateY
    const targetY = (g.miniTop - g.fullTop) * q - v + pauseShift;

    x.set(targetX);
    y.set(targetY);
    s.set(sTotal);
    radius.set((BIG_R + (MINI_R - BIG_R) * q) / sTotal);
  }, [H, sheetY, pause, x, y, s, radius]);

  useMotionValueEvent(sheetY, "change", update);
  useMotionValueEvent(pause, "change", update);

  const measure = useCallback(() => {
    const el = ref.current;
    const mini = miniRef.current;
    if (!el || !mini) return;

    // Reset values to get un-transformed reference box
    const curX = x.get();
    const curY = y.get();
    const curS = s.get();
    x.set(0);
    y.set(0);
    s.set(1);

    const r = el.getBoundingClientRect();
    const m = mini.getBoundingClientRect();

    x.set(curX);
    y.set(curY);
    s.set(curS);

    if (!r.width || !m.width) return;

    geo.current = {
      fullLeft: r.left,
      fullTop: r.top - sheetY.get(),
      fullSize: r.width,
      miniLeft: m.left,
      miniTop: m.top,
      miniSize: m.width,
    };

    update();
  }, [sheetY, update, x, y, s, miniRef]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  useEffect(() => {
    const c = animate(pause, paused ? PAUSED : 1, {
      type: "spring",
      stiffness: 300,
      damping: 22,
      mass: 0.6,
    });
    return () => c.stop();
  }, [paused, pause]);

  return (
    <motion.div
      ref={ref}
      className="h-full w-full bg-zinc-800"
      style={{
        x,
        y,
        scale: s,
        borderRadius: radius,
        overflow: "hidden",
        transformOrigin: "0 0",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.1), 0 24px 48px rgba(0,0,0,0.5)",
      }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  HeaderMorphWrap — Smooth morph from Lyrics Compact Header to Mini  */
/* ------------------------------------------------------------------ */
function HeaderMorphWrap({
  sheetY,
  miniRef,
  H,
  children,
}: {
  sheetY: MotionValue<number>;
  miniRef: React.RefObject<HTMLDivElement>;
  H: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const geo = useRef<{
    headerLeft: number;
    headerTop: number;
    headerSize: number;
    miniLeft: number;
    miniTop: number;
    miniSize: number;
  } | null>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const s = useMotionValue(1);

  const update = useCallback(() => {
    const g = geo.current;
    if (!g || !g.miniSize) return;
    const v = sheetY.get();
    const q = Math.min(1, Math.max(0, v / H)); // 0 = open, 1 = closed (docked)
    if (q <= 0) {
      x.set(0);
      y.set(0);
      s.set(1);
      return;
    }
    const sGeo = 1 + (g.miniSize / g.headerSize - 1) * q;
    x.set((g.miniLeft - g.headerLeft) * q);
    y.set((g.miniTop - g.headerTop) * q - v);
    s.set(sGeo);
  }, [H, sheetY, x, y, s]);

  useMotionValueEvent(sheetY, "change", update);

  const measure = useCallback(() => {
    const el = ref.current;
    const mini = miniRef.current;
    if (!el || !mini) return;
    const curX = x.get();
    const curY = y.get();
    const curS = s.get();
    x.set(0);
    y.set(0);
    s.set(1);
    const r = el.getBoundingClientRect();
    const m = mini.getBoundingClientRect();
    x.set(curX);
    y.set(curY);
    s.set(curS);
    if (!r.width || !m.width) return;
    geo.current = {
      headerLeft: r.left,
      headerTop: r.top - sheetY.get(),
      headerSize: r.width,
      miniLeft: m.left,
      miniTop: m.top,
      miniSize: m.width,
    };
    update();
  }, [sheetY, update, x, y, s, miniRef]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  return (
    <motion.div
      ref={ref}
      className="relative shrink-0"
      style={{ x, y, scale: s, transformOrigin: "0 0" }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Track menu (⋯)                                                     */
/* ------------------------------------------------------------------ */
function TrackMenu({ track, onLeave }: { track: any; onLeave: (to: string) => void }) {
  const { refetchTrackAudio, isRefetching } = useRefetchAudio();
  const { refetchTrackLyrics } = useRefetchLyrics();
  const openDownloadModal = useUIStore((s) => s.openDownloadModal);
  const showToast = (msg: string, type: "success" | "error" = "success") =>
    useUIStore.getState().showToast(msg, type);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <GlassButton title="More">
          <SFMore size={18} />
        </GlassButton>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="z-[1200] w-56 rounded-2xl border-white/10 bg-zinc-900/90 p-2 backdrop-blur-xl"
        >
          <DropdownMenuItem onSelect={() => usePlayerStore.getState().addToUserQueue(track)}>
            <ListPlus size={18} className="mr-3 text-brand opacity-50" />
            <span className="font-medium">Add to Queue</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => refetchTrackAudio(track, showToast)}>
            <RefreshCw
              size={18}
              className={cn("mr-3 opacity-50", isRefetching === track?.id && "animate-spin text-brand")}
            />
            <span className="font-medium">{isRefetching === track?.id ? "Refetching…" : "Refetch Audio"}</span>
          </DropdownMenuItem>
          <RefetchLyricsSubMenu track={track} refetchTrackLyrics={refetchTrackLyrics} showToast={showToast} />
          <DropdownMenuItem
            onSelect={() => {
              const t = getArtistTarget(track);
              if (t) onLeave(t);
            }}
          >
            <User size={18} className="mr-3 opacity-50" />
            <span className="font-medium">Go to Artist</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openDownloadModal(track)}>
            <Download size={18} className="mr-3 opacity-50" />
            <span className="font-medium">Download Track</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
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
/*  Main                                                               */
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

  const stylePref = useAuthStore((s: any) => s.user?.preferences?.globalPlayerStyle);
  const isGlass = stylePref !== "classic" && stylePref !== "solid";

  const { liked, toggle: toggleLike } = useTrackLike(currentTrack?.id);
  const shown = useShownCover(currentTrack);

  const dirRef = useRef(1);
  const [isUserScrollingLyrics, setIsUserScrollingLyrics] = useState(false);
  const idle = useAutoHideIdle(isOpen, 5000);
  const showLyrics = useDeferredValue(isLyricsOpen);

  const handleNext = useCallback(() => {
    dirRef.current = 1;
    playNext(true);
  }, [playNext]);

  const handlePrev = useCallback(() => {
    dirRef.current = -1;
    playPrev();
  }, [playPrev]);

  useEffect(() => {
    dirRef.current = 1;
  }, [currentTrack?.id]);

  useEffect(() => {
    if (currentTrack?.id) setIsLyricsOpen(false);
  }, [currentTrack?.id, setIsLyricsOpen]);

  /* ── sheet motion values & drag physics ── */
  const H = useRef(typeof window !== "undefined" ? window.innerHeight : 900).current;
  const sessionRef = useRef(0);
  const wasOpen = useRef(false);
  if (isOpen && !wasOpen.current) sessionRef.current++;
  wasOpen.current = isOpen;
  const session = sessionRef.current;

  const sheetY = useMemo(() => motionValue(H), [session, H]);
  const sheetYRef = useRef(sheetY);
  sheetYRef.current = sheetY;
  const radius = useTransform(sheetY, [0, 140], [0, 32], { clamp: true });
  const miniArtRef = useRef<HTMLDivElement>(null);
  const isClosingRef = useRef(false);
  const dragOpen = useRef(false);

  // Close sheet with spring animation down to mini player
  const closeSheet = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    animate(sheetY, H, SHEET_SPRING).then(() => {
      setOpen(false);
      isClosingRef.current = false;
    });
  }, [H, sheetY, setOpen]);

  const leaveTo = useCallback(
    (to: string) => {
      closeSheet();
      setTimeout(() => router.push(to), 120);
    },
    [router, closeSheet]
  );

  // Opening by tap / programmatic trigger
  useEffect(() => {
    if (!isOpen || dragOpen.current) return;
    const c = animate(sheetY, 0, SHEET_SPRING);
    return () => c.stop();
  }, [isOpen, sheetY]);

  /* ── mini player gestures: swipe up opens sheet; swipe horizontal skips ── */
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
      if (gesture.current === "y" && i.offset.y < 0 && !isOpen) {
        dragOpen.current = true;
        setOpen(true);
      }
    }
    if (gesture.current === "x") {
      miniX.set(i.offset.x * 0.8);
    } else if (dragOpen.current) {
      sheetYRef.current.set(Math.max(0, Math.min(H, H + i.offset.y)));
    }
  };

  const miniPanEnd = (_: PointerEvent, i: PanInfo) => {
    if (gesture.current === "x") {
      if (i.offset.x < -56 || i.velocity.x < -500) handleNext();
      else if (i.offset.x > 56 || i.velocity.x > 500) handlePrev();
      animate(miniX, 0, SPRING_SOFT);
    } else if (dragOpen.current) {
      dragOpen.current = false;
      const sy = sheetYRef.current;
      if (i.velocity.y < -280 || -i.offset.y > H * 0.2) {
        animate(sy, 0, { ...SHEET_SPRING, velocity: i.velocity.y });
      } else {
        animate(sy, H, SHEET_SPRING).then(() => setOpen(false));
      }
    }
    gesture.current = "none";
  };

  /* ── full sheet drag down to close (works in both Artwork and Lyrics mode) ── */
  const sheetPan = (_: PointerEvent, i: PanInfo) => {
    if (i.offset.y > 0) {
      sheetYRef.current.set(Math.min(H, i.offset.y));
    }
  };

  const sheetPanEnd = (_: PointerEvent, i: PanInfo) => {
    const sy = sheetYRef.current;
    if (i.offset.y > 90 || i.velocity.y > 320) {
      isClosingRef.current = true;
      animate(sy, H, { ...SHEET_SPRING, velocity: i.velocity.y }).then(() => {
        setOpen(false);
        isClosingRef.current = false;
      });
    } else {
      animate(sy, 0, SHEET_SPRING);
    }
  };

  /* Idle auto-hide flags */
  const hideMeta = idle;
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

  const artistGrey = "text-zinc-400 hover:text-zinc-400";

  return (
    <MotionConfig reducedMotion="user">
      <PlayerStyles />

      {/* ───────────── MINI PLAYER ───────────── */}
      {!hidePlayer && (
        <motion.div
          key="mini-player"
          animate={{ opacity: isOpen ? 0 : 1 }}
          transition={{ duration: isOpen ? 0.12 : 0.24, delay: isOpen ? 0.02 : 0.15 }}
          onPanStart={miniPanStart}
          onPan={miniPan}
          onPanEnd={miniPanEnd}
          className="fixed left-3 right-3 z-[300] select-none"
          style={{
            bottom: "calc(76px + env(safe-area-inset-bottom, 0px))",
            height: 62,
            touchAction: "none",
            pointerEvents: isOpen ? "none" : "auto",
            fontFamily: FONT_STACK,
          }}
        >
          <div
            className={cn(
              "absolute inset-0 rounded-full border border-white/10 shadow-[0_8px_28px_rgba(0,0,0,0.45)]",
              isGlass ? "bg-white/[0.07] backdrop-blur-xl" : "bg-[#1c1c1e]"
            )}
            style={isGlass ? { WebkitBackdropFilter: "blur(22px) saturate(1.6)", backdropFilter: "blur(22px) saturate(1.6)" } : undefined}
          />
          <MiniPlayerProgress />

          <div className="relative flex h-full items-center px-3.5">
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
                className="relative h-11 w-11 shrink-0 overflow-hidden bg-zinc-800 shadow-md ring-1 ring-white/10"
                style={{ borderRadius: MINI_R }}
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
                      <span className="pl-px text-[14px] font-semibold leading-[18px] tracking-[-0.01em] text-white">
                        {currentTrack.title}
                      </span>
                    </Marquee>
                    <Marquee align="left">
                      <span
                        className="pl-px text-[12.5px] leading-[16px] text-zinc-400"
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

      {/* ───────────── FULL SCREEN SHEET ───────────── */}
      <LayoutGroup id={`m-${session}`}>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              key="full-sheet"
              exit={{ y: H }}
              transition={SHEET_SPRING}
              className="fixed inset-0 z-[1100] flex select-none flex-col"
              style={{
                y: sheetY,
                willChange: "transform",
                fontFamily: FONT_STACK,
                WebkitFontSmoothing: "antialiased",
              }}
            >
              {/* Dynamic fluid mesh background */}
              <motion.div
                className="absolute inset-0 z-0 overflow-hidden bg-[#121214]"
                style={{ borderTopLeftRadius: radius, borderTopRightRadius: radius }}
              >
                <DynamicBackground key={session} surface="fullPlayer" coverUrl={shown.cover} />
                <div
                  className="ps-t-soft absolute inset-0 bg-black/25"
                  style={{ opacity: isLyricsOpen ? 1 : 0 }}
                />
              </motion.div>

              {/* Grabber handle (drag down to close or tap) */}
              <motion.div
                onPan={sheetPan}
                onPanEnd={sheetPanEnd}
                onClick={closeSheet}
                className="relative z-30 flex shrink-0 cursor-grab touch-none items-center justify-center pb-3 pt-[calc(env(safe-area-inset-top,0px)+12px)] active:cursor-grabbing"
              >
                <div className="h-[5px] w-9 rounded-full bg-white/35" />
              </motion.div>

              {/* Compact header (active during lyrics view) */}
              {isLyricsOpen && (
                <motion.div
                  onPan={sheetPan}
                  onPanEnd={sheetPanEnd}
                  className="relative z-30 flex shrink-0 touch-none items-center gap-3 px-6 pb-3"
                >
                  <HeaderMorphWrap sheetY={sheetY} miniRef={miniArtRef} H={H}>
                    <motion.div
                      layoutId="m-art"
                      transition={SHEET_SPRING}
                      style={{ borderRadius: 10 }}
                      className="relative h-14 w-14 shrink-0 cursor-pointer overflow-hidden bg-zinc-800 shadow-lg ring-1 ring-white/10"
                      onClick={() => setIsLyricsOpen(false)}
                      title="Back to artwork"
                    >
                      {art}
                    </motion.div>
                  </HeaderMorphWrap>

                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING_SOFT, delay: 0.05 }}
                    className="min-w-0 flex-1"
                  >
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
                  </motion.div>
                  <div className="flex shrink-0 items-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
                    <LikeButton circle liked={liked} onToggle={toggleLike} size={16} />
                    <TrackMenu track={currentTrack} onLeave={leaveTo} />
                  </div>
                </motion.div>
              )}

              {/* Middle region: artwork or lyrics view */}
              <motion.div
                className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-6"
                onPan={(_e, info) => {
                  if (!isLyricsOpen && (info.offset.y < -35 || info.velocity.y < -250)) {
                    setIsLyricsOpen(true);
                  }
                }}
              >
                {!isLyricsOpen && (
                  <div
                    className="flex items-center justify-center w-full"
                    style={{
                      width: "min(100%, max(240px, calc(100dvh - 460px)), 420px)",
                      aspectRatio: "1",
                    }}
                  >
                    <motion.div
                      drag="x"
                      dragDirectionLock
                      dragSnapToOrigin
                      dragElastic={0.4}
                      dragMomentum={false}
                      onDragEnd={(_, info) => {
                        if (info.offset.x < -60 || info.velocity.x < -400) handleNext();
                        else if (info.offset.x > 60 || info.velocity.x > 400) handlePrev();
                      }}
                      onPan={(_e, info) => {
                        // Swipe up on the artwork opens lyrics
                        if (info.offset.y < -35 || info.velocity.y < -250) {
                          setIsLyricsOpen(true);
                        }
                      }}
                      onTap={() => setIsLyricsOpen(true)}
                      className="h-full w-full cursor-pointer"
                    >
                      <MorphWrap sheetY={sheetY} miniRef={miniArtRef} H={H} paused={!isPlaying}>
                        <motion.div
                          layoutId="m-art"
                          transition={SHEET_SPRING}
                          style={{ borderRadius: BIG_R }}
                          className="relative h-full w-full overflow-hidden"
                        >
                          {art}
                        </motion.div>
                      </MorphWrap>
                    </motion.div>
                  </div>
                )}

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

              {/* Bottom block: track info, seekbar, playback actions */}
              <div className="relative z-10 shrink-0 px-6 pb-[calc(env(safe-area-inset-bottom,0px)+18px)] pt-2">
                {!isLyricsOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={SPRING_SOFT}
                    className={cn(
                      "ps-t-soft mb-3 flex items-center gap-3",
                      hideMeta ? "ps-hide" : "pointer-events-auto"
                    )}
                    style={{ transform: hideMeta ? "translate3d(0,10px,0)" : "translate3d(0,0,0)" }}
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

                {/* Scrubber / Progress */}
                <div
                  className={cn(
                    "ps-t-soft mx-auto w-full max-w-[420px]",
                    hideScrubber ? "ps-hide" : "pointer-events-auto"
                  )}
                  style={{ transform: hideScrubber ? "translate3d(0,14px,0)" : "translate3d(0,0,0)" }}
                >
                  <MobileScrubber isLyricsOpen={isLyricsOpen} />
                </div>

                {/* Transport Buttons */}
                <div
                  className={cn(
                    "ps-t-soft mx-auto w-full max-w-[420px]",
                    hideTransport ? "ps-hide" : "pointer-events-auto"
                  )}
                  style={{
                    transform: hideTransport
                      ? "translate3d(0,22px,0) scale(0.97)"
                      : "translate3d(0,0,0) scale(1)",
                  }}
                >
                  <div className="mt-3 flex items-center justify-between">
                    <PlateButton
                      size={42}
                      active={isShuffled}
                      onClick={toggleShuffle}
                      title={`Shuffle: ${isShuffled ? "On" : "Off"}`}
                    >
                      <SFShuffle size={19} />
                    </PlateButton>
                    <SpringButton onClick={handlePrev} className="h-14 w-14 text-white" title="Previous">
                      <SwiftUIBackward size={34} fill="currentColor" />
                    </SpringButton>
                    <PlayPauseButton
                      isPlaying={isPlaying}
                      onToggle={togglePlay}
                      size={52}
                      className="h-[68px] w-[68px]"
                    />
                    <SpringButton onClick={handleNext} className="h-14 w-14 text-white" title="Next">
                      <SwiftUIForward size={34} fill="currentColor" />
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
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </LayoutGroup>
    </MotionConfig>
  );
}
