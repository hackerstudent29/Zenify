"use client";
import React, { useState } from "react";
import Link from "next/link";
import { ZenifyLogo } from "./shared/ZenifyLogo";
import { Globe } from "lucide-react";
import { LanguagePickerModal } from "./shared/LanguagePickerModal";
import { useLanguagePreferences } from "@/hooks/useLanguagePreferences";

export default function Footer() {
  const [isLangModalOpen, setIsLangModalOpen] = useState(false);
  const { languages } = useLanguagePreferences();

  return (
    <>
      <footer className="bg-black border-t border-white/5 pt-24 pb-12">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12 mb-20 text-center md:text-left">
          <div className="space-y-6">
            <Link href="/" className="flex items-center justify-center md:justify-start gap-3 group">
              <ZenifyLogo size={32} />
            </Link>
            <p className="text-zinc-500 text-xs font-medium leading-relaxed max-w-[240px] mx-auto md:mx-0">
              Experience precision sound curation for listeners and creators worldwide.
            </p>
          </div>

          <div className="space-y-6">
            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Explore</h4>
            <ul className="space-y-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">
              <li><Link href="/liked" className="hover:text-brand transition-colors">Liked Songs</Link></li>
              <li><Link href="/search" className="hover:text-brand transition-colors">Search</Link></li>
              <li><Link href="/about-zenify" className="hover:text-brand transition-colors">About Zenify</Link></li>
              <li><Link href="/about" className="hover:text-brand transition-colors">About Creator</Link></li>
            </ul>
          </div>

          <div className="space-y-6">
            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Legal & Support</h4>
            <ul className="space-y-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">
              <li><Link href="/privacy" className="hover:text-brand transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-brand transition-colors">Terms of Service</Link></li>
            </ul>
          </div>

          <div className="space-y-6">
            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Language</h4>
            <div className="space-y-3">
              <p className="text-zinc-500 text-xs font-medium">Customize your feed languages</p>
              <button
                type="button"
                onClick={() => setIsLangModalOpen(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-white hover:text-brand text-xs font-libre font-semibold transition-all active:scale-95 cursor-pointer shadow-sm"
              >
                <Globe className="w-4 h-4 text-brand shrink-0" />
                <span className="capitalize">
                  {languages.length > 0
                    ? `${languages.slice(0, 2).join(', ')}${languages.length > 2 ? ` +${languages.length - 2}` : ''}`
                    : 'Select Languages'}
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 pt-12 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6 uppercase tracking-[0.2em] font-black">
          <p className="text-[10px] text-zinc-600">&copy; 2026 <span className="font-zenify">zenify</span> Music Group</p>
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setIsLangModalOpen(true)}
              className="flex items-center gap-2 text-[10px] text-zinc-500 hover:text-brand transition-colors cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-brand" />
              <span>Languages ({languages.length})</span>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse shadow-[0_0_8px_rgba(var(--accent-brand-rgb),0.5)]" />
              <span className="text-[10px] text-zinc-600">All Systems Operational</span>
            </div>
          </div>
        </div>
      </footer>

      <LanguagePickerModal
        open={isLangModalOpen}
        onOpenChange={setIsLangModalOpen}
      />
    </>
  );
}
