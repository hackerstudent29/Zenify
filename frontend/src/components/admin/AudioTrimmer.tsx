"use client";

import { useRef, useState, useEffect, useCallback, memo } from "react";
import { Play, Pause, RotateCcw, Check, Scissors, Loader2, ZoomIn, ZoomOut } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface TrimState {
 start: number; // seconds
 end: number; // seconds
}

interface AudioTrimmerProps {
 audioFile: File;
 audioUrl: string;
 initialTrim?: TrimState;
 onApply: (trimmedFile: File, trimmedUrl: string, state: TrimState) => void;
 onReset: () => void;
}

// ─── WAV encoder ──────────────────────────────────────────────────────────────
function encodeWAV(buf: AudioBuffer): Blob {
 const numCh = Math.min(buf.numberOfChannels, 2);
 const sr = buf.sampleRate;
 const n = buf.length;
 const blockAlign = numCh * 2;
 const dataBytes = n * blockAlign;
 const ab = new ArrayBuffer(44 + dataBytes);
 const v = new DataView(ab);
 const ws = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
 ws(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true);
 ws(8, 'WAVE');
 ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
 v.setUint16(22, numCh, true); v.setUint32(24, sr, true);
 v.setUint32(28, sr * blockAlign, true); v.setUint16(32, blockAlign, true); v.setUint16(34, 16, true);
 ws(36, 'data'); v.setUint32(40, dataBytes, true);
 let off = 44;
 for (let i = 0; i < n; i++) {
 for (let ch = 0; ch < numCh; ch++) {
 const s = Math.max(-1, Math.min(1, buf.getChannelData(ch)[i] ?? 0));
 v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
 off += 2;
 }
 }
 return new Blob([ab], { type: 'audio/wav' });
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmt(sec: number): string {
 if (!isFinite(sec) || sec < 0) sec = 0;
 const m = Math.floor(sec / 60);
 const s = Math.floor(sec % 60);
 return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export const AudioTrimmer = memo(function AudioTrimmer({
 audioFile, audioUrl, initialTrim, onApply, onReset,
}: AudioTrimmerProps) {
 const canvasRef = useRef<HTMLCanvasElement>(null);
 const containerRef = useRef<HTMLDivElement>(null);
 const peaksRef = useRef<Float32Array | null>(null);
 const audioBufferRef = useRef<AudioBuffer | null>(null);
 const previewRef = useRef<HTMLAudioElement | null>(null);
 const animRef = useRef<number | null>(null);
 const draggingRef = useRef<'start' | 'end' | null>(null);

 const [isDecoding, setIsDecoding] = useState(false);
 const [isApplying, setIsApplying] = useState(false);
 const [isPreviewing, setIsPreviewing] = useState(false);
 const [totalDur, setTotalDur] = useState(0);
 const [trimStart, setTrimStart] = useState(0);
 const [trimEnd, setTrimEnd] = useState(0);
 const [playhead, setPlayhead] = useState(0);

 // Zoom state
 const [zoom, setZoom] = useState(1);
 const [scrollOffset, setScrollOffset] = useState(0); // 0 to 1

 // ── Decode waveform when file changes ──────────────────────────────────────
 useEffect(() => {
 let cancelled = false;
 setIsDecoding(true);
 setPlayhead(0);
 setZoom(1);
 setScrollOffset(0);

 (async () => {
 try {
 const arrayBuffer = await audioFile.arrayBuffer();
 const ctx = new AudioContext();
 const decoded = await ctx.decodeAudioData(arrayBuffer);
 await ctx.close();
 if (cancelled) return;

 audioBufferRef.current = decoded;
 const dur = decoded.duration;
 setTotalDur(dur);
 setTrimStart(initialTrim?.start ?? 0);
 setTrimEnd(initialTrim?.end ?? dur);

 // Build normalised peak array (1200 points for extra detail when zoomed)
 const ch = decoded.getChannelData(0);
 const N = 1200;
 const step = Math.max(1, Math.floor(ch.length / N));
 const peaks = new Float32Array(N);
 let maxPeak = 0;
 for (let i = 0; i < N; i++) {
 let p = 0;
 for (let j = 0; j < step; j++) {
 const a = Math.abs(ch[i * step + j] ?? 0);
 if (a > p) p = a;
 }
 peaks[i] = p;
 if (p > maxPeak) maxPeak = p;
 }
 if (maxPeak > 0) for (let i = 0; i < N; i++) peaks[i] /= maxPeak;
 peaksRef.current = peaks;
 } catch (e) {
 console.error('Audio decode error', e);
 } finally {
 if (!cancelled) setIsDecoding(false);
 }
 })();

 return () => { cancelled = true; };
 }, [audioFile]);

 // ── Draw waveform ──────────────────────────────────────────────────────────
 const draw = useCallback(() => {
 const canvas = canvasRef.current;
 const peaks = peaksRef.current;
 const cont = containerRef.current;
 if (!canvas || !peaks || !cont || totalDur === 0) return;

 const dpr = window.devicePixelRatio || 1;
 const W = cont.clientWidth;
 const H = cont.clientHeight;
 canvas.width = W * dpr;
 canvas.height = H * dpr;
 canvas.style.width = W + 'px';
 canvas.style.height = H + 'px';

 const ctx = canvas.getContext('2d')!;
 ctx.scale(dpr, dpr);
 ctx.clearRect(0, 0, W, H);

 // Zoom calculations
 const zoomedWidth = W * zoom;
 const maxScroll = Math.max(0, zoomedWidth - W);
 const scrollPx = scrollOffset * maxScroll;

 const timeToPx = (t: number) => (t / totalDur) * zoomedWidth - scrollPx;

 const startPx = timeToPx(trimStart);
 const endPx = timeToPx(trimEnd);
 const playPx = timeToPx(playhead);

 const barW = zoomedWidth / peaks.length;

 for (let i = 0; i < peaks.length; i++) {
 const cx = i * barW - scrollPx + barW / 2;
 if (cx < -barW || cx > W + barW) continue; // Culling

 const bh = Math.max(2, peaks[i] * H * 0.88);
 const y = (H - bh) / 2;
 const inTrim = (i * barW) >= (trimStart / totalDur) * zoomedWidth &&
 ((i + 1) * barW) <= (trimEnd / totalDur) * zoomedWidth;

 if (inTrim) {
 ctx.fillStyle = (i * barW) <= (playhead / totalDur) * zoomedWidth
 ? 'rgba(251,113,133,1)'
 : 'rgba(var(--accent-brand-rgb),0.75)';
 } else {
 ctx.fillStyle = 'rgba(255,255,255,0.09)';
 }
 ctx.fillRect(i * barW - scrollPx, y, Math.max(1, barW - 0.8), bh);
 }

 // Overlay for selection
 ctx.fillStyle = 'rgba(var(--accent-brand-rgb),0.05)';
 ctx.fillRect(Math.max(0, startPx), 0, Math.min(W, endPx) - Math.max(0, startPx), H);

 // Playhead
 if (isPreviewing && playPx >= 0 && playPx <= W) {
 ctx.strokeStyle = 'rgba(255,255,255,0.9)';
 ctx.lineWidth = 1.5;
 ctx.beginPath();
 ctx.moveTo(playPx, 0);
 ctx.lineTo(playPx, H);
 ctx.stroke();
 }
 }, [trimStart, trimEnd, totalDur, playhead, isPreviewing, zoom, scrollOffset]);

 useEffect(() => {
 if (isDecoding) return;
 const id = requestAnimationFrame(() => draw());
 return () => cancelAnimationFrame(id);
 }, [draw, isDecoding]);

 // ── Zoom & Scroll ─────────────────────────────────────────────────────────
 const handleWheel = useCallback((e: React.WheelEvent | WheelEvent) => {
 const cont = containerRef.current;
 if (!cont) return;

 // Only prevent default if we're actually zooming/panning
 e.preventDefault();

 // Check if shift is held (macOS horizontal scroll) or trackpad horizontal pan
 if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
 // Horizontal scroll
 const zoomedWidth = cont.clientWidth * zoom;
 const maxScroll = Math.max(0, zoomedWidth - cont.clientWidth);
 if (maxScroll === 0) return;

 // Adjust sensitivity
 const delta = ((e.deltaX || Number(e.deltaY)) * 1.5) / maxScroll;
 setScrollOffset(s => Math.max(0, Math.min(1, s + delta)));
 } else {
 // Vertical scroll = Zoom
 const rect = cont.getBoundingClientRect();
 // Need mouse coordinates relative to container
 let mouseX = 0;
 if ('clientX' in e) {
 mouseX = e.clientX - rect.left;
 }

 // Calculate time at mouse position before zoom
 const zoomedWidthPre = rect.width * zoom;
 const maxScrollPre = Math.max(0, zoomedWidthPre - rect.width);
 const timeAtMouse = ((mouseX + scrollOffset * maxScrollPre) / zoomedWidthPre) * totalDur;

 // Zoom sensitivity
 const zoomDelta = -e.deltaY * 0.003;
 const newZoom = Math.max(1, Math.min(15, zoom + zoomDelta));

 if (newZoom !== zoom) {
 setZoom(newZoom);

 // Adjust scroll so timeAtMouse stays under mouse
 const zoomedWidthPost = rect.width * newZoom;
 const maxScrollPost = Math.max(0, zoomedWidthPost - rect.width);
 if (maxScrollPost > 0 && totalDur > 0) {
 const newScrollPos = (timeAtMouse / totalDur) * zoomedWidthPost - mouseX;
 setScrollOffset(Math.max(0, Math.min(1, newScrollPos / maxScrollPost)));
 } else {
 setScrollOffset(0);
 }
 }
 }
 }, [zoom, scrollOffset, totalDur]);

 // Attach passive=false wheel listener so we can preventDefault
 useEffect(() => {
 const el = containerRef.current;
 if (!el) return;

 const onWheel = (e: WheelEvent) => {
 // Only capture if it's over the canvas/container area
 handleWheel(e);
 };

 el.addEventListener('wheel', onWheel, { passive: false });
 return () => el.removeEventListener('wheel', onWheel);
 }, [handleWheel]);

 // ── Pointer drag ───────────────────────────────────────────────────────────
 const pxToTime = (clientX: number) => {
 const r = containerRef.current?.getBoundingClientRect();
 if (!r || totalDur === 0) return 0;
 const zoomedWidth = r.width * zoom;
 const maxScroll = Math.max(0, zoomedWidth - r.width);
 const mouseX = clientX - r.left;
 return ((mouseX + scrollOffset * maxScroll) / zoomedWidth) * totalDur;
 };

 const onPointerDown = (e: React.PointerEvent, handle: 'start' | 'end') => {
 e.preventDefault();
 draggingRef.current = handle;
 (e.target as HTMLElement).setPointerCapture(e.pointerId);
 };

 const onPointerMove = (e: React.PointerEvent) => {
 if (!draggingRef.current) return;
 const t = pxToTime(e.clientX);

 if (draggingRef.current === 'start') {
 const newStart = Math.max(0, Math.min(t, trimEnd - 0.1));
 setTrimStart(newStart);

 // Auto play if not playing, or sync if playing
 if (!isPreviewing) {
 handlePreview(newStart);
 } else if (previewRef.current) {
 previewRef.current.currentTime = newStart;
 setPlayhead(newStart);
 }
 } else {
 const newEnd = Math.min(totalDur, Math.max(t, trimStart + 0.1));
 setTrimEnd(newEnd);

 // Allow dragging end handle to also update preview conditionally
 if (!isPreviewing) {
 // Start preview slightly before the end handle so they can hear what they are cutting
 handlePreview(Math.max(trimStart, newEnd - 1));
 } else if (previewRef.current) {
 // Keep playhead within the new bounds
 if (previewRef.current.currentTime > newEnd) {
 previewRef.current.currentTime = Math.max(trimStart, newEnd - 1);
 }
 }
 }
 };

 const onPointerUp = () => {
 draggingRef.current = null;
 // Stop previewing when they let go of the handle so it doesn't just keep playing
 if (isPreviewing) {
 stopPreview();
 }
 };

 // ── Preview ────────────────────────────────────────────────────────────────
 const stopPreview = useCallback(() => {
 if (previewRef.current) {
 previewRef.current.pause();
 previewRef.current = null;
 }
 if (animRef.current) cancelAnimationFrame(animRef.current);
 setIsPreviewing(false);
 setPlayhead(trimStart);
 }, [trimStart]);

 useEffect(() => () => { stopPreview(); }, [stopPreview]);

 const handlePreview = (forcedStartTime?: number) => {
 if (isPreviewing && forcedStartTime === undefined) { stopPreview(); return; }
 // If we are already playing and just want to seek, do that instead of re-instantiating
 if (isPreviewing && previewRef.current && forcedStartTime !== undefined) {
 previewRef.current.currentTime = forcedStartTime;
 return;
 }

 const exactStart = forcedStartTime !== undefined ? forcedStartTime : trimStart;

 const audio = new Audio(audioUrl);
 audio.currentTime = exactStart;
 previewRef.current = audio;
 setIsPreviewing(true);
 setPlayhead(exactStart);

 const tick = () => {
 if (!previewRef.current) return;
 const cur = previewRef.current.currentTime;
 setPlayhead(cur);

 // Re-grab latest state because closure might be stale
 setTrimEnd(currentTrimEnd => {
 if (cur >= currentTrimEnd) {
 stopPreview();
 } else {
 animRef.current = requestAnimationFrame(tick);
 }
 return currentTrimEnd;
 });
 };

 audio.addEventListener('play', () => { animRef.current = requestAnimationFrame(tick); });
 audio.addEventListener('ended', stopPreview);
 audio.play().catch(() => setIsPreviewing(false));
 };

 const handleResetHandles = () => {
 stopPreview();
 setTrimStart(0);
 setTrimEnd(totalDur);
 setPlayhead(0);
 setZoom(1);
 setScrollOffset(0);
 };

 const handleApply = async () => {
 const srcBuf = audioBufferRef.current;
 if (!srcBuf || isApplying) return;
 stopPreview();
 setIsApplying(true);

 try {
 const sr = srcBuf.sampleRate;
 const startSample = Math.floor(trimStart * sr);
 const endSample = Math.floor(trimEnd * sr);
 const length = endSample - startSample;
 if (length <= 0) return;

 const offline = new OfflineAudioContext(srcBuf.numberOfChannels, length, sr);
 const src = offline.createBufferSource();
 src.buffer = srcBuf;
 src.connect(offline.destination);
 src.start(0, trimStart, trimEnd - trimStart);

 const trimmed = await offline.startRendering();
 const wavBlob = encodeWAV(trimmed);
 const base = audioFile.name.replace(/\.[^.]+$/, '');
 const trimFile = new File([wavBlob], `${base}-trimmed.wav`, { type: 'audio/wav' });
 const trimUrl = URL.createObjectURL(wavBlob);

 onApply(trimFile, trimUrl, { start: trimStart, end: trimEnd });
 } catch (err) {
 console.error('Trim failed', err);
 } finally {
 setIsApplying(false);
 }
 };

 const trimmedDur = trimEnd - trimStart;

 // Convert time to percentage for handle positioning
 const timeToPct = (t: number) => {
 const zoomedWidth = 100 * zoom;
 const maxScrollPct = Math.max(0, zoomedWidth - 100);
 return (t / totalDur) * zoomedWidth - scrollOffset * maxScrollPct;
 };

 const rawStartPct = timeToPct(trimStart);
 const rawEndPct = timeToPct(trimEnd);

 // Clamp visually so handles never disappear outside the viewport
 const startPct = Math.max(0, Math.min(100, rawStartPct));
 const endPct = Math.max(0, Math.min(100, rawEndPct));

 return (
 <div className="mt-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] overflow-hidden">
 <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05]">
 <div className="flex items-center gap-2.5">
 <div className="w-6 h-6 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center">
 <Scissors size={11} className="text-brand" />
 </div>
 <span className="text-[10px] font-bold text-white uppercase tracking-widest">Trim Audio</span>
 </div>
 <div className="flex items-center gap-3">
 <div className="flex items-center gap-1.5 mr-2">
 <button onClick={() => setZoom(z => Math.max(1, z / 1.5))} className="p-1 text-white/20 hover:text-white transition-colors"><ZoomOut size={12} /></button>
 <div className="w-12 h-1 bg-white/5 rounded-full overflow-hidden">
 <div className="h-full bg-brand/40" style={{ width: `${(zoom - 1) / 14 * 100}%` }} />
 </div>
 <button onClick={() => setZoom(z => Math.min(15, z * 1.5))} className="p-1 text-white/20 hover:text-white transition-colors"><ZoomIn size={12} /></button>
 </div>
 <span className="text-[9px] text-white/30 font-medium tabular-nums">{fmt(trimStart)} – {fmt(trimEnd)}</span>
 <span className="text-[9px] font-black text-brand bg-brand/10 border border-brand/20 px-1.5 py-0.5 rounded-full tabular-nums">
 {fmt(trimmedDur)}
 </span>
 </div>
 </div>

 <div className="px-4 pt-4 pb-2">
 {isDecoding ? (
 <div className="h-16 flex items-center justify-center gap-2 text-white/20">
 <Loader2 size={13} className="animate-spin" />
 <span className="text-[9px] font-bold uppercase tracking-widest">Analysing…</span>
 </div>
 ) : (
 <div
 ref={containerRef}
 className="relative h-16 rounded-lg overflow-hidden select-none cursor-crosshair"
 style={{ touchAction: 'none' }}
 onPointerMove={onPointerMove}
 onPointerUp={onPointerUp}
 onPointerLeave={onPointerUp}
 title="Scroll to zoom, Drag to pan or trim"
 >
 <canvas ref={canvasRef} className="absolute inset-0" />

 {/* Handles (clamped to viewport) */}
 <div
 className="absolute inset-y-0 w-5 flex items-center justify-center cursor-ew-resize touch-none z-10"
 style={{ left: `calc(${startPct}% - 10px)` }}
 onPointerDown={(e) => onPointerDown(e, 'start')}
 >
 <div className="absolute left-1/2 inset-y-0 w-[2.5px] -translate-x-1/2 bg-white shadow-[0_0_10px_rgba(var(--accent-brand-rgb),0.5)]" />
 <div className="relative z-10 w-4 h-7 rounded bg-white shadow-xl flex items-center justify-center gap-[2.5px]">
 <div className="w-[1.2px] h-3 bg-zinc-300 rounded-full" />
 <div className="w-[1.2px] h-3 bg-zinc-300 rounded-full" />
 </div>
 </div>

 <div
 className="absolute inset-y-0 w-5 flex items-center justify-center cursor-ew-resize touch-none z-10"
 style={{ left: `calc(${endPct}% - 10px)` }}
 onPointerDown={(e) => onPointerDown(e, 'end')}
 >
 <div className="absolute left-1/2 inset-y-0 w-[2.5px] -translate-x-1/2 bg-white shadow-[0_0_10px_rgba(var(--accent-brand-rgb),0.5)]" />
 <div className="relative z-10 w-4 h-7 rounded bg-white shadow-xl flex items-center justify-center gap-[2.5px]">
 <div className="w-[1.2px] h-3 bg-zinc-300 rounded-full" />
 <div className="w-[1.2px] h-3 bg-zinc-300 rounded-full" />
 </div>
 </div>
 </div>
 )}

 {!isDecoding && zoom > 1 && (
 <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden relative">
 <div
 className="h-full bg-brand/20 absolute transition-all duration-75"
 style={{
 width: `${(1 / zoom) * 100}%`,
 left: `${scrollOffset * (1 - 1 / zoom) * 100}%`
 }}
 />
 </div>
 )}
 </div>

 {!isDecoding && (
 <div className="flex items-center gap-2 px-4 pb-3 pt-1">
 <button
 onClick={() => handlePreview()}
 className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 text-[9px] font-bold uppercase tracking-widest transition-colors"
 >
 {isPreviewing ? <Pause size={10} /> : <Play size={10} />}
 {isPreviewing ? 'Stop' : 'Preview'}
 </button>
 <button
 onClick={handleResetHandles}
 className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white/30 hover:text-white hover:bg-white/10 text-[9px] font-bold uppercase tracking-widest transition-colors"
 >
 <RotateCcw size={10} />
 Reset
 </button>
 <button
 onClick={onReset}
 className="ml-2 text-[9px] font-bold text-white/20 hover:text-white/40 uppercase tracking-widest transition-colors"
 >
 Restore original
 </button>
 <div className="flex-1" />
 <button
 onClick={handleApply}
 disabled={isApplying}
 className="flex items-center gap-1.5 px-6 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-900 disabled:opacity-40 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-[0.97] shadow-lg shadow-brand/20"
 >
 {isApplying ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
 {isApplying ? 'Trimming…' : 'Apply Trim'}
 </button>
 </div>
 )}
 </div>
 );
});
