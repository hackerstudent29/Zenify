"use client";

import { motion } from "framer-motion";
import { Mail, Instagram, MapPin, Sparkles, Radio, ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import TextType from "@/components/ui/TextType";
import "@fontsource/zalando-sans-semiexpanded/400.css";
import "@fontsource/zalando-sans-semiexpanded/500.css";
import "@fontsource/zalando-sans-semiexpanded/700.css";
import "@fontsource/zalando-sans-semiexpanded/900.css";

const SpotifyIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.84.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
);

const InstagramGradientIcon = ({ className }: { className?: string }) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <defs>
            <radialGradient id="insta-reveal-grad" r="150%" cx="30%" cy="107%">
                <stop stopColor="#fdf497" offset="0%" />
                <stop stopColor="#fdf497" offset="5%" />
                <stop stopColor="#fd5949" offset="45%" />
                <stop stopColor="#d6249f" offset="60%" />
                <stop stopColor="#285AEB" offset="90%" />
            </radialGradient>
        </defs>

        {/* Default Grey State */}
        <g className="transition-opacity duration-300 opacity-100 group-hover/insta:opacity-0 stroke-zinc-400">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
        </g>

        {/* Hover/Active Gradient State */}
        <g className="transition-opacity duration-300 opacity-0 group-hover/insta:opacity-100 group-active/insta:opacity-100">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" stroke="url(#insta-reveal-grad)" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" stroke="url(#insta-reveal-grad)" />
            <circle cx="17.5" cy="6.5" r="1.2" fill="url(#insta-reveal-grad)" stroke="none" />
        </g>
    </svg>
);

export default function AboutPage() {
    const router = useRouter();

    return (
        <div className="w-full min-h-screen bg-[#0A0A0C] text-white selection:bg-brand/30 pb-32" style={{ fontFamily: '"Zalando Sans SemiExpanded", sans-serif' }}>
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
            <div className="relative w-full h-[45vh] md:h-[50vh] overflow-hidden">
                {/* Background Image / Ambient Color */}
                <div
                    className="absolute inset-0 bg-cover bg-center opacity-30 object-top"
                    style={{ backgroundImage: "url('https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=2070&auto=format&fit=crop')" }}
                />

                {/* Dramatic Fades */}
                <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0C]/20 via-[#0A0A0C]/60 to-[#0A0A0C] pointer-events-none" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0C] via-brand/10 to-transparent pointer-events-none" />

                {/* Hero Headline */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 -mt-10 md:-mt-16">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.5em] text-brand mb-4 block drop-shadow-glow-sm">The Visionary</span>
                        <h1 className="text-5xl md:text-8xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-white via-white/90 to-white/40 mb-4">
                            Ram
                        </h1>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="text-white/60 text-sm md:text-xl font-medium tracking-wide whitespace-nowrap"
                    >
                        <TextType
                            text={[
                                "Crafting the future of sound with AI and human creativity."
                            ]}
                            typingSpeed={40}
                            loop={false}
                            showCursor={true}
                            cursorCharacter="_"
                        />
                    </motion.div>
                </div>
            </div>

            {/* Profile Content Container */}
            <div className="max-w-6xl mx-auto px-6 md:px-12 -mt-16 md:-mt-24 relative z-10 w-full">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.8 }}
                    className="flex flex-col lg:flex-row items-start gap-12 lg:gap-24"
                >
                    {/* Sidebar: Profile Card */}
                    <div className="w-full lg:w-80 shrink-0 space-y-8 flex flex-col items-center lg:items-start">
                        {/* Glassmorph Profile Card */}
                        {/* Removed glassmorph background and border to match minimal request */}
                        <div className="w-full flex flex-col items-center text-center">
                            <div className="relative group mb-8">
                                <div className="absolute -inset-4 bg-brand/20 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition duration-700"></div>
                                <div className="relative w-40 h-40 rounded-full bg-zinc-900 border-4 border-[#0A0A0C] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                                    <img
                                        src="/ram_profile.jpg"
                                        alt="Ram"
                                        className="w-full h-full object-cover grayscale brightness-110 contrast-125 transition-all duration-700 group-hover:grayscale-0 group-hover:scale-110"
                                    />
                                </div>
                            </div>

                            <h2 className="text-3xl font-brand text-white mb-2 tracking-tight">Ram</h2>
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-brand/60 mb-6 drop-shadow-glow-sm">Remix Architect</p>

                            <div className="flex items-center gap-4 mb-8">
                                <a
                                    href="https://www.instagram.com/ramzendrum?igsh=MXBkYXE4YnZmdHN0A=="
                                    target="_blank"
                                    rel="noreferrer"
                                    className="w-11 h-11 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-brand/10 hover:border-brand/30 transition-all active:scale-90 group/insta"
                                >
                                    <Instagram size={20} className="group-hover/insta:stroke-white transition-colors" />
                                </a>
                                <a
                                    href="https://open.spotify.com/artist/3imsDaYqTYfQZ8ZhSjMD4T?si=PcXvQrghS5O7Y65u5eIc6A"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="w-11 h-11 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-white/40 hover:text-[#1DB954] hover:bg-[#1DB954]/10 hover:border-[#1DB954]/30 transition-all active:scale-90 group/spot"
                                >
                                    <SpotifyIcon className="w-5 h-5 group-hover/spot:text-[#1DB954] transition-colors" />
                                </a>
                            </div>

                            <div className="w-full flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/30 bg-white/5 py-3 rounded-2xl border border-white/5">
                                <MapPin size={12} className="text-brand" />
                                Chennai, India
                            </div>
                        </div>

                        {/* Quick Contact (Mobile Optimized) */}
                        <a
                            href="mailto:ramzendrum@gmail.com"
                            className="w-full group py-4 transition-all flex items-center justify-between border-t border-white/5 mt-4"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-brand/20 flex items-center justify-center text-brand">
                                    <Mail size={18} />
                                </div>
                                <div className="text-left">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-brand/60">Get in touch</p>
                                    <p className="text-xs font-bold text-white/90">ramzendrum@gmail.com</p>
                                </div>
                            </div>
                        </a>
                    </div>

                    {/* Main Content Area */}
                    <div className="flex-1 space-y-12 pb-12">
                        {/* Role Tags */}
                        <div className="flex flex-wrap gap-2 justify-center lg:justify-start">
                            {["AI-Enhanced Production", "Remix Architect", "Cinematic Soundscapes", "Sound Design"].map((tag, i) => (
                                <motion.span
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.7 + (i * 0.1) }}
                                    key={tag}
                                    className="px-5 py-2 text-[10px] font-black uppercase tracking-widest text-white/50 bg-white/[0.03] border border-white/5 rounded-full hover:border-brand/30 hover:text-brand transition-colors cursor-default"
                                >
                                    {tag}
                                </motion.span>
                            ))}
                        </div>

                        <div className="space-y-8 text-white/70">
                            <div className="space-y-4">
                                <h3 className="text-2xl md:text-4xl font-black text-white tracking-tighter">The Architect of <span className="text-brand">Future Sound</span></h3>
                                <p className="text-base md:text-lg leading-relaxed font-medium">
                                    As a modern music producer redefining audio, I believe in combining traditional artistry with generative AI. Instead of just remixing classic tracks, I reimagine them from the ground up to create entirely new experiences.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                                <div className="p-0 py-4 space-y-3 transition-colors border-t border-white/5">
                                    <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center text-brand mb-2">
                                        <Sparkles size={20} />
                                    </div>
                                    <h4 className="font-bold text-white">Innovation Meets Emotion</h4>
                                    <p className="text-sm leading-relaxed text-white/50">My process fuses classic production elements with Artificial Intelligence to forge soundscapes that are not only technically precise but deeply emotional.</p>
                                </div>

                                <div className="p-0 py-4 space-y-3 transition-colors border-t border-white/5">
                                    <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center text-brand mb-2">
                                        <Radio size={20} />
                                    </div>
                                    <h4 className="font-bold text-white">Beyond Genres</h4>
                                    <p className="text-sm leading-relaxed text-white/50">From driving EDM beats to chilled Lo-Fi moods, my primary focus is exploration—always pushing music forward into uncharted territories.</p>
                                </div>
                            </div>
                        </div>

                        <div className="pt-8 flex flex-col items-center lg:items-start gap-4">
                            <div className="h-px w-full bg-gradient-to-r from-white/10 via-white/5 to-transparent mb-4" />
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20">Designed by Antigravity x Ram</p>
                        </div>
                    </div>
                </motion.div>
            </div >
        </div >
    );
}
