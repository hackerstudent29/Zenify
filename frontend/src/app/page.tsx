"use client";

import { useHomepageData } from "@/hooks/useHomepageData";
import { useAuthStore } from "@/store/authStore";
import { usePlayerStore } from "@/store/player";
import { Button } from "@/components/ui/button";
import { Info, Music, Sparkles, Sliders, Waves, FastForward, HardDrive, ShieldCheck } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ContentRow } from "@/components/shared/ContentRow";
import { cn } from "@/lib/utils";
import { MobileHomePage } from "@/components/mobile/MobileHomePage";
import { useIsMobile } from "@/hooks/useIsMobile";
import { SEO } from "@/components/shared/SEO";

export const HOMEPAGE_FAQS = [
  {
    question: "What is Zenify?",
    answer: "Zenify is a free, modern web and mobile music player featuring instant audio playback, sub-second synchronized lyrics, 8D spatial audio, and dynamic visualizer themes.",
  },
  {
    question: "How can I listen to music on Zenify for free?",
    answer: "You can stream music on Zenify directly in your web browser at listenzenify.vercel.app without paying any subscription fees or encountering audio interruptions.",
  },
  {
    question: "Does Zenify support synchronized lyrics?",
    answer: "Yes, Zenify includes an AI-powered lyrics alignment engine with syllable-level timing and instrumental solo gap protection across English, Tamil, Tanglish, Hindi, and international tracks.",
  },
  {
    question: "What audio effects and DSP features are built in?",
    answer: "Zenify includes a studio 3-band equalizer, binaural 8D spatial panning, convolution reverb simulations (hall and cathedral), and nightcore/slowed DJ pitch warper.",
  },
  {
    question: "Can I play my own local audio files in Zenify?",
    answer: "Yes! Zenify includes an in-browser local audio scanner that parses ID3 tags for MP3, FLAC, WAV, and AAC files directly on your device with 100% privacy.",
  },
];

const softwareAppSchema = {
  "@type": "SoftwareApplication",
  "@id": "https://listenzenify.vercel.app/#application",
  "name": "Zenify Music Streaming Platform",
  "operatingSystem": "Web Browser, Android, iOS, Windows, macOS",
  "applicationCategory": "MultimediaApplication",
  "applicationSubCategory": "Music & Audio Streaming",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD",
  },
  "description": "Zenify is a free open-source modern music streaming platform with Web Audio DSP effects (3-band EQ, 8D spatial audio, convolution reverb, DJ speed/pitch), sub-second AI synchronized multilingual lyrics, and local file playback.",
  "author": {
    "@type": "Person",
    "name": "hackerstudent29",
    "url": "https://github.com/hackerstudent29",
  },
  "featureList": [
    "Studio 3-Band Equalizer & Biquad Audio Filters",
    "8D Spatial Audio Binaural Panning Engine",
    "DJ Speed & Pitch Warper (Nightcore & Daycore Slowed Mode)",
    "Convolution Reverb Acoustic Simulation (Small Hall & Cathedral)",
    "Sub-Second AI Synchronized Lyrics (Tamil, Tanglish, Hindi, Malayalam, English)",
    "Smart Instrumental & Solo Gap Protection ([BGM], [Guitar Solo])",
    "Administrative Karaoke Lyric Sync Studio with LRC Export",
    "Real-Time Reactive Audio FFT Canvas Visualizer",
    "Liquid Glass UI with Dynamic Album Artwork Color Aura Extraction",
    "Browser Local Audio Scanner & In-Browser ID3 Tag Parser (MP3, FLAC, WAV, AAC)",
    "Dual-Buffer Gapless Web Audio Player with Crossfade",
    "Instant iTunes CDN AAC Audio Lookup with HTTP 206 Stream Proxy",
    "Dynamic Mood Stations (Deep Focus, Midnight Chill, Energy)",
    "Offline PWA with Lock-Screen MediaSession API Controls",
  ],
};

const faqPageSchema = {
  "@type": "FAQPage",
  "@id": "https://listenzenify.vercel.app/#faq",
  "mainEntity": HOMEPAGE_FAQS.map((faq) => ({
    "@type": "Question",
    "name": faq.question,
    "acceptedAnswer": {
      "@type": "Answer",
      "text": faq.answer,
    },
  })),
};

const homeJsonLd = {
  "@context": "https://schema.org",
  "@graph": [softwareAppSchema, faqPageSchema],
};

export default function Home() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const { user } = useAuthStore();
  const currentTrack = usePlayerStore(state => state.currentTrack);

  const { sections, isLoading: isAllLoading, isError: fetchError } = useHomepageData();

  // Extract items but strictly filter out non-playable entities from the "Tracks" stream
  const allTracks = sections?.flatMap((s: any) => s.items || []).filter((item: any) => 
    !item.isArtist && !item.isAlbum && !item.isMood && !item.isPlaylist
  ) || [];

  const hasAnyItems = sections?.some((s: any) => s.items && s.items.length > 0);
  const isError = !isAllLoading && !hasAnyItems && !currentTrack && fetchError;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] gap-6 px-6 text-center">
        <SEO
          title="Zenify – Free Music Player with Synced Lyrics & 8D Audio"
          description="Free open-source web music player with sub-second synced lyrics for Tamil, Tanglish, Hindi & English, 8D audio, a 3-band EQ and nightcore/slowed effects."
          path="/"
          jsonLd={homeJsonLd}
        />
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <Info className="text-red-500 w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-white uppercase tracking-widest">Connection Refused</h2>
          <p className="text-xs text-white/40 max-w-xs leading-relaxed uppercase tracking-wider font-bold">The Archive is currently unreachable. Please check your connection or try again.</p>
          <p className="text-[10px] text-white/20 uppercase tracking-[0.2em] mt-4">
            Attempting: {(import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL) || 'Local Engine (3000)'}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => window.location.reload()}
          className="rounded-full px-8 bg-white/5 border-white/10 hover:bg-white/10"
        >
          Retry Connection
        </Button>
      </div>
    );
  }

  return (
    <>
      <SEO
        title="Zenify – Free Music Player with Synced Lyrics & 8D Audio"
        description="Free open-source web music player with sub-second synced lyrics for Tamil, Tanglish, Hindi & English, 8D audio, a 3-band EQ and nightcore/slowed effects."
        path="/"
        jsonLd={homeJsonLd}
      />
      {isMobile ? (
        <MobileHomePage />
      ) : (
        <div className="space-y-8 md:space-y-12 pb-24 pt-[88px] md:pt-[104px] min-h-screen bg-background">
          <div className="space-y-12 px-0">
            {!hasAnyItems && !isAllLoading ? (
              <div className="flex flex-col items-center justify-center py-24 px-6 text-center border border-dashed border-white/5 rounded-3xl bg-white/[0.02] mx-4 md:mx-6">
                <div className="w-16 h-16 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center mb-6">
                  <Music className="text-brand w-8 h-8" />
                </div>
                <h2 className={cn(
                  "text-xl font-bold mb-2 uppercase tracking-widest transition-colors duration-500",
                  user?.role === 'ADMIN' ? "text-white" : "text-brand drop-shadow-[0_0_8px_rgba(var(--accent-brand-rgb),0.4)]"
                )}>
                  {user?.role === 'ADMIN' ? "The Archive is Empty" : "Coming Soon"}
                </h2>
                <p className={cn(
                  "text-sm max-w-sm mb-8 leading-relaxed font-medium transition-colors duration-500",
                  user?.role === 'ADMIN' ? "text-white/40" : "text-brand/60"
                )}>
                  {user?.role === 'ADMIN'
                    ? <>Your sonic journey begins here. Be the first to upload a frequency to the <span className="font-zenify">zenify</span> network.</>
                    : "We are currently adding new music to the archive. This section will be ready for you very soon!"
                  }
                </p>
                {user?.role === 'ADMIN' && (
                  <Button
                    onClick={() => router.push('/admin')}
                    className="rounded-full h-10 px-8 bg-white/10 text-brand border border-white/5 hover:bg-white/20 font-bold uppercase tracking-wider text-[10px]"
                  >
                    Admin Console
                  </Button>
                )}
              </div>
            ) : (
              sections?.map((section: any) => (
                (section.isLoading || (section.items && section.items.length > 0)) && (
                  <ContentRow
                    key={section.type}
                    title={section.title}
                    subtitle={section.subtitle}
                    items={section.items}
                    isLoading={section.isLoading}
                    seeAllHref={`/section/${section.type}`}
                  />
                )
              ))
            )}
          </div>

          {/* SEO & Discoverability Server-Renderable Section */}
          <section className="mt-16 mb-20 px-6 sm:px-10 max-w-6xl mx-auto border-t border-white/10 pt-12 text-zinc-300">
            <header className="mb-12">
              <h1 className="text-2xl sm:text-4xl font-black font-sans text-white tracking-tight leading-tight">
                Free Music Player with Synced Lyrics, 8D Audio &amp; Equalizer
              </h1>
              <p className="mt-3 text-sm sm:text-base text-zinc-400 max-w-3xl leading-relaxed">
                Zenify is a high-performance open-source web music streaming platform designed for audiophiles and lyric enthusiasts. Stream millions of tracks ad-free, adjust precision acoustic frequencies, and experience real-time synchronized multilingual lyrics directly in your browser.
              </p>
            </header>

            <div className="mb-14">
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight mb-6">
                Core Audio &amp; Streaming Features
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
                  <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-brand" />
                    Multilingual Synced Lyrics
                  </h3>
                  <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                    Sub-second syllable-level lyric synchronization for Tamil, Tanglish, Hindi, Malayalam, and English songs with instrumental gap skip protection.
                  </p>
                </div>
                <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
                  <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-brand" />
                    Studio 3-Band Equalizer
                  </h3>
                  <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                    Fine-tune bass, mids, and treble frequencies with professional biquad Web Audio filters calibrated for crystal-clear acoustic fidelity.
                  </p>
                </div>
                <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
                  <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                    <Waves className="w-4 h-4 text-brand" />
                    8D Spatial Audio Panning
                  </h3>
                  <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                    Immerse yourself in 360-degree binaural spatial audio that rotates dynamically around your headphone soundstage.
                  </p>
                </div>
                <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
                  <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                    <FastForward className="w-4 h-4 text-brand" />
                    Nightcore &amp; Slowed Warper
                  </h3>
                  <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                    Seamlessly shift playback speed and pitch in real-time to create custom nightcore, daycore, or slowed-and-reverb listening sessions.
                  </p>
                </div>
                <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
                  <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-brand" />
                    Local File Playback
                  </h3>
                  <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                    Play your private MP3, FLAC, WAV, and AAC music files straight from your device with zero cloud uploads and full offline security.
                  </p>
                </div>
                <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
                  <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-brand" />
                    Lossless Crossfade &amp; Cache
                  </h3>
                  <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                    Dual-buffer audio pipeline enabling instantaneous gapless track transitions, background playback, and offline PWA capabilities.
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-10">
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight mb-6">
                Frequently Asked Questions
              </h2>
              <div className="space-y-6">
                {HOMEPAGE_FAQS.map((faq, idx) => (
                  <article key={idx} className="border-b border-white/5 pb-5 last:border-b-0">
                    <h3 className="text-base font-semibold text-white mb-2">
                      {faq.question}
                    </h3>
                    <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                      {faq.answer}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
