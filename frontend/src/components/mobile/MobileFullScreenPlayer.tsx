"use client";

import React, { useRef, useCallback, useEffect } from "react";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import {
    Play, Pause, SkipBack, SkipForward,
    Heart, MoreVertical, MessageSquare,
    ListMusic, Sparkles, ChevronDown,
} from "lucide-react";
import { getMediaUrl, cn } from "@/lib/utils";
import * as Slider from "@radix-ui/react-slider";
import { audioEngine } from "@/lib/audio-engine";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useIsMobile } from "@/hooks/useIsMobile";

// ─── Spring animation ──────────────────────────────────────────────────────
function springAnimate(
    from: number, to: number,
    onUpdate: (val: number) => void,
    onComplete?: () => void,
    stiffness = 220, damping = 28
) {
    let pos = from, vel = 0, rafId: number;
    function frame() {
        const force = (to - pos) * stiffness * 0.001;
        vel = (vel + force) * (1 - damping * 0.003);
        pos += vel;
        onUpdate(pos);
        if (Math.abs(to - pos) < 0.5 && Math.abs(vel) < 0.5) {
            onUpdate(to);
            onComplete?.();
            return;
        }
        rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
}

export function MobileFullScreenPlayer() {
    const { isFullScreenPlayerOpen, setFullScreenPlayerOpen, setAudioFxOpen, isQueueOpen, setIsQueueOpen } = useUIStore();
    const currentTrack = usePlayerStore(s => s.currentTrack);
    const isPlaying = usePlayerStore(s => s.isPlaying);
    const togglePlay = usePlayerStore(s => s.togglePlay);
    const playNext = usePlayerStore(s => s.playNext);
    const playPrev = usePlayerStore(s => s.playPrev);
    const currentTime = usePlayerStore(s => s.currentTime);
    const duration = usePlayerStore(s => s.duration);
    const isMobile = useIsMobile(768);

    const queryClient = useQueryClient();
    const { data: likedTrackIds } = useQuery({
        queryKey: ['liked-track-ids'],
        queryFn: async () => {
            const res = await api.get('/tracks/liked');
            if (!Array.isArray(res.data)) return [];
            return (res.data as any[]).map(t => t.id);
        },
        staleTime: 1000 * 60 * 5, enabled: !!currentTrack
    });
    const isLiked = currentTrack ? likedTrackIds?.includes(currentTrack.id) : false;
    const toggleLikeMutation = useMutation({
        mutationFn: async () => { if (currentTrack) await api.post(`/tracks/${currentTrack.id}/like`); },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['liked-track-ids'] })
    });

    const formatTime = (s: number) => {
        if (!s || isNaN(s)) return "0:00";
        return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
    };
    const remaining = (duration || 0) - (currentTime || 0);

    // ── Downward drag to close ─────────────────────────────────────────────
    const containerRef = useRef<HTMLDivElement>(null);
    const touchStartY = useRef(0);
    const touchLastY = useRef(0);
    const touchStartTime = useRef(0);
    const isDragging = useRef(false);
    const cancelSpring = useRef<(() => void) | null>(null);
    const screenH = useRef(typeof window !== 'undefined' ? window.innerHeight : 800);
    useEffect(() => { screenH.current = window.innerHeight; }, []);

    // When open state changes via external control, reset any drag transform
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        el.style.transition = 'none';
        el.style.transform = isFullScreenPlayerOpen ? 'translateY(0)' : `translateY(${screenH.current}px)`;
        el.style.opacity = isFullScreenPlayerOpen ? '1' : '0';
    }, [isFullScreenPlayerOpen]);

    const onTouchStart = useCallback((e: React.TouchEvent) => {
        if (!isMobile) return;
        touchStartY.current = e.touches[0].clientY;
        touchLastY.current = e.touches[0].clientY;
        touchStartTime.current = Date.now();
        isDragging.current = false;
        cancelSpring.current?.();
        const el = containerRef.current;
        if (el) el.style.transition = 'none';
    }, [isMobile]);

    const onTouchMove = useCallback((e: React.TouchEvent) => {
        if (!isMobile) return;
        const y = e.touches[0].clientY;
        const deltaDown = y - touchStartY.current;
        touchLastY.current = y;

        if (deltaDown < 5) return; // Only downward drags
        isDragging.current = true;

        const el = containerRef.current;
        if (el) {
            el.style.transform = `translateY(${deltaDown}px)`;
            const opacity = Math.max(0, 1 - deltaDown / (screenH.current * 0.5));
            el.style.opacity = String(opacity);
        }
    }, [isMobile]);

    const onTouchEnd = useCallback((e: React.TouchEvent) => {
        if (!isMobile || !isDragging.current) {
            isDragging.current = false;
            return;
        }
        isDragging.current = false;

        const deltaDown = (e.changedTouches[0]?.clientY ?? touchLastY.current) - touchStartY.current;
        const elapsed = Math.max(Date.now() - touchStartTime.current, 1);
        const velocity = deltaDown / elapsed; // px/ms — positive = swiped down fast

        const shouldClose = deltaDown > 120 || velocity > 0.4;
        const el = containerRef.current;
        if (!el) return;

        if (shouldClose) {
            cancelSpring.current = springAnimate(
                deltaDown, screenH.current,
                (val) => {
                    el.style.transform = `translateY(${val}px)`;
                    el.style.opacity = String(Math.max(0, 1 - val / (screenH.current * 0.5)));
                },
                () => { setFullScreenPlayerOpen(false); }
            );
        } else {
            // Snap back open
            cancelSpring.current = springAnimate(
                deltaDown, 0,
                (val) => {
                    el.style.transform = `translateY(${val}px)`;
                    el.style.opacity = String(Math.min(1, 1 - val / (screenH.current * 0.5)));
                }
            );
        }
    }, [isMobile, setFullScreenPlayerOpen]);

    if (!currentTrack) return null;

    return (
        <div
            id="mobile-fullscreen-player"
            ref={containerRef}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                backgroundColor: '#111111',
                display: 'flex',
                flexDirection: 'column',
                // Initial state controlled by useEffect above
                transform: isFullScreenPlayerOpen ? 'translateY(0)' : `translateY(${typeof window !== 'undefined' ? window.innerHeight : 800}px)`,
                opacity: isFullScreenPlayerOpen ? 1 : 0,
                willChange: 'transform, opacity',
                overflow: 'hidden',
                touchAction: 'none', // Prevent browser scroll interference
            }}
        >
            {/* Blurred album art background */}
            {currentTrack.coverUrl && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
                    <img src={getMediaUrl(currentTrack.coverUrl) || "/logo.png"} alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(50px) saturate(180%)', transform: 'scale(1.3)', opacity: 0.25 }} />
                </div>
            )}
            <div style={{ position: 'absolute', inset: 0, zIndex: 1, background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.88) 100%)', pointerEvents: 'none' }} />

            {/* Content z-2 — drag handlers on header + artwork only */}
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', flex: 1, paddingTop: 'max(env(safe-area-inset-top), 40px)' }}>

                {/* ── Header (drag zone) ────────────────────────────── */}
                <div
                    className="flex flex-col items-center pb-1 pt-1 cursor-grab active:cursor-grabbing"
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                >
                    <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.25)', marginBottom: 12 }} />
                    <div className="flex items-center justify-between w-full px-5">
                        <button
                            onClick={() => setFullScreenPlayerOpen(false)}
                            className="w-10 h-10 flex items-center justify-center text-white/60 active:text-white"
                        >
                            <ChevronDown size={28} />
                        </button>
                        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40 pointer-events-none">Now Playing</p>
                        <button className="w-10 h-10 flex items-center justify-center text-white/60 active:text-white">
                            <MoreVertical size={22} />
                        </button>
                    </div>
                </div>

                {/* ── Album Art (drag zone) ──────────────────────────── */}
                <div
                    className="flex items-center justify-center px-8 py-4 flex-1"
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                >
                    <div className="w-full aspect-square rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.8)]" style={{ maxWidth: 320 }}>
                        <img
                            src={getMediaUrl(currentTrack.coverUrl) || "/logo.png"}
                            alt={currentTrack.title} className="w-full h-full object-cover"
                            draggable={false}
                            onError={(e) => { (e.target as HTMLImageElement).src = "/logo.png"; }}
                        />
                    </div>
                </div>

                {/* ── Track Info ─────────────────────────────────────── */}
                <div className="px-8 mb-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <h2 className="text-[18px] font-bold text-white truncate leading-tight">{currentTrack.title}</h2>
                            <p className="text-[14px] truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                                {currentTrack.artist?.name || "Unknown Artist"}
                            </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => toggleLikeMutation.mutate()}
                                className={cn("w-10 h-10 flex items-center justify-center active:scale-90 transition-all", isLiked ? "text-brand" : "text-white/50")}>
                                <Heart size={22} className={cn(isLiked && "fill-current")} />
                            </button>
                            <button className="w-10 h-10 flex items-center justify-center text-white/50 active:text-white">
                                <MoreVertical size={22} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── Progress Bar ───────────────────────────────────── */}
                <div className="px-8 mb-4">
                    <Slider.Root className="relative flex items-center select-none touch-none w-full h-5 cursor-pointer"
                        value={[currentTime || 0]} max={duration || 100} step={0.5}
                        onValueChange={(val) => {
                            const audio = audioEngine.getActiveAudioElement();
                            if (audio) audio.currentTime = val[0];
                            usePlayerStore.getState().setCurrentTime(val[0]);
                        }}>
                        <Slider.Track className="relative grow rounded-full h-[3px]" style={{ background: 'rgba(255,255,255,0.2)' }}>
                            <Slider.Range className="absolute rounded-full h-full" style={{ background: 'white' }} />
                        </Slider.Track>
                        <Slider.Thumb className="block w-3 h-3 bg-white rounded-full shadow-md focus:outline-none" />
                    </Slider.Root>
                    <div className="flex justify-between mt-1.5 tabular-nums" style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                        <span>{formatTime(currentTime)}</span>
                        <span>-{formatTime(remaining > 0 ? remaining : 0)}</span>
                    </div>
                </div>

                {/* ── Playback Controls ──────────────────────────────── */}
                <div className="flex items-center justify-between px-10 mb-6">
                    <button onClick={() => playPrev()} className="p-3 text-white active:opacity-50 transition-opacity">
                        <SkipBack size={32} fill="currentColor" strokeWidth={0} />
                    </button>
                    <button onClick={() => { audioEngine.resume(); togglePlay(); }}
                        className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-black active:scale-95 transition-transform shadow-2xl">
                        {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
                    </button>
                    <button onClick={() => playNext(true)} className="p-3 text-white active:opacity-50 transition-opacity">
                        <SkipForward size={32} fill="currentColor" strokeWidth={0} />
                    </button>
                </div>

                {/* ── Footer ────────────────────────────────────────── */}
                <div className="flex items-center justify-around px-8 border-t"
                    style={{ borderColor: 'rgba(255,255,255,0.1)', paddingTop: 16, paddingBottom: `calc(max(env(safe-area-inset-bottom), 16px) + 16px)` }}>
                    <button onClick={() => setAudioFxOpen(true)} className="flex flex-col items-center gap-1.5 transition-colors active:text-brand"
                        style={{ color: 'rgba(255,255,255,0.4)' }}>
                        <Sparkles size={22} />
                        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase' }}>FX</span>
                    </button>
                    <button className="flex flex-col items-center gap-1.5 transition-colors"
                        style={{ color: 'rgba(255,255,255,0.4)' }}>
                        <MessageSquare size={22} />
                        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Lyrics</span>
                    </button>
                    <button onClick={() => setIsQueueOpen(!isQueueOpen)}
                        className={cn("flex flex-col items-center gap-1.5 transition-colors", isQueueOpen ? "text-brand" : "")}
                        style={!isQueueOpen ? { color: 'rgba(255,255,255,0.4)' } : {}}>
                        <ListMusic size={22} />
                        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Queue</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
