import { useState, useEffect, useRef } from 'react';
import { getMediaUrl, getApiBaseUrl } from '@/lib/utils';

/**
 * Quantize colors from canvas pixel data using a bucket approach.
 * Returns the most dominant colors sorted by frequency.
 */
function extractDominantColors(imageData: ImageData, maxColors: number = 3): [number, number, number][] {
 const pixels: [number, number, number][] = [];
 const data = imageData.data;

 // Sample every 4th pixel for performance
 for (let i = 0; i < data.length; i += 16) {
 const r = data[i];
 const g = data[i + 1];
 const b = data[i + 2];
 const a = data[i + 3];

 // Skip transparent pixels only — keep ALL colors including dark ones
 if (a < 128) continue;
 
 // Skip pure white (not interesting for background)
 const brightness = (r + g + b) / 3;
 if (brightness > 250) continue;

 pixels.push([r, g, b]);
 }

 if (pixels.length === 0) {
 return [[80, 50, 90], [60, 80, 120], [120, 60, 70], [70, 60, 100]];
 }

 // Quantize using a bucket approach
 const bucketSize = 32;
 const buckets = new Map<string, { sum: [number, number, number]; count: number }>();

 for (const [r, g, b] of pixels) {
 const kr = Math.floor(r / bucketSize);
 const kg = Math.floor(g / bucketSize);
 const kb = Math.floor(b / bucketSize);
 const key = `${kr},${kg},${kb}`;

 const existing = buckets.get(key);
 if (existing) {
 existing.sum[0] += r;
 existing.sum[1] += g;
 existing.sum[2] += b;
 existing.count++;
 } else {
 buckets.set(key, { sum: [r, g, b], count: 1 });
 }
 }

 // Sort buckets by count (most dominant first)
 const sorted = Array.from(buckets.values())
 .sort((a, b) => b.count - a.count);

 // Diversity-aware selection: each new color must be visually distinct
 // from all previously selected colors. This prevents picking 4 shades
 // of the same color when one hue dominates the image (e.g., teal border).
 const MIN_COLOR_DISTANCE = 60; // Euclidean distance in RGB space
 
 const colorDistance = (
 a: [number, number, number],
 b: [number, number, number]
 ): number => {
 const dr = a[0] - b[0];
 const dg = a[1] - b[1];
 const db = a[2] - b[2];
 return Math.sqrt(dr * dr + dg * dg + db * db);
 };

 const result: [number, number, number][] = [];

 for (const bucket of sorted) {
 if (result.length >= maxColors) break;

 const candidate: [number, number, number] = [
 Math.round(bucket.sum[0] / bucket.count),
 Math.round(bucket.sum[1] / bucket.count),
 Math.round(bucket.sum[2] / bucket.count)
 ];

 // Check if this color is sufficiently different from all already-picked colors
 const isTooSimilar = result.some(
 existing => colorDistance(existing, candidate) < MIN_COLOR_DISTANCE
 );

 if (!isTooSimilar) {
 result.push(candidate);
 }
 }

 // If we couldn't find enough diverse colors, relax the constraint
 if (result.length < 2) {
 for (const bucket of sorted) {
 if (result.length >= maxColors) break;
 const candidate: [number, number, number] = [
 Math.round(bucket.sum[0] / bucket.count),
 Math.round(bucket.sum[1] / bucket.count),
 Math.round(bucket.sum[2] / bucket.count)
 ];
 const isTooSimilar = result.some(
 existing => colorDistance(existing, candidate) < 30
 );
 if (!isTooSimilar) {
 result.push(candidate);
 }
 }
 }

 return result;
}

// In-memory cache
const colorCache = new Map<string, string[]>();

export function useAlbumColor(coverUrl: string | undefined, dbPalette?: any) {
 const [colors, setColors] = useState<string[]>([
 'rgb(40, 30, 60)',
 'rgb(60, 40, 80)',
 'rgb(30, 45, 70)',
 ]);
 const extractingRef = useRef(false);

 useEffect(() => {
 if (!coverUrl) return;

 // Check cache first
 const cacheKey = coverUrl;
 const cached = colorCache.get(cacheKey);
 if (cached) {
 setColors(cached);
 return;
 }

 // Prevent duplicate extractions
 if (extractingRef.current) return;
 extractingRef.current = true;

 // Build the image URL
 let targetUrl = coverUrl;
 if (!targetUrl.startsWith('http') && !targetUrl.startsWith('blob') && !targetUrl.startsWith('data')) {
 targetUrl = getMediaUrl(coverUrl) || targetUrl;
 }

 // For external URLs, use the proxy-image endpoint to bypass CORS
 const API_BASE = getApiBaseUrl();
 let imgSrc = targetUrl;
 if (targetUrl.startsWith('http') && !targetUrl.includes('proxy-image')) {
 imgSrc = `${API_BASE}/utils/proxy-image?url=${encodeURIComponent(targetUrl)}`;
 }

 const img = new Image();
 img.crossOrigin = 'Anonymous';

 img.onload = () => {
 try {
 const canvas = document.createElement('canvas');
 const size = 64;
 canvas.width = size;
 canvas.height = size;
 const ctx = canvas.getContext('2d');
 if (!ctx) {
 extractingRef.current = false;
 return;
 }

 ctx.drawImage(img, 0, 0, size, size);
 const imageData = ctx.getImageData(0, 0, size, size);

 // Extract 3 dominant colors (original brightness)
 const dominant = extractDominantColors(imageData, 3);

 const rgbStrings = dominant.map(([r, g, b]) => `rgb(${r},${g},${b})`);

 // Pad to 3 if needed
 while (rgbStrings.length < 3) {
 rgbStrings.push(rgbStrings[rgbStrings.length - 1] || 'rgb(60,50,80)');
 }

 const final = rgbStrings.slice(0, 3);
 colorCache.set(cacheKey, final);
 setColors(final);
 } catch (err) {
 console.error('Color extraction failed:', err);
 } finally {
 extractingRef.current = false;
 }
 };

 img.onerror = () => {
 console.warn('Image load failed for color extraction:', imgSrc);
 extractingRef.current = false;
 };

 img.src = imgSrc;

 return () => {
 extractingRef.current = false;
 };
 }, [coverUrl]);

 return colors;
}
