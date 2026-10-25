"use client";
import React, { useEffect, useRef } from "react";
import { cn, getMediaUrl } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────────────────────
 * ArtworkMeshBackground — Apple Music style fluid artwork mesh
 *
 * How it stays smooth AND cheap:
 *  1. Colour grading + blur are baked ONCE per cover into small soft-edged
 *     "blob" tiles. Nothing like CSS blur()/saturate() runs per frame (that was
 *     the biggest GPU/battery cost in the old version).
 *  2. The canvas is tiny (~130–190px long side). The compositor's bilinear
 *     upscale gives the liquid softness for free.
 *  3. Motion is real spring physics (semi-implicit, sub-stepped, dt-clamped):
 *     every blob chases a wandering waypoint with under-damped springs, so it
 *     accelerates / decelerates / overshoots like liquid instead of looping a sine.
 *  4. Zero React re-renders while animating. Everything lives in refs.
 *  5. The loop fully STOPS (0% CPU/GPU) when: tab hidden, scrolled off-screen,
 *     paused + eased to rest, or reduced-motion is on. No setInterval polling.
 *  6. Adaptive governor: if real frame intervals slip, it lowers resolution and
 *     then fps by itself. Low battery (not charging, ≤20%) caps to 30fps.
 * ───────────────────────────────────────────────────────────────────────────── */

export type ArtworkMeshBackgroundProps = {
  coverUrl?: string | null;
  covers?: string[];
  /** Eases motion to a stop (and stops the render loop). Resumes smoothly. */
  paused?: boolean;
  /** Global motion multiplier. 1 = default calm flow. */
  speed?: number;
  /**
   * Live energy 0..1 (audio level / beat / loudness). Makes the mesh breathe and
   * flow faster. Pass a number, or a ref object ({ current }) to avoid re-renders
   * when driving it from an audio analyser at 60Hz.
   */
  intensity?: number | { current: number };
  /** Subtle pointer / touch parallax. */
  interactive?: boolean;
  /** Tiny static noise layer that removes gradient banding on dark colours. */
  dither?: boolean;
  className?: string;
};

type Tile = { layers: HTMLCanvasElement[]; avg: string };

type NodeCfg = {
  ax: number; ay: number;      // anchor (0..1)
  rx: number; ry: number;      // wander radius around anchor
  size: number; osc: number;   // size (× longest canvas side) and its random variation
  alpha: number;
  spin: number;                // rad/s (signed)
  v: number;                   // which artwork crop layer to use
  k: number; z: number;        // spring stiffness / damping ratio (<1 = slight overshoot)
  hold: [number, number];      // seconds between new waypoints
  w1: number; w2: number;      // idle swirl frequencies
  ph: number;                  // phase
  depth: number;               // pointer parallax depth
};

const NODES: NodeCfg[] = [
  { ax: 0.70, ay: 0.28, rx: 0.22, ry: 0.20, size: 2.1, osc: 0.16, alpha: 0.92, spin:  0.26, v: 0, k: 2.0, z: 0.74, hold: [5, 9],  w1: 0.21, w2: 0.17, ph: 0.0, depth: 1.0 },
  { ax: 0.30, ay: 0.72, rx: 0.24, ry: 0.20, size: 2.3, osc: 0.16, alpha: 0.88, spin: -0.30, v: 1, k: 2.4, z: 0.80, hold: [6, 10], w1: 0.18, w2: 0.23, ph: 1.8, depth: 0.7 },
  { ax: 0.26, ay: 0.26, rx: 0.20, ry: 0.22, size: 1.9, osc: 0.18, alpha: 0.80, spin:  0.34, v: 2, k: 2.8, z: 0.70, hold: [4, 8],  w1: 0.26, w2: 0.19, ph: 3.2, depth: 1.2 },
  { ax: 0.76, ay: 0.74, rx: 0.20, ry: 0.20, size: 2.0, osc: 0.16, alpha: 0.82, spin: -0.36, v: 1, k: 2.2, z: 0.78, hold: [5, 9],  w1: 0.17, w2: 0.24, ph: 4.5, depth: 0.5 },
  { ax: 0.50, ay: 0.50, rx: 0.24, ry: 0.24, size: 2.6, osc: 0.14, alpha: 0.70, spin:  0.18, v: 0, k: 1.6, z: 0.85, hold: [7, 12], w1: 0.14, w2: 0.16, ph: 5.8, depth: 0.3 },
];

/** Quality ladder used by the adaptive governor. */
const LEVELS = [
  { fps: 60, res: 1.0 },
  { fps: 60, res: 0.72 },
  { fps: 30, res: 0.6 },
];

// Tile baking constants
const SAMPLE = 32;     // colour sampling resolution (this is what gives the blur)
const TILE = 128;      // final tile resolution
const SAT = 1.9;
const CON = 1.08;
const BRI = 1.05;

const FALLBACK_BG = "#121214";

/* ───────────────────────────── helpers ───────────────────────────── */

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

function loadImage(src: string, cors: boolean) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    if (cors) i.crossOrigin = "anonymous";
    i.decoding = "async";
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("image load failed"));
    i.src = src;
  });
}

function mkCanvas(size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

/** Step-wise resample (halves quality loss vs one big jump and avoids aliasing). */
function resample(src: HTMLCanvasElement, size: number) {
  const c = mkCanvas(size);
  const x = c.getContext("2d")!;
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = "high";
  x.drawImage(src, 0, 0, size, size);
  return c;
}

const CROPS = [
  { cx: 0.5, cy: 0.5, z: 1.0 },   // whole artwork
  { cx: 0.5, cy: 0.5, z: 0.55 },  // zoomed centre — different colour mix
  { cx: 0.3, cy: 0.7, z: 0.6 },   // off-centre detail
];

/** Bake one crop: downsample → vibrancy-aware grade → smooth upscale → soft round mask. */
function makeLayer(img: HTMLImageElement, crop: (typeof CROPS)[number], tainted: boolean) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const side = Math.max(2, Math.min(iw, ih) * crop.z);
  const sx = clamp(crop.cx * iw - side / 2, 0, Math.max(0, iw - side));
  const sy = clamp(crop.cy * ih - side / 2, 0, Math.max(0, ih - side));

  // two-step downsample for a clean average
  const mid = mkCanvas(SAMPLE * 4);
  const mc = mid.getContext("2d")!;
  mc.imageSmoothingEnabled = true; mc.imageSmoothingQuality = "high";
  mc.drawImage(img, sx, sy, side, side, 0, 0, mid.width, mid.height);

  const small = mkCanvas(SAMPLE);
  const sc = small.getContext("2d", { willReadFrequently: true })!;
  sc.imageSmoothingEnabled = true; sc.imageSmoothingQuality = "high";
  if (tainted && "filter" in sc) (sc as any).filter = `saturate(${SAT}) contrast(${CON})`;
  sc.drawImage(mid, 0, 0, SAMPLE, SAMPLE);

  let avg = FALLBACK_BG;
  if (!tainted) {
    try {
      const id = sc.getImageData(0, 0, SAMPLE, SAMPLE);
      const d = id.data;
      let ar = 0, ag = 0, ab = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        ar += r; ag += g; ab += b; n++;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const sat = mx ? (mx - mn) / mx : 0;
        // already-vivid colours get less boost → no clipping, muted art gets lifted
        const boost = 1 + (SAT - 1) * (1 - sat * 0.55);
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        d[i]     = ((l + (r - l) * boost - 128) * CON + 128) * BRI;
        d[i + 1] = ((l + (g - l) * boost - 128) * CON + 128) * BRI;
        d[i + 2] = ((l + (b - l) * boost - 128) * CON + 128) * BRI;
      }
      sc.putImageData(id, 0, 0);
      avg = `rgb(${((ar / n) * 0.42) | 0},${((ag / n) * 0.42) | 0},${((ab / n) * 0.42) | 0})`;
    } catch { /* ignore, keep ungraded */ }
  }

  // smooth upscale (32 → 64 → 128)
  const tile = resample(resample(small, TILE / 2), TILE);

  // soft circular alpha mask → blobs blend with no hard edges, no CSS blur needed
  const tc = tile.getContext("2d")!;
  const g = tc.createRadialGradient(TILE / 2, TILE / 2, 0, TILE / 2, TILE / 2, TILE / 2);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(0.42, "rgba(0,0,0,0.92)");
  g.addColorStop(0.75, "rgba(0,0,0,0.35)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  tc.globalCompositeOperation = "destination-in";
  tc.fillStyle = g;
  tc.fillRect(0, 0, TILE, TILE);

  return { tile, avg };
}

async function loadTile(src: string): Promise<Tile> {
  let img: HTMLImageElement;
  let tainted = false;
  try {
    img = await loadImage(src, true);
  } catch {
    img = await loadImage(src, false); // no CORS headers → still drawable, just can't read pixels
    tainted = true;
  }
  const layers: HTMLCanvasElement[] = [];
  let avg = FALLBACK_BG;
  CROPS.forEach((c, i) => {
    const r = makeLayer(img, c, tainted);
    layers.push(r.tile);
    if (i === 0) avg = r.avg;
  });
  return { layers, avg };
}

const tileCache = new Map<string, Tile>();
async function getTile(src: string): Promise<Tile> {
  const hit = tileCache.get(src);
  if (hit) return hit;
  const t = await loadTile(src);
  tileCache.set(src, t);
  if (tileCache.size > 6) tileCache.delete(tileCache.keys().next().value as string);
  return t;
}

let noiseUrl: string | null = null;
function getNoise() {
  if (noiseUrl !== null) return noiseUrl;
  if (typeof document === "undefined") return "";
  try {
    const c = mkCanvas(96);
    const x = c.getContext("2d")!;
    const id = x.createImageData(96, 96);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = 255;
    }
    x.putImageData(id, 0, 0);
    noiseUrl = c.toDataURL("image/png");
  } catch { noiseUrl = ""; }
  return noiseUrl;
}

/* ───────────────────────────── component ───────────────────────────── */

export const ArtworkMeshBackground = React.memo(function ArtworkMeshBackground({
  coverUrl, covers, paused = false, speed = 1, intensity = 0, interactive = true, dither = true, className,
}: ArtworkMeshBackgroundProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ditherRef = useRef<HTMLDivElement>(null);
  const wakeRef = useRef<() => void>(() => {});

  // live props → refs (so changing them never tears down the engine)
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const speedRef = useRef(speed); speedRef.current = speed;
  const intensityRef = useRef(intensity); intensityRef.current = intensity;
  const interactiveRef = useRef(interactive); interactiveRef.current = interactive;

  const st = useRef<{ cur: Tile | null; prev: Tile | null; fade: number }>({ cur: null, prev: null, fade: 1 });

  const rawSrc = coverUrl || covers?.[0] || "";
  const src = getMediaUrl(rawSrc) || "/logo.png";

  /* ── engine (mounted once) ── */
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduce = mqReduce.matches;

    let raf = 0, last = 0, t = 0;
    let visible = true;
    let ts = reduce ? 0 : 1;           // eased time-scale (pause / resume)
    let energy = 0;                    // eased intensity
    let px = 0, py = 0, ptx = 0, pty = 0; // eased pointer
    let level = 0, lowPower = false;
    let frameMs = 1000 / 60;
    let gSum = 0, gN = 0;              // governor window

    const rand = mulberry32(0x9e3779b1);
    const nodes = NODES.map((c, i) => ({
      x: c.ax, y: c.ay, vx: 0, vy: 0, tx: c.ax, ty: c.ay,
      s: c.size, sv: 0, ts: c.size,
      r: c.ph, rv: c.spin, rt: c.spin,
      next: rand() * c.hold[0],
      _i: i,
    }));
    const retarget = (n: (typeof nodes)[number], c: NodeCfg) => {
      n.tx = c.ax + (rand() * 2 - 1) * c.rx;
      n.ty = c.ay + (rand() * 2 - 1) * c.ry;
      n.ts = c.size * (1 + (rand() * 2 - 1) * c.osc);
      n.rt = c.spin * (0.55 + rand() * 0.9);
      n.next = t + c.hold[0] + rand() * (c.hold[1] - c.hold[0]);
    };
    nodes.forEach((n, i) => retarget(n, NODES[i]));

    const canRun = () => visible && !document.hidden;
    const readIntensity = () => {
      const v = intensityRef.current;
      return clamp(typeof v === "number" ? v : v?.current ?? 0, 0, 1);
    };

    const applyLevel = () => {
      const L = LEVELS[level];
      frameMs = 1000 / (lowPower ? Math.min(30, L.fps) : L.fps);
    };

    const applySize = () => {
      const w = wrap.clientWidth || 1, h = wrap.clientHeight || 1;
      const mobile = window.innerWidth <= 768;
      const long = (mobile ? 128 : 190) * LEVELS[level].res * (lowPower ? 0.85 : 1);
      const k = Math.max(w, h) / long;
      const cw = Math.max(16, Math.round(w / k)), ch = Math.max(16, Math.round(h / k));
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw; canvas.height = ch; // resets ctx state
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "medium";
      }
    };

    /* physics: semi-implicit Euler spring, sub-stepped for stability */
    const step = (h: number, e: number) => {
      for (let i = 0; i < nodes.length; i++) {
        const c = NODES[i], n = nodes[i];
        const k = c.k * (1 + e * 1.2);
        const d = 2 * c.z * Math.sqrt(k);
        n.vx += (k * (n.tx - n.x) - d * n.vx) * h; n.x += n.vx * h;
        n.vy += (k * (n.ty - n.y) - d * n.vy) * h; n.y += n.vy * h;
        const ks = 1.3, ds = 2 * 0.9 * Math.sqrt(ks);
        n.sv += (ks * (n.ts - n.s) - ds * n.sv) * h; n.s += n.sv * h;
        n.rv += (n.rt - n.rv) * (1 - Math.exp(-h * 1.5));
        n.r += n.rv * h;
      }
    };

    const scene = (tile: Tile, a: number) => {
      const W = canvas.width, H = canvas.height, m = Math.max(W, H);
      for (let i = 0; i < nodes.length; i++) {
        const c = NODES[i], n = nodes[i];
        const sx = Math.sin(t * c.w1 + c.ph) * 0.035;
        const sy = Math.cos(t * c.w2 + c.ph * 1.3) * 0.035;
        const x = (n.x + sx + px * c.depth * 0.05) * W;
        const y = (n.y + sy + py * c.depth * 0.05) * H;
        const sz = m * n.s * (1 + energy * 0.08 * Math.sin(t * 1.7 + c.ph));
        const cs = Math.cos(n.r), sn = Math.sin(n.r);
        ctx.globalAlpha = a * c.alpha;
        ctx.setTransform(cs, sn, -sn, cs, x, y);
        ctx.drawImage(tile.layers[c.v], -sz / 2, -sz / 2, sz, sz);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    };

    const render = () => {
      const s = st.current;
      ctx.globalAlpha = 1;
      ctx.fillStyle = s.cur?.avg ?? FALLBACK_BG;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const f = s.fade, a = f * f * (3 - 2 * f); // smoothstep crossfade
      if (s.prev && f < 1) scene(s.prev, 1);
      if (s.cur) scene(s.cur, a);
      ctx.globalAlpha = 1;
    };

    const frame = (now: number) => {
      raf = 0;
      const elapsed = now - last;
      if (elapsed < frameMs - 2) { raf = requestAnimationFrame(frame); return; } // fps cap (tolerant of vsync jitter)
      last = now;
      const dt = Math.min(elapsed / 1000, 0.05);

      // adaptive governor — only trust normal-looking intervals
      if (elapsed < 250) {
        gSum += elapsed; gN++;
        if (gN >= 90) {
          const avg = gSum / gN; gSum = gN = 0;
          if (level < LEVELS.length - 1 && avg > frameMs * 1.45) { level++; applyLevel(); applySize(); }
        }
      }

      // ease pause/resume + intensity + pointer
      const I = readIntensity();
      const tsTarget = pausedRef.current || reduce ? 0 : 1;
      ts += (tsTarget - ts) * (1 - Math.exp(-dt * 3.2));
      if (tsTarget === 0 && ts < 0.002) ts = 0;
      energy += (I - energy) * (1 - Math.exp(-dt * 6));
      const pk = 1 - Math.exp(-dt * 3);
      px += (ptx - px) * pk; py += (pty - py) * pk;

      // advance simulation
      const simDt = dt * speedRef.current * ts * (1 + energy * 0.6);
      if (simDt > 0) {
        t += simDt;
        for (let i = 0; i < nodes.length; i++) if (t >= nodes[i].next) retarget(nodes[i], NODES[i]);
        const n = Math.max(1, Math.ceil(simDt / (1 / 90)));
        const h = simDt / n;
        for (let i = 0; i < n; i++) step(h, energy);
      }

      const s = st.current;
      if (s.fade < 1) { s.fade = Math.min(1, s.fade + dt / 0.9); if (s.fade >= 1) s.prev = null; }

      render();

      const settled =
        ts === 0 && s.fade >= 1 &&
        Math.abs(energy - I) < 0.002 &&
        Math.abs(px - ptx) < 0.002 && Math.abs(py - pty) < 0.002;

      if (!settled && canRun()) raf = requestAnimationFrame(frame); // otherwise: loop sleeps at 0 cost
    };

    const halt = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
    const wake = () => {
      if (!canRun()) {
        const s = st.current;
        if (s.cur) { s.fade = 1; s.prev = null; render(); }
        return;
      }
      if (raf) return;
      last = performance.now(); gSum = gN = 0;
      raf = requestAnimationFrame(frame);
    };
    wakeRef.current = wake;

    applyLevel();
    applySize();
    render();

    const ro = new ResizeObserver(() => { applySize(); render(); wake(); });
    ro.observe(wrap);

    const io = new IntersectionObserver(([e]) => {
      visible = e?.isIntersecting ?? true;
      visible ? wake() : halt();
    }, { rootMargin: "120px" });
    io.observe(wrap);

    const onVis = () => (document.hidden ? halt() : wake());
    document.addEventListener("visibilitychange", onVis);

    const onReduce = (e: MediaQueryListEvent) => { reduce = e.matches; wake(); };
    mqReduce.addEventListener?.("change", onReduce);

    const onPointer = (e: PointerEvent) => {
      if (!interactiveRef.current || reduce || pausedRef.current) return;
      ptx = (e.clientX / window.innerWidth - 0.5) * 2;
      pty = (e.clientY / window.innerHeight - 0.5) * 2;
      wake();
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    // low-battery cap (Chromium only; silently ignored elsewhere)
    let bat: any = null, dead = false;
    const onBat = () => {
      const lp = !!bat && !bat.charging && bat.level <= 0.2;
      if (lp !== lowPower) { lowPower = lp; applyLevel(); applySize(); render(); }
    };
    (navigator as any).getBattery?.().then((b: any) => {
      if (dead) return;
      bat = b; onBat();
      b.addEventListener("chargingchange", onBat);
      b.addEventListener("levelchange", onBat);
    }).catch(() => {});

    wake();

    return () => {
      dead = true;
      halt();
      wakeRef.current = () => {};
      ro.disconnect(); io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      mqReduce.removeEventListener?.("change", onReduce);
      window.removeEventListener("pointermove", onPointer);
      if (bat) {
        bat.removeEventListener("chargingchange", onBat);
        bat.removeEventListener("levelchange", onBat);
      }
    };
  }, []);

  /* ── load + crossfade when the cover changes ── */
  useEffect(() => {
    let dead = false;
    const apply = (tile: Tile, instant = false) => {
      if (dead) return;
      const s = st.current;
      if (s.cur === tile) return;
      s.prev = instant ? null : s.cur;
      s.cur = tile;
      s.fade = instant ? 1 : 0;
      wakeRef.current();
    };
    const cached = tileCache.get(src);
    if (cached) apply(cached, !st.current.cur); // remount (reopen) → mesh is there on the first frame
    else {
      getTile(src).then((t) => apply(t)).catch(() => {
        if (src !== "/logo.png") getTile("/logo.png").then((t) => apply(t)).catch(() => {});
      });
    }
    return () => { dead = true; };
  }, [src]);

  /* ── wake the loop when live props change while it was asleep ── */
  useEffect(() => { wakeRef.current(); }, [paused, speed, intensity]);

  /* ── static noise layer (set client-side to avoid hydration mismatch) ── */
  useEffect(() => {
    if (!dither || !ditherRef.current) return;
    const u = getNoise();
    if (u) ditherRef.current.style.backgroundImage = `url(${u})`;
  }, [dither]);

  return (
    <div
      ref={wrapRef}
      aria-hidden
      className={cn("absolute inset-0 z-0 overflow-hidden pointer-events-none select-none bg-[#121214] h-full w-full min-h-[100dvh]", className)}
      style={{ contain: "layout paint style" }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ transform: "translateZ(0)" }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.3) 60%, rgba(18,18,20,0.65) 100%)" }}
      />
      {dither && (
        <div
          ref={ditherRef}
          className="absolute inset-0 pointer-events-none"
          style={{ opacity: 0.035, backgroundSize: "96px 96px" }}
        />
      )}
    </div>
  );
});
