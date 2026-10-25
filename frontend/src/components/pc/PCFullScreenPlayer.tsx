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
  FONT_STACK, SPRING, SPRING_SOFT,
  GlassButton, LikeButton, Marquee, PlateButton, PlayPauseButton, PlayerStyles, SpringButton,
  SFClose, SFFx, SFLyrics, SFMinimize, SFRepeat, SFShuffle,
  useIdle, useTrackLike,
} from "@/components/player/PlayerKit";

const PANEL_W = 440;
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
  const idle = useIdle(true, 5000);
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

  const trackCover = currentTrack ? getTrackCover(currentTrack) : "/logo.png";
  if (!currentTrack) return null;

  const fade = idle ? "ps-hide" : "";

  return (
    <MotionConfig reducedMotion="user">
      <PlayerStyles />
      <motion.div
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.985 }}
        transition={{ scale: SPRING_SOFT, opacity: { duration: 0.28 } }}
        style={{ zIndex: 850, fontFamily: FONT_STACK, WebkitFontSmoothing: "antialiased", willChange: "transform, opacity" }}
        className="fixed inset-0 overflow-hidden bg-[#121214] select-none isolate"
      >
        {/* Background — clicking empty space minimizes (same as before) */}
        <div className="absolute inset-0 z-0 bg-[#121214]" onClick={close}>
          {showReactiveBg && (
            <>
              <DynamicBackground surface="fullPlayer" coverUrl={trackCover} palette={currentTrack?.palette} />
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
          {/* LEFT PANEL — slides from centre to the left gutter on the compositor with a real spring */}
          <div
            className="ps-t-soft pointer-events-auto absolute left-1/2 top-1/2 flex flex-col items-stretch"
            style={{
              width: `min(${PANEL_W}px, 86vw)`,
              transform: isLyricsOpen
                ? `translate3d(calc(${LEFT_GUTTER}px - 50vw), -50%, 0)`
                : "translate3d(-50%, -50%, 0)",
            }}
          >
            {/* Artwork */}
            <div className="flex justify-center">
              <div
                className="ps-t-soft"
                style={{ transform: isLyricsOpen ? "scale(0.88)" : "scale(1)" }}
              >
                <motion.div
                  animate={{ scale: isPlaying ? 1 : 0.88, opacity: isPlaying ? 1 : 0.9 }}
                  transition={{ type: "spring", stiffness: 300, damping: 22, mass: 0.6 }}
                  className="relative overflow-hidden rounded-[12px] bg-zinc-800 ring-1 ring-white/10 shadow-[0_28px_60px_rgba(0,0,0,0.55)]"
                  style={{ width: "clamp(240px, 42vh, 400px)", aspectRatio: "1" }}
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
                      className="absolute inset-0 h-full w-full object-cover pointer-events-none"
                    />
                  </AnimatePresence>
                  {!isLyricsOpen && (
                    <button
                      aria-label="Show lyrics"
                      onClick={() => setIsLyricsOpen(true)}
                      className="absolute inset-0 h-full w-full cursor-pointer bg-transparent outline-none"
                    />
                  )}
                </motion.div>
              </div>
            </div>

            {/* Title / artist */}
            <div className={cn("ps-t-soft mt-9 text-center", fade)} style={{ transform: idle ? "translate3d(0,-14px,0)" : "translate3d(0,0,0)" }}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={currentTrack.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <Marquee>
                    <span
                      className="cursor-pointer text-[26px] font-semibold leading-[32px] tracking-[-0.022em] text-white hover:underline"
                      onClick={() => { close(); router.push(`/track/${currentTrack.id}`); }}
                    >
                      {cleanTitle(currentTrack.title)}
                    </span>
                  </Marquee>
                  <Marquee>
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
            </div>

            {/* Scrubber — always visible */}
            <div className="mx-auto mt-6 w-full max-w-[400px]">
              <PCFullScreenScrubber isLyricsOpen={isLyricsOpen} />
            </div>

            {/* Controls — same layout & icons as the PC player bar */}
            <div
              className={cn("ps-t-soft mx-auto mt-5 grid h-14 w-full max-w-[460px] grid-cols-[1fr_auto_1fr] items-center", fade)}
              style={{ transform: idle ? "translate3d(0,14px,0)" : "translate3d(0,0,0)" }}
            >
              <div className="flex items-center justify-end gap-1">
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

              <div className="flex items-center justify-center gap-3 px-3">
                <SpringButton onClick={handlePrev} className="p-1 text-white/90 hover:text-white transition-colors" title="Previous">
                  <SwiftUIBackward size={28} fill="currentColor" />
                </SpringButton>
                <PlayPauseButton isPlaying={isPlaying} onToggle={togglePlay} size={40} />
                <SpringButton onClick={handleNext} className="p-1 text-white/90 hover:text-white transition-colors" title="Next">
                  <SwiftUIForward size={28} fill="currentColor" />
                </SpringButton>
              </div>

              <div className="flex items-center justify-start gap-1">
                <LikeButton liked={liked} onToggle={toggleLike} size={18} className="h-9 w-9 !p-0" />
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

            {/* Lossless badge */}
            <div className={cn("ps-t-soft mt-3 flex justify-center", fade)} style={{ opacity: idle ? 0 : 0.28 }}>
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5">
                <div className="flex items-center gap-[1px]">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-1.5 w-[1px] rounded-full bg-white" />
                  ))}
                </div>
                <span className="text-[8px] font-semibold tracking-[0.14em] text-white">Lossless</span>
              </div>
            </div>
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
                style={{
                  left: `${LEFT_GUTTER + PANEL_W + 64}px`,
                  maskImage: "linear-gradient(to bottom, transparent 0, #000 36px, #000 calc(100% - 56px), transparent 100%)",
                  WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 36px, #000 calc(100% - 56px), transparent 100%)",
                }}
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

export default PCFullScreenPlayer;
