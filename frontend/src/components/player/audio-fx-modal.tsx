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
  MotionConfig,
  Reorder,
  motion,
  useDragControls,
  type Variants,
} from "framer-motion";
import * as Slider from "@radix-ui/react-slider";
import { X } from "lucide-react";
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
   Motion tokens: one small set of springs used everywhere
───────────────────────────────────────────────────────────────────────────── */
const SPRING_UI = { type: "spring", stiffness: 520, damping: 36, mass: 0.8 } as const;
const SPRING_SOFT = { type: "spring", stiffness: 380, damping: 32, mass: 0.9 } as const;
const SPRING_POP = { type: "spring", stiffness: 460, damping: 26, mass: 0.7 } as const;
const SPRING_COLLAPSE = { type: "spring", stiffness: 420, damping: 42, mass: 1 } as const; // no overshoot
const SPRING_SHEET = { type: "spring", stiffness: 340, damping: 32, mass: 0.85 } as const;

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
  sound: Sound;
}

const PRESETS: BuiltInPreset[] = [
  { id: "original", name: "Original", blurb: "No processing", sound: mk({}) },
  { id: "after-hours", name: "After Hours", blurb: "Warm and soft", sound: mk({ eq: [3, -1, -2], reverb: "warehouse", reverbAmount: 0.25, chorus: 0.2, filter: -0.12, drive: 0.15 }) },
  { id: "immersive", name: "Immersive", blurb: "8D orbit, wide", sound: mk({ eq: [2, 0, 2], reverb: "warehouse", reverbAmount: 0.3, chorus: 0.25, width: 1.3, is8D: true, speed8D: 0.1 }) },
  { id: "clarity", name: "Studio Clarity", blurb: "Balanced, crisp", sound: mk({ eq: [-1, 2, 3] }) },
  { id: "headphones", name: "Headphones", blurb: "Wide, intimate", sound: mk({ eq: [2, 1, 1], chorus: 0.3, width: 1.35 }) },
  { id: "bass", name: "Bass Boost", blurb: "Deep low end", sound: mk({ eq: [7, 1, 2], drive: 0.2 }) },
  { id: "vocal", name: "Vocal Boost", blurb: "Voices up front", sound: mk({ eq: [-2, 5, 2] }) },
  { id: "hall", name: "Concert Hall", blurb: "Live room feel", sound: mk({ eq: [1, 0, 1], reverb: "cathedral", reverbAmount: 0.4 }) },
  { id: "lofi", name: "Lo-Fi", blurb: "Dusty, mellow", sound: mk({ eq: [3, 0, -3], filter: -0.3, chorus: 0.15, drive: 0.3, reverb: "warehouse", reverbAmount: 0.2 }) },
  { id: "dream", name: "Dream Echo", blurb: "Floaty repeats", sound: mk({ echo: 0.35, echoTime: 0.38, reverb: "cathedral", reverbAmount: 0.25, chorus: 0.2 }) },
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
        "relative h-[26px] w-[44px] shrink-0 rounded-full outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-brand/60",
        checked ? "bg-brand" : "bg-white/20"
      )}
    >
      <motion.span
        aria-hidden
        className="absolute left-[2px] top-[2px] h-[22px] w-[22px] rounded-full bg-white shadow-[0_2px_5px_rgba(0,0,0,0.35)]"
        initial={false}
        animate={{ x: checked ? 18 : 0 }}
        whileTap={{ scaleX: 1.18 }}
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
}: {
  value: T;
  options: SegOption<T>[];
  onChange: (v: T) => void;
  label: string;
}) {
  const n = options.length;
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      role="group"
      aria-label={label}
      className="relative grid rounded-[10px] bg-black/25 p-[2px]"
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      <motion.span
        aria-hidden
        className="absolute inset-y-[2px] left-[2px] rounded-[8px] bg-white/[0.2] shadow-[0_1px_3px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.18)]"
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
              "relative z-10 truncate rounded-[8px] px-1 py-[6px] text-[12px] font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand/60",
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

/** Inset grouped card (iOS style). */
function Section({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      {(title || action) && (
        <div className="flex min-h-[18px] items-center justify-between px-1">
          <h3 className="text-[11.5px] font-medium text-white/45">{title}</h3>
          {action}
        </div>
      )}
      {children !== undefined && (
        <div className="overflow-hidden rounded-[14px] bg-white/[0.06]">{children}</div>
      )}
    </section>
  );
}

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("border-t border-white/[0.07] px-3.5 py-2.5 first:border-t-0", className)}>{children}</div>;
}

/** Springy height + fade, so optional controls glide in and out. */
function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="collapse"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={SPRING_COLLAPSE}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ToggleRow({
  title,
  sub,
  checked,
  onChange,
}: {
  title: string;
  sub?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-white/90">{title}</div>
        {sub && <div className="text-[11px] leading-tight text-white/40">{sub}</div>}
      </div>
      <Switch label={title} checked={checked} onChange={onChange} />
    </div>
  );
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

/** Pill button. With a layoutId the highlight glides between chips on a spring. */
function Chip({
  active,
  onClick,
  children,
  layoutId,
  title,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  layoutId?: string;
  title?: string;
  className?: string;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      transition={SPRING_UI}
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        "relative rounded-full px-3 py-1.5 text-[12.5px] font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand/60",
        active ? "text-white" : "bg-white/[0.07] text-white/75 hover:bg-white/[0.12] hover:text-white",
        active && !layoutId && "bg-brand",
        className
      )}
    >
      {layoutId && active && (
        <motion.span
          layoutId={layoutId}
          transition={SPRING_UI}
          className="absolute inset-0 rounded-full bg-brand"
        />
      )}
      <span className="relative">{children}</span>
    </motion.button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   FxSlider: Radix slider, local value so dragging never waits on the store.
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
      className={cn("relative flex select-none items-center", vertical ? "h-full w-8 flex-col" : "h-7 w-full")}
      style={{ touchAction: vertical ? "none" : "pan-y" }}
    >
      <Slider.Track className={cn("relative grow overflow-hidden rounded-full bg-white/[0.16]", vertical ? "w-[6px]" : "h-[6px]")}>
        <div className="absolute rounded-full bg-white" style={rangeStyle} />
      </Slider.Track>
      <Slider.Thumb asChild>
        <motion.span
          whileTap={{ scale: 1.18 }}
          transition={SPRING_POP}
          className="block h-5 w-5 rounded-full bg-white shadow-[0_2px_7px_rgba(0,0,0,0.45),0_0_0_0.5px_rgba(0,0,0,0.12)] outline-none focus-visible:ring-4 focus-visible:ring-brand/40"
        />
      </Slider.Thumb>
    </Slider.Root>
  );

  if (vertical) {
    return (
      <div className={cn("flex flex-col items-center gap-1.5 transition-opacity duration-200", disabled && "opacity-40")}>
        <span className="text-[11.5px] font-medium tabular-nums text-white/65">{text}</span>
        <div className="h-[112px]">{slider}</div>
        <div className="text-center leading-tight">
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
        <span className="text-[12px] tabular-nums text-white/45">{text}</span>
      </div>
      {slider}
    </div>
  );
});

/* ─────────────────────────────────────────────────────────────────────────────
   Live spectrum (compact)
   Dedicated analyser (float dB data), pink-noise tilt so highs are visible,
   and auto-gain so loud masters never pin the bars.
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
      className="h-6 w-full text-brand [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]"
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
function PresetsTab({ fx, commit }: TabProps) {
  const [custom, setCustom] = useCustomPresets();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const activeKey = canon(pickSound(fx));
  const isActive = (s: Partial<Sound>) => !fx.bypass && canon(mk(s)) === activeKey;
  const apply = (s: Partial<Sound>) => commit({ ...mk(s), bypass: false });

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
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <Chip
            key={p.id}
            layoutId="fx-preset-hl"
            title={p.blurb}
            active={isActive(p.sound)}
            onClick={() => apply(p.sound)}
          >
            {p.name}
          </Chip>
        ))}
      </div>

      <Section
        title="Mine"
        action={<TextButton onClick={() => setNaming((v) => !v)}>{naming ? "Cancel" : "Save current"}</TextButton>}
      >
        {undefined}
      </Section>

      <div className="-mt-2 space-y-2">
        <Collapse open={naming}>
          <form onSubmit={save} className="flex items-center gap-2 pb-1">
            <input
              autoFocus
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              placeholder="Preset name"
              className="min-w-0 flex-1 rounded-[10px] bg-white/[0.08] px-3 py-2 text-[16px] text-white outline-none placeholder:text-white/30 focus:ring-2 focus:ring-brand/50 sm:text-[13px]"
            />
            <motion.button
              type="submit"
              whileTap={{ scale: 0.94 }}
              transition={SPRING_UI}
              className="rounded-[10px] bg-brand px-3.5 py-2 text-[13px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              Save
            </motion.button>
          </form>
        </Collapse>

        <div className="flex flex-wrap gap-1.5">
          <AnimatePresence initial={false}>
            {custom.map((p) => {
              const active = isActive(p.sound);
              return (
                <motion.span
                  key={p.id}
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={SPRING_POP}
                  className={cn(
                    "inline-flex items-center rounded-full transition-colors duration-200",
                    active ? "bg-brand text-white" : "bg-white/[0.07] text-white/75"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => apply(p.sound)}
                    className="rounded-full py-1.5 pl-3 pr-1.5 text-[12.5px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
                  >
                    {p.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${p.name}`}
                    onClick={() => setCustom(custom.filter((c) => c.id !== p.id))}
                    className="rounded-full py-1.5 pl-0.5 pr-2.5 opacity-55 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-brand/60"
                  >
                    <X size={11} strokeWidth={2.6} />
                  </button>
                </motion.span>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ── EQ (EQ, Filter, Warmth, Night mode) ───────────────────────────────────── */
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
    <div className="space-y-4">
      <Section
        title="Equalizer"
        action={<TextButton disabled={flat} onClick={() => commit({ eq: [0, 0, 0] })}>Reset</TextButton>}
      >
        <div className="grid grid-cols-3 px-2 py-3">
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

      <Section>
        <Row>
          <FxSlider
            title="Filter"
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
        </Row>
        <Row>
          <FxSlider
            title="Warmth"
            min={0}
            max={1}
            step={0.01}
            value={fx.drive}
            format={pctText}
            onLive={(v) => live({ drive: v })}
            onCommit={(v) => commit({ drive: v })}
          />
        </Row>
        <Row>
          <ToggleRow title="Night mode" sub="Evens out loud and quiet parts" checked={fx.night} onChange={(v) => commit({ night: v })} />
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
  const reverbOn = !!fx.reverb && fx.reverb !== "none";
  const echoOn = fx.echo > 0.005;

  return (
    <div className="space-y-4">
      <Section>
        <Row>
          <div className="mb-2 text-[13px] text-white/90">Reverb</div>
          <Segmented label="Reverb space" value={fx.reverb || "none"} options={REVERB_OPTIONS} onChange={(v) => commit({ reverb: v })} />
          <Collapse open={reverbOn}>
            <div className="pt-2">
              <FxSlider
                title="Amount"
                min={0}
                max={1}
                step={0.01}
                value={fx.reverbAmount}
                format={(v) => `${Math.round(v * 100)}%`}
                onLive={(v) => live({ reverbAmount: v })}
                onCommit={(v) => commit({ reverbAmount: v })}
              />
            </div>
          </Collapse>
        </Row>
        <Row>
          <FxSlider title="Echo" min={0} max={1} step={0.01} value={fx.echo} format={pctText} onLive={(v) => live({ echo: v })} onCommit={(v) => commit({ echo: v })} />
          <Collapse open={echoOn}>
            <div className="pt-1">
              <FxSlider
                title="Delay"
                min={0.08}
                max={0.8}
                step={0.01}
                value={fx.echoTime}
                format={(v) => `${Math.round(v * 1000)} ms`}
                onLive={(v) => live({ echoTime: v })}
                onCommit={(v) => commit({ echoTime: v })}
              />
            </div>
          </Collapse>
        </Row>
        <Row>
          <FxSlider title="Chorus" min={0} max={1} step={0.01} value={fx.chorus} format={pctText} onLive={(v) => live({ chorus: v })} onCommit={(v) => commit({ chorus: v })} />
        </Row>
        <Row>
          <FxSlider
            title="Stereo width"
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

      <Section>
        <Row>
          <ToggleRow title="8D Audio" sub="Sound orbits around your head" checked={fx.is8D} onChange={(v) => commit({ is8D: v })} />
        </Row>
        <Collapse open={fx.is8D}>
          <div className="space-y-2.5 border-t border-white/[0.07] px-3.5 py-2.5">
            <Segmented label="Orbit direction" value={fx.direction8D} options={DIRECTION_OPTIONS} onChange={(v) => commit({ direction8D: v })} />
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
          </div>
        </Collapse>
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
  const statusText =
    status === "unsupported" ? "Not supported in this browser" : status === "ready" ? "Active" : "Preparing…";

  return (
    <div className="space-y-3">
      <Section>
        <Row>
          <Segmented label="Vocal mode" value={fx.vocalMode} options={VOCAL_OPTIONS} onChange={(v) => commit({ vocalMode: v, bypass: false })} />
        </Row>
        <Collapse open={!off}>
          <div className="space-y-2.5 border-t border-white/[0.07] px-3.5 py-2.5">
            <FxSlider
              title="Strength"
              min={0}
              max={1}
              step={0.01}
              value={fx.vocalAmount}
              format={(v) => `${Math.round(v * 100)}%`}
              onLive={(v) => live({ vocalAmount: v })}
              onCommit={(v) => commit({ vocalAmount: v })}
            />
            <FxSlider
              title="Focus"
              min={0}
              max={1}
              step={0.01}
              value={fx.vocalFocus}
              format={(v) => (v < 0.34 ? "Wide" : v < 0.67 ? "Balanced" : "Tight")}
              onLive={(v) => live({ vocalFocus: v })}
              onCommit={(v) => commit({ vocalFocus: v })}
            />
          </div>
        </Collapse>
      </Section>
      <Collapse open={!off}>
        <div className="space-y-1 pt-0.5">
          <div className="flex items-center gap-1.5 px-1 text-[11px] text-white/55">
            <span className={cn("h-1.5 w-1.5 rounded-full", status === "ready" ? "bg-brand" : "bg-white/25")} />
            {statusText}
          </div>
          <Note>
            {fx.vocalMode === "karaoke"
              ? "Removes the centered voice and keeps the band. Raise Focus if the band sounds thin."
              : "Keeps the centered voice and fades the band. Works best on studio tracks. Adds about 45 ms of delay."}
          </Note>
        </div>
      </Collapse>
      {off && <Note>Pick a mode to separate vocals from the music.</Note>}
    </div>
  );
}

/* ── Chain (reorder effects) ───────────────────────────────────────────────── */
const MODULE_META: Record<string, { name: string }> = {
  eq: { name: "Equalizer" },
  filter: { name: "Filter" },
  drive: { name: "Warmth" },
  chorus: { name: "Chorus" },
  echo: { name: "Echo" },
  reverb: { name: "Reverb" },
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
      whileDrag={{ scale: 1.03, zIndex: 20, backgroundColor: "rgba(74,74,82,0.92)", boxShadow: "0 14px 34px rgba(0,0,0,0.45)" }}
      transition={SPRING_UI}
      className="relative flex items-center gap-3 border-t border-white/[0.07] px-3 py-2 first:rounded-t-[14px] first:border-t-0 last:rounded-b-[14px]"
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
        <span className="h-[2px] w-4 rounded-full bg-white/35" />
        <span className="h-[2px] w-4 rounded-full bg-white/35" />
        <span className="h-[2px] w-4 rounded-full bg-white/35" />
      </button>
      <div className="min-w-0 flex-1 truncate text-[13px] font-medium text-white">{meta.name}</div>
      <motion.span
        aria-label={active ? "On" : "Off"}
        initial={false}
        animate={{ scale: active ? 1 : 0.7, opacity: active ? 1 : 0.5 }}
        transition={SPRING_POP}
        className={cn("h-2 w-2 rounded-full transition-colors duration-200", active ? "bg-brand" : "bg-white/30")}
      />
    </Reorder.Item>
  );
}

function ChainTab({ fx, commit }: TabProps) {
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
    <div className="space-y-3">
      <section className="space-y-1.5">
        <div className="flex min-h-[18px] items-center justify-between px-1">
          <h3 className="text-[11.5px] font-medium text-white/45">Signal flow</h3>
          <TextButton disabled={isDefault} onClick={() => commit({ chain: [...DEFAULT_CHAIN] })}>
            Reset order
          </TextButton>
        </div>
        <Reorder.Group
          as="div"
          axis="y"
          values={order}
          onReorder={setOrder}
          className="relative rounded-[14px] bg-white/[0.06]"
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
      <Note>Sound flows from top to bottom. Drag the handle to reorder.</Note>
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
    <div className="space-y-4">
      <Section>
        <div className="px-3.5 pb-3 pt-4">
          <div className="text-center">
            <div className="text-[38px] font-semibold leading-none tracking-tight tabular-nums text-white">
              {liveSpeed.toFixed(2)}
              <span className="ml-0.5 text-[20px] text-white/45">×</span>
            </div>
          </div>
          <div className="mt-2">
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
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            {SPEED_CHIPS.map((s) => (
              <Chip
                key={s}
                layoutId="fx-speed-hl"
                active={near(fx.speed, s) && !isDay && !isNight}
                className="tabular-nums"
                onClick={() => {
                  setLiveSpeed(s);
                  commit({ speed: s, pitch: tape ? s : 1 });
                }}
              >
                {s}×
              </Chip>
            ))}
          </div>
        </div>
      </Section>

      <Section>
        <Row>
          <ToggleRow
            title="Keep original pitch"
            sub="Off gives the classic tape speed-up"
            checked={!tape}
            onChange={(keep) => {
              setTape(!keep);
              commit({ pitch: keep ? 1 : fx.speed });
            }}
          />
        </Row>
      </Section>

      <div className="flex flex-wrap gap-1.5">
        <Chip
          active={isDay}
          title="0.75× slowed"
          onClick={() => {
            setTape(true);
            setLiveSpeed(isDay ? 1 : 0.75);
            commit(isDay ? { speed: 1, pitch: 1 } : { speed: 0.75, pitch: 0.75 });
          }}
        >
          Daycore
        </Chip>
        <Chip
          active={isNight}
          title="1.5× sped up"
          onClick={() => {
            setTape(true);
            setLiveSpeed(isNight ? 1 : 1.5);
            commit(isNight ? { speed: 1, pitch: 1 } : { speed: 1.5, pitch: 1.5 });
          }}
        >
          Nightcore
        </Chip>
      </div>
    </div>
  );
}

const FX_TABS = [
  { id: "presets", label: "Presets" },
  { id: "tune", label: "EQ" },
  { id: "space", label: "Space" },
  { id: "voice", label: "Voice" },
  { id: "tempo", label: "Tempo" },
  { id: "chain", label: "Chain" },
] as const;

type FxTabId = (typeof FX_TABS)[number]["id"];

const tabVariants: Variants = {
  enter: (d: number) => ({ opacity: 0, x: d >= 0 ? 28 : -28 }),
  center: { opacity: 1, x: 0, transition: SPRING_SOFT },
  exit: (d: number) => ({ opacity: 0, x: d >= 0 ? -18 : 18, transition: { duration: 0.1, ease: "easeIn" } }),
};

/* ─────────────────────────────────────────────────────────────────────────────
   Right-side glass panel (bottom sheet on mobile, swipe down to dismiss)
───────────────────────────────────────────────────────────────────────────── */
export function AudioFxModal() {
  const isOpen = useUIStore((s) => s.isAudioFxOpen);
  const setOpen = useUIStore((s) => s.setAudioFxOpen);
  const isMobile = useIsMobile();
  const bypass = usePlayerStore((s) => s.audioFx.bypass);
  const setFx = usePlayerStore((s) => s.setFx);
  const { fx, live, commit } = useFx();
  const dragControls = useDragControls();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [[activeTab, dir], setTab] = useState<[FxTabId, number]>(["presets", 0]);
  const selectTab = (id: FxTabId) => {
    setTab(([cur]) => [
      id,
      FX_TABS.findIndex((t) => t.id === id) - FX_TABS.findIndex((t) => t.id === cur),
    ]);
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const close = useCallback(() => setOpen(false), [setOpen]);

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
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {isOpen && (
          <div key="fx-panel" className="pointer-events-none fixed inset-0 z-[1200]">
            {isMobile && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                onClick={close}
                className="pointer-events-auto absolute inset-0 bg-black/45 backdrop-blur-[3px]"
              />
            )}

            <motion.div
              initial={isMobile ? { y: "100%" } : { x: 320, opacity: 0.6 }}
              animate={isMobile ? { y: 0 } : { x: 0, opacity: 1 }}
              exit={isMobile ? { y: "100%" } : { x: 320, opacity: 0 }}
              transition={SPRING_SHEET}
              drag={isMobile ? "y" : false}
              dragListener={false}
              dragControls={dragControls}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.5 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 110 || info.velocity.y > 600) close();
              }}
              style={{ width: isMobile ? undefined : 320, backgroundColor: "var(--side)" }}
              className={cn(
                "am-glass pointer-events-auto absolute z-[140] flex flex-col overflow-hidden will-change-transform",
                isMobile
                  ? "bottom-0 left-0 right-0 h-[86dvh] rounded-t-[26px] shadow-[0_-20px_60px_rgba(0,0,0,0.4)]"
                  : "am-glass-right bottom-0 right-0 top-0 shadow-[-20px_0_60px_rgba(0,0,0,0.35)]"
              )}
              role="dialog"
              aria-modal="true"
              aria-label="Studio FX"
            >
              {/* Header (also the swipe handle on mobile) */}
              <div
                className={cn("shrink-0", isMobile && "touch-none")}
                onPointerDown={(e) => isMobile && dragControls.start(e)}
              >
                {isMobile && <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-white/25" />}
                <div className="flex items-center justify-between px-4 pb-2 pt-3">
                  <h2 className="text-[18px] font-semibold tracking-tight text-white">Studio FX</h2>
                  <div className="flex items-center gap-2.5">
                    <Switch label="Effects" checked={!bypass} onChange={toggleEffects} />
                    <motion.button
                      type="button"
                      aria-label="Close Studio FX"
                      whileTap={{ scale: 0.88 }}
                      transition={SPRING_UI}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={close}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/70 outline-none transition-colors hover:bg-white/[0.16] hover:text-white focus-visible:ring-2 focus-visible:ring-brand/60"
                    >
                      <X size={13} strokeWidth={2.2} />
                    </motion.button>
                  </div>
                </div>

                {/* Segmented tabs with a sliding pill */}
                <div className="px-4 pb-2.5">
                  <div role="tablist" aria-label="Studio FX sections" className="grid grid-cols-6 rounded-[10px] bg-black/25 p-[2px]">
                    {FX_TABS.map((t) => {
                      const active = activeTab === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => selectTab(t.id)}
                          className={cn(
                            "relative rounded-[8px] px-0.5 py-[6px] text-[11.5px] font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand/60",
                            active ? "text-white" : "text-white/55 hover:text-white/80"
                          )}
                        >
                          {active && (
                            <motion.span
                              layoutId="fx-tab-pill"
                              transition={SPRING_UI}
                              className="absolute inset-0 rounded-[8px] bg-white/[0.2] shadow-[0_1px_3px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.18)]"
                            />
                          )}
                          <span className="relative">{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Slim spectrum, fades when effects are off */}
              <motion.div
                className="shrink-0 border-y border-white/[0.06] bg-black/15 px-4 py-1.5"
                animate={{ opacity: bypass ? 0.35 : 1 }}
                transition={{ duration: 0.3 }}
              >
                <Spectrum />
              </motion.div>

              {/* Content */}
              <motion.div
                ref={scrollRef}
                className="scrollbar-hide flex-1 overflow-y-auto overscroll-contain px-4 py-3"
                animate={{ opacity: bypass ? 0.5 : 1 }}
                transition={{ duration: 0.3 }}
              >
                <AnimatePresence mode="wait" custom={dir} initial={false}>
                  <motion.div
                    key={activeTab}
                    custom={dir}
                    variants={tabVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                  >
                    {activeTab === "presets" && <PresetsTab {...tabProps} />}
                    {activeTab === "tune" && <TuneTab {...tabProps} />}
                    {activeTab === "space" && <SpaceTab {...tabProps} />}
                    {activeTab === "voice" && <VoiceTab {...tabProps} />}
                    {activeTab === "tempo" && <TempoTab {...tabProps} />}
                    {activeTab === "chain" && <ChainTab {...tabProps} />}
                  </motion.div>
                </AnimatePresence>
              </motion.div>

              {/* Footer */}
              <div className="shrink-0 border-t border-white/[0.06] px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-center">
                <TextButton
                  danger
                  onClick={() =>
                    commit({ ...DEFAULT_AUDIO_FX, eq: [0, 0, 0], chain: [...DEFAULT_CHAIN], crossfade: fx.crossfade })
                  }
                >
                  Reset all
                </TextButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}