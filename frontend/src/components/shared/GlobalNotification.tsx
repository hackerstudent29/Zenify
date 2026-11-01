"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { cn } from "@/lib/utils";

export function GlobalNotification() {
  const toast = useUIStore((s) => s.toast);
  const hideToast = useUIStore((s) => s.hideToast);

  const iconConfig = React.useMemo(() => {
    switch (toast?.type) {
      case "error":
        return {
          bg: "bg-[#fa243c]",
          icon: <AlertCircle className="h-4 w-4 text-white shrink-0" strokeWidth={2.5} />,
        };
      case "warning":
        return {
          bg: "bg-[#ff9f0a]",
          icon: <AlertTriangle className="h-4 w-4 text-white shrink-0" strokeWidth={2.5} />,
        };
      case "info":
        return {
          bg: "bg-[#0a84ff]",
          icon: <Info className="h-4 w-4 text-white shrink-0" strokeWidth={2.5} />,
        };
      case "success":
      default:
        return {
          bg: "bg-[#30d158]",
          icon: <Check className="h-4 w-4 text-white shrink-0" strokeWidth={3} />,
        };
    }
  }, [toast?.type]);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: -40, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 420, damping: 28 }}
          className="fixed left-1/2 top-4 sm:top-5 z-[99999] flex max-w-[calc(100vw-2rem)] sm:max-w-md -translate-x-1/2 items-center gap-3 rounded-[16px] bg-[#2c2c2e]/90 py-2.5 pl-3 pr-4 shadow-[0_16px_48px_rgba(0,0,0,0.55),0_0_0_0.5px_rgba(255,255,255,0.18)] backdrop-blur-2xl backdrop-saturate-[1.8] pointer-events-auto"
          role="status"
          aria-live="polite"
        >
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full shadow-sm",
              iconConfig.bg
            )}
          >
            {iconConfig.icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold leading-none text-white/50 tracking-wide uppercase">
              {toast.title || "Zenify"}
            </p>
            <p className="mt-1 text-[13px] font-medium leading-tight text-white select-none break-words">
              {toast.msg}
            </p>
          </div>
          <button
            onClick={hideToast}
            className="text-white/40 hover:text-white p-1 rounded-full transition-colors shrink-0 outline-none"
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default GlobalNotification;

