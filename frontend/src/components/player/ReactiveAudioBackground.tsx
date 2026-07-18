"use client";

import React, { useEffect, useRef, useState } from 'react';
import { cn, getMediaUrl, getApiBaseUrl } from '@/lib/utils';
import { Track, usePlayerStore } from '@/store/player';
import { audioEngine } from '@/lib/audio-engine';
import { useUIStore } from '@/store/ui';

// ─── Types ────────────────────────────────────────────────────────────────────
interface RawColor { r: number; g: number; b: number; }

interface ReactiveAudioBackgroundProps {
 coverUrl?: string;
 className?: string;
 track?: Track | null;
 palette?: Array<{r: number; g: number; b: number}> | null;
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
 isMobile: boolean;
 isTransitioning?: boolean;
 lastDrawTime?: number;
}

interface OrbState {
 x: number; y: number; // Current position
 vx: number; vy: number; // Current velocity
 baseSpeed: number; // Target base speed
 r: number; g: number; b: number;
 tr: number; tg: number; tb: number;
 radius: number;
}

const BASE_CONFIGS = [
 { radius: 120 },
 { radius: 140 },
 { radius: 110 },
 { radius: 130 },
];

class FluidAnimationEngine {
 private sessions = new Map<string, CanvasSession>();
 private rafId = 0;
 private running = false;

 register(id: string, canvas: HTMLCanvasElement, colors: RawColor[], speedMult: number, variant: 'fullview' | 'track' | 'hero', isMobile: boolean) {
 const ctx = canvas.getContext('2d');
 if (!ctx) return;

 const W = isMobile ? 128 : 128; // Hardcode to 128 for massive performance gain on all devices
 const H = isMobile ? 128 : 128;
 canvas.width = W; canvas.height = H;

 const orbs: OrbState[] = BASE_CONFIGS.map((b, i) => {
 const angle = Math.random() * Math.PI * 2;
 const speed = (0.3 + Math.random() * 0.2) * speedMult * 15; // Massively increased base speed
 return {
 x: W * 0.2 + Math.random() * W * 0.6,
 y: H * 0.2 + Math.random() * H * 0.6,
 vx: Math.cos(angle) * speed,
 vy: Math.sin(angle) * speed,
 baseSpeed: speed,
 r: colors[i % colors.length]?.r ?? 30, g: colors[i % colors.length]?.g ?? 10, b: colors[i % colors.length]?.b ?? 50,
 tr: colors[i % colors.length]?.r ?? 30, tg: colors[i % colors.length]?.g ?? 10, tb: colors[i % colors.length]?.b ?? 50,
 radius: b.radius * 1.5,
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

 // Bounce off edges gently so they don't leave the canvas
 const margin = -25; // allow slight overlap so they don't look artificially boxed in
 if (o.x < margin) { o.x = margin; o.vx = Math.abs(o.vx); }
 if (o.x > W - margin) { o.x = W - margin; o.vx = -Math.abs(o.vx); }
 if (o.y < margin) { o.y = margin; o.vy = Math.abs(o.vy); }
 if (o.y > H - margin) { o.y = H - margin; o.vy = -Math.abs(o.vy); }

 const g2 = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.radius);
 g2.addColorStop(0, `rgba(${o.r},${o.g},${o.b},0.8)`);
 g2.addColorStop(0.5, `rgba(${o.r},${o.g},${o.b},0.3)`);
 g2.addColorStop(1, `rgba(${o.r},${o.g},${o.b},0)`);
 ctx.globalCompositeOperation = 'source-over';
 ctx.fillStyle = g2;
 ctx.beginPath(); ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2); ctx.fill();
 });
 ctx.globalCompositeOperation = 'source-over';
 }

 this.sessions.set(id, { canvas, ctx, orbs, fftBuf: null, audio: { bass: 0, mids: 0, treble: 0 }, speedMult, W, H, variant, isPlaying: true, isMobile });
 this.ensureRunning();
 }

 updateColors(id: string, colors: RawColor[]) {
 const s = this.sessions.get(id);
 if (!s) return;
 s.orbs.forEach((o, i) => {
 if (colors[i]) { o.tr = colors[i].r; o.tg = colors[i].g; o.tb = colors[i].b; }
 });
 // Force single draw frame to sync colors immediately
 this.drawSession(s);
 }

 setPlayingState(id: string, isPlaying: boolean) {
 const s = this.sessions.get(id);
 if (s) {
 s.isPlaying = isPlaying;
 this.ensureRunning();
 }
 }

 setTransitioningState(id: string, isTransitioning: boolean) {
 const s = this.sessions.get(id);
 if (s) {
 s.isTransitioning = isTransitioning;
 this.ensureRunning();
 }
 }

 unregister(id: string) {
 this.sessions.delete(id);
 if (this.sessions.size === 0) {
 cancelAnimationFrame(this.rafId);
 this.running = false;
 }
 }

 private ensureRunning() {
 let anyPlaying = false;
 this.sessions.forEach(s => {
 if (s.isPlaying) anyPlaying = true;
 });
 if (!anyPlaying) return;

 if (this.running) return;
 this.running = true;
 this.tick();
 }

 private tick() {
 const now = performance.now();
 let anyPlaying = false;

 this.sessions.forEach(s => {
 if (s.isPlaying) {
 anyPlaying = true;
 if (!s.isTransitioning) {
 const lastDraw = s.lastDrawTime || 0;
 // Cap at ~60 FPS (approx 16ms) for buttery smooth animations everywhere
 const frameCap = 16;
 if (now - lastDraw >= frameCap) {
 this.drawSession(s);
 s.lastDrawTime = now;
 }
 }
 }
 });

 if (anyPlaying) {
 this.rafId = requestAnimationFrame(() => this.tick());
 } else {
 this.running = false;
 }
 }

 private drawSession(s: CanvasSession) {
 const { ctx, orbs, W, H, variant, isPlaying, isMobile } = s;

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
 
 // Make the speed limit entirely dependent on the audio
 let speedFactor = 1.0 + bass * 10.0 + mids * 5.0;
 let globalSectionSpeed = 1.0;

 if (features.section === 'quiet') {
 globalSectionSpeed = 0.1; // Barely moving
 speedFactor = 1.0;
 } else if (features.section === 'slow') {
 globalSectionSpeed = 0.25; // Gentle, slow sweeping for sad/slow sections
 speedFactor = 1.0 + bass * 2.0;
 } else if (features.section === 'fast') {
 globalSectionSpeed = 2.0; // Rapid
 speedFactor = 1.5 + bass * 15.0;
 } else if (features.section === 'vocal') {
 globalSectionSpeed = 0.8; 
 speedFactor = 1.0 + mids * 8.0;
 } else { // instrumental
 globalSectionSpeed = 1.0;
 }
 
  // We removed the mobile battery saver penalty here so the animation flows fast and smooth!

 // True Apple Music style: completely clear the canvas with a solid base color every frame
 // No trails! The CSS blur handles the liquid "melting" of the solid orbs.
 ctx.globalCompositeOperation = 'source-over';
 if (orbs[0]) {
 // Base color is a deeply saturated, slightly darkened version of the first color
 ctx.fillStyle = `rgba(${Math.round(orbs[0].r * 0.6)}, ${Math.round(orbs[0].g * 0.6)}, ${Math.round(orbs[0].b * 0.6)}, 1.0)`;
 } else {
 ctx.fillStyle = '#030206';
 }
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
 
 // Highly reactive beat-driven physics for high energy splashing
 const audioForce = (idx === 0 || idx === 2) ? bass : (idx === 1 ? mids : treble);
 
 const cx = W / 2;
 const cy = H / 2;
 const distToCenterX = cx - o.x;
 const distToCenterY = cy - o.y;
 const distFromCenter = Math.sqrt(distToCenterX * distToCenterX + distToCenterY * distToCenterY);
 
 // Allow them to reach the very edges of the screen
 const maxDist = 180; 

 // Very gentle pull to keep them in bounds but let them roam wide
 const pullForce = distFromCenter > maxDist ? 0.002 : 0.0001; 
 o.vx += (distToCenterX * pullForce) * motionMultiplier;
 o.vy += (distToCenterY * pullForce) * motionMultiplier;

 // Swirls gently amp up with the audio
 const swirlForce = 0.5 + audioForce * 1.5;
 
 // Choreograph the background based on the actual song section!
 let swirlX = 0;
 let swirlY = 0;

 if (features.section === 'fast') {
 swirlX = Math.sin(time * 0.0004 + idx * 1.8) * swirlForce * 1.5;
 swirlY = Math.cos(time * 0.0003 - idx * 1.5) * swirlForce * 1.5;
 } else if (features.section === 'vocal') {
 swirlX = Math.sin(time * 0.0005 + idx * 2.0) * swirlForce;
 swirlY = Math.sin(time * 0.00025 + idx * 1.0) * swirlForce;
 } else if (features.section === 'instrumental') {
 swirlX = (Math.sin(time * 0.0006 + idx) + Math.cos(time * 0.0002 - idx)) * swirlForce * 0.8;
 swirlY = (Math.cos(time * 0.0005 - idx) + Math.sin(time * 0.0003 + idx)) * swirlForce * 0.8;
 } else if (features.section === 'slow') {
 swirlX = Math.sin(time * 0.00015 + idx * 1.2) * swirlForce * 0.4;
 swirlY = Math.cos(time * 0.0001 + idx * 1.1) * swirlForce * 0.4;
 } else { // 'quiet'
 swirlX = Math.cos(time * 0.0008 + idx * Math.PI) * swirlForce * 0.1;
 swirlY = Math.sin(time * 0.0008 + idx * Math.PI) * swirlForce * 0.1;
 }
 
 o.vx += (swirlX * 0.4) * motionMultiplier;
 o.vy += (swirlY * 0.4) * motionMultiplier;

 const targetSpeed = o.baseSpeed * speedFactor * globalSectionSpeed * (isPlaying ? 1.0 : 0.15);
 const speed = Math.sqrt(o.vx * o.vx + o.vy * o.vy);
 
 if (speed > targetSpeed) {
 const friction = 0.92 + (targetSpeed / speed) * 0.05; 
 o.vx *= friction;
 o.vy *= friction;
 }

 o.x += o.vx;
 o.y += o.vy;

 // Apple Music splashing effect: allow them to sweep massively off-screen and back
 const margin = -50; 
 if (o.x < margin) { o.x = margin; o.vx = Math.abs(o.vx); }
 if (o.x > W - margin) { o.x = W - margin; o.vx = -Math.abs(o.vx); }
 if (o.y < margin) { o.y = margin; o.vy = Math.abs(o.vy); }
 if (o.y > H - margin) { o.y = H - margin; o.vy = -Math.abs(o.vy); }

 let pulse = 1.0;
 if (idx === 0 || idx === 2) pulse = 1.0 + bass * 0.4;
 else if (idx === 1) pulse = 1.0 + mids * 0.3;
 else pulse = 1.0 + treble * 0.2;
 
 // Reduced R to prevent filling the whole screen
 const R = o.radius * pulse * 1.3; 
 
 const rr = Math.round(o.r), rg = Math.round(o.g), rb = Math.round(o.b);
 const grad = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, R);
 // More distinct blobs by not fading to 0.7 at 0.5, but having a harder gradient
 grad.addColorStop(0, `rgba(${rr},${rg},${rb},0.95)`);
 grad.addColorStop(0.4, `rgba(${rr},${rg},${rb},0.85)`);
 grad.addColorStop(0.8, `rgba(${rr},${rg},${rb},0.3)`);
 grad.addColorStop(1, `rgba(${rr},${rg},${rb},0)`);

 ctx.globalCompositeOperation = 'source-over';
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
 if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
 else if (max === g) h = ((b - r) / d + 2) * 60;
 else h = ((r - g) / d + 4) * 60;
 return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
 const c = (1 - Math.abs(2 * l - 1)) * s;
 const x = c * (1 - Math.abs((h / 60) % 2 - 1));
 const m = l - c / 2;
 let r = 0, g = 0, b = 0;
 if (h < 60) { r = c; g = x; }
 else if (h < 120) { r = x; g = c; }
 else if (h < 180) { g = c; b = x; }
 else if (h < 240) { g = x; b = c; }
 else if (h < 300) { r = x; b = c; }
 else { r = c; b = x; }
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

 // Safari Bug Fix: If the UI previously loaded this image without CORS, Safari caches the NO-CORS version.
 // When we fetch it here with crossOrigin="anonymous", Safari serves the NO-CORS cached version,
 // which instantly taints the Canvas and causes color extraction to fail (returning null).
 // Appending a cache-buster forces a fresh CORS-enabled request.
 if (finalUrl.startsWith('http')) {
 finalUrl += (finalUrl.includes('?') ? '&' : '?') + `_corsBust=${Date.now()}`;
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

import { get as idbGet, set as idbSet, keys as idbKeys, del as idbDel } from 'idb-keyval';

const colorCache = new Map<string, RawColor[]>();

/** Strip any _corsBust=... query param so the cache key is stable across requests */
function normalizeCacheKey(url: string): string {
 try {
 // Remove the _corsBust param if present
 return url.replace(/[?&]_corsBust=\d+/g, '').replace(/[?&]$/, '');
 } catch {
 return url;
 }
}

async function getCachedColorsAsync(url: string): Promise<RawColor[] | null> {
 const key = normalizeCacheKey(url);
 if (colorCache.has(key)) {
 return colorCache.get(key)!;
 }
 try {
 const stored = await idbGet(`color_cache_${key}`);
 if (stored) {
 if (Array.isArray(stored) && stored.length >= 4) {
 colorCache.set(key, stored as RawColor[]);
 return stored as RawColor[];
 }
 }
 } catch (e) {
 // ignore
 }
 return null;
}

function getCachedColorsSync(url: string): RawColor[] | null {
 const key = normalizeCacheKey(url);
 return colorCache.get(key) || null;
}

async function setCachedColors(url: string, colors: RawColor[]) {
 const key = normalizeCacheKey(url);
 colorCache.set(key, colors);
 try {
 await idbSet(`color_cache_${key}`, colors);
 } catch (e) {
 // ignore
 }
}

// Clean up old cache entries from localStorage (one-time migration)
if (typeof window !== 'undefined' && window.localStorage) {
 try {
 const keysToDelete: string[] = [];
 for (let i = 0; i < window.localStorage.length; i++) {
 const k = window.localStorage.key(i);
 if (k && k.startsWith('color_cache_')) {
 keysToDelete.push(k);
 }
 }
 keysToDelete.forEach(k => window.localStorage.removeItem(k));
 } catch {}
}

let sessionCounter = 0;

// Default placeholder colors — bright vibrant fallback so mobile never shows a black screen
const PLACEHOLDER_COLORS: RawColor[] = [
 { r: 160, g: 60, b: 80 },
 { r: 40, g: 80, b: 160 },
 { r: 140, g: 40, b: 120 },
 { r: 60, g: 140, b: 100 },
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
 palette,
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
 
 const activePalette = palette || track?.palette;
 const initialColors = (activePalette && Array.isArray(activePalette) && activePalette.length >= 4)
 ? (activePalette as RawColor[])
 : (getCachedColorsSync(imageUrl) ?? PLACEHOLDER_COLORS);
 
 // Low base speeds — the audio physics will multiply this by up to 15x dynamically!
 const finalSpeed = variant === 'fullview' 
 ? speedMultiplier * 0.25 
 : (variant === 'hero' ? speedMultiplier * 0.35 : speedMultiplier * 0.35);
 
 fluidEngine.register(id, canvas, initialColors, finalSpeed, variant, isMobile);

 // Async hydration if we only had placeholders
 if (initialColors === PLACEHOLDER_COLORS) {
 getCachedColorsAsync(imageUrl).then(cached => {
 if (cached) {
 fluidEngine.updateColors(id, cached);
 }
 });
 }

 return () => { fluidEngine.unregister(id); };
 // Only runs on mount/unmount/isMobile change
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [isMobile]);

 // ── Sync playback state to animation engine ──────────────────────────────
 useEffect(() => {
 fluidEngine.setPlayingState(sessionId, isPlaying);
 }, [isPlaying, sessionId]);

 // ── Suspend animation rendering during sidebar expand/collapse transitions ──
 const isSidebarCollapsed = useUIStore(s => s.isSidebarCollapsed);
 useEffect(() => {
 fluidEngine.setTransitioningState(sessionId, true);
 const timer = setTimeout(() => {
 fluidEngine.setTransitioningState(sessionId, false);
 }, 600);
 return () => {
 clearTimeout(timer);
 fluidEngine.setTransitioningState(sessionId, false);
 };
 }, [isSidebarCollapsed, sessionId]);

 // ── Update colors when imageUrl, palette, or track changes ───────────────
 useEffect(() => {
 const url = imageUrl;
 if (!url) return;

 const activePalette = palette || track?.palette;
 if (activePalette && Array.isArray(activePalette) && activePalette.length >= 4) {
 const rawColors = activePalette as RawColor[];
 fluidEngine.updateColors(sessionId, rawColors);
 setCachedColors(url, rawColors);
 imageUrlRef.current = url;
 return;
 }

 if (url === imageUrlRef.current && getCachedColorsSync(url)) return;
 imageUrlRef.current = url;

 let active = true;
 
 // Instantly apply sync cached colors
 const cached = getCachedColorsSync(url);
 if (cached) {
 fluidEngine.updateColors(sessionId, cached);
 return;
 }

 // Try async cache first
 getCachedColorsAsync(url).then(async asyncCached => {
 if (!active) return;
 if (asyncCached) {
 fluidEngine.updateColors(sessionId, asyncCached);
 return;
 }
 
 // If completely missing, extract via proxy
 try {
 const result = await extractColors(url);
 if (!active || !result) return;
 setCachedColors(url, result);
 fluidEngine.updateColors(sessionId, result);
 } catch (err) {
 /* silently ignore on mobile cors failures */
 }
 });

 return () => { active = false; };
 }, [imageUrl, sessionId, track, palette]);

 return (
 <div className={cn(
 "absolute inset-0 z-0 overflow-hidden bg-[#030206] select-none pointer-events-none",
 className
 )}>

 {/* Layer 2: fluid canvas — managed by FluidAnimationEngine, never stops */}
 {(() => {
 let blurFilter = 'blur(50px) saturate(1.8) brightness(1.15)';
 let scaleVal = 8;
 let canvasW = '300px';
 let canvasH = '300px';
 let marginL = '-150px';
 let marginT = '-150px';

 if (variant === 'track') {
 // Track variant
 blurFilter = isMobile ? 'blur(30px) saturate(2.0) brightness(1.1)' : 'blur(60px) saturate(2.0) brightness(1.1)';
 scaleVal = 5;
 canvasW = '500px';
 canvasH = '500px';
 marginL = '-250px';
 marginT = '-250px';
 } else if (variant === 'hero') {
 // Hero variant
 blurFilter = isMobile ? 'blur(20px) saturate(2.5) brightness(1.2)' : 'blur(40px) saturate(2.5) brightness(1.2)';
 scaleVal = 5;
 canvasW = '640px';
 canvasH = '640px';
 marginL = '-320px';
 marginT = '-320px';
 } else {
 // Fullview variant (default)
 blurFilter = isMobile ? 'blur(30px) saturate(1.8) brightness(1.15)' : 'blur(50px) saturate(1.8) brightness(1.15)';
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
 transform: `scale(${scaleVal})`,
 transformOrigin: 'center',
 opacity: 0.95,
 }}
 />
 );
 })()}

 {/* No film grain, no vignette, no dark scrim to match pure Apple Music liquid style */}
 </div>
 );
}
