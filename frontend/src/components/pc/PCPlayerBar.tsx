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

/* ------------------------------------------------------------------ */
/*  Tokens                                                             */
/* ------------------------------------------------------------------ */
const SPRING = { type: "spring", stiffness: 560, damping: 32, mass: 0.7 } as const;
const SPRING_SOFT = { type: "spring", stiffness: 340, damping: 32, mass: 0.85 } as const;
const SPRING_BOUNCE = { type: "spring", stiffness: 520, damping: 18, mass: 0.7 } as const;
// Apple's ease-out curve. Used for CSS transitions, which run off the React render path.
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Inter, system-ui, sans-serif';

// Song change: details slide out one side and the next song springs in from the other
const SLIDE_SPRING = { type: "spring", stiffness: 320, damping: 32, mass: 0.8 } as const;
const trackSlide = {
  enter: (d: number) => ({ x: d * 46, opacity: 0, scale: 0.97 }),
  center: { x: 0, opacity: 1, scale: 1 },
  exit: (d: number) => ({ x: -d * 46, opacity: 0, scale: 0.97 }),
};

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

const SFShuffle = ({ size = 16, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 7h2.6c2 0 3.3.9 4.3 2.4l3.2 5.2c1 1.5 2.3 2.4 4.3 2.4H20" />
    <path d="M3 17h2.6c2 0 3.3-.9 4.3-2.4l3.2-5.2c1-1.5 2.3-2.4 4.3-2.4H20" />
    <path d="M17.2 4.4L20.2 7l-3 2.6" />
    <path d="M17.2 14.4L20.2 17l-3 2.6" />
  </svg>
);

const SFRepeat = ({ size = 16, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 11v-1a3 3 0 0 1 3-3h12.2" />
    <path d="M16.4 4.4L19.4 7l-3 2.6" />
    <path d="M20 13v1a3 3 0 0 1-3 3H4.8" />
    <path d="M7.6 14.4L4.6 17l3 2.6" />
  </svg>
);

const SFHeart = ({ size = 15, filled, className }: IconProps & { filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 21s-7-4.35-9.5-9C.9 8.6 2.6 4.5 6.5 4.5c2.1 0 3.9 1.1 5.5 3.2 1.6-2.1 3.4-3.2 5.5-3.2 3.9 0 5.6 4.1 4 7.5-2.5 4.65-9.5 9-9.5 9z" />
  </svg>
);

const SFLyrics = ({ size = 15, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
    <path d="M8 9h8M8 12.5h5" />
  </svg>
);

const SFFx = ({ size = 15, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={className}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </svg>
);

const SFExpand = ({ size = 13, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
  </svg>
);

const SFSpeaker = ({ size = 16, level = 1, className }: IconProps & { level?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
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
      whileTap={{ scale: 0.9 }}
      transition={SPRING}
      className={cn("flex items-center justify-center outline-none cursor-pointer", className)}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Marquee                                                            */
/*  Long text rests at its default position, then travels forward      */
/*  (right-to-left) only, with a second copy following it, so it       */
/*  lands back on the default position without ever moving in reverse. */
/*  One pass per song. Web Animations API, transform only, so it runs  */
/*  on the compositor thread and never touches React.                  */
/* ------------------------------------------------------------------ */
const GAP = 36; // space between the text and its trailing copy while it travels

function Marquee({
  children,
  rest = 5,
  speed = 42, // px per second
}: {
  children: React.ReactNode;
  rest?: number;
  speed?: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLSpanElement>(null);
  const [distance, setDistance] = useState(0); // 0 = the text fits, nothing to scroll

  useEffect(() => {
    const box = boxRef.current;
    const copy = copyRef.current;
    if (!box || !copy) return;
    const measure = () => {
      setDistance(copy.offsetWidth > box.clientWidth + 1 ? copy.offsetWidth + GAP : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(copy);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || distance <= 0) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const move = Math.max(2, distance / speed);
    const total = rest + move;
    const ease = "cubic-bezier(0.45, 0, 0.25, 1)";
    // rest -> glide forward by exactly one text-width + gap. At the end the trailing copy sits
    // exactly where the original started, so the reset to 0 is invisible. No reverse movement.
    const anim = track.animate(
      [
        { transform: "translate3d(0,0,0)", offset: 0, easing: ease },
        { transform: "translate3d(0,0,0)", offset: rest / total, easing: ease },
        { transform: `translate3d(${-distance}px,0,0)`, offset: 1 },
      ],
      { duration: total * 1000, iterations: 1 }
    );
    return () => anim.cancel();
  }, [distance, rest, speed]);

  const overflowing = distance > 0;
  const mask = overflowing
    ? "linear-gradient(90deg, transparent 0, #000 7px, #000 calc(100% - 14px), transparent 100%)"
    : undefined;

  return (
    <div
      ref={boxRef}
      className={cn("flex w-full overflow-hidden", overflowing ? "justify-start" : "justify-center")}
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    >
      <span
        ref={trackRef}
        className="inline-flex shrink-0 whitespace-nowrap"
        style={{ willChange: overflowing ? "transform" : undefined }}
      >
        <span ref={copyRef} className="inline-flex shrink-0">
          {children}
        </span>
        {overflowing && (
          <>
            <span className="shrink-0" style={{ width: GAP }} />
            <span aria-hidden className="inline-flex shrink-0">
              {children}
            </span>
          </>
        )}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Seekbar                                                            */
/*  Lives in its own component so the per-tick currentTime updates     */
/*  re-render only this small tree, not the whole player bar.          */
/*  It stays anchored at the bottom of the track area. On hover/drag   */
/*  it gets thicker in place and the times fade in above it.           */
/* ------------------------------------------------------------------ */
function Seekbar({ onActiveChange }: { onActiveChange: (active: boolean) => void }) {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);

  const [localTime, setLocalTime] = useState(currentTime);
  const lastSeekTime = useRef(0);
  const [hover, setHover] = useState(false);
  const [drag, setDrag] = useState(false);
  const active = hover || drag;

  useEffect(() => {
    if (Date.now() - lastSeekTime.current > 400) setLocalTime(currentTime);
  }, [currentTime]);

  useEffect(() => {
    onActiveChange(active);
  }, [active, onActiveChange]);

  // Release the drag even if the pointer lets go outside the slider
  useEffect(() => {
    if (!drag) return;
    const end = () => setDrag(false);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [drag]);

  const performSeek = (targetSec: number) => {
    lastSeekTime.current = Date.now();
    if (!duration || duration <= 0) return;
    const clamped = Math.max(0, Math.min(targetSec, Math.max(0, duration - 1.0)));
    setLocalTime(clamped);
    setCurrentTime(clamped);

    const audio = audioEngine.getActiveAudioElement();
    if (audio) {
      try {
        audio.currentTime = clamped;
        audioEngine.setVolume(usePlayerStore.getState().volume ?? 1);
      } catch (e) {
        console.warn("Seek error:", e);
      }
    }
  };

  const safeMax = duration && duration > 0 ? duration : 1;
  const remaining = Math.max(0, (duration || 0) - localTime);

  const labelStyle = (side: "left" | "right"): React.CSSProperties => ({
    opacity: active ? 1 : 0,
    transform: active ? "translate3d(0,0,0)" : "translate3d(0,5px,0)",
    transition: `opacity 260ms ${EASE}, transform 360ms ${EASE}`,
    [side]: 0,
  });

  return (
    <div
      className="absolute inset-x-0 -bottom-[5px] h-[19px] flex items-center"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onPointerDown={() => setDrag(true)}
    >
      <span
        className="absolute bottom-full mb-[1px] text-[11.5px] font-medium tabular-nums text-white/90 pointer-events-none select-none"
        style={labelStyle("left")}
      >
        {formatDuration(localTime)}
      </span>
      <span
        className="absolute bottom-full mb-[1px] text-[11.5px] font-medium tabular-nums text-white/90 pointer-events-none select-none"
        style={labelStyle("right")}
      >
        -{formatDuration(remaining)}
      </span>

      <Slider.Root
        className="slider-root relative flex items-center select-none touch-none w-full h-full cursor-pointer"
        value={[Math.min(localTime, safeMax)]}
        max={safeMax}
        step={0.1}
        onValueChange={(val) => {
          setLocalTime(val[0]);
          lastSeekTime.current = Date.now();
        }}
        onValueCommit={(val) => {
          performSeek(val[0]);
          setDrag(false);
        }}
      >
        <Slider.Track
          className="relative grow rounded-full overflow-hidden"
          style={{
            height: active ? 8 : 2,
            background: active ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.14)",
            transition: `height 340ms ${EASE}, background-color 260ms ${EASE}`,
          }}
        >
          <Slider.Range
            className="absolute h-full rounded-full bg-white"
            // Smooths the stepped timeupdate ticks into a continuous glide (off while dragging)
            style={{ transition: drag ? "none" : "right 280ms linear" }}
          />
        </Slider.Track>
        <Slider.Thumb className="block w-3 h-3 rounded-full opacity-0 outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white/70" />
      </Slider.Root>
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

  // Selectors, so unrelated UI store changes (toasts, page covers...) don't re-render the player
  const setPlayerMinimized = useUIStore((s) => s.setPlayerMinimized);
  const setFullScreenPlayerOpen = useUIStore((s) => s.setFullScreenPlayerOpen);
  const isAudioFxOpen = useUIStore((s) => s.isAudioFxOpen);
  const setAudioFxOpen = useUIStore((s) => s.setAudioFxOpen);
  const isQueueOpen = useUIStore((s) => s.isQueueOpen);
  const setIsQueueOpen = useUIStore((s) => s.setIsQueueOpen);
  const isLyricsOpen = useUIStore((s) => s.isLyricsOpen);
  const setIsLyricsOpen = useUIStore((s) => s.setIsLyricsOpen);
  const queryClient = useQueryClient();

  const dirRef = useRef(1);

  // Seekbar hover/drag: blurs the track info behind it
  const [scrubActive, setScrubActive] = useState(false);

  // Volume: hover or drag expands a slider pill over the right-hand buttons
  const [isVolHover, setIsVolHover] = useState(false);
  const [isVolDrag, setIsVolDrag] = useState(false);
  const volExpanded = isVolHover || isVolDrag;

  useEffect(() => {
    if (!isVolDrag) return;
    const end = () => setIsVolDrag(false);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [isVolDrag]);



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

  // +1 = next (new song enters from the right), -1 = previous (enters from the left)
  const handleNext = () => {
    dirRef.current = 1;
    playNext(true);
  };
  const handlePrev = () => {
    dirRef.current = -1;
    playPrev();
  };
  useEffect(() => {
    // after every song change go back to the default direction (auto-advance = next)
    dirRef.current = 1;
  }, [currentTrack?.id]);

  const inactiveBtn = "text-white/65 hover:text-white transition-colors duration-200";
  const activeBtn = "text-brand drop-shadow-md";
  const whiteBtn = "text-white/90 hover:text-white transition-colors duration-200";
  const plate = (active: boolean) =>
    cn(
      "rounded-md transition-[background-color,color] duration-300",
      active ? "bg-white/[0.16] " + activeBtn : "bg-transparent " + inactiveBtn
    );

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {currentTrack && (
          <motion.div
            key="pc-player-bar"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ scale: SPRING_SOFT, opacity: { duration: 0.2 } }}
            onClick={handleHidePlayer}
            style={{ fontFamily: FONT_STACK, WebkitFontSmoothing: "antialiased" }}
            className="w-full h-full px-[22px] flex items-center justify-between gap-3 relative select-none bg-transparent border-none"
          >
            {/* 1. Left transport */}
            <div className="relative flex items-center gap-2.5 shrink-0" onClick={(e) => e.stopPropagation()}>
              <SpringButton
                onClick={toggleShuffle}
                className={cn("p-1", isShuffled ? activeBtn : inactiveBtn)}
                title={`Shuffle: ${isShuffled ? "On" : "Off"}`}
              >
                <SFShuffle size={16} />
              </SpringButton>

              <SpringButton onClick={handlePrev} className={cn("p-0.5", whiteBtn)} title="Previous">
                <SwiftUIBackward size={23} fill="currentColor" />
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
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={{ ...SPRING, opacity: { duration: 0.14 } }}
                      className="absolute flex items-center justify-center"
                    >
                      {isPlaying ? (
                        <SwiftUIPause size={34} fill="currentColor" />
                      ) : (
                        <SwiftUIPlay size={34} fill="currentColor" className="ml-0.5" />
                      )}
                    </motion.span>
                  </AnimatePresence>
                </span>
              </SpringButton>

              <SpringButton onClick={handleNext} className={cn("p-0.5", whiteBtn)} title="Next">
                <SwiftUIForward size={23} fill="currentColor" />
              </SpringButton>

              <SpringButton
                onClick={toggleRepeat}
                className={cn("relative p-1", repeatMode !== "off" ? activeBtn : inactiveBtn)}
                title={`Repeat: ${repeatMode}`}
              >
                <SFRepeat size={16} />
                <AnimatePresence>
                  {(repeatMode === "one" || repeatMode === "two") && (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={SPRING_BOUNCE}
                      className="absolute inset-0 flex items-center justify-center pointer-events-none text-[6px] font-black"
                    >
                      {repeatMode === "one" ? "1" : "2"}
                    </motion.span>
                  )}
                </AnimatePresence>
              </SpringButton>
            </div>

            {/* 2. Middle: track info on top, seekbar anchored at the bottom */}
            <div className="relative shrink-0 w-[310px] h-[50px]" onClick={(e) => e.stopPropagation()}>
              {/* Track info: springs out/in on every song change, and dims + blurs behind the seekbar */}
              <div
                className="absolute inset-x-0 top-0 h-[37px] min-w-0 overflow-hidden"
                style={{
                  opacity: scrubActive ? 0.3 : 1,
                  filter: scrubActive ? "blur(7px)" : "blur(0px)",
                  transform: scrubActive ? "scale(0.985) translateZ(0)" : "scale(1) translateZ(0)",
                  transition: `opacity 340ms ${EASE}, filter 340ms ${EASE}, transform 420ms ${EASE}`,
                  pointerEvents: scrubActive ? "none" : "auto",
                  willChange: "opacity, filter, transform",
                }}
              >
                <AnimatePresence mode="popLayout" initial={false} custom={dirRef.current}>
                  <motion.div
                    key={currentTrack.id}
                    custom={dirRef.current}
                    variants={trackSlide}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ x: SLIDE_SPRING, scale: SLIDE_SPRING, opacity: { duration: 0.24, ease: [0.32, 0.72, 0, 1] } }}
                    className="absolute inset-0 flex items-center gap-2 min-w-0"
                  >
                    <motion.button
                      onClick={openFullScreen}
                      whileTap={{ scale: 0.94 }}
                      transition={SPRING}
                      title="Open full screen player"
                      className="group/art relative h-[37px] w-[37px] shrink-0 rounded-[6px] overflow-hidden bg-zinc-800 shadow-md ring-1 ring-white/10 cursor-pointer outline-none"
                    >
                      <img
                        src={getTrackCover(currentTrack)}
                        alt="Cover"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 group-hover/art:opacity-100 transition-opacity duration-200">
                        <span className="flex text-white">
                          <SFExpand size={15} />
                        </span>
                      </span>
                    </motion.button>

                    <div className="flex flex-col min-w-0 flex-1 justify-center text-center gap-0">
                      <Marquee>
                        <span
                          className="text-[14px] font-semibold text-white leading-[17px] tracking-[-0.01em] hover:underline cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/track/${currentTrack.id}`);
                          }}
                        >
                          {formatDisplayTitle(cleanTitle(currentTrack.title))}
                        </span>
                      </Marquee>
                      <Marquee>
                        <span className="inline-flex text-[12.5px] font-normal text-white/60 leading-[16px] tracking-[-0.005em]">
                          <ArtistLinks
                            track={currentTrack}
                            maxArtists={8}
                            linkClassName="hover:underline text-white/60 hover:text-white"
                          />
                        </span>
                      </Marquee>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Seekbar: stays in place, only grows thicker */}
              <Seekbar onActiveChange={setScrubActive} />
            </div>

            {/* 3. Right controls */}
            <div className="relative flex items-center shrink-0 w-[166px] justify-end" onClick={(e) => e.stopPropagation()}>
              <div
                className="flex items-center"
                style={{
                  opacity: volExpanded ? 0 : 1,
                  transform: volExpanded ? "scale(0.94) translateZ(0)" : "scale(1) translateZ(0)",
                  filter: volExpanded ? "blur(5px)" : "blur(0px)",
                  transition: `opacity 260ms ${EASE}, transform 380ms ${EASE}, filter 300ms ${EASE}`,
                  pointerEvents: volExpanded ? "none" : "auto",
                  marginRight: 38,
                }}
              >
                <SpringButton
                  onClick={() => toggleLikeMutation.mutate()}
                  className={cn("p-[7px]", isCurrentTrackLiked ? "text-brand" : inactiveBtn)}
                  title={isCurrentTrackLiked ? "Unlike" : "Like"}
                >
                  <motion.span
                    key={String(isCurrentTrackLiked)}
                    initial={{ scale: isCurrentTrackLiked ? 0.5 : 1 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 600, damping: 12 }}
                    className="flex"
                  >
                    <SFHeart size={18} filled={!!isCurrentTrackLiked} />
                  </motion.span>
                </SpringButton>

                <SpringButton
                  id="tour-fx"
                  onClick={() => setAudioFxOpen(!isAudioFxOpen)}
                  className={cn("p-[7px]", plate(isAudioFxOpen))}
                  title="Studio FX"
                >
                  <SFFx size={18} />
                </SpringButton>

                <SpringButton
                  id="tour-lyrics"
                  data-tour="lyrics"
                  onClick={() => setIsLyricsOpen(!isLyricsOpen)}
                  className={cn("p-[7px]", plate(isLyricsOpen))}
                  title="Lyrics"
                >
                  <SFLyrics size={18} />
                </SpringButton>

                <SpringButton
                  onClick={() => setIsQueueOpen(!isQueueOpen)}
                  className={cn("p-[7px]", plate(isQueueOpen))}
                  title="Queue"
                >
                  <SwiftUIQueue size={18} stroke="currentColor" />
                </SpringButton>
              </div>

              {/* Volume pill: just the speaker at rest, slides open to the left on hover */}
              <div
                className="absolute inset-y-0 my-auto right-0 h-[38px] flex items-center justify-end rounded-full overflow-hidden"
                style={{
                  width: volExpanded ? 166 : 38,
                  backgroundColor: volExpanded ? "rgba(22,22,24,0.55)" : "rgba(22,22,24,0)",
                  transition: `width 400ms ${EASE}, background-color 300ms ${EASE}`,
                  willChange: "width",
                }}
                onMouseEnter={() => setIsVolHover(true)}
                onMouseLeave={() => setIsVolHover(false)}
              >
                <div
                  className="flex-1 min-w-0 pl-4 pr-1"
                  style={{
                    opacity: volExpanded ? 1 : 0,
                    transition: `opacity ${volExpanded ? 260 : 120}ms ${EASE}`,
                    pointerEvents: volExpanded ? "auto" : "none",
                  }}
                >
                  <Slider.Root
                    className="slider-root relative flex items-center select-none touch-none w-full h-6 cursor-pointer"
                    value={[volume * 100]}
                    max={100}
                    step={1}
                    onValueChange={([val]) => setVolume(val / 100)}
                    onPointerDown={() => setIsVolDrag(true)}
                  >
                    <Slider.Track className="relative grow rounded-full overflow-hidden h-[5px] bg-white/25">
                      <Slider.Range className="absolute h-full rounded-full bg-white" />
                    </Slider.Track>
                    <Slider.Thumb className="block w-2.5 h-2.5 rounded-full bg-white shadow-md outline-none" />
                  </Slider.Root>
                </div>

                <SpringButton
                  onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
                  className={cn("h-[38px] w-9 shrink-0", inactiveBtn)}
                  title={volume === 0 ? "Unmute" : "Mute"}
                >
                  <SFSpeaker size={19} level={volume === 0 ? 0 : volume} />
                </SpringButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}