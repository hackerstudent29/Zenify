"use client";

import React from "react";
import { motion } from "framer-motion";
import { ZenifyLogo } from "@/components/shared/ZenifyLogo";

export function AnimatedLoginLogo() {
  const letters = [
    {
      char: "z",
      initial: { y: -45, opacity: 0, rotate: -20, scale: 0.5 },
      animate: { y: 0, opacity: 1, rotate: 0, scale: 1 },
      transition: { type: "spring", stiffness: 450, damping: 18, delay: 0.1 },
    },
    {
      char: "e",
      initial: { rotateY: 180, opacity: 0, scale: 0.4 },
      animate: { rotateY: 0, opacity: 1, scale: 1 },
      transition: { duration: 0.6, ease: "easeOut", delay: 0.2 },
    },
    {
      char: "n",
      initial: { scale: 0, opacity: 0, y: 20 },
      animate: { scale: [0, 1.35, 1], opacity: 1, y: 0 },
      transition: { duration: 0.5, ease: "backOut", delay: 0.3 },
    },
    {
      char: "i",
      initial: { x: -35, opacity: 0, scale: 0.6 },
      animate: { x: 0, opacity: 1, scale: 1 },
      transition: { type: "spring", stiffness: 400, damping: 16, delay: 0.4 },
    },
    {
      char: "f",
      initial: { rotate: -180, scale: 0.2, opacity: 0 },
      animate: { rotate: 0, scale: 1, opacity: 1 },
      transition: { duration: 0.6, ease: "easeOut", delay: 0.5 },
    },
    {
      char: "y",
      initial: { x: 35, opacity: 0, rotate: 15 },
      animate: { x: 0, opacity: 1, rotate: 0 },
      transition: { type: "spring", stiffness: 350, damping: 15, delay: 0.6 },
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center select-none">
      {/* Logo Icon with Pulse & Glow */}
      <motion.div
        initial={{ scale: 0, opacity: 0, rotate: -45 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.05 }}
        className="relative mb-3"
      >
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.4, 0.8, 0.4],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute inset-0 rounded-full bg-rose-500/30 blur-xl pointer-events-none"
        />
        <ZenifyLogo size={56} />
      </motion.div>

      {/* Letter-by-Letter Animated Brand Typography */}
      <div className="flex items-center gap-0.5 tracking-tight font-black font-brand text-3xl sm:text-4xl text-transparent bg-clip-text bg-gradient-to-r from-rose-500 via-pink-400 to-white drop-shadow-[0_0_20px_rgba(244,63,94,0.6)]">
        {letters.map((item, idx) => (
          <motion.span
            key={idx}
            initial={item.initial}
            animate={item.animate}
            transition={item.transition as any}
            whileHover={{ scale: 1.25, rotate: idx % 2 === 0 ? 10 : -10 }}
            className="inline-block transition-transform cursor-pointer"
          >
            {item.char}
          </motion.span>
        ))}
      </div>
    </div>
  );
}
