"use client";

import React, { useState, useRef, useCallback } from "react";
import {
    Upload,
    Image as ImageIcon,
    FileAudio,
    Check,
    Music,
    Mic2,
    ChevronLeft,
    ChevronRight,
    Sparkles,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Shield,
    AtSign,
    Lock,
    Unlock,
    MessageSquare,
    Download as DownloadIcon,
    Calendar,
    Clock
} from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { ModernTimePicker } from "@/components/ui/modern-time-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { format } from "date-fns";

const GENRES = ["Electronic", "Hip-Hop / Rap", "R&B / Soul", "Pop", "Indie / Alternative", "Rock", "Jazz", "Classical", "Afrobeats", "Latin", "Ambient", "Lo-fi", "House", "Techno", "Trap"];
const TIMES = Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2),
        m = i % 2 === 0 ? "00" : "30",
        ap = h < 12 ? "AM" : "PM",
        h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${m} ${ap}`;
});

interface TrackUploadStudioProps {
    onSuccess?: () => void;
}

export function TrackUploadStudio({ onSuccess }: TrackUploadStudioProps) {
    const [step, setStep] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isCommitted, setIsCommitted] = useState(false);

    // Form State
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [audioName, setAudioName] = useState("");
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverPreview, setCoverPreview] = useState<string | null>(null);
    const [imageUrlInput, setImageUrlInput] = useState("");
    const [isFetchingImage, setIsFetchingImage] = useState(false);

    const [formData, setFormData] = useState({
        title: "",
        artistName: "",
        genre: "",
        classification: "original",
        description: "",
        releaseMode: "now" as "now" | "schedule" | "draft",
        scheduledDate: "",
        scheduledTime: "12:00 PM",
        isUnlisted: false,
        allowDownloads: true,
        enableComments: true,
        copyrightLabel: "",
    });

    // Audio Preview State
    const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const [isCertified, setIsCertified] = useState(false);

    const STEPS = ["Media", "Metadata", "Release", "Review"];

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'audio' | 'cover') => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (type === 'audio') {
            if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
            setAudioFile(file);
            setAudioName(file.name);
            setAudioPreviewUrl(URL.createObjectURL(file));
            setIsPlaying(false);
            setCurrentTime(0);
        } else {
            setCoverFile(file);
            const reader = new FileReader();
            reader.onload = (e) => setCoverPreview(e.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleFetchImage = async () => {
        if (!imageUrlInput) return;
        setIsFetchingImage(true);
        try {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext("2d");
                ctx?.drawImage(img, 0, 0);
                canvas.toBlob((blob) => {
                    if (blob) {
                        const file = new File([blob], "cover-from-url.jpg", { type: "image/jpeg" });
                        setCoverFile(file);
                        setCoverPreview(URL.createObjectURL(blob));
                        setImageUrlInput("");
                    }
                    setIsFetchingImage(false);
                }, "image/jpeg");
            };
            img.onerror = () => {
                // If cors fails, try direct fetch bypass
                fetch(imageUrlInput)
                    .then(res => res.blob())
                    .then(blob => {
                        const file = new File([blob], "cover-from-url.jpg", { type: blob.type });
                        setCoverFile(file);
                        setCoverPreview(URL.createObjectURL(blob));
                        setImageUrlInput("");
                        setIsFetchingImage(false);
                    })
                    .catch(() => {
                        setIsFetchingImage(false);
                        alert("Failed to load image. It might be blocked by CORS or invalid.");
                    });
            };
            img.src = imageUrlInput;
        } catch (e) {
            setIsFetchingImage(false);
        }
    };

    const togglePlayback = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const handleTimeUpdate = () => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
        }
    };

    const handleLoadedMetadata = () => {
        if (audioRef.current) {
            setDuration(audioRef.current.duration);
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(e.target.value);
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            setCurrentTime(time);
        }
    };

    const formatTime = (time: number) => {
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const handleCommit = async () => {
        if (!isCertified) return;
        setIsLoading(true);
        setError(null);

        try {
            const data = new FormData();
            data.append('title', formData.title);
            data.append('artistName', formData.artistName);
            data.append('genre', formData.genre);
            data.append('description', formData.description);
            data.append('trackType', formData.classification.charAt(0).toUpperCase() + formData.classification.slice(1));
            data.append('isUnlisted', String(formData.isUnlisted));
            data.append('allowDownloads', String(formData.allowDownloads));
            data.append('enableComments', String(formData.enableComments));

            let releaseStatus = "PUBLISHED";
            if (formData.releaseMode === "schedule") {
                releaseStatus = "SCHEDULED";
                // Combine date and time for backend
                if (formData.scheduledDate && formData.scheduledTime) {
                    const baseDate = new Date(formData.scheduledDate);
                    const match = formData.scheduledTime.match(/(\d{2}):(\d{2})\s(AM|PM)/);
                    if (match) {
                        let hours = parseInt(match[1]);
                        const mins = parseInt(match[2]);
                        const period = match[3];
                        if (period === 'PM' && hours !== 12) hours += 12;
                        if (period === 'AM' && hours === 12) hours = 0;
                        baseDate.setHours(hours, mins, 0, 0);
                    }
                    data.append('scheduledAt', baseDate.toISOString());
                }
            } else if (formData.releaseMode === "draft") {
                releaseStatus = "DRAFT";
            }
            data.append('releaseStatus', releaseStatus);

            if (formData.copyrightLabel) {
                const label = formData.copyrightLabel.startsWith('@') ? formData.copyrightLabel : `@${formData.copyrightLabel}`;
                data.append('copyrightLabel', label);
            }

            if (audioFile) data.append('audio', audioFile);
            if (coverFile) data.append('cover', coverFile);

            await api.post('/tracks/upload', data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            setIsCommitted(true);
            onSuccess?.();
        } catch (err: any) {
            setError(err.response?.data?.message || "Transmission interrupted. Please verify connection.");
        } finally {
            setIsLoading(false);
        }
    };

    const canNext = [
        audioFile !== null,
        formData.artistName.trim() && formData.title.trim() && formData.genre,
        true,
        isCertified && !isLoading
    ];

    if (isCommitted) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-20 text-center"
            >
                <div className="w-20 h-20 rounded-full bg-rose-500/20 flex items-center justify-center mb-8 border border-rose-500/40 shadow-[0_0_40px_rgba(244,63,94,0.2)]">
                    <CheckCircle2 className="w-10 h-10 text-rose-500" />
                </div>
                <h2 className="text-4xl font-bold text-white mb-4 italic tracking-tight font-serif">Release Authorized</h2>
                <p className="text-muted text-sm max-w-sm leading-relaxed mb-10">
                    {formData.title} by {formData.artistName} has been successfully distributed to the Zenify hub.
                </p>
                <button
                    onClick={() => window.location.reload()}
                    className="px-8 py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95"
                >
                    Return to Terminal
                </button>
            </motion.div>
        );
    }

    return (
        <div className="space-y-12">
            {/* Step Indicator */}
            <div className="flex items-center gap-0 max-w-2xl mx-auto">
                {STEPS.map((s, i) => {
                    const done = i < step;
                    const active = i === step;
                    return (
                        <React.Fragment key={s}>
                            <div className="flex flex-col items-center gap-4 relative">
                                <div className={cn(
                                    "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 border",
                                    active ? "bg-rose-500 border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.4)]" :
                                        done ? "bg-rose-500/30 border-rose-500/50" : "bg-white/5 border-white/10"
                                )}>
                                    {done ? <Check size={12} className="text-rose-100" /> :
                                        <span className={cn("text-[10px] font-bold", active ? "text-white" : "text-white/20")}>{i + 1}</span>}
                                </div>
                                <span className={cn(
                                    "text-[9px] font-bold uppercase tracking-widest absolute -bottom-7 whitespace-nowrap transition-colors",
                                    active ? "text-white" : done ? "text-white/60" : "text-white/20"
                                )}>
                                    {s}
                                </span>
                            </div>
                            {i < STEPS.length - 1 && (
                                <div className="flex-1 h-[1px] mx-3 mb-0 relative overflow-hidden bg-white/5">
                                    <motion.div
                                        initial={{ x: "-100%" }}
                                        animate={{ x: done ? "0%" : "-100%" }}
                                        transition={{ duration: 0.5 }}
                                        className="absolute inset-0 bg-rose-500/40"
                                    />
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>

            <div className="pt-8">
                <div className="flex flex-col gap-2 mb-10">
                    <span className="text-[10px] font-bold text-rose-500/60 uppercase tracking-[0.3em]">Upload Progress — Step {step + 1}</span>
                    <h2 className="text-4xl font-bold text-white tracking-tight font-serif italic">
                        {step === 0 && "Upload Audio"}
                        {step === 1 && "Track Details"}
                        {step === 2 && "Release Settings"}
                        {step === 3 && "Final Review"}
                    </h2>
                </div>

                <div className="min-h-[300px]">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={step}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-6"
                        >
                            {step === 0 && (
                                <div className="flex flex-col md:flex-row gap-8 items-start max-w-4xl mx-auto">
                                    {/* Cover Art */}
                                    <div className="w-full md:w-[200px] shrink-0 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-none">Artwork</p>
                                        </div>
                                        <label className="group relative aspect-square w-full rounded-xl bg-white/2 border border-dashed border-white/10 flex flex-col items-center justify-center cursor-pointer transition-all hover:bg-white/5 hover:border-white/20 overflow-hidden">
                                            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileChange(e, 'cover')} />
                                            {coverPreview ? (
                                                <img src={coverPreview} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="text-center p-4 group-hover:-translate-y-1 transition-transform">
                                                    <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                                                        <ImageIcon className="w-5 h-5 text-rose-400" />
                                                    </div>
                                                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest group-hover:text-rose-400 transition-colors">Bind Cover</span>
                                                </div>
                                            )}
                                        </label>
                                        <div className="flex gap-2 items-center mt-2">
                                            <input
                                                type="text"
                                                placeholder="URL..."
                                                value={imageUrlInput}
                                                onChange={e => setImageUrlInput(e.target.value)}
                                                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white"
                                            />
                                            <button
                                                onClick={handleFetchImage}
                                                disabled={!imageUrlInput || isFetchingImage}
                                                className="bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-[10px] font-bold uppercase transition"
                                            >
                                                {isFetchingImage ? "..." : "Fetch"}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Audio Assets */}
                                    <div className="flex-1 w-full space-y-4">
                                        <div className="flex items-center gap-2">
                                            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-none">Sonic Master</p>
                                        </div>

                                        <div className="grid grid-cols-1 gap-4">
                                            {audioFile ? (
                                                <div className="w-full p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center gap-4 group">
                                                    {/* Play Button */}
                                                    <button
                                                        onClick={togglePlayback}
                                                        className="w-10 h-10 rounded-full bg-rose-500 flex items-center justify-center text-white shadow-lg active:scale-95 transition-all"
                                                    >
                                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d={isPlaying ? "M6 19h4V5H6v14zm8-14v14h4V5h-4z" : "M8 5v14l11-7z"} /></svg>
                                                    </button>

                                                    <div className="flex-1 min-w-0 space-y-1.5">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <p className="text-[11px] font-bold text-white truncate">{audioName}</p>
                                                                <span className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[8px] font-bold text-muted uppercase tracking-tighter shrink-0">{audioFile.name.split('.').pop()}</span>
                                                            </div>
                                                            <span className="text-[10px] font-bold text-accent tabular-nums">{formatFileSize(audioFile.size)}</span>
                                                        </div>

                                                        {/* Seek Slider */}
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-[8px] text-muted font-medium tabular-nums w-6 shrink-0">{formatTime(currentTime)}</span>
                                                            <div className="flex-1 relative h-6 flex items-center">
                                                                <input
                                                                    type="range"
                                                                    min="0"
                                                                    max={duration}
                                                                    value={currentTime}
                                                                    onChange={handleSeek}
                                                                    className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-rose-500"
                                                                    style={{
                                                                        background: `linear-gradient(to right, #f43f5e ${(currentTime / duration) * 100}%, rgba(255,255,255,0.05) ${(currentTime / duration) * 100}%)`,
                                                                    }}
                                                                />
                                                            </div>
                                                            <span className="text-[8px] text-muted font-medium tabular-nums w-6 shrink-0">{formatTime(duration)}</span>
                                                        </div>
                                                    </div>

                                                    <button
                                                        onClick={(e) => { e.preventDefault(); setAudioFile(null); setAudioPreviewUrl(null); }}
                                                        className="p-2 text-muted/30 hover:text-danger hover:bg-danger/5 rounded-lg transition-all shrink-0"
                                                    >
                                                        <AlertCircle size={14} />
                                                    </button>

                                                    <audio
                                                        ref={audioRef}
                                                        crossOrigin="anonymous"
                                                        src={audioPreviewUrl || ''}
                                                        onTimeUpdate={handleTimeUpdate}
                                                        onLoadedMetadata={handleLoadedMetadata}
                                                        onEnded={() => setIsPlaying(false)}
                                                        className="hidden"
                                                    />
                                                </div>
                                            ) : (
                                                <label className="w-full h-[120px] rounded-2xl border border-dashed border-white/5 bg-surface hover:bg-surface-hover hover:border-accent/40 transition-all cursor-pointer flex flex-col items-center justify-center gap-3 group">
                                                    <input type="file" accept="audio/*" className="hidden" onChange={(e) => handleFileChange(e, 'audio')} />
                                                    <div className="text-center group-hover:-translate-y-1 transition-transform w-full">
                                                        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-5 mx-auto group-hover:scale-110 transition-transform">
                                                            {audioFile ? <Music className="w-6 h-6 text-rose-400" /> : <Upload className="w-6 h-6 text-rose-400" />}
                                                        </div>
                                                        <p className="text-[11px] font-bold text-white uppercase tracking-[0.2em] mb-2">{audioFile ? "Swap Audio Master" : "Select Audio Asset"}</p>
                                                        <p className="text-[8px] text-rose-500/50 font-bold uppercase tracking-widest leading-none">Lossless WAV · FLAC · MP3</p>
                                                    </div>
                                                </label>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {step === 1 && (
                                <div className="space-y-8">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Artist Name</label>
                                            <input
                                                value={formData.artistName}
                                                onChange={(e) => setFormData({ ...formData, artistName: e.target.value })}
                                                placeholder="Enter artist or station name"
                                                className="input-premium"
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Track Title</label>
                                            <input
                                                value={formData.title}
                                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                                placeholder="Enter song title"
                                                className="input-premium"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Music Genre</label>
                                            <Select
                                                value={formData.genre}
                                                onValueChange={(value) => setFormData({ ...formData, genre: value })}
                                            >
                                                <SelectTrigger className="w-full bg-white/5 border-white/10 text-white rounded-xl h-[52px] px-4 focus:ring-rose-500/50">
                                                    <SelectValue placeholder="Pick a genre" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-surface border-white/10 text-white">
                                                    {GENRES.map(g => (
                                                        <SelectItem key={g} value={g} className="focus:bg-rose-500 focus:text-white">
                                                            {g}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Track Type</label>
                                            <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 gap-1 h-[52px]">
                                                {["original", "remix", "instrumental"].map(c => {
                                                    const active = formData.classification === c;
                                                    return (
                                                        <button
                                                            key={c}
                                                            onClick={() => setFormData({ ...formData, classification: c })}
                                                            className={cn(
                                                                "flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1",
                                                                active ? "border-rose-500 bg-rose-500/10 text-rose-400" : "border-white/5 text-white/40 hover:bg-white/5"
                                                            )}
                                                        >
                                                            {active && <Check size={12} className="text-rose-500" />}
                                                            {c}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Track Description</label>
                                        <textarea
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            placeholder="Tell us about the track — inspiration, credits, or a story..."
                                            className="input-premium min-h-[140px] resize-none"
                                        />
                                    </div>
                                </div>
                            )}

                            {step === 2 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-3 mb-2">
                                            <p className="text-[10px] font-bold text-white uppercase tracking-[0.2em]">Release Schedule</p>
                                        </div>
                                        <div className="space-y-2">
                                            {[
                                                { id: 'now', label: 'Publish Now', desc: 'Go live immediately', icon: <Sparkles size={14} /> },
                                                { id: 'schedule', label: 'Set a future date', desc: 'Set a future date', icon: <Calendar size={14} /> },
                                                { id: 'draft', label: 'Save Draft', desc: 'Internal archive only', icon: <Lock size={14} /> }
                                            ].map(opt => (
                                                <div key={opt.id} className="space-y-2">
                                                    <button
                                                        onClick={() => setFormData({ ...formData, releaseMode: opt.id as any })}
                                                        className={cn(
                                                            "w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left group",
                                                            formData.releaseMode === opt.id ? "bg-white/10 border-white/20 text-white" : "bg-white/2 border-white/5 text-muted hover:text-foreground hover:bg-white/5"
                                                        )}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center border transition-colors", formData.releaseMode === opt.id ? "bg-white/10 border-white/20 text-white" : "bg-white/5 border-white/10 text-muted")}>
                                                                {opt.icon}
                                                            </div>
                                                            <div>
                                                                <p className="text-[11px] font-bold uppercase tracking-wider">{opt.label}</p>
                                                                <p className="text-[9px] opacity-40 uppercase">{opt.desc}</p>
                                                            </div>
                                                        </div>
                                                        <div className={cn("w-3 h-3 rounded-full border flex items-center justify-center", formData.releaseMode === opt.id ? "border-white" : "border-white/10")}>
                                                            {formData.releaseMode === opt.id && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                                        </div>
                                                    </button>

                                                    {formData.releaseMode === opt.id && opt.id === 'schedule' && (
                                                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-4">
                                                            <div className="space-y-2">
                                                                <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Select Date</label>
                                                                <Popover>
                                                                    <PopoverTrigger asChild>
                                                                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal bg-white/5 border-white/10 hover:bg-white/10 h-11 rounded-xl", !formData.scheduledDate && "text-muted-foreground")}>
                                                                            <Calendar size={14} className="mr-2 opacity-50" />
                                                                            {formData.scheduledDate ? format(new Date(formData.scheduledDate), "PPP") : <span>Pick a date</span>}
                                                                        </Button>
                                                                    </PopoverTrigger>
                                                                    <PopoverContent className="w-auto p-0 border-white/10" align="start">
                                                                        <CalendarComponent
                                                                            mode="single"
                                                                            selected={formData.scheduledDate ? new Date(formData.scheduledDate) : undefined}
                                                                            onSelect={(date) => setFormData({ ...formData, scheduledDate: date?.toISOString() || "" })}
                                                                            disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                                                                            initialFocus
                                                                            classNames={{
                                                                                day_button: "relative flex size-9 items-center justify-center rounded-lg p-0 text-zinc-300 hover:bg-white/10 group-data-[disabled]:opacity-20 group-data-[disabled]:text-white/40 group-data-[disabled]:cursor-not-allowed group-data-[selected]:bg-rose-500 group-data-[selected]:text-white focus-visible:outline-none transition-colors",
                                                                                disabled: "opacity-20 text-white/40 pointer-events-none",
                                                                                day_disabled: "opacity-20 text-white/40 pointer-events-none",
                                                                                today: "after:absolute after:bottom-1 after:size-[3px] after:rounded-full after:bg-rose-500"
                                                                            }}
                                                                        />
                                                                    </PopoverContent>
                                                                </Popover>
                                                            </div>
                                                            <div className="space-y-2">
                                                                <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Select Time</label>
                                                                <ModernTimePicker
                                                                    value={formData.scheduledTime}
                                                                    onChange={(time: string) => setFormData({ ...formData, scheduledTime: time })}
                                                                    disabled={false}
                                                                    selectedDate={formData.scheduledDate}
                                                                />
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="flex items-center gap-3 mb-2">
                                            <p className="text-[10px] font-bold text-white uppercase tracking-[0.2em]">Track Settings</p>
                                        </div>

                                        <div className="space-y-2">
                                            {[
                                                { id: 'isUnlisted', label: 'Unlisted Track', desc: 'Only people with the link can listen', icon: formData.isUnlisted ? <Lock size={14} /> : <Unlock size={14} /> },
                                                { id: 'allowDownloads', label: 'Allow Downloads', desc: 'Let listeners download asset', icon: <DownloadIcon size={14} /> },
                                                { id: 'enableComments', label: 'Enable Comments', desc: 'Let listeners leave feedback', icon: <MessageSquare size={14} /> }
                                            ].map(setting => (
                                                <div key={setting.id} className="flex items-center justify-between p-4 bg-white/2 border border-white/5 rounded-xl">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/40">
                                                            {setting.icon}
                                                        </div>
                                                        <div>
                                                            <p className="text-[11px] font-bold text-white uppercase tracking-wider">{setting.label}</p>
                                                            <p className="text-[9px] text-white/30 uppercase">{setting.desc}</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => setFormData({ ...formData, [setting.id]: !formData[setting.id as keyof typeof formData] })}
                                                        className={cn("w-10 h-5 rounded-full relative transition-colors border", formData[setting.id as keyof typeof formData] ? "bg-rose-500 border-rose-500" : "bg-white/5 border-white/10")}
                                                    >
                                                        <div className={cn("absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-all", formData[setting.id as keyof typeof formData] ? "left-5.5" : "left-0.5", !formData[setting.id as keyof typeof formData] && "bg-white/20")} />
                                                    </button>
                                                </div>
                                            ))}

                                            <div className="pt-4 space-y-2">
                                                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Copyright / Label</label>
                                                <div className="relative">
                                                    <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={14} />
                                                    <input
                                                        value={formData.copyrightLabel}
                                                        onChange={(e) => setFormData({ ...formData, copyrightLabel: e.target.value })}
                                                        placeholder="Label Identifier (e.g. Zenify)"
                                                        className="input-premium pl-10 text-sm h-[48px]"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {step === 3 && (
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
                                    <div className="md:col-span-4 space-y-6">
                                        <div className="aspect-square w-full rounded-2xl overflow-hidden border border-white/10 bg-surface shadow-2xl">
                                            {coverPreview ? (
                                                <img src={coverPreview} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-white/5">
                                                    <ImageIcon className="text-white/10" size={48} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                                            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">Sonic Asset</p>
                                            <div className="flex items-center justify-between">
                                                <p className="text-xs text-white uppercase tracking-tighter font-bold truncate max-w-[150px]">{audioName}</p>
                                                <span className="text-[10px] font-mono text-rose-500 font-bold">{formatTime(duration)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="md:col-span-8 space-y-8">
                                        <div className="p-8 rounded-2xl bg-white/2 border border-white/5">
                                            <div className="grid grid-cols-2 gap-y-6 gap-x-12">
                                                <div>
                                                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Artist</p>
                                                    <p className="text-sm font-medium text-rose-400 tracking-tight">{formData.artistName}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Title</p>
                                                    <p className="text-sm font-medium text-white tracking-tight">{formData.title}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Genre / Type</p>
                                                    <p className="text-sm font-medium text-white/80 tracking-tighter">{formData.genre} • {formData.classification}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Total Time</p>
                                                    <p className="text-sm font-medium text-rose-400 font-mono">{formatTime(duration)}</p>
                                                </div>
                                                <div className="col-span-2">
                                                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Copyright / Label</p>
                                                    <p className="text-sm font-medium text-rose-400 tracking-tight">{formData.copyrightLabel || "Not Specified"}</p>
                                                </div>
                                                <div className="col-span-2">
                                                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Schedule</p>
                                                    {formData.releaseMode === 'now' ? (
                                                        <p className="text-sm font-medium text-white tracking-tight">Immediate Distribution</p>
                                                    ) : formData.releaseMode === 'draft' ? (
                                                        <p className="text-sm font-medium text-white tracking-tight">Save to Drafts</p>
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-sm font-medium text-white tracking-tight">
                                                                {formData.scheduledDate ? format(new Date(formData.scheduledDate), "MMM d, yyyy") : ""}
                                                            </p>
                                                            <span className="text-white/30">•</span>
                                                            <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[11px] font-mono text-white tracking-widest">
                                                                {formData.scheduledTime}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Error Message */}
                                        {error && (
                                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-2xl bg-danger/10 border border-danger/20 flex items-center gap-4 text-danger">
                                                <AlertCircle size={20} />
                                                <div>
                                                    <p className="text-[10px] font-bold uppercase tracking-widest">Protocol Error</p>
                                                    <p className="text-xs">{error}</p>
                                                </div>
                                            </motion.div>
                                        )}

                                        <div
                                            onClick={() => setIsCertified(!isCertified)}
                                            className="py-4 transition-all cursor-pointer flex items-center gap-4 group"
                                        >
                                            <div className={cn("w-5 h-5 rounded border flex items-center justify-center transition-colors flex-shrink-0 mt-0.5", isCertified ? "bg-rose-500 border-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.3)]" : "border-white/20 bg-white/5")}>
                                                {isCertified && <Check size={12} className="text-white" />}
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-bold text-white uppercase tracking-widest mb-1">Asset Ownership Certification</p>
                                                <p className="text-[10px] text-white/40 leading-relaxed uppercase tracking-tight">I certify that I hold the digital rights to distribute this asset.</p>
                                            </div>
                                        </div>

                                        <button
                                            onClick={handleCommit}
                                            disabled={!isCertified || isLoading}
                                            className={cn(
                                                "w-full py-4 rounded-xl font-bold uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 text-xs",
                                                isCertified && !isLoading ? "bg-white/5 text-rose-500 hover:bg-white/10 hover:text-rose-400 active:scale-95" : "bg-white/5 text-white/20 cursor-not-allowed"
                                            )}
                                        >
                                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                            {isLoading ? "Synchronizing..." : "Commit Release"}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Footer Controls */}
                <div className="flex items-center justify-between pt-12 border-t border-white/5 mt-10">
                    <button
                        onClick={() => setStep(s => Math.max(0, s - 1))}
                        disabled={step === 0}
                        className={cn(
                            "flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors",
                            step === 0 ? "text-white/10 cursor-not-allowed" : "text-muted hover:text-white"
                        )}
                    >
                        <ChevronLeft size={16} className="text-rose-500/50" /> Previous
                    </button>

                    <div className="text-[10px] font-bold text-muted uppercase tracking-[0.2em] hidden sm:block">
                        {step < 3 && !canNext[step] && (
                            step === 0 ? "Asset Required" :
                                step === 1 ? "Incomplete Metadata" : ""
                        )}
                    </div>

                    {step < 3 && (
                        <button
                            onClick={() => setStep(s => Math.min(3, s + 1))}
                            disabled={!canNext[step]}
                            className={cn(
                                "flex items-center gap-2 px-8 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all",
                                canNext[step] ? "bg-white/5 border border-white/10 text-white hover:bg-white/10 shadow-lg active:scale-95" : "bg-white/2 cursor-not-allowed text-white/10"
                            )}
                        >
                            {step === 2 ? "Ready to Review" : "Next Step"} <ChevronRight size={16} className="text-pink-500/50" />
                        </button>
                    )}
                </div>
            </div>
        </div >
    );
}
