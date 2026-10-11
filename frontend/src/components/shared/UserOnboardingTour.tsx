"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Compass, Search, Music2, ArrowRight, ArrowLeft, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface TourStep {
  title: string;
  subtitle: string;
  description: string;
  icon: React.ElementType;
  badge: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to Zenify",
    subtitle: "High-Fidelity Audio Sanctuary",
    description: "Welcome! Zenify is your personal, studio-grade music streaming platform. Let's take a quick 30-second tour of what's what.",
    icon: Sparkles,
    badge: "Welcome",
  },
  {
    title: "Sidebar & Your Library",
    subtitle: "Sanctuary Navigation",
    description: "Access Home, Discover, and your private Library from the left panel. Manage your Liked Songs, Artists, Albums, Playlists, and local Device Music seamlessly.",
    icon: Compass,
    badge: "Navigation",
  },
  {
    title: "Neural Archive Search",
    subtitle: "Instant Discoverability",
    description: "Use the top search bar to query millions of tracks across the neural archives. Preview high-res artwork, artist discographies, and albums in milliseconds.",
    icon: Search,
    badge: "Search",
  },
  {
    title: "Studio Player & Liquid Lyrics",
    subtitle: "Lossless Audio Experience",
    description: "Enjoy word-by-word synced liquid lyrics, high-fidelity lossless streaming, custom audio equalizers, and instant queue control at the bottom bar.",
    icon: Music2,
    badge: "Player & Lyrics",
  },
];

export function UserOnboardingTour() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    // Check if user has already seen or skipped the tour
    try {
      const tourCompleted = localStorage.getItem("zenify_tour_completed");
      if (!tourCompleted) {
        // Small delay so page mounts gracefully before popping up
        const timer = setTimeout(() => {
          setIsOpen(true);
        }, 800);
        return () => clearTimeout(timer);
      }
    } catch (e) {
      // In case localStorage is blocked
    }
  }, []);

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

  // Keyboard accessibility: Escape skips
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleDismiss();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const step = TOUR_STEPS[currentStep];
  const IconComponent = step.icon;
  const isLast = currentStep === TOUR_STEPS.length - 1;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 select-none pointer-events-none">
        {/* Ambient Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleDismiss}
          className="absolute inset-0 bg-black/60 backdrop-blur-md pointer-events-auto"
        />

        {/* Floating Tooltip Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          className="relative pointer-events-auto w-full max-w-md bg-[#121214] border border-white/10 rounded-3xl p-6 sm:p-7 shadow-[0_24px_60px_rgba(0,0,0,0.8),0_0_40px_rgba(225,29,72,0.15)] overflow-hidden isolate"
        >
          {/* Subtle Ambient Crimson Glow */}
          <div className="absolute -top-24 -right-24 w-52 h-52 bg-brand/20 rounded-full blur-3xl pointer-events-none" />

          {/* Top Bar: Badge, Skip Button, Close Button */}
          <div className="flex items-center justify-between mb-5 relative z-10">
            <span className="px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase bg-brand/10 border border-brand/20 text-brand font-brand">
              {step.badge}
            </span>

            <div className="flex items-center gap-2">
              {/* Skip Option Button */}
              <button
                onClick={handleDismiss}
                className="px-3 py-1 rounded-full text-xs font-semibold text-white/50 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
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
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-4 relative z-10"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center text-brand shadow-inner shrink-0">
                  <IconComponent size={26} className="text-brand" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl font-bold font-brand tracking-tight text-white leading-tight">
                    {step.title}
                  </h3>
                  <p className="text-xs text-white/40 font-medium tracking-wide mt-0.5">
                    {step.subtitle}
                  </p>
                </div>
              </div>

              <p className="text-sm text-white/70 leading-relaxed font-sans pt-1">
                {step.description}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* Bottom Bar: Indicators & Controls */}
          <div className="mt-8 pt-5 border-t border-white/5 flex items-center justify-between relative z-10">
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
