"use client";

import { motion, MotionConfig } from "framer-motion";
import { ZenifyLogo } from "@/components/shared/ZenifyLogo";
import { SEO } from "@/components/shared/SEO";
import { PageHeader, Section, stagger, rise } from "@/components/shared/PageChrome";
import { 
  Sparkles, 
  Music2, 
  Mic2, 
  Headphones, 
  Languages, 
  Radio, 
  Smartphone, 
  Lock, 
  Zap,
  Heart,
  ListMusic,
  FileAudio,
  Palette,
  Settings2,
  Globe,
  Users
} from "lucide-react";

const coreFeatures = [
  {
    icon: Music2,
    title: "Professional Studio FX Engine",
    body: "Hardware-accelerated audio DSP with 3-band EQ (Bass, Mid, Treble), reorderable FX chain, 8D spatial audio, DJ-style filter, chorus/echo/reverb, vocal isolation, and speed/pitch control—all running natively in your browser.",
  },
  {
    icon: Mic2,
    title: "AI-Powered Synced Lyrics",
    body: "Karaoke-grade synchronized lyrics with Deepgram AI onset alignment for sub-second accuracy. Features word-level timing, automatic instrumental gap detection (• • •), and support for 9 languages with romanization.",
  },
  {
    icon: Headphones,
    title: "8D Spatial Audio & Effects",
    body: "Immersive bi-directional 3D sound that orbits around your headphones with adjustable speed. Includes 10+ built-in presets: After Hours, Immersive, Bass Boost, Vocal Boost, Dream Echo, Lo-Fi, and more.",
  },
  {
    icon: Languages,
    title: "Multilingual Support",
    body: "Native synchronized lyrics for Tamil, Tanglish, Hindi, Telugu, Malayalam, Kannada, Bengali, Punjabi, Gujarati, and English. Automatic romanization preserves synced timing for seamless sing-along.",
  },
  {
    icon: FileAudio,
    title: "Local Audio Player",
    body: "Drag and drop MP3, FLAC, WAV, M4A, AAC files directly into your browser. Zero upload—files never leave your device. Extracts embedded cover art and ID3 tags client-side with full Studio FX support.",
  },
  {
    icon: Radio,
    title: "Intelligent Autoplay & Queue",
    body: "3-tier queue system (User Queue, Context Queue, History) with vibe-based smart radio. AI analyzes mood, tempo, genre, and artist similarity to auto-queue perfect next tracks when your queue ends.",
  },
];

const audioFeatures = [
  {
    title: "3-Band Parametric EQ",
    body: "Fine-tune Bass (110Hz), Mid (1.5kHz), and Treble (8kHz) frequencies with ±12dB range. Live parameter interpolation prevents clicks and pops during adjustment.",
  },
  {
    title: "Reorderable FX Chain",
    body: "Drag-and-drop signal routing customization. Default order: EQ → Filter → Drive → Chorus → Echo → Reverb. Experiment with different orders for creative sound design.",
  },
  {
    title: "Native Vocal Isolation",
    body: "Zero-latency WebAudio Mid-Side processor extracts or isolates vocals/instruments in real-time—no ML model or cloud processing required. Perfect for karaoke and practice.",
  },
  {
    title: "DJ-Style Filter Sweep",
    body: "Continuous high-pass/low-pass filter (20Hz-20kHz) with frequency visualization. Zero-snap reset at center for instant flat response.",
  },
  {
    title: "Speed & Pitch Control",
    body: "Independent speed (0.5x-2.0x) and pitch shifting (-12 to +12 semitones). Tape mode links both for authentic vinyl slowdown/speedup effect. Perfect for Nightcore and Daycore.",
  },
  {
    title: "Advanced Effects Suite",
    body: "Chorus (BBD emulation), Echo with feedback control, Reverb (Small Hall/Cathedral impulse responses), Warmth/Drive (tube saturation), Stereo Width (0% mono to 200% ultra-wide).",
  },
  {
    title: "Night Mode Dynamics",
    body: "Multiband dynamics compressor with makeup gain prevents clipping and ensures consistent volume for comfortable late-night listening without disturbing others.",
  },
  {
    title: "Gapless Playback",
    body: "Dual-buffer system preloads next track 1.5s after play starts, enabling seamless crossfade (0-10s configurable) and zero buffering gaps between songs.",
  },
];

const lyricsFeatures = [
  {
    title: "Word-Level Timing",
    body: "Apple Music-style word-by-word synchronization with <mm:ss.xx> inline timestamps, enabling precise karaoke-grade highlighting that follows your voice.",
  },
  {
    title: "Deepgram AI Alignment",
    body: "Speech-to-text verification ensures lyrics match the actual audio. Automatically detects and corrects timing drift, calibrating onset within 50ms accuracy.",
  },
  {
    title: "Instrumental Gap Detection",
    body: "AI detects long instrumental breaks (>3.2s) and inserts '• • •' markers during intro, interlude, solo, and outro sections to prevent lyric display glitches.",
  },
  {
    title: "Automatic Romanization",
    body: "Real-time romanization for Indian scripts (Devanagari, Tamil, Telugu, Malayalam, Bengali, Gurmukhi, Gujarati, Kannada) preserves synchronized timing for dual-language display.",
  },
  {
    title: "24/7 Autonomous Enrichment",
    body: "Background workers continuously scan and enrich tracks with synced lyrics from multiple sources (LRCLib, lrc.red, Apple Music, Speech-to-Text) without user intervention.",
  },
  {
    title: "Manual Offset Adjustment",
    body: "Fine-tune lyric timing with ±5 second offset control. Adjustments sync across all devices and persist in your account for consistent playback.",
  },
];

const platformFeatures = [
  {
    icon: Palette,
    title: "Liquid Glassmorphism UI",
    body: "Dynamic palette-based reactive backgrounds extract and pulse dominant colors from album art in sync with music beat. Customizable per surface (Full Player, Track Page, Album Page).",
  },
  {
    icon: Smartphone,
    title: "Progressive Web App",
    body: "Install on Windows, macOS, Linux, Android, and iOS. Features lock screen media controls, Bluetooth media button support, offline playback, and native app-like experience without app stores.",
  },
  {
    icon: ListMusic,
    title: "Smart Queue Management",
    body: "Right-side 320px glass panel shows User Queue (preserved during shuffle) and Context Queue (album/playlist tracks). Drag-and-drop reordering, instant play, and track promotion.",
  },
  {
    icon: Settings2,
    title: "Comprehensive Settings",
    body: "Audio quality selection, crossfade duration, autoplay toggle, volume normalization, theme customization (dark/light), accent colors, reactive backgrounds, keyboard shortcuts, and privacy controls.",
  },
  {
    icon: Lock,
    title: "Privacy-First Architecture",
    body: "No ads, trackers, or cookies. Zero data collection. Listening profile stored in browser's IndexedDB. Optional account enables sync across devices while keeping data encrypted.",
  },
  {
    icon: Globe,
    title: "Cross-Platform Sync",
    body: "Create an account to sync playlists, likes, listening history, preferences, and audioFx settings across all your devices seamlessly while maintaining privacy.",
  },
  {
    icon: Users,
    title: "Room Together & Live Voice",
    body: "Host synchronized listening rooms with real-time queue control, LiveKit spatial voice chat, synced karaoke lyrics, live reactions, pinned moments, and shareable PNG recaps.",
  },
];

const howItWorks = [
  {
    title: "Smart Audio Resolution",
    body: "Search queries are cleaned and normalized, then matched against multiple sources. Zenify prioritizes lossless streams when available, falling back gracefully to ensure every track plays.",
  },
  {
    title: "Dual-Buffer Streaming",
    body: "Two audio elements work in tandem—one plays current track while the other preloads next. This enables instant transitions and configurable crossfade without buffering or stuttering.",
  },
  {
    title: "Persistent Player Instance",
    body: "Audio engine lives at the root of React tree, independent of route changes. Navigate anywhere without interrupting playback—no play-abort warnings or dropped connections.",
  },
  {
    title: "Intelligent Caching",
    body: "TanStack Query caches API responses with smart invalidation. Album art and metadata persist in IndexedDB. Lyrics and track data sync automatically when available.",
  },
];

const techStack = [
  ["Frontend Framework", "React 19 + Vite 6"],
  ["UI Components", "Radix UI + Framer Motion + GSAP"],
  ["Styling", "Tailwind CSS 4 with custom tokens"],
  ["State Management", "Zustand + TanStack Query v5"],
  ["Backend API", "Fastify 5.7 + TypeScript"],
  ["Database", "PostgreSQL + Prisma ORM 5.10"],
  ["Background Jobs", "BullMQ + Redis (job queues)"],
  ["AI Services", "Deepgram + OpenAI"],
  ["Audio Processing", "Web Audio API + ffmpeg"],
  ["Cloud Storage", "Cloudflare R2 + AWS S3 + Cloudinary"],
  ["Authentication", "JWT + bcryptjs + Google OAuth"],
  ["Security", "Helmet + CORS + Rate Limiting"],
];

const row = "grid gap-2 py-4 sm:grid-cols-[11rem_1fr] sm:gap-8";
const featureRow = "grid gap-3 py-5 sm:grid-cols-[3rem_11rem_1fr] sm:gap-6";

export default function AboutZenifyPage() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen w-full bg-[#030303] pt-16 sm:pt-20 md:pt-24 pb-40 font-sans text-[#F2F2F3] selection:bg-white/15">
        <SEO
          title="About Zenify – Professional Music Streaming with AI-Powered Synced Lyrics"
          description="Discover Zenify's comprehensive Studio FX audio engine, AI-powered synchronized lyrics in 9 languages, local file playback, and privacy-first architecture. Open source and ad-free."
          path="/about-zenify"
        />

        <PageHeader title="About Zenify" leading={<ZenifyLogo size={16} />} />

        <motion.main
          variants={stagger}
          initial="hidden"
          animate="show"
          className="mx-auto max-w-3xl px-5 pt-8 md:pt-12 space-y-16"
        >
          {/* Hero Introduction */}
          <div className="space-y-4">
            <motion.h2
              variants={rise}
              className="text-[28px] sm:text-[32px] md:text-[36px] font-bold leading-tight tracking-tight text-white"
            >
              Next-Generation Music Streaming
            </motion.h2>
            <motion.p
              variants={rise}
              className="text-[17px] sm:text-[19px] leading-relaxed text-white/70"
            >
              Zenify is an open-source music streaming platform built for music lovers who value pristine audio quality, 
              comprehensive multilingual synced lyrics, and professional-grade audio customization. No ads, no trackers, 
              just pure music experience with studio-grade tools.
            </motion.p>
          </div>

          {/* Core Features */}
          <Section title="Core Features">
            <div className="space-y-6">
              {coreFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <motion.div key={feature.title} variants={rise} className={featureRow}>
                    <div className="flex items-start justify-center sm:justify-start pt-1">
                      <div className="rounded-xl bg-brand/10 p-2 text-brand">
                        <Icon size={20} strokeWidth={2} />
                      </div>
                    </div>
                    <h3 className="text-[16px] font-semibold text-white pt-1">{feature.title}</h3>
                    <p className="text-[15px] leading-relaxed text-white/60">{feature.body}</p>
                  </motion.div>
                );
              })}
            </div>
          </Section>

          {/* Studio FX Audio Engine */}
          <Section title="Studio FX Audio Engine">
            <div className="space-y-4">
              {audioFeatures.map((feature) => (
                <div key={feature.title} className={row}>
                  <h3 className="text-[15px] font-semibold text-white">{feature.title}</h3>
                  <p className="text-[15px] leading-relaxed text-white/55">{feature.body}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* Synchronized Lyrics System */}
          <Section title="AI-Powered Synced Lyrics">
            <div className="space-y-4">
              {lyricsFeatures.map((feature) => (
                <div key={feature.title} className={row}>
                  <h3 className="text-[15px] font-semibold text-white">{feature.title}</h3>
                  <p className="text-[15px] leading-relaxed text-white/55">{feature.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-2xl bg-white/5 p-5 border border-white/10">
              <p className="text-[14px] leading-relaxed text-white/70">
                <span className="font-semibold text-white">Supported Languages:</span> Tamil, Tanglish, Hindi, 
                Telugu, Malayalam, Kannada, Bengali, Punjabi, Gujarati, and English with automatic romanization 
                for Indian scripts.
              </p>
            </div>
          </Section>

          {/* Platform Features */}
          <Section title="Platform & Experience">
            <div className="space-y-6">
              {platformFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <motion.div key={feature.title} variants={rise} className={featureRow}>
                    <div className="flex items-start justify-center sm:justify-start pt-1">
                      <div className="rounded-xl bg-purple-500/10 p-2 text-purple-400">
                        <Icon size={20} strokeWidth={2} />
                      </div>
                    </div>
                    <h3 className="text-[16px] font-semibold text-white pt-1">{feature.title}</h3>
                    <p className="text-[15px] leading-relaxed text-white/60">{feature.body}</p>
                  </motion.div>
                );
              })}
            </div>
          </Section>

          {/* How It Works */}
          <Section title="How Zenify Works">
            {howItWorks.map((step, i) => (
              <div key={step.title} className={row}>
                <h3 className="flex items-baseline gap-3 text-[15px] font-semibold text-white">
                  <span className="w-5 text-brand/70 tabular-nums text-[14px]">{i + 1}.</span>
                  {step.title}
                </h3>
                <p className="text-[15px] leading-relaxed text-white/55">{step.body}</p>
              </div>
            ))}
          </Section>

          {/* Technology Stack */}
          <Section title="Built With Modern Technologies">
            <div className="space-y-2">
              {techStack.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 py-3 text-[15px] border-b border-white/5 last:border-0">
                  <span className="text-white/80 font-medium">{label}</span>
                  <span className="text-white/50 text-right">{value}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* Lyrics & Data Attribution */}
          <Section title="Lyrics & Metadata Attribution">
            <div className="space-y-3">
              <p className="text-[15px] leading-relaxed text-white/60">
                Zenify indexes and streams synchronized word-by-word and line-by-line lyrics powered by open community databases and speech models:
              </p>
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between py-2 border-b border-white/5 text-[14px]">
                  <span className="text-white/80 font-medium">Word-by-word Synchronized Lyrics</span>
                  <a href="https://lrc.red" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">lrc.red & Unison</a>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-white/5 text-[14px]">
                  <span className="text-white/80 font-medium">Community Synced & Plain Lyrics</span>
                  <a href="https://lrclib.net" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">LRCLIB</a>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-white/5 text-[14px]">
                  <span className="text-white/80 font-medium">AI Speech-to-Text Transcription</span>
                  <span className="text-white/50">Deepgram Nova-3 / Nova-2</span>
                </div>
              </div>
            </div>
          </Section>

          {/* Why Zenify */}
          <Section title="Why Choose Zenify?">
            <div className="space-y-5">
              <div className={row}>
                <h3 className="text-[15px] font-semibold text-white">Open Source</h3>
                <p className="text-[15px] leading-relaxed text-white/55">
                  100% open source under MIT license. Inspect the code, contribute features, or self-host your own instance. 
                  Complete transparency in how your music experience works.
                </p>
              </div>
              <div className={row}>
                <h3 className="text-[15px] font-semibold text-white">No Compromise Audio</h3>
                <p className="text-[15px] leading-relaxed text-white/55">
                  Studio-grade audio processing with professional FX suite. Original streams preserved when available—no 
                  double compression or quality loss. Every adjustment happens in real-time with zero latency.
                </p>
              </div>
              <div className={row}>
                <h3 className="text-[15px] font-semibold text-white">Privacy Respected</h3>
                <p className="text-[15px] leading-relaxed text-white/55">
                  No ads, analytics, or tracking pixels. Your listening data stays local in IndexedDB. Optional account 
                  enables sync without compromising privacy. No third-party data sharing—ever.
                </p>
              </div>
              <div className={row}>
                <h3 className="text-[15px] font-semibold text-white">Regional Language Love</h3>
                <p className="text-[15px] leading-relaxed text-white/55">
                  First-class support for Indian regional languages with accurate synchronized lyrics and automatic romanization. 
                  Built by music lovers for music lovers—every language deserves perfect karaoke-grade lyrics.
                </p>
              </div>
            </div>
          </Section>

          {/* Footer */}
          <motion.div variants={rise} className="pt-8 border-t border-white/10 flex items-center justify-between">
            <div>
              <p className="text-[13px] text-white/40">Version 1.0.8</p>
              <p className="text-[12px] text-white/30 mt-1">Built with ❤️ by Ramanathan S</p>
            </div>
            <div className="text-right">
              <p className="text-[12px] text-white/30">MIT License</p>
              <p className="text-[12px] text-white/30 mt-1">© 2026 Zenify</p>
            </div>
          </motion.div>
        </motion.main>
      </div>
    </MotionConfig>
  );
}
