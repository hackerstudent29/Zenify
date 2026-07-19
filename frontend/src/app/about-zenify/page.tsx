"use client";

import { motion } from "framer-motion";
import { ChevronLeft, Zap, Music, Smartphone, Shield, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import pkg from "../../../package.json";
import ZenifyLogo from "@/components/shared/ZenifyLogo";

const features = [
  {
    icon: <Music size={24} />,
    title: "High-Fidelity Audio",
    description: "Experience your favorite tracks in crystal clear quality without any interruptions.",
  },
  {
    icon: <Sparkles size={24} />,
    title: "AI-Powered Curation",
    description: "Discover new music tailored perfectly to your taste using advanced AI algorithms.",
  },
  {
    icon: <Zap size={24} />,
    title: "Lightning Fast",
    description: "Built for speed. Instant search, zero buffering, and an incredibly smooth UI.",
  },
  {
    icon: <Shield size={24} />,
    title: "Ad-Free & Private",
    description: "Your listening habits are yours alone. No intrusive ads, no data mining.",
  },
  {
    icon: <Smartphone size={24} />,
    title: "Seamless Sync",
    description: "Listen across all your devices. Pick up right where you left off on your phone or desktop.",
  },
];

const steps = [
  {
    step: "01",
    title: "Search & Discover",
    description: "Use the top search bar to find any track, album, or artist in seconds.",
  },
  {
    step: "02",
    title: "Immersive Player",
    description: "Click on any track to open the stunning full-screen glassmorphism player.",
  },
  {
    step: "03",
    title: "Curate Playlists",
    description: "Save your favorite songs and build the ultimate library tailored to your mood.",
  },
];

export default function AboutZenifyPage() {
  const router = useRouter();

  return (
    <div className="w-full min-h-screen bg-[#0A0A0C] text-white selection:bg-brand/30 pb-32">
      {/* Navigation Overlay */}
      <div className="absolute top-6 left-6 z-[100]">
        <button
          onClick={() => router.back()}
          className="w-12 h-12 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 active:scale-95 transition-all backdrop-blur-md"
        >
          <ChevronLeft size={24} />
        </button>
      </div>

      {/* Hero Section */}
      <div className="relative w-full overflow-hidden pt-32 pb-20 px-6">
        <div className="absolute inset-0 bg-gradient-to-b from-brand/10 via-[#0A0A0C] to-[#0A0A0C] pointer-events-none" />
        
        <div className="max-w-4xl mx-auto relative z-10 flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-8"
          >
            <div className="w-24 h-24 mx-auto bg-black/40 backdrop-blur-2xl rounded-3xl border border-white/10 flex items-center justify-center shadow-2xl mb-6 shadow-brand/20">
              <ZenifyLogo size={48} />
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-4">
              Welcome to <span className="text-brand drop-shadow-glow">Zenify</span>
            </h1>
            <p className="text-white/60 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
              The next-generation audio experience built for true music lovers. A perfect blend of stunning aesthetics and powerful performance.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-full px-5 py-2 backdrop-blur-md"
          >
            <span className="text-xs font-bold uppercase tracking-widest text-brand">Version</span>
            <span className="text-xs font-mono text-white/80">{pkg.version}</span>
          </motion.div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 relative z-10 space-y-32">
        
        {/* Why Use Zenify */}
        <section>
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight mb-4">Why use Zenify?</h2>
            <p className="text-white/50 text-sm md:text-base max-w-xl mx-auto">
              We stripped away the clutter and rebuilt the music player from the ground up focusing on what really matters: you and the music.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + (i * 0.1) }}
                className="bg-white/5 border border-white/5 rounded-3xl p-8 hover:bg-white/10 hover:border-white/10 transition-all group"
              >
                <div className="w-12 h-12 bg-brand/10 text-brand rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-brand/20 transition-all">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className="text-white/50 leading-relaxed text-sm">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* How to Use */}
        <section className="bg-white/5 border border-white/10 rounded-[40px] p-8 md:p-16 backdrop-blur-xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight mb-4">How it works</h2>
            <p className="text-white/50 text-sm md:text-base max-w-xl mx-auto">
              Getting started is incredibly simple. Dive into the music in three easy steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.2 }}
                className="relative"
              >
                <div className="text-6xl font-black text-white/5 absolute -top-10 -left-4 pointer-events-none select-none">
                  {step.step}
                </div>
                <h3 className="text-xl font-bold mb-3 relative z-10 text-brand">{step.title}</h3>
                <p className="text-white/50 leading-relaxed text-sm relative z-10">
                  {step.description}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
