"use client";
import React, { useState, useEffect } from 'react';
import { Shield, CheckCircle, AlertCircle, TrendingUp, Users, PlayCircle, Music, X, Upload, Image as ImageIcon, ChevronDown } from "lucide-react";
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const GENRES = ["Pop", "Rock", "Hip Hop", "R&B", "Electronic", "Lofi", "Ambient", "Techno", "House"];
const TRACK_TYPES = ["Remix", "Original", "Cover", "Instrumental"];

export default function AdminPage() {
    const { user, isAuthenticated } = useAuthStore();
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const [formData, setFormData] = useState({
        title: '',
        artistName: '',
        genre: 'Select genre',
        description: '',
        trackType: 'Remix',
        isUnlisted: false,
    });

    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [coverFile, setCoverFile] = useState<File | null>(null);

    if (isAuthenticated && user?.role !== 'ADMIN') {
        return (
            <div className="flex items-center justify-center h-full min-h-[50vh]">
                <div className="text-center space-y-4">
                    <Shield className="w-12 h-12 text-zinc-600 mx-auto" />
                    <h1 className="text-2xl font-semibold text-white">Access Denied</h1>
                    <p className="text-zinc-400">You do not have permission to view this page.</p>
                </div>
            </div>
        );
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'audio' | 'cover') => {
        if (e.target.files && e.target.files[0]) {
            if (type === 'audio') setAudioFile(e.target.files[0]);
            else setCoverFile(e.target.files[0]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage(null);

        if (!audioFile || !formData.title || !formData.artistName) {
            setMessage({ type: 'error', text: 'Missing required fields.' });
            setIsLoading(false);
            return;
        }

        try {
            const data = new FormData();
            data.append('title', formData.title);
            data.append('artistName', formData.artistName);
            data.append('genre', formData.genre);
            data.append('description', formData.description);
            data.append('audio', audioFile);
            if (coverFile) data.append('cover', coverFile);
            // In a real app, you'd also send trackType and isUnlisted

            await api.post('/tracks/upload', data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            setMessage({ type: 'success', text: 'Track successfully deployed to Zenify.' });
            setFormData({ title: '', artistName: '', genre: 'Select genre', description: '', trackType: 'Remix', isUnlisted: false });
            setAudioFile(null);
            setCoverFile(null);
        } catch (error: any) {
            setMessage({ type: 'error', text: error.response?.data?.message || 'Upload protocol failed.' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="w-full min-h-screen pt-12 pb-32 px-8 lg:px-16 flex flex-col items-center relative overflow-hidden">
            {/* Background Glows */}
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[120px] -mr-64 -mt-64" />
            <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-600/5 rounded-full blur-[100px] -ml-32 -mb-32" />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-[900px] relative z-10"
            >
                {/* Upload Card */}
                <div className="premium-card p-1 rounded-[32px] overflow-hidden bg-white/[0.01] border-white/5 backdrop-blur-3xl shadow-2xl">
                    <div className="p-10 space-y-10">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <h1 className="text-4xl font-black tracking-tight text-white flex items-center gap-2">
                                Upload New <span className="text-accent italic">Remix</span>
                            </h1>
                            <button className="px-5 py-2 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-zinc-400 hover:text-white hover:bg-white/10 transition-all uppercase tracking-widest">
                                Cancel
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-8">
                            {/* Inputs Grid */}
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-1">Artist Name</label>
                                    <input
                                        name="artistName"
                                        value={formData.artistName}
                                        onChange={handleInputChange}
                                        placeholder="e.g. Ram"
                                        className="w-full h-14 bg-black/40 border border-white/10 rounded-xl px-5 text-sm font-medium text-white placeholder:text-zinc-600 focus:border-accent/50 focus:ring-1 focus:ring-accent/20 outline-none transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-1">Track Title</label>
                                    <input
                                        name="title"
                                        value={formData.title}
                                        onChange={handleInputChange}
                                        placeholder="e.g. Summer Vibes Remix"
                                        className="w-full h-14 bg-black/40 border border-white/10 rounded-xl px-5 text-sm font-medium text-white placeholder:text-zinc-600 focus:border-accent/50 focus:ring-1 focus:ring-accent/20 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            {/* Description */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-1">Description</label>
                                <textarea
                                    name="description"
                                    value={formData.description}
                                    onChange={handleInputChange}
                                    placeholder="Short description of the track..."
                                    className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-5 text-sm font-medium text-white placeholder:text-zinc-600 focus:border-accent/50 focus:ring-1 focus:ring-accent/20 outline-none transition-all resize-none"
                                />
                            </div>

                            {/* Selectors Grid */}
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-1">Genre</label>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger className="w-full h-14 bg-black/40 border border-white/10 rounded-xl px-5 flex items-center justify-between text-sm font-medium text-zinc-400 hover:border-white/20 transition-all outline-none">
                                            <span>{formData.genre}</span>
                                            <ChevronDown size={16} />
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="bg-zinc-900 border-white/10 text-white min-w-[200px]">
                                            {GENRES.map(g => (
                                                <DropdownMenuItem key={g} onClick={() => setFormData(f => ({ ...f, genre: g }))} className="focus:bg-accent focus:text-white cursor-pointer py-2">
                                                    {g}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-1">Track Type</label>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger className="w-full h-14 bg-black/40 border border-white/10 rounded-xl px-5 flex items-center justify-between text-sm font-medium text-white hover:border-white/20 transition-all outline-none">
                                            <span>{formData.trackType}</span>
                                            <ChevronDown size={16} />
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="bg-zinc-900 border-white/10 text-white min-w-[200px]">
                                            {TRACK_TYPES.map(t => (
                                                <DropdownMenuItem key={t} onClick={() => setFormData(f => ({ ...f, trackType: t }))} className="focus:bg-accent focus:text-white cursor-pointer py-2">
                                                    {t}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>

                            {/* Visibility Toggle */}
                            <div className="flex items-center gap-3 py-2">
                                <Switch
                                    checked={formData.isUnlisted}
                                    onCheckedChange={(checked) => setFormData(f => ({ ...f, isUnlisted: checked }))}
                                />
                                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Unlisted Track</span>
                            </div>

                            {/* Upload Zones */}
                            <div className="grid grid-cols-2 gap-6">
                                <label className="relative flex flex-col items-center justify-center h-48 bg-white/[0.02] border border-dashed border-white/10 rounded-[24px] hover:bg-white/[0.04] transition-all cursor-pointer group overflow-hidden">
                                    <input type="file" accept="audio/*" onChange={(e) => handleFileChange(e, 'audio')} className="hidden" />
                                    <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center text-accent mb-4 group-hover:scale-110 transition-transform">
                                        <Music size={24} />
                                    </div>
                                    <span className="text-sm font-bold text-zinc-200">
                                        {audioFile ? audioFile.name.slice(0, 20) + '...' : 'Upload Audio File'}
                                    </span>
                                    <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mt-1">MP3, WAV, FLAC up to 50MB</span>
                                    {audioFile && <div className="absolute top-4 right-4 text-accent"><CheckCircle size={16} /></div>}
                                </label>

                                <label className="relative flex flex-col items-center justify-center h-48 bg-white/[0.02] border border-dashed border-white/10 rounded-[24px] hover:bg-white/[0.04] transition-all cursor-pointer group overflow-hidden">
                                    <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'cover')} className="hidden" />
                                    <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-500 mb-4 group-hover:scale-110 transition-transform">
                                        <ImageIcon size={24} />
                                    </div>
                                    <span className="text-sm font-bold text-zinc-200">
                                        {coverFile ? coverFile.name.slice(0, 20) + '...' : 'Upload Cover Art'}
                                    </span>
                                    <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mt-1">JPG, PNG up to 5MB</span>
                                    {coverFile && <div className="absolute top-4 right-4 text-purple-500"><CheckCircle size={16} /></div>}
                                </label>
                            </div>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full h-16 bg-accent text-white font-black uppercase tracking-[0.2em] rounded-2xl hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-3 shadow-xl shadow-accent/20"
                            >
                                {isLoading ? (
                                    <div className="w-6 h-6 border-[3px] border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    'Upload Track'
                                )}
                            </button>

                            {message && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={cn(
                                        "p-4 rounded-xl text-xs font-bold uppercase tracking-widest text-center border",
                                        message.type === 'success' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-red-500/10 border-red-500/20 text-red-500"
                                    )}
                                >
                                    {message.text}
                                </motion.div>
                            )}
                        </form>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
