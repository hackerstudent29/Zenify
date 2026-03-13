"use client";

import { usePlayerStore, Track } from "@/store/player";
import { Play, Pause, SkipForward } from "lucide-react";
import { getMediaUrl } from "@/lib/utils";
import { useRef, useCallback, useEffect } from "react";
import { useUIStore } from "@/store/ui";
import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { audioEngine } from "@/lib/audio-engine";
import { useIsMobile } from "@/hooks/useIsMobile";

// ─── Spring animation utility ────────────────────────────────────────────────
function springAnimate(
    from: number,
    to: number,
    onUpdate: (val: number) => void,
    onComplete?: () => void,
    stiffness = 220,
    damping = 28
) {
    let pos = from;
    let vel = 0;
    let rafId: number;

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

// ─── Helper: get the full screen player DOM element ──────────────────────────
const getFullPlayer = () => document.getElementById('mobile-fullscreen-player') as HTMLDivElement | null;

export function MobilePlayerBar() {
    const currentTrack = usePlayerStore(s => s.currentTrack);
    const isPlaying = usePlayerStore(s => s.isPlaying);
    const togglePlay = usePlayerStore(s => s.togglePlay);
    const playNext = usePlayerStore(s => s.playNext);
    const currentTime = usePlayerStore(s => s.currentTime);
    const duration = usePlayerStore(s => s.duration);
    const { setFullScreenPlayerOpen, isFullScreenPlayerOpen } = useUIStore();
    const isMobile = useIsMobile(768);

    // Touch drag state
    const barRef = useRef<HTMLDivElement>(null);
    const touchStartY = useRef(0);
    const touchStartTime = useRef(0);
    const touchLastY = useRef(0);
    const isDragging = useRef(false);
    const cancelSpring = useRef<(() => void) | null>(null);

    const screenH = useRef(typeof window !== 'undefined' ? window.innerHeight : 800);
    useEffect(() => {
        screenH.current = window.innerHeight;
    }, []);

    // ── Prep the full player visual during drag ───────────────────────────────
    const applyDragProgress = useCallback((progress: number) => {
        // progress: 0 = mini player, 1 = full player
        const fp = getFullPlayer();
        if (fp) {
            const translateY = screenH.current * (1 - progress);
            fp.style.transform = `translateY(${translateY}px)`;
            fp.style.opacity = String(Math.min(progress * 1.5, 1));
        }
    }, []);

    const openWithSpring = useCallback((fromProgress: number) => {
        const fp = getFullPlayer();
        if (!fp) return;
        cancelSpring.current?.();
        cancelSpring.current = springAnimate(
            fromProgress * screenH.current,
            0,
            (val) => {
                fp.style.transform = `translateY(${val}px)`;
                const p = 1 - (val / screenH.current);
                fp.style.opacity = String(Math.min(p * 1.5, 1));
            },
            () => {
                fp.style.opacity = '1';
                setFullScreenPlayerOpen(true);
            }
        );
    }, [setFullScreenPlayerOpen]);

    const closeWithSpring = useCallback((fromProgress: number) => {
        const fp = getFullPlayer();
        if (!fp) return;
        cancelSpring.current?.();
        cancelSpring.current = springAnimate(
            fromProgress * screenH.current,
            screenH.current,
            (val) => {
                fp.style.transform = `translateY(${val}px)`;
                const p = 1 - (val / screenH.current);
                fp.style.opacity = String(Math.max(0, Math.min(p * 1.5, 1)));
            },
            () => {
                fp.style.opacity = '0';
                fp.style.transform = `translateY(${screenH.current}px)`;
            }
        );
    }, []);

    // ── Mini player touch handlers ─────────────────────────────────────────────
    const onTouchStart = useCallback((e: React.TouchEvent) => {
        if (!isMobile) return;
        const target = e.target as HTMLElement;
        if (target.closest('button')) return; // Don't start drag on buttons

        touchStartY.current = e.touches[0].clientY;
        touchLastY.current = e.touches[0].clientY;
        touchStartTime.current = Date.now();
        isDragging.current = false;
        cancelSpring.current?.();

        // Prepare full player: remove CSS transition so we can control manually
        const fp = getFullPlayer();
        if (fp) {
            fp.style.transition = 'none';
            // Start from bottom
            fp.style.transform = `translateY(${screenH.current}px)`;
            fp.style.opacity = '0';
        }
    }, [isMobile]);

    const onTouchMove = useCallback((e: React.TouchEvent) => {
        if (!isMobile) return;
        const y = e.touches[0].clientY;
        const deltaUp = touchStartY.current - y;
        touchLastY.current = y;

        if (deltaUp < 5) return; // Only upward drags
        isDragging.current = true;

        const progress = Math.min(Math.max(deltaUp / screenH.current, 0), 1);
        applyDragProgress(progress);
    }, [isMobile, applyDragProgress]);

    const onTouchEnd = useCallback((e: React.TouchEvent) => {
        if (!isMobile || !isDragging.current) {
            isDragging.current = false;
            return;
        }
        isDragging.current = false;

        const deltaUp = touchStartY.current - (e.changedTouches[0]?.clientY ?? touchLastY.current);
        const elapsed = Math.max(Date.now() - touchStartTime.current, 1);
        const velocity = deltaUp / elapsed; // px/ms — positive = swiped up fast

        const currentProgress = Math.min(Math.max(deltaUp / screenH.current, 0), 1);
        const shouldOpen = deltaUp > 120 || velocity > 0.4;

        if (shouldOpen) {
            openWithSpring(currentProgress);
        } else {
            closeWithSpring(currentProgress);
        }
    }, [isMobile, openWithSpring, closeWithSpring]);

    // Simple tap to open (when not dragging)
    const onTap = useCallback((e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('button')) return;
        setFullScreenPlayerOpen(true);
    }, [setFullScreenPlayerOpen]);

    const { data: likedTrackIds } = useQuery({
        queryKey: ['liked-track-ids'],
        queryFn: async () => {
            const res = await api.get('/tracks/liked');
            return (res.data as Track[]).map(t => t.id);
        },
        staleTime: 1000 * 60 * 5,
        enabled: !!currentTrack
    });

    if (!currentTrack) return null;

    const progressPct = `${(currentTime / (duration || 1)) * 100}%`;

    return (
        <div
            ref={barRef}
            className="w-full bg-[#1c1c1e]/98 backdrop-blur-3xl border-t border-white/5 pointer-events-auto overflow-hidden relative"
            style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
            onClick={onTap}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
            {/* Progress bar */}
            <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-white/5 z-20">
                <div className="h-full bg-white/40" style={{ width: progressPct }} />
            </div>

            <div className="flex items-center gap-3 px-4 h-[60px]">
                {/* Artwork */}
                <div className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 shadow-2xl ring-1 ring-white/5 pointer-events-none">
                    <img
                        src={getMediaUrl(currentTrack.coverUrl) || "/logo.png"}
                        className="w-full h-full object-cover"
                        alt=""
                        draggable={false}
                        onError={(e) => { (e.target as HTMLImageElement).src = "/logo.png"; }}
                    />
                </div>

                {/* Track info */}
                <div className="flex-1 min-w-0 pointer-events-none">
                    <p className="text-[14px] font-medium text-white/90 truncate leading-tight">{currentTrack.title}</p>
                </div>

                {/* Controls — stop propagation so drag doesn't start */}
                <div
                    className="flex items-center gap-1 z-50"
                    onClick={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                >
                    <button
                        onClick={(e) => { e.stopPropagation(); audioEngine.resume(); togglePlay(); }}
                        className="w-10 h-10 flex items-center justify-center text-white active:scale-90 transition-all"
                    >
                        {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); playNext(true); }}
                        className="w-10 h-10 flex items-center justify-center text-white active:scale-90 transition-all"
                    >
                        <SkipForward size={22} fill="currentColor" />
                    </button>
                </div>
            </div>
        </div>
    );
}
