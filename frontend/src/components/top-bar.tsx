"use client";

import { Search, Bell, User as UserIcon, ChevronLeft, ChevronRight, Play, SkipBack, SkipForward, Sparkles } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import { usePlayerStore } from "@/store/player";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useDebounce } from "use-debounce";
import api from "@/lib/api";

export function TopBar() {
    const { user } = useAuthStore();
    const { currentTrack, isPlaying, togglePlay, playNext, playPrev } = usePlayerStore();
    const router = useRouter();
    const [searchFocused, setSearchFocused] = useState(false);
    const [query, setQuery] = useState("");
    const [debouncedQuery] = useDebounce(query, 300);
    const [searchResults, setSearchResults] = useState<any>(null);

    useEffect(() => {
        const fetchResults = async () => {
            if (!debouncedQuery) {
                setSearchResults(null);
                return;
            }
            try {
                const res = await api.get('/search', { params: { q: debouncedQuery, limit: 5 } });
                setSearchResults(res.data);
            } catch (e) {
                console.error(e);
            }
        };
        fetchResults();
    }, [debouncedQuery]);

    return (
        <div className="h-full px-6 flex items-center justify-between gap-8">
            {/* History & Controls */}
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => router.back()}
                        className="btn-icon text-muted hover:text-foreground"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <button
                        onClick={() => router.forward()}
                        className="btn-icon text-muted hover:text-foreground"
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>

                {/* Mini Player Controls - Visible when scrolling or for convenient access */}
                {currentTrack && (
                    <div className="hidden lg:flex items-center gap-3 px-4 py-1.5 bg-surface-hover/50 rounded-full animate-in fade-in slide-in-from-left-4 duration-500">
                        <button onClick={playPrev} className="text-muted hover:text-foreground transition-colors">
                            <SkipBack size={14} fill="currentColor" />
                        </button>
                        <button
                            onClick={togglePlay}
                            className="w-7 h-7 flex items-center justify-center rounded-full bg-foreground text-background hover:scale-105 transition-transform"
                        >
                            {isPlaying ? <span className="text-[10px] font-bold">||</span> : <Play size={12} fill="currentColor" />}
                        </button>
                        <button onClick={playNext} className="text-muted hover:text-foreground transition-colors">
                            <SkipForward size={14} fill="currentColor" />
                        </button>
                        <div className="w-1" />
                        <div className="flex flex-col max-w-[120px]">
                            <span className="text-[11px] font-bold truncate leading-none">{currentTrack.title}</span>
                            <span className="text-[10px] text-muted truncate">{currentTrack.artist.name}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Centered Search */}
            {/* Centered Search */}
            <div className="flex-1 max-w-md relative group">
                <div className={cn(
                    "absolute inset-y-0 left-4 flex items-center pointer-events-none transition-colors",
                    searchFocused ? "text-accent" : "text-muted"
                )}>
                    <Search size={16} />
                </div>
                <input
                    type="text"
                    placeholder="Search music, artists, albums..."
                    value={query}
                    onFocus={() => setSearchFocused(true)}
                    // Delay blur to allow clicking on results
                    onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                    className="w-full bg-surface-hover/80 hover:bg-surface-hover transition-all focus:bg-surface-active focus:shadow-glow rounded-xl py-2 pl-12 pr-4 text-sm outline-none"
                    onChange={(e) => setQuery(e.target.value)}
                />

                {/* Instant Search Results Dropdown */}
                {searchFocused && query && searchResults && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
                        {searchResults.tracks?.length > 0 && (
                            <div className="p-2">
                                <h4 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-2 px-2">Songs</h4>
                                {searchResults.tracks.slice(0, 4).map((track: any) => (
                                    <button
                                        key={track.id}
                                        onClick={() => {
                                            const { setTrack } = usePlayerStore.getState();
                                            setTrack(track);
                                        }}
                                        className="w-full flex items-center gap-3 p-2 hover:bg-white/10 rounded-lg transition-colors text-left group"
                                    >
                                        <div className="w-8 h-8 rounded bg-zinc-800 overflow-hidden shrink-0">
                                            <img src={track.coverUrl?.startsWith('http') ? track.coverUrl : `http://localhost:3000${track.coverUrl}`} className="w-full h-full object-cover" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold truncate text-foreground group-hover:text-white">{track.title}</div>
                                            <div className="text-[10px] text-muted truncate">{track.artist.name} • {track.genre}</div>
                                        </div>
                                        <Play size={12} className="opacity-0 group-hover:opacity-100 mr-2" fill="currentColor" />
                                    </button>
                                ))}
                            </div>
                        )}

                        {searchResults.artists?.length > 0 && (
                            <div className="p-2 border-t border-white/5">
                                <h4 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-2 px-2">Artists</h4>
                                {searchResults.artists.slice(0, 3).map((artist: any) => (
                                    <button
                                        key={artist.id}
                                        onClick={() => router.push(`/search?type=artist&q=${encodeURIComponent(artist.name)}`)}
                                        className="w-full flex items-center gap-3 p-2 hover:bg-white/10 rounded-lg transition-colors text-left"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-zinc-800 overflow-hidden shrink-0">
                                            <img src={artist.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${artist.name}`} className="w-full h-full object-cover grayscale opacity-70" />
                                        </div>
                                        <div className="text-xs font-bold truncate text-foreground">{artist.name}</div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {(!searchResults.tracks?.length && !searchResults.artists?.length) && (
                            <div className="p-4 text-center text-xs text-muted italic">
                                No results found for "{query}"
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* User Controls */}
            <div className="flex items-center gap-3">
                <button
                    onClick={() => useUIStore.getState().setPricingModalOpen(true)}
                    className="hidden sm:flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[11px] font-semibold uppercase hover:bg-emerald-500/20 transition-all"
                >
                    <Sparkles size={14} />
                    Upgrade
                </button>

                <button className="btn-icon text-muted hover:text-foreground relative">
                    <Bell size={18} />
                    <div className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-accent rounded-full animate-pulse shadow-glow" />
                </button>

                <div className="w-1" />

                <button
                    onClick={() => router.push('/profile')}
                    className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full hover:bg-surface-hover transition-colors group"
                >
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-accent/40 to-accent flex items-center justify-center text-white text-[11px] font-bold group-hover:scale-105 transition-transform">
                        {user?.email?.[0].toUpperCase() || 'U'}
                    </div>
                </button>
            </div>
        </div>
    );
}
