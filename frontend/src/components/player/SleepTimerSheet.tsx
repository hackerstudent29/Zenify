"use client";

import React, { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useSleepTimerStore } from "@/store/sleepTimerStore";
import { Moon, Clock, Plus, Minus, Disc3, X } from "lucide-react";
import { cn } from "@/lib/utils";

const PRESETS = [5, 10, 15, 30, 45, 60];

export function SleepTimerSheet() {
  const { isOpen, setOpen, endTimestamp, mode, remainingSeconds, setTimer, setEndAtTrackEnd, clearTimer } =
    useSleepTimerStore();
  const [customMinutes, setCustomMinutes] = useState(20);

  const formatRemaining = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isActive = endTimestamp !== null || mode === "track_end";

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={() => setOpen(false)}
      title="Sleep Timer"
      subtitle={
        isActive
          ? mode === "track_end"
            ? "Will pause when this track finishes"
            : `Fading out in ${formatRemaining(remainingSeconds)}`
          : "Turn off audio after you fall asleep"
      }
    >
      <div className="flex flex-col gap-5 py-2">
        {/* Active Timer Pill */}
        {isActive && (
          <div className="flex items-center justify-between p-3.5 rounded-[16px] bg-brand/15 border border-brand/25 text-brand">
            <div className="flex items-center gap-2.5">
              <Clock className="w-5 h-5 animate-pulse" />
              <div>
                <div className="text-[14px] font-bold">
                  {mode === "track_end" ? "End of Track" : formatRemaining(remainingSeconds)}
                </div>
                <div className="text-[11px] text-white/50">Active timer</div>
              </div>
            </div>
            <button
              type="button"
              onClick={clearTimer}
              className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-[12px] font-semibold transition-all active:scale-95"
            >
              Turn Off
            </button>
          </div>
        )}

        {/* Quick Presets Grid */}
        <div>
          <label className="text-[12px] font-semibold text-white/40 uppercase tracking-wider block mb-2 px-1">
            Presets
          </label>
          <div className="grid grid-cols-3 gap-2">
            {PRESETS.map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => setTimer(mins, "preset")}
                className={cn(
                  "h-12 rounded-[14px] font-semibold text-[14px] transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-95 border",
                  endTimestamp && Math.round((endTimestamp - Date.now()) / 60000) === mins
                    ? "bg-white text-black border-white shadow-md"
                    : "bg-white/[0.06] hover:bg-white/[0.12] text-white border-white/[0.08]"
                )}
              >
                <span>{mins}</span>
                <span className="text-[11px] text-white/50">min</span>
              </button>
            ))}
          </div>
        </div>

        {/* End of Track Option */}
        <button
          type="button"
          onClick={setEndAtTrackEnd}
          className={cn(
            "h-12 px-4 rounded-[14px] font-semibold text-[14px] transition-all cursor-pointer flex items-center justify-between border active:scale-[0.98]",
            mode === "track_end"
              ? "bg-white text-black border-white shadow-md"
              : "bg-white/[0.06] hover:bg-white/[0.12] text-white border-white/[0.08]"
          )}
        >
          <div className="flex items-center gap-2.5">
            <Disc3 className="w-4 h-4 text-brand" />
            <span>End of this track</span>
          </div>
          <span className="text-[12px] text-white/50">Pause at end</span>
        </button>

        {/* Custom Stepper */}
        <div className="p-4 rounded-[16px] bg-white/[0.04] border border-white/[0.08]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-medium text-white/70">Custom time</span>
            <span className="text-[16px] font-bold text-white tabular-nums">
              {customMinutes} min
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCustomMinutes((m) => Math.max(1, m - 5))}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 transition-all flex items-center justify-center text-white"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setTimer(customMinutes, "custom")}
              className="flex-1 h-10 rounded-full bg-white text-black font-semibold text-[13px] hover:bg-white/90 active:scale-[0.98] transition-all"
            >
              Start {customMinutes} min
            </button>
            <button
              type="button"
              onClick={() => setCustomMinutes((m) => Math.min(180, m + 5))}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 transition-all flex items-center justify-center text-white"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}

