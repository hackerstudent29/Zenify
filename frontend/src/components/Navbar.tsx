"use client";
import React from "react";
import Link from "next/link";
import { ZenifyLogo } from "./shared/ZenifyLogo";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import { cn } from "@/lib/utils";

export default function Navbar() {
    const { isAuthenticated, user } = useAuthStore();
    const { setPricingModalOpen } = useUIStore();

    return (
        <nav className="fixed top-0 left-0 right-0 z-[100] bg-black/50 backdrop-blur-xl border-b border-white/5">
            <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2.5 group">
                    <ZenifyLogo size={32} />
                    <span className="font-black tracking-tighter text-xl text-white">Zenify</span>
                </Link>

                <div className="hidden md:flex items-center gap-8">
                    <Link href="/library" className="text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-colors">Library</Link>
                    <Link href="/search" className="text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-colors">Search</Link>
                    <button
                        onClick={() => setPricingModalOpen(true)}
                        className="text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-colors"
                    >
                        Pricing
                    </button>
                </div>

                <div className="flex items-center gap-4">
                    {isAuthenticated ? (
                        <Link href="/profile" className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all group">
                            <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-black text-emerald-400 uppercase">
                                {user?.name?.[0] || user?.email?.[0] || "U"}
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 group-hover:text-white transition-colors">Account</span>
                        </Link>
                    ) : (
                        <>
                            <Link href="/login" className="text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-colors px-4">Log In</Link>
                            <Link href="/register" className="bg-white text-black text-[10px] font-black uppercase tracking-[0.2em] px-6 py-3 rounded-xl hover:bg-emerald-500 hover:text-white transition-all shadow-xl shadow-white/5">
                                Free Trial
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
}
