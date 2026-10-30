import { getMediaUrl, getApiBaseUrl } from "@/lib/utils";

/**
 * Glass alpha lives in CSS (--glass-alpha in globals.css), so one value controls
 * the translucency of the sidebar, lyrics, queue and right panels everywhere.
 * 0.34 is only the fallback if the CSS variable is missing.
 */
const GLASS_ALPHA = "var(--glass-alpha, 0.34)";
const NEUTRAL_SIDE = `rgba(28, 28, 30, ${GLASS_ALPHA})`;
const NEUTRAL_PAGE = "#1c1c1e";

/**
 * Apple Music artwork-driven theme calculation and dynamic CSS variable setter.
 * Converts average or dominant RGB artwork colors into rich, dark ambient Apple Music tokens.
 */
export function themeVars(r: number, g: number, b: number) {
  const [R, G, B] = [r, g, b].map((v) => v / 255);
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;

  let h = 0;
  if (d) {
    h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  }
  h = Math.round(((h * 60) + 360) % 360);
  const l = (max + min) / 2;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;

  const isMonochrome = s < 0.08;
  const satNum = isMonochrome ? 0 : Math.round(Math.min(Math.max(s, 0.32), 0.75) * 100);
  const satStr = `${satNum}%`;

  const page = isMonochrome ? NEUTRAL_PAGE : `hsl(${h} ${satStr} 16%)`;
  const side = isMonochrome ? NEUTRAL_SIDE : `hsl(${h} ${satStr} 13.5% / ${GLASS_ALPHA})`;
  const text2 = `hsl(${h} 25% 80%)`;
  const pill = `rgba(255, 255, 255, 0.08)`;
  const line = `rgba(255, 255, 255, 0.12)`;

  return { h, s: satStr, rgb: `${r}, ${g}, ${b}`, page, side, pill, line, text2 };
}

/* ─── Shared state ─── */
let lastAppliedRgb: [number, number, number] | null = null;
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
// Increments every time resetArtworkTheme is called. The debounced flush
// checks this value and bails if it changed since it was scheduled —
// preventing a late-firing apply from overwriting a fresh reset.
let _resetEpoch = 0;

function isColoredBgEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("zenify_colored_background") === "true";
  } catch {
    return false;
  }
}

function _flushTheme(r: number, g: number, b: number) {
  if (typeof document === "undefined") return;
  const vars = themeVars(r, g, b);
  const root = document.documentElement;

  root.style.setProperty("--h", String(vars.h));
  root.style.setProperty("--s", vars.s);
  root.style.setProperty("--album-rgb", vars.rgb);
  root.style.setProperty("--pill", vars.pill);
  root.style.setProperty("--line", vars.line);
  root.style.setProperty("--text-2", vars.text2);

  if (isColoredBgEnabled()) {
    root.style.setProperty("--page", vars.page);
    root.style.setProperty("--side", vars.side);
  } else {
    root.style.setProperty("--page", NEUTRAL_PAGE);
    root.style.setProperty("--side", NEUTRAL_SIDE);
  }
}

export function applyArtworkTheme(r: number, g: number, b: number) {
  if (typeof document === "undefined") return;
  lastAppliedRgb = [r, g, b];
  // Capture the epoch at scheduling time. If resetArtworkTheme fires before
  // the 16ms timer, the epoch increments and the flush aborts.
  const epochAtSchedule = _resetEpoch;
  if (_debounceTimer !== null) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    if (_resetEpoch !== epochAtSchedule) return; // reset fired after us — abort
    if (lastAppliedRgb) _flushTheme(lastAppliedRgb[0], lastAppliedRgb[1], lastAppliedRgb[2]);
  }, 16);
}

export function resetArtworkTheme() {
  if (typeof document === "undefined") return;
  _resetEpoch++; // invalidate any pending debounced apply
  if (_debounceTimer !== null) { clearTimeout(_debounceTimer); _debounceTimer = null; }
  lastAppliedRgb = null;
  const root = document.documentElement;
  root.style.setProperty("--h", "240");
  root.style.setProperty("--s", "5%");
  root.style.setProperty("--album-rgb", "28, 28, 30");
  root.style.setProperty("--page", NEUTRAL_PAGE);
  root.style.setProperty("--side", NEUTRAL_SIDE);
  root.style.setProperty("--pill", "rgba(255, 255, 255, 0.08)");
  root.style.setProperty("--line", "rgba(255, 255, 255, 0.13)");
  root.style.setProperty("--text-2", "rgba(255, 255, 255, 0.7)");
}

/** Call this when the user toggles the "Colored background" setting so the page
 *  updates immediately without requiring a navigate-away-and-back. */
export function reapplyArtworkTheme() {
  if (lastAppliedRgb) {
    // Force-flush immediately (bypass debounce) so the toggle feels instant.
    if (_debounceTimer !== null) { clearTimeout(_debounceTimer); _debounceTimer = null; }
    _flushTheme(lastAppliedRgb[0], lastAppliedRgb[1], lastAppliedRgb[2]);
  } else {
    resetArtworkTheme();
  }
}

/* ─── Listen for storage changes so toggling in the Settings panel updates the
       current page in real time (works across tabs too). ─── */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === "zenify_colored_background") {
      reapplyArtworkTheme();
    }
  });
}

/* ─── Color cache ─── */
const dominantColorCache = new Map<string, [number, number, number]>();

function getCachedDominantColor(src: string): [number, number, number] | null {
  if (dominantColorCache.has(src)) return dominantColorCache.get(src)!;
  if (typeof window !== "undefined") {
    try {
      const stored = sessionStorage.getItem(`zenify_dom_${src}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length === 3) {
          dominantColorCache.set(src, parsed as [number, number, number]);
          return parsed as [number, number, number];
        }
      }
    } catch {}
  }
  return null;
}

function setCachedDominantColor(src: string, color: [number, number, number]) {
  dominantColorCache.set(src, color);
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(`zenify_dom_${src}`, JSON.stringify(color));
    } catch {}
  }
}

/**
 * Extracts dominant vibrant color from an image URL by rendering onto a 32×32 offscreen canvas.
 * Returns a cached result immediately if available (no async wait).
 */
export async function extractArtworkDominantColor(src: string): Promise<[number, number, number] | null> {
  if (!src || typeof window === "undefined") return null;

  const cached = getCachedDominantColor(src);
  if (cached) return cached;

  let targetUrl = src;
  if (!targetUrl.startsWith("http") && !targetUrl.startsWith("blob") && !targetUrl.startsWith("data")) {
    targetUrl = getMediaUrl(src) || targetUrl;
  }

  let imgSrc = targetUrl;
  if (imgSrc.startsWith("http") && !imgSrc.includes("proxy-image")) {
    try {
      const API_BASE = getApiBaseUrl();
      imgSrc = `${API_BASE}/utils/proxy-image?url=${encodeURIComponent(imgSrc)}`;
    } catch {}
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";

    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        const buckets = new Map<string, { sum: [number, number, number]; count: number; satSum: number }>();
        const fallbackSum: [number, number, number] = [0, 0, 0];
        let fallbackCount = 0;

        for (let i = 0; i < data.length; i += 16) {
          const a = data[i + 3];
          if (a < 128) continue;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          fallbackSum[0] += r; fallbackSum[1] += g; fallbackSum[2] += b;
          fallbackCount++;
          const brightness = (r + g + b) / 3;
          if (brightness > 235 || brightness < 20) continue;
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
          if (sat < 0.15) continue;
          const bs = 36;
          const key = `${Math.floor(r / bs)},${Math.floor(g / bs)},${Math.floor(b / bs)}`;
          const ex = buckets.get(key);
          if (ex) { ex.sum[0] += r; ex.sum[1] += g; ex.sum[2] += b; ex.satSum += sat; ex.count++; }
          else buckets.set(key, { sum: [r, g, b], count: 1, satSum: sat });
        }

        if (buckets.size > 0) {
          const sorted = Array.from(buckets.values()).sort((a, b) => {
            return b.count * (1 + b.satSum / b.count) - a.count * (1 + a.satSum / a.count);
          });
          const best = sorted[0];
          const result: [number, number, number] = [
            Math.round(best.sum[0] / best.count),
            Math.round(best.sum[1] / best.count),
            Math.round(best.sum[2] / best.count),
          ];
          setCachedDominantColor(src, result);
          return resolve(result);
        }

        if (fallbackCount > 0) {
          const result: [number, number, number] = [
            Math.round(fallbackSum[0] / fallbackCount),
            Math.round(fallbackSum[1] / fallbackCount),
            Math.round(fallbackSum[2] / fallbackCount),
          ];
          setCachedDominantColor(src, result);
          return resolve(result);
        }

        resolve(null);
      } catch { resolve(null); }
    };

    img.onerror = () => resolve(null);
    img.src = imgSrc;
  });
}

/** Backward-compatible alias */
export const extractArtworkAverageColor = extractArtworkDominantColor;
