"use client";

import { motion, AnimatePresence, useMotionValue, animate } from "framer-motion";
import { useUIStore } from "@/store/ui";
import { X } from "lucide-react";
import { AudioFxMenu } from "./audio-fx-menu";
import { useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useAuthStore } from "@/store/authStore";

export function AudioFxModal() {
    const { isAudioFxOpen, setAudioFxOpen } = useUIStore();
    const isMobile = useIsMobile();
    const { user } = useAuthStore();
    const isGlassmorphism = user?.preferences?.globalPlayerStyle === "glassmorphism";

    // ── Scroll lock ──────────────────────────────────────────────────────
    useEffect(() => {
        document.body.style.overflow = isAudioFxOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [isAudioFxOpen]);

    // ── Native touch drag for mobile bottom sheet ─────────────────────────
    // We use raw touch events so EQ vertical sliders are NEVER intercepted.
    const sheetRef = useRef<HTMLDivElement>(null);
    const dragY = useMotionValue(0);
    const startY = useRef(0);
    const isDraggingSheet = useRef(false);
    const touchTarget = useRef<EventTarget | null>(null);

    const isSliderThumb = (el: Element | null): boolean => {
        if (!el) return false;
        // Radix slider thumb or track
        if (el.getAttribute('role') === 'slider') return true;
        if (el.getAttribute('data-radix-slider-thumb') !== null) return true;
        if (el.closest('[data-radix-slider-root]')) return true;
        return false;
    };

    const onTouchStart = useCallback((e: React.TouchEvent) => {
        touchTarget.current = e.target;
        // If touch started on a slider, let it through — don't capture
        if (isSliderThumb(e.target as Element)) {
            isDraggingSheet.current = false;
            return;
        }
        startY.current = e.touches[0].clientY;
        isDraggingSheet.current = false;
    }, []);

    const onTouchMove = useCallback((e: React.TouchEvent) => {
        if (isSliderThumb(touchTarget.current as Element)) return;
        const dy = e.touches[0].clientY - startY.current;
        if (!isDraggingSheet.current && dy > 6) {
            isDraggingSheet.current = true;
        }
        if (isDraggingSheet.current && dy > 0) {
            dragY.set(dy);
        }
    }, [dragY]);

    const onTouchEnd = useCallback((e: React.TouchEvent) => {
        if (!isDraggingSheet.current) { dragY.set(0); return; }
        const dy = dragY.get();
        if (dy > 80) {
            setAudioFxOpen(false);
        } else {
            animate(dragY, 0, { type: 'spring', stiffness: 400, damping: 36 });
        }
        isDraggingSheet.current = false;
    }, [dragY, setAudioFxOpen]);

    return (
        <AnimatePresence>
            {isAudioFxOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        key="fx-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        onClick={() => setAudioFxOpen(false)}
                        className="fixed inset-0 z-[1000] bg-black/50"
                    />

                    {/* Sheet / Popover */}
                    <div className={cn(
                        "fixed z-[1500] pointer-events-none",
                        isMobile
                            ? "bottom-0 left-0 right-0"
                            : "bottom-[44px] right-6 w-[340px]"
                    )}>
                        <motion.div
                            key="fx-sheet"
                            ref={sheetRef}
                            style={isMobile ? { y: dragY } : {}}
                            // Mobile: slide up from bottom with bouncy spring
                            initial={isMobile
                                ? { y: "100%" }
                                : { opacity: 0, y: 16, scale: 0.96 }
                            }
                            animate={isMobile
                                ? { y: 0 }
                                : { opacity: 1, y: 0, scale: 1 }
                            }
                            exit={isMobile
                                ? { y: "100%", transition: { type: "tween", duration: 0.22, ease: [0.4, 0, 1, 1] } }
                                : { opacity: 0, y: 12, scale: 0.96, transition: { duration: 0.18 } }
                            }
                            transition={isMobile
                                ? { type: "spring", stiffness: 420, damping: 40, mass: 0.9 }
                                : { type: "spring", stiffness: 380, damping: 32 }
                            }
                            className={cn(
                                "relative border-white/[0.08] shadow-[0_-8px_60px_rgba(0,0,0,0.7)] pointer-events-auto overflow-hidden",
                                isGlassmorphism
                                    ? "bg-black/60 backdrop-blur-[32px]"
                                    : "bg-[#101012]",
                                isMobile
                                    ? "border-t rounded-t-[28px]"
                                    : "border rounded-[20px]"
                            )}
                            // NO framer drag — we use raw touch events to avoid conflicting with sliders
                            onTouchStart={isMobile ? onTouchStart : undefined}
                            onTouchMove={isMobile ? onTouchMove : undefined}
                            onTouchEnd={isMobile ? onTouchEnd : undefined}
                        >
                            {/* Mobile drag pill */}
                            {isMobile && (
                                <div className="flex justify-center pt-3 pb-1">
                                    <div className="w-9 h-[3.5px] rounded-full bg-white/20" />
                                </div>
                            )}

                            {/* Header */}
                            <div className="flex items-center justify-between px-5 pt-4 pb-2">
                                <div>
                                    <h2 className="text-xs font-black uppercase tracking-[0.22em] text-brand">Studio FX</h2>
                                    <p className="text-[9px] font-semibold text-white/30 tracking-wide mt-0.5">Audio Engine v4</p>
                                </div>
                                <button
                                    onClick={() => setAudioFxOpen(false)}
                                    className="w-8 h-8 rounded-full bg-white/5 border border-white/[0.07] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all active:scale-90"
                                >
                                    <X size={15} />
                                </button>
                            </div>

                            {/* Scrollable FX content */}
                            <div
                                className="px-5 pb-6 overflow-y-auto overscroll-contain"
                                style={{
                                    maxHeight: isMobile ? '72vh' : '60vh',
                                    // Prevent scroll from bubbling to the sheet drag
                                    touchAction: 'pan-y',
                                }}
                            >
                                <AudioFxMenu className="space-y-7 pt-2" />
                            </div>

                            {/* Status bar */}
                            <div className="px-5 py-2.5 bg-white/[0.025] border-t border-white/[0.06] flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-1 h-1 rounded-full bg-brand animate-pulse" />
                                    <span className="text-[8px] font-black uppercase tracking-widest text-white/25">32-Bit Float</span>
                                </div>
                                <span className="text-[8px] font-bold text-white/15">ZENIFY ENGINE</span>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}
