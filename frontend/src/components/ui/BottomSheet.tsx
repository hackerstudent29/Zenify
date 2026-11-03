"use client";

import React, { useEffect } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  detent?: "medium" | "large" | "auto";
  showCloseButton?: boolean;
  className?: string;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  detent = "auto",
  showCloseButton = true,
  className,
}: BottomSheetProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleDragEnd = (_e: any, info: PanInfo) => {
    if (info.offset.y > 100 || info.velocity.y > 500) {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(10);
      }
      onClose();
    }
  };

  const heightClass =
    detent === "large"
      ? "max-h-[92vh] h-[92vh]"
      : detent === "medium"
      ? "max-h-[60vh] h-[60vh]"
      : "max-h-[88vh]";

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[1300] flex items-end justify-center pointer-events-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 32, mass: 0.8 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.8 }}
            onDragEnd={handleDragEnd}
            className={cn(
              "relative w-full max-w-xl mx-auto flex flex-col",
              "rounded-t-[28px] overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.5)]",
              "bg-[#1c1c1e]/95 backdrop-blur-[24px] saturate-[180%] border-t border-x border-white/[0.12]",
              "pb-[env(safe-area-inset-bottom,16px)]",
              heightClass,
              className
            )}
          >
            {/* Grabber Handle */}
            <div className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing shrink-0">
              <div className="w-10 h-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors" />
            </div>

            {/* Header */}
            {(title || showCloseButton) && (
              <div className="flex items-center justify-between px-6 py-2 border-b border-white/[0.08] shrink-0">
                <div className="min-w-0 flex-1">
                  {title && (
                    <h2 className="text-[19px] font-bold text-white tracking-tight truncate">
                      {title}
                    </h2>
                  )}
                  {subtitle && (
                    <p className="text-[13px] text-white/50 truncate mt-0.5">{subtitle}</p>
                  )}
                </div>
                {showCloseButton && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center text-white/70 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 overscroll-contain">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

