"use client";

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Shield, Sparkles, Music, Mic, Upload, Settings2 } from "lucide-react";
import { TrackUploadStudio } from '@/components/admin/track-upload-studio';

export function MobileAdminPage() {
 const { user, isAuthenticated } = useAuthStore();
 const router = useRouter();

 if (isAuthenticated && user?.role !== 'ADMIN') {
 return (
 <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-6 bg-[#0a0a0b]">
 <div className="w-16 h-16 rounded-full bg-danger/10 flex items-center justify-center mb-6 border border-danger/20 shadow-[0_0_20px_rgba(255,0,0,0.1)]">
 <Shield className="w-8 h-8 text-danger" />
 </div>
 <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Access Restricted</h1>
 <p className="text-white/50 text-xs mb-8">This terminal is reserved for platform administrators.</p>
 <Button className="rounded-full bg-white text-black font-bold h-10 px-8" onClick={() => router.push('/')}>
 Return Home
 </Button>
 </div>
 );
 }

 const navigationItems = [
 { label: "Artists Management", icon: Shield, href: "/admin/artists", color: "text-white/70", bg: "bg-white/5 border-white/10 active:bg-white/10" },
 { label: "Track Database", icon: Music, href: "/admin/tracks", color: "text-white/70", bg: "bg-white/5 border-white/10 active:bg-white/10" },
 { label: "Lyric Sync Studio", icon: Mic, href: "/admin/lyric-sync", color: "text-white/70", bg: "bg-white/5 border-white/10 active:bg-white/10" },
 { label: "Batch Intake", icon: Sparkles, href: "/admin/playlist-import", color: "text-brand", bg: "bg-brand/10 border-brand/20 shadow-[0_0_15px_rgba(var(--accent-brand-rgb),0.1)] active:bg-brand/20" },
 ];

 return (
 <div className="min-h-screen bg-[#0a0a0b] pb-[200px] pt-[52px]">
 {/* Header */}
 <div className="sticky top-[48px] z-40 bg-background/95 backdrop-blur-2xl pt-4 pb-4 px-4 border-b border-white/5">
 <div className="flex items-center gap-3">
 <div className="w-9 h-9 rounded-full bg-zinc-900 flex items-center justify-center shadow-lg border border-white/5 shrink-0">
 <Settings2 size={16} className="text-brand" />
 </div>
 <div className="space-y-1">
 <h1 className="text-2xl font-brand text-brand leading-none">
 Distribution Terminal
 </h1>
 <p className="text-white/30 text-[10px] tracking-[0.2em] font-medium uppercase">
 <span className="font-zenify not-italic capitalize">zenify</span> Asset Management Protocol
 </p>
 </div>
 </div>
 </div>

 <div className="px-4 py-6 space-y-8">
 {/* Navigation Grid */}
 <section>
 <h2 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3">Management</h2>
 <div className="grid grid-cols-2 gap-3">
 {navigationItems.map((item, idx) => (
 <button
 key={idx}
 onClick={() => router.push(item.href)}
 className={`flex flex-col items-start gap-3 p-4 rounded-2xl border transition-all active:scale-95 w-full ${item.bg}`}
 >
 <item.icon size={20} className={item.color} />
 <span className={`text-[9px] font-black uppercase tracking-[0.15em] text-left leading-tight ${item.color}`}>{item.label}</span>
 </button>
 ))}
 </div>
 </section>

 {/* Upload Studio */}
 <section>
 <div className="flex items-center justify-between mb-4">
 <h2 className="text-sm font-bold text-white/50 uppercase tracking-widest">Quick Upload</h2>
 </div>
 <div className="rounded-2xl border border-white/5 overflow-hidden bg-white/[0.02]">
 {/* We render TrackUploadStudio without its heavy desktop padding */}
 <div className="[&>.premium-card]:border-none [&>.premium-card]:bg-transparent [&>.premium-card]:p-0 [&_.p-10]:p-4 [&_.p-16]:p-4">
 <TrackUploadStudio />
 </div>
 </div>
 </section>
 </div>
 </div>
 );
}
