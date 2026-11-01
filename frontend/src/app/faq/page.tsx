"use client";

import { motion, MotionConfig } from "framer-motion";
import { SEO } from "@/components/shared/SEO";
import { PageHeader, BackButton, Section, stagger, rise } from "@/components/shared/PageChrome";
import { FEATURES, HOMEPAGE_FAQS, faqJsonLd } from "@/lib/homeSeo";

const row = "grid gap-1 py-5 sm:grid-cols-[11rem_1fr] sm:gap-8";

export default function FaqPage() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen w-full bg-[#030303] pt-16 sm:pt-20 md:pt-24 pb-40 font-sans text-[#F2F2F3] selection:bg-white/15">
        <SEO
          title="Zenify Features & FAQ – Synced Lyrics, 8D Audio, Equalizer"
          description="What Zenify can do: synced lyrics for Tamil, Tanglish, Hindi and English, 8D audio, a 3-band equalizer, nightcore and slowed effects, and local file playback."
          path="/faq"
          jsonLd={faqJsonLd}
        />
        <PageHeader title="Features and FAQ" />

        <motion.main variants={stagger} initial="hidden" animate="show" className="mx-auto max-w-2xl px-5 pt-8 md:pt-12">
          <motion.p variants={rise} className="text-[20px] sm:text-[24px] md:text-[26px] font-medium leading-snug tracking-tight text-white">
            A free, open-source web music player. Stream without ads, tune the sound, and follow lyrics in your language.
          </motion.p>

          <Section title="Features">
            {FEATURES.map((f) => (
              <div key={f.title} className={row}>
                <h2 className="text-[15px] font-semibold text-white">{f.title}</h2>
                <p className="text-[15px] leading-relaxed text-white/55">{f.body}</p>
              </div>
            ))}
          </Section>

          <Section title="Questions">
            {HOMEPAGE_FAQS.map((faq) => (
              <div key={faq.question} className={row}>
                <h3 className="text-[15px] font-semibold text-white">{faq.question}</h3>
                <p className="text-[15px] leading-relaxed text-white/55">{faq.answer}</p>
              </div>
            ))}
          </Section>
        </motion.main>

        <BackButton />
      </div>
    </MotionConfig>
  );
}
