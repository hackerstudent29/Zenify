"use client";

import { motion, type Transition, type Variants } from "framer-motion";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
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

/** Small, translucent top bar. The page title lives here (and is the page's h1). */
export function PageHeader({ title, leading }: { title: string; leading?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-black/50 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex h-12 max-w-2xl items-center justify-center gap-2 px-5 sm:justify-start">
        {leading}
        <h1 className="text-[15px] font-semibold tracking-tight text-white">{title}</h1>
      </div>
    </header>
  );
}

/**
 * Floating back control, bottom-left.
 * If it collides with your mini player, change the `className` bottom offset in one place.
 */
export function BackButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <motion.button
      type="button"
      onClick={() => router.back()}
      aria-label="Go back"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: 0.2 }}
      whileTap={{ scale: 0.9 }}
      className={cn(
        "fixed left-4 z-50 flex size-11 items-center justify-center rounded-full",
        "border border-white/10 bg-white/10 text-white/80 backdrop-blur-2xl outline-none",
        "hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40",
        "bottom-[max(1.25rem,env(safe-area-inset-bottom))] sm:left-8 sm:bottom-8",
        className
      )}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m15 5-7 7 7 7" />
      </svg>
    </motion.button>
  );
}

/** Titled group: small label, then rows separated by hairlines. No card, no background. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <motion.section variants={rise} className="mt-12">
      <h2 className="mb-3 text-[13px] font-medium text-white/45">{title}</h2>
      <div className="divide-y divide-white/[0.08] border-y border-white/[0.08]">{children}</div>
    </motion.section>
  );
}

export const Chevron = ({ className }: { className?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="m9 5 7 7-7 7" />
  </svg>
);
