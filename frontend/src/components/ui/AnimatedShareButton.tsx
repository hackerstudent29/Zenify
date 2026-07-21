"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Share2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface AnimatedShareButtonProps {
  onShare?: (e: React.MouseEvent) => void;
  shareUrl?: string;
  shareTitle?: string;
  size?: number;
  className?: string;
}

export function AnimatedShareButton({
  onShare,
  shareUrl,
  shareTitle,
  size = 18,
  className,
}: AnimatedShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);

    if (shareUrl && typeof window !== "undefined") {
      if (navigator.share) {
        navigator.share({
          title: shareTitle || "Zenify Music",
          url: shareUrl,
        }).catch(() => {});
      } else {
        navigator.clipboard.writeText(shareUrl);
      }
    }

    if (onShare) {
      onShare(e);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Share track"
      className={cn(
        "relative flex items-center justify-center p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors focus:outline-none select-none group",
        copied && "text-emerald-400 hover:text-emerald-300",
        className
      )}
    >
      <AnimatePresence mode="wait">
        {copied ? (
          <motion.div
            key="check-icon"
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: [0, 1.3, 1], rotate: 0 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="flex items-center justify-center"
          >
            <Check size={size} className="stroke-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
          </motion.div>
        ) : (
          <motion.div
            key="share-icon"
            whileTap={{ scale: 0.75, rotate: -20 }}
            whileHover={{ scale: 1.15, rotate: 12 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            className="flex items-center justify-center"
          >
            <Share2 size={size} className="stroke-current" />
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}
