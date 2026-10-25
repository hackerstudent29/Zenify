"use client";

import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import {
  SwiftUIPlay,
  SwiftUIPause,
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
/*  Tokens                                                             */
/* ------------------------------------------------------------------ */
const SPRING = { type: "spring", stiffness: 520, damping: 30, mass: 0.7 } as const;
const SPRING_SOFT = { type: "spring", stiffness: 380, damping: 34, mass: 0.8 } as const;
const EASE_OUT = "cubic-bezier(0.32, 0.72, 0, 1)";

const formatDuration = (s?: number | null) => {
  if (!s || isNaN(s)) return "0:00";
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */
type IconProps = { size?: number; className?: string };

// Apple-style shuffle: two crossing paths with arrowheads on the right
const SFShuffle = ({ size = 19, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 7h2.6c2 0 3.3.9 4.3 2.4l3.2 5.2c1 1.5 2.3 2.4 4.3 2.4H20" />
    <path d="M3 17h2.6c2 0 3.3-.9 4.3-2.4l3.2-5.2c1-1.5 2.3-2.4 4.3-2.4H20" />
    <path d="M17.2 4.4L20.2 7l-3 2.6" />
    <path d="M17.2 14.4L20.2 17l-3 2.6" />
  </svg>
);

// Apple-style repeat: rounded loop with arrowheads top-right and bottom-left
const SFRepeat = ({ size = 19, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 11v-1a3 3 0 0 1 3-3h12.2" />
    <path d="M16.4 4.4L19.4 7l-3 2.6" />
    <path d="M20 13v1a3 3 0 0 1-3 3H4.8" />
    <path d="M7.6 14.4L4.6 17l3 2.6" />
  </svg>
);

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
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
  </svg>
);

const SFSpeaker = ({ size = 17, level = 1, className }: IconProps & { level?: number }) => (
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
/*  Spring button                                                      */
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

/* ------------------------------------------------------------------ */
/*  Marquee: long text rests 5s, glides left to reveal the rest,       */
/*  holds briefly, glides back, then repeats forever.                  */
/* ------------------------------------------------------------------ */
const PAD = 16; // trailing space so the last letters clear the edge fade

function Marquee({
  children,
  rest = 5,
  hold = 1.8,
  speed = 34, // px per second
}: {
  children: React.ReactNode;
  rest?: number;
  hold?: number;
  speed?: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;
    const measure = () => {
      const overflow = inner.offsetWidth - PAD - box.clientWidth;
      setShift(overflow > 0 ? Math.ceil(inner.offsetWidth - box.clientWidth) : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  const scroll = Math.max(1.6, shift / speed);
  const total = rest + scroll + hold + scroll;
  const overflowing = shift > 0;

  const mask = overflowing
    ? "linear-gradient(90deg, transparent 0, #000 7px, #000 calc(100% - 14px), transparent 100%)"
    : undefined;

  return (
    <div
      ref={boxRef}
      className={cn("flex w-full overflow-hidden", overflowing ? "justify-start" : "justify-center")}
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    >
      <motion.span
        ref={innerRef}
        className="shrink-0 whitespace-nowrap inline-flex"
        style={{ paddingRight: PAD, marginRight: -PAD }}
        animate={overflowing ? { x: [0, 0, -shift, -shift, 0] } : { x: 0 }}
        transition={
          overflowing
            ? {
                duration: total,
                repeat: Infinity,
                times: [0, rest / total, (rest + scroll) / total, (rest + scroll + hold) / total, 1],
                ease: ["linear", [0.45, 0, 0.25, 1], "linear", [0.45, 0, 0.25, 1]],
              }
            : { duration: 0 }
        }
      >
        {children}
      </motion.span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Player                                                             */
/* ------------------------------------------------------------------ */
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

  // Seekbar: hover or drag expands it and blurs the track info away
  const [isScrubHover, setIsScrubHover] = useState(false);
  const [isScrubDrag, setIsScrubDrag] = useState(false);
  const scrubExpanded = isScrubHover || isScrubDrag;

  // Volume: hover or drag expands a slider pill over the right-hand buttons
  const [isVolHover, setIsVolHover] = useState(false);
  const [isVolDrag, setIsVolDrag] = useState(false);
  const volExpanded = isVolHover || isVolDrag;

  useEffect(() => {
    if (Date.now() - lastSeekTime.current > 400) {
      setLocalTime(currentTime);
    }
  }, [currentTime]);

  // Release drag states even if the pointer lets go outside the slider
  useEffect(() => {
    if (!isScrubDrag && !isVolDrag) return;
    const end = () => {
      setIsScrubDrag(false);
      setIsVolDrag(false);
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [isScrubDrag, isVolDrag]);

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

  // Dynamically extract artwork color and tint theme variables (site theme only, the player stays glass)
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

  const openFullScreen = () => {
    setFullScreenPlayerOpen(true);
    setPlayerMinimized(false);
  };

  const inactiveBtn = "text-white/65 hover:text-white transition-colors";
  const activeBtn = "text-brand drop-shadow-md";
  const whiteBtn = "text-white/90 hover:text-white transition-colors";
  // Soft rounded plate for the toggles on the right (lyrics / queue / FX)
  const plate = (active: boolean) =>
    cn(
      "rounded-lg transition-[background-color,color] duration-300",
      active ? "bg-white/[0.16] " + activeBtn : "bg-transparent " + inactiveBtn
    );

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {currentTrack && (
          <motion.div
            key="pc-player-bar"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleHidePlayer}
            className="w-full h-full px-4 md:px-6 flex items-center justify-between gap-4 relative select-none bg-transparent border-none"
          >

            {/* 1. Left transport: shuffle, previous, play/pause, next, repeat */}
            <div className="relative flex items-center gap-3.5 shrink-0" onClick={(e) => e.stopPropagation()}>
              <SpringButton
                onClick={toggleShuffle}
                className={cn("p-1.5", isShuffled ? activeBtn : inactiveBtn)}
                title={`Shuffle: ${isShuffled ? "On" : "Off"}`}
              >
                <SFShuffle size={19} />
              </SpringButton>

              <SpringButton onClick={playPrev} className={cn("p-1", whiteBtn)} title="Previous">
                <SwiftUIBackward size={22} fill="currentColor" />
              </SpringButton>

              <SpringButton
                onClick={togglePlay}
                className="p-0.5 text-white hover:text-white/90"
                title={isPlaying ? "Pause" : "Play"}
              >
                <span className="relative flex h-9 w-9 items-center justify-center">
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
                        <SwiftUIPause size={32} fill="currentColor" />
                      ) : (
                        <SwiftUIPlay size={32} fill="currentColor" className="ml-0.5" />
                      )}
                    </motion.span>
                  </AnimatePresence>
                </span>
              </SpringButton>

              <SpringButton onClick={() => playNext(true)} className={cn("p-1", whiteBtn)} title="Next">
                <SwiftUIForward size={22} fill="currentColor" />
              </SpringButton>

              <SpringButton
                onClick={toggleRepeat}
                className={cn("relative p-1.5", repeatMode !== "off" ? activeBtn : inactiveBtn)}
                title={`Repeat: ${repeatMode}`}
              >
                <SFRepeat size={19} />
                <AnimatePresence>
                  {(repeatMode === "one" || repeatMode === "two") && (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={SPRING}
                      className="absolute inset-0 flex items-center justify-center pointer-events-none text-[7px] font-black"
                    >
                      {repeatMode === "one" ? "1" : "2"}
                    </motion.span>
                  )}
                </AnimatePresence>
              </SpringButton>
            </div>

            {/* 2. Middle: transparent track area (no card). Artwork opens the full player. */}
            <div
              className="relative flex-1 min-w-0 max-w-[400px] md:max-w-[440px] h-[54px]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Track info: blurs away while the seekbar is active */}
              <motion.div
                className="absolute inset-x-0 top-[1px] h-[38px] flex items-center gap-2.5 min-w-0"
                animate={{
                  opacity: scrubExpanded ? 0 : 1,
                  scale: scrubExpanded ? 0.96 : 1,
                  filter: scrubExpanded ? "blur(10px)" : "blur(0px)",
                }}
                transition={{ default: SPRING_SOFT, opacity: { duration: 0.2 }, filter: { duration: 0.25 } }}
                style={{ pointerEvents: scrubExpanded ? "none" : "auto" }}
              >
                {/* Artwork with the expand affordance on hover */}
                <button
                  onClick={openFullScreen}
                  title="Open full screen player"
                  className="group/art relative h-9 w-9 shrink-0 rounded-md overflow-hidden bg-zinc-800 shadow-md ring-1 ring-white/10 cursor-pointer outline-none"
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.img
                      key={currentTrack.id}
                      src={getTrackCover(currentTrack)}
                      alt="Cover"
                      initial={{ opacity: 0, scale: 1.2 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  </AnimatePresence>
                  <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 group-hover/art:opacity-100 transition-opacity duration-200">
                    <motion.span
                      className="flex text-white"
                      initial={false}
                      whileHover={{ scale: 1.12 }}
                      transition={SPRING}
                    >
                      <SFExpand size={15} />
                    </motion.span>
                  </span>
                </button>

                {/* Title + artist, centered, each gliding when too long */}
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={currentTrack.id}
                    initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
                    transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                    className="flex flex-col min-w-0 flex-1 justify-center text-center gap-[1px]"
                  >
                    <Marquee>
                      <span
                        className="text-[13.5px] font-semibold text-white leading-[18px] tracking-tight hover:underline cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/track/${currentTrack.id}`);
                        }}
                      >
                        {formatDisplayTitle(cleanTitle(currentTrack.title))}
                      </span>
                    </Marquee>
                    <Marquee>
                      <span className="inline-flex text-[12px] font-normal text-white/60 leading-[16px]">
                        <ArtistLinks
                          track={currentTrack}
                          maxArtists={8}
                          linkClassName="hover:underline text-white/60 hover:text-white"
                        />
                      </span>
                    </Marquee>
                  </motion.div>
                </AnimatePresence>
              </motion.div>

              {/* Seekbar: a thin line under the info, grows to fill the area on hover/drag */}
              <motion.div
                className="absolute inset-x-0 bottom-0 flex items-center"
                initial={false}
                animate={{ height: scrubExpanded ? 54 : 18 }}
                transition={SPRING_SOFT}
                onMouseEnter={() => setIsScrubHover(true)}
                onMouseLeave={() => setIsScrubHover(false)}
                onPointerDown={() => setIsScrubDrag(true)}
              >
                <motion.span
                  className="overflow-hidden whitespace-nowrap font-medium tabular-nums select-none text-right text-white/85 text-[12px]"
                  initial={false}
                  animate={{ width: scrubExpanded ? 42 : 0, opacity: scrubExpanded ? 1 : 0, paddingRight: scrubExpanded ? 8 : 0 }}
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
                    setIsScrubDrag(false);
                  }}
                >
                  <Slider.Track
                    className="relative grow rounded-full overflow-hidden"
                    style={{
                      height: scrubExpanded ? 8 : 2,
                      background: scrubExpanded ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.14)",
                      transition: `height 380ms ${EASE_OUT}, background-color 300ms`,
                    }}
                  >
                    <Slider.Range className="absolute h-full rounded-full bg-white" />
                  </Slider.Track>
                  <Slider.Thumb className="block w-3 h-3 rounded-full opacity-0 outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white/70" />
                </Slider.Root>

                <motion.span
                  className="overflow-hidden whitespace-nowrap font-medium tabular-nums select-none text-left text-white/85 text-[12px]"
                  initial={false}
                  animate={{ width: scrubExpanded ? 46 : 0, opacity: scrubExpanded ? 1 : 0, paddingLeft: scrubExpanded ? 8 : 0 }}
                  transition={SPRING_SOFT}
                >
                  -{formatDuration(remaining)}
                </motion.span>
              </motion.div>
            </div>

            {/* 3. Right controls: like, FX, lyrics, queue, and a volume pill that expands over them */}
            <div className="relative flex items-center gap-2 shrink-0 w-[184px] justify-end" onClick={(e) => e.stopPropagation()}>
              <motion.div
                className="flex items-center gap-1.5"
                animate={{
                  opacity: volExpanded ? 0 : 1,
                  scale: volExpanded ? 0.94 : 1,
                  filter: volExpanded ? "blur(6px)" : "blur(0px)",
                }}
                transition={{ default: SPRING_SOFT, opacity: { duration: 0.18 }, filter: { duration: 0.22 } }}
                style={{ pointerEvents: volExpanded ? "none" : "auto", marginRight: 40 }}
              >
                {/* Like (pops with a spring when liked) */}
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
                    <SFHeart size={17} filled={!!isCurrentTrackLiked} />
                  </motion.span>
                </SpringButton>

                <SpringButton
                  id="tour-fx"
                  onClick={() => setAudioFxOpen(!isAudioFxOpen)}
                  className={cn("p-1.5", plate(isAudioFxOpen))}
                  title="Studio FX"
                >
                  <SFFx size={17} />
                </SpringButton>

                <SpringButton
                  id="tour-lyrics"
                  data-tour="lyrics"
                  onClick={() => setIsLyricsOpen(!isLyricsOpen)}
                  className={cn("p-1.5", plate(isLyricsOpen))}
                  title="Lyrics"
                >
                  <SFLyrics size={17} />
                </SpringButton>

                <SpringButton
                  onClick={() => setIsQueueOpen(!isQueueOpen)}
                  className={cn("p-1.5", plate(isQueueOpen))}
                  title="Queue"
                >
                  <SwiftUIQueue size={17} stroke="currentColor" />
                </SpringButton>
              </motion.div>

              {/* Volume pill: just the speaker at rest, slides open to the left on hover */}
              <motion.div
                className="absolute inset-y-0 my-auto right-0 h-9 flex items-center justify-end rounded-full overflow-hidden"
                initial={false}
                animate={{
                  width: volExpanded ? 184 : 36,
                  backgroundColor: volExpanded ? "rgba(22,22,24,0.55)" : "rgba(22,22,24,0)",
                }}
                transition={SPRING_SOFT}
                onMouseEnter={() => setIsVolHover(true)}
                onMouseLeave={() => setIsVolHover(false)}
              >
                <motion.div
                  className="flex-1 min-w-0 pl-4 pr-1.5"
                  initial={false}
                  animate={{ opacity: volExpanded ? 1 : 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ pointerEvents: volExpanded ? "auto" : "none" }}
                >
                  <Slider.Root
                    className="slider-root relative flex items-center select-none touch-none w-full h-6 cursor-pointer"
                    value={[volume * 100]}
                    max={100}
                    step={1}
                    onValueChange={([val]) => setVolume(val / 100)}
                    onPointerDown={() => setIsVolDrag(true)}
                  >
                    <Slider.Track className="relative grow rounded-full overflow-hidden h-[6px] bg-white/25">
                      <Slider.Range className="absolute h-full rounded-full bg-white" />
                    </Slider.Track>
                    <Slider.Thumb className="block w-3 h-3 rounded-full bg-white shadow-md outline-none" />
                  </Slider.Root>
                </motion.div>

                <SpringButton
                  onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
                  className={cn("h-9 w-9 shrink-0", inactiveBtn)}
                  title={volume === 0 ? "Unmute" : "Mute"}
                >
                  <SFSpeaker size={18} level={volume === 0 ? 0 : volume} />
                </SpringButton>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}