"use client";

import {
    Search, Bell, User as UserIcon, ChevronLeft, ChevronRight,
    Play, SkipBack, SkipForward, Sparkles, MoreHorizontal,
    Heart, Plus, Download, Music, Mic2, Disc
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import { usePlayerStore } from "@/store/player";
import AnimatedList from '@/components/shared/AnimatedList';
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { cn, getMediaUrl } from "@/lib/utils";
import { useDebounce } from "use-debounce";
import api from "@/lib/api";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuPortal,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";

export function TopBar() {
    const { user } = useAuthStore();
    const { currentTrack, isPlaying, togglePlay, playNext, playPrev } = usePlayerStore();
    const router = useRouter();
    const [searchFocused, setSearchFocused] = useState(false);
    const [query, setQuery] = useState("");
    const [debouncedQuery] = useDebounce(query, 300);
    const [searchResults, setSearchResults] = useState<any>(null);
    const [activeFilter, setActiveFilter] = useState("all");

    // Favorites state
    const [likedTrackIds, setLikedTrackIds] = useState<string[]>([]);

    // Fetch initial data
    const [playlists, setPlaylists] = useState<any[]>([]);
    useEffect(() => {
        if (user) {
            api.get('/playlists/my').then(res => setPlaylists(res.data)).catch(() => { });
            api.get('/tracks/liked').then(res => setLikedTrackIds(res.data.map((t: any) => t.id))).catch(() => { });
        }
    }, [user]);

    const toggleFavorite = async (e: React.MouseEvent, trackId: string) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            await api.post(`/tracks/${trackId}/like`);
            setLikedTrackIds(prev =>
                prev.includes(trackId) ? prev.filter(id => id !== trackId) : [...prev, trackId]
            );
        } catch (err) {
            console.error("Failed to toggle favorite", err);
        }
    };

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
        <div className="h-full px-4 md:px-6 flex items-center justify-between gap-4 md:gap-8">
            {/* History & Controls */}
            <div className="hidden md:flex items-center gap-6">
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
                    <div className="hidden lg:flex items-center gap-3 px-3 py-1 bg-surface-hover/40 rounded-full border border-white/5 animate-in fade-in slide-in-from-left-4 duration-500 hover:bg-surface-hover/60 transition-colors">
                        <div className="w-8 h-8 rounded-full bg-zinc-800 overflow-hidden shrink-0 border border-white/10 shadow-lg">
                            <img
                                src={getMediaUrl(currentTrack.coverUrl) || `https://api.dicebear.com/7.x/identicon/svg?seed=${currentTrack.id}`}
                                className="w-full h-full object-cover"
                                alt={currentTrack.title}
                            />
                        </div>
                        <div className="flex items-center gap-2.5 px-1">
                            <button onClick={playPrev} className="text-muted hover:text-foreground transition-colors p-1">
                                <SkipBack size={14} fill="currentColor" />
                            </button>
                            <button
                                onClick={togglePlay}
                                className="w-7 h-7 flex items-center justify-center rounded-full bg-foreground text-background hover:scale-105 transition-transform"
                            >
                                {isPlaying ? <span className="text-[10px] font-bold">||</span> : <Play size={12} fill="currentColor" className="ml-0.5" />}
                            </button>
                            <button onClick={playNext} className="text-muted hover:text-foreground transition-colors p-1">
                                <SkipForward size={14} fill="currentColor" />
                            </button>
                        </div>
                        <div className="h-4 w-px bg-white/10" />
                        <div className="flex flex-col max-w-[110px] pr-2">
                            <span className="text-[11px] font-bold truncate leading-none text-foreground">{currentTrack.title}</span>
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
                    onBlur={(e) => {
                        // Delay check to allow focus to settle on new target (like dropdown items)
                        setTimeout(() => {
                            const activeEl = document.activeElement;
                            const isInsideSearch = activeEl?.closest('.search-container');
                            const isInsideDropdown = activeEl?.closest('[role="menu"]'); // Radix dropdowns use role="menu"

                            if (!isInsideSearch && !isInsideDropdown) {
                                setSearchFocused(false);
                            }
                        }, 100);
                    }}
                    className="w-full bg-surface-hover/80 hover:bg-surface-hover transition-all focus:bg-surface-active focus:shadow-glow rounded-xl py-2 pl-12 pr-4 text-sm outline-none"
                    onChange={(e) => setQuery(e.target.value)}
                />

                {/* Instant Search Results Dropdown */}
                <AnimatePresence>
                    {searchFocused && query && searchResults && (
                        <motion.div
                            initial={{ opacity: 0, y: 8, scale: 0.99 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.99 }}
                            className="search-container absolute top-full left-0 right-0 mt-3 bg-[#1c1c1e]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] overflow-hidden z-50 flex flex-col max-h-[440px]"
                            onMouseDown={(e) => e.preventDefault()} // Prevent input blur when clicking inside
                        >
                            {/* Filter Bar */}
                            <div className="flex items-center gap-2 p-3 border-b border-white/5 bg-white/5">
                                {['all', 'songs', 'artists', 'albums'].map((f) => (
                                    <button
                                        key={f}
                                        onMouseDown={(e) => {
                                            e.preventDefault(); // Critical: prevents input from losing focus
                                            setActiveFilter(f);
                                        }}
                                        className={cn(
                                            "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
                                            activeFilter === f ? "bg-white text-black shadow-lg" : "text-muted hover:text-white hover:bg-white/5"
                                        )}
                                    >
                                        {f}
                                    </button>
                                ))}
                            </div>

                            <div className="flex-1 overflow-hidden">
                                <AnimatedList
                                    items={[
                                        ...((activeFilter === 'all' || activeFilter === 'songs') ? (searchResults.tracks || []) : []),
                                        ...((activeFilter === 'all' || activeFilter === 'artists') ? (searchResults.artists || []).map((a: any) => ({ ...a, isArtist: true })) : [])
                                    ]}
                                    displayScrollbar={true}
                                    showGradients={true}
                                    renderItem={(item: any, index: number, isSelected: boolean) => {
                                        if (item.isArtist) {
                                            return (
                                                <div
                                                    key={item.id}
                                                    onClick={() => router.push(`/search?type=artist&q=${encodeURIComponent(item.name)}`)}
                                                    className={cn(
                                                        "group/artist flex items-center gap-3 p-2 rounded-xl transition-all cursor-pointer",
                                                        isSelected ? "bg-white/10" : "hover:bg-white/5"
                                                    )}
                                                >
                                                    <div className="w-10 h-10 rounded-full bg-zinc-800 overflow-hidden shrink-0 border border-white/5 shadow-lg">
                                                        <img src={item.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${item.name}`} className="w-full h-full object-cover grayscale opacity-70 group-hover/artist:grayscale-0 group-hover/artist:opacity-100 transition-all" alt={item.name} />
                                                    </div>
                                                    <div className="flex-1 font-bold text-[13px] text-foreground group-hover/artist:text-white">{item.name}</div>
                                                    <div className="text-[10px] font-bold text-muted uppercase tracking-widest mr-2 opacity-60">Artist</div>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div
                                                key={item.id}
                                                className={cn(
                                                    "group/item flex items-center gap-3 p-2 rounded-xl transition-all cursor-pointer",
                                                    isSelected ? "bg-white/10" : "hover:bg-white/5"
                                                )}
                                                onClick={() => {
                                                    const { setTrack } = usePlayerStore.getState();
                                                    setTrack(item);
                                                }}
                                            >
                                                <div className="w-10 h-10 rounded-lg bg-zinc-800 overflow-hidden shrink-0 shadow-md border border-white/5">
                                                    <img src={getMediaUrl(item.coverUrl) || `https://api.dicebear.com/7.x/identicon/svg?seed=${item.id}`} className="w-full h-full object-cover" alt={item.title} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[13px] font-bold truncate text-foreground group-hover/item:text-white">{item.title}</div>
                                                    <div className="text-[10px] text-muted truncate leading-relaxed">{item.artist.name} • {item.genre}</div>
                                                </div>

                                                <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover/item:opacity-100 transition-opacity">
                                                    <button
                                                        className={cn(
                                                            "p-2 transition-colors duration-300",
                                                            likedTrackIds.includes(item.id) ? "text-[#EF4444]" : "text-muted hover:text-[#EF4444]"
                                                        )}
                                                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                        onClick={(e) => toggleFavorite(e, item.id)}
                                                    >
                                                        <Heart size={14} className={likedTrackIds.includes(item.id) ? "fill-current" : ""} />
                                                    </button>

                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <button
                                                                className="p-2 text-muted hover:text-foreground transition-colors"
                                                                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                            >
                                                                <MoreHorizontal size={14} />
                                                            </button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent
                                                            className="w-52"
                                                            align="end"
                                                            onCloseAutoFocus={(e) => e.preventDefault()}
                                                            onInteractOutside={(e) => {
                                                                // Prevent the dropdown from closing the search overlay when clicking inside it
                                                                const isSearchContainer = (e.target as Element).closest('.search-container');
                                                                if (isSearchContainer) {
                                                                    e.preventDefault();
                                                                }
                                                            }}
                                                        >
                                                            <DropdownMenuItem
                                                                onClick={(e) => toggleFavorite(e as any, item.id)}
                                                            >
                                                                <Heart size={14} className={likedTrackIds.includes(item.id) ? "fill-current text-[#EF4444]" : "opacity-70"} />
                                                                <span>{likedTrackIds.includes(item.id) ? "Liked" : "Add to Favorites"}</span>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSub>
                                                                <DropdownMenuSubTrigger>
                                                                    <Plus size={14} className="opacity-70" /> <span>Add to Playlist</span>
                                                                </DropdownMenuSubTrigger>
                                                                <DropdownMenuPortal>
                                                                    <DropdownMenuSubContent className="w-48 ml-1">
                                                                        {playlists.map((p: any) => (
                                                                            <DropdownMenuItem
                                                                                key={p.id}
                                                                                onClick={() => {
                                                                                    api.post(`/playlists/${p.id}/tracks`, { trackId: item.id });
                                                                                }}
                                                                            >
                                                                                {p.name}
                                                                            </DropdownMenuItem>
                                                                        ))}
                                                                    </DropdownMenuSubContent>
                                                                </DropdownMenuPortal>
                                                            </DropdownMenuSub>
                                                            <DropdownMenuSeparator className="bg-white/10" />
                                                            <DropdownMenuItem
                                                                onClick={() => window.open(item.audioUrl, '_blank')}
                                                            >
                                                                <Download size={14} className="opacity-70" /> <span>Download Track</span>
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </div>
                                        );
                                    }}
                                />

                                {((activeFilter === 'all' && !searchResults.tracks?.length && !searchResults.artists?.length) ||
                                    (activeFilter === 'songs' && !searchResults.tracks?.length) ||
                                    (activeFilter === 'artists' && !searchResults.artists?.length)) && (
                                        <div className="p-12 text-center bg-white/[0.02] m-3 rounded-2xl border border-white/5">
                                            <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <Search size={24} className="text-white/20" />
                                            </div>
                                            <h3 className="text-sm font-bold text-white mb-1">No results found</h3>
                                            <p className="text-[11px] text-muted max-w-[180px] mx-auto">We couldn't find any results for "{query}"</p>
                                        </div>
                                    )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* User Controls */}
            <div className="flex items-center gap-3">
                <button
                    onClick={() => router.push('/about')}
                    className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-muted hover:text-foreground text-[12px] font-medium tracking-wide transition-colors"
                >
                    ABOUT
                </button>

                <button
                    onClick={() => router.push('/pricing')}
                    className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-muted hover:text-foreground text-[12px] font-medium tracking-wide transition-colors group"
                >
                    <Sparkles size={14} className="group-hover:text-accent transition-colors" />
                    UPGRADE
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
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-accent/40 to-accent flex items-center justify-center text-white text-[11px] font-bold group-hover:scale-105 transition-transform overflow-hidden border border-white/10">
                        {user?.avatarUrl ? (
                            <img src={getMediaUrl(user.avatarUrl)} className="w-full h-full object-cover" alt="Profile" />
                        ) : (
                            user?.email?.[0].toUpperCase() || 'U'
                        )}
                    </div>
                </button>
            </div>
        </div>
    );
}
