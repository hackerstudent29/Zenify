"use client";

import { motion, MotionConfig } from "framer-motion";
import pkg from "../../../package.json";
import { ZenifyLogo } from "@/components/shared/ZenifyLogo";
import { SEO } from "@/components/shared/SEO";
import { PageHeader, BackButton, Section, stagger, rise } from "@/components/shared/PageChrome";

const features = [
  {
    title: "Sound quality",
    body: "Where possible, Zenify plays the original AAC streams from the iTunes CDN instead of re-encoding them, so the audio isn’t compressed a second time.",
  },
  {
    title: "Recommendations",
    body: "Suggestions are based on what you listen to, so they get better the more you play.",
  },
  {
    title: "Fast playback",
    body: "Zenify skips extra metadata lookups and goes straight to a direct HTTPS stream, so tracks start quickly and seeking works.",
  },
  {
    title: "Privacy",
    body: "No ads, trackers or cookies. Your listening profile is kept in your browser’s local IndexedDB storage.",
  },
];

const steps = [
  {
    title: "Find a preview",
    body: "Search cleans up track titles by removing video tags and extra text, then checks the iTunes CDN first for a direct AAC preview.",
  },
  {
    title: "Fall back to the proxy",
    body: "If there’s no CDN match, the stream goes through our backend proxy. It keeps the original MP4 or WebM headers so the browser can decode and seek natively.",
  },
  {
    title: "Keep the player mounted",
    body: "The audio element lives at the root of the React tree, so moving between pages doesn’t interrupt playback or cause play-abort warnings.",
  },
];

const stack = [
  ["Frontend", "Vite 6 and React 19"],
  ["Styling", "Tailwind 4"],
  ["State", "Zustand"],
  ["Streaming", "Fastify on Node"],
];

const row = "grid gap-1 py-5 sm:grid-cols-[11rem_1fr] sm:gap-8";

export default function AboutZenifyPage() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen w-full bg-[#030303] pb-40 font-sans text-[#F2F2F3] selection:bg-white/15">
        <SEO
          title="About Zenify – Next-Generation Web Music Player"
          description="Learn about Zenify's open architecture, Web Audio DSP engine, syllable-level synchronized lyrics, and the mission behind ad-free music."
          path="/about-zenify"
        />
        <PageHeader title="About Zenify" leading={<ZenifyLogo size={16} />} />

        <motion.main variants={stagger} initial="hidden" animate="show" className="mx-auto max-w-2xl px-5 pt-10 md:pt-14">
          <motion.p variants={rise} className="text-[22px] font-medium leading-snug tracking-tight text-white sm:text-[26px]">
            A web music player with no ads or trackers, built to start playing fast and stay out of the way.
          </motion.p>

          <Section title="What it does">
            {features.map((f) => (
              <div key={f.title} className={row}>
                <h3 className="text-[15px] font-semibold">{f.title}</h3>
                <p className="text-[15px] leading-relaxed text-white/55">{f.body}</p>
              </div>
            ))}
          </Section>

          <Section title="How playback works">
            {steps.map((s, i) => (
              <div key={s.title} className={row}>
                <h3 className="flex items-baseline gap-3 text-[15px] font-semibold">
                  <span className="w-3 text-white/35 tabular-nums">{i + 1}</span>
                  {s.title}
                </h3>
                <p className="text-[15px] leading-relaxed text-white/55">{s.body}</p>
              </div>
            ))}
          </Section>

          <Section title="Built with">
            {stack.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 py-3.5 text-[15px]">
                <span>{label}</span>
                <span className="text-white/50">{value}</span>
              </div>
            ))}
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
