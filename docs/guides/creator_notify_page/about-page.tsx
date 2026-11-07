"use client";

import { useState } from "react";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import pkg from "../../../package.json";
import { SEO } from "@/components/shared/SEO";
import { PageHeader, BackButton, Section, Chevron, stagger, rise, spring } from "@/components/shared/PageChrome";
import "@fontsource/zalando-sans-semiexpanded/latin-400.css";
import "@fontsource/zalando-sans-semiexpanded/latin-500.css";
import "@fontsource/zalando-sans-semiexpanded/latin-700.css";
import "@fontsource/zalando-sans-semiexpanded/latin-900.css";

const UPI_ID = "ramanathanb86@oksbi";

const LINKS = [
  { label: "Instagram", value: "@ramzendrum", href: "https://www.instagram.com/ramzendrum?igsh=MXBkYXE4YnZmdHN0A==", external: true },
  { label: "Spotify", value: "Ram", href: "https://open.spotify.com/artist/3imsDaYqTYfQZ8ZhSjMD4T?si=PcXvQrghS5O7Y65u5eIc6A", external: true },
  { label: "Email", value: "ramzendrum@gmail.com", href: "mailto:ramzendrum@gmail.com", external: false },
];

export default function AboutPage() {
  const [isBurning, setIsBurning] = useState(false);
  const [copied, setCopied] = useState(false);

  const triggerBurn = () => {
    if (isBurning) return;
    setIsBurning(true);
    setTimeout(() => setIsBurning(false), 3000);
  };

  const copyUpi = async () => {
    try {
      await navigator.clipboard.writeText(UPI_ID);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked; the ID is still selectable */
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div
        className="min-h-screen w-full bg-[#0A0A0C] pb-40 text-white selection:bg-white/15"
        style={{ fontFamily: '"Zalando Sans SemiExpanded", sans-serif' }}
      >
        <SEO
          title="Creator & Developer – Zenify Music"
          description="Meet the creator behind Zenify, an open-source audio streaming platform featuring real-time DSP, lyrics synchronization, and modern web tech."
          path="/about"
        />
        <PageHeader title="Ram" />

        <motion.main variants={stagger} initial="hidden" animate="show" className="mx-auto max-w-2xl px-5 pt-10 md:pt-14">
          {/* Intro */}
          <motion.div variants={rise} className="flex items-center gap-5">
            <button
              type="button"
              onClick={triggerBurn}
              aria-label="Profile photo"
              className="group relative size-24 shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/40 sm:size-28"
            >
              <div className="relative size-full overflow-hidden rounded-full bg-zinc-900">
                <motion.img
                  src="/ram_profile.jpg"
                  alt="Ram"
                  onError={(e) => ((e.currentTarget as HTMLImageElement).src = "/logo.png")}
                  animate={
                    isBurning
                      ? {
                          scale: [1, 1.05, 0.95],
                          opacity: [1, 0.5, 0],
                          filter: ["grayscale(1) brightness(1)", "grayscale(0) brightness(5) saturate(2)", "grayscale(0) brightness(0)"],
                        }
                      : { scale: 1, opacity: 1, filter: "grayscale(1) brightness(1.1) contrast(1.2)" }
                  }
                  transition={isBurning ? { duration: 2, times: [0, 0.3, 1] } : { duration: 0.5 }}
                  className="size-full object-cover transition-all duration-700 group-hover:grayscale-0"
                />
                <AnimatePresence>
                  {isBurning && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: [0, 1, 1, 0], scale: [0.8, 1.2, 1.5] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 2.5, ease: "easeOut" }}
                      className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-orange-600 via-red-600 to-yellow-400 mix-blend-screen"
                      style={{ maskImage: "radial-gradient(circle, black, transparent 70%)", WebkitMaskImage: "radial-gradient(circle, black, transparent 70%)" }}
                    />
                  )}
                </AnimatePresence>
              </div>
              <AnimatePresence>
                {isBurning &&
                  Array.from({ length: 10 }).map((_, i) => (
                    <motion.span
                      key={i}
                      initial={{ opacity: 0, x: 0, y: 0 }}
                      animate={{ opacity: [0, 1, 0], x: (Math.random() - 0.5) * 140, y: -90 - Math.random() * 90, scale: [0, 1, 0] }}
                      transition={{ duration: 1 + Math.random(), delay: Math.random() * 0.5 }}
                      className="pointer-events-none absolute left-1/2 top-1/2 size-1.5 rounded-full bg-orange-500 blur-[1px]"
                    />
                  ))}
              </AnimatePresence>
            </button>

            <div className="min-w-0">
              <p className="text-lg font-semibold tracking-tight">Music producer</p>
              <p className="mt-0.5 text-sm text-white/45">Chennai, India</p>
            </div>
          </motion.div>

          {/* Bio */}
          <motion.div variants={rise} className="mt-8 space-y-4 text-[17px] leading-[1.6] text-white/75">
            <p>
              I make remixes and original tracks, mixing traditional production with AI tools. I don’t just re-edit old songs. I rebuild them from the ground up so they feel like new music.
            </p>
            <p>
              I use AI for ideas, textures and sound design, then finish everything by hand. The goal is music that sounds clean and still feels human.
            </p>
            <p>I work across genres, from EDM to lo-fi, and I like trying things I haven’t done before.</p>
          </motion.div>

          {/* Links */}
          <Section title="Find me">
            {LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                {...(l.external ? { target: "_blank", rel: "noreferrer" } : {})}
                className="group flex items-center justify-between gap-4 py-3.5 text-[15px] outline-none transition-opacity active:opacity-60 focus-visible:bg-white/[0.04]"
              >
                <span>{l.label}</span>
                <span className="flex min-w-0 items-center gap-1.5 text-white/45 transition-colors group-hover:text-white/80">
                  <span className="truncate">{l.value}</span>
                  <Chevron className="shrink-0 transition-transform duration-300 group-hover:translate-x-0.5" />
                </span>
              </a>
            ))}
          </Section>

          {/* Support */}
          <Section title="Support Zenify">
            <div className="py-4 text-[15px] leading-relaxed text-white/60">
              Zenify is free, open source and has no ads. I’m building it on my own (hackerstudent29). Domains and hosting cost money every month, and your support helps cover that and gives me more time to work on it.
            </div>
            <div className="flex items-center justify-between gap-4 py-3.5">
              <div className="min-w-0">
                <p className="text-xs text-white/45">UPI ID</p>
                <p className="select-all break-all font-mono text-[15px]">{UPI_ID}</p>
              </div>
              <motion.button
                type="button"
                onClick={copyUpi}
                whileTap={{ scale: 0.94 }}
                transition={spring}
                className="relative h-8 min-w-[64px] shrink-0 rounded-full border border-white/15 px-3.5 text-[13px] font-medium outline-none hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-white/40"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={copied ? "copied" : "copy"}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                    className="block"
                  >
                    {copied ? "Copied" : "Copy"}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
            </div>
            <p className="py-3.5 text-xs text-white/40">Works with GPay, PhonePe, Paytm and BHIM.</p>
          </Section>

          <motion.p variants={rise} className="mt-12 text-xs text-white/30">
            Version {pkg.version}
          </motion.p>
        </motion.main>

        <BackButton />
      </div>
    </MotionConfig>
  );
}
