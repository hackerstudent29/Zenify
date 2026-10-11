"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Compass,
  Library,
  HardDrive,
  User,
  Disc,
  Music2,
  ScrollText,
  ArrowRight,
  ArrowLeft,
  X,
  Check
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import api from "@/lib/api";

interface TourStep {
  targetSelector?: string;
  title: string;
  subtitle: string;
  description: string;
  actionHint: string;
  icon: React.ElementType;
  badge: string;
  preferredPlacement?: 'right' | 'bottom' | 'top' | 'center';
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to Zenify",
    subtitle: "High-Fidelity Audio Sanctuary",
    description: "Welcome! Zenify is engineered for pure studio-grade music playback, word-by-word synced liquid lyrics, and offline vaults. Let's take a quick interactive tour to show you where everything is.",
    actionHint: "Click 'Start Tour' or Next to begin the interactive walkthrough.",
    icon: Sparkles,
    badge: "Welcome",
    preferredPlacement: "center",
  },
  {
    targetSelector: "#tour-sidebar",
    title: "Sidebar: Explore & Discover",
    subtitle: "Home & Neural Discovery",
    description: "Your primary hub on the left: 'Home' brings new arrivals and top charts. 'Discover' searches millions of songs, albums, and artist discographies with live waveform previews.",
    actionHint: "Highlighted on the left. Click Next or click the sidebar to continue.",
    icon: Compass,
    badge: "Sidebar",
    preferredPlacement: "right",
  },
  {
    targetSelector: "#tour-sidebar-library",
    title: "Sidebar: Your Sanctuary Library",
    subtitle: "Liked Songs, Followed Artists & Playlists",
    description: "Keep all your favorite music in one place: tap the heart icon on any song to save it to 'Liked Songs', view artists you follow, albums, and your custom playlists.",
    actionHint: "Highlighted under Your Library. Click Next to continue.",
    icon: Library,
    badge: "Library",
    preferredPlacement: "right",
  },
  {
    targetSelector: "#tour-device-music",
    title: "Sidebar: Device Music Vault",
    subtitle: "Your Isolated Offline Library",
    description: "Play your private device audio files (.mp3, .flac, .wav) with zero internet required. Files stay 100% private to your account on this device with instant tagging and playback.",
    actionHint: "Highlighted in your Library menu. Click Next to continue.",
    icon: HardDrive,
    badge: "Device Vault",
    preferredPlacement: "right",
  },
  {
    targetSelector: "#tour-profile",
    title: "Profile & Listening Journey",
    subtitle: "Click Profile Icon for Stats & Account Preferences",
    description: "Click your profile avatar at top-right to inspect your AI listening persona, 30-day stream metrics, sound frequency analytics, audio streaming quality (lossless FLAC / AAC), themes, and settings.",
    actionHint: "Click your profile avatar at top-right or Next to continue.",
    icon: User,
    badge: "Profile",
    preferredPlacement: "bottom",
  },
  {
    title: "Track Page & Credits",
    subtitle: "Lossless Waveforms & Manual Lyric Sync",
    description: "Click any song title anywhere in the app to open its dedicated Track Page: explore lossless audio bitrates, producer credits, dynamic ambient canvas, and sync lyrics with Deepgram AI or manual timing tools.",
    actionHint: "Click any song title anytime to view its full soundstage page.",
    icon: Disc,
    badge: "Track Page",
    preferredPlacement: "center",
  },
  {
    targetSelector: "#tour-player",
    title: "Full View Player & Studio Soundstage",
    subtitle: "Click Player Bar for Full View Player",
    description: "Click anywhere on the bottom floating glass player bar to expand into the Full View Player: live audio frequency visualizer, 8D spatial sound, bass boost, and immersive liquid canvas.",
    actionHint: "Highlighted at the bottom. Click the player bar to toggle the fullscreen immersive player.",
    icon: Music2,
    badge: "Full Player",
    preferredPlacement: "top",
  },
  {
    targetSelector: "#tour-lyrics",
    title: "Synced Lyrics on Sidebar",
    subtitle: "Click Lyrics Icon for Real-Time Sing-Along",
    description: "Click the Lyrics button on the player bar or track page to pop open the synchronized Liquid Lyrics Sidebar on the right. Sing along with glowing active lines and animated liquid background physics.",
    actionHint: "Highlighted on the player controls. Click Next to continue.",
    icon: ScrollText,
    badge: "Liquid Lyrics",
    preferredPlacement: "top",
  },
  {
    title: "You're All Set!",
    subtitle: "Studio-Grade Music Awaits",
    description: "You have full control over your audio sanctuary. No ads, lossless playback, and instant streaming. Press play and enjoy Zenify!",
    actionHint: "Click 'Start Listening' to begin your music journey.",
    icon: Sparkles,
    badge: "Ready",
    preferredPlacement: "center",
  },
];

interface ElementRect {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export function UserOnboardingTour() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<ElementRect | null>(null);
  const [targetBorderRadius, setTargetBorderRadius] = useState<string>("12px");
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const rafRef = useRef<number | null>(null);

  const user = useAuthStore(s => s.user);
  const updateUser = useAuthStore(s => s.updateUser);
  const showLoginSplash = useUIStore(s => s.showLoginSplash);

  // Check prefers-reduced-motion
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mql.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // Check initial tour state or Google arrival
  useEffect(() => {
    // If splash screen is currently playing, wait until it finishes
    if (showLoginSplash) return;

    try {
      const forceTour = typeof window !== 'undefined' && sessionStorage.getItem("zenify_force_tour") === "true";

      // 1. If user onboarding is marked completed in DB preferences, NEVER show tour again unless explicitly forced
      if (!forceTour && user?.preferences?.onboardingCompleted) {
        sessionStorage.removeItem("zenify_just_arrived");
        return;
      }

      const userKey = user?.id ? `zenify_tour_completed_${user.id}` : "zenify_tour_completed";
      // Strict user isolation: if user is logged in, ONLY check their own key! Never let a previous visitor's global key block a new user!
      const isCompleted = user?.id
        ? localStorage.getItem(userKey)
        : localStorage.getItem("zenify_tour_completed");

      // Show if forced or not marked completed in DB preferences and not in localStorage for this user
      if (forceTour || (!isCompleted && !user?.preferences?.onboardingCompleted)) {
        const timer = setTimeout(() => {
          sessionStorage.removeItem("zenify_force_tour");
          setCurrentStep(0);
          setIsOpen(true);
        }, 800);
        return () => clearTimeout(timer);
      }
    } catch (e) {
      // In case localStorage is disabled
    }
  }, [showLoginSplash, user?.id, user?.preferences?.onboardingCompleted]);

  // Support re-triggering tour on demand
  useEffect(() => {
    const handleStartTour = () => {
      setCurrentStep(0);
      setIsOpen(true);
    };
    window.addEventListener("zenify:start-tour", handleStartTour);
    return () => window.removeEventListener("zenify:start-tour", handleStartTour);
  }, []);

  const step = TOUR_STEPS[currentStep];

  // Measure target element position using requestAnimationFrame with border-radius extraction
  const measureTarget = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      if (!step?.targetSelector) {
        setTargetRect(null);
        return;
      }

      const el = document.querySelector(step.targetSelector) as HTMLElement | null;
      if (el) {
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
          setTargetRect(null);
          return;
        }

        const r = el.getBoundingClientRect();
        // Ensure element is genuinely visible on screen and within viewport boundaries
        if (
          r.width > 10 &&
          r.height > 10 &&
          r.bottom > 0 &&
          r.top < window.innerHeight &&
          r.right > 0 &&
          r.left < window.innerWidth
        ) {
          setTargetRect({
            top: r.top,
            left: r.left,
            width: r.width,
            height: r.height,
            right: r.right,
            bottom: r.bottom,
          });
          setTargetBorderRadius(style.borderRadius || "12px");
          return;
        }
      }
      setTargetRect(null);
    });
  }, [step]);

  useEffect(() => {
    if (!isOpen) return;

    measureTarget();

    const handleUpdate = () => measureTarget();
    window.addEventListener("resize", handleUpdate);
    window.addEventListener("scroll", handleUpdate, true);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      window.removeEventListener("resize", handleUpdate);
      window.removeEventListener("scroll", handleUpdate, true);
    };
  }, [isOpen, measureTarget]);

  const handleDismiss = async () => {
    try {
      const userKey = user?.id ? `zenify_tour_completed_${user.id}` : "zenify_tour_completed";
      localStorage.setItem(userKey, "true");
      localStorage.setItem("zenify_tour_completed", "true");
      sessionStorage.removeItem("zenify_just_arrived");

      if (user?.id) {
        updateUser({
          preferences: {
            ...user.preferences,
            onboardingCompleted: true,
          },
        });
        await api.patch('/auth/preferences', { onboardingCompleted: true }).catch(() => {
          api.put('/auth/preferences', { onboardingCompleted: true }).catch(() => {});
        });
      }
    } catch {}
    setIsOpen(false);
  };

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleDismiss();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  // Keyboard accessibility
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") handleDismiss();
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentStep]);

  if (!isOpen) return null;

  const IconComponent = step.icon;
  const isLast = currentStep === TOUR_STEPS.length - 1;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1100] select-none pointer-events-none">
        {/* Transparent outline-only highlight around target control (No dark overlay, no backdrop blur, no filled aura) */}
        {targetRect && (
          <motion.div
            key={`tour-outline-${currentStep}`}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{
              opacity: 1,
              scale: 1,
              top: Math.max(0, targetRect.top - 4),
              left: Math.max(0, targetRect.left - 4),
              width: targetRect.width + 8,
              height: targetRect.height + 8,
              boxShadow: prefersReducedMotion
                ? "0 0 8px rgba(225, 29, 72, 0.4)"
                : [
                    "0 0 4px rgba(225, 29, 72, 0.3), inset 0 0 4px rgba(225, 29, 72, 0.1)",
                    "0 0 14px rgba(225, 29, 72, 0.6), inset 0 0 6px rgba(225, 29, 72, 0.2)",
                    "0 0 4px rgba(225, 29, 72, 0.3), inset 0 0 4px rgba(225, 29, 72, 0.1)",
                  ],
            }}
            transition={
              prefersReducedMotion
                ? { duration: 0.2 }
                : {
                    scale: { duration: 0.2 },
                    boxShadow: { repeat: Infinity, duration: 2, ease: "easeInOut" },
                  }
            }
            className="fixed border-2 border-brand bg-transparent pointer-events-none z-[1101]"
            style={{
              borderRadius: targetBorderRadius,
            }}
          />
        )}

        {/* Centered Tour Modal Wrapper: fixed inset-0 flex items-center justify-center - NO CSS translate on animated card */}
        <div 
          className="fixed inset-0 z-[1105] flex items-center justify-center p-3 sm:p-4 pointer-events-none"
          style={{
            paddingTop: "max(12px, env(safe-area-inset-top, 12px))",
            paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))",
            paddingLeft: "max(12px, env(safe-area-inset-left, 12px))",
            paddingRight: "max(12px, env(safe-area-inset-right, 12px))",
          }}
        >
          {/* Tour Card: width min(100%, 420px), max-height calc(100dvh - 24px), internal scroll on body only */}
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="pointer-events-auto w-full max-w-[420px] max-h-[calc(100dvh-24px)] bg-[#121214]/98 backdrop-blur-2xl border border-white/15 rounded-2xl sm:rounded-3xl shadow-[0_24px_70px_rgba(0,0,0,0.9),0_0_50px_rgba(225,29,72,0.25)] flex flex-col overflow-hidden isolate text-white"
          >
            {/* Subtle Ambient Crimson Glow */}
            <div className="absolute -top-24 -right-24 w-52 h-52 bg-brand/20 rounded-full blur-3xl pointer-events-none" />

            {/* Header: Skip & Close (Always visible & sticky inside card, min touch target 44px) */}
            <div className="shrink-0 px-4 py-2.5 sm:px-6 sm:py-3 border-b border-white/10 flex items-center justify-between relative z-10 bg-[#121214]/90 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase bg-brand/15 border border-brand/30 text-brand font-brand">
                  {step.badge}
                </span>
                <span className="text-[11px] font-mono text-white/50">
                  {currentStep + 1} / {TOUR_STEPS.length}
                </span>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Skip Option Button - >=44px touch target */}
                <button
                  onClick={handleDismiss}
                  className="min-h-[44px] min-w-[44px] px-3 rounded-full text-xs font-semibold text-white/60 hover:text-white hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                  title="Skip tour"
                >
                  Skip
                </button>
                {/* Close Button - >=44px touch target */}
                <button
                  onClick={handleDismiss}
                  className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white/80 hover:text-white active:scale-95 transition-all cursor-pointer"
                  title="Close tour"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Scrollable Content Body - Internal scroll on body only */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4 space-y-3 sm:space-y-4 overscroll-contain relative z-10 custom-scrollbar">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center text-brand shadow-inner shrink-0">
                  <IconComponent size={20} className="sm:size-6 text-brand" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base sm:text-lg md:text-xl font-bold font-brand tracking-tight text-white leading-tight">
                    {step.title}
                  </h3>
                  <p className="text-[11px] sm:text-xs text-brand font-semibold tracking-wide mt-0.5">
                    {step.subtitle}
                  </p>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-white/80 leading-relaxed font-sans">
                {step.description}
              </p>

              {/* Action hint badge */}
              <div className="p-2 sm:p-2.5 rounded-xl bg-white/[0.04] border border-white/5 text-[10px] sm:text-[11px] text-white/70 flex items-center gap-2">
                <Sparkles size={13} className="text-brand shrink-0" />
                <span>{step.actionHint}</span>
              </div>
            </div>

            {/* Footer: Indicators, Back & Next (Always visible & sticky inside card, min touch target 44px) */}
            <div className="shrink-0 px-4 py-2.5 sm:px-6 sm:py-3 border-t border-white/10 bg-[#121214]/95 flex items-center justify-between gap-2 relative z-10">
              {/* Step Dot Indicators */}
              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                {TOUR_STEPS.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentStep(idx)}
                    className="min-h-[44px] px-1 flex items-center justify-center transition-all cursor-pointer"
                    title={`Go to step ${idx + 1}`}
                  >
                    <span 
                      className={cn(
                        "h-1.5 rounded-full transition-all duration-300 block",
                        idx === currentStep
                          ? "w-4 sm:w-6 bg-brand shadow-[0_0_8px_rgba(225,29,72,0.6)]"
                          : "w-1.5 bg-white/20 hover:bg-white/40"
                      )}
                    />
                  </button>
                ))}
              </div>

              {/* Navigation Controls */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                {currentStep > 0 && (
                  <button
                    onClick={handlePrev}
                    className="min-h-[44px] px-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <ArrowLeft size={14} />
                    <span>Back</span>
                  </button>
                )}

                <button
                  onClick={handleNext}
                  className={cn(
                    "min-h-[44px] px-4 sm:px-5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer active:scale-95 shadow-md",
                    isLast
                      ? "bg-brand hover:bg-brand/90 text-white shadow-[0_0_15px_rgba(225,29,72,0.4)]"
                      : "bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand"
                  )}
                >
                  {isLast ? (
                    <>
                      <span>Start Listening</span>
                      <Check size={14} />
                    </>
                  ) : (
                    <>
                      <span>Next</span>
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
}
