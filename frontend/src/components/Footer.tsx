"use client";
import React from "react";
import Link from "next/link";
import { useUIStore } from "@/store/ui";
import { ZenifyLogo } from "./shared/ZenifyLogo";

export default function Footer() {
    const { setPricingModalOpen } = useUIStore();

    return (
        <footer className="bg-black border-t border-white/5 pt-24 pb-12">
            <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12 mb-20 text-center md:text-left">
                <div className="space-y-6">
                    <Link href="/" className="flex items-center justify-center md:justify-start gap-3 group">
                        <ZenifyLogo size={28} />
                        <span className="font-black tracking-tighter text-xl text-white">Zenify</span>
                    </Link>
                    <p className="text-zinc-500 text-xs font-medium leading-relaxed max-w-[240px] mx-auto md:mx-0">
                        Experience precision sound curation for listeners and creators worldwide.
                    </p>
                </div>

                <div className="space-y-6">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Explore</h4>
                    <ul className="space-y-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">
                        <li><Link href="/library" className="hover:text-emerald-400 transition-colors">Library</Link></li>
                        <li><Link href="/search" className="hover:text-emerald-400 transition-colors">Search</Link></li>
                        <li>
                            <button
                                onClick={() => setPricingModalOpen(true)}
                                className="hover:text-emerald-400 transition-colors uppercase"
                            >
                                Pricing
                            </button>
                        </li>
                    </ul>
                </div>

                <div className="space-y-6">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Legal</h4>
                    <ul className="space-y-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">
                        <li><Link href="#" className="hover:text-emerald-400 transition-colors">Privacy</Link></li>
                        <li><Link href="#" className="hover:text-emerald-400 transition-colors">Terms</Link></li>
                    </ul>
                </div>

                <div className="space-y-6">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Contact</h4>
                    <p className="text-zinc-500 text-xs font-medium uppercase tracking-widest">hello@zenify.music</p>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 pt-12 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6 uppercase tracking-[0.2em] font-black">
                <p className="text-[10px] text-zinc-600">&copy; 2026 Zenify Music Group</p>
                <div className="flex items-center gap-6">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    <span className="text-[10px] text-zinc-600">All Systems Operational</span>
                </div>
            </div>
        </footer>
    );
}
