/**
 * High-precision pallet extraction with Vibrancy Boosting.
 * Uses HSL mapping to ensure that even monochromatic artwork produces
 * a rich, atmospheric fluid mesh.
 */
export async function extractPaletteFromImage(imageUrl: string): Promise<string[]> {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = imageUrl;

        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(['#1a1a1a', '#2d3436', '#000000', '#444444']);

            canvas.width = 100;
            canvas.height = 100;
            ctx.drawImage(img, 0, 0, 100, 100);

            const data = ctx.getImageData(0, 0, 100, 100).data;
            const samples: { r: number, g: number, b: number, l: number, s: number }[] = [];

            for (let i = 0; i < data.length; i += 16) {
                const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
                if (a < 180) continue;

                // RGB to simple lightness and saturation
                const max = Math.max(r, g, b), min = Math.min(r, g, b);
                const l = (max + min) / 2;
                const s = max === min ? 0 : (l > 127 ? (max - min) / (510 - max - min) : (max - min) / (max + min));
                
                samples.push({ r, g, b, l, s });
            }

            if (samples.length < 4) return resolve(['#1a1a1a', '#2d3436', '#000000', '#444444']);

            const toHex = (c: any) => {
                // INTERNAL COLOR BOOST: Increase saturation and brightness slightly
                // to make the fluid mesh pop against the black player shell.
                const factor = 1.35; 
                let r = Math.min(255, Math.floor(c.r * factor));
                let g = Math.min(255, Math.floor(c.g * factor));
                let b = Math.min(255, Math.floor(c.b * factor));
                
                return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
            };

            const sortedS = [...samples].sort((a, b) => b.s - a.s);
            const sortedL = [...samples].sort((a, b) => b.l - a.l);

            // Pick 4 distinct types of colors for the mesh
            resolve([
                toHex(sortedS[0]), // 1. Most Vibrant
                toHex(sortedL[Math.floor(sortedL.length * 0.1)]), // 2. Brightest Mid
                toHex(samples[Math.floor(samples.length * 0.4)]),  // 3. Random Natural Sample
                toHex(sortedS[Math.floor(sortedS.length * 0.05)]), // 4. Secondary Vibrant
            ]);
        };

        img.onerror = () => {
            resolve(['#1a1a1a', '#2d3436', '#000000', '#444444']);
        };
    });
}
