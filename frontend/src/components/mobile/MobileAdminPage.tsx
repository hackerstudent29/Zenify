"use client";

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Shield, Sparkles, Music, Mic, Settings2 } from "lucide-react";
import { TrackUploadStudio } from '@/components/admin/track-upload-studio';

export function MobileAdminPage() {
  const { user, isAuthenticated } = useAuthStore();
  const router = useRouter();

  if (isAuthenticated && user?.role !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-6 bg-[#121214]">
        <div className="w-14 h-14 rounded-full bg-danger/10 flex items-center justify-center mb-4 border border-danger/20 shadow-[0_0_20px_rgba(255,0,0,0.1)]">
          <Shield className="w-6 h-6 text-danger" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-white mb-1.5">Access Restricted</h1>
        <p className="text-white/50 text-xs mb-6">This terminal is reserved for platform administrators.</p>
        <button
          className="h-10 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          onClick={() => router.push('/')}
        >
          Return Home
        </button>
      </div>
    );
  }

  const navigationItems = [
    { label: "Artists Management", icon: Shield, href: "/admin/artists", color: "text-white/80", bg: "bg-white/5 border-white/10 active:bg-white/10" },
    { label: "Track Database", icon: Music, href: "/admin/tracks", color: "text-white/80", bg: "bg-white/5 border-white/10 active:bg-white/10" },
    { label: "Lyric Sync Studio", icon: Mic, href: "/admin/lyric-sync", color: "text-white/80", bg: "bg-white/5 border-white/10 active:bg-white/10" },
    { label: "Batch Intake", icon: Sparkles, href: "/admin/playlist-import", color: "text-brand", bg: "bg-brand/10 border-brand/20 active:bg-brand/20" },
    { label: "System Settings", icon: Settings2, href: "/admin/settings", color: "text-white/80", bg: "bg-white/5 border-white/10 active:bg-white/10" },
  ];

  return (
    <div className="min-h-screen bg-[#121214] pb-[160px] pt-0">
      {/* Header — Streamlined & Compact */}
      <div className="sticky top-0 z-20 bg-[#121214]/95 backdrop-blur-xl py-2.5 px-3.5 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-zinc-900 flex items-center justify-center shadow-md border border-white/10 shrink-0">
            <Settings2 size={14} className="text-brand" />
          </div>
          <div className="space-y-0.5">
            <h1 className="text-base font-bold font-brand tracking-wide text-brand leading-none">
              Distribution Terminal
            </h1>
            <p className="text-white/40 text-[9px] tracking-[0.15em] font-medium uppercase">
              <span className="font-zenify not-italic capitalize">zenify</span> Asset Management
            </p>
          </div>
        </div>
      </div>

      <div className="px-3 py-3 space-y-4">
        {/* Navigation Grid */}
        <section>
          <h2 className="text-[9px] font-bold text-white/40 uppercase tracking-[0.18em] mb-2 px-0.5">Console Modules</h2>
          <div className="grid grid-cols-2 gap-2">
            {navigationItems.map((item, idx) => (
              <button
                key={idx}
                onClick={() => router.push(item.href)}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all active:scale-95 w-full text-left cursor-pointer ${item.bg}`}
              >
                <item.icon size={16} className={`shrink-0 ${item.color}`} />
                <span className={`text-[9px] font-bold uppercase tracking-wider truncate leading-tight ${item.color}`}>{item.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Upload Studio */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <h2 className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Quick Upload</h2>
          </div>
          <div className="rounded-xl border border-white/10 overflow-hidden bg-zinc-900/40">
            <div className="[&>.premium-card]:border-none [&>.premium-card]:bg-transparent [&>.premium-card]:p-0 [&_.p-10]:p-3 [&_.p-16]:p-3 [&_.p-6]:p-3">
              <TrackUploadStudio />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
