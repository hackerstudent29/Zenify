"use client";

import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  CloudUpload, CheckCircle2, ChevronDown, ChevronUp, X, 
  Sparkles, Loader2, HardDrive, ShieldCheck 
} from "lucide-react";
import { useCloudSyncStore } from "@/store/cloudSyncStore";
import { cn } from "@/lib/utils";

export function CloudSyncSidePopup() {
  const { 
    isSyncing, 
    isMinimized, 
    totalCount, 
    syncedCount, 
    remainingCount, 
    failedCount, 
    currentSongTitle, 
    toggleMinimize, 
    dismissPopup,
    checkAndUpdateSyncProgress
  } = useCloudSyncStore();

  // On component mount or tab focus, verify latest sync state
  useEffect(() => {
    checkAndUpdateSyncProgress();
    const interval = setInterval(checkAndUpdateSyncProgress, 5000);
    return () => clearInterval(interval);
  }, [checkAndUpdateSyncProgress]);

  if (totalCount === 0) return null;

  const progressPercent = totalCount > 0 ? Math.min(100, Math.round((syncedCount / totalCount) * 100)) : 0;
  const isComplete = syncedCount >= totalCount || (!isSyncing && remainingCount === 0);

  return (
    <AnimatePresence>
      {totalCount > 0 && (
        <motion.div
          initial={{ opacity: 0, x: 50, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 50, scale: 0.9 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className={cn(
            "fixed z-[9990] transition-all duration-300 pointer-events-auto",
            "bottom-24 right-4 md:right-6 md:bottom-6"
          )}
        >
          {isMinimized ? (
            /* Minimized Sleek Pill Badge */
            <motion.div 
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={toggleMinimize}
              className="flex items-center gap-3 px-4 py-2.5 rounded-full bg-zinc-900/95 border border-white/15 shadow-2xl backdrop-blur-2xl cursor-pointer group hover:border-brand/50 transition-colors"
            >
              <div className="relative flex items-center justify-center">
                {isComplete ? (
                  <CheckCircle2 size={16} className="text-emerald-400" />
                ) : (
                  <CloudUpload size={16} className="text-brand animate-pulse" />
                )}
                {!isComplete && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                )}
              </div>
              <div className="flex items-center gap-2 text-xs font-bold font-sans">
                <span className="text-white">Cloud Sync</span>
                <span className="text-emerald-400 font-mono">{syncedCount}</span>
                <span className="text-zinc-500">/</span>
                <span className="text-zinc-400 font-mono">{totalCount}</span>
                {remainingCount > 0 && (
                  <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
                    {remainingCount} left
                  </span>
                )}
              </div>
              <ChevronUp size={14} className="text-zinc-400 group-hover:text-white transition-colors ml-1" />
            </motion.div>
          ) : (
            /* Expanded Side Popup Panel */
            <div className="w-[320px] sm:w-[350px] rounded-2xl bg-zinc-950/95 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-3xl p-4 overflow-hidden relative">
              {/* Top Bar Header */}
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/5">
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center border shrink-0",
                    isComplete 
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                      : "bg-brand/10 border-brand/30 text-brand"
                  )}>
                    {isComplete ? <CheckCircle2 size={18} /> : <CloudUpload size={18} className="animate-pulse" />}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white tracking-tight flex items-center gap-1.5">
                      Cloud DB Sync
                      {isComplete ? (
                        <span className="text-[9px] font-bold uppercase bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                          Complete
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold uppercase bg-brand/10 text-brand px-1.5 py-0.5 rounded-full border border-brand/20 flex items-center gap-1">
                          <Loader2 size={10} className="animate-spin" /> Active
                        </span>
                      )}
                    </h3>
                    <p className="text-[10px] text-zinc-400 font-medium truncate max-w-[200px]">
                      {isComplete ? "All songs stored safely in Cloud DB" : currentSongTitle || "Syncing in background..."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={toggleMinimize}
                    className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    title="Minimize Popup"
                  >
                    <ChevronDown size={14} />
                  </button>
                  <button
                    onClick={dismissPopup}
                    className="p-1 rounded-lg hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
                    title="Dismiss"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Progress & Stat Cards Grid */}
              <div className="py-3">
                <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                  <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-400/80">Synced</p>
                    <p className="text-sm font-extrabold font-mono text-emerald-400 leading-tight mt-0.5">{syncedCount}</p>
                  </div>
                  <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-amber-400/80">Remaining</p>
                    <p className="text-sm font-extrabold font-mono text-amber-400 leading-tight mt-0.5">{remainingCount}</p>
                  </div>
                  <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Total Songs</p>
                    <p className="text-sm font-extrabold font-mono text-white leading-tight mt-0.5">{totalCount}</p>
                  </div>
                </div>

                {/* Animated Progress Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400 px-0.5">
                    <span>Progress</span>
                    <span className="font-bold text-emerald-400">{progressPercent}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-zinc-900 border border-white/5 overflow-hidden p-0.5">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-brand via-purple-500 to-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.5)]"
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPercent}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
              </div>

              {/* Background Guarantee Footer Notice */}
              <div className="pt-2.5 border-t border-white/5 flex items-center justify-between text-[10px] text-zinc-400 font-medium">
                <span className="flex items-center gap-1 text-emerald-400 font-bold">
                  <ShieldCheck size={12} />
                  Background Active
                </span>
                <span className="text-zinc-500 italic">Okay to close browser tab</span>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
