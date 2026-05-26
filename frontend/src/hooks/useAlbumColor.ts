import { useState, useEffect } from 'react';
import { getMediaUrl, getApiBaseUrl } from '@/lib/utils';

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
        if (!coverUrl) return;

        const img = new Image();
        img.crossOrigin = 'Anonymous';
        
        // Ensure we have a working URL
        let targetUrl = coverUrl;
        if (!targetUrl.startsWith('http') && !targetUrl.startsWith('blob') && !targetUrl.startsWith('data')) {
            targetUrl = getMediaUrl(coverUrl) || targetUrl;
        }

        // Proxy external images to prevent canvas CORS tarnish
        if (targetUrl.startsWith('http') && !targetUrl.includes('proxy-image')) {
            if (!targetUrl.includes('unsplash.com') && !targetUrl.includes('ui-avatars.com') && !targetUrl.includes('res.cloudinary.com')) {
                const API_BASE = getApiBaseUrl();
                targetUrl = `${API_BASE}/utils/proxy-image?url=${encodeURIComponent(targetUrl)}`;
            }
        }

        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) return;

                const size = 64;
                canvas.width = size;
                canvas.height = size;
                ctx.drawImage(img, 0, 0, size, size);

                const data = ctx.getImageData(0, 0, size, size).data;
                const palette: { r: number, g: number, b: number, s: number }[] = [];
                
                // Sample 9 points in the inner 60% of the image to avoid dark vignettes/borders
                // Points at 25%, 50%, 75% for both X and Y
                for (let y of [0.25, 0.5, 0.75]) {
                    for (let x of [0.25, 0.5, 0.75]) {
                        const px = Math.floor(x * size);
                        const py = Math.floor(y * size);
                        const offset = (py * size + px) * 4;
                        const r = data[offset], g = data[offset+1], b = data[offset+2];
                        
                        // Calculate basic saturation
                        const max = Math.max(r, g, b), min = Math.min(r, g, b);
                        const s = max === 0 ? 0 : (max - min) / max;
                        
                        palette.push({ r, g, b, s });
                    }
                }

                // Sort by saturation to prioritize vibrant colors over dark/muddy edges
                palette.sort((a, b) => b.s - a.s);

                const finalColors = palette.slice(0, 4).map(c => boostColor(c.r, c.g, c.b));
                setColors(finalColors);
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

        img.src = targetUrl;
    }, [coverUrl]);

    return colors;
}
