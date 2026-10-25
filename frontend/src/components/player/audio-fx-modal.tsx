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
  Check,
  Gauge,
  Headphones,
  Landmark,
  Mic,
  Moon,
  Orbit,
  Plus,
  Radio,
  RotateCcw,
  SlidersVertical,
  Sparkles,
  Speaker,
  Trash2,
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
  filterFrequencies,
  type AudioFxSettings,
} from "@/lib/audio-engine";
import { useIsMobile } from "@/hooks/useIsMobile";

/* ─────────────────────────────────────────────────────────────────────────────
   Motion tokens – one set of springs used everywhere so the whole UI feels
   like it is made of the same material.
───────────────────────────────────────────────────────────────────────────── */
const SPRING_UI = { type: "spring", stiffness: 520, damping: 38, mass: 0.8 } as const;
const SPRING_SOFT = { type: "spring", stiffness: 380, damping: 34, mass: 0.9 } as const;
const SPRING_SHEET = { type: "spring", stiffness: 380, damping: 40, mass: 0.95 } as const;
const SPRING_POP = { type: "spring", stiffness: 440, damping: 30, mass: 0.8 } as const;

/* ─────────────────────────────────────────────────────────────────────────────
   Presets
───────────────────────────────────────────────────────────────────────────── */
type Sound = Pick<
  AudioFxSettings,
  "eq" | "reverb" | "reverbAmount" | "echo" | "echoTime" | "chorus" | "filter" | "is8D" | "direction8D" | "speed8D"
>;

const BASE_SOUND: Sound = {
  eq: [0, 0, 0],
  reverb: "none",
  reverbAmount: 0.4,
  echo: 0,
  echoTime: 0.32,
  chorus: 0,
  filter: 0,
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
  tint: string;
  sound: Sound;
}

const PRESETS: BuiltInPreset[] = [
  { id: "original", name: "Original", blurb: "No processing", icon: AudioLines, tint: "from-zinc-400 to-zinc-600", sound: mk({}) },
  { id: "after-hours", name: "After Hours", blurb: "Warm and soft", icon: Moon, tint: "from-indigo-400 to-violet-600", sound: mk({ eq: [3, -1, -2], reverb: "warehouse", reverbAmount: 0.25, chorus: 0.2, filter: -0.12 }) },
  { id: "immersive", name: "Immersive", blurb: "8D orbit and space", icon: Orbit, tint: "from-sky-400 to-blue-600", sound: mk({ eq: [2, 0, 2], reverb: "warehouse", reverbAmount: 0.3, chorus: 0.25, is8D: true, speed8D: 0.1 }) },
  { id: "clarity", name: "Studio Clarity", blurb: "Balanced and crisp", icon: Sparkles, tint: "from-emerald-400 to-teal-600", sound: mk({ eq: [-1, 2, 3] }) },
  { id: "headphones", name: "Headphones", blurb: "Wide and intimate", icon: Headphones, tint: "from-pink-400 to-rose-600", sound: mk({ eq: [2, 1, 1], chorus: 0.3 }) },
  { id: "bass", name: "Bass Boost", blurb: "Deep low end", icon: Speaker, tint: "from-orange-400 to-red-600", sound: mk({ eq: [7, 1, 2] }) },
  { id: "vocal", name: "Vocal Boost", blurb: "Voices up front", icon: Mic, tint: "from-amber-400 to-orange-500", sound: mk({ eq: [-2, 5, 2] }) },
  { id: "hall", name: "Concert Hall", blurb: "Live room feel", icon: Landmark, tint: "from-yellow-400 to-amber-600", sound: mk({ eq: [1, 0, 1], reverb: "cathedral", reverbAmount: 0.4 }) },
  { id: "lofi", name: "Lo-Fi", blurb: "Dusty and mellow", icon: Radio, tint: "from-lime-400 to-green-600", sound: mk({ eq: [3, 0, -3], filter: -0.3, chorus: 0.15, reverb: "warehouse", reverbAmount: 0.2 }) },
  { id: "dream", name: "Dream Echo", blurb: "Floaty repeats", icon: Waves, tint: "from-fuchsia-400 to-purple-600", sound: mk({ echo: 0.35, echoTime: 0.38, reverb: "cathedral", reverbAmount: 0.25, chorus: 0.2 }) },
];

const pickSound = (fx: AudioFxSettings): Sound => ({
  eq: [...fx.eq],
  reverb: fx.reverb,
  reverbAmount: fx.reverbAmount,
  echo: fx.echo,
  echoTime: fx.echoTime,
  chorus: fx.chorus,
  filter: fx.filter,
  is8D: fx.is8D,
  direction8D: fx.direction8D,
  speed8D: fx.speed8D,
});

/** Canonical form so unused knobs (e.g. reverb amount while reverb is off) never break preset matching. */
const canon = (s: Sound) =>
  JSON.stringify({
    eq: s.eq.map((v) => Math.round(v)),
    reverb: s.reverb,
    reverbAmount: s.reverb === "none" ? 0 : +s.reverbAmount.toFixed(2),
    echo: +s.echo.toFixed(2),
    echoTime: s.echo <= 0.001 ? 0 : +s.echoTime.toFixed(2),
    chorus: +s.chorus.toFixed(2),
    filter: +s.filter.toFixed(2),
    is8D: s.is8D,
    direction8D: s.is8D ? s.direction8D : "clockwise",
    speed8D: s.is8D ? +s.speed8D.toFixed(2) : 0,
  });

interface CustomPreset {
  id: string;
  name: string;
  sound: Sound;
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
   live()   → straight to the audio graph while dragging (no store write, no re-render)
   commit() → graph + store (persisted) on release / tap
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
  icon?: LucideIcon;
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
      className="relative grid rounded-[11px] bg-black/25 p-[2px]"
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      <motion.span
        aria-hidden
        className="absolute inset-y-[2px] left-[2px] rounded-[9px] bg-white/[0.18] shadow-[0_1px_3px_rgba(0,0,0,0.35)] ring-1 ring-inset ring-white/10"
        style={{ width: `calc((100% - 4px) / ${n})` }}
        initial={false}
        animate={{ x: `${idx * 100}%` }}
        transition={SPRING_UI}
      />
      {options.map((o) => {
        const Icon = o.icon;
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-10 flex items-center justify-center gap-1.5 rounded-[9px] px-1 py-[7px] text-[12.5px] font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand/60",
              active ? "text-white" : "text-white/55 hover:text-white/80"
            )}
          >
            {Icon && <Icon size={14} strokeWidth={2} />}
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <div className="flex min-h-[18px] items-center justify-between px-1">
        <h3 className="text-[12px] font-medium text-white/45">{title}</h3>
        {action}
      </div>
      <div className="overflow-hidden rounded-2xl bg-white/[0.07] ring-1 ring-inset ring-white/[0.06]">{children}</div>
    </section>
  );
}

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("border-t border-white/[0.06] px-4 py-3 first:border-t-0", className)}>{children}</div>;
}

function TextButton({ onClick, children, disabled }: { onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md px-1 text-[12px] font-medium text-brand outline-none transition-opacity active:opacity-50 focus-visible:ring-2 focus-visible:ring-brand/60 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   FxSlider – Radix slider with an Apple-style thumb. Keeps its own local value
   so dragging never waits on the store.
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
      className={cn(
        "relative flex select-none items-center",
        vertical ? "h-full w-8 flex-col" : "h-8 w-full"
      )}
      style={{ touchAction: vertical ? "none" : "pan-y" }}
    >
      <Slider.Track
        className={cn(
          "relative grow overflow-hidden rounded-full bg-white/[0.18]",
          vertical ? "w-[5px]" : "h-[5px]"
        )}
      >
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
   Live spectrum (canvas, 30 fps, only mounted while the panel is open)
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
    let data: Uint8Array | null = null;
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

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 33 || document.hidden) return;
      last = now;

      const analyser = audioEngine.getAnalyser();
      if (analyser && playingRef.current) {
        if (!data || data.length !== analyser.frequencyBinCount) data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data as any);
      } else {
        data = null;
      }

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;
      const gap = 3;
      const bw = Math.max(1, (w - gap * (BARS - 1)) / BARS);

      for (let i = 0; i < BARS; i++) {
        let target = 0;
        if (data) {
          const start = 1 + Math.floor(Math.pow(i / BARS, 2) * 160);
          const end = Math.max(start + 1, 1 + Math.floor(Math.pow((i + 1) / BARS, 2) * 160));
          let sum = 0;
          for (let b = start; b < end; b++) sum += data[b];
          target = Math.pow(sum / (end - start) / 255, 1.35);
        }
        // fast attack, slow release → feels physical
        levels[i] += (target - levels[i]) * (target > levels[i] ? 0.55 : 0.14);
        const bh = Math.max(2, levels[i] * h);
        const x = i * (bw + gap);
        ctx.beginPath();
        if ((ctx as any).roundRect) (ctx as any).roundRect(x, h - bh, bw, bh, Math.min(bw / 2, 3));
        else ctx.rect(x, h - bh, bw, bh);
        ctx.fill();
      }
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
      className="h-8 w-full text-brand opacity-90 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]"
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
  icon: Icon,
  tint,
  active,
  onClick,
}: {
  name: string;
  blurb: string;
  icon: LucideIcon;
  tint: string;
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
        active ? "bg-white/[0.14] ring-brand/70" : "bg-white/[0.07] ring-white/[0.06] hover:bg-white/[0.11]"
      )}
    >
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br text-white shadow-sm", tint)}>
        <Icon size={17} strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-white">{name}</span>
        <span className="block truncate text-[11px] text-white/45">{blurb}</span>
      </span>
      <AnimatePresence initial={false}>
        {active && (
          <motion.span
            key="check"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={SPRING_POP}
            className="absolute right-2 top-2 grid h-4 w-4 place-items-center rounded-full bg-brand text-black"
          >
            <Check size={10} strokeWidth={3.5} />
          </motion.span>
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
  const isActive = (s: Sound) => !fx.bypass && canon(s) === activeKey;
  const apply = (s: Sound) => commit({ ...s, eq: [...s.eq], bypass: false });

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
          <PresetTile key={p.id} {...p} active={isActive(p.sound)} onClick={() => apply(p.sound)} />
        ))}
      </div>

      <Section
        title="My Presets"
        action={
          <TextButton onClick={() => setNaming((v) => !v)}>
            <span className="inline-flex items-center gap-1">
              <Plus size={12} strokeWidth={2.5} />
              Save current
            </span>
          </TextButton>
        }
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
                  className="rounded-lg bg-brand px-3 py-2 text-[13px] font-semibold text-black outline-none transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  Save
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {custom.length === 0 && !naming ? (
          <Row>
            <p className="text-[12px] leading-snug text-white/40">
              Dial in a sound you love, then save it here to bring it back in one tap.
            </p>
          </Row>
        ) : (
          custom.map((p) => {
            const active = isActive(p.sound);
            return (
              <Row key={p.id} className="flex items-center gap-2 py-2">
                <button
                  type="button"
                  onClick={() => apply(p.sound)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
                >
                  <span className="truncate text-[13px] font-medium text-white">{p.name}</span>
                  {active && <Check size={14} strokeWidth={3} className="shrink-0 text-brand" />}
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${p.name}`}
                  onClick={() => setCustom(custom.filter((c) => c.id !== p.id))}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/40 outline-none transition-all hover:bg-white/10 hover:text-red-400 active:scale-90 focus-visible:ring-2 focus-visible:ring-brand/60"
                >
                  <Trash2 size={14} />
                </button>
              </Row>
            );
          })
        )}
      </Section>
    </div>
  );
}

/* ── Tune (EQ + Filter) ────────────────────────────────────────────────────── */
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
              snap={0}
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
          <div className="mt-0.5 flex justify-between text-[10px] text-white/35">
            <span>Muffled</span>
            <span>Thin</span>
          </div>
        </Row>
      </Section>
    </div>
  );
}

/* ── Space (Reverb / Echo / Chorus / 8D) ───────────────────────────────────── */
const REVERB_OPTIONS: SegOption<string>[] = [
  { value: "none", label: "None" },
  { value: "warehouse", label: "Small Hall" },
  { value: "cathedral", label: "Church" },
];
const DIRECTION_OPTIONS: SegOption<"clockwise" | "counter-clockwise">[] = [
  { value: "clockwise", label: "Clockwise" },
  { value: "counter-clockwise", label: "Counter" },
];
const pctText = (v: number) => (v <= 0.005 ? "Off" : `${Math.round(v * 100)}%`);

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
          <FxSlider
            title="Mix"
            min={0}
            max={1}
            step={0.01}
            value={fx.echo}
            format={pctText}
            onLive={(v) => live({ echo: v })}
            onCommit={(v) => commit({ echo: v })}
          />
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
          <FxSlider
            title="Width"
            min={0}
            max={1}
            step={0.01}
            value={fx.chorus}
            format={pctText}
            onLive={(v) => live({ chorus: v })}
            onCommit={(v) => commit({ chorus: v })}
          />
        </Row>
      </Section>

      <Section title="Spatial">
        <Row>
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 text-white">
              <motion.span
                key={`${fx.is8D}-${fx.direction8D}-${fx.speed8D}`}
                className="grid place-items-center"
                animate={{ rotate: fx.is8D ? (fx.direction8D === "clockwise" ? 360 : -360) : 0 }}
                transition={fx.is8D ? { repeat: Infinity, ease: "linear", duration: orbitPeriod } : { duration: 0 }}
              >
                <Orbit size={17} strokeWidth={2} />
              </motion.span>
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-white/90">8D Audio</div>
              <div className="text-[11px] text-white/40">Sound orbits around your head</div>
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
              className="overflow-hidden border-t border-white/[0.06]"
            >
              <Row>
                <Segmented
                  label="Orbit direction"
                  value={fx.direction8D}
                  options={DIRECTION_OPTIONS}
                  onChange={(v) => commit({ direction8D: v })}
                />
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

/* ── Tempo ─────────────────────────────────────────────────────────────────── */
const SPEED_CHIPS = [0.75, 1, 1.25, 1.5];

function TempoTab({ fx, live, commit }: TabProps) {
  // "Tape mode": pitch follows speed. Kept as UI state so toggling at 1.00× still registers.
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
      <div className="rounded-2xl bg-white/[0.07] px-4 pb-3 pt-5 ring-1 ring-inset ring-white/[0.06]">
        <div className="text-center">
          <div className="text-[44px] font-semibold leading-none tracking-tight tabular-nums text-white">
            {liveSpeed.toFixed(2)}
            <span className="ml-0.5 text-[24px] text-white/50">×</span>
          </div>
          <div className="mt-1.5 text-[12px] text-white/45">{tape ? "Pitch follows speed" : "Pitch stays natural"}</div>
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
                near(fx.speed, s) ? "bg-white/[0.18] text-white" : "bg-black/20 text-white/55 hover:text-white/80"
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
              <div className="text-[11px] text-white/40">Off gives the classic tape speed-up</div>
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
          tint="from-blue-400 to-indigo-600"
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
          tint="from-pink-400 to-rose-600"
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
   Controls panel (tabs + content + footer). Also exported as AudioFxMenu.
───────────────────────────────────────────────────────────────────────────── */
type TabId = "presets" | "tune" | "space" | "tempo";
const TABS: SegOption<TabId>[] = [
  { value: "presets", label: "Presets", icon: Sparkles },
  { value: "tune", label: "Tune", icon: SlidersVertical },
  { value: "space", label: "Space", icon: Orbit },
  { value: "tempo", label: "Tempo", icon: Gauge },
];

let lastTab: TabId = "presets"; // remembered between opens

interface AudioFxControlsProps {
  className?: string;
  contentHeight?: string | number;
}

const AudioFxControls = memo(function AudioFxControls({ className, contentHeight }: AudioFxControlsProps) {
  const { fx, live, commit } = useFx();
  const [tab, setTabState] = useState<TabId>(lastTab);
  const setTab = (t: TabId) => {
    lastTab = t;
    setTabState(t);
  };
  const tabProps: TabProps = { fx, live, commit };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="px-5">
        <Spectrum />
      </div>

      <div className="px-5 pb-3 pt-1">
        <Segmented label="Studio FX sections" value={tab} options={TABS} onChange={setTab} />
      </div>

      <div
        className="scrollbar-hide overflow-y-auto overscroll-contain px-5 pb-5"
        style={{ height: contentHeight, touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0, transition: SPRING_SOFT }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
          >
            {tab === "presets" && <PresetsTab {...tabProps} />}
            {tab === "tune" && <TuneTab {...tabProps} />}
            {tab === "space" && <SpaceTab {...tabProps} />}
            {tab === "tempo" && <TempoTab {...tabProps} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.07] bg-black/10 px-5 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => commit({ ...DEFAULT_AUDIO_FX, eq: [0, 0, 0], crossfade: fx.crossfade })}
          className="flex items-center gap-1.5 rounded-md px-1 py-1 text-[12px] font-medium text-white/55 outline-none transition-all hover:text-white active:scale-95 focus-visible:ring-2 focus-visible:ring-brand/60"
        >
          <RotateCcw size={12} strokeWidth={2.25} />
          Reset all
        </button>
        <span className="text-[11px] font-medium text-white/25">Zenify Engine</span>
      </div>
    </div>
  );
});

// Alias export for backward compatibility
export const AudioFxMenu = AudioFxControls;

/* ─────────────────────────────────────────────────────────────────────────────
   Modal: macOS popover on desktop, draggable bottom sheet on mobile
───────────────────────────────────────────────────────────────────────────── */
export function AudioFxModal() {
  const isOpen = useUIStore((s) => s.isAudioFxOpen);
  const setOpen = useUIStore((s) => s.setAudioFxOpen);
  const isMobile = useIsMobile();
  const reduceMotion = useReducedMotion();
  const bypass = usePlayerStore((s) => s.audioFx.bypass);
  const setFx = usePlayerStore((s) => s.setFx);

  const dragY = useMotionValue(0);
  const dragControls = useDragControls();
  const backdropFade = useTransform(dragY, [0, 360], [1, 0.15]);
  const close = useCallback(() => setOpen(false), [setOpen]);

  // Scroll lock + Esc
  useEffect(() => {
    if (!isOpen) return;
    dragY.set(0);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, close, dragY]);

  const toggleEffects = (on: boolean) => {
    audioEngine.applyFx({ bypass: !on });
    setFx({ bypass: !on });
  };

  const sheetMotion: Pick<MotionProps, "initial" | "animate" | "exit"> = reduceMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, y: 0, transition: { duration: 0.15 } },
        exit: { opacity: 0, transition: { duration: 0.12 } },
      }
    : isMobile
    ? {
        initial: { y: "100%" },
        animate: { y: 0, transition: SPRING_SHEET },
        exit: { y: "100%", transition: { type: "spring", stiffness: 420, damping: 42, mass: 0.9 } },
      }
    : {
        initial: { opacity: 0, scale: 0.9, y: 14 },
        animate: { opacity: 1, scale: 1, y: 0, transition: SPRING_POP },
        exit: { opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] as [number, number, number, number] } },
      };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop – plain fade (no full-screen blur: that is what makes sheets stutter) */}
          <motion.div
            key="fx-backdrop"
            className="fixed inset-0 z-[1400]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={close}
          >
            {isMobile && <motion.div className="absolute inset-0 bg-black/45" style={{ opacity: backdropFade }} />}
          </motion.div>

          <div
            className={cn(
              "pointer-events-none fixed z-[1500] flex",
              isMobile ? "inset-x-0 bottom-0 justify-center" : "bottom-[44px] right-6"
            )}
          >
            <motion.div
              key="fx-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Studio FX"
              style={{ y: dragY, transformOrigin: isMobile ? "50% 100%" : "100% 100%" }}
              drag={isMobile ? "y" : false}
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0 }}
              dragElastic={{ top: 0.05, bottom: 0 }}
              dragMomentum={false}
              onDragEnd={(_, info) => {
                if (info.velocity.y > 500 || info.offset.y > 120) {
                  close();
                } else {
                  animate(dragY, 0, { type: "spring", stiffness: 500, damping: 38, velocity: info.velocity.y });
                }
              }}
              {...sheetMotion}
              className={cn(
                // Glassmorphism: translucent tint + heavy blur + saturation boost + hairline highlight
                "pointer-events-auto relative flex max-h-[100dvh] flex-col overflow-hidden border-white/10 bg-neutral-900/60 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.65)] ring-1 ring-inset ring-white/[0.06] backdrop-blur-2xl backdrop-saturate-150 [transform:translateZ(0)] will-change-transform",
                isMobile
                  ? "w-full max-w-[520px] rounded-t-[28px] border-t"
                  : "w-[380px] max-w-[calc(100vw-24px)] rounded-[22px] border"
              )}
            >
              <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />

              {/* Header / drag handle */}
              <div
                className={cn("touch-none select-none", isMobile && "cursor-grab active:cursor-grabbing")}
                onPointerDown={(e) => {
                  if (isMobile) dragControls.start(e);
                }}
              >
                {isMobile && (
                  <div className="flex justify-center pt-2.5">
                    <div className="h-[5px] w-9 rounded-full bg-white/25" />
                  </div>
                )}
                <div className="flex items-center gap-3 px-5 pb-2 pt-3.5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-gradient-to-b from-brand to-brand/70 text-black shadow-inner">
                    <AudioLines size={18} strokeWidth={2.25} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[17px] font-semibold leading-tight tracking-tight text-white">Studio FX</h2>
                    <p className="text-[12px] text-white/50">{bypass ? "Effects off" : "Effects on"}</p>
                  </div>
                  <Switch label="Effects" checked={!bypass} onChange={toggleEffects} />
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={close}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-white/60 outline-none transition-all hover:bg-white/[0.16] hover:text-white active:scale-90 focus-visible:ring-2 focus-visible:ring-brand/60"
                  >
                    <X size={15} strokeWidth={2.5} />
                  </button>
                </div>
              </div>

              <AudioFxControls
                contentHeight={isMobile ? "min(56dvh, 440px)" : "min(400px, calc(100dvh - 330px))"}
              />
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
