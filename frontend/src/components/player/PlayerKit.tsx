"use client";

/**
 * PlayerKit — shared Apple-style building blocks for PCPlayerBar, PCFullScreenPlayer
 * and PremiumMobilePlayer. Put this at: @/components/player/PlayerKit.tsx
 *
 * Two kinds of springs are used on purpose:
 *  • framer-motion springs  → gestures, enter/exit, layout morphs
 *  • CSS `linear()` springs → state toggles (.ps-t classes). These run on the compositor,
 *    so they stay smooth even while the main thread is busy (lyrics, queries, re-renders).
 */

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, type HTMLMotionProps } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";
import { SwiftUIPlay, SwiftUIPause } from "@/components/ui/SwiftUIIcons";

/* ------------------------------------------------------------------ */
/*  Tokens                                                             */
/* ------------------------------------------------------------------ */
export const SPRING = { type: "spring", stiffness: 560, damping: 32, mass: 0.7 } as const;
export const SPRING_SOFT = { type: "spring", stiffness: 340, damping: 32, mass: 0.85 } as const;
export const SPRING_BOUNCE = { type: "spring", stiffness: 520, damping: 18, mass: 0.7 } as const;
export const SHEET_SPRING = { type: "spring", stiffness: 380, damping: 38, mass: 0.85 } as const;
export const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
export const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Inter, system-ui, sans-serif';

/** Drop-in motion props for queue / Studio FX / any floating panel, so they open & close like the player. */
export const panelMotion = {
  initial: { opacity: 0, y: 28, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 18, scale: 0.98 },
  transition: { y: SPRING_SOFT, scale: SPRING_SOFT, opacity: { duration: 0.22 } },
} as const;

/* ------------------------------------------------------------------ */
/*  CSS spring easing (compositor-driven)                              */
/* ------------------------------------------------------------------ */
export function springCurve(zeta: number, settleMs: number, points = 56) {
  const w = 4.6 / (zeta * (settleMs / 1000));
  const wd = w * Math.sqrt(1 - zeta * zeta);
  const out: string[] = [];
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * (settleMs / 1000);
    const v = 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
    out.push(i === 0 ? "0" : i === points ? "1" : (Math.round(v * 10000) / 10000).toString());
  }
  return `linear(${out.join(", ")})`;
}

const PROPS = "transform, opacity, background-color, color, border-color";
const CSS = `
.ps-t{transition-property:${PROPS};transition-duration:460ms;transition-timing-function:${EASE}}
.ps-t-soft{transition-property:${PROPS};transition-duration:720ms;transition-timing-function:${EASE}}
.ps-t-fast{transition-property:${PROPS};transition-duration:300ms;transition-timing-function:${EASE}}
@supports (transition-timing-function: linear(0, 1)){
.ps-t{transition-duration:520ms;transition-timing-function:${springCurve(0.8, 520)}}
.ps-t-soft{transition-duration:820ms;transition-timing-function:${springCurve(0.86, 820)}}
.ps-t-fast{transition-duration:360ms;transition-timing-function:${springCurve(0.78, 360)}}
}
.ps-hide{opacity:0;pointer-events:none}
@media (prefers-reduced-motion: reduce){.ps-t,.ps-t-soft,.ps-t-fast{transition-duration:1ms!important}}
`;

/** Render once inside each player (SSR-safe, @supports-gated). */
export function PlayerStyles() {
  return <style>{CSS}</style>;
}

/* ------------------------------------------------------------------ */
/*  Icons (same set as PCPlayerBar)                                    */
/* ------------------------------------------------------------------ */
export type IconProps = { size?: number; className?: string };

export const SFShuffle = ({ size = 16, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 7h2.6c2 0 3.3.9 4.3 2.4l3.2 5.2c1 1.5 2.3 2.4 4.3 2.4H20" />
    <path d="M3 17h2.6c2 0 3.3-.9 4.3-2.4l3.2-5.2c1-1.5 2.3-2.4 4.3-2.4H20" />
    <path d="M17.2 4.4L20.2 7l-3 2.6" />
    <path d="M17.2 14.4L20.2 17l-3 2.6" />
  </svg>
);

export const SFRepeat = ({ size = 16, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 11v-1a3 3 0 0 1 3-3h12.2" />
    <path d="M16.4 4.4L19.4 7l-3 2.6" />
    <path d="M20 13v1a3 3 0 0 1-3 3H4.8" />
    <path d="M7.6 14.4L4.6 17l3 2.6" />
  </svg>
);

export const SFHeart = ({ size = 15, filled, className }: IconProps & { filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 21s-7-4.35-9.5-9C.9 8.6 2.6 4.5 6.5 4.5c2.1 0 3.9 1.1 5.5 3.2 1.6-2.1 3.4-3.2 5.5-3.2 3.9 0 5.6 4.1 4 7.5-2.5 4.65-9.5 9-9.5 9z" />
  </svg>
);

export const SFLyrics = ({ size = 15, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
    <path d="M8 9h8M8 12.5h5" />
  </svg>
);

export const SFFx = ({ size = 15, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={className}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </svg>
);

export const SFExpand = ({ size = 13, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
  </svg>
);

export const SFMinimize = ({ size = 15, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 14h6v6M20 10h-6V4M10 14l-7 7M14 10l7-7" />
  </svg>
);

export const SFClose = ({ size = 15, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className={className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const SFMore = ({ size = 16, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <circle cx="5.5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="18.5" cy="12" r="2" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Buttons                                                            */
/* ------------------------------------------------------------------ */
export const SpringButton = React.forwardRef<HTMLButtonElement, HTMLMotionProps<"button">>(function SpringButton(
  { className, ...props },
  ref
) {
  return (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.88 }}
      transition={SPRING}
      className={cn("flex items-center justify-center outline-none cursor-pointer select-none [-webkit-tap-highlight-color:transparent]", className)}
      {...props}
    />
  );
});

const INACTIVE = "text-white/65 hover:text-white";
const ACTIVE = "text-brand";

/** macOS-style toggle: rounded plate that fills when on, icon pops on change. */
export function PlateButton({
  active,
  size = 36,
  className,
  children,
  ...props
}: Omit<HTMLMotionProps<"button">, "children"> & { active?: boolean; size?: number; children: React.ReactNode }) {
  return (
    <SpringButton
      style={{ width: size, height: size }}
      className={cn(
        "rounded-[9px] transition-[background-color,color] duration-300",
        active ? "bg-white/[0.16] " + ACTIVE : "bg-transparent " + INACTIVE,
        className
      )}
      {...props}
    >
      <motion.span
        key={String(!!active)}
        initial={{ scale: active ? 0.7 : 1 }}
        animate={{ scale: 1 }}
        transition={SPRING_BOUNCE}
        className="flex"
      >
        {children}
      </motion.span>
    </SpringButton>
  );
}

/** Frosted circular button used for header actions (macOS / iOS "glass" control). */
export function GlassButton({ className, ...props }: HTMLMotionProps<"button">) {
  return (
    <SpringButton
      className={cn("h-8 w-8 rounded-full bg-white/[0.14] text-white/90 hover:bg-white/[0.22] hover:text-white transition-colors duration-200", className)}
      {...props}
    />
  );
}

export function PlayPauseButton({
  isPlaying,
  onToggle,
  size = 34,
  className,
}: {
  isPlaying: boolean;
  onToggle: () => void;
  size?: number;
  className?: string;
}) {
  const box = Math.round(size * 1.06);
  return (
    <SpringButton
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn("p-0.5 text-white hover:text-white/90", className)}
      title={isPlaying ? "Pause" : "Play"}
    >
      <span className="relative flex items-center justify-center" style={{ width: box, height: box }}>
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
              <SwiftUIPause size={size} fill="currentColor" />
            ) : (
              <SwiftUIPlay size={size} fill="currentColor" className="ml-0.5" />
            )}
          </motion.span>
        </AnimatePresence>
      </span>
    </SpringButton>
  );
}

export function LikeButton({
  liked,
  onToggle,
  size = 18,
  circle = false,
  className,
}: {
  liked: boolean;
  onToggle: () => void;
  size?: number;
  circle?: boolean;
  className?: string;
}) {
  const prev = useRef(liked);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (liked && !prev.current) setBurst((b) => b + 1);
    prev.current = liked;
  }, [liked]);

  return (
    <SpringButton
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={liked ? "Unlike" : "Like"}
      className={cn(
        "relative",
        circle ? "h-8 w-8 rounded-full bg-white/[0.14] hover:bg-white/[0.22]" : "p-[7px]",
        liked ? ACTIVE : INACTIVE,
        "transition-colors duration-200",
        className
      )}
    >
      {burst > 0 && (
        <motion.span
          key={burst}
          initial={{ scale: 0.5, opacity: 0.55 }}
          animate={{ scale: 1.9, opacity: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute inset-0 m-auto rounded-full border-2 border-current"
          style={{ width: size, height: size }}
        />
      )}
      <motion.span
        key={String(liked)}
        initial={{ scale: liked ? 0.5 : 1 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 600, damping: 12 }}
        className="flex"
      >
        <SFHeart size={size} filled={liked} />
      </motion.span>
    </SpringButton>
  );
}

/* ------------------------------------------------------------------ */
/*  Marquee (same engine as PCPlayerBar, + left alignment)             */
/* ------------------------------------------------------------------ */
const GAP = 36;

export function Marquee({
  children,
  rest = 5,
  speed = 42,
  align = "center",
  className,
}: {
  children: React.ReactNode;
  rest?: number;
  speed?: number;
  align?: "left" | "center";
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLSpanElement>(null);
  const [distance, setDistance] = useState(0);

  useEffect(() => {
    const box = boxRef.current, copy = copyRef.current;
    if (!box || !copy) return;
    const measure = () => setDistance(copy.offsetWidth > box.clientWidth + 1 ? copy.offsetWidth + GAP : 0);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box); ro.observe(copy);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || distance <= 0) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const move = Math.max(2, distance / speed);
    const total = rest + move;
    const ease = "cubic-bezier(0.45, 0, 0.25, 1)";
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
      className={cn("flex w-full overflow-hidden", overflowing || align === "left" ? "justify-start" : "justify-center", className)}
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    >
      <span ref={trackRef} className="inline-flex shrink-0 whitespace-nowrap" style={{ willChange: overflowing ? "transform" : undefined }}>
        <span ref={copyRef} className="inline-flex shrink-0">{children}</span>
        {overflowing && (
          <>
            <span className="shrink-0" style={{ width: GAP }} />
            <span aria-hidden className="inline-flex shrink-0">{children}</span>
          </>
        )}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */
/** Idle detector: re-arms at most every 200ms so pointermove/touchmove never thrash timers or state. */
export function useIdle(enabled: boolean, ms = 4500) {
  const [idle, setIdle] = useState(false);
  const idleRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReset = useRef(0);

  useEffect(() => {
    if (!enabled) {
      idleRef.current = false;
      setIdle(false);
      return;
    }
    const arm = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        idleRef.current = true;
        setIdle(true);
      }, ms);
    };
    const onActivity = () => {
      const now = performance.now();
      if (!idleRef.current && now - lastReset.current < 200) return;
      lastReset.current = now;
      if (idleRef.current) {
        idleRef.current = false;
        setIdle(false);
      }
      arm();
    };
    const evs = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    arm();
    return () => {
      evs.forEach((e) => window.removeEventListener(e, onActivity));
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled, ms]);

  return idle;
}

/** Optimistic like toggle shared by every player. */
export function useTrackLike(trackId?: string) {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s: any) => s.isAuthenticated);

  const { data: likedTrackIds } = useQuery({
    queryKey: ["liked-track-ids"],
    queryFn: async () => {
      try {
        const res = await api.get("/tracks/liked");
        const arr = Array.isArray(res.data) ? res.data : res.data?.items || [];
        return arr.map((t: any) => t.id) as string[];
      } catch {
        return [] as string[];
      }
    },
    staleTime: 1000 * 60 * 5,
    enabled: isAuthenticated !== false,
  });

  const mutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/tracks/${id}/like`);
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ["liked-track-ids"] });
      const previous = queryClient.getQueryData<string[]>(["liked-track-ids"]);
      queryClient.setQueryData(
        ["liked-track-ids"],
        previous ? (previous.includes(id) ? previous.filter((x) => x !== id) : [...previous, id]) : [id]
      );
      return { previous };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["liked-track-ids"], ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["liked-track-ids"] });
      queryClient.invalidateQueries({ queryKey: ["liked-tracks"] });
    },
  });

  const liked = !!trackId && !!likedTrackIds?.includes(trackId);
  return { liked, toggle: () => trackId && mutation.mutate(trackId) };
}
