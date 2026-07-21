"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

interface AnimatedHeartButtonProps {
  isLiked?: boolean;
  onToggleLike?: (e: React.MouseEvent) => void;
  size?: number;
  className?: string;
  showEqualizerAnimation?: boolean;
}

export function AnimatedHeartButton({
  isLiked = false,
  onToggleLike,
  size = 20,
  className,
}: AnimatedHeartButtonProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 900);
    if (onToggleLike) {
      onToggleLike(e);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={isLiked ? "Unlike track" : "Like track"}
      className={cn(
        "relative flex items-center justify-center p-2 rounded-full transition-colors focus:outline-none select-none group",
        isLiked ? "text-rose-500 hover:text-rose-400" : "text-zinc-400 hover:text-white",
        className
      )}
    >
      <AnimatePresence mode="wait">
        {isAnimating ? (
          /* ZenLoading 4-bar equalizer design animation when like/dislike is clicked */
          <motion.div
            key="equalizer-bars"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center justify-center gap-[3px] h-5 w-5"
          >
            {[0, 1, 2, 3].map((i) => (
              <motion.div
                key={i}
                className="w-[3px] bg-gradient-to-t from-rose-600 via-rose-500 to-pink-400 rounded-full shadow-[0_0_8px_rgba(244,63,94,0.6)]"
                animate={{
                  height: ["25%", "100%", "25%"],
                }}
                transition={{
                  duration: 0.6,
                  repeat: 1,
                  ease: "easeInOut",
                  delay: i * 0.1,
                }}
              />
            ))}
          </motion.div>
        ) : (
          /* Normal Heart Icon with pop/bounce micro-interaction */
          <motion.div
            key="heart-icon"
            whileTap={{ scale: 0.75 }}
            animate={{
              scale: isLiked ? [1, 1.35, 0.9, 1.1, 1] : 1,
              rotate: isLiked ? [0, -12, 12, -6, 0] : 0,
            }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="relative flex items-center justify-center"
          >
            <Heart
              size={size}
              className={cn(
                "transition-all duration-300",
                isLiked
                  ? "fill-rose-500 stroke-rose-500 drop-shadow-[0_0_10px_rgba(244,63,94,0.5)]"
                  : "stroke-current fill-none group-hover:scale-110"
              )}
            />
            {/* Sparkle ring burst effect on liked */}
            {isLiked && (
              <motion.span
                initial={{ scale: 0, opacity: 0.8 }}
                animate={{ scale: 1.8, opacity: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="absolute inset-0 rounded-full border-2 border-rose-500/80 pointer-events-none"
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}
