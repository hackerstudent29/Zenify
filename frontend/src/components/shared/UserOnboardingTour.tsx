"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Compass, Search, Music2, ArrowRight, ArrowLeft, X, Check, HardDrive, MousePointerClick } from "lucide-react";
import { cn } from "@/lib/utils";

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
    description: "Welcome! Zenify is your personal, studio-grade music platform. Let's take a quick interactive tour to highlight each part of the interface.",
    actionHint: "Click 'Start Tour' to begin the interactive walkthrough.",
    icon: Sparkles,
    badge: "Welcome",
    preferredPlacement: "center",
  },
  {
    targetSelector: "#tour-sidebar",
    title: "Sidebar & Sanctuary",
    subtitle: "Fluid Left Navigation",
    description: "Your central hub: switch instantly between Home, Discover, and your saved collections. Clickable, collapsible, and responsive.",
    actionHint: "Highlighted on the left. Click Next or click the highlighted sidebar to continue.",
    icon: Compass,
    badge: "Sidebar",
    preferredPlacement: "right",
  },
  {
    targetSelector: "#tour-search",
    title: "Neural Catalog Search",
    subtitle: "Instant Discoverability",
    description: "Search across millions of tracks, albums, and artist discographies. Real-time neural results with waveform preview support.",
    actionHint: "Highlighted at the top. Click Next or click the search box to continue.",
    icon: Search,
    badge: "Search",
    preferredPlacement: "bottom",
  },
  {
    targetSelector: "#tour-device-music",
    title: "Personal Device Vault",
    subtitle: "Isolated Local Library",
    description: "Your private, per-user offline vault. Import local folders (.mp3, .flac, .wav) with automatic tag cleaning and synced lyrics.",
    actionHint: "Highlighted in your Library menu. Click Next to continue.",
    icon: HardDrive,
    badge: "Device Music",
    preferredPlacement: "right",
  },
  {
    targetSelector: "#tour-player",
    title: "Studio Glass Player",
    subtitle: "Lossless Audio & Liquid Lyrics",
    description: "Floating studio bar with word-by-word synced liquid lyrics, 8D audio modes, visual soundstage, and instant queue control.",
    actionHint: "Highlighted at the bottom. You are ready to experience Zenify!",
    icon: Music2,
    badge: "Lossless Player",
    preferredPlacement: "top",
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

  // Check initial tour state
  useEffect(() => {
    try {
      const tourCompleted = localStorage.getItem("zenify_tour_completed");
      if (!tourCompleted) {
        const timer = setTimeout(() => {
          setIsOpen(true);
        }, 800);
        return () => clearTimeout(timer);
      }
    } catch (e) {
      // In case localStorage is disabled
    }
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
      if (r.width > 0 && r.height > 0) {
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

  const handleDismiss = () => {
    try {
      localStorage.setItem("zenify_tour_completed", "true");
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

  // Compute card positioning relative to target element
  const getCardPositionStyle = (): React.CSSProperties => {
    if (!targetRect || typeof window === "undefined" || window.innerWidth < 768) {
      // Center on small screens or when target is not available
      return {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        maxWidth: "min(92vw, 440px)",
      };
    }

    const { preferredPlacement } = step;
    const cardWidth = 400;
    const padding = 16;

    if (preferredPlacement === "right") {
      const left = Math.min(window.innerWidth - cardWidth - padding, targetRect.right + 20);
      const top = Math.min(window.innerHeight - 360, Math.max(padding, targetRect.top + 20));
      return {
        position: "fixed",
        top: `${top}px`,
        left: `${left}px`,
        width: `${cardWidth}px`,
      };
    }

    if (preferredPlacement === "bottom") {
      const top = Math.min(window.innerHeight - 360, targetRect.bottom + 16);
      const left = Math.max(
        padding,
        Math.min(window.innerWidth - cardWidth - padding, targetRect.left + targetRect.width / 2 - cardWidth / 2)
      );
      return {
        position: "fixed",
        top: `${top}px`,
        left: `${left}px`,
        width: `${cardWidth}px`,
      };
    }

    if (preferredPlacement === "top") {
      const bottom = Math.max(padding, window.innerHeight - targetRect.top + 16);
      const left = Math.max(
        padding,
        Math.min(window.innerWidth - cardWidth - padding, targetRect.left + targetRect.width / 2 - cardWidth / 2)
      );
      return {
        position: "fixed",
        bottom: `${bottom}px`,
        left: `${left}px`,
        width: `${cardWidth}px`,
      };
    }

    // Default center
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      maxWidth: "min(92vw, 440px)",
    };
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1100] select-none pointer-events-none">
        {/* Fullscreen Dimming Overlay */}
        {!targetRect && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleDismiss}
            className="absolute inset-0 bg-black/75 backdrop-blur-sm pointer-events-auto"
          />
        )}

        {/* Dynamic Spotlight Cutout Frame around highlighted component */}
        {targetRect && (
          <>
            <motion.div
              layoutId="tour-spotlight-frame"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{
                opacity: 1,
                scale: 1,
                top: Math.max(0, targetRect.top - 8),
                left: Math.max(0, targetRect.left - 8),
                width: targetRect.width + 16,
                height: targetRect.height + 16,
              }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              onClick={handleNext}
              className="fixed rounded-2xl ring-2 ring-brand ring-offset-2 ring-offset-black z-[1101] pointer-events-auto cursor-pointer group"
              style={{
                boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.78), 0 0 50px rgba(225, 29, 72, 0.6)",
              }}
              title="Click component to continue"
            >
              {/* Animated Glowing Outer Aura */}
              <span className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-brand/50 to-pink-500/50 blur-md animate-pulse -z-10" />

              {/* Target Click Me Action Badge */}
              <div className="absolute -top-3.5 left-4 bg-brand text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full shadow-lg flex items-center gap-1.5 transition-transform group-hover:scale-105">
                <MousePointerClick size={11} className="animate-bounce" />
                <span>Click here or Next</span>
              </div>
            </motion.div>
          </>
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
                    <span>Finish</span>
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
