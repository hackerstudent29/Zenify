import { getMediaUrl, getApiBaseUrl } from "@/lib/utils";

/**
 * Apple Music artwork-driven theme calculation and dynamic CSS variable setter.
 * Converts average or dominant RGB artwork colors into rich, dark ambient Apple Music tokens:
 *  - --h and --s: hue and saturation
 *  - --page: deep dark ambient background (12.5% to 13.5% lightness, rich 38% to 62% saturation)
 *  - --side: matching darker sidebar tint (9.5% to 10.5% lightness, harmonized saturation)
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

  // Apple Music tuning: Ensure color is prominent, deep, and luxurious — rich and clearly visible
  // Page saturation: clamp between 42% and 68%
  const pageSatNum = Math.max(42, Math.min(Math.round(s * 100), 68));
  const pageSat = `${pageSatNum}%`;
  // Sidebar saturation: rich, high color matching Apple Music sidebar tint
  const sideSatNum = Math.max(45, Math.min(Math.round(pageSatNum * 0.95), 70));
  const sideSat = `${sideSatNum}%`;

  // Apple Music dark mode page lightness: 13.5%
  const pageLightness = "13.5%";
  // Sidebar lightness: 16.5% so the color is clearly, beautifully visible with high saturation
  const sideLightness = "16.5%";

  return {
    h,
    s: pageSat,
    rgb: `${r}, ${g}, ${b}`,
    page: `hsl(${h} ${pageSat} ${pageLightness})`,
    side: `hsl(${h} ${sideSat} ${sideLightness})`,
    text2: `hsl(${h} 25% 80%)`,
  };
}

export function applyArtworkTheme(r: number, g: number, b: number) {
  if (typeof document === "undefined") return;
  const vars = themeVars(r, g, b);
  const root = document.documentElement;
  root.style.setProperty("--h", String(vars.h));
  root.style.setProperty("--s", vars.s);
  root.style.setProperty("--album-rgb", vars.rgb);
  root.style.setProperty("--page", vars.page);
  root.style.setProperty("--side", vars.side);
  root.style.setProperty("--text-2", vars.text2);
}

export function resetArtworkTheme() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--h", "240");
  root.style.setProperty("--s", "5%");
  root.style.setProperty("--album-rgb", "18, 18, 20");
  root.style.setProperty("--page", "#121214");
  root.style.setProperty("--side", "#1c1c1e");
  root.style.setProperty("--text-2", "rgba(255, 255, 255, 0.7)");
}

const dominantColorCache = new Map<string, [number, number, number]>();

/**
 * Extracts dominant vibrant color from an image URL by rendering onto a 64x64 offscreen canvas.
 * Filters out pitch black, extreme whites, and neutral greys to ensure the true colorful tone is selected.
 */
export async function extractArtworkDominantColor(src: string): Promise<[number, number, number] | null> {
  if (!src || typeof window === "undefined") return null;

  if (dominantColorCache.has(src)) {
    return dominantColorCache.get(src)!;
  }

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
        const size = 64;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
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
          dominantColorCache.set(src, result);
          return resolve(result);
        }

        if (fallbackCount > 0) {
          const result: [number, number, number] = [
            Math.round(fallbackSum[0] / fallbackCount),
            Math.round(fallbackSum[1] / fallbackCount),
            Math.round(fallbackSum[2] / fallbackCount),
          ];
          dominantColorCache.set(src, result);
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

