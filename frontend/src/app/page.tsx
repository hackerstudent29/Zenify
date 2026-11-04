"use client";

import { useHomepageData } from "@/hooks/useHomepageData";
import { useAuthStore } from "@/store/authStore";
import { usePlayerStore } from "@/store/player";
import { Button } from "@/components/ui/button";
import { motion, MotionConfig, type Variants } from "framer-motion";
import { useRouter } from "next/navigation";
import { ContentRow } from "@/components/shared/ContentRow";
import { MobileHomePage } from "@/components/mobile/MobileHomePage";
import { useIsMobile } from "@/hooks/useIsMobile";
import { SEO } from "@/components/shared/SEO";
import { homeJsonLd } from "@/lib/homeSeo";

// Kept so existing imports of HOMEPAGE_FAQS from this file don't break.
export { HOMEPAGE_FAQS } from "@/lib/homeSeo";

const reveal: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 28 } },
};

const FOOTER_LINKS = [
  { label: "Features and FAQ", href: "/faq" },
  { label: "About Zenify", href: "/about-zenify" },
  { label: "Creator", href: "/about" },
];

export default function Home() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const { user } = useAuthStore();
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const { sections, isLoading: isAllLoading, isError: fetchError } = useHomepageData();

  const hasAnyItems = sections?.some((s: any) => s.items && s.items.length > 0);
  const isError = !isAllLoading && !hasAnyItems && !currentTrack && fetchError;
  const isAdmin = user?.role === "ADMIN";

  const go = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    router.push(href);
  };

  return (
    <MotionConfig reducedMotion="user">
      <SEO
        title="Zenify – Free Music Player with Synced Lyrics & 8D Audio"
        description="Stream millions of songs with sub-second synchronized lyrics in 50+ languages, studio 3-band EQ, 8D spatial audio, and local file playback. Free & ad-free."
        path="/"
        jsonLd={homeJsonLd}
      />

      {/* Visually hidden heading and summary: kept for screen readers and crawlers on every viewport. */}
      <h1 className="sr-only">Zenify: free music player with synced lyrics, 8D audio and an equalizer</h1>
      <p className="sr-only">
        Zenify is a free, open-source web music player. Stream ad-free, tune the sound with a 3-band equalizer, and follow synced lyrics in 50+ global languages with local file playback.
      </p>

      {isError ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="flex h-[80vh] flex-col items-center justify-center gap-5 px-6 text-center"
        >
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight text-white">Can’t reach the server</h2>
            <p className="mx-auto max-w-xs text-sm leading-relaxed text-white/50">
              Check your connection and try again.
            </p>
            {import.meta.env.DEV && (
              <p className="pt-2 font-mono text-xs text-white/25">
                {import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL || "Local engine (3000)"}
              </p>
            )}
          </div>
          <motion.div whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.03 }} transition={{ type: "spring", stiffness: 420, damping: 24 }}>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
              className="rounded-full border-white/15 bg-transparent px-7 hover:bg-white/[0.06]"
            >
              Try again
            </Button>
          </motion.div>
        </motion.div>
      ) : isMobile ? (
        <MobileHomePage />
      ) : (
        <div className="relative min-h-screen pb-24 pt-[88px] md:pt-[104px]">
          <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(140,130,220,0.07),transparent)]" />

          <div className="relative z-10 space-y-10 md:space-y-12">
            {!hasAnyItems && !isAllLoading ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 28 }}
                className="mx-auto flex max-w-sm flex-col items-center px-6 py-32 text-center"
              >
                <h2 className="text-2xl font-semibold tracking-tight text-white">
                  {isAdmin ? "No music yet" : "Coming soon"}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-white/50">
                  {isAdmin
                    ? "Upload the first track from the admin console and it will show up here."
                    : "We’re adding new music right now. Check back shortly."}
                </p>
                {isAdmin && (
                  <motion.div className="mt-6" whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.03 }} transition={{ type: "spring", stiffness: 420, damping: 24 }}>
                    <Button
                      onClick={() => router.push("/admin")}
                      className="rounded-full border border-white/10 bg-white/10 px-7 text-sm font-medium text-white hover:bg-white/15"
                    >
                      Open admin console
                    </Button>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <>
                <motion.div
                  variants={reveal}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true }}
                  className="px-4 sm:px-6 md:px-8"
                >
                  <div
                    onClick={() => router.push('/day-mix')}
                    className="group relative cursor-pointer overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r from-amber-500/15 via-rose-500/15 to-purple-500/15 p-6 backdrop-blur-xl transition-all duration-300 hover:border-white/20 active:scale-[0.99]"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold tracking-widest text-brand uppercase">
                          MADE FOR YOU • FRESH DAILY
                        </span>
                        <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                          Your Daily Flow
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white/10 border border-white/10 text-white/80">
                            Day Mix
                          </span>
                        </h3>
                        <p className="text-xs sm:text-sm text-white/60">
                          Personalized soundtrack adapting to your morning, afternoon, evening, and late night cadence.
                        </p>
                      </div>
                      <Button
                        className="h-10 px-5 rounded-xl bg-zinc-900 group-hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all shrink-0 cursor-pointer"
                      >
                        Listen Now
                      </Button>
                    </div>
                  </div>
                </motion.div>
                {sections?.map(
                (section: any, idx: number) =>
                  (section.isLoading || (section.items && section.items.length > 0)) && (
                    <motion.div
                      key={section.id || `${section.type}-${section.title || idx}`}
                      variants={reveal}
                      initial="hidden"
                      whileInView="show"
                      viewport={{ once: true, margin: "0px 0px -80px 0px" }}
                    >
                      <ContentRow
                        title={section.title}
                        subtitle={section.subtitle}
                        items={section.items}
                        isLoading={section.isLoading}
                        seeAllHref={`/section/${section.type}`}
                      />
                    </motion.div>
                  )
                )}
              </>
            )}
          </div>

          {/* Real links to the indexable pages. Quiet, but visible and crawlable. */}
          <nav aria-label="More about Zenify" className="relative z-10 mx-auto mt-20 max-w-6xl px-6 sm:px-10">
            <ul className="flex flex-wrap gap-x-6 gap-y-2 border-t border-white/[0.08] pt-6 text-[13px] text-white/40">
              {FOOTER_LINKS.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    onClick={go(l.href)}
                    className="rounded outline-none transition-colors hover:text-white focus-visible:text-white focus-visible:underline"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}
    </MotionConfig>
  );
}
