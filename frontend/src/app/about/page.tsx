"use client";

import { motion } from "framer-motion";
import { Mail, Instagram, MapPin } from "lucide-react";
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
    return (
        <div className="w-full min-h-screen bg-black text-white selection:bg-purple-500/30" style={{ fontFamily: '"Zalando Sans SemiExpanded", sans-serif' }}>
            {/* Hero Section */}
            <div className="relative w-full h-[35vh] overflow-hidden">
                {/* Background Image / Ambient Color */}
                <div
                    className="absolute inset-0 bg-cover bg-center opacity-40"
                    style={{ backgroundImage: "url('https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=2070&auto=format&fit=crop')" }}
                />

                {/* Gradient Fades for depth */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black pointer-events-none" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-purple-900/20 to-transparent pointer-events-none" />

                {/* Hero Headline */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 -mt-10">
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-5xl md:text-7xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-purple-100 via-purple-400 to-purple-600 drop-shadow-[0_0_20px_rgba(168,85,247,0.4)]"
                    >
                        About the Creator
                    </motion.h1>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="mt-4 text-purple-200/80 text-lg md:text-xl font-medium tracking-wide h-[1.5em]"
                    >
                        <TextType
                            text={[
                                "Crafting the future of sound with AI and human creativity."
                            ]}
                            typingSpeed={50}
                            loop={false}
                            showCursor={true}
                            cursorCharacter="_"
                        />
                    </motion.div>
                </div>
            </div>

            {/* Profile Content Container */}
            <div className="max-w-7xl mx-auto px-8 md:px-16 -mt-20 pb-20 relative z-10 w-full">
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="p-4 md:p-8"
                >
                    <div className="flex flex-col md:flex-row items-center md:items-start md:justify-center gap-16 lg:gap-32">

                        {/* Avatar & Social Links */}
                        <div className="flex flex-col items-center gap-6 shrink-0 md:min-w-[250px]">
                            {/* Glowing Avatar */}
                            <div className="relative group">
                                <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full blur-md opacity-40 group-hover:opacity-100 transition duration-500"></div>
                                <div className="relative w-32 h-32 rounded-full bg-zinc-900 flex items-center justify-center border-4 border-black overflow-hidden shadow-2xl">
                                    {/* Creator Profile Photo */}
                                    <div className="absolute inset-0 w-full h-full">
                                        <img
                                            src="/ram_profile.jpg"
                                            alt="Ram"
                                            className="w-full h-full object-cover grayscale brightness-110 contrast-125"
                                        />
                                    </div>
                                </div>
                            </div>

                            <h2 className="text-3xl font-bold tracking-tight text-white mt-2">Ram</h2>

                            {/* Social Buttons */}
                            <div className="flex items-center gap-3">
                                <a
                                    href="https://www.instagram.com/ramzendrum?igsh=MXBkYXE4YnZmdHN0A=="
                                    target="_blank"
                                    rel="noreferrer"
                                    className="group/insta w-12 h-12 rounded-full border border-white/10 flex items-center justify-center text-zinc-400 hover:bg-[#E1306C]/10 hover:border-[#E1306C]/30 transition-all hover:scale-110"
                                >
                                    <InstagramGradientIcon className="w-[22px] h-[22px] group-hover/insta:rotate-6 transition-transform" />
                                </a>
                                <a
                                    href="https://open.spotify.com/artist/3imsDaYqTYfQZ8ZhSjMD4T?si=PcXvQrghS5O7Y65u5eIc6A"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="group/spotify w-12 h-12 rounded-full border border-white/10 flex items-center justify-center text-zinc-400 hover:text-[#1DB954] hover:bg-[#1DB954]/10 hover:border-[#1DB954]/30 transition-all hover:scale-110"
                                >
                                    <SpotifyIcon className="w-[22px] h-[22px] group-hover/spotify:scale-105 transition-transform" />
                                </a>
                            </div>

                            {/* Location Box */}
                            <div className="flex items-center gap-2 text-sm text-zinc-400 bg-white/5 px-4 py-2 rounded-full border border-white/5">
                                <MapPin size={14} className="text-purple-400" />
                                Chennai, India
                            </div>
                        </div>

                        {/* Biography Content */}
                        <div className="flex-1 space-y-8 text-center md:text-left">

                            {/* Tags/Roles */}
                            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                                {["AI-Enhanced Production", "Remix Architect", "Cinematic Soundscapes"].map((tag) => (
                                    <span key={tag} className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-purple-200 bg-white/5 border border-white/10 rounded-full">
                                        {tag}
                                    </span>
                                ))}
                            </div>

                            {/* Bio Text */}
                            <div className="space-y-6 text-zinc-300 font-light leading-relaxed">
                                <p className="text-xl text-white font-medium">
                                    The Architect of Future Sound
                                </p>
                                <p>
                                    As a modern music producer redefining audio, I believe in combining traditional artistry with generative AI. Instead of just remixing classic tracks, I <strong>reimagine them</strong> from the ground up to create entirely new experiences.
                                </p>
                                <p>
                                    <strong>Innovation Meets Emotion:</strong> My process fuses classic production elements with Artificial Intelligence to forge soundscapes that are not only technically precise but deeply emotional.
                                </p>
                                <p>
                                    <strong>Beyond Genres:</strong> Versatility is at the core of my identity. From driving EDM beats to chilled Lo-Fi moods, my primary focus is exploration—always pushing music forward into uncharted territories.
                                </p>
                            </div>

                            <hr className="border-white/10" />

                            {/* Contact Action */}
                            <div className="flex items-center gap-4 pt-2">
                                <a
                                    href="mailto:ramzendrum@gmail.com"
                                    className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center text-zinc-400 hover:text-[#EA4335] hover:bg-[#EA4335]/10 hover:border-[#EA4335]/30 transition-all hover:scale-110 group shrink-0"
                                >
                                    <Mail size={16} className="group-hover:scale-110 transition-transform" />
                                </a>
                                <p className="text-base text-zinc-300 font-medium tracking-tight">
                                    ramzendrum@gmail.com
                                </p>
                            </div>

                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
