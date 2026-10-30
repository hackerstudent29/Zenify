"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  AnimatePresence,
  Reorder,
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionProps,
} from "framer-motion";
import * as Slider from "@radix-ui/react-slider";
import {
  AudioLines,
  Flame,
  Headphones,
  Landmark,
  Mic,
  Moon,
  Orbit,
  Radio,
  Repeat,
  SlidersHorizontal,
  SlidersVertical,
  Sparkles,
  Speaker,
  Waves,
  X,
  type LucideIcon,
} from "lucide-react";
import { useUIStore } from "@/store/ui";
import { usePlayerStore } from "@/store/player";
import { cn } from "@/lib/utils";
import {
  audioEngine,
  DEFAULT_AUDIO_FX,
  DEFAULT_CHAIN,
  filterFrequencies,
  sanitizeChain,
  type AudioFxSettings,
  type VocalMode,
} from "@/lib/audio-engine";
import { useIsMobile } from "@/hooks/useIsMobile";

/* ─────────────────────────────────────────────────────────────────────────────
   Motion tokens – one set of springs used everywhere
───────────────────────────────────────────────────────────────────────────── */
const SPRING_UI = { type: "spring", stiffness: 520, damping: 38, mass: 0.8 } as const;
const SPRING_SOFT = { type: "spring", stiffness: 380, damping: 34, mass: 0.9 } as const;
const SPRING_SHEET = { type: "spring", stiffness: 380, damping: 40, mass: 0.95 } as const;
const SPRING_POP = { type: "spring", stiffness: 440, damping: 30, mass: 0.8 } as const;

/* ─────────────────────────────────────────────────────────────────────────────
   Liquid-glass icon: tinted refractive squircle with specular highlight
───────────────────────────────────────────────────────────────────────────── */
type Hue = [string, string];

const GlassIcon = memo(function GlassIcon({
  icon: Icon,
  hue,
  size = 36,
  brand,
  spin,
}: {
  icon: LucideIcon;
  hue?: Hue;
  size?: number;
  brand?: boolean;
  spin?: { duration: number; dir: 1 | -1 } | null;
}) {
  const style = hue
    ? {
        background: `linear-gradient(150deg, ${hue[0]}, ${hue[1]})`,
        boxShadow: `inset 0 1px 0.5px rgba(255,255,255,0.75), inset 0 -8px 12px rgba(0,0,0,0.16), inset 0 0 0 0.5px rgba(255,255,255,0.32), 0 8px 16px -8px ${hue[1]}`,
      }
    : undefined;
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden text-white",
        brand &&
          "bg-gradient-to-br from-brand to-brand/60 shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.75),inset_0_-8px_12px_rgba(0,0,0,0.16),inset_0_0_0_0.5px_rgba(255,255,255,0.32)]"
      )}
      style={{ width: size, height: size, borderRadius: size * 0.3, ...style }}
    >
      <span className="pointer-events-none absolute inset-x-[8%] top-[3%] h-[48%] rounded-full bg-gradient-to-b from-white/60 to-white/0" />
      <motion.span
        className="relative grid place-items-center drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]"
        animate={spin ? { rotate: 360 * spin.dir } : { rotate: 0 }}
        transition={spin ? { repeat: Infinity, ease: "linear", duration: spin.duration } : { duration: 0 }}
      >
        <Icon size={Math.round(size * 0.5)} strokeWidth={1.75} />
      </motion.span>
    </span>
  );
});

/* ─────────────────────────────────────────────────────────────────────────────
   Presets
───────────────────────────────────────────────────────────────────────────── */
type Sound = Pick<
  AudioFxSettings,
  | "eq" | "reverb" | "reverbAmount" | "echo" | "echoTime" | "chorus"
  | "filter" | "drive" | "width" | "is8D" | "direction8D" | "speed8D"
>;

const BASE_SOUND: Sound = {
  eq: [0, 0, 0],
  reverb: "none",
  reverbAmount: 0.4,
  echo: 0,
  echoTime: 0.32,
  chorus: 0,
  filter: 0,
  drive: 0,
  width: 1,
  is8D: false,
  direction8D: "clockwise",
  speed8D: 0.15,
};
const mk = (o: Partial<Sound>): Sound => ({ ...BASE_SOUND, ...o, eq: [...(o.eq ?? BASE_SOUND.eq)] });

interface BuiltInPreset {
  id: string;
  name: string;
  blurb: string;
  icon: LucideIcon;
  hue: Hue;
  sound: Sound;
}

const PRESETS: BuiltInPreset[] = [
  { id: "original", name: "Original", blurb: "No processing", icon: AudioLines, hue: ["#a1a1a9", "#5b5b63"], sound: mk({}) },
  { id: "after-hours", name: "After Hours", blurb: "Warm and soft", icon: Moon, hue: ["#8f8cff", "#5e5ce6"], sound: mk({ eq: [3, -1, -2], reverb: "warehouse", reverbAmount: 0.25, chorus: 0.2, filter: -0.12, drive: 0.15 }) },
  { id: "immersive", name: "Immersive", blurb: "8D orbit, wide", icon: Orbit, hue: ["#6cc8ff", "#0a84ff"], sound: mk({ eq: [2, 0, 2], reverb: "warehouse", reverbAmount: 0.3, chorus: 0.25, width: 1.3, is8D: true, speed8D: 0.1 }) },
  { id: "clarity", name: "Studio Clarity", blurb: "Balanced, crisp", icon: Sparkles, hue: ["#6fe3b0", "#1fae7c"], sound: mk({ eq: [-1, 2, 3] }) },
  { id: "headphones", name: "Headphones", blurb: "Wide, intimate", icon: Headphones, hue: ["#ff8aa8", "#ff375f"], sound: mk({ eq: [2, 1, 1], chorus: 0.3, width: 1.35 }) },
  { id: "bass", name: "Bass Boost", blurb: "Deep low end", icon: Speaker, hue: ["#ffb05a", "#ff6a1a"], sound: mk({ eq: [7, 1, 2], drive: 0.2 }) },
  { id: "vocal", name: "Vocal Boost", blurb: "Voices up front", icon: Mic, hue: ["#ffd75a", "#ff9f0a"], sound: mk({ eq: [-2, 5, 2] }) },
  { id: "hall", name: "Concert Hall", blurb: "Live room feel", icon: Landmark, hue: ["#ffe27a", "#d99a00"], sound: mk({ eq: [1, 0, 1], reverb: "cathedral", reverbAmount: 0.4 }) },
  { id: "lofi", name: "Lo-Fi", blurb: "Dusty, mellow", icon: Radio, hue: ["#8ee67a", "#30b94d"], sound: mk({ eq: [3, 0, -3], filter: -0.3, chorus: 0.15, drive: 0.3, reverb: "warehouse", reverbAmount: 0.2 }) },
  { id: "dream", name: "Dream Echo", blurb: "Floaty repeats", icon: Waves, hue: ["#e49bff", "#a43be0"], sound: mk({ echo: 0.35, echoTime: 0.38, reverb: "cathedral", reverbAmount: 0.25, chorus: 0.2 }) },
];

const pickSound = (fx: AudioFxSettings): Sound =>
  mk({
    eq: fx.eq,
    reverb: fx.reverb,
    reverbAmount: fx.reverbAmount,
    echo: fx.echo,
    echoTime: fx.echoTime,
    chorus: fx.chorus,
    filter: fx.filter,
    drive: fx.drive,
    width: fx.width,
    is8D: fx.is8D,
    direction8D: fx.direction8D,
    speed8D: fx.speed8D,
  });

/** Canonical form so unused knobs never break preset matching. */
const canon = (s: Sound) =>
  JSON.stringify({
    eq: s.eq.map((v) => Math.round(v)),
    reverb: s.reverb,
    reverbAmount: s.reverb === "none" ? 0 : +s.reverbAmount.toFixed(2),
    echo: +s.echo.toFixed(2),
    echoTime: s.echo <= 0.001 ? 0 : +s.echoTime.toFixed(2),
    chorus: +s.chorus.toFixed(2),
    filter: +s.filter.toFixed(2),
    drive: +s.drive.toFixed(2),
    width: +s.width.toFixed(2),
    is8D: s.is8D,
    direction8D: s.is8D ? s.direction8D : "clockwise",
    speed8D: s.is8D ? +s.speed8D.toFixed(2) : 0,
  });

interface CustomPreset {
  id: string;
  name: string;
  sound: Partial<Sound>;
}
const LS_KEY = "zenify_fx_presets";

function loadPresets(): CustomPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((p) => p && p.id && p.name && p.sound) : [];
  } catch {
    return [];
  }
}

function useCustomPresets() {
  const [list, setList] = useState<CustomPreset[]>(loadPresets);
  const update = useCallback((next: CustomPreset[]) => {
    setList(next);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {}
  }, []);
  return [list, update] as const;
}

/* ─────────────────────────────────────────────────────────────────────────────
   FX store bridge
   live()   → straight to the audio graph while dragging (no store write)
   commit() → graph + store on release / tap
───────────────────────────────────────────────────────────────────────────── */
type FxPatch = Partial<AudioFxSettings>;

function useFx() {
  const fx = usePlayerStore((s) => s.audioFx);
  const setFx = usePlayerStore((s) => s.setFx);
  const live = useCallback((p: FxPatch) => audioEngine.applyFx(p), []);
  const commit = useCallback(
    (p: FxPatch) => {
      audioEngine.applyFx(p);
      setFx(p);
    },
    [setFx]
  );
  return { fx, live, commit };
}

/* ─────────────────────────────────────────────────────────────────────────────
   Primitives
───────────────────────────────────────────────────────────────────────────── */
function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "relative h-[28px] w-[46px] shrink-0 rounded-full outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-brand/60",
        checked ? "bg-brand" : "bg-white/20"
      )}
    >
      <motion.span
        aria-hidden
        className="absolute left-[2px] top-[2px] h-6 w-6 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.35)]"
        initial={false}
        animate={{ x: checked ? 18 : 0 }}
        whileTap={{ scaleX: 1.15 }}
        transition={SPRING_UI}
      />
    </button>
  );
}

interface SegOption<T extends string> {
  value: T;
  label: string;
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  small,
}: {
  value: T;
  options: SegOption<T>[];
  onChange: (v: T) => void;
  label: string;
  small?: boolean;
}) {
  const n = options.length;
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      role="group"
      aria-label={label}
      className="relative grid rounded-[11px] bg-black/25 p-[2px]"
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      <motion.span
        aria-hidden
        className="absolute inset-y-[2px] left-[2px] rounded-[9px] bg-white/[0.2] shadow-[0_1px_3px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.18)]"
        style={{ width: `calc((100% - 4px) / ${n})` }}
        initial={false}
        animate={{ x: `${idx * 100}%` }}
        transition={SPRING_UI}
      />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-10 truncate rounded-[9px] px-1 font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand/60",
              small ? "py-[7px] text-[12px]" : "py-[7px] text-[12.5px]",
              active ? "text-white" : "text-white/55 hover:text-white/80"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex min-h-[18px] items-center justify-between px-1">
        <h3 className="text-[12px] font-medium text-white/50">{title}</h3>
        {action}
      </div>
      <div className="overflow-hidden rounded-2xl bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] ring-1 ring-inset ring-white/[0.07]">
        {children}
      </div>
    </section>
  );
}

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("border-t border-white/[0.07] px-4 py-3 first:border-t-0", className)}>{children}</div>;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="px-1 text-[11px] leading-snug text-white/40">{children}</p>;
}

function TextButton({
  onClick,
  children,
  disabled,
  danger,
}: {
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-md px-1 text-[12px] font-medium outline-none transition-opacity active:opacity-50 focus-visible:ring-2 focus-visible:ring-brand/60 disabled:opacity-30",
        danger ? "text-red-400" : "text-brand"
      )}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   FxSlider – Radix slider, Apple-style thumb, local value so dragging never
   waits on the store.
───────────────────────────────────────────────────────────────────────────── */
interface FxSliderProps {
  title: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  orientation?: "horizontal" | "vertical";
  bipolar?: boolean;
  center?: number;
  snap?: number;
  disabled?: boolean;
  format?: (v: number) => string;
  onLive: (v: number) => void;
  onCommit: (v: number) => void;
}

const FxSlider = memo(function FxSlider({
  title,
  hint,
  value,
  min,
  max,
  step = 1,
  orientation = "horizontal",
  bipolar = false,
  center,
  snap = 0,
  disabled,
  format,
  onLive,
  onCommit,
}: FxSliderProps) {
  const vertical = orientation === "vertical";
  const [local, setLocal] = useState(value);
  const dragging = useRef(false);
  const latest = useRef(value);

  useEffect(() => {
    if (!dragging.current) {
      setLocal(value);
      latest.current = value;
    }
  }, [value]);

  const settle = (v: number) =>
    center !== undefined && snap > 0 && Math.abs(v - center) <= snap ? center : v;

  const pct = ((local - min) / (max - min)) * 100;
  const originPct = (((bipolar ? center ?? min : min) - min) / (max - min)) * 100;
  const from = Math.min(pct, originPct);
  const to = Math.max(pct, originPct);
  const rangeStyle = vertical
    ? { left: 0, right: 0, bottom: `${from}%`, height: `${to - from}%` }
    : { top: 0, bottom: 0, left: `${from}%`, width: `${to - from}%` };

  const text = format ? format(local) : String(local);

  const slider = (
    <Slider.Root
      aria-label={title}
      orientation={orientation}
      min={min}
      max={max}
      step={step}
      value={[local]}
      disabled={disabled}
      onPointerDown={() => {
        dragging.current = true;
      }}
      onPointerCancel={() => {
        if (dragging.current) {
          dragging.current = false;
          onCommit(latest.current);
        }
      }}
      onValueChange={([v]) => {
        const next = settle(v);
        latest.current = next;
        setLocal(next);
        onLive(next);
      }}
      onValueCommit={([v]) => {
        const next = settle(v);
        dragging.current = false;
        latest.current = next;
        onCommit(next);
      }}
      onDoubleClick={() => {
        if (center === undefined) return;
        latest.current = center;
        setLocal(center);
        onLive(center);
        onCommit(center);
      }}
      className={cn("relative flex select-none items-center", vertical ? "h-full w-8 flex-col" : "h-8 w-full")}
      style={{ touchAction: vertical ? "none" : "pan-y" }}
    >
      <Slider.Track className={cn("relative grow overflow-hidden rounded-full bg-white/[0.2]", vertical ? "w-[5px]" : "h-[5px]")}>
        <div className="absolute rounded-full bg-white" style={rangeStyle} />
      </Slider.Track>
      <Slider.Thumb asChild>
        <motion.span
          whileTap={{ scale: 1.2 }}
          transition={SPRING_UI}
          className="block h-[22px] w-[22px] rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.45),0_0_0_0.5px_rgba(0,0,0,0.12)] outline-none focus-visible:ring-4 focus-visible:ring-brand/40"
        />
      </Slider.Thumb>
    </Slider.Root>
  );

  if (vertical) {
    return (
      <div className={cn("flex flex-col items-center gap-2 transition-opacity duration-200", disabled && "opacity-40")}>
        <span className="text-[12px] font-medium tabular-nums text-white/70">{text}</span>
        <div className="h-[132px]">{slider}</div>
        <div className="text-center">
          <div className="text-[12px] font-medium text-white/85">{title}</div>
          {hint && <div className="text-[10px] text-white/35">{hint}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("transition-opacity duration-200", disabled && "opacity-40")}>
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] text-white/90">{title}</span>
        <span className="text-[12px] tabular-nums text-white/50">{text}</span>
      </div>
      {slider}
    </div>
  );
});

/* ─────────────────────────────────────────────────────────────────────────────
   Live spectrum
   Uses a dedicated analyser (float dB data), a gentle pink-noise tilt so highs
   are visible, and an auto-gain reference so loud masters never pin the bars.
───────────────────────────────────────────────────────────────────────────── */
const Spectrum = memo(function Spectrum() {
  const ref = useRef<HTMLCanvasElement>(null);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playingRef = useRef(isPlaying);
  playingRef.current = isPlaying;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const color = getComputedStyle(canvas).color;
    const BARS = 36;
    const levels = new Float32Array(BARS);
    let fbuf: Float32Array | null = null;
    let refDb = -50;
    let raf = 0;
    let last = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const vals = new Float32Array(BARS);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 33 || document.hidden) return;
      last = now;

      const analyser = audioEngine.getVizAnalyser();
      let live = false;
      if (analyser && playingRef.current) {
        if (!fbuf || fbuf.length !== analyser.frequencyBinCount) fbuf = new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatFrequencyData(fbuf as any);
        live = true;

        const binHz = audioEngine.getSampleRate() / analyser.fftSize;
        let curMax = -200;
        for (let i = 0; i < BARS; i++) {
          const f0 = 40 * Math.pow(16000 / 40, i / BARS);
          const f1 = 40 * Math.pow(16000 / 40, (i + 1) / BARS);
          const b0 = Math.max(1, Math.floor(f0 / binHz));
          const b1 = Math.max(b0 + 1, Math.ceil(f1 / binHz));
          let p = 0;
          for (let b = b0; b < b1 && b < fbuf.length; b++) {
            const db = Math.max(-120, fbuf[b]);
            p += Math.pow(10, db / 10);
          }
          const avgDb = 10 * Math.log10(p / (b1 - b0) + 1e-12);
          const fc = Math.sqrt(f0 * f1);
          const v = avgDb + 3.5 * Math.log2(fc / 500); // compensate natural spectral slope
          vals[i] = v;
          if (v > curMax) curMax = v;
        }
        // auto-gain: follow the loudest band, fast up / slow down
        refDb += (curMax - refDb) * (curMax > refDb ? 0.35 : 0.02);
      } else {
        refDb -= 0.4;
      }

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;
      const gap = 3;
      const bw = Math.max(1, (w - gap * (BARS - 1)) / BARS);

      for (let i = 0; i < BARS; i++) {
        const target = live ? Math.pow(Math.min(1, Math.max(0, (vals[i] - (refDb - 38)) / 38)), 1.25) : 0;
        // fast attack, slow release → feels physical
        levels[i] += (target - levels[i]) * (target > levels[i] ? 0.6 : 0.16);
        const bh = Math.max(2, levels[i] * h);
        const x = i * (bw + gap);
        ctx.globalAlpha = 0.45 + 0.55 * levels[i];
        ctx.beginPath();
        if ((ctx as any).roundRect) (ctx as any).roundRect(x, h - bh, bw, bh, Math.min(bw / 2, 3));
        else ctx.rect(x, h - bh, bw, bh);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="h-8 w-full text-brand [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]"
    />
  );
});

/* ─────────────────────────────────────────────────────────────────────────────
   Tabs
───────────────────────────────────────────────────────────────────────────── */
interface TabProps {
  fx: AudioFxSettings;
  live: (p: FxPatch) => void;
  commit: (p: FxPatch) => void;
}

/* ── Presets ───────────────────────────────────────────────────────────────── */
function PresetTile({
  name,
  blurb,
  icon,
  hue,
  active,
  onClick,
}: {
  name: string;
  blurb: string;
  icon: LucideIcon;
  hue: Hue;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      transition={SPRING_UI}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative flex items-center gap-2.5 rounded-2xl p-2.5 text-left outline-none ring-1 ring-inset transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand/70",
        active
          ? "bg-white/[0.16] ring-brand/70"
          : "bg-white/[0.08] ring-white/[0.07] hover:bg-white/[0.12]"
      )}
    >
      <GlassIcon icon={icon} hue={hue} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-white">{name}</span>
        <span className="block truncate text-[11px] text-white/50">{blurb}</span>
      </span>
      <AnimatePresence initial={false}>
        {active && (
          <motion.span
            key="dot"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={SPRING_POP}
            className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand"
          />
        )}
      </AnimatePresence>
    </motion.button>
  );
}

function PresetsTab({ fx, commit }: TabProps) {
  const [custom, setCustom] = useCustomPresets();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const activeKey = canon(pickSound(fx));
  const isActive = (s: Partial<Sound>) => !fx.bypass && canon(mk(s)) === activeKey;
  const apply = (s: Partial<Sound>) => {
    const full = mk(s);
    commit({ ...full, bypass: false });
  };

  const save = (e?: FormEvent) => {
    e?.preventDefault();
    const entry: CustomPreset = {
      id: `p-${Date.now()}`,
      name: (name.trim() || `My Preset ${custom.length + 1}`).slice(0, 24),
      sound: pickSound(fx),
    };
    setCustom([...custom, entry]);
    setNaming(false);
    setName("");
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map((p) => (
          <PresetTile
            key={p.id}
            name={p.name}
            blurb={p.blurb}
            icon={p.icon}
            hue={p.hue}
            active={isActive(p.sound)}
            onClick={() => apply(p.sound)}
          />
        ))}
      </div>

      <Section
        title="My Presets"
        action={<TextButton onClick={() => setNaming((v) => !v)}>{naming ? "Cancel" : "Save current"}</TextButton>}
      >
        <AnimatePresence initial={false}>
          {naming && (
            <motion.form
              key="naming"
              onSubmit={save}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={SPRING_SOFT}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <input
                  autoFocus
                  value={name}
                  maxLength={24}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Preset name"
                  className="min-w-0 flex-1 rounded-lg bg-black/30 px-3 py-2 text-[16px] text-white outline-none placeholder:text-white/30 focus:ring-2 focus:ring-brand/50 sm:text-[13px]"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-brand px-3 py-2 text-[13px] font-semibold text-white outline-none transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  Save
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {custom.length === 0 && !naming ? (
          <Row>
            <p className="text-[12px] leading-snug text-white/45">
              Dial in a sound you love, then save it here to bring it back in one tap.
            </p>
          </Row>
        ) : (
          custom.map((p) => (
            <Row key={p.id} className="flex items-center gap-2 py-2">
              <button
                type="button"
                onClick={() => apply(p.sound)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
              >
                <span className="truncate text-[13px] font-medium text-white">{p.name}</span>
                {isActive(p.sound) && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" />}
              </button>
              <TextButton danger onClick={() => setCustom(custom.filter((c) => c.id !== p.id))}>
                Delete
              </TextButton>
            </Row>
          ))
        )}
      </Section>
    </div>
  );
}

/* ── Tune (EQ, Filter, Warmth, Dynamics) ───────────────────────────────────── */
const EQ_BANDS = [
  { title: "Bass", hint: "110 Hz" },
  { title: "Mid", hint: "1.5 kHz" },
  { title: "Treble", hint: "8 kHz" },
];

const fmtHz = (h: number) =>
  h >= 1000 ? `${(h / 1000).toFixed(h >= 10000 ? 0 : 1)} kHz` : `${Math.round(h)} Hz`;

const fmtFilter = (v: number) => {
  if (Math.abs(v) < 0.03) return "Off";
  const { lowpass, highpass } = filterFrequencies(v);
  return v < 0 ? `Low-pass ${fmtHz(lowpass)}` : `High-pass ${fmtHz(highpass)}`;
};
const pctText = (v: number) => (v <= 0.005 ? "Off" : `${Math.round(v * 100)}%`);

function TuneTab({ fx, live, commit }: TabProps) {
  const setBand = (i: number, v: number, final: boolean) => {
    const eq = [...fx.eq];
    eq[i] = v;
    (final ? commit : live)({ eq });
  };
  const flat = fx.eq.every((v) => v === 0);

  return (
    <div className="space-y-5">
      <Section title="Equalizer" action={<TextButton disabled={flat} onClick={() => commit({ eq: [0, 0, 0] })}>Reset</TextButton>}>
        <div className="grid grid-cols-3 px-2 py-4">
          {EQ_BANDS.map((b, i) => (
            <FxSlider
              key={b.title}
              title={b.title}
              hint={b.hint}
              orientation="vertical"
              bipolar
              center={0}
              min={-12}
              max={12}
              step={1}
              value={fx.eq[i] ?? 0}
              format={(v) => `${v > 0 ? "+" : ""}${v} dB`}
              onLive={(v) => setBand(i, v, false)}
              onCommit={(v) => setBand(i, v, true)}
            />
          ))}
        </div>
      </Section>

      <Section title="Filter" action={<TextButton disabled={fx.filter === 0} onClick={() => commit({ filter: 0 })}>Reset</TextButton>}>
        <Row>
          <FxSlider
            title="Sweep"
            min={-1}
            max={1}
            step={0.01}
            bipolar
            center={0}
            snap={0.05}
            value={fx.filter}
            format={fmtFilter}
            onLive={(v) => live({ filter: v })}
            onCommit={(v) => commit({ filter: v })}
          />
          <div className="mt-0.5 flex justify-between text-[10px] text-white/40">
            <span>Muffled</span>
            <span>Thin</span>
          </div>
        </Row>
      </Section>

      <Section title="Warmth">
        <Row>
          <FxSlider
            title="Analog drive"
            min={0}
            max={1}
            step={0.01}
            value={fx.drive}
            format={pctText}
            onLive={(v) => live({ drive: v })}
            onCommit={(v) => commit({ drive: v })}
          />
        </Row>
      </Section>
      <Note>Warmth adds gentle tube-style harmonics. Move it around in Chain to hear how order changes the character.</Note>

      <Section title="Dynamics">
        <Row>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-white/90">Night mode</div>
              <div className="text-[11px] text-white/45">Evens out loud and quiet parts</div>
            </div>
            <Switch label="Night mode" checked={fx.night} onChange={(v) => commit({ night: v })} />
          </div>
        </Row>
      </Section>
    </div>
  );
}

/* ── Space (Reverb / Echo / Chorus / Width / 8D) ───────────────────────────── */
const REVERB_OPTIONS: SegOption<string>[] = [
  { value: "none", label: "None" },
  { value: "warehouse", label: "Small Hall" },
  { value: "cathedral", label: "Church" },
];
const DIRECTION_OPTIONS: SegOption<"clockwise" | "counter-clockwise">[] = [
  { value: "clockwise", label: "Clockwise" },
  { value: "counter-clockwise", label: "Counter" },
];
const fmtWidth = (v: number) => (v < 0.05 ? "Mono" : Math.abs(v - 1) < 0.03 ? "Original" : `${Math.round(v * 100)}%`);

function SpaceTab({ fx, live, commit }: TabProps) {
  const orbitPeriod = 1 / Math.max(0.03, fx.speed8D);

  return (
    <div className="space-y-5">
      <Section title="Reverb">
        <Row>
          <Segmented label="Reverb space" value={fx.reverb || "none"} options={REVERB_OPTIONS} onChange={(v) => commit({ reverb: v })} />
        </Row>
        <Row>
          <FxSlider
            title="Amount"
            min={0}
            max={1}
            step={0.01}
            disabled={!fx.reverb || fx.reverb === "none"}
            value={fx.reverbAmount}
            format={(v) => `${Math.round(v * 100)}%`}
            onLive={(v) => live({ reverbAmount: v })}
            onCommit={(v) => commit({ reverbAmount: v })}
          />
        </Row>
      </Section>

      <Section title="Echo">
        <Row>
          <FxSlider title="Mix" min={0} max={1} step={0.01} value={fx.echo} format={pctText} onLive={(v) => live({ echo: v })} onCommit={(v) => commit({ echo: v })} />
        </Row>
        <Row>
          <FxSlider
            title="Delay"
            min={0.08}
            max={0.8}
            step={0.01}
            disabled={fx.echo <= 0.005}
            value={fx.echoTime}
            format={(v) => `${Math.round(v * 1000)} ms`}
            onLive={(v) => live({ echoTime: v })}
            onCommit={(v) => commit({ echoTime: v })}
          />
        </Row>
      </Section>

      <Section title="Chorus">
        <Row>
          <FxSlider title="Depth" min={0} max={1} step={0.01} value={fx.chorus} format={pctText} onLive={(v) => live({ chorus: v })} onCommit={(v) => commit({ chorus: v })} />
        </Row>
      </Section>

      <Section title="Stereo">
        <Row>
          <FxSlider
            title="Width"
            min={0}
            max={2}
            step={0.01}
            center={1}
            snap={0.05}
            value={fx.width}
            format={fmtWidth}
            onLive={(v) => live({ width: v })}
            onCommit={(v) => commit({ width: v })}
          />
        </Row>
      </Section>

      <Section title="Spatial">
        <Row>
          <div className="flex items-center gap-3">
            <GlassIcon
              icon={Orbit}
              hue={["#6cc8ff", "#0a84ff"]}
              size={32}
              spin={fx.is8D ? { duration: orbitPeriod, dir: fx.direction8D === "clockwise" ? 1 : -1 } : null}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-white/90">8D Audio</div>
              <div className="text-[11px] text-white/45">Sound orbits around your head</div>
            </div>
            <Switch label="8D audio" checked={fx.is8D} onChange={(v) => commit({ is8D: v })} />
          </div>
        </Row>
        <AnimatePresence initial={false}>
          {fx.is8D && (
            <motion.div
              key="8d-controls"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={SPRING_SOFT}
              className="overflow-hidden border-t border-white/[0.07]"
            >
              <Row>
                <Segmented label="Orbit direction" value={fx.direction8D} options={DIRECTION_OPTIONS} onChange={(v) => commit({ direction8D: v })} />
              </Row>
              <Row>
                <FxSlider
                  title="Orbit speed"
                  min={0.05}
                  max={0.5}
                  step={0.01}
                  value={fx.speed8D}
                  format={(v) => `${(1 / v).toFixed(1)} s per turn`}
                  onLive={(v) => live({ speed8D: v })}
                  onCommit={(v) => commit({ speed8D: v })}
                />
              </Row>
            </motion.div>
          )}
        </AnimatePresence>
      </Section>
    </div>
  );
}

/* ── Voice (vocal isolator / karaoke) ──────────────────────────────────────── */
const VOCAL_OPTIONS: SegOption<VocalMode>[] = [
  { value: "off", label: "Off" },
  { value: "vocals", label: "Vocals only" },
  { value: "karaoke", label: "Karaoke" },
];

function VoiceTab({ fx, live, commit }: TabProps) {
  const [status, setStatus] = useState(audioEngine.getVocalStatus());
  useEffect(() => {
    if (fx.vocalMode === "off") return;
    const id = setInterval(() => setStatus(audioEngine.getVocalStatus()), 300);
    setStatus(audioEngine.getVocalStatus());
    return () => clearInterval(id);
  }, [fx.vocalMode]);

  const off = fx.vocalMode === "off";
  const statusText = off
    ? "Choose a mode to start"
    : status === "unsupported"
    ? "Not supported in this browser"
    : status === "ready"
    ? "Active"
    : "Preparing…";

  return (
    <div className="space-y-5">
      <Section title="Vocal Isolator">
        <Row>
          <div className="mb-3 flex items-center gap-3">
            <GlassIcon icon={Mic} hue={["#ff8aa8", "#ff375f"]} size={32} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-white/90">
                {fx.vocalMode === "vocals" ? "Vocals only" : fx.vocalMode === "karaoke" ? "Karaoke" : "Voice separation"}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-white/45">
                <span className={cn("h-1.5 w-1.5 rounded-full", !off && status === "ready" ? "bg-brand" : "bg-white/25")} />
                {statusText}
              </div>
            </div>
          </div>
          <Segmented label="Vocal mode" value={fx.vocalMode} options={VOCAL_OPTIONS} onChange={(v) => commit({ vocalMode: v, bypass: false })} small />
        </Row>
        <Row>
          <FxSlider
            title="Strength"
            min={0}
            max={1}
            step={0.01}
            disabled={off}
            value={fx.vocalAmount}
            format={(v) => `${Math.round(v * 100)}%`}
            onLive={(v) => live({ vocalAmount: v })}
            onCommit={(v) => commit({ vocalAmount: v })}
          />
        </Row>
        <Row>
          <FxSlider
            title="Focus"
            min={0}
            max={1}
            step={0.01}
            disabled={off}
            value={fx.vocalFocus}
            format={(v) => (v < 0.34 ? "Wide" : v < 0.67 ? "Balanced" : "Tight")}
            onLive={(v) => live({ vocalFocus: v })}
            onCommit={(v) => commit({ vocalFocus: v })}
          />
        </Row>
      </Section>
      <Note>
        {fx.vocalMode === "karaoke"
          ? "Removes the centered voice and keeps the band in stereo. Raise Focus if the band sounds thin, lower it if vocals leak through."
          : "Keeps the centered voice and fades the band. It analyses the stereo image in real time, so it works best on studio tracks where the vocal sits in the middle. Adds about 45 ms of delay."}
      </Note>
    </div>
  );
}

/* ── Chain (reorder effects) ───────────────────────────────────────────────── */
const MODULE_META: Record<string, { name: string; blurb: string; icon: LucideIcon; hue: Hue }> = {
  eq: { name: "Equalizer", blurb: "Bass, mid, treble", icon: SlidersVertical, hue: ["#6fe3b0", "#1fae7c"] },
  filter: { name: "Filter", blurb: "Low-pass and high-pass sweep", icon: SlidersHorizontal, hue: ["#6cc8ff", "#0a84ff"] },
  drive: { name: "Warmth", blurb: "Analog saturation", icon: Flame, hue: ["#ffb05a", "#ff6a1a"] },
  chorus: { name: "Chorus", blurb: "Stereo thickening", icon: Waves, hue: ["#e49bff", "#a43be0"] },
  echo: { name: "Echo", blurb: "Tape-style repeats", icon: Repeat, hue: ["#ffd75a", "#ff9f0a"] },
  reverb: { name: "Reverb", blurb: "Room and hall space", icon: Landmark, hue: ["#8f8cff", "#5e5ce6"] },
};

function isModuleActive(id: string, fx: AudioFxSettings) {
  switch (id) {
    case "eq": return fx.eq.some((v) => v !== 0);
    case "filter": return Math.abs(fx.filter) >= 0.03;
    case "drive": return fx.drive > 0.005;
    case "chorus": return fx.chorus > 0.005;
    case "echo": return fx.echo > 0.005;
    case "reverb": return !!fx.reverb && fx.reverb !== "none";
    default: return false;
  }
}

function ChainRow({
  id,
  active,
  onDragEnd,
  onMove,
}: {
  id: string;
  active: boolean;
  onDragEnd: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const controls = useDragControls();
  const meta = MODULE_META[id];
  if (!meta) return null;
  return (
    <Reorder.Item
      as="div"
      value={id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      whileDrag={{ scale: 1.03, zIndex: 20, backgroundColor: "rgba(70,70,78,0.85)", boxShadow: "0 14px 34px rgba(0,0,0,0.45)" }}
      transition={SPRING_UI}
      className="relative flex items-center gap-3 border-t border-white/[0.07] px-3 py-2.5 first:rounded-t-2xl first:border-t-0 last:rounded-b-2xl"
    >
      <button
        type="button"
        aria-label={`Reorder ${meta.name}. Use arrow keys to move.`}
        onPointerDown={(e) => {
          e.preventDefault();
          controls.start(e);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") { e.preventDefault(); onMove(-1); }
          if (e.key === "ArrowDown") { e.preventDefault(); onMove(1); }
        }}
        className="flex h-8 w-6 shrink-0 cursor-grab touch-none flex-col items-center justify-center gap-[3px] rounded-md outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-brand/60"
      >
        <span className="h-[2px] w-4 rounded-full bg-white/40" />
        <span className="h-[2px] w-4 rounded-full bg-white/40" />
        <span className="h-[2px] w-4 rounded-full bg-white/40" />
      </button>
      <GlassIcon icon={meta.icon} hue={meta.hue} size={30} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-white">{meta.name}</div>
        <div className="truncate text-[11px] text-white/45">{meta.blurb}</div>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-white/50">
        <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-brand" : "bg-white/25")} />
        {active ? "On" : "Off"}
      </div>
    </Reorder.Item>
  );
}

function ChainTab({ fx, live, commit }: TabProps) {
  const key = (fx.chain || DEFAULT_CHAIN).join(",");
  const [order, setOrder] = useState<string[]>(() => sanitizeChain(fx.chain));
  useEffect(() => setOrder(sanitizeChain(fx.chain)), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const orderRef = useRef(order);
  orderRef.current = order;
  const isDefault = order.join(",") === DEFAULT_CHAIN.join(",");

  const move = (id: string, dir: -1 | 1) => {
    const i = order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    commit({ chain: next });
  };

  return (
    <div className="space-y-4">
      <section className="space-y-1.5">
        <div className="flex min-h-[18px] items-center justify-between px-1">
          <h3 className="text-[12px] font-medium text-white/50">Signal flow</h3>
          <TextButton disabled={isDefault} onClick={() => commit({ chain: [...DEFAULT_CHAIN] })}>
            Reset order
          </TextButton>
        </div>
        <Reorder.Group
          as="div"
          axis="y"
          values={order}
          onReorder={(o) => {
            setOrder(o);
          }}
          className="relative rounded-2xl bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] ring-1 ring-inset ring-white/[0.07]"
        >
          {order.map((id) => (
            <ChainRow
              key={id}
              id={id}
              active={isModuleActive(id, fx)}
              onDragEnd={() => commit({ chain: orderRef.current })}
              onMove={(d) => move(id, d)}
            />
          ))}
        </Reorder.Group>
      </section>
      <Note>
        Sound flows from top to bottom. Try Reverb above Warmth for a darker, thicker tail, or Echo before Chorus for
        a wider, shimmering repeat. Hold the handle to drag.
      </Note>
    </div>
  );
}

/* ── Tempo ─────────────────────────────────────────────────────────────────── */
const SPEED_CHIPS = [0.75, 1, 1.25, 1.5];

function TempoTab({ fx, live, commit }: TabProps) {
  // "Tape mode": pitch follows speed. UI state so toggling at 1.00× still registers.
  const [tape, setTape] = useState(fx.pitch !== 1);
  const [liveSpeed, setLiveSpeed] = useState(fx.speed);
  useEffect(() => setLiveSpeed(fx.speed), [fx.speed]);
  useEffect(() => {
    if (fx.pitch !== 1) setTape(true);
  }, [fx.pitch]);

  const setSpeed = (v: number, final: boolean) => {
    setLiveSpeed(v);
    (final ? commit : live)({ speed: v, pitch: tape ? v : 1 });
  };
  const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
  const isDay = near(fx.speed, 0.75) && fx.pitch === 0.75;
  const isNight = near(fx.speed, 1.5) && fx.pitch === 1.5;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white/[0.08] px-4 pb-3 pt-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] ring-1 ring-inset ring-white/[0.07]">
        <div className="text-center">
          <div className="text-[44px] font-semibold leading-none tracking-tight tabular-nums text-white">
            {liveSpeed.toFixed(2)}
            <span className="ml-0.5 text-[24px] text-white/50">×</span>
          </div>
          <div className="mt-1.5 text-[12px] text-white/50">{tape ? "Pitch follows speed" : "Pitch stays natural"}</div>
        </div>
        <div className="mt-3">
          <FxSlider
            title="Speed"
            min={0.5}
            max={2}
            step={0.01}
            center={1}
            snap={0.03}
            value={fx.speed}
            format={(v) => `${v.toFixed(2)}×`}
            onLive={(v) => setSpeed(v, false)}
            onCommit={(v) => setSpeed(v, true)}
          />
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {SPEED_CHIPS.map((s) => (
            <motion.button
              key={s}
              type="button"
              whileTap={{ scale: 0.92 }}
              transition={SPRING_UI}
              onClick={() => {
                setLiveSpeed(s);
                commit({ speed: s, pitch: tape ? s : 1 });
              }}
              className={cn(
                "rounded-lg py-1.5 text-[12px] font-medium tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/60",
                near(fx.speed, s) ? "bg-white/[0.2] text-white" : "bg-black/20 text-white/55 hover:text-white/80"
              )}
            >
              {s}×
            </motion.button>
          ))}
        </div>
      </div>

      <Section title="Pitch">
        <Row>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-white/90">Keep original pitch</div>
              <div className="text-[11px] text-white/45">Off gives the classic tape speed-up</div>
            </div>
            <Switch
              label="Keep original pitch"
              checked={!tape}
              onChange={(keep) => {
                setTape(!keep);
                commit({ pitch: keep ? 1 : fx.speed });
              }}
            />
          </div>
        </Row>
      </Section>

      <div className="grid grid-cols-2 gap-2">
        <PresetTile
          name="Daycore"
          blurb="0.75× slowed"
          icon={Moon}
          hue={["#6cc8ff", "#5e5ce6"]}
          active={isDay}
          onClick={() => {
            setTape(true);
            setLiveSpeed(isDay ? 1 : 0.75);
            commit(isDay ? { speed: 1, pitch: 1 } : { speed: 0.75, pitch: 0.75 });
          }}
        />
        <PresetTile
          name="Nightcore"
          blurb="1.5× sped up"
          icon={Sparkles}
          hue={["#ff8aa8", "#ff375f"]}
          active={isNight}
          onClick={() => {
            setTape(true);
            setLiveSpeed(isNight ? 1 : 1.5);
            commit(isNight ? { speed: 1, pitch: 1 } : { speed: 1.5, pitch: 1.5 });
          }}
        />
      </div>
    </div>
  );
}



/* ─────────────────────────────────────────────────────────────────────────────
   Collapsible Section Component (Accordion-style for right-side panel)
───────────────────────────────────────────────────────────────────────────── */
interface CollapsibleSectionProps {
  title: string;
  icon: LucideIcon;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}

function CollapsibleSection({ title, icon: Icon, isOpen, onToggle, children }: CollapsibleSectionProps) {
  return (
    <div className="border-b border-white/[0.08] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left outline-none transition-colors hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-brand/60"
      >
        <Icon size={16} className="shrink-0 text-white/60" strokeWidth={2} />
        <span className="flex-1 text-[14px] font-semibold text-white">{title}</span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={SPRING_UI}
          className="text-white/40"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING_SOFT}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Right-Side Glass Panel: matches Queue/Lyrics panel style
───────────────────────────────────────────────────────────────────────────── */
export function AudioFxModal() {
  const isOpen = useUIStore((s) => s.isAudioFxOpen);
  const setOpen = useUIStore((s) => s.setAudioFxOpen);
  const isMobile = useIsMobile();
  const bypass = usePlayerStore((s) => s.audioFx.bypass);
  const setFx = usePlayerStore((s) => s.setFx);
  const { fx, live, commit } = useFx();

  // Collapsible sections state
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    presets: true,
    tune: false,
    space: false,
    voice: false,
    chain: false,
    tempo: false,
  });

  const toggleSection = (id: string) => {
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const close = useCallback(() => setOpen(false), [setOpen]);

  // Esc key handler
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  const toggleEffects = (on: boolean) => {
    audioEngine.applyFx({ bypass: !on });
    setFx({ bypass: !on });
  };

  const tabProps: TabProps = { fx, live, commit };

  return (
    <AnimatePresence>
      {isOpen && (
        <div key="fx-panel" className="fixed inset-0 z-[1200] pointer-events-none">
          {/* Backdrop: mobile only */}
          {isMobile && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={close}
              className="absolute inset-0 pointer-events-auto bg-black/50 backdrop-blur-sm"
            />
          )}

          {/* Right-side glass panel (320px wide, matches Queue panel) */}
          <motion.div
            initial={isMobile ? { y: "100%" } : { x: 320 }}
            animate={isMobile ? { y: 0 } : { x: 0 }}
            exit={isMobile ? { y: "100%" } : { x: 320 }}
            transition={{ type: "spring", damping: 32, stiffness: 340, mass: 0.85 }}
            style={{ width: isMobile ? undefined : 320, backgroundColor: "var(--side)" }}
            className={cn(
              "absolute pointer-events-auto flex flex-col overflow-hidden z-[140] am-glass will-change-transform",
              isMobile
                ? "bottom-0 left-0 right-0 h-[84vh] rounded-t-[28px] shadow-[0_-20px_60px_rgba(0,0,0,0.4)]"
                : "top-0 right-0 bottom-0 am-glass-right shadow-[-20px_0_60px_rgba(0,0,0,0.35)]"
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Studio FX"
          >
            {/* Header (matches Queue panel style) */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/[0.08] shrink-0">
              <div className="flex items-baseline gap-2.5 min-w-0">
                <h2 className="text-[19px] font-bold text-white tracking-tight">Studio FX</h2>
                <span className="text-[11px] font-medium text-white/40">
                  {bypass ? "Off" : "On"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Switch label="Effects" checked={!bypass} onChange={toggleEffects} />
                <button
                  type="button"
                  aria-label="Close"
                  onClick={close}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/60 outline-none transition-colors hover:bg-white/[0.08] hover:text-white active:scale-90 focus-visible:ring-2 focus-visible:ring-brand/60"
                >
                  <X size={16} strokeWidth={2.5} />
                </button>
              </div>
            </div>

            {/* Spectrum Visualizer */}
            <div className="px-4 py-3 border-b border-white/[0.08] shrink-0">
              <Spectrum />
            </div>

            {/* Scrollable sections */}
            <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-hide">
              {/* Presets Section */}
              <CollapsibleSection
                title="Presets"
                icon={Sparkles}
                isOpen={openSections.presets}
                onToggle={() => toggleSection("presets")}
              >
                <PresetsTab {...tabProps} />
              </CollapsibleSection>

              {/* Tune Section */}
              <CollapsibleSection
                title="Tune"
                icon={SlidersHorizontal}
                isOpen={openSections.tune}
                onToggle={() => toggleSection("tune")}
              >
                <TuneTab {...tabProps} />
              </CollapsibleSection>

              {/* Space Section */}
              <CollapsibleSection
                title="Space"
                icon={Waves}
                isOpen={openSections.space}
                onToggle={() => toggleSection("space")}
              >
                <SpaceTab {...tabProps} />
              </CollapsibleSection>

              {/* Voice Section */}
              <CollapsibleSection
                title="Voice"
                icon={Mic}
                isOpen={openSections.voice}
                onToggle={() => toggleSection("voice")}
              >
                <VoiceTab {...tabProps} />
              </CollapsibleSection>

              {/* Chain Section */}
              <CollapsibleSection
                title="Chain"
                icon={SlidersVertical}
                isOpen={openSections.chain}
                onToggle={() => toggleSection("chain")}
              >
                <ChainTab {...tabProps} />
              </CollapsibleSection>

              {/* Tempo Section */}
              <CollapsibleSection
                title="Tempo"
                icon={Repeat}
                isOpen={openSections.tempo}
                onToggle={() => toggleSection("tempo")}
              >
                <TempoTab {...tabProps} />
              </CollapsibleSection>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-white/[0.08] bg-white/[0.03] px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shrink-0">
              <button
                type="button"
                onClick={() =>
                  commit({ ...DEFAULT_AUDIO_FX, eq: [0, 0, 0], chain: [...DEFAULT_CHAIN], crossfade: fx.crossfade })
                }
                className="rounded-md px-1 py-1 text-[12px] font-medium text-white/60 outline-none transition-all hover:text-white active:scale-95 focus-visible:ring-2 focus-visible:ring-brand/60"
              >
                Reset all
              </button>
              <span className="text-[11px] font-medium text-white/30">Zenify Engine</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
