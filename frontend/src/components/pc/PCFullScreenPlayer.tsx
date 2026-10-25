"use client";

import React, { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { useRouter } from "next/navigation";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { useReactiveBgStore } from "@/store/reactiveBgStore";
import api from "@/lib/api";
import { SwiftUIForward, SwiftUIBackward, SwiftUIQueue } from "@/components/ui/SwiftUIIcons";
import { ArtistLinks } from "@/components/shared/ArtistLinks";
import { cn, cleanTitle, getTrackCover } from "@/lib/utils";
import { DynamicBackground } from "../shared/DynamicBackground";
import { LyricsView } from "../shared/LyricsView";
import { PCFullScreenScrubber } from "./../player/PlayerProgress";
import {
  FONT_STACK, SHEET_SPRING, SPRING, SPRING_SOFT,
  GlassButton, LikeButton, Marquee, PlateButton, PlayPauseButton, PlayerStyles, SpringButton,
  SFClose, SFFx, SFLyrics, SFMinimize, SFRepeat, SFShuffle,
  useAutoHideIdle, useTrackLike,
} from "@/components/player/PlayerKit";

const PANEL_W = 520;
const LEFT_GUTTER = 72;

export function PCFullScreenPlayer() {
  const router = useRouter();

  const setFullScreenPlayerOpen = useUIStore((s) => s.setFullScreenPlayerOpen);
  const isLyricsOpen = useUIStore((s) => s.isLyricsOpen);
  const setIsLyricsOpen = useUIStore((s) => s.setIsLyricsOpen);
  const isQueueOpen = useUIStore((s) => s.isQueueOpen);
  const setIsQueueOpen = useUIStore((s) => s.setIsQueueOpen);
  const isAudioFxOpen = useUIStore((s) => s.isAudioFxOpen);
  const setAudioFxOpen = useUIStore((s) => s.setAudioFxOpen);
  const showReactiveBg = useReactiveBgStore((s) => s.player);

  // Selectors: this screen must not re-render on every playback tick
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const playNext = usePlayerStore((s) => s.playNext);
  const playPrev = usePlayerStore((s) => s.playPrev);
  const isShuffled = usePlayerStore((s) => s.isShuffled);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const repeatMode = usePlayerStore((s) => s.repeatMode);
  const toggleRepeat = usePlayerStore((s) => s.toggleRepeat);

  const { liked, toggle: toggleLike } = useTrackLike(currentTrack?.id);

  const close = useCallback(() => setFullScreenPlayerOpen(false), [setFullScreenPlayerOpen]);
  const idle = useAutoHideIdle(true, 5000); // honours Settings → "Hide details when idle"
  const showLyrics = useDeferredValue(isLyricsOpen);

  const dirRef = useRef(1);
  const handleNext = useCallback(() => { dirRef.current = 1; playNext(true); }, [playNext]);
  const handlePrev = useCallback(() => { dirRef.current = -1; playPrev(); }, [playPrev]);
  useEffect(() => { dirRef.current = 1; }, [currentTrack?.id]);

  /* Palette sync for the reactive background (unchanged logic) */
  useEffect(() => {
    if (!currentTrack || (currentTrack as any).palette) return;
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts >= 3) clearInterval(interval);
      try {
        const res = await api.get(`/tracks/${currentTrack.id}`);
        if (res.data?.palette) {
          usePlayerStore.getState().updateCurrentTrackData?.(res.data);
          clearInterval(interval);
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [currentTrack?.id, (currentTrack as any)?.palette]);

  /* Keyboard: Esc closes, Space play/pause, ←/→ prev/next (ignored while typing) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "Escape") close();
      else if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      else if (e.key === "ArrowRight" && e.shiftKey) handleNext();
      else if (e.key === "ArrowLeft" && e.shiftKey) handlePrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, togglePlay, handleNext, handlePrev]);

  /* Prevent overscroll / pull-to-refresh on touch devices */
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.classList.add("fullview-player-open");
    body.classList.add("fullview-player-open");
    return () => {
      html.classList.remove("fullview-player-open");
      body.classList.remove("fullview-player-open");
    };
  }, []);

  const trackCover = currentTrack ? getTrackCover(currentTrack) : "/logo.png";
  if (!currentTrack) return null;

  const fade = idle ? "ps-hide" : "";

  return (
    <MotionConfig reducedMotion="user">
      <PlayerStyles />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.34, ease: [0.32, 0.72, 0, 1] }}
        style={{ zIndex: 850, fontFamily: FONT_STACK, WebkitFontSmoothing: "antialiased" }}
        className="fixed inset-0 overflow-hidden bg-[#121214] select-none isolate"
      >
        {/* Background — clicking empty space minimizes (same as before) */}
        <div className="absolute inset-0 z-0 bg-[#121214]" onClick={close}>
          {showReactiveBg && (
            <>
              <DynamicBackground surface="fullPlayer" coverUrl={trackCover} />
              {/* plain alpha veil (the old mix-blend-overlay forced an extra full-screen blend pass) */}
              <div className="ps-t-soft pointer-events-none absolute inset-0 bg-black/20" style={{ opacity: isLyricsOpen ? 1 : 0 }} />
            </>
          )}
        </div>

        {/* Window controls — frosted circles, fade when idle */}
        <div className={cn("ps-t-soft absolute right-8 top-7 z-50 flex items-center gap-2.5", fade)}>
          <GlassButton className="h-9 w-9" onClick={close} title="Minimize to player bar">
            <SFMinimize size={16} />
          </GlassButton>
          <GlassButton
            className="h-9 w-9"
            title="Close player"
            onClick={() => {
              close();
              usePlayerStore.setState({ currentTrack: null, isPlaying: false, queue: [], originalQueue: [] });
            }}
          >
            <SFClose size={15} />
          </GlassButton>
        </div>

        {/* Content layer lets empty space fall through to the backdrop */}
        <div className="pointer-events-none absolute inset-0 z-10">
          {/* Row: centred when reading the cover, left gutter when lyrics are open.
              Every child uses framer layout, so position AND artwork size resolve with the same spring. */}
          <div
            className="flex h-full items-center"
            style={{ paddingLeft: isLyricsOpen ? LEFT_GUTTER : 0, justifyContent: isLyricsOpen ? "flex-start" : "center" }}
          >
            <motion.div
              layout="position"
              transition={{ layout: SHEET_SPRING }}
              className="pointer-events-auto flex flex-col items-stretch"
              style={{ width: `min(${PANEL_W}px, 86vw)` }}
            >
              {/* Artwork — same layoutId as the PC player bar thumbnail, so the bar art grows into this and back */}
              <div className="flex justify-center">
                <motion.div
                  animate={{ scale: isPlaying ? 1 : 0.88, opacity: isPlaying ? 1 : 0.92 }}
                  transition={{ type: "spring", stiffness: 300, damping: 22, mass: 0.6 }}
                >
                  <motion.div
                    layout
                    layoutId="pc-art"
                    transition={{ layout: SHEET_SPRING }}
                    style={{
                      borderRadius: 12,
                      width: isLyricsOpen ? "clamp(230px, 40vh, 400px)" : "clamp(230px, 42vh, 420px)",
                      aspectRatio: "1",
                    }}
                    className="relative overflow-hidden bg-zinc-800 ring-1 ring-white/10 shadow-[0_28px_60px_rgba(0,0,0,0.55)]"
                  >
                    <AnimatePresence mode="popLayout" initial={false} custom={dirRef.current}>
                      <motion.img
                        key={currentTrack.id}
                        src={trackCover}
                        alt={currentTrack.title}
                        draggable={false}
                        custom={dirRef.current}
                        variants={{
                          enter: (d: number) => ({ opacity: 0, x: d * 80, scale: 1.04 }),
                          center: { opacity: 1, x: 0, scale: 1 },
                          exit: (d: number) => ({ opacity: 0, x: -d * 80, scale: 0.98 }),
                        }}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ x: SPRING_SOFT, scale: SPRING_SOFT, opacity: { duration: 0.24 } }}
                        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                      />
                    </AnimatePresence>
                    <button
                      aria-label={isLyricsOpen ? "Hide lyrics" : "Show lyrics"}
                      onClick={() => setIsLyricsOpen(!isLyricsOpen)}
                      className="absolute inset-0 h-full w-full cursor-pointer bg-transparent outline-none"
                    />
                  </motion.div>
                </motion.div>
              </div>

              {/* Title / artist — collapses smoothly when idle so seekbar glides up */}
              <motion.div
                layout
                animate={{
                  height: idle ? 0 : "auto",
                  opacity: idle ? 0 : 1,
                  marginTop: idle ? 0 : (isLyricsOpen ? 24 : 32),
                }}
                transition={{
                  height: { type: "spring", stiffness: 300, damping: 30 },
                  opacity: { duration: 0.25 },
                  marginTop: { type: "spring", stiffness: 300, damping: 30 },
                  layout: SHEET_SPRING,
                }}
                className="overflow-hidden text-center"
                style={{ pointerEvents: idle ? "none" : "auto" }}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={currentTrack.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Marquee align="center">
                      <span
                        className="cursor-pointer text-[26px] font-semibold leading-[32px] tracking-[-0.022em] text-white hover:underline"
                        onClick={() => { close(); router.push(`/track/${currentTrack.id}`); }}
                      >
                        {cleanTitle(currentTrack.title)}
                      </span>
                    </Marquee>
                    <Marquee align="center">
                      <span className="text-[17px] leading-[24px] text-white/60">
                        <ArtistLinks
                          track={currentTrack}
                          maxArtists={3}
                          linkClassName="text-white/60 hover:text-white hover:underline transition-colors"
                          onClick={close}
                        />
                      </span>
                    </Marquee>
                  </motion.div>
                </AnimatePresence>
              </motion.div>

              {/* Scrubber — glides up right below artwork when idle */}
              <motion.div
                layout
                animate={{
                  marginTop: idle ? (isLyricsOpen ? 12 : 16) : 24,
                }}
                transition={{
                  layout: SHEET_SPRING,
                  marginTop: { type: "spring", stiffness: 300, damping: 30 },
                }}
                className="mx-auto w-full max-w-[400px]"
              >
                <PCFullScreenScrubber isLyricsOpen={isLyricsOpen} />
              </motion.div>

              {/* Controls — re-ordered with heart on the left and play/pause perfectly centered */}
              <motion.div
                layout
                animate={{
                  height: idle ? 0 : "auto",
                  opacity: idle ? 0 : 1,
                  marginTop: idle ? 0 : 20,
                }}
                transition={{
                  height: { type: "spring", stiffness: 300, damping: 30 },
                  opacity: { duration: 0.22 },
                  marginTop: { type: "spring", stiffness: 300, damping: 30 },
                  layout: SHEET_SPRING,
                }}
                className="mx-auto w-full max-w-[460px] overflow-hidden"
                style={{ pointerEvents: idle ? "none" : "auto" }}
              >
                <div className="grid h-14 w-full grid-cols-[1fr_auto_1fr] items-center">
                  {/* Left: Like (Heart), Shuffle, Repeat */}
                  <div className="flex items-center justify-end gap-1.5">
                    <LikeButton liked={liked} onToggle={toggleLike} size={18} className="h-9 w-9 !p-0" />
                    <PlateButton size={36} active={isShuffled} onClick={toggleShuffle} title={`Shuffle: ${isShuffled ? "On" : "Off"}`}>
                      <SFShuffle size={17} />
                    </PlateButton>
                    <PlateButton size={36} active={repeatMode !== "off"} onClick={toggleRepeat} title={`Repeat: ${repeatMode}`} className="relative">
                      <SFRepeat size={17} />
                      <AnimatePresence>
                        {(repeatMode === "one" || repeatMode === "two") && (
                          <motion.span
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={SPRING}
                            className="pointer-events-none absolute inset-0 flex items-center justify-center text-[6px] font-black"
                          >
                            {repeatMode === "one" ? "1" : "2"}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </PlateButton>
                  </div>

                  {/* Center: Prev, Play/Pause, Next */}
                  <div className="flex items-center justify-center gap-3 px-4">
                    <SpringButton onClick={handlePrev} className="p-1 text-white/90 transition-colors hover:text-white" title="Previous">
                      <SwiftUIBackward size={26} fill="currentColor" />
                    </SpringButton>
                    <PlayPauseButton isPlaying={isPlaying} onToggle={togglePlay} size={36} />
                    <SpringButton onClick={handleNext} className="p-1 text-white/90 transition-colors hover:text-white" title="Next">
                      <SwiftUIForward size={26} fill="currentColor" />
                    </SpringButton>
                  </div>

                  {/* Right: Studio FX, Lyrics, Queue */}
                  <div className="flex items-center justify-start gap-1.5">
                    <PlateButton size={36} active={isAudioFxOpen} onClick={() => setAudioFxOpen(!isAudioFxOpen)} title="Studio FX">
                      <SFFx size={18} />
                    </PlateButton>
                    <PlateButton size={36} active={isLyricsOpen} onClick={() => setIsLyricsOpen(!isLyricsOpen)} title="Lyrics">
                      <SFLyrics size={18} />
                    </PlateButton>
                    <PlateButton size={36} active={isQueueOpen} onClick={() => setIsQueueOpen(!isQueueOpen)} title="Queue">
                      <SwiftUIQueue size={18} stroke="currentColor" />
                    </PlateButton>
                  </div>
                </div>
              </motion.div>

              {/* Lossless badge */}
              <motion.div
                layout
                animate={{
                  height: idle ? 0 : "auto",
                  opacity: idle ? 0 : 0.3,
                  marginTop: idle ? 0 : 12,
                }}
                transition={{
                  height: { type: "spring", stiffness: 300, damping: 30 },
                  opacity: { duration: 0.2 },
                  marginTop: { type: "spring", stiffness: 300, damping: 30 },
                  layout: SHEET_SPRING,
                }}
                className="flex justify-center overflow-hidden"
              >
                <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5">
                  <div className="flex items-center gap-[1px]">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-1.5 w-[1px] rounded-full bg-white" />
                    ))}
                  </div>
                  <span className="text-[8px] font-semibold tracking-[0.14em] text-white">Lossless</span>
                </div>
              </motion.div>
            </motion.div>
          </div>

          {/* RIGHT PANEL — lyrics (transform + opacity only; mounted a beat after the slide begins) */}
          <AnimatePresence>
            {isLyricsOpen && showLyrics && (
              <motion.div
                key="lyrics-panel"
                initial={{ opacity: 0, x: 56 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 36 }}
                transition={{ x: SPRING_SOFT, opacity: { duration: 0.3 } }}
                className="pointer-events-auto absolute bottom-12 right-14 top-24 max-w-3xl"
                style={{ left: `${LEFT_GUTTER + PANEL_W + 64}px` }}
              >
                <LyricsView
                  trackId={currentTrack.id}
                  title={cleanTitle(currentTrack.title)}
                  artist={currentTrack.artist?.name}
                  rawLyrics={currentTrack.lyrics}
                  isLyricsOpen={isLyricsOpen}
                  isFullscreen={true}
                  transparent={showReactiveBg}
                  onClose={() => setIsLyricsOpen(false)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </MotionConfig>
  );
}
