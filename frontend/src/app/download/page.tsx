"use client";

import React, { useState } from "react";
import { motion, MotionConfig } from "framer-motion";
import { SEO } from "@/components/shared/SEO";
import { PageHeader, Section, stagger, rise } from "@/components/shared/PageChrome";
import { 
  Download, 
  Smartphone, 
  QrCode, 
  ShieldCheck, 
  CheckCircle2, 
  Sparkles, 
  Headphones, 
  Music, 
  Radio, 
  Sliders, 
  Mic2, 
  HardDrive, 
  ExternalLink,
  Apple,
  Monitor,
  Copy,
  Check,
  Users
} from "lucide-react";

export default function DownloadPage() {
  const [activeTab, setActiveTab] = useState<"android" | "ios" | "desktop">("android");
  const [copied, setCopied] = useState(false);

  // Fallback download URLs
  const apkDownloadUrl = "/downloads/zenify.apk";
  const githubReleaseUrl = "https://github.com/hackerstudent29/Zenify/releases/tag/v1.1.11";
  const directApkDownloadUrl = "https://github.com/hackerstudent29/Zenify/releases/download/v1.1.11/zenify-v1.1.11.apk";
  const universalApkDownloadUrl = "https://github.com/hackerstudent29/Zenify/releases/download/v1.1.11/zenify-v1.1.11-universal.apk";
  const absoluteDownloadUrl = typeof window !== "undefined" 
    ? `${window.location.origin}/downloads/zenify.apk`
    : "https://listenzenify.vercel.app/downloads/zenify.apk";

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
    absoluteDownloadUrl
  )}&format=svg&color=ffffff&bgcolor=18181b`;

  const copyLink = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(absoluteDownloadUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen w-full bg-[#030303] pt-24 sm:pt-28 md:pt-32 pb-40 font-sans text-[#F2F2F3] selection:bg-white/15">
        <SEO
          title="Download Zenify APK (v1.1.11) – Ad-Free Music for Android, iOS & Desktop"
          description="Download the Zenify v1.1.11 Android APK package directly to your phone. 100% ad-free, 320kbps lossless streaming, YouTube video streaming, Room Together, synchronized lyrics, and Studio FX."
          keywords={[
            "download zenify apk",
            "zenify android app",
            "free ad-free music app apk",
            "music player with synced lyrics apk",
            "zenify pwa download"
          ]}
          path="/download"
          jsonLd={{
            "@context": "https://schema.org",
            "@type": "MobileApplication",
            name: "Zenify Music Player",
            operatingSystem: "Android 8.0+",
            softwareVersion: "1.1.11",
            applicationCategory: "MultimediaApplication",
            applicationSubCategory: "Music & Audio",
            downloadUrl: "https://listenzenify.vercel.app/downloads/zenify.apk",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            description:
              "Free ad-free Android music player with 320kbps streaming, Room Together live synced listening rooms, native Studio FX DSP, and syllable-synced lyrics.",
          }}
        />

        <PageHeader title="Download Zenify App" />

        <motion.main
          variants={stagger}
          initial="hidden"
          animate="show"
          className="mx-auto max-w-4xl px-5 pt-4 md:pt-8"
        >
          {/* Top Badge & Hero */}
          <motion.div variants={rise} className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand/10 border border-brand/20 text-brand text-[11px] font-bold uppercase tracking-wider">
              <Sparkles size={13} className="text-brand" />
              <span>Mobile Release v1.1.11 Available</span>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black font-sans uppercase tracking-tight text-white leading-tight">
              Get Zenify on Your Phone
            </h1>

            <p className="text-base sm:text-lg text-zinc-400 font-medium leading-relaxed max-w-2xl">
              Experience ad-free, studio-grade music streaming anywhere. Listen to pristine 320kbps Akamai CDN audio, sing along with live syllable-synced lyrics, and sculpt your sound with hardware-accelerated studio FX.
            </p>
          </motion.div>

          {/* Primary Action Hero Block */}
          <motion.div
            variants={rise}
            className="mt-10 rounded-2xl bg-zinc-900/60 border border-white/10 p-6 sm:p-8 backdrop-blur-xl relative overflow-hidden shadow-2xl"
          >
            <div className="absolute -right-20 -bottom-20 w-80 h-80 rounded-full bg-brand/10 blur-3xl pointer-events-none" />

            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
              {/* Left Column: Download Controls */}
              <div className="md:col-span-7 space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-brand text-xs font-bold uppercase tracking-widest">
                    <Smartphone size={16} />
                    <span>Android Application Package (APK)</span>
                  </div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">
                    Zenify for Android
                  </h2>
                  <p className="text-zinc-400 text-sm leading-relaxed">
                    Direct installation package. No app store account required, no trackers, and zero audio advertisements.
                  </p>
                </div>

                {/* Primary Download Buttons */}
                <div className="flex flex-wrap items-stretch sm:items-center gap-3 pt-2">
                  <a
                    href={apkDownloadUrl}
                    download="zenify.apk"
                    className="h-12 px-6 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-xs font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-3 cursor-pointer shadow-lg hover:border-brand/40"
                  >
                    <Download size={18} className="text-brand shrink-0" />
                    <span>Download APK (15.2 MB)</span>
                  </a>

                  <a
                    href={universalApkDownloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="h-12 px-5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/90 text-xs font-semibold tracking-wider transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Download size={15} className="text-zinc-400" />
                    <span>Universal (34.7 MB)</span>
                  </a>

                  <a
                    href={githubReleaseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="h-12 px-5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/90 text-xs font-semibold tracking-wider transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ExternalLink size={15} className="text-zinc-400" />
                    <span>GitHub Releases</span>
                  </a>
                </div>

                {/* Package Quick Specs */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 text-[11px] text-zinc-400">
                  <div className="flex flex-col">
                    <span className="text-zinc-500 uppercase font-bold tracking-wider text-[9px]">Version</span>
                    <span className="text-white font-medium">v1.1.11 (Build 15)</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-zinc-500 uppercase font-bold tracking-wider text-[9px]">Package Size</span>
                    <span className="text-white font-medium">15.2 MB (ARM64)</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-zinc-500 uppercase font-bold tracking-wider text-[9px]">Compatibility</span>
                    <span className="text-white font-medium">Android 8.0+</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
                  <span>Clean package: Verified ad-free, spyware-free & open-source</span>
                </div>
              </div>

              {/* Right Column: Scan to Download QR Code */}
              <div className="md:col-span-5 flex flex-col items-center justify-center text-center p-6 rounded-xl bg-black/40 border border-white/5">
                <div className="relative group">
                  <div className="w-48 h-48 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-center p-3 shadow-inner overflow-hidden">
                    <img
                      src={qrImageUrl}
                      alt="Scan QR code with phone camera to download Zenify APK"
                      className="w-full h-full object-contain rounded-lg"
                      loading="lazy"
                    />
                  </div>
                  <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-brand/30 pointer-events-none" />
                </div>

                <div className="mt-4 space-y-1">
                  <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-white uppercase tracking-wider">
                    <QrCode size={14} className="text-brand" />
                    <span>Scan with Phone Camera</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 max-w-[200px] leading-tight">
                    Point your camera at this QR code to download the APK directly to your phone.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={copyLink}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-zinc-300 transition-colors cursor-pointer"
                >
                  {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  <span>{copied ? "Link Copied!" : "Copy APK Link"}</span>
                </button>
              </div>
            </div>
          </motion.div>

          {/* Installation Guides by Platform */}
          <Section title="Installation Instructions">
            {/* Platform Selector Tabs */}
            <div className="flex items-center gap-2 py-4 border-b border-white/[0.08]">
              <button
                type="button"
                onClick={() => setActiveTab("android")}
                className={`h-9 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === "android"
                    ? "bg-brand text-white shadow-md shadow-brand/20"
                    : "bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/5"
                }`}
              >
                <Smartphone size={14} />
                <span>Android (APK)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("ios")}
                className={`h-9 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === "ios"
                    ? "bg-brand text-white shadow-md shadow-brand/20"
                    : "bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/5"
                }`}
              >
                <Apple size={14} />
                <span>iPhone / iPad (PWA)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("desktop")}
                className={`h-9 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === "desktop"
                    ? "bg-brand text-white shadow-md shadow-brand/20"
                    : "bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/5"
                }`}
              >
                <Monitor size={14} />
                <span>Desktop App</span>
              </button>
            </div>

            {/* Tab 1: Android APK Step-by-Step */}
            {activeTab === "android" && (
              <div className="divide-y divide-white/[0.08]">
                <div className="grid gap-2 py-5 sm:grid-cols-[13rem_1fr] sm:gap-8 items-start">
                  <div>
                    <div className="flex items-center gap-2 text-brand font-bold text-xs uppercase tracking-wider">
                      <span className="w-5 h-5 rounded-full bg-brand/20 flex items-center justify-center text-[10px]">1</span>
                      <span>Download APK</span>
                    </div>
                    <h3 className="text-base font-semibold text-white mt-1">Save Package</h3>
                  </div>
                  <p className="text-[14px] leading-relaxed text-zinc-400">
                    Tap <strong className="text-white">Download APK</strong> or scan the QR code with your phone camera. If Google Chrome displays a message stating <em className="text-zinc-300">"File might be harmful"</em>, tap <strong className="text-white">Download anyway</strong>. This is standard Android security verification for apps installed outside the Google Play Store.
                  </p>
                </div>

                <div className="grid gap-2 py-5 sm:grid-cols-[13rem_1fr] sm:gap-8 items-start">
                  <div>
                    <div className="flex items-center gap-2 text-brand font-bold text-xs uppercase tracking-wider">
                      <span className="w-5 h-5 rounded-full bg-brand/20 flex items-center justify-center text-[10px]">2</span>
                      <span>Open File</span>
                    </div>
                    <h3 className="text-base font-semibold text-white mt-1">Notification or Files</h3>
                  </div>
                  <p className="text-[14px] leading-relaxed text-zinc-400">
                    Once the 13.7 MB download completes, tap <strong className="text-white">Open</strong> from your notification drawer, or launch your phone's <strong className="text-white">Files</strong> / <strong className="text-white">Downloads</strong> application and tap <code className="px-1.5 py-0.5 rounded bg-white/10 text-white text-xs">zenify.apk</code>.
                  </p>
                </div>

                <div className="grid gap-2 py-5 sm:grid-cols-[13rem_1fr] sm:gap-8 items-start">
                  <div>
                    <div className="flex items-center gap-2 text-brand font-bold text-xs uppercase tracking-wider">
                      <span className="w-5 h-5 rounded-full bg-brand/20 flex items-center justify-center text-[10px]">3</span>
                      <span>Permission</span>
                    </div>
                    <h3 className="text-base font-semibold text-white mt-1">Allow Unknown Apps</h3>
                  </div>
                  <p className="text-[14px] leading-relaxed text-zinc-400">
                    If prompted with <em className="text-zinc-300">"For your security, your phone is not allowed to install unknown apps from this source"</em>, tap <strong className="text-white">Settings</strong> and toggle on <strong className="text-white">Allow from this source</strong> for your browser or file manager.
                  </p>
                </div>

                <div className="grid gap-2 py-5 sm:grid-cols-[13rem_1fr] sm:gap-8 items-start">
                  <div>
                    <div className="flex items-center gap-2 text-brand font-bold text-xs uppercase tracking-wider">
                      <span className="w-5 h-5 rounded-full bg-brand/20 flex items-center justify-center text-[10px]">4</span>
                      <span>Install & Enjoy</span>
                    </div>
                    <h3 className="text-base font-semibold text-white mt-1">Launch Zenify</h3>
                  </div>
                  <p className="text-[14px] leading-relaxed text-zinc-400">
                    Tap <strong className="text-white">Install</strong>. In a few seconds, installation will complete. Tap <strong className="text-white">Open</strong> to begin streaming high-fidelity audio with synced lyrics, background playback, and studio EQ!
                  </p>
                </div>
              </div>
            )}

            {/* Tab 2: iPhone / iPad PWA */}
            {activeTab === "ios" && (
              <div className="divide-y divide-white/[0.08]">
                <div className="grid gap-2 py-5 sm:grid-cols-[13rem_1fr] sm:gap-8 items-start">
                  <div>
                    <div className="flex items-center gap-2 text-brand font-bold text-xs uppercase tracking-wider">
                      <span className="w-5 h-5 rounded-full bg-brand/20 flex items-center justify-center text-[10px]">1</span>
                      <span>Open Safari</span>
                    </div>
                    <h3 className="text-base font-semibold text-white mt-1">Visit Zenify</h3>
                  </div>
                  <p className="text-[14px] leading-relaxed text-zinc-400">
                    Open <strong className="text-white">Safari</strong> on your iPhone or iPad and navigate to <code className="px-1.5 py-0.5 rounded bg-white/10 text-white text-xs">listenzenify.vercel.app</code>.
                  </p>
                </div>

                <div className="grid gap-2 py-5 sm:grid-cols-[13rem_1fr] sm:gap-8 items-start">
                  <div>
                    <div className="flex items-center gap-2 text-brand font-bold text-xs uppercase tracking-wider">
                      <span className="w-5 h-5 rounded-full bg-brand/20 flex items-center justify-center text-[10px]">2</span>
                      <span>Share Menu</span>
                    </div>
                    <h3 className="text-base font-semibold text-white mt-1">Tap Share</h3>
                  </div>
                  <p className="text-[14px] leading-relaxed text-zinc-400">
                    Tap the <strong className="text-white">Share</strong> icon at the bottom of the Safari toolbar (the square with an arrow pointing upward).
                  </p>
                </div>

                <div className="grid gap-2 py-5 sm:grid-cols-[13rem_1fr] sm:gap-8 items-start">
                  <div>
                    <div className="flex items-center gap-2 text-brand font-bold text-xs uppercase tracking-wider">
                      <span className="w-5 h-5 rounded-full bg-brand/20 flex items-center justify-center text-[10px]">3</span>
                      <span>Add to Home Screen</span>
                    </div>
                    <h3 className="text-base font-semibold text-white mt-1">Install Icon</h3>
                  </div>
                  <p className="text-[14px] leading-relaxed text-zinc-400">
                    Scroll down the share sheet and tap <strong className="text-white">Add to Home Screen</strong>, then tap <strong className="text-white">Add</strong> in the top right corner. Zenify is now installed on your home screen with a standalone app frame and lock-screen playback controls!
                  </p>
                </div>
              </div>
            )}

            {/* Tab 3: Desktop PWA */}
            {activeTab === "desktop" && (
              <div className="divide-y divide-white/[0.08]">
                <div className="grid gap-2 py-5 sm:grid-cols-[13rem_1fr] sm:gap-8 items-start">
                  <div>
                    <div className="flex items-center gap-2 text-brand font-bold text-xs uppercase tracking-wider">
                      <span className="w-5 h-5 rounded-full bg-brand/20 flex items-center justify-center text-[10px]">1</span>
                      <span>Browser Prompt</span>
                    </div>
                    <h3 className="text-base font-semibold text-white mt-1">Address Bar Icon</h3>
                  </div>
                  <p className="text-[14px] leading-relaxed text-zinc-400">
                    Open Zenify in Google Chrome, Microsoft Edge, or Brave on Windows, macOS, or Linux. Look for the <strong className="text-white">Install</strong> button (computer screen with a down arrow) on the right side of the URL bar.
                  </p>
                </div>

                <div className="grid gap-2 py-5 sm:grid-cols-[13rem_1fr] sm:gap-8 items-start">
                  <div>
                    <div className="flex items-center gap-2 text-brand font-bold text-xs uppercase tracking-wider">
                      <span className="w-5 h-5 rounded-full bg-brand/20 flex items-center justify-center text-[10px]">2</span>
                      <span>Install App</span>
                    </div>
                    <h3 className="text-base font-semibold text-white mt-1">Native Window</h3>
                  </div>
                  <p className="text-[14px] leading-relaxed text-zinc-400">
                    Click <strong className="text-white">Install</strong>. Zenify opens immediately in its own borderless window, fully integrated with your operating system's media keys (<kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white text-xs">Play/Pause</kbd>, <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white text-xs">Next</kbd>, <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white text-xs">Previous</kbd>) and spotlight search (<kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white text-xs">Ctrl + K</kbd>).
                  </p>
                </div>
              </div>
            )}
          </Section>

          {/* Core Mobile Features */}
          <Section title="Why Listen with Zenify Mobile">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-4">
              <div className="p-5 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
                <div className="flex items-center gap-2.5 text-brand font-bold text-sm">
                  <Music size={18} />
                  <span>320kbps Akamai CDN Audio</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  High-bitrate, crystal clear sound resolved directly from low-latency content delivery networks. Instant seeking and zero buffering.
                </p>
              </div>

              <div className="p-5 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
                <div className="flex items-center gap-2.5 text-brand font-bold text-sm">
                  <Sliders size={18} />
                  <span>Hardware Audio FX & 8D</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Native 3-band parametric equalizer, dynamic bass boost, spatial 8D headphone rotation, and speed/pitch warper.
                </p>
              </div>

              <div className="p-5 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
                <div className="flex items-center gap-2.5 text-brand font-bold text-sm">
                  <Mic2 size={18} />
                  <span>Syllable-Synced Karaoke Lyrics</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Real-time karaoke highlighting with automatic instrumental break indicators across multilingual releases (Tamil, Hindi, English & more).
                </p>
              </div>

              <div className="p-5 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
                <div className="flex items-center gap-2.5 text-brand font-bold text-sm">
                  <HardDrive size={18} />
                  <span>Offline Cache & Local Files</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Cache tracks for offline listening on planes or commutes, or play your personal device MP3/FLAC collection privately without uploads.
                </p>
              </div>

              <div className="p-5 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
                <div className="flex items-center gap-2.5 text-brand font-bold text-sm">
                  <Users size={18} />
                  <span>Room Together & Live Voice</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Host persistent real-time listening rooms with LiveKit spatial voice chat, synced karaoke lyrics, reactions, pinned moments, song requests, and PNG recaps.
                </p>
              </div>

              <div className="p-5 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
                <div className="flex items-center gap-2.5 text-brand font-bold text-sm">
                  <Radio size={18} />
                  <span>SF Pro & Dynamic Island</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Bundled native SF Pro typography, Dynamic Island live ticker notifications, redesigned Search, and spring-animated OTP & Onboarding sheets.
                </p>
              </div>
            </div>
          </Section>

          {/* Technical Specifications Table */}
          <Section title="Technical Package Information">
            <div className="divide-y divide-white/[0.08] text-xs">
              <div className="grid py-3 sm:grid-cols-[13rem_1fr] sm:gap-8">
                <span className="text-zinc-500 font-medium">Application Identifier</span>
                <span className="text-white font-mono">com.zenify.mobile</span>
              </div>
              <div className="grid py-3 sm:grid-cols-[13rem_1fr] sm:gap-8">
                <span className="text-zinc-500 font-medium">Release Version</span>
                <span className="text-white">v1.1.11 (Build 15) — November 14, 2026</span>
              </div>
              <div className="grid py-3 sm:grid-cols-[13rem_1fr] sm:gap-8">
                <span className="text-zinc-500 font-medium">Package Format</span>
                <span className="text-white">Optimized ARM64 APK (.apk) • Universal Multi-ABI Fallback</span>
              </div>
              <div className="grid py-3 sm:grid-cols-[13rem_1fr] sm:gap-8">
                <span className="text-zinc-500 font-medium">File Size</span>
                <span className="text-white">15.2 MB (ARM64) • 34.7 MB (Universal)</span>
              </div>
              <div className="grid py-3 sm:grid-cols-[13rem_1fr] sm:gap-8">
                <span className="text-zinc-500 font-medium">ARM64 SHA-256</span>
                <span className="text-white font-mono text-[11px] break-all">Release Build 15 Verified</span>
              </div>
              <div className="grid py-3 sm:grid-cols-[13rem_1fr] sm:gap-8">
                <span className="text-zinc-500 font-medium">Universal SHA-256</span>
                <span className="text-white font-mono text-[11px] break-all">Release Build 15 Verified</span>
              </div>
              <div className="grid py-3 sm:grid-cols-[13rem_1fr] sm:gap-8">
                <span className="text-zinc-500 font-medium">Minimum Operating System</span>
                <span className="text-white">Android 8.0 (API Level 26) or later</span>
              </div>
              <div className="grid py-3 sm:grid-cols-[13rem_1fr] sm:gap-8">
                <span className="text-zinc-500 font-medium">Engine & Architecture</span>
                <span className="text-white">Flutter 3.44.2 • Dart 3.12.2 • Kotlin • Android Media3 ExoPlayer</span>
              </div>
              <div className="grid py-3 sm:grid-cols-[13rem_1fr] sm:gap-8">
                <span className="text-zinc-500 font-medium">What&apos;s Included in v1.1.11</span>
                <span className="text-zinc-300 leading-relaxed">
                  Refined hero artwork in original aspect ratio without zoom or distortion, zero background bleed or transparent ghosting beneath artist Latest Release and Top Songs, smooth ambient backdrop termination, and instant stream resolution.
                </span>
              </div>
              <div className="grid py-3 sm:grid-cols-[13rem_1fr] sm:gap-8">
                <span className="text-zinc-500 font-medium">License</span>
                <span className="text-white">MIT Open Source License</span>
              </div>
            </div>
          </Section>

          {/* Final Call to Action */}
          <motion.div
            variants={rise}
            className="mt-16 text-center space-y-4 p-8 rounded-2xl bg-zinc-900/40 border border-white/5"
          >
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Ready to Upgrade Your Music Experience?
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto">
              Download the APK package right now and start listening to millions of ad-free tracks with high fidelity.
            </p>
            <div className="pt-2 flex justify-center">
              <a
                href={apkDownloadUrl}
                download="zenify.apk"
                className="h-11 px-6 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-xs font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <Download size={16} className="text-brand" />
                <span>Download Zenify APK (v1.1.11 • 15.2 MB)</span>
              </a>
            </div>
          </motion.div>
        </motion.main>
      </div>
    </MotionConfig>
  );
}

