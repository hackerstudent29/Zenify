import { useState, useEffect } from 'react';
import { getMediaUrl, getApiBaseUrl } from '@/lib/utils';
import * as ColorThiefModule from 'colorthief';
const ColorThief = (ColorThiefModule as any).default ?? (ColorThiefModule as any);

/**
 * Convert RGB to HSL. Returns h in [0,1], s in [0,1], l in [0,1].
 */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    const rf = r / 255, gf = g / 255, bf = b / 255;
    const max = Math.max(rf, gf, bf);
    const min = Math.min(rf, gf, bf);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case rf: h = (gf - bf) / d + (gf < bf ? 6 : 0); break;
            case gf: h = (bf - rf) / d + 2; break;
            case bf: h = (rf - gf) / d + 4; break;
        }
        h /= 6;
    }

    return [h, s, l];
}

/**
 * Convert HSL back to an rgb() string.
 */
function hslToRgbString(h: number, s: number, l: number): string {
    const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const nr = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
    const ng = Math.round(hue2rgb(p, q, h) * 255);
    const nb = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);

    return `rgb(${nr},${ng},${nb})`;
}

/**
 * Boost a color so it's visible against a dark background.
 * Preserves the original hue but guarantees minimum saturation and lightness.
 * For grayscale/desaturated colors, it preserves desaturation to prevent artificial vibrancy.
 */
function boostColor(r: number, g: number, b: number, customHsl?: [number, number, number]): string {
    const [h, s, l] = customHsl || rgbToHsl(r, g, b);
    if (s < 0.15) {
        // Keep it desaturated / dark slate/gray, but map to an acceptable lightness range (e.g. 15% - 40% for dark bg contrast)
        const newL = Math.min(0.35, Math.max(l, 0.15));
        return hslToRgbString(h, s, newL);
    }
    const newS = Math.max(s, 0.45); // Min 45% saturation
    const newL = Math.min(0.70, Math.max(l, 0.35)); // Lightness between 35% and 70%
    return hslToRgbString(h, newS, newL);
}

export function useAlbumColor(coverUrl: string | undefined, dbPalette?: Array<{r: number; g: number; b: number}>) {
    const [colors, setColors] = useState<string[]>([
        'rgb(15, 15, 20)',
        'rgb(25, 20, 30)',
        'rgb(10, 15, 25)',
        'rgb(20, 25, 30)',
    ]);

    useEffect(() => {
        if (dbPalette && Array.isArray(dbPalette) && dbPalette.length >= 4) {
            const finalColors = dbPalette.map(c => boostColor(c.r, c.g, c.b));
            setColors(finalColors.slice(0, 4));
            return;
        }

        if (!coverUrl) return;

        const img = new Image();
        img.crossOrigin = 'Anonymous';

        // Ensure we have a working URL
        let targetUrl = coverUrl;
        if (!targetUrl.startsWith('http') && !targetUrl.startsWith('blob') && !targetUrl.startsWith('data')) {
            targetUrl = getMediaUrl(coverUrl) || targetUrl;
        }

        // Proxy external images to prevent canvas CORS tarnish
        if (targetUrl.startsWith('http')) {
            if (!targetUrl.includes('proxy-image')) {
                if (!targetUrl.includes('unsplash.com') && !targetUrl.includes('ui-avatars.com') && !targetUrl.includes('res.cloudinary.com')) {
                    const API_BASE = getApiBaseUrl();
                    targetUrl = `${API_BASE}/utils/proxy-image?url=${encodeURIComponent(targetUrl)}`;
                }
            }
        }

        // Append cache-buster ONLY to force a fresh browser fetch (prevents Safari CORS cache bug)
        // The cache buster is stripped before being used as a storage key
        const fetchUrl = targetUrl.startsWith('http')
            ? targetUrl + (targetUrl.includes('?') ? '&' : '?') + `_corsBust=${Date.now()}`
            : targetUrl;

        img.onload = () => {
            try {
                const colorThief = new ColorThief();
                let palette: [number, number, number][] = [];
                try {
                    palette = colorThief.getPalette(img, 4) || [];
                } catch (e) {
                    palette = [];
                }

                if (palette.length === 0) {
                    const dominant = colorThief.getColor(img);
                    if (dominant) palette.push(dominant);
                }

                if (palette.length === 0) {
                    palette.push([20, 20, 20], [40, 40, 40], [30, 35, 40], [15, 15, 15]);
                }

                const finalColors = palette.map(c => boostColor(c[0], c[1], c[2]));
                
                // Ensure we always have 4 colors
                while (finalColors.length < 4) {
                    finalColors.push(finalColors[finalColors.length - 1]);
                }
                
                setColors(finalColors.slice(0, 4));
            } catch (err) {
                console.error("Color extraction failed:", err);
            }
        };

        img.onerror = () => {
            if (img.crossOrigin === 'Anonymous') {
                console.warn("CORS extraction failed, retrying without anonymous for cached image...");
                img.removeAttribute('crossOrigin');
                img.src = targetUrl;
            }
        };

        img.src = fetchUrl;
    }, [coverUrl, dbPalette]);

    return colors;
}
