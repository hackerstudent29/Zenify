"use client";

import React, { useState, useEffect, useCallback } from "react";
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
  Check,
  MousePointerClick
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

  const user = useAuthStore(s => s.user);
  const updateUser = useAuthStore(s => s.updateUser);
  const showLoginSplash = useUIStore(s => s.showLoginSplash);

  // Check initial tour state or Google arrival
  useEffect(() => {
    // If splash screen is currently playing, wait until it finishes
    if (showLoginSplash) return;

    try {
      // 1. If user onboarding is marked completed in DB preferences, NEVER show tour again
      if (user?.preferences?.onboardingCompleted) {
        sessionStorage.removeItem("zenify_just_arrived");
        return;
      }

      const userKey = user?.id ? `zenify_tour_completed_${user.id}` : "zenify_tour_completed";
      const isCompleted = localStorage.getItem(userKey) || localStorage.getItem("zenify_tour_completed");

      // Only show if not completed in DB AND not completed in localStorage
      if (!isCompleted && !user?.preferences?.onboardingCompleted) {
        const timer = setTimeout(() => {
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

  // Measure target element position
  const measureTarget = useCallback(() => {
    if (!step?.targetSelector) {
      setTargetRect(null);
      return;
    }

    const el = document.querySelector(step.targetSelector) as HTMLElement | null;
    if (el) {
      const r = el.getBoundingClientRect();
      // Ensure element is visible on screen
      if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) {
        setTargetRect({
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
          right: r.right,
          bottom: r.bottom,
        });
        return;
      }
    }
    setTargetRect(null);
  }, [step]);

  useEffect(() => {
    if (!isOpen) return;

    measureTarget();

    const handleResize = () => measureTarget();
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);

    const checkInterval = setInterval(measureTarget, 250);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
      clearInterval(checkInterval);
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

  // Clean, minimal center positioning that stays strictly within screen visible size
  const getCardPositionStyle = (): React.CSSProperties => {
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "min(92vw, 420px)",
      maxHeight: "min(88vh, 520px)",
    };
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1100] select-none pointer-events-none">
        {/* Fullscreen Dimming Overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleDismiss}
          className="absolute inset-0 bg-black/75 backdrop-blur-sm pointer-events-auto"
        />

        {/* Dynamic Spotlight Cutout Frame around highlighted component */}
        {targetRect && (
          <motion.div
            layoutId="tour-spotlight-frame"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{
              opacity: 1,
              scale: 1,
              top: Math.max(0, targetRect.top - 6),
              left: Math.max(0, targetRect.left - 6),
              width: targetRect.width + 12,
              height: targetRect.height + 12,
            }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            onClick={handleNext}
            className="fixed rounded-2xl ring-2 ring-brand ring-offset-2 ring-offset-black z-[1101] pointer-events-auto cursor-pointer"
            style={{
              boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.78), 0 0 45px rgba(225, 29, 72, 0.55)",
            }}
            title="Click highlighted component to continue"
          >
            {/* Animated Glowing Outer Aura (leaves inner element 100% visible and unblocked) */}
            <span className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-brand/50 to-pink-500/50 blur-md animate-pulse -z-10" />
          </motion.div>
        )}

        {/* Guided Tooltip Popover Card */}
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          style={getCardPositionStyle()}
          className="pointer-events-auto z-[1105] bg-[#121214]/95 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 sm:p-7 shadow-[0_24px_70px_rgba(0,0,0,0.85),0_0_50px_rgba(225,29,72,0.2)] overflow-hidden isolate"
        >
          {/* Subtle Ambient Crimson Glow */}
          <div className="absolute -top-24 -right-24 w-52 h-52 bg-brand/20 rounded-full blur-3xl pointer-events-none" />

          {/* Top Bar: Badge, Step Counter, Skip Button, Close Button */}
          <div className="flex items-center justify-between mb-4 relative z-10">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase bg-brand/15 border border-brand/30 text-brand font-brand">
                {step.badge}
              </span>
              <span className="text-[11px] font-mono text-white/40">
                {currentStep + 1} / {TOUR_STEPS.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Skip Option Button */}
              <button
                onClick={handleDismiss}
                className="px-3 py-1 rounded-full text-xs font-semibold text-white/50 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                title="Skip tour"
              >
                Skip
              </button>
              <button
                onClick={handleDismiss}
                className="w-7 h-7 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all cursor-pointer"
                title="Close"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Step Visual & Content */}
          <div className="space-y-4 relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-13 h-13 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center text-brand shadow-inner shrink-0">
                <IconComponent size={24} className="text-brand" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg sm:text-xl font-bold font-brand tracking-tight text-white leading-tight">
                  {step.title}
                </h3>
                <p className="text-xs text-brand/90 font-semibold tracking-wide mt-0.5">
                  {step.subtitle}
                </p>
              </div>
            </div>

            <p className="text-sm text-white/80 leading-relaxed font-sans">
              {step.description}
            </p>

            {/* Interactive hint badge */}
            <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 text-[11px] text-white/60 flex items-center gap-2">
              <Sparkles size={12} className="text-brand shrink-0" />
              <span>{step.actionHint}</span>
            </div>
          </div>

          {/* Bottom Bar: Indicators & Controls */}
          <div className="mt-6 pt-5 border-t border-white/10 flex items-center justify-between relative z-10">
            {/* Step Dot Indicators */}
            <div className="flex items-center gap-1.5">
              {TOUR_STEPS.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentStep(idx)}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300 cursor-pointer",
                    idx === currentStep
                      ? "w-6 bg-brand shadow-[0_0_8px_rgba(225,29,72,0.6)]"
                      : "w-1.5 bg-white/20 hover:bg-white/40"
                  )}
                  title={`Go to step ${idx + 1}`}
                />
              ))}
            </div>

            {/* Back & Next Navigation Buttons */}
            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <button
                  onClick={handlePrev}
                  className="h-9 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                >
                  <ArrowLeft size={13} />
                  <span>Back</span>
                </button>
              )}

              <button
                onClick={handleNext}
                className={cn(
                  "h-9 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-md",
                  isLast
                    ? "bg-brand hover:bg-brand/90 text-white shadow-[0_0_15px_rgba(225,29,72,0.4)]"
                    : "bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand"
                )}
              >
                {isLast ? (
                  <>
                    <span>Start Listening</span>
                    <Check size={13} />
                  </>
                ) : (
                  <>
                    <span>Next</span>
                    <ArrowRight size={13} />
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
