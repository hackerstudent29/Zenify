"use client";

import React, { useState, useMemo } from "react";
import { Search, Folder, FileCode, Sliders, Music, Sparkles, Layers, ShieldCheck, Copy, Check, ChevronRight, ChevronDown } from "lucide-react";
import { SEO } from "@/components/shared/SEO";

interface SystemCard {
  id: string;
  name: string;
  tag: string;
  category: "audio" | "player" | "lyrics" | "backend" | "pages";
  desc: string;
  path: string;
  icon: string;
}

const SYSTEMS: SystemCard[] = [
  {
    id: "audioengine",
    name: "StudioFX Audio Engine",
    tag: "Core Audio DSP",
    category: "audio",
    desc: "Web Audio API DSP pipeline powering 10-band interactive equalization, dynamic compressor, biquad filters, convolver reverb, 8D audio spatializer, pitch shift, and real-time bass boost.",
    path: "frontend/src/lib/audio-engine.ts",
    icon: "🎛️"
  },
  {
    id: "studiofx",
    name: "StudioFX Equalizer Dialog",
    tag: "User Interface",
    category: "audio",
    desc: "Apple-style modal with smooth slider curves for adjusting 32Hz–16kHz frequency bands, room reverb presets (Club, Hall, Studio), bass booster, and stereo spatializer.",
    path: "frontend/src/components/player/audio-fx-modal.tsx",
    icon: "🎚️"
  },
  {
    id: "studiofxstore",
    name: "StudioFX Audio Store",
    tag: "Zustand Store",
    category: "audio",
    desc: "Persistent state manager preserving user audio profiles, equalizer band gains, spatializer toggles, and room sizes in localStorage via the core player store.",
    path: "frontend/src/store/player.ts",
    icon: "💾"
  },
  {
    id: "globalaudio",
    name: "Global Audio Engine",
    tag: "Playback Manager",
    category: "player",
    desc: "Persistent HTML5 <audio> manager at application root. Handles gapless transitions, crossfading, automatic stream failure recovery, and zero-wipe fallback protection.",
    path: "frontend/src/components/player/global-audio.tsx",
    icon: "🔊"
  },
  {
    id: "playerbar",
    name: "Unified Player Bar",
    tag: "Adaptive Component",
    category: "player",
    desc: "Responsive bottom bar automatically mounting PCPlayerBar on desktop and PremiumMobilePlayer on mobile touch devices.",
    path: "frontend/src/components/player-bar.tsx",
    icon: "⏯️"
  },
  {
    id: "fullscreenpc",
    name: "PC Fullscreen Player",
    tag: "Desktop Cinema",
    category: "player",
    desc: "Apple Music-style cinema overlay with two-column artwork mesh and liquid lyrics, audio controls, and immersive visualizer canvas.",
    path: "frontend/src/components/pc/PCFullScreenPlayer.tsx",
    icon: "🖥️"
  },
  {
    id: "mobileplayer",
    name: "Premium Mobile Player",
    tag: "Mobile Sheet",
    category: "player",
    desc: "Touch-optimized swipeable mini-player expanding into full-height card with fluid gestures and spring animations.",
    path: "frontend/src/components/mobile/PremiumMobilePlayer.tsx",
    icon: "📱"
  },
  {
    id: "liquidlyrics",
    name: "Liquid Motion Lyrics",
    tag: "Fluid Typography",
    category: "lyrics",
    desc: "Apple Music-fidelity syllable karaoke synchronizer with spring physics, gradient text illumination, dynamic blur focus, and Romanized script transliteration.",
    path: "frontend/src/components/shared/LiquidLyricsLine.tsx",
    icon: "✨"
  },
  {
    id: "lyricsview",
    name: "Synchronized Lyrics Sheet",
    tag: "Lyrics Canvas",
    category: "lyrics",
    desc: "Interactive scrolling lyrics display supporting manual millisecond offset calibration, multi-language subtitle switching, and click-to-seek jump playback.",
    path: "frontend/src/components/shared/LyricsView.tsx",
    icon: "📜"
  },
  {
    id: "mesh",
    name: "Artwork Color Mesh",
    tag: "Ambient Graphics",
    category: "player",
    desc: "GPU-accelerated Canvas/WebGL ambient color mesh dynamically adapting to album artwork dominant colors with fluid floating organic blobs.",
    path: "frontend/src/components/shared/ArtworkMeshBackground.tsx",
    icon: "🎨"
  },
  {
    id: "albumcolor",
    name: "Album Color Sync & Extraction",
    tag: "Theme Engine",
    category: "player",
    desc: "Synchronizes extracted artwork RGB values with measured Apple Music CSS design tokens (--page, --side, --line, --pill) with ultra-fast sessionStorage caching.",
    path: "frontend/src/hooks/useAlbumColor.ts",
    icon: "🌈"
  },
  {
    id: "streaming",
    name: "Multi-Backup Stream Proxy",
    tag: "Backend Router",
    category: "backend",
    desc: "/stream-youtube endpoint providing 4-tier failover: JioSaavn Clean 320k, Apple Akamai CDN AAC direct preview, distributed Invidious/Piped mirrors, and live yt-dlp spawn.",
    path: "backend/src/routes/utils.routes.ts",
    icon: "🛡️"
  },
  {
    id: "cleancdn",
    name: "Clean CDN 320kbps Service",
    tag: "High Fidelity Stream",
    category: "backend",
    desc: "Decrypts and streams verified 320kbps and 160kbps regional and international tracks directly from JioSaavn CDN, eliminating datacenter IP bot rate limits.",
    path: "backend/src/services/clean-cdn-audio.service.ts",
    icon: "💎"
  },
  {
    id: "catalog",
    name: "Global Catalog Provider",
    tag: "Catalog Engine",
    category: "backend",
    desc: "Apple Music and iTunes Search API aggregator with automatic storefront failover (country=IN -> country=US) so international songs are always accessible.",
    path: "backend/src/services/catalog-provider.service.ts",
    icon: "🌍"
  }
];

export default function StructureExplorerPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    root: true,
    backend: true,
    frontend: true,
    player: true,
    shared: true
  });

  const toggleFolder = (key: string) => {
    setOpenFolders(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCopy = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const filteredSystems = useMemo(() => {
    const q = search.toLowerCase().trim();
    return SYSTEMS.filter(sys => {
      const matchesQ = !q || 
        sys.name.toLowerCase().includes(q) || 
        sys.desc.toLowerCase().includes(q) || 
        sys.path.toLowerCase().includes(q) || 
        sys.tag.toLowerCase().includes(q);
      const matchesCat = category === "all" || sys.category === category;
      return matchesQ && matchesCat;
    });
  }, [search, category]);

  return (
    <div className="min-h-screen bg-[#090A0D] text-zinc-100 p-6 md:p-10 select-none">
      <SEO title="Visual Project Explorer • Zenify" description="Visual Architecture and File Hierarchy Map for Zenify" />
      
      {/* Header */}
      <div className="max-w-[1400px] mx-auto mb-8 border-b border-white/10 pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-600 to-rose-900 flex items-center justify-center font-black text-xl shadow-lg shadow-rose-950">
            Z
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
              Zenify <span className="text-brand">Visual Explorer</span>
            </h1>
            <p className="text-xs md:text-sm text-zinc-400 font-medium">Interactive architecture map, folder hierarchy, and instant file locator</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/5 border border-white/10 text-zinc-300">
            Engine: <b className="text-brand">Web Audio DSP</b>
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/5 border border-white/10 text-zinc-300">
            Audio Backups: <b className="text-emerald-400">4-Tier</b>
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/5 border border-white/10 text-zinc-300">
            Status: <b className="text-emerald-400">0 Errors</b>
          </span>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="max-w-[1400px] mx-auto mb-8 bg-zinc-900/60 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-col gap-4">
        <div className="relative flex items-center">
          <Search size={18} className="absolute left-4 text-brand pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, feature, or keyword (e.g. StudioFX, Audio Engine, Lyrics, Player, JioSaavn, Equalizer)..."
            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-sm font-medium text-white placeholder-zinc-500 outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { id: "all", label: "All Systems" },
            { id: "audio", label: "StudioFX & Audio DSP" },
            { id: "player", label: "Player & UI" },
            { id: "lyrics", label: "Lyrics & Visuals" },
            { id: "backend", label: "Backend & Streams" }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setCategory(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                category === tab.id 
                  ? "bg-brand text-white shadow-md shadow-rose-950" 
                  : "bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/5"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid */}
      <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left: Ascending Tree View */}
        <div className="lg:col-span-4 bg-zinc-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 h-fit max-h-[800px] overflow-y-auto">
          <div className="text-[11px] font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand" /> Directory Hierarchy
          </div>
          
          <div className="font-mono text-xs space-y-1 select-none">
            {/* Root */}
            <div 
              onClick={() => toggleFolder('root')} 
              className="flex items-center gap-2 py-1 px-2 rounded hover:bg-white/5 cursor-pointer font-bold text-zinc-200"
            >
              {openFolders.root ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
              <Folder size={14} className="text-blue-400" /> Zenify
            </div>

            {openFolders.root && (
              <div className="pl-4 border-l border-white/10 ml-2 space-y-1">
                
                {/* backend */}
                <div 
                  onClick={() => toggleFolder('backend')} 
                  className="flex items-center gap-2 py-1 px-2 rounded hover:bg-white/5 cursor-pointer font-semibold text-zinc-300"
                >
                  {openFolders.backend ? <ChevronDown size={13} className="text-zinc-500" /> : <ChevronRight size={13} className="text-zinc-500" />}
                  <Folder size={13} className="text-blue-400" /> backend/src/
                </div>
                {openFolders.backend && (
                  <div className="pl-4 border-l border-white/10 ml-2 space-y-0.5 text-zinc-400">
                    <div className="py-0.5 px-2 rounded hover:bg-white/5 cursor-pointer flex justify-between items-center" onClick={() => setSearch("stream-youtube")}>
                      <span>routes/utils.routes.ts</span>
                      <span className="text-[9px] px-1 py-0.2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">Proxy</span>
                    </div>
                    <div className="py-0.5 px-2 rounded hover:bg-white/5 cursor-pointer flex justify-between items-center" onClick={() => setSearch("clean-cdn")}>
                      <span>services/clean-cdn-audio.service.ts</span>
                      <span className="text-[9px] px-1 py-0.2 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded">320k</span>
                    </div>
                    <div className="py-0.5 px-2 rounded hover:bg-white/5 cursor-pointer flex justify-between items-center" onClick={() => setSearch("catalog-provider")}>
                      <span>services/catalog-provider.service.ts</span>
                      <span className="text-[9px] px-1 py-0.2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">Catalog</span>
                    </div>
                  </div>
                )}

                {/* frontend */}
                <div 
                  onClick={() => toggleFolder('frontend')} 
                  className="flex items-center gap-2 py-1 px-2 rounded hover:bg-white/5 cursor-pointer font-semibold text-zinc-300"
                >
                  {openFolders.frontend ? <ChevronDown size={13} className="text-zinc-500" /> : <ChevronRight size={13} className="text-zinc-500" />}
                  <Folder size={13} className="text-blue-400" /> frontend/src/
                </div>
                {openFolders.frontend && (
                  <div className="pl-4 border-l border-white/10 ml-2 space-y-1">
                    
                    {/* components/player */}
                    <div 
                      onClick={() => toggleFolder('player')} 
                      className="flex items-center gap-2 py-0.5 px-2 rounded hover:bg-white/5 cursor-pointer text-zinc-300 font-medium"
                    >
                      {openFolders.player ? <ChevronDown size={12} className="text-zinc-500" /> : <ChevronRight size={12} className="text-zinc-500" />}
                      <Folder size={12} className="text-amber-400" /> components/player/
                    </div>
                    {openFolders.player && (
                      <div className="pl-4 border-l border-white/10 ml-2 space-y-0.5 text-zinc-400">
                        <div className="py-0.5 px-2 rounded hover:bg-white/5 cursor-pointer flex justify-between items-center" onClick={() => setSearch("audio-fx-modal")}>
                          <span>audio-fx-modal.tsx</span>
                          <span className="text-[9px] px-1 py-0.2 bg-brand/10 text-brand border border-brand/20 rounded">StudioFX EQ</span>
                        </div>
                        <div className="py-0.5 px-2 rounded hover:bg-white/5 cursor-pointer flex justify-between items-center" onClick={() => setSearch("global-audio")}>
                          <span>global-audio.tsx</span>
                          <span className="text-[9px] px-1 py-0.2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">Core</span>
                        </div>
                      </div>
                    )}

                    {/* lib/ */}
                    <div className="py-0.5 px-2 rounded hover:bg-white/5 cursor-pointer flex justify-between items-center text-zinc-300 font-medium" onClick={() => setSearch("audio-engine")}>
                      <span className="flex items-center gap-1.5"><FileCode size={12} className="text-emerald-400" /> lib/audio-engine.ts</span>
                      <span className="text-[9px] px-1 py-0.2 bg-brand/10 text-brand border border-brand/20 rounded">StudioFX DSP</span>
                    </div>

                    {/* store/ */}
                    <div className="py-0.5 px-2 rounded hover:bg-white/5 cursor-pointer flex justify-between items-center text-zinc-300 font-medium" onClick={() => setSearch("player.ts")}>
                      <span className="flex items-center gap-1.5"><FileCode size={12} className="text-purple-400" /> store/player.ts</span>
                      <span className="text-[9px] px-1 py-0.2 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded">FX State</span>
                    </div>

                  </div>
                )}

              </div>
            )}
          </div>
        </div>

        {/* Right: Visual System Cards */}
        <div className="lg:col-span-8">
          <div className="text-[11px] font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-brand" /> Systems & Architecture ({filteredSystems.length})</span>
            <span className="text-zinc-500">Click Copy to grab import path</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredSystems.map((item) => (
              <div 
                key={item.id}
                className="bg-zinc-900/60 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-2xl p-5 flex flex-col justify-between gap-3 transition-all hover:-translate-y-1 hover:shadow-xl group"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl p-2 rounded-xl bg-white/5 border border-white/5 group-hover:scale-105 transition-transform">{item.icon}</span>
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-brand">{item.tag}</span>
                        <h3 className="text-sm md:text-base font-bold text-white group-hover:text-brand transition-colors">{item.name}</h3>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed font-normal">{item.desc}</p>
                </div>

                <div className="bg-black/40 border border-white/5 rounded-xl px-3 py-2 flex items-center justify-between gap-2 mt-2">
                  <code className="text-[11px] text-sky-400 truncate font-mono">{item.path}</code>
                  <button 
                    onClick={() => handleCopy(item.path)}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-brand hover:text-white text-zinc-400 transition-colors flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                  >
                    {copiedPath === item.path ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
