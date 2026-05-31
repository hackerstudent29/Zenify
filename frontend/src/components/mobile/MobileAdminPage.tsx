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
        { label: "Artists Management", icon: Shield, href: "/admin/artists", color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/20" },
        { label: "Track Database", icon: Music, href: "/admin/tracks", color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20" },
        { label: "Lyric Sync Studio", icon: Mic, href: "/admin/lyric-sync", color: "text-purple-500", bg: "bg-purple-500/10 border-purple-500/20" },
        { label: "Batch Intake", icon: Sparkles, href: "/admin/playlist-import", color: "text-brand", bg: "bg-brand/10 border-brand/20 shadow-[0_0_15px_rgba(var(--accent-brand-rgb),0.1)]" },
    ];

    return (
        <div className="min-h-screen bg-[#0a0a0b] pb-[200px]">
            {/* Header */}
            <div className="bg-[#0a0a0b] pt-6 pb-4 px-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                        <Settings2 size={16} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-tight leading-none">Admin Console</h1>
                        <p className="text-[10px] text-brand font-black uppercase tracking-widest mt-1">Terminal</p>
                    </div>
                </div>
            </div>

            <div className="px-4 py-6 space-y-8">
                {/* Navigation Grid */}
                <section>
                    <h2 className="text-sm font-bold text-white/50 uppercase tracking-widest mb-3">Management</h2>
                    <div className="grid grid-cols-2 gap-3">
                        {navigationItems.map((item, idx) => (
                            <button
                                key={idx}
                                onClick={() => router.push(item.href)}
                                className={`flex flex-col items-start gap-3 p-4 rounded-2xl border transition-all active:scale-95 ${item.bg}`}
                            >
                                <item.icon size={20} className={item.color} />
                                <span className="text-xs font-bold text-white/90 text-left leading-tight">{item.label}</span>
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
