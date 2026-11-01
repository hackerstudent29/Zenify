"use client";

import React, { type ReactNode } from "react";
import { motion, type Transition, type Variants } from "framer-motion";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export const spring: Transition = { type: "spring", stiffness: 420, damping: 34 };

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

export const rise: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 30 } },
};

/**
 * Top bar with back button and page title.
 * Designed with top clearance so it never overlaps behind the layout TopBar.
 */
export function PageHeader({
  title,
  leading,
  showBack = true,
}: {
  title: string;
  leading?: ReactNode;
  showBack?: boolean;
}) {
  const router = useRouter();
  return (
    <div className="w-full border-b border-white/[0.06] bg-[#0A0A0C]/50 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-5">
        <div className="flex items-center gap-3">
          {showBack && (
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Go back"
              className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          {leading}
          <h1 className="text-[15px] font-semibold tracking-tight text-white">{title}</h1>
        </div>
      </div>
    </div>
  );
}

/**
 * Clean inline Back control that never overlaps fixed sidebars or bottom player bars.
 */
export function BackButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <div className={cn("mx-auto max-w-2xl px-5 pt-8", className)}>
      <motion.button
        type="button"
        onClick={() => router.back()}
        aria-label="Go back"
        whileTap={{ scale: 0.94 }}
        transition={spring}
        className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold text-white/80 backdrop-blur-2xl transition-all hover:bg-white/20 hover:text-white"
      >
        <ChevronLeft size={15} />
        <span>Back</span>
      </motion.button>
    </div>
  );
}

/** Titled group: small label, then rows separated by hairlines. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <motion.section variants={rise} className="mt-12">
      <h2 className="mb-3 text-[13px] font-medium text-white/45">{title}</h2>
      <div className="divide-y divide-white/[0.08] border-y border-white/[0.08]">{children}</div>
    </motion.section>
  );
}

export const Chevron = ({ className }: { className?: string }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <path d="m9 5 7 7-7 7" />
  </svg>
);
