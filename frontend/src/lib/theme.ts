/**
 * Apple Music artwork-driven theme calculation and dynamic CSS variable setter.
 * Converts average or dominant RGB artwork colors into hue (--h) and saturation (--s).
 * Lightness is automatically anchored between 13% and 18% so white text remains perfectly legible.
 */
export function themeVars(r: number, g: number, b: number) {
  const [R, G, B] = [r, g, b].map(v => v / 255);
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  let h = 0;
  if (d) h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h = Math.round(((h * 60) + 360) % 360);
  const l = (max + min) / 2, s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return { h, s: Math.round(Math.min(s, 0.55) * 100) + "%" };
}

export function applyArtworkTheme(r: number, g: number, b: number) {
  if (typeof document === "undefined") return;
  const { h, s } = themeVars(r, g, b);
  document.documentElement.style.setProperty("--h", String(h));
  document.documentElement.style.setProperty("--s", s);
}

export function resetArtworkTheme() {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--h", "240");
  document.documentElement.style.setProperty("--s", "5%");
}

/**
 * Extracts average color from an image URL by rendering onto a 64x64 offscreen canvas.
 */
export async function extractArtworkAverageColor(src: string): Promise<[number, number, number] | null> {
  if (!src || typeof window === "undefined") return null;
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
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 16) {
          if (data[i + 3] < 128) continue;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          n++;
        }
        if (n === 0) return resolve(null);
        resolve([Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
