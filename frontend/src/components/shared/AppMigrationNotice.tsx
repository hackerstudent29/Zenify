"use client";

import React, { useState } from "react";
import { Download, Star, X, Smartphone, AlertTriangle, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface AppMigrationNoticeProps {
  /**
   * 'floating': Floating modal/banner docked in bottom or top for general website pages.
   * 'side-panel': Embedded side-by-side card for auth / login pages.
   */
  variant?: "floating" | "side-panel";
  className?: string;
}

export function AppMigrationNotice({
  variant = "floating",
  className,
}: AppMigrationNoticeProps) {
  // Ephemeral in-memory dismissal: shows again whenever user navigates back or refreshes
  const [dismissed, setDismissed] = useState(false);

  const directApkUrl =
    "https://github.com/hackerstudent29/Zenify/releases/download/v1.1.21/zenify-v1.1.21.apk";
  const githubRepoUrl = "https://github.com/hackerstudent29/Zenify";

  if (dismissed) return null;

  // Render side-panel version (designed specifically for login/signup screen)
  if (variant === "side-panel") {
    return (
      <AnimatePresence>
        <motion.aside
          initial={{ opacity: 0, x: 20, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.94 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          aria-label="Zenify Android App Migration Notice"
          className={cn(
            "relative w-full max-w-[360px] rounded-2xl border border-white/10 bg-zinc-950/90 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.85)] backdrop-blur-2xl text-left select-none",
            className
          )}
        >
          {/* Header Row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand/30 bg-brand/10 text-brand">
                <Smartphone className="h-4 w-4" />
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                Service Migration
              </span>
            </div>

            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss migration notice"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-400 transition-colors hover:bg-white/15 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Heading & Notice Message */}
          <div className="mt-3.5 space-y-2">
            <h2 className="text-base font-bold tracking-tight text-white">
              Switch to Zenify Android App
            </h2>
            <p className="text-[12px] leading-relaxed text-zinc-300">
              We are sunsetting the website player due to browser audio underperformance and increasing ISP/CORS stream blockages.
            </p>
            <p className="text-[11.5px] leading-relaxed text-zinc-400">
              Download the official Android app for unrestricted 320kbps lossless streaming, native video songs, synced lyrics, and zero playback drops.
            </p>
          </div>

          {/* Star Repo Banner */}
          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
            <div className="flex items-center gap-2 text-[11px] text-zinc-300">
              <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 shrink-0" />
              <span>
                Enjoying Zenify? <b className="text-white">Star us on GitHub</b> to help us reach music lovers worldwide!
              </span>
            </div>
          </div>

          {/* Mandatory Signature Action Buttons */}
          <div className="mt-4 flex flex-col gap-2">
            <a
              href={directApkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="h-10 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Download className="h-4 w-4 text-brand" />
              <span>Download v1.1.21 APK</span>
            </a>

            <a
              href={githubRepoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="h-10 px-5 rounded-xl bg-zinc-900/60 hover:bg-zinc-900 border border-white/10 text-zinc-300 hover:text-white text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Star className="h-3.5 w-3.5 text-amber-400" />
              <span>Star Repo on GitHub</span>
              <ExternalLink className="h-3 w-3 text-zinc-500" />
            </a>
          </div>
        </motion.aside>
      </AnimatePresence>
    );
  }

  // Render floating announcement banner for general website pages
  return (
    <AnimatePresence>
      <motion.aside
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 350, damping: 28 }}
        aria-label="Zenify Web Service Migration Advisory"
        className={cn(
          "fixed bottom-24 sm:bottom-28 left-4 sm:left-6 z-50 w-[calc(100vw-2rem)] max-w-[400px] rounded-2xl border border-white/15 bg-zinc-950/95 p-4 sm:p-5 shadow-[0_24px_70px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.08)] backdrop-blur-2xl text-left select-none",
          className
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand/30 bg-brand/10 text-brand">
              <Smartphone className="h-4 w-4" />
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              Important Notice
            </span>
          </div>

          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss migration notice"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-400 transition-colors hover:bg-white/15 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-3 space-y-1.5">
          <h2 className="text-sm sm:text-base font-bold tracking-tight text-white">
            Website Service Stopping Soon
          </h2>
          <p className="text-[11.5px] sm:text-[12px] leading-relaxed text-zinc-300">
            Due to browser audio underperformance and increasing ISP/CORS stream blockages, we are stopping web service. Please switch to the Zenify Android App for unrestricted 320kbps playback, synced lyrics, and zero stream blocks.
          </p>
          <div className="flex items-center gap-1.5 pt-1 text-[11px] text-zinc-400">
            <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 shrink-0" />
            <span>
              Please <b className="text-white">Star our GitHub repo</b> to help reach more people!
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <a
            href={directApkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer flex-1"
          >
            <Download className="h-3.5 w-3.5 text-brand" />
            <span>Download APK</span>
          </a>

          <a
            href={githubRepoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 px-4 rounded-xl bg-zinc-900/60 hover:bg-zinc-900 border border-white/10 text-zinc-300 hover:text-white text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Star className="h-3.5 w-3.5 text-amber-400" />
            <span>Star ⭐</span>
          </a>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
