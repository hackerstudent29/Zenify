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
const SFTiming = () => (<Svg><circle cx="12" cy="13" r="7.5" /><path d="M12 13V9M9.5 3h5" /></Svg>);
const SFMinus = () => (<Svg size={14}><path d="M6 12h12" /></Svg>);
const SFPlus = () => (<Svg size={14}><path d="M12 6v12M6 12h12" /></Svg>);
const SFArrowDown = () => (<Svg size={14}><path d="M12 5v14M6 13l6 6 6-6" /></Svg>);

const fmt = (ms: number) => `${ms > 0 ? "+" : ""}${(ms / 1000).toFixed(1)}s`;

export interface LyricsToolbarProps {
  /** where the capsule floats (it is opaque, so lyrics are hidden behind it) */
  placement: "bottom" | "top-right";
  canTranslate: boolean;
  isRomanized: boolean;
  romanizedLabel: string;
  onModeChange: (romanized: boolean) => void;
  showOffset: boolean;
  offsetMs: number;
  onOffset: (deltaMs: number) => void;
  onClose?: () => void;
  hidden?: boolean;
}

/**
 * One frosted capsule instead of three loose pills:
 *   [ Original | Tanglish ] · [ ⏱ ]  (⏱ expands into  − +0.3s +  and folds back by itself)
 * Solid fill (no backdrop-filter): nothing shows through it, and nothing re-blurs while lyrics move.
 */
export function LyricsToolbar(p: LyricsToolbarProps) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const arm = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 3500);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { if (p.hidden) setOpen(false); }, [p.hidden]);

  if (!p.canTranslate && !p.showOffset && !p.onClose) return null;

  const step = (d: number) => { p.onOffset(d); arm(); };
  const offsetActive = p.offsetMs !== 0;

  return (
    <div
      className={cn(
        "pointer-events-none absolute z-30 flex",
        p.placement === "bottom" ? "inset-x-0 bottom-3 justify-center" : "right-3 top-2 justify-end"
      )}
    >
      <motion.div
        initial={false}
        animate={{
          opacity: p.hidden ? 0 : 1,
          y: p.hidden ? (p.placement === "bottom" ? 14 : -10) : 0,
          scale: p.hidden ? 0.95 : 1,
        }}
        transition={{ ...SPRING_SOFT, opacity: { duration: 0.2 } }}
        style={{ pointerEvents: p.hidden ? "none" : "auto" }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <LayoutGroup id={uid}>
          <motion.div
            layout
            transition={{ layout: SPRING_SOFT }}
            style={{ borderRadius: 999 }}
            className="flex items-center gap-1 border border-white/[0.12] bg-[#1d1d20] p-[3px] shadow-[0_10px_30px_rgba(0,0,0,0.55)]"
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
                      className="relative h-7 rounded-full px-3 text-[12px] font-semibold tracking-[-0.01em]"
                    >
                      {active && (
                        <motion.span
                          layoutId="lyr-seg"
                          transition={SPRING}
                          style={{ borderRadius: 999 }}
                          className="absolute inset-0 bg-white/[0.22]"
                        />
                      )}
                      <span className={cn("relative transition-colors duration-200", active ? "text-white" : "text-white/55")}>{o.label}</span>
                    </SpringButton>
                  );
                })}
              </motion.div>
            )}

            {p.canTranslate && p.showOffset && <span className="mx-0.5 h-4 w-px bg-white/15" />}

            {/* Timing */}
            {p.showOffset && (
              <motion.div layout="position" className="flex items-center">
                <SpringButton
                  onClick={() => { setOpen((o) => !o); arm(); }}
                  title="Adjust lyrics timing"
                  className={cn(
                    "h-7 gap-1.5 rounded-full px-2.5 text-[12px] font-semibold tabular-nums transition-colors duration-200",
                    open ? "bg-white/[0.22] text-white" : offsetActive ? "text-brand" : "text-white/60 hover:text-white"
                  )}
                >
                  <SFTiming />
                  {!open && offsetActive && <span>{fmt(p.offsetMs)}</span>}
                </SpringButton>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      key="stepper"
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: "auto", opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ width: SPRING_SOFT, opacity: { duration: 0.18 } }}
                      className="flex items-center overflow-hidden"
                    >
                      <SpringButton onClick={() => step(-100)} title="Lyrics earlier −0.1s" className="ml-1 h-7 w-7 rounded-full text-white/80 hover:bg-white/10">
                        <SFMinus />
                      </SpringButton>
                      <SpringButton
                        onClick={() => { p.onOffset(0); arm(); }}
                        title="Reset"
                        className={cn("h-7 min-w-[46px] rounded-full px-1 text-[12px] font-bold tabular-nums", offsetActive ? "text-brand" : "text-white/70")}
                      >
                        {fmt(p.offsetMs)}
                      </SpringButton>
                      <SpringButton onClick={() => step(100)} title="Lyrics later +0.1s" className="h-7 w-7 rounded-full text-white/80 hover:bg-white/10">
                        <SFPlus />
                      </SpringButton>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {p.onClose && (
              <motion.div layout="position" className="flex items-center">
                <span className="mx-0.5 h-4 w-px bg-white/15" />
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
export function LyricsSyncPill({ show, onSync, position = "bottom" }: { show: boolean; onSync: () => void; position?: "top" | "bottom" }) {
  return (
    <div className={cn("pointer-events-none absolute inset-x-0 z-40 flex justify-center", position === "top" ? "top-2" : "bottom-3")}>
      <AnimatePresence>
        {show && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: position === "top" ? -18 : 18, scale: 0.88 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: position === "top" ? -12 : 12, scale: 0.92 }}
            transition={{ y: SPRING, scale: SPRING, opacity: { duration: 0.18 } }}
            whileTap={{ scale: 0.93 }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onSync(); }}
            className="pointer-events-auto flex h-9 cursor-pointer select-none items-center gap-1.5 rounded-full bg-white/95 pl-3 pr-4 text-[13px] font-semibold text-black shadow-[0_10px_30px_rgba(0,0,0,0.45)] outline-none"
          >
            <SFArrowDown />
            Now Playing
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
