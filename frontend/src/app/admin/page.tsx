"use client";
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UploadCloud, Music, Image as ImageIcon, CheckCircle, AlertCircle } from "lucide-react";
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/navigation';
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

const GENRES = [
    "Pop", "Rock", "Hip Hop", "R&B", "Jazz", "Classical",
    "Electronic", "Country", "Folk", "Indie", "Metal",
    "Reggae", "Soul", "Latin", "Soundtrack", "Alternative",
    "Dance", "Blues", "Funk", "Punk", "Disco", "Techno",
    "House", "Ambient", "Trap", "K-Pop", "J-Pop", "Lo-Fi"
].sort();

export default function AdminPage() {
    const { user, isAuthenticated } = useAuthStore();
    const router = useRouter();

    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const [formData, setFormData] = useState({
        title: '',
        artistName: '',
        genre: '',
        description: '',
        lyrics: '',
    });
    const [recentTracks, setRecentTracks] = useState<any[]>([]);

    const fetchRecentTracks = async () => {
        try {
            const res = await api.get('/tracks?limit=5');
            setRecentTracks(res.data.items || []);
        } catch (err) {
            console.error("Failed to fetch tracks", err);
        }
    };

    useEffect(() => {
        fetchRecentTracks();
    }, []);

    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [coverFile, setCoverFile] = useState<File | null>(null);

    // Protect route manually if needed, though middleware might handle it
    if (isAuthenticated && user?.role !== 'ADMIN') {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-4">
                    <Shield className="w-12 h-12 text-destructive mx-auto" />
                    <h1 className="text-2xl font-bold">Access Denied</h1>
                    <p className="text-muted">You do not have permission to view this page.</p>
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
            setMessage({ type: 'error', text: 'Please fill in required fields (Title, Artist, Audio File).' });
            setIsLoading(false);
            return;
        }

        try {
            const data = new FormData();
            data.append('title', formData.title);
            data.append('artistName', formData.artistName);
            data.append('genre', formData.genre);
            data.append('description', formData.description);
            data.append('lyrics', formData.lyrics);
            data.append('audio', audioFile);
            if (coverFile) data.append('cover', coverFile);

            await api.post('/tracks/upload', data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            setMessage({ type: 'success', text: 'Track uploaded successfully!' });
            // Reset form
            setFormData({ title: '', artistName: '', genre: '', description: '', lyrics: '' });
            setAudioFile(null);
            setCoverFile(null);
            fetchRecentTracks();

            // Clear file inputs visually
            const fileInputs = document.querySelectorAll('input[type="file"]') as NodeListOf<HTMLInputElement>;
            fileInputs.forEach(input => input.value = '');

        } catch (error: any) {
            console.error(error);
            setMessage({ type: 'error', text: error.response?.data?.message || 'Upload failed. Please try again.' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-8 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-gradient">Admin Console</h1>
                    <p className="text-muted font-medium mt-1">Manage content and upload new tracks</p>
                </div>
            </div>

            <Card className="section-glow border-none bg-surface/50 backdrop-blur-xl">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                        <UploadCloud className="w-5 h-5 text-accent" />
                        Upload New Track
                    </CardTitle>
                    <CardDescription>Add a new song to the Zenify implementation.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {message && (
                            <div className={cn(
                                "p-4 rounded-lg flex items-center gap-3 text-sm font-medium animate-in slide-in-from-top-2",
                                message.type === 'success' ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
                            )}>
                                {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                                {message.text}
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Metadata Column */}
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="title" className="text-xs font-bold uppercase tracking-wider text-muted-dark">Title *</Label>
                                    <Input
                                        id="title"
                                        name="title"
                                        placeholder="e.g. Midnight City"
                                        value={formData.title}
                                        onChange={handleInputChange}
                                        className="bg-surface-hover/50 border-none rounded-xl focus:ring-1 focus:ring-accent/50"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="artistName" className="text-xs font-bold uppercase tracking-wider text-muted-dark">Artist *</Label>
                                    <Input
                                        id="artistName"
                                        name="artistName"
                                        placeholder="e.g. M83"
                                        value={formData.artistName}
                                        onChange={handleInputChange}
                                        className="bg-surface-hover/50 border-none rounded-xl focus:ring-1 focus:ring-accent/50"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="genre" className="text-xs font-bold uppercase tracking-wider text-muted-dark">Genre</Label>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                className={cn(
                                                    "w-full justify-between bg-surface-hover/50 border-none rounded-xl h-10 px-3 py-2 text-sm font-normal hover:bg-surface-hover/70 hover:text-foreground",
                                                    !formData.genre && "text-muted-foreground"
                                                )}
                                            >
                                                {formData.genre || "Select Genre"}
                                                <ChevronDown className="h-4 w-4 opacity-50" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-56 max-h-[300px] overflow-y-auto bg-surface-hover border-white/10 text-foreground rounded-xl backdrop-blur-xl">
                                            {GENRES.map((genre) => (
                                                <DropdownMenuItem
                                                    key={genre}
                                                    onClick={() => setFormData(prev => ({ ...prev, genre: genre }))}
                                                    className="focus:bg-accent/20 focus:text-accent cursor-pointer"
                                                >
                                                    {genre}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>

                            {/* Files Column */}
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-dark">Audio File *</Label>
                                    <div className={cn(
                                        "border-2 border-dashed border-white/10 rounded-xl p-6 flex flex-col items-center justify-center gap-2 transition-colors hover:bg-surface-hover/50 cursor-pointer relative group",
                                        audioFile && "border-accent/40 bg-accent/5"
                                    )}>
                                        <input
                                            type="file"
                                            accept="audio/*"
                                            onChange={(e) => handleFileChange(e, 'audio')}
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                            required
                                        />
                                        <div className="w-10 h-10 rounded-full bg-surface-active flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <Music className={cn("w-5 h-5", audioFile ? "text-accent" : "text-muted")} />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-sm font-medium text-foreground">
                                                {audioFile ? audioFile.name : "Click to upload audio"}
                                            </p>
                                            <p className="text-xs text-muted mt-1">MP3, WAV, FLAC (Max 20MB)</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-dark">Cover Art</Label>
                                    <div className={cn(
                                        "border-2 border-dashed border-white/10 rounded-xl p-6 flex flex-col items-center justify-center gap-2 transition-colors hover:bg-surface-hover/50 cursor-pointer relative group",
                                        coverFile && "border-accent/40 bg-accent/5"
                                    )}>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => handleFileChange(e, 'cover')}
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                        />
                                        <div className="w-10 h-10 rounded-full bg-surface-active flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <ImageIcon className={cn("w-5 h-5", coverFile ? "text-accent" : "text-muted")} />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-sm font-medium text-foreground">
                                                {coverFile ? coverFile.name : "Click to upload cover"}
                                            </p>
                                            <p className="text-xs text-muted mt-1">JPG, PNG (Max 5MB)</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Extended Details */}
                        <div className="space-y-2">
                            <Label htmlFor="description" className="text-xs font-bold uppercase tracking-wider text-muted-dark">Description</Label>
                            <Textarea
                                id="description"
                                name="description"
                                placeholder="Tell us about the track..."
                                value={formData.description}
                                onChange={handleInputChange}
                                className="bg-surface-hover/50 border-none rounded-xl focus:ring-1 focus:ring-accent/50 min-h-[80px]"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="lyrics" className="text-xs font-bold uppercase tracking-wider text-muted-dark">Lyrics</Label>
                            <Textarea
                                id="lyrics"
                                name="lyrics"
                                placeholder="[00:10.00] Line one..."
                                value={formData.lyrics}
                                onChange={handleInputChange}
                                className="bg-surface-hover/50 border-none rounded-xl focus:ring-1 focus:ring-accent/50 min-h-[120px] font-mono text-xs"
                            />
                        </div>

                        <div className="pt-4 flex justify-end">
                            <Button
                                type="submit"
                                disabled={isLoading}
                                className="bg-accent text-white hover:bg-accent/90 rounded-full px-8 py-6 font-bold uppercase tracking-widest shadow-glow hover:shadow-glow-hover transition-all"
                            >
                                {isLoading ? (
                                    <span className="flex items-center gap-2">
                                        <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                                        Uploading...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <UploadCloud size={18} />
                                        Upload Track
                                    </span>
                                )}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <div className="space-y-4">
                <h3 className="text-xl font-bold tracking-tight px-1">Recent Local Uploads</h3>
                <div className="grid gap-4">
                    {recentTracks.map((track) => (
                        <div key={track.id} className="flex items-center gap-4 p-4 bg-surface/30 rounded-xl border border-white/5 hover:bg-surface/50 transition-colors">
                            <div className="h-12 w-12 rounded-md bg-zinc-800 overflow-hidden flex-shrink-0">
                                <img
                                    src={track.coverUrl?.startsWith('http') ? track.coverUrl : `http://localhost:3000${track.coverUrl || ''}`}
                                    alt={track.title}
                                    className="h-full w-full object-cover"
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-sm truncate">{track.title}</h4>
                                <p className="text-xs text-muted truncate">{track.artist.name}</p>
                            </div>
                            <div className="text-xs text-muted-dark tabular-nums">
                                {new Date(track.createdAt).toLocaleDateString()}
                            </div>
                        </div>
                    ))}
                    {recentTracks.length === 0 && (
                        <div className="p-8 text-center text-muted text-sm border-2 border-dashed border-white/5 rounded-xl">
                            No tracks found in the archive.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Importing Shield for the access check fallback
import { Shield } from "lucide-react";
