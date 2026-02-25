"use client";

import React from 'react';
import {
    Shield,
    Sparkles,
    Music
} from "lucide-react";
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { TrackUploadStudio } from '@/components/admin/track-upload-studio';

export default function AdminPage() {
    const { user, isAuthenticated } = useAuthStore();
    const router = useRouter();

    if (isAuthenticated && user?.role !== 'ADMIN') {
        return (
            <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-6">
                <div className="w-20 h-20 rounded-3xl bg-danger/10 flex items-center justify-center mb-8 border border-danger/20">
                    <Shield className="w-10 h-10 text-danger" />
                </div>
                <h1 className="text-4xl font-bold tracking-tight text-white mb-4">Access Restricted</h1>
                <p className="text-muted text-sm max-w-sm mx-auto leading-relaxed">
                    This terminal is reserved for platform administrators. Please return to the main hub.
                </p>
                <Button variant="outline" className="mt-8 rounded-full px-8" onClick={() => window.location.href = '/'}>
                    Return Home
                </Button>
            </div>
        );
    }

    return (
        <div className="min-h-full pb-32 pt-8">
            {/* Background Atmosphere */}
            <div className="fixed inset-0 pointer-events-none opacity-40">
                <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-accent/10 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/4" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-500/5 blur-[100px] rounded-full translate-y-1/4 -translate-x-1/4" />
            </div>

            <div className="max-w-6xl mx-auto px-6 relative z-10">


                <div className="flex items-center justify-between mb-8">
                    <div className="space-y-1">
                        <h1 className="text-5xl font-brand text-rose-500 leading-none">Distribution Terminal</h1>
                        <p className="text-white/30 text-[10px] uppercase tracking-[0.3em] font-medium">Zenify Asset Management Protocol</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.push('/admin/tracks')}
                            className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-white/70 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-white/10 transition-all group"
                        >
                            <Music size={14} className="group-hover:scale-110 transition-transform" />
                            Uploaded Tracks
                        </button>
                        <button
                            onClick={() => router.push('/admin/playlist-import')}
                            className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-rose-500/20 transition-all group"
                        >
                            <Sparkles size={14} className="group-hover:rotate-12 transition-transform" />
                            Master Intake Page
                        </button>
                    </div>
                </div>

                <div className="premium-card p-10 md:p-16 min-h-[600px] border-accent/10 overflow-visible">
                    <TrackUploadStudio />
                </div>

            </div>
        </div>
    );
}
