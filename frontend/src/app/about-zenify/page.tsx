"use client";

import { motion } from "framer-motion";
import { ChevronLeft, Zap, Music, Shield, Sparkles, Volume2, Database, Cpu } from "lucide-react";
import { useRouter } from "next/navigation";
import pkg from "../../../package.json";
import { ZenifyLogo } from '@/components/shared/ZenifyLogo';

const bentoItems = [
  {
    className: "md:col-span-2 bg-white/[0.01] border border-white/[0.04] hover:border-white/10",
    icon: <Volume2 className="text-brand size-5" />,
    title: "Acoustic Fidelity",
    description: "Zenify bypasses heavy audio compression layers. We source bit-perfect, raw iTunes CDN AAC streams where possible, delivering transparent, audiophile-grade playback.",
    visual: (
      <div className="absolute bottom-0 right-0 left-0 h-24 overflow-hidden opacity-20 pointer-events-none">
        <svg className="w-full h-full" viewBox="0 0 400 100" preserveAspectRatio="none">
          <path d="M0,50 Q45,10 90,50 T180,50 T270,50 T360,50 T400,50" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand" />
          <path d="M0,50 Q45,90 90,50 T180,50 T270,50 T360,50 T400,50" fill="none" stroke="currentColor" strokeWidth="1" className="text-white/20" strokeDasharray="4 4" />
          <path d="M0,50 Q45,30 90,50 T180,50 T270,50 T360,50 T400,50" fill="none" stroke="currentColor" strokeWidth="1" className="text-brand/30" />
        </svg>
      </div>
    )
  },
  {
    className: "md:col-span-1 bg-white/[0.01] border border-white/[0.04] hover:border-white/10",
    icon: <Sparkles className="text-brand size-5" />,
    title: "AI-Powered Discovery",
    description: "Discover hidden gems. Neural curation algorithms analyze your listening DNA to curate a custom-tailored sonic map.",
    visual: (
      <div className="absolute -bottom-8 -right-8 w-24 h-24 rounded-full bg-brand/5 border border-brand/10 blur-xl animate-pulse" />
    )
  },
  {
    className: "md:col-span-1 bg-white/[0.01] border border-white/[0.04] hover:border-white/10",
    icon: <Cpu className="text-brand size-5" />,
    title: "Instant Streaming",
    description: "Zero buffering. Optimizations skip metadata overhead to resolve direct HTTPS streams instantly.",
    visual: (
      <div className="absolute bottom-4 left-6 right-6 font-mono text-[9px] text-zinc-500 flex flex-col gap-1.5 border-t border-white/[0.03] pt-4 pointer-events-none">
        <div className="flex justify-between"><span>ROUTING</span><span className="text-[#CFC8B6]">DIRECT_CDN</span></div>
        <div className="flex justify-between"><span>SEEKING</span><span className="text-emerald-400 font-bold">HTTP_206</span></div>
        <div className="flex justify-between"><span>LATENCY</span><span className="text-white font-bold">~12ms</span></div>
      </div>
    )
  },
  {
    className: "md:col-span-2 bg-white/[0.01] border border-white/[0.04] hover:border-white/10",
    icon: <Shield className="text-brand size-5" />,
    title: "Sandboxed Privacy",
    description: "No ads, trackers, or cookies. Listening profiles are sandboxed entirely within your client's local indexedDB cache, protecting your identity from background telemetry.",
    visual: (
      <div className="absolute right-8 top-1/2 -translate-y-1/2 opacity-[0.02] pointer-events-none hidden md:block">
        <Database size={84} className="text-white" />
      </div>
    )
  }
];

const timelineSteps = [
  {
    no: "I",
    title: "Resolve Preview",
    subtitle: "iTunes CDN Priority",
    description: "The search cleaning engine strips video tags and clutter from metadata, querying the high-speed iTunes CDN first to secure direct AAC preview URLs."
  },
  {
    no: "II",
    title: "Real-Time Proxy",
    subtitle: "Header Resolution",
    description: "Fallback streams are routed via our backend proxy. We preserve initial MP4/WebM headers to enable native HTML5 demuxing and range-based seek operations."
  },
  {
    no: "III",
    title: "Persistent Mount",
    subtitle: "Root DOM Playback",
    description: "Audio elements are mounted permanently at the React tree root. Routine routing shifts bypass DOM interruptions, silencing DOM play abort warnings."
  }
];

export default function AboutZenifyPage() {
  const router = useRouter();

  return (
    <div className="w-full min-h-screen bg-[#030303] text-[#F2F2F3] selection:bg-brand/30 pb-36 font-sans relative overflow-hidden">
      {/* Background radial effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[1200px] h-[500px] bg-[radial-gradient(circle_at_top,_rgba(207,200,182,0.06)_0%,_transparent_65%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      {/* Navigation Overlay */}
      <div className="absolute top-8 left-8 z-[100]">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 active:scale-95 transition-all backdrop-blur-md cursor-pointer"
        >
          <ChevronLeft size={18} />
        </button>
      </div>

      {/* Hero Section */}
      <div className="relative w-full pt-32 pb-24 px-8">
        <div className="max-w-4xl mx-auto relative z-10 flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center"
          >
            {/* Minimalist Logo Box */}
            <div className="w-16 h-16 bg-white/[0.02] backdrop-blur-2xl rounded-2xl border border-white/[0.06] flex items-center justify-center shadow-[0_20px_50px_rgba(0,0,0,0.5)] mb-8">
              <ZenifyLogo size={32} />
            </div>

            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#CFC8B6] mb-3">
              Technical Overview
            </p>

            <h1 className="text-4xl md:text-6xl font-light font-cormorant tracking-tight leading-[1.1] mb-6 max-w-2xl text-white/95">
              The architecture of pure <span className="font-brand italic text-brand">sound</span>.
            </h1>

            <p className="text-[#A3A4AB] text-sm md:text-base max-w-xl mx-auto leading-relaxed font-sans mb-8">
              A minimalist audio framework built to strip away background noise, delivering lightning-fast streaming and a unified glassmorphic player environment.
            </p>

            <div className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-full px-4.5 py-1.5 backdrop-blur-md">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#CFC8B6]">ENGINE BUILD</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-mono text-zinc-400">{pkg.version}</span>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-8 relative z-10 space-y-28">
        
        {/* Bento Grid Features */}
        <section className="space-y-6">
          <div className="text-left max-w-md">
            <h2 className="text-xl font-bold tracking-tight mb-2">Core Optimization Engines</h2>
            <p className="text-zinc-500 text-xs leading-relaxed">
              Precision metrics, sandboxed security, and clean container pipelines working silently in the background.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4.5">
            {bentoItems.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className={`${feature.className} relative overflow-hidden rounded-2xl p-6.5 backdrop-blur-2xl transition-all duration-300 group flex flex-col justify-between min-h-[180px]`}
              >
                <div className="flex flex-col gap-3">
                  <div className="w-9 h-9 bg-white/[0.04] text-brand rounded-xl flex items-center justify-center group-hover:scale-105 group-hover:bg-brand/10 transition-all duration-300 w-fit">
                    {feature.icon}
                  </div>
                  <h3 className="text-sm font-bold text-white/95">{feature.title}</h3>
                  <p className="text-zinc-400 leading-relaxed text-xs font-sans max-w-[90%]">
                    {feature.description}
                  </p>
                </div>
                {feature.visual}
              </motion.div>
            ))}
          </div>
        </section>

        {/* Technical Flow */}
        <section className="space-y-8">
          <div className="text-left max-w-md">
            <h2 className="text-xl font-bold tracking-tight mb-2">The Playback Pipeline</h2>
            <p className="text-zinc-500 text-xs leading-relaxed">
              Step-by-step metadata parsing and routing that powers every track in your queue.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6.5 relative">
            {timelineSteps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.12 }}
                className="bg-white/[0.01] border border-white/[0.03] rounded-2xl p-6 flex flex-col justify-between min-h-[160px] relative hover:border-white/[0.06] transition-colors"
              >
                <div className="text-xs font-bold text-brand uppercase tracking-wider font-mono absolute top-4 right-4 bg-brand/5 border border-brand/10 px-2 py-0.5 rounded">
                  {step.no}
                </div>
                <div className="space-y-2 mt-4">
                  <h3 className="text-sm font-bold text-white/90">{step.title}</h3>
                  <p className="text-[10px] font-bold text-zinc-500 font-mono uppercase tracking-wider">
                    {step.subtitle}
                  </p>
                  <p className="text-zinc-400 leading-relaxed text-xs font-sans pt-1">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
