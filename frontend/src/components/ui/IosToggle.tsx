"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface IosToggleProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export function IosToggle({
  id,
  checked,
  onCheckedChange,
  disabled = false,
  label,
  className,
}: IosToggleProps) {
  const handleToggle = () => {
    if (disabled) return;
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(10);
    }
    onCheckedChange(!checked);
  };

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={handleToggle}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full p-0.5",
        "transition-colors duration-200 ease-in-out outline-none focus-visible:ring-2 focus-visible:ring-white/40",
        checked ? "bg-emerald-500" : "bg-white/20",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className={cn(
          "pointer-events-none block h-6 w-6 rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.3)]",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}

