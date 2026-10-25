"use client";
// Drop <AutoHideSetting /> anywhere in your Settings page.
import React from "react";
import { motion } from "framer-motion";
import { usePlayerPrefs } from "@/store/playerPrefs";

export function AutoHideSetting({ className }: { className?: string }) {
  const on = usePlayerPrefs((s) => s.autoHideDetails);
  const set = usePlayerPrefs((s) => s.setAutoHideDetails);
  return (
    <div className={"flex items-center justify-between gap-4 " + (className || "")}>
      <div className="min-w-0">
        <p className="text-[15px] font-medium text-white">Hide details when idle</p>
        <p className="mt-0.5 text-[13px] leading-snug text-white/50">
          After 5 seconds without touching the full-screen player, only the artwork, lyrics and progress bar stay visible.
        </p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        onClick={() => set(!on)}
        className="relative h-[31px] w-[51px] shrink-0 cursor-pointer rounded-full outline-none transition-colors duration-300"
        style={{ backgroundColor: on ? "#34c759" : "rgba(120,120,128,0.32)" }}
      >
        <motion.span
          animate={{ x: on ? 20 : 0 }}
          transition={{ type: "spring", stiffness: 520, damping: 30 }}
          whileTap={{ width: 32 }}
          className="absolute left-[2px] top-[2px] block h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.3)]"
        />
      </button>
    </div>
  );
}
