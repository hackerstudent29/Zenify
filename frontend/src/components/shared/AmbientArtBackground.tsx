"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface AmbientArtBackgroundProps {
  coverUrl?: string;
  className?: string;
}

export function AmbientArtBackground({ coverUrl, className }: AmbientArtBackgroundProps) {
  if (!coverUrl) return null;

  return (
    <div className={cn("absolute inset-0 z-0 overflow-hidden bg-black pointer-events-none", className)}>
      {/* 
        We use AnimatePresence so if the cover changes, 
        the old one fades out smoothly while the new one fades in.
      */}
      <AnimatePresence mode="wait">
        <motion.div
          key={coverUrl}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
          className="absolute inset-0"
        >
          {/* Base Layer - anchors the primary colors of the art */}
          <motion.img
            src={coverUrl}
            alt="ambient-bg-base"
            className="absolute inset-0 w-[150%] h-[150%] -left-[25%] -top-[25%] object-cover origin-center"
            style={{
              filter: "blur(80px) saturate(150%) brightness(0.7)",
            }}
            animate={{
              scale: [1, 1.4, 1.1, 1.3, 1],
              rotate: [0, 90, 180, 270, 360],
              x: ["0%", "-10%", "10%", "-5%", "0%"],
              y: ["0%", "10%", "-10%", "5%", "0%"],
            }}
            transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Layer 2 - Floating colors moving wildly */}
          <motion.img
            src={coverUrl}
            alt="ambient-bg-layer1"
            className="absolute inset-0 w-[200%] h-[200%] -left-[50%] -top-[50%] object-cover opacity-70 mix-blend-screen"
            style={{
              filter: "blur(120px) saturate(200%) brightness(0.8)",
            }}
            animate={{
              x: ["-20%", "30%", "-30%", "20%", "-20%"],
              y: ["-30%", "20%", "30%", "-20%", "-30%"],
              scale: [1, 1.5, 1.1, 1.6, 1],
              rotate: [0, 120, -120, 90, 0],
            }}
            transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Layer 3 - Floating colors moving wildly opposite */}
          <motion.img
            src={coverUrl}
            alt="ambient-bg-layer2"
            className="absolute inset-0 w-[200%] h-[200%] -left-[50%] -top-[50%] object-cover opacity-60 mix-blend-overlay"
            style={{
              filter: "blur(140px) saturate(180%) brightness(0.9)",
            }}
            animate={{
              x: ["30%", "-20%", "40%", "-30%", "30%"],
              y: ["20%", "-40%", "-20%", "30%", "20%"],
              scale: [1.3, 1, 1.5, 1.2, 1.3],
              rotate: [0, -180, 180, -90, 0],
            }}
            transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Just a light darkening overlay to ensure text readability without killing the color */}
          <div className="absolute inset-0 bg-black/25 pointer-events-none" />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
