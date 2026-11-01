"use client";

import { motion, MotionConfig } from "framer-motion";
import pkg from "../../../package.json";
import { ZenifyLogo } from "@/components/shared/ZenifyLogo";
import { SEO } from "@/components/shared/SEO";
import { PageHeader, BackButton, Section, stagger, rise } from "@/components/shared/PageChrome";

const features = [
  {
    title: "Lossless sound quality",
    body: "Zenify plays pristine 320kbps streams directly from clean Akamai CDNs and lossless storage without lossy re-encoding or 30-second snippet truncation.",
  },
  {
    title: "Recommendations",
    body: "Suggestions are based on what you listen to, adapting organically to your taste the more you play.",
  },
  {
    title: "Instant full playback",
    body: "Direct HTTPS stream resolution provides immediate playback startup and native HTTP 206 range seeking.",
  },
  {
    title: "Privacy",
    body: "Zero advertisements, third-party trackers, or marketing cookies. Your profile is stored locally in your browser’s IndexedDB.",
  },
];

const steps = [
  {
    title: "Resolve pristine audio",
    body: "Search extracts high-definition metadata and resolves uncompressed 320kbps full-length tracks via JioSaavn Clean CDN and dedicated endpoints.",
  },
  {
    title: "Real-time stream proxy fallback",
    body: "When direct CDN streams aren’t available, our backend proxy preserves audio container headers (MP4 ftyp / WebM EBML) for gapless seeking.",
  },
  {
    title: "Keep the player mounted",
    body: "The HTML5 audio element lives at the root of the React tree, ensuring uninterrupted playback across page transitions with zero DOM abort errors.",
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
      <div className="min-h-screen w-full bg-[#030303] pt-16 sm:pt-20 md:pt-24 pb-40 font-sans text-[#F2F2F3] selection:bg-white/15">
        <SEO
          title="About Zenify – Next-Generation Web Music Player"
          description="Learn about Zenify's open architecture, Web Audio DSP engine, syllable-level synchronized lyrics, and the mission behind ad-free music."
          path="/about-zenify"
        />

        <PageHeader title="About Zenify" leading={<ZenifyLogo size={16} />} />

        <motion.main
          variants={stagger}
          initial="hidden"
          animate="show"
          className="mx-auto max-w-2xl px-5 pt-8 md:pt-12"
        >
          <motion.p
            variants={rise}
            className="text-[20px] sm:text-[24px] md:text-[26px] font-medium leading-snug tracking-tight text-white"
          >
            A web music player with no ads or trackers, built to start playing fast and stay out of the way.
          </motion.p>

          <Section title="What it does">
            {features.map((f) => (
              <div key={f.title} className={row}>
                <h3 className="text-[15px] font-semibold text-white">{f.title}</h3>
                <p className="text-[15px] leading-relaxed text-white/55">{f.body}</p>
              </div>
            ))}
          </Section>

          <Section title="How playback works">
            {steps.map((s, i) => (
              <div key={s.title} className={row}>
                <h3 className="flex items-baseline gap-3 text-[15px] font-semibold text-white">
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
                <span className="text-white/80">{label}</span>
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
