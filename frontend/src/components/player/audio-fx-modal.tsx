"use client";

import { motion, AnimatePresence, useMotionValue, animate, useDragControls } from "framer-motion";
import { useUIStore } from "@/store/ui";
import { usePlayerStore } from "@/store/player";
import {
  X,
  SlidersHorizontal,
  Activity,
  Clock,
  Waves,
  Disc
} from "lucide-react";
import * as Slider from "@radix-ui/react-slider";
import { useEffect, useRef, useState, memo } from "react";
import { cn } from "@/lib/utils";
import { audioEngine } from "@/lib/audio-engine";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useAuthStore } from "@/store/authStore";

/* ─────────────────────────────────────────────────────────────────────────────
   StudioFX Internal Controls (Equalizer, Reverb, Spatial 8D, DJ Pitch/Speed)
   Unified directly within the StudioFX dialog module
───────────────────────────────────────────────────────────────────────────── */
interface AudioFxControlsProps {
  className?: string;
}

const AudioFxControls = memo(function AudioFxControls({ className }: AudioFxControlsProps) {
  const audioFx = usePlayerStore(state => state.audioFx);
  const setFx = usePlayerStore(state => state.setFx);

  const [localEq, setLocalEq] = useState(audioFx.eq);
  useEffect(() => {
    setLocalEq(audioFx.eq);
  }, [audioFx.eq]);

  const eqLabels = ["Bass", "Mid", "Treble"];

  return (
    <div className={cn("flex flex-col space-y-8 scrollbar-hide", className)}>
      <div className="flex items-center justify-between pb-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-brand" />
          <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">Studio Audio Suite</h3>
        </div>
        <button
          onClick={() => {
            audioEngine.resume();
            audioEngine.resetAll();
            setFx({ eq: [0, 0, 0], reverb: 'none', is8D: false, direction8D: 'clockwise', speed8D: 0.15, speed: 1, pitch: 1 });
          }}
          className="text-[9px] font-bold uppercase tracking-widest text-brand/70 hover:text-brand transition-colors"
        >
          Reset All
        </button>
      </div>

      {/* EQ Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={14} className="text-white/40" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">Equalizer</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 pb-4 border-b border-white/5">
          {localEq.map((val, i) => (
            <div key={i} className="flex flex-col items-center gap-3">
              <div
                className="h-[100px] w-10 flex items-center justify-center"
                style={{ touchAction: 'none' }}
                onTouchMove={(e) => e.stopPropagation()}
              >
                <Slider.Root
                  orientation="vertical"
                  className="relative flex flex-col items-center select-none h-full"
                  style={{ width: 16, touchAction: 'none' }}
                  value={[val]}
                  max={12}
                  min={-12}
                  step={1}
                  onValueChange={([newVal]) => {
                    audioEngine.resume();
                    audioEngine.setEq(i, newVal);
                    const newEq = [...localEq];
                    newEq[i] = newVal;
                    setLocalEq(newEq);
                  }}
                  onValueCommit={([newVal]) => {
                    const newEq = [...localEq];
                    newEq[i] = newVal;
                    setFx({ eq: newEq });
                  }}
                  onDoubleClick={() => {
                    audioEngine.setEq(i, 0);
                    const newEq = [...localEq];
                    newEq[i] = 0;
                    setLocalEq(newEq);
                    setFx({ eq: newEq });
                  }}
                >
                  <Slider.Track className="bg-white/10 relative grow rounded-full w-[4px]">
                    <Slider.Range className="absolute bg-brand w-full rounded-full" />
                  </Slider.Track>
                  <Slider.Thumb
                    className="block w-5 h-5 bg-white rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.6)] focus:outline-none transition-transform cursor-grab active:cursor-grabbing"
                    style={{ touchAction: 'none' }}
                  />
                </Slider.Root>
              </div>
              <div className="text-center">
                <span className="text-[9px] font-black text-white/30 uppercase tracking-wider">{eqLabels[i]}</span>
                <div className="text-[8px] text-white/20 font-mono tabular-nums">{val > 0 ? `+${val}` : val}</div>
              </div>
            </div>
          ))}
        </div>

        {/* EQ Presets */}
        <div className="space-y-2">
          <div className="flex justify-between text-[8px] font-bold text-white/30 uppercase tracking-widest">
            <span>EQ Presets</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                audioEngine.resume();
                [0, 1, 2].forEach(idx => audioEngine.setEq(idx, 0));
                setFx({ eq: [0, 0, 0] });
              }}
              className={cn(
                "px-2 py-1.5 rounded-lg border text-[9px] font-bold transition-all",
                JSON.stringify(audioFx.eq) === JSON.stringify([0, 0, 0])
                  ? "bg-white/5 border-white/20 text-white"
                  : "border-white/10 text-white/60 hover:bg-white/5 hover:text-white"
              )}
            >
              Flat
            </button>
            <button
              onClick={() => {
                audioEngine.resume();
                const isSelected = JSON.stringify(audioFx.eq) === JSON.stringify([6, 1, 3]);
                const targetEq = isSelected ? [0, 0, 0] : [6, 1, 3];
                targetEq.forEach((val, idx) => audioEngine.setEq(idx, val));
                setFx({ eq: targetEq });
              }}
              className={cn(
                "px-2 py-1.5 rounded-lg border text-[9px] font-bold transition-all",
                JSON.stringify(audioFx.eq) === JSON.stringify([6, 1, 3])
                  ? "bg-brand/10 border-brand/30 text-brand shadow-sm"
                  : "border-white/10 text-white/60 hover:bg-white/5 hover:text-white"
              )}
            >
              Bass Boost
            </button>
            <button
              onClick={() => {
                audioEngine.resume();
                const isSelected = JSON.stringify(audioFx.eq) === JSON.stringify([-2, 5, 2]);
                const targetEq = isSelected ? [0, 0, 0] : [-2, 5, 2];
                targetEq.forEach((val, idx) => audioEngine.setEq(idx, val));
                setFx({ eq: targetEq });
              }}
              className={cn(
                "px-2 py-1.5 rounded-lg border text-[9px] font-bold transition-all",
                JSON.stringify(audioFx.eq) === JSON.stringify([-2, 5, 2])
                  ? "bg-brand/10 border-brand/30 text-brand shadow-sm"
                  : "border-white/10 text-white/60 hover:bg-white/5 hover:text-white"
              )}
            >
              Vocal
            </button>
          </div>
        </div>

        {/* Reverb Presets */}
        <div className="space-y-2 pt-2">
          <div className="flex justify-between text-[8px] font-bold text-white/30 uppercase tracking-widest">
            <span>Reverb Space</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                audioEngine.resume();
                audioEngine.setReverb('none');
                audioEngine.setReverbMix(0);
                setFx({ reverb: 'none' });
              }}
              className={cn(
                "px-2 py-1.5 rounded-lg border text-[9px] font-bold transition-all",
                audioFx.reverb === 'none' ? "bg-white/5 border-white/20 text-white" : "border-white/10 text-white/60 hover:bg-white/5 hover:text-white"
              )}
            >
              None
            </button>
            <button
              onClick={() => {
                audioEngine.resume();
                const newVal = audioFx.reverb === 'warehouse' ? 'none' : 'warehouse';
                audioEngine.setReverb(newVal);
                audioEngine.setReverbMix(newVal === 'none' ? 0 : 0.6);
                setFx({ reverb: newVal });
              }}
              className={cn(
                "px-2 py-1.5 rounded-lg border text-[9px] font-bold transition-all",
                audioFx.reverb === 'warehouse' ? "bg-zinc-900/10 border-brand/30 text-brand shadow-sm" : "border-white/10 text-brand/60 hover:bg-white/5 hover:text-brand"
              )}
            >
              Small Hall
            </button>
            <button
              onClick={() => {
                audioEngine.resume();
                const newVal = audioFx.reverb === 'cathedral' ? 'none' : 'cathedral';
                audioEngine.setReverb(newVal);
                audioEngine.setReverbMix(newVal === 'none' ? 0 : 0.7);
                setFx({ reverb: newVal });
              }}
              className={cn(
                "px-2 py-1.5 rounded-lg border text-[9px] font-bold transition-all",
                audioFx.reverb === 'cathedral' ? "bg-zinc-900/10 border-brand/30 text-brand shadow-sm" : "border-white/10 text-brand/60 hover:bg-white/5 hover:text-brand"
              )}
            >
              Church
            </button>
          </div>
        </div>
      </div>

      {/* Spatial & 8D */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Waves size={14} className="text-white/40" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">Spatial Engine</span>
        </div>
        <div className="space-y-3">
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              audioEngine.resume();
              const nextVal = !audioFx.is8D;
              audioEngine.toggle8D(nextVal, audioFx.direction8D, audioFx.speed8D);
              setFx({ is8D: nextVal });
            }}
            className={cn(
              "w-full flex items-center justify-center gap-2 p-3 rounded-xl border transition-all duration-300",
              audioFx.is8D
                ? "bg-zinc-900/10 border-brand/50 text-brand shadow-md"
                : "bg-white/5 border-white/5 text-brand/40 hover:bg-white/10"
            )}
          >
            <Disc size={14} className={cn(audioFx.is8D && "animate-spin")} style={{ animationDuration: '3s' }} />
            <span className="text-[10px] font-black uppercase tracking-widest">8D Spatializer</span>
          </motion.button>

          <AnimatePresence>
            {audioFx.is8D && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="relative flex p-1 bg-black/40 rounded-xl border border-white/5 overflow-hidden"
              >
                <motion.div
                  className="absolute inset-y-1 bg-brand rounded-lg shadow-sm"
                  initial={false}
                  animate={{
                    left: audioFx.direction8D === 'clockwise' ? '4px' : 'calc(50% + 2px)',
                    right: audioFx.direction8D === 'clockwise' ? 'calc(50% + 2px)' : '4px',
                  }}
                  transition={{ type: "tween", duration: 0.15, ease: "circOut" }}
                />

                <button
                  onClick={() => {
                    audioEngine.toggle8D(true, 'clockwise', audioFx.speed8D);
                    setFx({ direction8D: 'clockwise' });
                  }}
                  className={cn(
                    "relative flex-1 py-1.5 z-10 text-[10px] font-black uppercase tracking-widest transition-none",
                    audioFx.direction8D === 'clockwise' ? "text-black" : "text-brand/60 hover:text-brand"
                  )}
                >
                  Clockwise
                </button>
                <button
                  onClick={() => {
                    audioEngine.toggle8D(true, 'counter-clockwise', audioFx.speed8D);
                    setFx({ direction8D: 'counter-clockwise' });
                  }}
                  className={cn(
                    "relative flex-1 py-1.5 z-10 text-[10px] font-black uppercase tracking-widest transition-none",
                    audioFx.direction8D === 'counter-clockwise' ? "text-black" : "text-brand/60 hover:text-brand"
                  )}
                >
                  Counter
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* DJ Controls */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-white/40" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">DJ Speed / Pitch</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              audioEngine.resume();
              if (audioFx.speed === 1.5 && audioFx.pitch === 1.5) {
                setFx({ speed: 1, pitch: 1 });
              } else {
                setFx({ speed: 1.5, pitch: 1.5 });
              }
            }}
            className={cn(
              "flex flex-col items-center p-2 rounded-xl border transition-all",
              (audioFx.speed === 1.5 && audioFx.pitch === 1.5)
                ? "bg-pink-500/10 border-pink-500/20 text-pink-500"
                : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
            )}
          >
            <span className="text-[9px] font-black uppercase">Nightcore</span>
            <span className="text-[7px] opacity-60">1.5x Speed Up</span>
          </button>
          <button
            onClick={() => {
              audioEngine.resume();
              if (audioFx.speed === 0.75 && audioFx.pitch === 0.75) {
                setFx({ speed: 1, pitch: 1 });
              } else {
                setFx({ speed: 0.75, pitch: 0.75 });
              }
            }}
            className={cn(
              "flex flex-col items-center p-2 rounded-xl border transition-all",
              (audioFx.speed === 0.75 && audioFx.pitch === 0.75)
                ? "bg-blue-500/10 border-blue-500/20 text-blue-500"
                : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
            )}
          >
            <span className="text-[9px] font-black uppercase">Daycore</span>
            <span className="text-[7px] opacity-60">0.75x Slowed</span>
          </button>
        </div>

        <div className="space-y-3 px-1">
          <div className="flex justify-between text-[10px] font-bold text-white/50 tracking-widest uppercase">
            <span>Song Speed</span>
            <span>{audioFx.speed.toFixed(2)}x</span>
          </div>
          <div
            style={{ touchAction: 'none' }}
            onTouchMove={(e) => e.stopPropagation()}
          >
            <Slider.Root
              className="relative flex items-center select-none h-6 cursor-pointer"
              style={{ touchAction: 'none' }}
              value={[audioFx.speed * 100]}
              max={200}
              min={50}
              onValueChange={([val]) => {
                const newSpeed = val / 100;
                audioEngine.resume();
                audioEngine.setPlaybackSpeed(newSpeed, audioFx.pitch === 1);
                setFx({ speed: newSpeed });
              }}
              onDoubleClick={() => setFx({ speed: 1, pitch: 1 })}
            >
              <Slider.Track className="bg-white/8 relative grow rounded-full h-[4px]">
                <Slider.Range className="absolute bg-brand/60 h-full" />
              </Slider.Track>
              <Slider.Thumb
                className="block w-4 h-4 bg-white rounded-full shadow-2xl focus:outline-none active:scale-125 transition-transform"
                style={{ touchAction: 'none' }}
              />
            </Slider.Root>
          </div>
        </div>
      </div>
    </div>
  );
});

// Alias export for backward compatibility
export const AudioFxMenu = AudioFxControls;

/* ─────────────────────────────────────────────────────────────────────────────
   StudioFX Modal Dialog & Bottom Sheet View
───────────────────────────────────────────────────────────────────────────── */
export function AudioFxModal() {
  const { isAudioFxOpen, setAudioFxOpen } = useUIStore();
  const isMobile = useIsMobile();
  const { user } = useAuthStore();
  const isGlassmorphism = true;

  // ── Scroll lock ──────────────────────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = isAudioFxOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isAudioFxOpen]);

  const sheetRef = useRef<HTMLDivElement>(null);
  const dragY = useMotionValue(0);
  const dragControls = useDragControls();

  return (
    <AnimatePresence>
      {isAudioFxOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="fx-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setAudioFxOpen(false)}
            className="fixed inset-0 z-[1400] bg-black/50 backdrop-blur-sm"
          />

          {/* Sheet / Popover */}
          <div className={cn(
            "fixed z-[1500] pointer-events-none",
            isMobile
              ? "bottom-0 left-0 right-0"
              : "bottom-[44px] right-6 w-[340px]"
          )}>
            <motion.div
              key="fx-sheet"
              ref={sheetRef}
              style={isMobile ? { y: dragY } : {}}
              drag={isMobile ? "y" : false}
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0 }}
              dragElastic={0.05}
              onDragEnd={(_, info) => {
                if (info.velocity.y > 500 || info.offset.y > 150) {
                  setAudioFxOpen(false);
                } else {
                  animate(dragY, 0, { type: "spring", stiffness: 400, damping: 36 });
                }
              }}
              // Mobile: slide up from bottom with bouncy spring
              initial={isMobile
                ? { y: "100%" }
                : { opacity: 0, y: 16, scale: 0.96 }
              }
              animate={isMobile
                ? { y: 0 }
                : { opacity: 1, y: 0, scale: 1 }
              }
              exit={isMobile
                ? { y: "100%", transition: { type: "tween", duration: 0.22, ease: [0.4, 0, 1, 1] } }
                : { opacity: 0, y: 12, scale: 0.96, transition: { duration: 0.18 } }
              }
              transition={isMobile
                ? { type: "spring", stiffness: 420, damping: 40, mass: 0.9 }
                : { type: "spring", stiffness: 380, damping: 32 }
              }
              className={cn(
                "relative border-white/[0.08] shadow-2xl pointer-events-auto overflow-hidden will-change-transform",
                isGlassmorphism
                  ? "bg-white/5 backdrop-blur-xl border border-white/10 ring-1 ring-white/5"
                  : "bg-[#101012]",
                isMobile
                  ? "border-t rounded-t-[40px]"
                  : "border rounded-[20px]"
              )}
            >
              {/* Drag handle / Header area */}
              <div
                className="cursor-grab active:cursor-grabbing select-none touch-none"
                onPointerDown={(e) => {
                  if (isMobile) {
                    dragControls.start(e);
                  }
                }}
              >
                {/* Mobile drag pill */}
                {isMobile && (
                  <div className="flex justify-center pt-3 pb-1">
                    <div className="w-9 h-[3.5px] rounded-full bg-white/20" />
                  </div>
                )}

                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-4 pb-2">
                  <div>
                    <h2 className="text-xs font-black uppercase tracking-[0.22em] text-brand">Studio FX</h2>
                    <p className="text-[9px] font-semibold text-white/30 tracking-wide mt-0.5">Audio Engine v4</p>
                  </div>
                  <button
                    onClick={() => setAudioFxOpen(false)}
                    onPointerDown={(e) => e.stopPropagation()} // Prevent drag trigger from close button
                    className="w-8 h-8 rounded-full bg-white/5 border border-white/[0.07] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all active:scale-90"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              {/* Scrollable FX content */}
              <div
                className="px-5 pb-6 overflow-y-auto overscroll-contain"
                style={{
                  maxHeight: isMobile ? '72vh' : '60vh',
                  touchAction: 'pan-y',
                }}
              >
                <AudioFxControls className="space-y-7 pt-2" />
              </div>

              {/* Status bar */}
              <div className="px-5 py-2.5 bg-white/[0.025] border-t border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-brand animate-pulse" />
                  <span className="text-[8px] font-black uppercase tracking-widest text-white/25">32-Bit Float</span>
                </div>
                <span className="text-[8px] font-bold text-white/15">ZENIFY ENGINE</span>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
