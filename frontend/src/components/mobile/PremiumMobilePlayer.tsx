"use client";

import React, { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  motionValue,
  MotionConfig,
  useDragControls,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { cn, getTrackCover, getArtistTarget } from "@/lib/utils";
import { MobileScrubber, MiniPlayerProgress } from "./../player/PlayerProgress";
import { DynamicBackground } from "../shared/DynamicBackground";
import { LyricsView } from "../shared/LyricsView";
import {
  FONT_STACK, SHEET_SPRING, SPRING, SPRING_SOFT,
  GlassButton, LikeButton, Marquee, PlateButton, PlayPauseButton, PlayerStyles, SpringButton,
  SFFx, SFLyrics, SFMore, SFRepeat, SFShuffle,
  useIdle, useTrackLike,
} from "@/components/player/PlayerKit";

/* ------------------------------------------------------------------ */
/*  Cover loading: swap the shown art only once it's decoded           */
/*  (no flash of the old image under the new track's animation)        */
/* ------------------------------------------------------------------ */
const imageCache = new Set<string>();

function useShownCover(track: any) {
  const cover: string = track ? getTrackCover(track) : "";
  const [shown, setShown] = useState({ id: track?.id as string | undefined, cover });

  useEffect(() => {
    if (!track) return;
    let dead = false;
    const commit = () => !dead && setShown({ id: track.id, cover });
    if (!cover || imageCache.has(cover)) {
      commit();
      return () => { dead = true; };
    }
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
/*  MorphWrap: the mini-player artwork physically grows into the big   */
/*  artwork. Its position/scale are derived from the sheet's own       */
/*  y motion value, so it follows opening, closing AND finger-drag.    */
/* ------------------------------------------------------------------ */
function MorphWrap({
  sheetY, miniRef, H, style, children, onPointerDown,
}: {
  sheetY: MotionValue<number>;
  miniRef: React.RefObject<HTMLDivElement>;
  H: number;
  style: React.CSSProperties;
  children: React.ReactNode;
  onPointerDown?: React.PointerEventHandler;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const geo = useRef<{ dx: number; dy: number; sr: number } | null>(null);
  const x = useMotionValue(0), y = useMotionValue(0), s = useMotionValue(1);

  const update = useCallback((v: number) => {
    const g = geo.current;
    if (!g) return;
    const q = Math.min(1, Math.max(0, v / H)); // 1 = fully closed, 0 = fully open
    x.set(g.dx * q);
    y.set(g.dy * q - v);
    s.set(1 + (g.sr - 1) * q);
  }, [H, x, y, s]);

  useMotionValueEvent(sheetY, "change", update);

  useLayoutEffect(() => {
    const el = ref.current, mini = miniRef.current;
    if (!el || !mini) return;
    const r = el.getBoundingClientRect();
    const m = mini.getBoundingClientRect();
    if (!r.width || !m.width) return;
    geo.current = { dx: m.left - r.left, dy: m.top - (r.top - sheetY.get()), sr: m.width / r.width };
    update(sheetY.get());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div ref={ref} style={{ ...style, x, y, scale: s, transformOrigin: "0 0" }} onPointerDown={onPointerDown}>
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
          className="w-56 bg-zinc-900/90 border-white/10 backdrop-blur-xl rounded-2xl p-2 z-[1200]"
        >
          <DropdownMenuItem onSelect={() => usePlayerStore.getState().addToUserQueue(track)}>
            <ListPlus size={18} className="mr-3 opacity-50 text-brand" />
            <span className="font-medium">Add to Queue</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => refetchTrackAudio(track, showToast)}>
            <RefreshCw size={18} className={cn("mr-3 opacity-50", isRefetching === track?.id && "animate-spin text-brand")} />
            <span className="font-medium">{isRefetching === track?.id ? "Refetching…" : "Refetch Audio"}</span>
          </DropdownMenuItem>
          <RefetchLyricsSubMenu track={track} refetchTrackLyrics={refetchTrackLyrics} showToast={showToast} />
          <DropdownMenuItem
            onSelect={() => {
              const target = getArtistTarget(track);
              if (target) onLeave(target);
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

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */
export function PremiumMobilePlayer({ hidePlayer = false }: { hidePlayer?: boolean }) {
  const router = useRouter();

  // Selectors only. Destructuring the whole player store re-rendered this tree on every time tick.
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

  const userPrefs = useAuthStore((s: any) => s.user?.preferences?.globalPlayerStyle);
  const isGlass = userPrefs !== "classic" && userPrefs !== "solid";

  const { liked, toggle: toggleLike } = useTrackLike(currentTrack?.id);
  const shown = useShownCover(currentTrack);

  const dirRef = useRef(1); // +1 next, -1 prev
  const [isUserScrollingLyrics, setIsUserScrollingLyrics] = useState(false);
  const idle = useIdle(isOpen && isLyricsOpen, 4500);
  const showLyrics = useDeferredValue(isLyricsOpen); // mounts heavy lyrics after the art morph has started
  const hideSecondary = isLyricsOpen && (idle || isUserScrollingLyrics);

  const handleNext = useCallback(() => { dirRef.current = 1; playNext(true); }, [playNext]);
  const handlePrev = useCallback(() => { dirRef.current = -1; playPrev(); }, [playPrev]);
  useEffect(() => { dirRef.current = 1; }, [currentTrack?.id]);

  // lyrics reset to artwork when the song changes (previous behaviour)
  useEffect(() => { if (currentTrack?.id) setIsLyricsOpen(false); }, [currentTrack?.id, setIsLyricsOpen]);

  const leaveTo = useCallback((to: string) => {
    setOpen(false);
    setTimeout(() => router.push(to), 60);
  }, [router, setOpen]);

  /* ── sheet drag (starts only from the grabber/header, so lyrics scroll & sliders never fight it) ── */
  const dragControls = useDragControls();
  const draggedRef = useRef(false);
  const H = useRef(typeof window !== "undefined" ? window.innerHeight : 900).current;
  // fresh motion value (starting closed) + fresh shared-layout namespace for every open
  const sessionRef = useRef(0);
  const wasOpen = useRef(false);
  if (isOpen && !wasOpen.current) sessionRef.current++;
  wasOpen.current = isOpen;
  const session = sessionRef.current;
  const sheetY = useMemo(() => motionValue(H), [session, H]);
  const radius = useTransform(sheetY, [0, 140], [0, 32], { clamp: true });
  const miniArtRef = useRef<HTMLDivElement>(null);
  const startDrag = (e: React.PointerEvent) => dragControls.start(e);

  /* ── mini player gestures ── */
  const panned = useRef(false);

  if (!currentTrack) return null;

  const art = (
    <AnimatePresence mode="popLayout" initial={false} custom={dirRef.current}>
      <motion.img
        key={shown.id}
        src={shown.cover}
        alt=""
        draggable={false}
        custom={dirRef.current}
        variants={{
          enter: (d: number) => ({ opacity: 0, x: d * 56, scale: 1.04 }),
          center: { opacity: 1, x: 0, scale: 1 },
          exit: (d: number) => ({ opacity: 0, x: -d * 56, scale: 0.98 }),
        }}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ x: SPRING_SOFT, scale: SPRING_SOFT, opacity: { duration: 0.24 } }}
        className="absolute inset-0 h-full w-full object-cover pointer-events-none"
      />
    </AnimatePresence>
  );

  return (
    <MotionConfig reducedMotion="user">
      <PlayerStyles />

      {/* ───────────── MINI PLAYER ───────────── */}
      {!hidePlayer && (
        <motion.div
          key="mini-player"
          animate={{ y: isOpen ? 60 : 0, opacity: isOpen ? 0 : 1, scale: isOpen ? 0.94 : 1 }}
          transition={{ y: SHEET_SPRING, scale: SHEET_SPRING, opacity: { duration: isOpen ? 0.16 : 0.28, delay: isOpen ? 0.04 : 0.12 } }}
          onPointerDown={() => { panned.current = false; }}
          onPanStart={() => { panned.current = false; }}
          onPan={(_, i) => { if (Math.abs(i.offset.x) > 6 || Math.abs(i.offset.y) > 6) panned.current = true; }}
          onPanEnd={(_, i) => {
            const { x, y } = i.offset;
            if (Math.abs(x) > Math.abs(y)) {
              if (x < -48) handleNext();
              else if (x > 48) handlePrev();
            } else if (y < -24 || i.velocity.y < -300) setOpen(true);
          }}
          className="fixed z-[300] left-3 right-3 select-none"
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
              "absolute inset-0 rounded-full shadow-[0_8px_28px_rgba(0,0,0,0.45)] border border-white/10",
              isGlass ? "bg-white/[0.07] backdrop-blur-xl" : "bg-[#1c1c1e]"
            )}
            style={isGlass ? { WebkitBackdropFilter: "blur(22px) saturate(1.6)", backdropFilter: "blur(22px) saturate(1.6)" } : undefined}
          />
          <MiniPlayerProgress />

          <div className="relative flex h-full items-center px-3.5">
            <div
              className="flex h-full min-w-0 flex-1 items-center cursor-pointer"
              onClick={() => { if (panned.current) { panned.current = false; return; } setOpen(true); }}
            >
              <div ref={miniArtRef} className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[8px] bg-zinc-800 shadow-md ring-1 ring-white/10">
                {art}
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-center pl-3">
                <Marquee key={`t-${currentTrack.id}`} align="left">
                  <span className="text-[14px] font-semibold leading-[18px] tracking-[-0.01em] text-white">{currentTrack.title}</span>
                </Marquee>
                <Marquee key={`a-${currentTrack.id}`} align="left">
                  <span className="text-[12.5px] leading-[16px] text-white/55" onClick={(e) => e.stopPropagation()}>
                    <ArtistLinks track={currentTrack} maxArtists={3} />
                  </span>
                </Marquee>
              </div>
            </div>

            <div className="relative z-10 flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
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
            animate={{ y: 0 }}
            exit={{ y: H }}
            transition={SHEET_SPRING}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            dragMomentum={false}
            onDragStart={() => { draggedRef.current = true; }}
            onDragEnd={(_, info) => {
              if (info.velocity.y > 420 || info.offset.y > 140) setOpen(false);
            }}
            className="fixed inset-0 z-[1100] flex flex-col select-none"
            style={{
              y: sheetY,
              willChange: "transform",
              fontFamily: FONT_STACK,
              WebkitFontSmoothing: "antialiased",
            }}
          >
            {/* Background — transform/opacity only (no blend modes, no CSS blur) */}
            <motion.div
              className="absolute inset-0 z-0 overflow-hidden bg-[#121214]"
              style={{ transform: "translateZ(0)", borderTopLeftRadius: radius, borderTopRightRadius: radius }}
            >
              <DynamicBackground surface="fullPlayer" coverUrl={shown.cover} />
              <div className="ps-t-soft absolute inset-0 bg-black/25" style={{ opacity: isLyricsOpen ? 1 : 0 }} />
            </motion.div>

            {/* Grabber (drag + tap to close) */}
            <div
              className="relative z-20 flex shrink-0 cursor-grab touch-none items-center justify-center pb-3 pt-[calc(env(safe-area-inset-top,0px)+10px)] active:cursor-grabbing"
              onPointerDown={(e) => { draggedRef.current = false; startDrag(e); }}
              onClick={() => { if (draggedRef.current) { draggedRef.current = false; return; } setOpen(false); }}
            >
              <div className="h-[5px] w-9 rounded-full bg-white/35" />
            </div>

            {/* Compact header — lyrics mode (artwork morphs here) */}
            {isLyricsOpen && (
              <div className="relative z-20 flex shrink-0 touch-none items-center gap-3 px-6 pb-3" onPointerDown={startDrag}>
                <motion.div
                  layoutId="m-art"
                  transition={SHEET_SPRING}
                  style={{ borderRadius: 9 }}
                  className="relative h-14 w-14 shrink-0 cursor-pointer overflow-hidden bg-zinc-800 ring-1 ring-white/10 shadow-lg"
                  onClick={() => setIsLyricsOpen(false)}
                >
                  {art}
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...SPRING_SOFT, delay: 0.05 }}
                  className="min-w-0 flex-1"
                >
                  <Marquee key={`ht-${currentTrack.id}`} align="left">
                    <span className="text-[17px] font-semibold leading-[22px] tracking-[-0.015em] text-white">{currentTrack.title}</span>
                  </Marquee>
                  <Marquee key={`ha-${currentTrack.id}`} align="left">
                    <span className="text-[15px] leading-[20px] text-white/60">
                      <ArtistLinks track={currentTrack} maxArtists={3} onClick={() => setOpen(false)} />
                    </span>
                  </Marquee>
                </motion.div>
                <div className="flex shrink-0 items-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
                  <LikeButton circle liked={liked} onToggle={toggleLike} size={16} />
                  <TrackMenu track={currentTrack} onLeave={leaveTo} />
                </div>
              </div>
            )}

            {/* Middle: artwork or lyrics */}
            <div className="relative z-10 min-h-0 flex-1">
              {!isLyricsOpen && (
                <div
                  className="absolute inset-0 flex touch-none items-center justify-center px-7"
                  onPointerDown={startDrag}
                >
                  <MorphWrap
                    sheetY={sheetY}
                    miniRef={miniArtRef}
                    H={H}
                    style={{ width: "min(100%, max(220px, calc(100dvh - 500px)), 420px)", aspectRatio: "1" }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <motion.div
                      animate={{ scale: isPlaying ? 1 : 0.86 }}
                      transition={{ type: "spring", stiffness: 300, damping: 22, mass: 0.6 }}
                      className="h-full w-full"
                    >
                      <motion.div
                        drag="x"
                        dragSnapToOrigin
                        dragElastic={0.55}
                        dragMomentum={false}
                        onDragEnd={(_, info) => {
                          if (info.offset.x < -70 || info.velocity.x < -450) handleNext();
                          else if (info.offset.x > 70 || info.velocity.x > 450) handlePrev();
                        }}
                        onTap={() => setIsLyricsOpen(true)}
                        className="h-full w-full cursor-pointer"
                      >
                        <motion.div
                          layoutId="m-art"
                          transition={SHEET_SPRING}
                          style={{ borderRadius: 14 }}
                          className="relative h-full w-full overflow-hidden bg-zinc-800 ring-1 ring-white/10 shadow-[0_24px_48px_rgba(0,0,0,0.5)]"
                        >
                          {art}
                        </motion.div>
                      </motion.div>
                    </motion.div>
                  </MorphWrap>
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
                    className="absolute inset-0 px-1"
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Bottom: meta, scrubber, transport, actions */}
            <div className="relative z-10 shrink-0 px-7 pb-[calc(env(safe-area-inset-bottom,0px)+18px)] pt-3">
              {!isLyricsOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_SOFT}
                  className="mb-4 flex items-center gap-3"
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
                            className="cursor-pointer text-[22px] font-semibold leading-[28px] tracking-[-0.02em] text-white"
                            onClick={() => leaveTo(`/track/${currentTrack.id}`)}
                          >
                            {currentTrack.title}
                          </span>
                        </Marquee>
                        <Marquee align="left">
                          <span className="text-[18px] leading-[24px] text-white/60">
                            <ArtistLinks
                              track={currentTrack}
                              maxArtists={3}
                              linkClassName="text-white/60 hover:text-white transition-colors"
                              onClick={() => setOpen(false)}
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

              {/* Scrubber stays put in every state */}
              <div className="mx-auto w-full max-w-[400px]">
                <MobileScrubber isLyricsOpen={isLyricsOpen} />
              </div>

              {/* Transport + actions: fade/slide away while reading lyrics (transform + opacity only) */}
              <div
                className={cn("ps-t-soft mx-auto w-full max-w-[400px]", hideSecondary && "ps-hide")}
                style={{ transform: hideSecondary ? "translate3d(0,22px,0) scale(0.97)" : "translate3d(0,0,0) scale(1)" }}
              >
                <div className="mt-4 flex items-center justify-between">
                  <PlateButton size={42} active={isShuffled} onClick={toggleShuffle} title={`Shuffle: ${isShuffled ? "On" : "Off"}`}>
                    <SFShuffle size={19} />
                  </PlateButton>

                  <SpringButton onClick={handlePrev} className="h-14 w-14 text-white" title="Previous">
                    <SwiftUIBackward size={34} fill="currentColor" />
                  </SpringButton>

                  <PlayPauseButton isPlaying={isPlaying} onToggle={togglePlay} size={52} className="h-[68px] w-[68px]" />

                  <SpringButton onClick={handleNext} className="h-14 w-14 text-white" title="Next">
                    <SwiftUIForward size={34} fill="currentColor" />
                  </SpringButton>

                  <PlateButton size={42} active={repeatMode !== "off"} onClick={toggleRepeat} title={`Repeat: ${repeatMode}`} className="relative">
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

                <div className="mx-auto mt-6 flex max-w-[300px] items-center justify-between">
                  <PlateButton size={44} active={isAudioFxOpen} onClick={() => setAudioFxOpen(!isAudioFxOpen)} title="Studio FX">
                    <SFFx size={22} />
                  </PlateButton>
                  <PlateButton size={44} active={isLyricsOpen} onClick={() => setIsLyricsOpen(!isLyricsOpen)} title="Lyrics">
                    <SFLyrics size={22} />
                  </PlateButton>
                  <PlateButton size={44} active={isQueueOpen} onClick={() => setIsQueueOpen(!isQueueOpen)} title="Queue">
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
