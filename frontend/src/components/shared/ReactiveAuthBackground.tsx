"use client";

import React, { useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

interface ReactiveAuthBackgroundProps {
  className?: string;
}

export function ReactiveAuthBackground({ className }: ReactiveAuthBackgroundProps) {
  // Track mouse coordinates relative to window center
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Smooth spring interpolations for mouse tracking
  const springConfig = { damping: 50, stiffness: 150, mass: 1 };
  const forceX = useSpring(mouseX, springConfig);
  const forceY = useSpring(mouseY, springConfig);

  // Parallax motion values: opposite directions or scaled multipliers
  const oppositeXVal = useTransform(mouseX, (x) => x * -0.6);
  const oppositeYVal = useTransform(mouseY, (y) => y * -0.6);
  const oppositeX = useSpring(oppositeXVal, springConfig);
  const oppositeY = useSpring(oppositeYVal, springConfig);

  const subXVal = useTransform(mouseX, (x) => x * 0.3);
  const subYVal = useTransform(mouseY, (y) => y * -0.4);
  const subX = useSpring(subXVal, springConfig);
  const subY = useSpring(subYVal, springConfig);

  const centralXVal = useTransform(mouseX, (x) => x * 0.15);
  const centralYVal = useTransform(mouseY, (y) => y * 0.15);
  const centralX = useSpring(centralXVal, springConfig);
  const centralY = useSpring(centralYVal, springConfig);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Coordinates normalized relative to center of screen
      const x = e.clientX - window.innerWidth / 2;
      const y = e.clientY - window.innerHeight / 2;
      mouseX.set(x);
      mouseY.set(y);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [mouseX, mouseY]);

  return (
    <div
      className={cn(
        "absolute inset-0 overflow-hidden pointer-events-none z-0 bg-[#1f1f1f]",
        className
      )}
    >
      {/* Dynamic interactive gradient layer */}
      <div className="absolute inset-0 opacity-70" style={{ filter: "blur(120px)" }}>
        {/* Blob 1: Rose/Pink (Drifts with mouse) */}
        <motion.div
          className="absolute -top-[10%] left-[10%] w-[60%] h-[70%] rounded-full opacity-60"
          style={{
            background: "radial-gradient(circle at center, rgba(244, 63, 94, 0.15) 0%, transparent 70%)",
            x: forceX,
            y: forceY,
          }}
          animate={{
            scale: [1, 1.05, 0.95, 1],
            rotate: [0, 90, 180, 360],
          }}
          transition={{
            duration: 35,
            repeat: Infinity,
            ease: "linear",
          }}
        />

        {/* Blob 2: Violet/Purple (Drifts in opposite direction for parallax) */}
        <motion.div
          className="absolute top-[20%] -right-[10%] w-[65%] h-[75%] rounded-full opacity-50"
          style={{
            background: "radial-gradient(circle at center, rgba(168, 85, 247, 0.12) 0%, transparent 70%)",
            x: oppositeX,
            y: oppositeY,
          }}
          animate={{
            scale: [1, 0.95, 1.05, 1],
            rotate: [0, -120, -240, -360],
          }}
          transition={{
            duration: 40,
            repeat: Infinity,
            ease: "linear",
          }}
        />

        {/* Blob 3: Teal/Indigo (Drifts slightly differently) */}
        <motion.div
          className="absolute -bottom-[20%] left-[20%] w-[55%] h-[65%] rounded-full opacity-60"
          style={{
            background: "radial-gradient(circle at center, rgba(20, 184, 166, 0.14) 0%, transparent 70%)",
            x: subX,
            y: subY,
          }}
          animate={{
            scale: [1, 1.08, 0.92, 1],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Blob 4: Soft Amber (Centered, very slow, slight lag) */}
        <motion.div
          className="absolute top-[25%] left-[25%] w-[50%] h-[50%] rounded-full opacity-40"
          style={{
            background: "radial-gradient(circle at center, rgba(245, 158, 11, 0.08) 0%, transparent 70%)",
            x: centralX,
            y: centralY,
          }}
        />
      </div>

      {/* Dotted Grid Overlay for visual depth and premium texture */}
      <div 
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px)`,
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(circle at center, black 40%, transparent 90%)",
          WebkitMaskImage: "radial-gradient(circle at center, black 40%, transparent 90%)",
        }}
      />
      
      {/* Subtle vignettes / card background container highlight */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,#1f1f1f_90%)] opacity-80" />
    </div>
  );
}
