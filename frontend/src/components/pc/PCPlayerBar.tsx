"use client";

import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import {
  SwiftUIPlay,
  SwiftUIPause,
  SwiftUIShuffle,
  SwiftUIRepeat,
  SwiftUIForward,
  SwiftUIBackward,
  SwiftUIQueue,
} from "@/components/ui/SwiftUIIcons";
import { cn, cleanTitle, getTrackCover, formatDisplayTitle } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig, type HTMLMotionProps } from "framer-motion";
import * as Slider from "@radix-ui/react-slider";
import { audioEngine } from "@/lib/audio-engine";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { ArtistLinks } from "@/components/shared/ArtistLinks";
import { applyArtworkTheme, extractArtworkAverageColor } from "@/lib/theme";

/* ------------------------------------------------------------------ */
/*  Motion tokens                                                      */
/* ------------------------------------------------------------------ */
const SPRING = { type: "spring", stiffness: 520, damping: 30, mass: 0.7 } as const; // buttons, pops
const SPRING_SOFT = { type: "spring", stiffness: 380, damping: 34, mass: 0.8 } as const; // scrubber expand
const EASE_OUT = "cubic-bezier(0.32, 0.72, 0, 1)"; // Apple-style ease for CSS transitions

const formatDuration = (s?: number | null) => {
  if (!s || isNaN(s)) return "0:00";
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

/* ------------------------------------------------------------------ */
/*  SF Symbols-style icons (for the ones that weren't SwiftUI icons)   */
/* ------------------------------------------------------------------ */
type IconProps = { size?: number; className?: string };

const SFHeart = ({ size = 16, filled, className }: IconProps & { filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 21s-7-4.35-9.5-9C.9 8.6 2.6 4.5 6.5 4.5c2.1 0 3.9 1.1 5.5 3.2 1.6-2.1 3.4-3.2 5.5-3.2 3.9 0 5.6 4.1 4 7.5-2.5 4.65-9.5 9-9.5 9z" />
  </svg>
);

const SFLyrics = ({ size = 16, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
    <path d="M8 9h8M8 12.5h5" />
  </svg>
);

const SFFx = ({ size = 16, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className={className}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </svg>
);

const SFExpand = ({ size = 15, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
  </svg>
);

const SFSpeaker = ({ size = 16, level = 1, className }: IconProps & { level?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" fill="currentColor" />
    {level === 0 ? (
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    ) : (
      <>
        <path d="M15.5 9a4 4 0 0 1 0 6" />
        {level > 0.5 && <path d="M18.2 6.5a8 8 0 0 1 0 11" />}
      </>
    )}
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Spring button: hover grows, press squishes                         */
/* ------------------------------------------------------------------ */
function SpringButton({ className, ...props }: HTMLMotionProps<"button">) {
  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.86 }}
      transition={SPRING}
      className={cn("flex items-center justify-center outline-none cursor-pointer", className)}
      {...props}
    />
  );
}

export function PCPlayerBar() {
  const router = useRouter();
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const playNext = usePlayerStore((state) => state.playNext);
  const playPrev = usePlayerStore((state) => state.playPrev);
  const volume = usePlayerStore((state) => state.volume);
  const setVolume = usePlayerStore((state) => state.setVolume);
  const isShuffled = usePlayerStore((state) => state.isShuffled);
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);
  const repeatMode = usePlayerStore((state) => state.repeatMode);
  const toggleRepeat = usePlayerStore((state) => state.toggleRepeat);
  const duration = usePlayerStore((state) => state.duration);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const setCurrentTime = usePlayerStore((state) => state.setCurrentTime);

  const {
    isPlayerMinimized,
    setPlayerMinimized,
    setFullScreenPlayerOpen,
    isAudioFxOpen,
    setAudioFxOpen,
    isQueueOpen,
    setIsQueueOpen,
    isLyricsOpen,
    setIsLyricsOpen,
  } = useUIStore();
  const queryClient = useQueryClient();

  // Local scrub state
  const [localTime, setLocalTime] = useState(currentTime);
  const lastSeekTime = useRef(0);

  // Apple Music style: hovering/dragging the seekbar expands it and hides the track info
  const [isScrubHover, setIsScrubHover] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const scrubExpanded = isScrubHover || isDragging;

  useEffect(() => {
    if (Date.now() - lastSeekTime.current > 400) {
      setLocalTime(currentTime);
    }
  }, [currentTime]);

  // Release drag state even if the pointer is released outside the slider
  useEffect(() => {
    if (!isDragging) return;
    const end = () => setIsDragging(false);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [isDragging]);

  const performSeek = (targetSec: number) => {
    lastSeekTime.current = Date.now();
    if (!duration || duration <= 0) return;
    const clampedTime = Math.max(0, Math.min(targetSec, Math.max(0, duration - 1.0)));
    setLocalTime(clampedTime);
    setCurrentTime(clampedTime);

    const audio = audioEngine.getActiveAudioElement();
    if (audio) {
      try {
        audio.currentTime = clampedTime;
        const targetVol = usePlayerStore.getState().volume ?? 1;
        audioEngine.setVolume(targetVol);
      } catch (e) {
        console.warn("Seek error:", e);
      }
    }
  };

  const safeMax = duration && duration > 0 ? duration : 1;
  const remaining = Math.max(0, (duration || 0) - localTime);

  // Dynamically extract artwork color and tint theme variables
  useEffect(() => {
    if (!currentTrack) return;
    const cover = getTrackCover(currentTrack);
    if (!cover) return;
    extractArtworkAverageColor(cover).then((rgb) => {
      if (rgb) {
        applyArtworkTheme(rgb[0], rgb[1], rgb[2]);
      }
    });
  }, [currentTrack?.id]);

  // Like state for the current track
  const { data: likedTrackIds } = useQuery({
    queryKey: ["liked-track-ids"],
    queryFn: async () => {
      const res = await api.get("tracks/liked");
      const arr = Array.isArray(res.data) ? res.data : res.data?.items || [];
      return arr.map((t: any) => t.id);
    },
    staleTime: 1000 * 60 * 5,
  });
  const isCurrentTrackLiked = currentTrack ? likedTrackIds?.includes(currentTrack.id) : false;

  const toggleLikeMutation = useMutation({
    mutationFn: async () => {
      if (!currentTrack) return;
      await api.post(`tracks/${currentTrack.id}/like`);
    },
    onMutate: async () => {
      if (!currentTrack) return;
      await queryClient.cancelQueries({ queryKey: ["liked-track-ids"] });
      const previousLikedIds = queryClient.getQueryData<string[]>(["liked-track-ids"]);
      const newLikedIds = previousLikedIds
        ? previousLikedIds.includes(currentTrack.id)
          ? previousLikedIds.filter((id) => id !== currentTrack.id)
          : [...previousLikedIds, currentTrack.id]
        : [currentTrack.id];
      queryClient.setQueryData(["liked-track-ids"], newLikedIds);
      return { previousLikedIds };
    },
    onError: (err, newTodo, context) => {
      if (context?.previousLikedIds) {
        queryClient.setQueryData(["liked-track-ids"], context.previousLikedIds);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["liked-track-ids"] });
      queryClient.invalidateQueries({ queryKey: ["liked-tracks"] });
    },
  });

  const handleHidePlayer = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const interactive =
      target.closest("button") ||
      target.closest('[role="slider"]') ||
      target.closest("a") ||
      target.closest(".slider-root");
    if (interactive) return;
    setPlayerMinimized(true);
  };

  const inactiveBtn = "text-white/60 hover:text-white transition-colors";
  const activeBtn = "text-brand drop-shadow-md";
  const whiteBtn = "text-white/85 hover:text-white transition-colors";
  // Apple Music highlights active toggles with a soft rounded plate
  const plate = (active: boolean) =>
    cn(
      "rounded-lg transition-[background-color,color] duration-300",
      active ? "bg-white/[0.14] " + activeBtn : "bg-transparent " + inactiveBtn
    );

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {currentTrack && (
          <motion.div
            key="pc-player-bar"
            initial={{ y: 100, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 100, opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 30, mass: 0.9 }}
            onClick={handleHidePlayer}
            style={{ WebkitBackdropFilter: "blur(40px) saturate(180%)" }}
            className={cn(
              "player-capsule w-full max-w-[834px] h-[70px] rounded-full mx-auto px-4 md:px-5",
              "flex items-center justify-between gap-3 relative select-none",
              // Glassmorphism: translucent fill + heavy blur + saturation boost + hairline border + inner highlight
              "bg-[rgba(34,34,36,0.50)] backdrop-blur-[40px] backdrop-saturate-[180%]",
              "border border-white/[0.12]",
              "shadow-[0_20px_50px_-12px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.18),inset_0_0_0_0.5px_rgba(255,255,255,0.06)]"
            )}
          >
            {/* Soft top sheen for the glass look */}
            <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/[0.10] via-transparent to-transparent" />

            {/* 1. Left Playback Controls: Shuffle, Previous, Play/Pause, Next, Repeat */}
            <div className="relative flex items-center gap-2.5 md:gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
              <SpringButton
                onClick={toggleShuffle}
                className={cn("p-1.5", plate(isShuffled))}
                title={`Shuffle: ${isShuffled ? "On" : "Off"}`}
              >
                <SwiftUIShuffle size={16} stroke="currentColor" />
              </SpringButton>

              <SpringButton onClick={playPrev} className={cn("p-1", whiteBtn)} title="Previous">
                <SwiftUIBackward size={18} fill="currentColor" />
              </SpringButton>

              <SpringButton
                onClick={togglePlay}
                className="p-1 text-white hover:text-white/90"
                title={isPlaying ? "Pause" : "Play"}
              >
                <span className="relative flex h-6 w-6 items-center justify-center">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={isPlaying ? "pause" : "play"}
                      initial={{ scale: 0.4, opacity: 0, filter: "blur(4px)" }}
                      animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                      exit={{ scale: 0.4, opacity: 0, filter: "blur(4px)" }}
                      transition={{ ...SPRING, opacity: { duration: 0.15 }, filter: { duration: 0.2 } }}
                      className="absolute flex items-center justify-center"
                    >
                      {isPlaying ? (
                        <SwiftUIPause size={24} fill="currentColor" />
                      ) : (
                        <SwiftUIPlay size={24} fill="currentColor" className="ml-0.5" />
                      )}
                    </motion.span>
                  </AnimatePresence>
                </span>
              </SpringButton>

              <SpringButton onClick={() => playNext(true)} className={cn("p-1", whiteBtn)} title="Next">
                <SwiftUIForward size={18} fill="currentColor" />
              </SpringButton>

              <SpringButton
                onClick={toggleRepeat}
                className={cn("relative p-1.5", plate(repeatMode !== "off"))}
                title={`Repeat: ${repeatMode}`}
              >
                <SwiftUIRepeat size={16} stroke="currentColor" />
                <AnimatePresence>
                  {repeatMode !== "off" && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={SPRING}
                      className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    >
                      <span className="text-[7px] font-black mt-0.5 text-brand">
                        {repeatMode === "one" ? "1" : repeatMode === "two" ? "2" : "∞"}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </SpringButton>
            </div>

            {/* 2. Middle: Glass display card with Artwork, Title, Artist & Integrated Scrubber */}
            <div
              className="relative flex-1 min-w-0 max-w-[340px] md:max-w-[400px] h-[52px] rounded-xl overflow-hidden cursor-pointer group bg-white/[0.08] hover:bg-white/[0.12] backdrop-blur-xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors duration-300"
              onClick={(e) => {
                e.stopPropagation();
                setFullScreenPlayerOpen(true);
                setPlayerMinimized(false);
              }}
            >
              {/* Track info: blurs + fades away while the seekbar is active */}
              <motion.div
                className="absolute inset-x-2.5 top-[5px] h-[30px] flex items-center min-w-0"
                animate={{
                  opacity: scrubExpanded ? 0 : 1,
                  scale: scrubExpanded ? 0.96 : 1,
                  filter: scrubExpanded ? "blur(8px)" : "blur(0px)",
                }}
                transition={{ default: SPRING_SOFT, opacity: { duration: 0.2 }, filter: { duration: 0.25 } }}
                style={{ pointerEvents: scrubExpanded ? "none" : "auto" }}
              >
                <div className="h-7 w-7 rounded-md overflow-hidden shrink-0 bg-zinc-800 shadow-md ring-1 ring-white/10">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.img
                      key={currentTrack.id}
                      src={getTrackCover(currentTrack)}
                      alt="Cover"
                      initial={{ opacity: 0, scale: 1.2 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
                      className="h-full w-full object-cover"
                    />
                  </AnimatePresence>
                </div>

                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={currentTrack.id}
                    initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
                    transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                    className="flex flex-col min-w-0 flex-1 overflow-hidden text-center justify-center px-2"
                  >
                    <span
                      className="text-[13px] md:text-[14px] font-semibold text-white truncate leading-tight tracking-tight hover:underline cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/track/${currentTrack.id}`);
                      }}
                    >
                      {formatDisplayTitle(cleanTitle(currentTrack.title))}
                    </span>
                    <span className="text-[11px] md:text-[12px] font-normal text-white/60 truncate leading-none mt-0.5">
                      <ArtistLinks
                        track={currentTrack}
                        maxArtists={2}
                        linkClassName="hover:underline text-white/60 hover:text-white"
                      />
                    </span>
                  </motion.div>
                </AnimatePresence>

                {/* Spacer keeps the text visually centered against the artwork */}
                <div className="w-7 shrink-0" />
              </motion.div>

              {/* Seekbar layer: thin at the bottom, grows to cover the whole card on hover/drag */}
              <motion.div
                className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 backdrop-blur-2xl"
                initial={false}
                animate={{
                  height: scrubExpanded ? 52 : 20,
                  backgroundColor: scrubExpanded ? "rgba(18,18,20,0.55)" : "rgba(18,18,20,0)",
                }}
                transition={SPRING_SOFT}
                onClick={(e) => e.stopPropagation()}
                onMouseEnter={() => setIsScrubHover(true)}
                onMouseLeave={() => setIsScrubHover(false)}
                onPointerDown={() => setIsDragging(true)}
              >
                <motion.span
                  className="font-medium tabular-nums select-none shrink-0 text-right"
                  animate={{
                    fontSize: scrubExpanded ? 12 : 9,
                    width: scrubExpanded ? 36 : 26,
                    color: scrubExpanded ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.4)",
                  }}
                  transition={SPRING_SOFT}
                >
                  {formatDuration(localTime)}
                </motion.span>

                <Slider.Root
                  className="slider-root relative flex items-center select-none touch-none flex-1 h-full cursor-pointer"
                  value={[Math.min(localTime, safeMax)]}
                  max={safeMax}
                  step={0.1}
                  onValueChange={(val) => {
                    setLocalTime(val[0]);
                    lastSeekTime.current = Date.now();
                  }}
                  onValueCommit={(val) => {
                    performSeek(val[0]);
                    setIsDragging(false);
                  }}
                >
                  <Slider.Track
                    className="relative grow rounded-full overflow-hidden bg-white/20"
                    style={{
                      height: scrubExpanded ? 10 : 3,
                      transition: `height 380ms ${EASE_OUT}`,
                    }}
                  >
                    <Slider.Range
                      className="absolute h-full rounded-full"
                      style={{
                        backgroundColor: scrubExpanded ? "#fff" : "rgba(255,255,255,0.9)",
                        transition: "background-color 300ms",
                      }}
                    />
                  </Slider.Track>
                  <Slider.Thumb className="block w-3 h-3 rounded-full opacity-0 outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white/70" />
                </Slider.Root>

                <motion.span
                  className="font-medium tabular-nums select-none shrink-0 text-left"
                  animate={{
                    fontSize: scrubExpanded ? 12 : 9,
                    width: scrubExpanded ? 40 : 28,
                    color: scrubExpanded ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.4)",
                  }}
                  transition={SPRING_SOFT}
                >
                  -{formatDuration(remaining)}
                </motion.span>
              </motion.div>
            </div>

            {/* 3. Right Action Controls: Like, Studio FX, Lyrics, Queue, Volume, Fullscreen */}
            <div className="relative flex items-center gap-1.5 md:gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
              {/* Like Button (pops with a spring when liked) */}
              <SpringButton
                onClick={() => toggleLikeMutation.mutate()}
                className={cn("p-1.5", isCurrentTrackLiked ? "text-brand" : inactiveBtn)}
                title={isCurrentTrackLiked ? "Unlike" : "Like"}
              >
                <motion.span
                  key={String(isCurrentTrackLiked)}
                  initial={{ scale: isCurrentTrackLiked ? 0.5 : 1 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 600, damping: 12 }}
                  className="flex"
                >
                  <SFHeart size={16} filled={!!isCurrentTrackLiked} />
                </motion.span>
              </SpringButton>

              {/* Studio FX */}
              <SpringButton
                id="tour-fx"
                onClick={() => setAudioFxOpen(!isAudioFxOpen)}
                className={cn("p-1.5", plate(isAudioFxOpen))}
                title="Studio FX"
              >
                <SFFx size={16} />
              </SpringButton>

              {/* Lyrics */}
              <SpringButton
                id="tour-lyrics"
                data-tour="lyrics"
                onClick={() => setIsLyricsOpen(!isLyricsOpen)}
                className={cn("p-1.5", plate(isLyricsOpen))}
                title="Lyrics"
              >
                <SFLyrics size={16} />
              </SpringButton>

              {/* Queue */}
              <SpringButton
                onClick={() => setIsQueueOpen(!isQueueOpen)}
                className={cn("p-1.5", plate(isQueueOpen))}
                title="Queue"
              >
                <SwiftUIQueue size={16} stroke="currentColor" />
              </SpringButton>

              {/* Volume Control */}
              <div className="flex items-center gap-1.5 w-20 md:w-24 group/vol ml-0.5">
                <SpringButton
                  onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
                  className={cn("p-0.5", inactiveBtn)}
                  title={volume === 0 ? "Unmute" : "Mute"}
                >
                  <SFSpeaker size={16} level={volume === 0 ? 0 : volume} />
                </SpringButton>
                <Slider.Root
                  className="slider-root relative flex items-center select-none touch-none w-full h-4 cursor-pointer"
                  value={[volume * 100]}
                  max={100}
                  step={1}
                  onValueChange={([val]) => setVolume(val / 100)}
                >
                  <Slider.Track
                    className="bg-white/20 relative grow rounded-full overflow-hidden h-[3px] group-hover/vol:h-[6px]"
                    style={{ transition: `height 300ms ${EASE_OUT}` }}
                  >
                    <Slider.Range className="absolute bg-white/90 group-hover/vol:bg-white rounded-full h-full transition-colors" />
                  </Slider.Track>
                  <Slider.Thumb className="block w-2.5 h-2.5 rounded-full opacity-0 outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white/70" />
                </Slider.Root>
              </div>

              {/* Fullscreen Expand */}
              <SpringButton
                onClick={() => setFullScreenPlayerOpen(true)}
                className={cn("p-1.5", inactiveBtn)}
                title="Full Screen Player"
              >
                <SFExpand size={15} />
              </SpringButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}