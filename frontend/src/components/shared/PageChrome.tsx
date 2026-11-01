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
  showBack = false,
}: {
  title: string;
  leading?: ReactNode;
  showBack?: boolean;
}) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 w-full border-b border-white/[0.06] bg-[#0A0A0C]/80 backdrop-blur-xl">
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
    </header>
  );
}

/**
 * Universal back button lives in TopBar beside search.
 * This component is kept as a no-op placeholder for backwards compatibility.
 */
export function BackButton({ className: _className }: { className?: string } = {}) {
  return null;
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

