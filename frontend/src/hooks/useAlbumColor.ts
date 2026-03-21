import { useState, useEffect } from 'react';
import { getMediaUrl } from '@/lib/utils';

/** Boost saturation/brightness of an extracted RGB so it pops on dark bg */
function boostColor(r: number, g: number, b: number): string {
    // Convert to 0-1
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

    // Boost: increase saturation to at least 70%, lightness to 45-65%
    const newS = Math.min(1, Math.max(s, 0.70));
    const newL = Math.min(0.65, Math.max(l, 0.40));

    // Convert HSL back to RGB
    const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
    };

    const q = newL < 0.5 ? newL * (1 + newS) : newL + newS - newL * newS;
    const p = 2 * newL - q;
    const nr = Math.round(hue2rgb(p, q, h + 1/3) * 255);
    const ng = Math.round(hue2rgb(p, q, h) * 255);
    const nb = Math.round(hue2rgb(p, q, h - 1/3) * 255);

    return `rgb(${nr},${ng},${nb})`;
}

export function useAlbumColor(coverUrl: string | undefined) {
    const [colors, setColors] = useState<string[]>([
        'rgba(220,60,80,0.9)',
        'rgba(140,40,60,0.8)',
        'rgba(60,10,30,0.9)'
    ]);

    useEffect(() => {
        if (!coverUrl || typeof window === 'undefined') return;

        const extractColors = async () => {
            try {
                const ColorThiefModule = await import('colorthief').then((m: any) => m.default || m);
                let colorThief;

                try {
                    colorThief = new ColorThiefModule();
                } catch (e) {
                    colorThief = ColorThiefModule;
                }

                if (!colorThief || !colorThief.getPalette) return;

                const img = new Image();
                img.crossOrigin = 'Anonymous';
                img.src = getMediaUrl(coverUrl) || '';

                img.onload = () => {
                    try {
                        const palette = colorThief.getPalette(img, 3);
                        if (palette && palette.length >= 3) {
                            const boosted = palette.map((color: number[]) =>
                                boostColor(color[0], color[1], color[2])
                            );
                            setColors(boosted);
                        }
                    } catch (e) {
                        // Ignore extraction errors
                    }
                };
            } catch (err) {
                // Ignore import errors
            }
        };

        extractColors();
    }, [coverUrl]);

    return colors;
}
