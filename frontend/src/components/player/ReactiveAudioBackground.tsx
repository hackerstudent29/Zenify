"use client";

import React, { useEffect, useRef } from 'react';
import { cn, getMediaUrl, getApiBaseUrl } from '@/lib/utils';
import { Track, usePlayerStore } from '@/store/player';
import { audioEngine } from '@/lib/audio-engine';

// ─── Types ────────────────────────────────────────────────────────────────────
interface RawColor { r: number; g: number; b: number; }

interface ReactiveAudioBackgroundProps {
    coverUrl?: string;
    className?: string;
    track?: Track | null;
    speedMultiplier?: number;
    variant?: 'fullview' | 'track' | 'hero';
}

// ─── Module-level animation singleton ────────────────────────────────────────
// Lives completely outside React — no useEffect, no useState, no deps.
// React re-renders, mounts, unmounts have ZERO effect on this loop.
interface CanvasSession {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    orbs: OrbState[];
    fftBuf: Uint8Array<ArrayBuffer> | null;
    audio: { bass: number; mids: number; treble: number };
    speedMult: number;
    W: number; H: number;
    variant: 'fullview' | 'track' | 'hero';
    isPlaying: boolean;
}

interface OrbState {
    x: number;      y: number;      // Current position
    vx: number;     vy: number;     // Current velocity
    baseSpeed: number;              // Target base speed
    r: number; g: number; b: number;
    tr: number; tg: number; tb: number;
    radius: number;
}

const BASE_CONFIGS = [
    { radius: 115 },
    { radius: 100 },
    { radius: 122 },
    { radius: 92  },
];

class FluidAnimationEngine {
    private sessions = new Map<string, CanvasSession>();
    private rafId = 0;
    private running = false;

    register(id: string, canvas: HTMLCanvasElement, colors: RawColor[], speedMult: number, variant: 'fullview' | 'track' | 'hero') {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const W = 512, H = 512;
        canvas.width = W; canvas.height = H;

        const orbs: OrbState[] = BASE_CONFIGS.map((b, i) => {
            const angle = Math.random() * Math.PI * 2;
            const speed = (0.3 + Math.random() * 0.2) * speedMult * 30; // Massively increased base speed
            return {
                x: W * 0.2 + Math.random() * W * 0.6,
                y: H * 0.2 + Math.random() * H * 0.6,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                baseSpeed: speed,
                r: colors[i]?.r ?? 30, g: colors[i]?.g ?? 10, b: colors[i]?.b ?? 50,
                tr: colors[i]?.r ?? 30, tg: colors[i]?.g ?? 10, tb: colors[i]?.b ?? 50,
                radius: b.radius * 2,
            };
        });

        // Pre-warm 80 frames so canvas starts filled (no black flash)
        for (let i = 0; i < 80; i++) {
            ctx.fillStyle = 'rgba(3,2,6,0.28)';
            ctx.fillRect(0, 0, W, H);
            orbs.forEach((o, idx) => {
                // Gentle random steering
                o.vx += (Math.random() - 0.5) * 0.005;
                o.vy += (Math.random() - 0.5) * 0.005;
                
                const speed = Math.sqrt(o.vx * o.vx + o.vy * o.vy);
                if (speed > o.baseSpeed) {
                    o.vx = (o.vx / speed) * o.baseSpeed;
                    o.vy = (o.vy / speed) * o.baseSpeed;
                }

                o.x += o.vx;
                o.y += o.vy;

                // Bounce off edges gently
                const margin = 10;
                if (o.x < margin) { o.x = margin; o.vx = Math.abs(o.vx); }
                if (o.x > W - margin) { o.x = W - margin; o.vx = -Math.abs(o.vx); }
                if (o.y < margin) { o.y = margin; o.vy = Math.abs(o.vy); }
                if (o.y > H - margin) { o.y = H - margin; o.vy = -Math.abs(o.vy); }

                const g2 = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.radius);
                g2.addColorStop(0,   `rgba(${o.r},${o.g},${o.b},0.8)`);
                g2.addColorStop(0.5, `rgba(${o.r},${o.g},${o.b},0.3)`);
                g2.addColorStop(1,   `rgba(${o.r},${o.g},${o.b},0)`);
                ctx.globalCompositeOperation = idx % 2 === 0 ? 'source-over' : 'screen';
                ctx.fillStyle = g2;
                ctx.beginPath(); ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2); ctx.fill();
            });
            ctx.globalCompositeOperation = 'source-over';
        }

        this.sessions.set(id, { canvas, ctx, orbs, fftBuf: null, audio: { bass: 0, mids: 0, treble: 0 }, speedMult, W, H, variant, isPlaying: true });
        this.ensureRunning();
    }

    updateColors(id: string, colors: RawColor[]) {
        const s = this.sessions.get(id);
        if (!s) return;
        s.orbs.forEach((o, i) => {
            if (colors[i]) { o.tr = colors[i].r; o.tg = colors[i].g; o.tb = colors[i].b; }
        });
    }

    setPlayingState(id: string, isPlaying: boolean) {
        const s = this.sessions.get(id);
        if (s) s.isPlaying = isPlaying;
    }

    unregister(id: string) {
        this.sessions.delete(id);
        if (this.sessions.size === 0) {
            cancelAnimationFrame(this.rafId);
            this.running = false;
        }
    }

    private ensureRunning() {
        if (this.running) return;
        this.running = true;
        this.tick();
    }

    private tick() {
        this.sessions.forEach(s => this.drawSession(s));
        this.rafId = requestAnimationFrame(() => this.tick());
    }

    private drawSession(s: CanvasSession) {
        const { ctx, orbs, W, H, variant, isPlaying } = s;

        // Read advanced audio features from the engine directly
        const features = audioEngine.getAudioFeatures();

        // ── Override with Pre-Computed Backend Analysis if available ──
        const currentTrack = usePlayerStore.getState().currentTrack;
        if (currentTrack?.analysisData?.sections) {
            const audioEl = document.querySelector('audio');
            if (audioEl) {
                const ct = audioEl.currentTime;
                const currentSection = currentTrack.analysisData.sections.find((sec: any) => ct >= sec.start && ct < sec.end);
                if (currentSection) {
                    features.section = currentSection.type;
                }
            }
        }
        
        // Asymmetrical Attack/Release envelope for punchy, immediate beat detection
        // We smooth the raw features from the engine to make the visuals look buttery smooth
        const bDiff = Math.pow(features.bass, 1.2) - s.audio.bass;
        s.audio.bass += bDiff * (bDiff > 0 ? 0.4 : 0.015);
        
        const mDiff = features.mids - s.audio.mids;
        s.audio.mids += mDiff * (mDiff > 0 ? 0.3 : 0.015);
        
        const tDiff = features.treble - s.audio.treble;
        s.audio.treble += tDiff * (tDiff > 0 ? 0.5 : 0.015);
        const { bass, mids, treble } = s.audio;
        // Make the speed limit entirely dependent on the audio (up to 15x faster on heavy beats)
        let speedFactor = 1.0 + bass * 15.0 + mids * 8.0;

        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(3,2,6,0.20)';
        ctx.fillRect(0, 0, W, H);

        orbs.forEach((o, idx) => {
            // Snappy color transitions (0.18 instead of 0.06)
            o.r += (o.tr - o.r) * 0.18;
            o.g += (o.tg - o.g) * 0.18;
            o.b += (o.tb - o.b) * 0.18;

            // Time-based swirling effect based on variant
            const time = performance.now();
            
            // Dampen swirling forces if paused to create a gentle idle state
            const motionMultiplier = isPlaying ? 1.0 : 0.15;
            
            if (variant === 'fullview') {
                // Slow, chill, heavily merged colors for soft background
                const cx = W / 2;
                const cy = H / 2;
                
                // Gentle magnetic pull to the center to keep them overlapping and merged
                const pullForce = 0.0005;
                o.vx += (cx - o.x) * pullForce * motionMultiplier;
                o.vy += (cy - o.y) * pullForce * motionMultiplier;

                // Very slow, deeply smooth drifting (no random jitter)
                const swirlX = Math.sin(time * 0.0002 + idx * 1.5) * 0.4;
                const swirlY = Math.cos(time * 0.00015 - idx * 1.2) * 0.4;
                o.vx += (swirlX * 0.02) * motionMultiplier;
                o.vy += (swirlY * 0.02) * motionMultiplier;
            } else {
                // Highly reactive beat-driven physics for high energy pages
                const audioForce = (idx === 0 || idx === 2) ? bass : (idx === 1 ? mids : treble);
                
                const cx = W / 2;
                const cy = H / 2;
                const distToCenterX = cx - o.x;
                const distToCenterY = cy - o.y;
                const distFromCenter = Math.sqrt(distToCenterX * distToCenterX + distToCenterY * distToCenterY);
                const maxDist = Math.min(W, H) * 0.4; // 40% of screen size

                // Massively strong pull if they drift too far out, guaranteeing they stay near the center
                const pullForce = distFromCenter > maxDist ? 0.02 : 0.002; 
                o.vx += (distToCenterX * pullForce) * motionMultiplier;
                o.vy += (distToCenterY * pullForce) * motionMultiplier;

                // Swirls gently amp up with the audio
                const swirlForce = 1.0 + audioForce * 3.0;
                
                // Choreograph the background based on the actual song section!
                let swirlX = 0;
                let swirlY = 0;

                if (features.section === 'drop') {
                    // Huge, explosive wide orbits for drops
                    swirlX = Math.sin(time * 0.0004 + idx * 1.8) * swirlForce * 1.5;
                    swirlY = Math.cos(time * 0.0003 - idx * 1.5) * swirlForce * 1.5;
                } else if (features.section === 'vocal') {
                    // Smooth, criss-crossing Figure 8s that frame the center for vocals/rap
                    swirlX = Math.sin(time * 0.0005 + idx * 2.0) * swirlForce;
                    swirlY = Math.sin(time * 0.00025 + idx * 1.0) * swirlForce;
                } else if (features.section === 'instrumental') {
                    // Complex, chaotic scattering for instrumentals
                    swirlX = (Math.sin(time * 0.0006 + idx) + Math.cos(time * 0.0002 - idx)) * swirlForce * 0.8;
                    swirlY = (Math.cos(time * 0.0005 - idx) + Math.sin(time * 0.0003 + idx)) * swirlForce * 0.8;
                } else { // 'quiet'
                    // Very tight, slow pulsing cross for quiet moments
                    swirlX = Math.cos(time * 0.0008 + idx * Math.PI) * swirlForce * 0.3;
                    swirlY = Math.sin(time * 0.0008 + idx * Math.PI) * swirlForce * 0.3;
                }
                
                // Add velocity (acceleration transitions smoothly due to friction)
                o.vx += (swirlX * 0.4) * motionMultiplier;
                o.vy += (swirlY * 0.4) * motionMultiplier;
            }

            // Significantly reduce target speed if music is paused
            const targetSpeed = o.baseSpeed * speedFactor * (isPlaying ? 1.0 : 0.15);
            const speed = Math.sqrt(o.vx * o.vx + o.vy * o.vy);
            
            // Apply smooth momentum/friction instead of a hard mathematical clamp to prevent stuttering
            if (speed > targetSpeed) {
                // Smoothly decelerate over several frames
                const friction = 0.92 + (targetSpeed / speed) * 0.05; 
                o.vx *= friction;
                o.vy *= friction;
            }

            o.x += o.vx;
            o.y += o.vy;

            // Bounce off edges gently
            const margin = -50; // Allow them to go slightly off screen without getting permanently trapped
            if (o.x < margin) { o.x = margin; o.vx = Math.abs(o.vx); }
            if (o.x > W - margin) { o.x = W - margin; o.vx = -Math.abs(o.vx); }
            if (o.y < margin) { o.y = margin; o.vy = Math.abs(o.vy); }
            if (o.y > H - margin) { o.y = H - margin; o.vy = -Math.abs(o.vy); }

            // Highly smooth and elegant breathing pulse (visibly pumps with the beat)
            let pulse = 1.0;
            if (idx === 0 || idx === 2)   pulse = 1.0 + bass   * 0.55; // Massive kick drum pulse
            else if (idx === 1)           pulse = 1.0 + mids   * 0.45; // Vocal/Synth pulse
            else                          pulse = 1.0 + treble * 0.35; // Hi-hat pulse
            const R = variant === 'fullview' ? o.radius * pulse * 2.2 : o.radius * pulse;

            const rr = Math.round(o.r), rg = Math.round(o.g), rb = Math.round(o.b);
            const grad = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, R);
            grad.addColorStop(0,    `rgba(${rr},${rg},${rb},1.0)`);
            grad.addColorStop(0.38, `rgba(${rr},${rg},${rb},0.80)`);
            grad.addColorStop(0.72, `rgba(${rr},${rg},${rb},0.35)`);
            grad.addColorStop(1,    `rgba(${rr},${rg},${rb},0)`);

            ctx.globalCompositeOperation = idx % 2 === 0 ? 'source-over' : 'screen';
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(o.x, o.y, R, 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalCompositeOperation = 'source-over';
    }
}

const fluidEngine = new FluidAnimationEngine();

// ─── Color extraction ─────────────────────────────────────────────────────────
// ─── HSL helpers ─────────────────────────────────────────────────────────────
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else                h = ((r - g) / d + 4) * 60;
    return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if      (h < 60)  { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else              { r = c; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

// ─── Color extraction ─────────────────────────────────────────────────────────
/**
 * HSL hue-bucket extraction weighted by saturation.
 * Finds the TRUE visual colors of album art — e.g. Raga of Revenge has blue+red,
 * not just dark maroon (which pixel-count histograms pick because it has more area).
 */
function extractFromImg(img: HTMLImageElement | ImageBitmap): RawColor[] | null {
    const SIZE = 40; // 40x40 is plenty of data to find dominant colors, and extremely fast to process
    const c = document.createElement('canvas');
    c.width = SIZE; c.height = SIZE;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img as any, 0, 0, SIZE, SIZE);
    let data: Uint8ClampedArray;
    try { data = ctx.getImageData(0, 0, SIZE, SIZE).data; }
    catch { return null; }

    interface Cluster {
        rSum: number;
        gSum: number;
        bSum: number;
        count: number;
    }

    const clusters: Cluster[] = [];

    // Filter pixels first to find colorful dominant colors
    let pixels: { r: number; g: number; b: number }[] = [];
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 180) continue;

        // Skip near-black (dark grays/pure black) and near-white (pure white)
        if (r < 32 && g < 32 && b < 32) continue;
        if (r > 224 && g > 224 && b > 224) continue;
        
        // Skip neutral grays (channels very close to each other)
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max - min < 12) continue;

        pixels.push({ r, g, b });
    }

    // Fallback: If no vibrant colors found (monochrome or high/low key art), keep all pixels
    if (pixels.length === 0) {
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
            if (a < 180) continue;
            pixels.push({ r, g, b });
        }
    }

    // Group visually similar pixels via Manhattan Distance
    for (const pixel of pixels) {
        const { r, g, b } = pixel;
        let found = false;
        for (const cl of clusters) {
            const avgR = cl.rSum / cl.count;
            const avgG = cl.gSum / cl.count;
            const avgB = cl.bSum / cl.count;
            const dist = Math.abs(avgR - r) + Math.abs(avgG - g) + Math.abs(avgB - b);

            if (dist < 90) { // Manhattan distance threshold
                cl.rSum += r;
                cl.gSum += g;
                cl.bSum += b;
                cl.count++;
                found = true;
                break;
            }
        }

        if (!found) {
            clusters.push({ rSum: r, gSum: g, bSum: b, count: 1 });
        }
    }

    if (clusters.length === 0) return null;

    // Sort clusters by count descending to get most dominant colors
    clusters.sort((a, b) => b.count - a.count);

    const picked: RawColor[] = clusters.map(cl => ({
        r: Math.round(cl.rSum / cl.count),
        g: Math.round(cl.gSum / cl.count),
        b: Math.round(cl.bSum / cl.count)
    }));

    // Gracefully repeat/cycle colors to fill all 4 slots without synthesizing fake ones
    const finalColors: RawColor[] = [];
    for (let i = 0; i < 4; i++) {
        finalColors.push(picked[i % picked.length]);
    }

    return finalColors;
}


/**
 * Fetch image as a blob (no CORS restriction for same-domain APIs)
 * then create an object URL so canvas drawImage works without tainting.
 */
async function loadImgWithProxy(imageUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        let finalUrl = imageUrl;
        if (imageUrl.startsWith('http') && !imageUrl.includes('proxy-image')) {
            const API_BASE = getApiBaseUrl();
            finalUrl = `${API_BASE}/utils/proxy-image?url=${encodeURIComponent(imageUrl)}`;
        }

        const t = setTimeout(() => reject(new Error('timeout')), 8000);
        img.onload = () => { clearTimeout(t); resolve(img); };
        img.onerror = () => { clearTimeout(t); reject(new Error('error')); };
        img.src = finalUrl;
    });
}

async function extractColors(imageUrl: string): Promise<RawColor[] | null> {
    try {
        const img = await loadImgWithProxy(imageUrl);
        return extractFromImg(img);
    } catch (err) {
        console.warn('Local proxy image extraction failed:', err);
        return null;
    }
}

const colorCache = new Map<string, RawColor[]>();

function getCachedColors(url: string): RawColor[] | null {
    if (colorCache.has(url)) {
        return colorCache.get(url)!;
    }
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const stored = window.localStorage.getItem(`color_cache_${url}`);
            if (stored) {
                const parsed = JSON.parse(stored) as RawColor[];
                if (Array.isArray(parsed) && parsed.length >= 4) {
                    colorCache.set(url, parsed);
                    return parsed;
                }
            }
        }
    } catch (e) {
        // ignore
    }
    return null;
}

function setCachedColors(url: string, colors: RawColor[]) {
    colorCache.set(url, colors);
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(`color_cache_${url}`, JSON.stringify(colors));
        }
    } catch (e) {
        // ignore
    }
}

let sessionCounter = 0;

// Default placeholder colors — warm-toned so they look good before extraction
const PLACEHOLDER_COLORS: RawColor[] = [
    { r: 80, g: 25, b: 10 },
    { r: 10, g: 25, b: 80 },
    { r: 60, g: 15, b: 40 },
    { r: 15, g: 60, b: 45 },
];

/**
 * Zenify Reactive Fluid Background v9
 * ─ Animation managed by a module-level singleton (FluidAnimationEngine)
 * ─ ZERO React lifecycle interference — one RAF loop, never stops
 * ─ Colors extracted via proxy-first (guaranteed CORS success)
 * ─ Distance threshold 28 + shade generation → always 4 distinct colors
 */
export function ReactiveAudioBackground({ 
    coverUrl, 
    className, 
    track, 
    speedMultiplier = 1,
    variant = 'fullview'
}: ReactiveAudioBackgroundProps) {
    const isPlaying = usePlayerStore(s => s.isPlaying);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isMobile, setIsMobile] = useState(false);
    // Stable session ID per component instance — never changes
    const sessionId = useRef(`fluid-${++sessionCounter}`).current;

    useEffect(() => {
        setIsMobile(window.innerWidth < 768);
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // ── Resolve image URL ──────────────────────────────────────────────────
    const imageUrlRef = useRef('');
    const getImageUrl = () => {
        const raw = coverUrl || track?.coverUrl || '';
        if (!raw) return '';
        if (raw.startsWith('http') || raw.startsWith('blob') || raw.startsWith('data')) return raw;
        return getMediaUrl(raw) || '';
    };
    const imageUrl = getImageUrl();

    // ── Mount: register canvas with animation engine ───────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const id = sessionId;
        const initialColors = getCachedColors(imageUrl) ?? PLACEHOLDER_COLORS;
        
        // Low base speeds — the audio physics will multiply this by up to 15x dynamically!
        const finalSpeed = variant === 'fullview' 
            ? speedMultiplier * 0.25 
            : (variant === 'hero' ? speedMultiplier * 0.35 : speedMultiplier * 0.35);
            
        fluidEngine.register(id, canvas, initialColors, finalSpeed, variant);
        return () => { fluidEngine.unregister(id); };
        // Only runs on mount/unmount — intentionally empty deps
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Sync playback state to animation engine ──────────────────────────────
    useEffect(() => {
        fluidEngine.setPlayingState(sessionId, isPlaying);
    }, [isPlaying, sessionId]);

    // ── Update colors when imageUrl changes ────────────────────────────────
    useEffect(() => {
        const url = imageUrl;
        if (!url || url === imageUrlRef.current) return;
        imageUrlRef.current = url;

        // Instantly apply cached colors
        const cached = getCachedColors(url);
        if (cached) {
            fluidEngine.updateColors(sessionId, cached);
            return;
        }

        // Async extract via proxy
        let active = true;
        extractColors(url).then(result => {
            if (!active || !result) return;
            setCachedColors(url, result);
            fluidEngine.updateColors(sessionId, result);
        });
        return () => { active = false; };
    }, [imageUrl, sessionId]);

    return (
        <div className={cn(
            "absolute inset-0 z-0 overflow-hidden bg-[#030206] select-none pointer-events-none",
            className
        )}>
            {/* Layer 1: blurred cover — instant correct colors, CORS-free */}
            {imageUrl && (
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: `url(${imageUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        filter: 'blur(50px) saturate(1.5)',
                        transform: 'scale(1.25)',
                        transformOrigin: 'center',
                    }}
                />
            )}

            {/* Layer 2: fluid canvas — managed by FluidAnimationEngine, never stops */}
            {(() => {
                let blurFilter = 'blur(50px) saturate(1.8) brightness(1.15)';
                let scaleVal = isMobile ? 4 : 8;
                let canvasW = isMobile ? '200px' : '300px';
                let canvasH = isMobile ? '200px' : '300px';
                let marginL = isMobile ? '-100px' : '-150px';
                let marginT = isMobile ? '-100px' : '-150px';

                if (variant === 'track') {
                    // Track variant
                    blurFilter = 'blur(20px) saturate(2.0) brightness(1.15)';
                    scaleVal = isMobile ? 2.5 : 4;
                    canvasW = isMobile ? '350px' : '500px';
                    canvasH = isMobile ? '350px' : '500px';
                    marginL = isMobile ? '-175px' : '-250px';
                    marginT = isMobile ? '-175px' : '-250px';
                } else if (variant === 'hero') {
                    // Hero variant
                    blurFilter = 'blur(12px) saturate(2.3) brightness(1.25)';
                    scaleVal = isMobile ? 2.5 : 4;
                    canvasW = isMobile ? '400px' : '640px';
                    canvasH = isMobile ? '400px' : '640px';
                    marginL = isMobile ? '-200px' : '-320px';
                    marginT = isMobile ? '-200px' : '-320px';
                }

                return (
                    <canvas
                        ref={canvasRef}
                        className="absolute"
                        style={{
                            width: canvasW,
                            height: canvasH,
                            left: '50%',
                            top: '50%',
                            marginLeft: marginL,
                            marginTop: marginT,
                            filter: blurFilter,
                            transform: `translate3d(0, 0, 0) scale(${scaleVal})`,
                            backfaceVisibility: 'hidden',
                            transformOrigin: 'center',
                            willChange: 'transform',
                            opacity: 0.95,
                        }}
                    />
                );
            })()}

            {/* Film grain */}
            <div className="absolute inset-0 z-10 pointer-events-none" style={{ opacity: 0.04, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }} />

            {/* Dark scrim - increased for better UI button contrast */}
            <div className="absolute inset-0 z-[15] bg-black/40 pointer-events-none" />

            {/* Vignette */}
            <div className="absolute inset-0 z-20 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 40%, transparent 20%, rgba(0,0,0,0.65) 130%)' }} />
        </div>
    );
}
