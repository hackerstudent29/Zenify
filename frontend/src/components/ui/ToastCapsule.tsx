"use client";

import React, { useEffect } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { useUIStore } from "@/store/ui";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export function ToastCapsule() {
  const toast = useUIStore((s) => s.toast);
  const hideToast = useUIStore((s) => s.hideToast);

  const handleDragEnd = (_e: any, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 60 || Math.abs(info.offset.y) > 40) {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(10);
      }
      hideToast();
    }
  };

  const handleUndo = () => {
    if (toast?.onUndo) {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(10);
      }
      toast.onUndo();
      hideToast();
    }
  };

  const getIcon = () => {
    if (!toast) return null;
    switch (toast.type) {
      case "success":
        return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
      case "info":
      default:
        return <Info className="w-4 h-4 text-sky-400 shrink-0" />;
    }
  };

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed left-1/2 -translate-x-1/2 bottom-20 md:bottom-24 z-[1400] pointer-events-none flex flex-col items-center"
    >
      <AnimatePresence mode="wait">
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 14, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 450, damping: 32 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.4}
            onDragEnd={handleDragEnd}
            role="status"
            className={cn(
              "pointer-events-auto flex items-center gap-3 px-4 py-2.5",
              "rounded-full bg-[#1c1c1e]/90 backdrop-blur-[24px] saturate-[180%]",
              "border border-white/[0.14] shadow-[0_12px_36px_rgba(0,0,0,0.45)]",
              "select-none cursor-grab active:cursor-grabbing max-w-[90vw]"
            )}
          >
            {getIcon()}

            <span className="text-[13px] font-medium text-white truncate max-w-[240px] sm:max-w-xs">
              {toast.msg}
            </span>

            {toast.onUndo && (
              <button
                type="button"
                onClick={handleUndo}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.15] hover:bg-white/[0.25] text-white text-[12px] font-bold active:scale-95 transition-all cursor-pointer ml-1"
              >
                <RotateCcw className="w-3 h-3 text-brand" />
                <span>{toast.undoLabel || "Undo"}</span>
              </button>
            )}

            <button
              type="button"
              onClick={hideToast}
              aria-label="Dismiss toast"
              className="text-white/40 hover:text-white transition-colors p-0.5 ml-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

