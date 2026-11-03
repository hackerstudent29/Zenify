"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ElementType;
}

export interface SegmentedControlProps<T extends string = string> {
  id: string;
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function SegmentedControl<T extends string = string>({
  id,
  value,
  onChange,
  options,
  className,
  size = "md",
}: SegmentedControlProps<T>) {
  const handleClick = (val: T) => {
    if (val !== value) {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(10);
      }
      onChange(val);
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Selection"
      className={cn(
        "relative inline-flex items-center p-1 rounded-full bg-black/40 border border-white/[0.12] backdrop-blur-md",
        size === "sm" && "h-8 text-[12px]",
        size === "md" && "h-10 text-[13px]",
        size === "lg" && "h-12 text-[15px]",
        className
      )}
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        const Icon = option.icon;

        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={isSelected}
            type="button"
            onClick={() => handleClick(option.value)}
            className={cn(
              "relative z-10 flex items-center justify-center gap-1.5 px-4 font-semibold transition-colors duration-150 outline-none select-none cursor-pointer",
              isSelected ? "text-white" : "text-white/60 hover:text-white/85"
            )}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            <span>{option.label}</span>

            {isSelected && (
              <motion.div
                layoutId={`segmented-pill-${id}`}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                className="absolute inset-0 -z-10 rounded-full bg-white/[0.18] border border-white/[0.12] shadow-sm"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

