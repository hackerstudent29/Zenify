"use client";
import React from "react";
import Link from "next/link";
import { ZenifyLogo } from "./shared/ZenifyLogo";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import { cn, getMediaUrl } from "@/lib/utils";

export default function Navbar() {
 const { isAuthenticated, user } = useAuthStore();
 const { setPricingModalOpen } = useUIStore();

 return (
 <nav className="fixed top-0 left-0 right-0 z-[100] bg-black/50 backdrop-blur-xl border-b border-white/5">
 <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
 <Link href="/" className="flex items-center gap-2.5 group font-bold">
 <ZenifyLogo size={36} />
 </Link>

 <div className="hidden md:flex items-center gap-8">
 <Link href="/library" className="text-xs font-bold tracking-tight text-zinc-400 hover:text-white transition-colors">Library</Link>
 <Link href="/search" className="text-xs font-bold tracking-tight text-zinc-400 hover:text-white transition-colors">Search</Link>
 <button
 onClick={() => setPricingModalOpen(true)}
 className="text-xs font-bold tracking-tight text-zinc-400 hover:text-white transition-colors"
 >
 Pricing
 </button>
 </div>

 <div className="flex items-center gap-4">
 {isAuthenticated ? (
 <Link href="/profile" className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all group">
 <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-white/10 overflow-hidden flex items-center justify-center shrink-0 shadow-lg group-hover:border-accent/30 transition-colors">
 {user?.avatarUrl ? (
 <img 
 src={getMediaUrl(user.avatarUrl)} 
 className="w-full h-full object-cover" 
 alt="" 
 />
 ) : (
 <span className="text-[10px] font-black text-accent">
 {(user?.name?.[0] || user?.email?.[0] || "U").toUpperCase()}
 </span>
 )}
 </div>
 <div className="hidden sm:block text-left mr-2 ml-1">
 <p className="text-[10px] font-bold text-white/90 leading-tight truncate max-w-[80px]">
 {user?.username || user?.name || "User"}
 </p>
 <p className="text-[8px] font-medium text-white/30 leading-tight">Pro Account</p>
 </div>
 </Link>
 ) : (
 <>
 <Link href="/login" className="text-xs font-bold tracking-tight text-zinc-400 hover:text-white transition-colors px-4">Log in</Link>
 <Link href="/register" className="bg-white text-black text-[10px] font-bold tracking-wide px-6 py-3 rounded-xl hover:bg-emerald-500 hover:text-white transition-all shadow-xl shadow-white/5">
 Free trial
 </Link>
 </>
 )}
 </div>
 </div>
 </nav>
 );
}
