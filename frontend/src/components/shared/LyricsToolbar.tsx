"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { SPRING, SPRING_SOFT, SpringButton, SFClose } from "@/components/player/PlayerKit";

const Svg = ({ children, size = 15 }: { children: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const SFTiming = ({ size = 15 }: { size?: number }) => (<Svg size={size}><circle cx="12" cy="13" r="7.5" /><path d="M12 13V9M9.5 3h5" /></Svg>);
const SFMinus = ({ size = 14 }: { size?: number }) => (<Svg size={size}><path d="M6 12h12" /></Svg>);
const SFPlus = ({ size = 14 }: { size?: number }) => (<Svg size={size}><path d="M12 6v12M6 12h12" /></Svg>);
const SFArrowDown = ({ size = 14 }: { size?: number }) => (<Svg size={size}><path d="M12 5v14M6 13l6 6 6-6" /></Svg>);

const fmt = (ms: number) => `${ms > 0 ? "+" : ""}${(ms / 1000).toFixed(1)}s`;

/** Sidebar-only springs: a touch snappier + a hint of overshoot so the capsule feels alive but small. */
const SPRING_COMPACT = { type: "spring" as const, stiffness: 520, damping: 34, mass: 0.7 };
const SPRING_COMPACT_SOFT = { type: "spring" as const, stiffness: 380, damping: 32, mass: 0.8 };

export interface LyricsToolbarProps {
  /** where the capsule floats (it is opaque, so lyrics are hidden behind it) */
  placement: "bottom" | "top-right" | "top-left";
  canTranslate: boolean;
  isRomanized: boolean;
  romanizedLabel: string;
  onModeChange: (romanized: boolean) => void;
  showOffset: boolean;
  offsetMs: number;
  onOffset: (deltaMs: number) => void;
  onClose?: () => void;
  hidden?: boolean;
  /** smaller capsule used by the sidebar lyrics */
  compact?: boolean;
}

/**
 * One frosted capsule instead of three loose pills:
 *   [ Original | Tanglish ] · [ ⏱ ]  (⏱ expands into  − +0.3s +  and folds back by itself)
 * Solid fill (no backdrop-filter): nothing shows through it, and nothing re-blurs while lyrics move.
 *
 * `compact` (sidebar): 24px tall controls, 11px type, tighter paddings, softer shadow.
 */
export function LyricsToolbar(p: LyricsToolbarProps) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const compact = !!p.compact;

  const arm = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 3500);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { if (p.hidden) setOpen(false); }, [p.hidden]);

  if (!p.canTranslate && !p.showOffset && !p.onClose) return null;

  const step = (d: number) => { p.onOffset(d); arm(); };
  const offsetActive = p.offsetMs !== 0;

  const springMain = compact ? SPRING_COMPACT : SPRING;
  const springSoft = compact ? SPRING_COMPACT_SOFT : SPRING_SOFT;

  // sizing tokens (regular vs compact)
  const btnH = compact ? "h-6" : "h-7";
  const iconBtn = compact ? "h-6 w-6" : "h-7 w-7";
  const segPad = compact ? "px-2.5" : "px-3";
  const fontSz = compact ? "text-[11px]" : "text-[12px]";
  const iconSz = compact ? 13 : 15;
  const stepIconSz = compact ? 12 : 14;

  return (
    <div
      className={cn(
        "pointer-events-none absolute z-30 flex",
        p.placement === "bottom"
          ? "inset-x-0 bottom-3 justify-center"
          : p.placement === "top-left"
          ? compact
            ? "left-3 top-3 justify-start"
            : "left-4 top-3 justify-start"
          : "right-24 top-0.5 justify-end"
      )}
    >
      <motion.div
        initial={false}
        animate={{
          opacity: p.hidden ? 0 : 1,
          y: p.hidden ? (p.placement === "bottom" ? 14 : -10) : 0,
          scale: p.hidden ? 0.95 : 1,
        }}
        transition={{ ...springSoft, opacity: { duration: 0.2 } }}
        style={{ pointerEvents: p.hidden ? "none" : "auto", transformOrigin: p.placement === "top-left" ? "left top" : "center" }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <LayoutGroup id={uid}>
          <motion.div
            layout
            transition={{ layout: springSoft }}
            style={{ borderRadius: 999 }}
            className={cn(
              "flex items-center rounded-full border border-white/20 bg-white/10 dark:bg-black/25 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)]",
              compact
                ? "gap-0.5 p-[2px]"
                : "gap-1 p-[3px]"
            )}
          >
            {/* Language */}
            {p.canTranslate && (
              <motion.div layout="position" className="relative flex items-center" role="group" aria-label="Lyrics language">
                {[
                  { k: false, label: "Original" },
                  { k: true, label: p.romanizedLabel || "English" },
                ].map((o) => {
                  const active = p.isRomanized === o.k;
                  return (
                    <SpringButton
                      key={String(o.k)}
                      onClick={() => p.onModeChange(o.k)}
                      className={cn("relative rounded-full font-semibold tracking-[-0.01em]", btnH, segPad, fontSz)}
                    >
                      {active && (
                        <motion.span
                          layoutId="lyr-seg"
                          transition={springMain}
                          style={{ borderRadius: 999 }}
                          className="absolute inset-0 bg-white/20 backdrop-blur-md shadow-sm"
                        />
                      )}
                      <span className={cn("relative transition-colors duration-200", active ? "text-white font-bold" : "text-white/60 hover:text-white")}>{o.label}</span>
                    </SpringButton>
                  );
                })}
              </motion.div>
            )}

            {p.canTranslate && p.showOffset && <span className={cn("mx-0.5 w-px bg-white/20", compact ? "h-3" : "h-4")} />}

            {/* Timing */}
            {p.showOffset && (
              <motion.div layout="position" className="flex items-center">
                <SpringButton
                  onClick={() => { setOpen((o) => !o); arm(); }}
                  title="Adjust lyrics timing"
                  className={cn(
                    "gap-1.5 rounded-full font-semibold tabular-nums transition-colors duration-200",
                    btnH,
                    fontSz,
                    compact ? "px-2" : "px-2.5",
                    open ? "bg-white/20 text-white" : offsetActive ? "text-brand bg-white/10" : "text-white/70 hover:text-white hover:bg-white/10"
                  )}
                >
                  <SFTiming size={iconSz} />
                  {!open && offsetActive && <span>{fmt(p.offsetMs)}</span>}
                </SpringButton>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      key="stepper"
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: "auto", opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ width: springSoft, opacity: { duration: 0.18 } }}
                      className="flex items-center overflow-hidden"
                    >
                      <SpringButton onClick={() => step(-500)} title="Lyrics earlier −0.5s" className={cn("ml-1 rounded-full text-white/80 hover:bg-white/15", iconBtn)}>
                        <SFMinus size={stepIconSz} />
                      </SpringButton>
                      <SpringButton
                        onClick={() => { p.onOffset(0); arm(); }}
                        title="Reset"
                        className={cn(
                          "rounded-full px-1 font-bold tabular-nums hover:bg-white/15 transition-colors",
                          btnH,
                          fontSz,
                          compact ? "min-w-[40px]" : "min-w-[46px]",
                          offsetActive ? "text-brand" : "text-white/70"
                        )}
                      >
                        {fmt(p.offsetMs)}
                      </SpringButton>
                      <SpringButton onClick={() => step(500)} title="Lyrics later +0.5s" className={cn("rounded-full text-white/80 hover:bg-white/15", iconBtn)}>
                        <SFPlus size={stepIconSz} />
                      </SpringButton>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {p.onClose && (
              <motion.div layout="position" className="flex items-center">
                <span className="mx-0.5 h-4 w-px bg-white/20" />
                <SpringButton onClick={p.onClose} title="Close lyrics" className="h-7 w-7 rounded-full text-white/70 hover:bg-white/10 hover:text-white">
                  <SFClose size={13} />
                </SpringButton>
              </motion.div>
            )}
          </motion.div>
        </LayoutGroup>
      </motion.div>
    </div>
  );
}

/** "Back to now" pill — appears while the user is browsing lyrics manually. */
export function LyricsSyncPill({
  show,
  onSync,
  position = "bottom",
  compact = false,
}: {
  show: boolean;
  onSync: () => void;
  position?: "top" | "bottom";
  /** smaller pill used by the sidebar lyrics */
  compact?: boolean;
}) {
  const spring = compact ? SPRING_COMPACT : SPRING;
  return (
    <div className={cn("pointer-events-none absolute inset-x-0 z-40 flex justify-center", position === "top" ? "top-2" : compact ? "bottom-4" : "bottom-3")}>
      <AnimatePresence>
        {show && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: position === "top" ? -18 : 18, scale: 0.88 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: position === "top" ? -12 : 12, scale: 0.92 }}
            transition={{ y: spring, scale: spring, opacity: { duration: 0.18 } }}
            whileTap={{ scale: 0.93 }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onSync(); }}
            className={cn(
              "pointer-events-auto flex cursor-pointer select-none items-center rounded-full bg-white/95 font-semibold text-black outline-none",
              compact
                ? "h-7 gap-1 pl-2.5 pr-3 text-[12px] shadow-[0_6px_20px_rgba(0,0,0,0.45)]"
                : "h-9 gap-1.5 pl-3 pr-4 text-[13px] shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
            )}
          >
            <SFArrowDown size={compact ? 12 : 14} />
            Now Playing
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}