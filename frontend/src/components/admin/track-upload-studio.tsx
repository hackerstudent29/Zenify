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
import { ZenLoading } from "@/components/ui/ZenLoading";

const GENRES = ["Cinema", "Electronic", "Hip-Hop / Rap", "R&B / Soul", "Pop", "Indie / Alternative", "Rock", "Jazz", "Classical", "Afrobeats", "Latin", "Ambient", "Lo-fi", "House", "Techno", "Trap"];
const TIMES = Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2),
        m = i % 2 === 0 ? "00" : "30",
        ap = h < 12 ? "AM" : "PM",
        h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${m} ${ap}`;
});

interface TrackUploadStudioProps {
    onSuccess?: () => void;
    editMode?: boolean;
    initialTrack?: any;
}

export function TrackUploadStudio({ onSuccess, editMode = false, initialTrack }: TrackUploadStudioProps) {
    const [step, setStep] = useState(editMode ? 1 : 0);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isCommitted, setIsCommitted] = useState(false);

    // Form State
    const [audioError, setAudioError] = useState<string | null>(null);
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [audioName, setAudioName] = useState("");
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [imageUrlInput, setImageUrlInput] = useState("");
    const [externalUrlInput, setExternalUrlInput] = useState("");
    const [isFetchingImage, setIsFetchingImage] = useState(false);
    const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);
    const [audioUrlFromLink, setAudioUrlFromLink] = useState<string | null>(null); // Cloudinary URL from auto-fetch

    // Collection State
    const [collectionData, setCollectionData] = useState<any>(null);
    const [isCollectionMode, setIsCollectionMode] = useState(false);
    const [isBatchImporting, setIsBatchImporting] = useState(false);
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, activeTrack: "" });

    const [formData, setFormData] = useState({
        title: initialTrack?.title || "",
        artistName: initialTrack?.artist?.name || initialTrack?.artistName || "",
        genre: initialTrack?.genre || "",
        classification: initialTrack?.trackType?.toLowerCase() || "original",
        description: initialTrack?.description || "",
        releaseMode: (initialTrack?.releaseStatus?.toLowerCase() === 'scheduled' ? 'schedule' : initialTrack?.releaseStatus?.toLowerCase() === 'draft' ? 'draft' : 'now') as "now" | "schedule" | "draft",
        scheduledDate: initialTrack?.scheduledAt ? format(new Date(initialTrack.scheduledAt), 'yyyy-MM-dd') : "",
        scheduledTime: initialTrack?.scheduledAt ? format(new Date(initialTrack.scheduledAt), 'hh:mm a') : "12:00 PM",
        isUnlisted: initialTrack?.isUnlisted || false,
        allowDownloads: initialTrack?.allowDownloads ?? true,
        enableComments: initialTrack?.enableComments ?? true,
        copyrightLabel: initialTrack?.copyrightLabel || "",
        bpm: initialTrack?.bpm || "" as string | number,
        key: initialTrack?.key || "",
        featuredArtists: initialTrack?.featuredArtists || "",
        composers: initialTrack?.composers || "",
        lyrics: initialTrack?.lyrics || "",
    });

    // Audio Preview State
    const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(initialTrack?.audioUrl || null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(initialTrack?.duration || 0);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const [isCertified, setIsCertified] = useState(editMode ? true : false);
    const [coverPreview, setCoverPreview] = useState<string | null>(initialTrack?.coverUrl || null);

    // Alert State
    const [alert, setAlert] = useState<{ show: boolean, type: 'success' | 'error' | 'warning', title: string, message: string }>({
        show: false,
        type: 'success',
        title: '',
        message: ''
    });

    const showAlert = (type: 'success' | 'error' | 'warning', title: string, message: string) => {
        setAlert({ show: true, type, title, message });
        // Auto-close success alerts
        if (type === 'success') {
            setTimeout(() => setAlert(prev => ({ ...prev, show: false })), 4000);
        }
    };

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
                        showAlert('error', 'Imagery Failed', "We couldn't retrieve that artwork. It might be blocked by the source or the link is invalid.");
                    });
            };
            img.src = imageUrlInput;
        } catch (e) {
            setIsFetchingImage(false);
        }
    };

    const handleFetchExternalMetadata = async () => {
        if (!externalUrlInput) return;
        setIsFetchingMetadata(true);
        try {
            const res = await api.get(`/metadata/fetch?url=${encodeURIComponent(externalUrlInput)}&fetchAudio=true`);
            const data = res.data;
            if (data.error) {
                showAlert('error', 'Fetch Interrupted', data.error);
            } else if (data.isCollection) {
                setCollectionData(data);
                setIsCollectionMode(true);
                setFormData(prev => ({
                    ...prev,
                    title: data.title || prev.title,
                    artistName: data.artist || prev.artistName,
                    genre: "Cinema",
                    copyrightLabel: "Zenify"
                }));
                if (data.cover) setCoverPreview(data.cover);
            } else {
                setIsCollectionMode(false);
                setFormData(prev => ({
                    ...prev,
                    title: data.title || prev.title,
                    artistName: data.artist || prev.artistName,
                    genre: "Cinema",
                    copyrightLabel: "Zenify",
                    bpm: data.bpm || "",
                    key: data.key || "",
                    featuredArtists: data.featuredArtists || "",
                    composers: data.composers || "",
                    lyrics: data.lyrics || "",
                    description: data.description || "",
                }));

                if (data.cover) {
                    setCoverPreview(data.cover);
                    try {
                        const imgRes = await fetch(data.cover);
                        const blob = await imgRes.blob();
                        const file = new File([blob], "cover-external.jpg", { type: blob.type });
                        setCoverFile(file);
                    } catch (err) {
                        console.warn("Could not auto-fetch cover file.", err);
                    }
                }

                if (data.audioUrl) {
                    // Store the Cloudinary URL directly — no need to download the whole file
                    const resolvedAudioUrl = data.audioUrl.startsWith('http')
                        ? data.audioUrl
                        : `${process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:3000'}${data.audioUrl}`;

                    setAudioUrlFromLink(resolvedAudioUrl);
                    setAudioName(data.title || "External Audio");
                    // Set preview URL directly (streaming, no blob download)
                    setAudioPreviewUrl(resolvedAudioUrl);
                }
                setExternalUrlInput("");
            }
            showAlert('success', 'Hub Connection Established', `Successfully matched metadata for "${data.title || 'Collection'}". Content is ready for processing.`);
        } catch (e: any) {
            showAlert('error', 'Transmission Failed', "We couldn't verify that link. Please check the URL and try again.");
        } finally {
            setIsFetchingMetadata(false);
        }
    };

    const handleImportTrackFromCollection = async (track: any) => {
        setIsFetchingMetadata(true);
        try {
            const query = `${track.artist} - ${track.title}`;
            const res = await api.get(`/metadata/fetch?url=${encodeURIComponent(query)}&fetchAudio=true&mode=search`);
            const data = res.data;

            setFormData(prev => ({
                ...prev,
                title: track.title,
                artistName: track.artist,
                genre: "Cinema",
                copyrightLabel: "Zenify",
                lyrics: track.lyrics || data.lyrics || "",
                bpm: data.bpm || "",
                key: data.key || "",
                featuredArtists: data.featuredArtists || "",
                composers: data.composers || "",
                description: data.description || "",
            }));

            if (collectionData.cover) {
                setCoverPreview(collectionData.cover);
                const imgRes = await fetch(collectionData.cover);
                const blob = await imgRes.blob();
                setCoverFile(new File([blob], "cover.jpg", { type: blob.type }));
            }

            if (data.audioUrl) {
                const audioUrl = data.audioUrl.startsWith('http') ? data.audioUrl : `${process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:3000'}${data.audioUrl}`;
                const audioRes = await fetch(audioUrl);
                const blob = await audioRes.blob();
                setAudioFile(new File([blob], "track.m4a", { type: blob.type }));
                setAudioName(track.title);
                if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
                setAudioPreviewUrl(URL.createObjectURL(blob));
            }

            showAlert('success', 'Track Imported', `"${track.title}" has been added to your upload queue with full metadata.`);
        } catch (e) {
            showAlert('error', 'Import Failed', "We encountered a problem while fetching this specific track. The source might be temporarily unavailable.");
        } finally {
            setIsFetchingMetadata(false);
        }
    };

    const handleBatchImport = async () => {
        if (!collectionData?.tracks || isBatchImporting) return;

        setIsBatchImporting(true);
        setBatchProgress({ current: 0, total: collectionData.tracks.length, activeTrack: "" });

        try {
            for (let i = 0; i < collectionData.tracks.length; i++) {
                const track = collectionData.tracks[i];
                if (!track) continue;

                setBatchProgress(prev => ({ ...prev, current: i + 1, activeTrack: track.title }));

                try {
                    const query = track.isPlaceholder ? `${collectionData.artist} ${collectionData.title} track ${i + 1}` : `${track.artist} - ${track.title}`;
                    const res = await api.get(`/metadata/fetch?url=${encodeURIComponent(query)}&fetchAudio=true&mode=search`);
                    const data = res.data;

                    if (data.audioUrl) {
                        await api.post('/tracks/import-external', {
                            title: track.isPlaceholder ? `Track ${i + 1}` : track.title,
                            artistName: track.artist || collectionData.artist,
                            genre: "Cinema",
                            coverUrl: collectionData.cover,
                            audioUrl: data.audioUrl,
                            albumTitle: collectionData.title,
                            copyrightLabel: "Zenify",
                            lyrics: track.lyrics || data.lyrics || "",
                        });
                    }
                } catch (err) {
                    console.error(`Failed to import track ${track.title}:`, err);
                }
            }
            setIsCollectionMode(false);
            if (onSuccess) onSuccess();
            setIsCommitted(true);
            showAlert('success', 'Collection Distributed', `All ${collectionData.tracks.length} tracks have been successfully added to the Zenify system.`);
        } catch (e) {
            showAlert('error', 'Batch Process Interrupted', "An unexpected error occurred during the bulk import. Some tracks may not have been added.");
        } finally {
            setIsBatchImporting(false);
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

            if (formData.bpm) data.append('bpm', String(formData.bpm));
            if (formData.key) data.append('key', formData.key);
            if (formData.featuredArtists) data.append('featuredArtists', formData.featuredArtists);
            if (formData.composers) data.append('composers', formData.composers);
            if (formData.lyrics) data.append('lyrics', formData.lyrics);
            if (duration) data.append('duration', String(Math.round(duration)));

            if (audioFile) data.append('audio', audioFile);
            else if (audioUrlFromLink) data.append('audioUrl', audioUrlFromLink);
            if (coverFile) data.append('cover', coverFile);

            if (editMode && initialTrack?.id) {
                await api.put(`/tracks/${initialTrack.id}`, data, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            } else {
                await api.post('/tracks/upload', data, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            }

            setIsCommitted(true);
            onSuccess?.();
            showAlert('success', editMode ? 'Frequencies Synchronized' : 'Release Authorized', editMode ? `Changes to "${formData.title}" have been committed.` : `"${formData.title}" is now live on the hub.`);
        } catch (err: any) {
            setError(err.response?.data?.message || "Transmission interrupted. Please verify connection.");
            showAlert('error', 'Submission Failed', err.response?.data?.message || "We couldn't finalize your release. Please check your connection and try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const canNext = [
        editMode || audioFile !== null || audioUrlFromLink !== null,
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
                <h2 className="text-4xl font-bold text-white mb-4 italic tracking-tight">Release Authorized</h2>
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
                    <h2 className="text-2xl md:text-4xl font-bold text-white tracking-tight font-serif italic">
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
                                <div className="space-y-10">
                                    {/* Link Import Section */}
                                    <div className="max-w-4xl mx-auto space-y-4 pb-6">
                                        <div className="flex items-center gap-3">
                                            <Sparkles className="w-4 h-4 text-rose-500" />
                                            <p className="text-[10px] font-bold text-white uppercase tracking-[0.2em]">Auto-Import Metadata</p>
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-3">
                                            <div className="flex-1 relative">
                                                <input
                                                    type="text"
                                                    placeholder="Paste YouTube, Spotify or Apple Music link..."
                                                    value={externalUrlInput}
                                                    onChange={e => setExternalUrlInput(e.target.value)}
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-rose-500/40 focus:ring-1 focus:ring-rose-500/50 transition-all hover:border-rose-500/20"
                                                />
                                            </div>
                                            <button
                                                onClick={handleFetchExternalMetadata}
                                                disabled={!externalUrlInput || isFetchingMetadata}
                                                className="px-6 py-3 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                                            >
                                                {isFetchingMetadata ? <ZenLoading size="xs" className="brightness-200" /> : <Music size={14} />}
                                                {isFetchingMetadata ? "Fetching Track..." : "Import Details"}
                                            </button>
                                        </div>
                                        <p className="text-[9px] text-white/20 font-medium leading-relaxed">
                                            Supports YouTube, Spotify &amp; Apple Music — auto-fetches metadata, cover art, and audio.
                                        </p>
                                    </div>

                                    {/* Collection Preview (Album/Playlist) */}
                                    <AnimatePresence>
                                        {isCollectionMode && collectionData && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.95 }}
                                                className="max-w-4xl mx-auto mb-8 p-6 rounded-3xl bg-white/[0.03] border border-white/5 space-y-6"
                                            >
                                                <div className="flex items-start gap-6">
                                                    <div className="w-24 h-24 rounded-xl overflow-hidden shadow-2xl border border-white/10 shrink-0">
                                                        <img src={collectionData.cover} alt="Collection" className="w-full h-full object-cover" />
                                                    </div>
                                                    <div className="flex-1 space-y-1">
                                                        <div className="flex items-center gap-2 text-rose-500">
                                                            <Sparkles size={14} />
                                                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">External Collection Detected</span>
                                                        </div>
                                                        <h3 className="text-xl font-black text-white">{collectionData.title}</h3>
                                                        <p className="text-sm text-white/40 font-medium">By {collectionData.artist} • {collectionData.tracks?.length || 0} Tracks</p>

                                                        <div className="pt-3 flex gap-4">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => setIsCollectionMode(false)}
                                                                className="rounded-full bg-white/5 border-white/10 text-[10px] font-black uppercase tracking-widest px-6"
                                                            >
                                                                Cancel
                                                            </Button>

                                                            {collectionData.tracks && collectionData.tracks.length > 0 && (
                                                                <Button
                                                                    size="sm"
                                                                    onClick={handleBatchImport}
                                                                    disabled={isBatchImporting}
                                                                    className="rounded-full bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest px-8 shadow-lg shadow-rose-500/20 flex items-center gap-2"
                                                                >
                                                                    {isBatchImporting ? <ZenLoading size="xs" className="brightness-200" /> : <Sparkles className="w-3 h-3" />}
                                                                    {isBatchImporting ? "Importing..." : "Import All Collection"}
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                                    {collectionData.tracks?.map((track: any, idx: number) => (
                                                        <div key={idx} className="group flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-all border border-transparent hover:border-white/5">
                                                            <div className="flex items-center gap-4">
                                                                <span className="text-[10px] font-black text-white/20 w-4">{track.trackNumber || idx + 1}</span>
                                                                <div className="flex flex-col">
                                                                    <span className="text-sm font-bold text-white/90 group-hover:text-rose-500 transition-colors">{track.title}</span>
                                                                    <span className="text-[10px] text-white/40 font-medium uppercase tracking-wider">{track.artist}</span>
                                                                </div>
                                                            </div>
                                                            {!track.isPlaceholder && (
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => handleImportTrackFromCollection(track)}
                                                                    className="rounded-full h-8 px-4 bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest"
                                                                >
                                                                    Import Track
                                                                </Button>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>

                                                {isBatchImporting && (
                                                    <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/10 space-y-3">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center">
                                                                    <ZenLoading size="xs" />
                                                                </div>
                                                                <div>
                                                                    <p className="text-[10px] font-bold text-white uppercase tracking-widest">Processing Collection</p>
                                                                    <p className="text-[12px] font-bold text-rose-500">{batchProgress.activeTrack || "Preparing..."}</p>
                                                                </div>
                                                            </div>
                                                            <span className="text-[10px] font-black text-white/40">{batchProgress.current} / {batchProgress.total}</span>
                                                        </div>
                                                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                                            <motion.div
                                                                className="h-full bg-rose-500"
                                                                initial={{ width: 0 }}
                                                                animate={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}

                                                {(collectionData.tracks?.some((t: any) => t.isPlaceholder) || !collectionData.tracks) && (
                                                    <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                                        <AlertCircle className="text-amber-500" size={16} />
                                                        <span className="text-[11px] font-bold text-amber-500/90 uppercase tracking-widest">
                                                            {collectionData.tracks?.some((t: any) => t.isPlaceholder)
                                                                ? "Track names couldn't be retrieved for this Spotify collection. You can still use the metadata above and manually select audio files."
                                                                : "Track list currently only supported for Apple Music. For Spotify albums, we can import high-quality metadata but tracks must be added individually."}
                                                        </span>
                                                    </div>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <div className="flex flex-col md:flex-row gap-8 items-start max-w-4xl mx-auto">
                                        {/* Cover Art */}
                                        <div className="w-full md:w-[200px] shrink-0 space-y-3">
                                            <div className="flex items-center gap-2">
                                                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-none">Artwork</p>
                                            </div>
                                            <label className="group relative aspect-square w-full rounded-xl bg-white/2 border border-dashed border-white/10 flex flex-col items-center justify-center cursor-pointer transition-all hover:bg-rose-500/[0.04] hover:border-rose-500/40 overflow-hidden">
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
                                                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500/40 hover:border-rose-500/20 transition-all shadow-inner"
                                                />
                                                <button
                                                    onClick={handleFetchImage}
                                                    disabled={!imageUrlInput || isFetchingImage}
                                                    className="bg-rose-600 hover:bg-rose-500 disabled:opacity-20 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase transition-all active:scale-95 flex items-center justify-center min-w-[70px] border border-rose-500/20 shadow-lg shadow-rose-900/20"
                                                >
                                                    {isFetchingImage ? <ZenLoading size="xs" className="brightness-200" /> : "Fetch"}
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
                                                    <div className="w-full p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-4 group hover:border-rose-500/20 transition-all">
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
                                                                    <span className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[8px] font-bold text-muted uppercase tracking-tighter shrink-0">{audioFile?.name.split('.').pop() || 'URL'}</span>
                                                                </div>
                                                                <span className="text-[10px] font-bold text-accent tabular-nums">{audioFile ? formatFileSize(audioFile.size) : '0 KB'}</span>
                                                            </div>

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
                                                    </div>
                                                ) : (
                                                    <label className="w-full h-[120px] rounded-2xl border border-dashed border-white/10 bg-white/2 hover:bg-rose-500/[0.04] hover:border-rose-500/40 transition-all cursor-pointer flex flex-col items-center justify-center gap-3 group">
                                                        <input type="file" accept="audio/*" className="hidden" onChange={(e) => handleFileChange(e, 'audio')} />
                                                        <div className="text-center group-hover:-translate-y-1 transition-transform">
                                                            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                                                                <Upload className="w-6 h-6 text-rose-400" />
                                                            </div>
                                                            <p className="text-[11px] font-bold text-white uppercase tracking-[0.2em] mb-1">Select Audio Asset</p>
                                                            <p className="text-[8px] text-white/20 font-bold uppercase tracking-widest leading-none">FLAC · WAV · MP3</p>
                                                        </div>
                                                    </label>
                                                )}

                                                <audio
                                                    ref={audioRef}
                                                    crossOrigin="anonymous"
                                                    src={audioPreviewUrl || undefined}
                                                    onTimeUpdate={handleTimeUpdate}
                                                    onLoadedMetadata={handleLoadedMetadata}
                                                    onEnded={() => setIsPlaying(false)}
                                                    className="hidden"
                                                />
                                            </div>
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
                                            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Featured Artists</label>
                                            <input
                                                value={formData.featuredArtists}
                                                onChange={(e) => setFormData({ ...formData, featuredArtists: e.target.value })}
                                                placeholder="e.g. Artist B, Artist C"
                                                className="input-premium border-white/5 bg-white/[0.02]"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-3">
                                                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">BPM</label>
                                                <input
                                                    type="number"
                                                    value={formData.bpm}
                                                    onChange={(e) => setFormData({ ...formData, bpm: e.target.value })}
                                                    placeholder="128"
                                                    className="input-premium border-white/5 bg-white/[0.02]"
                                                />
                                            </div>
                                            <div className="space-y-3">
                                                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Key</label>
                                                <input
                                                    value={formData.key}
                                                    onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                                                    placeholder="C Minor"
                                                    className="input-premium border-white/5 bg-white/[0.02]"
                                                />
                                            </div>
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
                                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Composers / Songwriters</label>
                                        <input
                                            value={formData.composers}
                                            onChange={(e) => setFormData({ ...formData, composers: e.target.value })}
                                            placeholder="Name 1, Name 2..."
                                            className="input-premium border-white/5 bg-white/[0.02]"
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Track Description</label>
                                            <textarea
                                                value={formData.description}
                                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                                placeholder="Tell us about the track — inspiration, credits, or a story..."
                                                className="input-premium min-h-[120px] resize-none border-white/10 focus:border-rose-500/40 bg-white/5"
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Lyrics</label>
                                            <textarea
                                                value={formData.lyrics}
                                                onChange={(e) => setFormData({ ...formData, lyrics: e.target.value })}
                                                placeholder="Verse 1... Chorus... Bridge..."
                                                className="input-premium min-h-[120px] resize-none border-white/10 focus:border-rose-500/40 bg-white/5"
                                            />
                                        </div>
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
                                                        <div className={cn("w-4 h-4 rounded-full border flex items-center justify-center transition-colors", formData.releaseMode === opt.id ? "border-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.3)]" : "border-white/10")}>
                                                            {formData.releaseMode === opt.id && <div className="w-2 h-2 bg-rose-500 rounded-full" />}
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
                                                <div key={setting.id} className="flex items-center justify-between p-4 bg-white/2 border border-white/5 rounded-xl hover:border-rose-500/20 transition-all">
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
                                        <div className="p-8 rounded-2xl bg-white/2 border border-white/5 hover:border-rose-500/20 transition-all">
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

                                        {/* Advanced Metadata Review */}
                                        {(formData.featuredArtists || formData.bpm || formData.key || formData.composers) && (
                                            <div className="p-6 rounded-2xl bg-white/2 border border-white/5 hover:border-rose-500/20 transition-all">
                                                <p className="text-[10px] font-bold text-rose-500/60 uppercase tracking-widest mb-4">Advanced Metadata</p>
                                                <div className="grid grid-cols-2 gap-y-4 gap-x-12">
                                                    {formData.featuredArtists && (
                                                        <div>
                                                            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Featured Artists</p>
                                                            <p className="text-sm font-medium text-white/80 tracking-tight">{formData.featuredArtists}</p>
                                                        </div>
                                                    )}
                                                    {formData.bpm && (
                                                        <div>
                                                            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">BPM</p>
                                                            <p className="text-sm font-medium text-rose-400 font-mono">{formData.bpm}</p>
                                                        </div>
                                                    )}
                                                    {formData.key && (
                                                        <div>
                                                            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Musical Key</p>
                                                            <p className="text-sm font-medium text-white/80">{formData.key}</p>
                                                        </div>
                                                    )}
                                                    {formData.composers && (
                                                        <div>
                                                            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Composers</p>
                                                            <p className="text-sm font-medium text-white/80 tracking-tight">{formData.composers}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {formData.lyrics && (
                                            <div className="p-6 rounded-2xl bg-white/2 border border-white/5 hover:border-rose-500/20 transition-all">
                                                <p className="text-[10px] font-bold text-rose-500/60 uppercase tracking-widest mb-3">Lyrics Preview</p>
                                                <p className="text-xs text-white/60 whitespace-pre-line leading-relaxed max-h-[120px] overflow-y-auto">{formData.lyrics}</p>
                                            </div>
                                        )}

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
                                            {isLoading ? <ZenLoading size="xs" /> : null}
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

                    {
                        step < 3 && (
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
                        )
                    }
                </div>

                {/* Inline Alert Notification */}
                <AnimatePresence>
                    {alert.show && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 5 }}
                            className="mt-8 p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex items-start gap-4"
                        >
                            <div className={cn(
                                "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                                alert.type === 'success' ? "bg-rose-500/10 text-rose-500" :
                                    alert.type === 'error' ? "bg-amber-500/10 text-amber-500" : "bg-blue-500/10 text-blue-500"
                            )}>
                                {alert.type === 'success' ? <CheckCircle2 size={16} /> :
                                    alert.type === 'error' ? <AlertCircle size={16} /> : <Sparkles size={16} />}
                            </div>
                            <div className="flex-1 space-y-1">
                                <h3 className="text-[11px] font-bold text-white uppercase tracking-wider">{alert.title}</h3>
                                <p className="text-[10px] text-white/40 font-medium leading-relaxed uppercase tracking-tight">
                                    {alert.message}
                                </p>
                            </div>
                            <button
                                onClick={() => setAlert(prev => ({ ...prev, show: false }))}
                                className="text-[9px] font-bold text-white/20 hover:text-white uppercase tracking-widest transition-colors"
                            >
                                Dismiss
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
