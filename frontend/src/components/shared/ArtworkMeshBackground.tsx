"use client";
import React, { useEffect, useRef } from "react";
import { cn, getMediaUrl } from "@/lib/utils";

export type ArtworkMeshBackgroundProps = {
  coverUrl?: string | null;
  covers?: string[];
  paused?: boolean;
  speed?: number;
  className?: string;
};

type Tile = { canvas: HTMLCanvasElement; avg: string };

// fx/fy = drift speed (rad/s), ax/ay = drift amplitude, rot = rotation speed
const LAYERS = [
  { fx: 0.11, fy: 0.09, ax: 0.22, ay: 0.18, rot: 0.045, scale: 1.9, alpha: 1.0, p: 0 },
  { fx: 0.08, fy: 0.13, ax: 0.28, ay: 0.22, rot: -0.06, scale: 2.1, alpha: 0.75, p: 2.1 },
  { fx: 0.14, fy: 0.07, ax: 0.2, ay: 0.3, rot: 0.035, scale: 1.7, alpha: 0.6, p: 4.2 },
];

async function loadTile(src: string): Promise<Tile> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.decoding = "async";
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const x = c.getContext("2d")!;
  x.imageSmoothingQuality = "high";
  if ("filter" in x) (x as any).filter = "blur(3px)"; // cheap at 64px; Safari ignores it
  x.drawImage(img, 0, 0, size, size);
  let avg = "#121214";
  try {
    const d = x.getImageData(0, 0, size, size).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    avg = `rgb(${(r / n * 0.55) | 0},${(g / n * 0.55) | 0},${(b / n * 0.55) | 0})`;
  } catch {}
  return { canvas: c, avg };
}

export const ArtworkMeshBackground = React.memo(function ArtworkMeshBackground({
  coverUrl, covers, paused = false, speed = 1, className,
}: ArtworkMeshBackgroundProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const st = useRef<{ cur: Tile | null; prev: Tile | null; fade: number }>({ cur: null, prev: null, fade: 1 });

  const rawSrc = coverUrl || covers?.[0] || "";
  const src = getMediaUrl(rawSrc) || "/logo.png";

  // load + crossfade on cover change
  useEffect(() => {
    let dead = false;
    loadTile(src).then((tile) => {
      if (dead) return;
      const s = st.current;
      s.prev = s.cur; s.cur = tile; s.fade = s.prev ? 0 : 1;
    }).catch(() => {});
    return () => { dead = true; };
  }, [src]);

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
    const frameMs = 1000 / (reduce ? 10 : mobile ? 24 : 30);
    const spd = reduce ? 0 : speed;
    let raf = 0, last = performance.now(), t = 0, visible = true;

    const resize = () => {
      if (!wrap || !canvas) return;
      const w = wrap.clientWidth || 1, h = wrap.clientHeight || 1;
      const k = Math.max(w, h) / (mobile ? 160 : 220);
      canvas.width = Math.max(16, Math.round(w / k));
      canvas.height = Math.max(16, Math.round(h / k));
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(wrap);

    const scene = (tile: Tile, a: number) => {
      const W = canvas.width, H = canvas.height, m = Math.max(W, H);
      for (const l of LAYERS) {
        ctx.save();
        ctx.globalAlpha = a * l.alpha;
        ctx.translate(W / 2 + Math.sin(t * l.fx + l.p) * W * l.ax, H / 2 + Math.cos(t * l.fy + l.p) * H * l.ay);
        ctx.rotate(t * l.rot + l.p);
        const s = m * l.scale;
        ctx.drawImage(tile.canvas, -s / 2, -s / 2, s, s);
        ctx.restore();
      }
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < frameMs) return;
      const dt = (now - last) / 1000; last = now;
      t += dt * spd;
      const s = st.current;
      ctx.globalAlpha = 1;
      ctx.fillStyle = s.cur?.avg ?? "#121214";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (s.prev && s.fade < 1) scene(s.prev, 1);
      if (s.cur) scene(s.cur, s.fade);
      if (s.fade < 1) { s.fade = Math.min(1, s.fade + dt / 1.2); if (s.fade >= 1) s.prev = null; }
    };

    const sync = () => {
      const go = visible && !document.hidden && !pausedRef.current;
      if (go && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
      if (!go && raf) { cancelAnimationFrame(raf); raf = 0; }
    };
    const io = new IntersectionObserver(([e]) => { visible = e?.isIntersecting ?? true; sync(); });
    io.observe(wrap);
    document.addEventListener("visibilitychange", sync);
    const poll = setInterval(sync, 500); // picks up `paused` prop changes

    sync();
    return () => {
      cancelAnimationFrame(raf); clearInterval(poll);
      ro.disconnect(); io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [speed]);

  return (
    <div
      ref={wrapRef}
      aria-hidden
      className={cn("absolute inset-0 z-0 overflow-hidden pointer-events-none select-none bg-[#121214] h-full w-full min-h-[100dvh]", className)}
      style={{ contain: "layout paint style" }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ filter: "saturate(1.5) brightness(0.92)" }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.12), rgba(0,0,0,0.38))" }}
      />
    </div>
  );
});
