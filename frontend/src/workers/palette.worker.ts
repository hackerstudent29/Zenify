interface Pixel {
    r: number;
    g: number;
    b: number;
}

class ColorBox {
    pixels: Pixel[];
    constructor(pixels: Pixel[]) {
        this.pixels = pixels;
    }
    get volume(): number {
        const bounds = this.getBounds();
        return (bounds.maxR - bounds.minR) * (bounds.maxG - bounds.minG) * (bounds.maxB - bounds.minB);
    }
    getBounds() {
        let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
        for (const p of this.pixels) {
            if (p.r < minR) minR = p.r;
            if (p.r > maxR) maxR = p.r;
            if (p.g < minG) minG = p.g;
            if (p.g > maxG) maxG = p.g;
            if (p.b < minB) minB = p.b;
            if (p.b > maxB) maxB = p.b;
        }
        return { minR, maxR, minG, maxG, minB, maxB };
    }
    get longestAxis(): 'r' | 'g' | 'b' {
        const bounds = this.getBounds();
        const rRange = bounds.maxR - bounds.minR;
        const gRange = bounds.maxG - bounds.minG;
        const bRange = bounds.maxB - bounds.minB;
        if (rRange >= gRange && rRange >= bRange) return 'r';
        if (gRange >= rRange && gRange >= bRange) return 'g';
        return 'b';
    }
    split(): [ColorBox, ColorBox] {
        if (this.pixels.length === 0) return [this, this];
        const axis = this.longestAxis;
        this.pixels.sort((a, b) => a[axis] - b[axis]);
        const medianIdx = Math.floor(this.pixels.length / 2);
        return [
            new ColorBox(this.pixels.slice(0, medianIdx)),
            new ColorBox(this.pixels.slice(medianIdx))
        ];
    }
    getAverage(): Pixel {
        if (this.pixels.length === 0) return { r: 0, g: 0, b: 0 };
        let sumR = 0, sumG = 0, sumB = 0;
        for (const p of this.pixels) {
            sumR += p.r;
            sumG += p.g;
            sumB += p.b;
        }
        const len = this.pixels.length;
        return {
            r: Math.round(sumR / len),
            g: Math.round(sumG / len),
            b: Math.round(sumB / len)
        };
    }
}

function quantize(pixels: Pixel[], targetColors: number): Pixel[] {
    if (pixels.length === 0) return [];
    let boxes = [new ColorBox(pixels)];
    while (boxes.length < targetColors) {
        boxes.sort((a, b) => b.volume - a.volume);
        const target = boxes.shift();
        if (!target || target.pixels.length < 2) {
            if (target) boxes.push(target);
            break;
        }
        const [box1, box2] = target.split();
        boxes.push(box1, box2);
    }
    return boxes.map(b => b.getAverage());
}

self.onmessage = async (e: MessageEvent) => {
    const { url, id } = e.data;
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        const bitmap = await createImageBitmap(blob);
        
        // Use a small canvas to speed up processing
        const size = 64;
        const canvas = new OffscreenCanvas(size, size);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No 2d context');
        
        ctx.drawImage(bitmap, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;
        
        const pixels: Pixel[] = [];
        for (let i = 0; i < data.length; i += 16) { // Sample every 4th pixel for speed
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            const a = data[i+3];
            if (a >= 125) { // Skip transparent
                pixels.push({ r, g, b });
            }
        }
        
        const palettePixels = quantize(pixels, 4);
        const hexPalette = palettePixels.map(c => {
            return `#${((1 << 24) + (c.r << 16) + (c.g << 8) + c.b).toString(16).slice(1).toUpperCase()}`;
        });
        
        self.postMessage({ id, palette: hexPalette });
    } catch (err) {
        self.postMessage({ id, error: String(err) });
    }
};
