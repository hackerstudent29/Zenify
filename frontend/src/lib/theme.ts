import { getMediaUrl, getApiBaseUrl } from "@/lib/utils";

/**
 * Glass alpha lives in CSS (--glass-alpha in globals.css), so one value controls
 * the translucency of the sidebar, lyrics, queue and right panels everywhere.
 * 0.34 is only the fallback if the CSS variable is missing.
 */
const GLASS_ALPHA = "var(--glass-alpha, 0.34)";
const NEUTRAL_SIDE = `rgba(28, 28, 30, ${GLASS_ALPHA})`;

/**
 * Apple Music artwork-driven theme calculation and dynamic CSS variable setter.
 * Converts average or dominant RGB artwork colors into rich, dark ambient Apple Music tokens:
 *  - --h and --s: hue and saturation
 *  - --page: deep dark ambient background (16% lightness, rich 32% to 75% saturation)
 *  - --side: matching darker panel tint (13.5% lightness) with glass translucency
 *            driven by --glass-alpha, so the background shows through the blur
 *  - --album-rgb: pure RGB string for radial glows and linear washes
 *  - --text-2: subtle tinted secondary text color
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

  // Apple Music exact measured values:
  // For grayscale/monochrome images (s < 0.08), preserve neutral dark background rather than forcing fake red hue
  const isMonochrome = s < 0.08;
  const satNum = isMonochrome ? 0 : Math.round(Math.min(Math.max(s, 0.32), 0.75) * 100);
  const satStr = `${satNum}%`;

  // Page: uniform static Apple Music background color (exact 16% lightness, or neutral #1c1c1e if monochrome)
  const page = isMonochrome ? "#1c1c1e" : `hsl(${h} ${satStr} 16%)`;

  // Sidebar, lyrics, queue & panels: tinted frosted glass.
  // Alpha comes from --glass-alpha (globals.css) so the blurred background stays visible.
  const side = isMonochrome ? NEUTRAL_SIDE : `hsl(${h} ${satStr} 13.5% / ${GLASS_ALPHA})`;

  const text2 = `hsl(${h} 25% 80%)`;
  const pill = `rgba(255, 255, 255, 0.08)`;
  const line = `rgba(255, 255, 255, 0.12)`;

  return {
    h,
    s: satStr,
    rgb: `${r}, ${g}, ${b}`,
    page,
    side,
    pill,
    line,
    text2,
  };
}

let lastAppliedRgb: [number, number, number] | null = null;

export function applyArtworkTheme(r: number, g: number, b: number) {
  if (typeof document === "undefined") return;
  lastAppliedRgb = [r, g, b];
  const vars = themeVars(r, g, b);
  const root = document.documentElement;
  root.style.setProperty("--h", String(vars.h));
  root.style.setProperty("--s", vars.s);
  root.style.setProperty("--album-rgb", vars.rgb);

  let isColoredEnabled = false;
  try {
    const saved = localStorage.getItem("zenify_colored_background");
    isColoredEnabled = saved === "true";
  } catch {}

  if (isColoredEnabled) {
    root.style.setProperty("--page", vars.page);
    root.style.setProperty("--side", vars.side);
  } else {
    root.style.setProperty("--page", "#1c1c1e");
    root.style.setProperty("--side", NEUTRAL_SIDE);
  }
  root.style.setProperty("--pill", vars.pill);
  root.style.setProperty("--line", vars.line);
  root.style.setProperty("--text-2", vars.text2);
}

export function resetArtworkTheme() {
  if (typeof document === "undefined") return;
  lastAppliedRgb = null;
  const root = document.documentElement;
  root.style.setProperty("--h", "240");
  root.style.setProperty("--s", "5%");
  root.style.setProperty("--album-rgb", "28, 28, 30");
  root.style.setProperty("--page", "#1c1c1e");
  root.style.setProperty("--side", NEUTRAL_SIDE);
  root.style.setProperty("--pill", "rgba(255, 255, 255, 0.08)");
  root.style.setProperty("--line", "rgba(255, 255, 255, 0.13)");
  root.style.setProperty("--text-2", "rgba(255, 255, 255, 0.7)");
}

export function reapplyArtworkTheme() {
  if (lastAppliedRgb) {
    applyArtworkTheme(lastAppliedRgb[0], lastAppliedRgb[1], lastAppliedRgb[2]);
  } else {
    resetArtworkTheme();
  }
}

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
 * Extracts dominant vibrant color from an image URL by rendering onto a 32x32 offscreen canvas.
 * Filters out pitch black, extreme whites, and neutral greys to ensure the true colorful tone is selected.
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
    } catch {
      // fallback to direct targetUrl
    }
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";

    img.onload = () => {
      try {
        const size = 32; // 32x32 is fast and ideal for dominant palette sampling
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        // Bucket dominant color collection filtering out near-black, near-white, and grays
        const buckets = new Map<string, { sum: [number, number, number]; count: number; satSum: number }>();
        const fallbackSum: [number, number, number] = [0, 0, 0];
        let fallbackCount = 0;

        for (let i = 0; i < data.length; i += 16) {
          const a = data[i + 3];
          if (a < 128) continue;

          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          fallbackSum[0] += r;
          fallbackSum[1] += g;
          fallbackSum[2] += b;
          fallbackCount++;

          const brightness = (r + g + b) / 3;
          if (brightness > 235 || brightness < 20) continue;

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
          if (sat < 0.15) continue; // skip pure greys

          const bucketSize = 36;
          const key = `${Math.floor(r / bucketSize)},${Math.floor(g / bucketSize)},${Math.floor(b / bucketSize)}`;
          const existing = buckets.get(key);
          if (existing) {
            existing.sum[0] += r;
            existing.sum[1] += g;
            existing.sum[2] += b;
            existing.satSum += sat;
            existing.count++;
          } else {
            buckets.set(key, { sum: [r, g, b], count: 1, satSum: sat });
          }
        }

        if (buckets.size > 0) {
          // Sort buckets by score = count * (1 + sat) to favor vibrant colors over dark background pixels
          const sorted = Array.from(buckets.values()).sort((a, b) => {
            const scoreA = a.count * (1 + a.satSum / a.count);
            const scoreB = b.count * (1 + b.satSum / b.count);
            return scoreB - scoreA;
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
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);
    img.src = imgSrc;
  });
}

/**
 * Backward-compatible alias for extractArtworkDominantColor
 */
export const extractArtworkAverageColor = extractArtworkDominantColor;