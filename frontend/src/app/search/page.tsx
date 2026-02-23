"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Search as SearchIcon, Music, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track } from "@/store/player";
import { useDebounce } from "use-debounce";
import { useAuthStore } from "@/store/authStore";
import { TrackItem } from "@/components/track-item";
import { MediaCard } from "@/components/shared/MediaCard";
import Link from "next/link";
import { cn, getMediaUrl } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

const filters = [
    { id: 'all', label: 'All' },
    { id: 'track', label: 'Songs' },
    { id: 'artist', label: 'Artists' },
    { id: 'album', label: 'Albums' },
    { id: 'playlist', label: 'Playlists' },
];

export default function SearchPage() {
    const searchParams = useSearchParams();
    const initialType = searchParams.get('type') || 'all';
    const initialQuery = searchParams.get('q') || '';

    const [query, setQuery] = useState(initialQuery);
    const [selectedFilter, setSelectedFilter] = useState(initialType);
    const [debouncedQuery] = useDebounce(query, 400);
    const { isAuthenticated } = useAuthStore();

    // Sync state with URL params if they change (e.g. navigation)
    useEffect(() => {
        const type = searchParams.get('type');
        if (type) setSelectedFilter(type);
        const q = searchParams.get('q');
        if (q) setQuery(q);
    }, [searchParams]);

    const { data, isLoading } = useQuery({
        queryKey: ['search', debouncedQuery, selectedFilter],
        queryFn: async () => {
            // If no query, we might want to return trending/featured content instead of empty
            // But for now, let's try to search with empty string or handled by backend
            const res = await api.get('/search', {
                params: { q: debouncedQuery || 'a', type: selectedFilter, limit: 30 } // Hack: send 'a' to get some results if empty, or better, backend should handle it.
            });
            return res.data as {
                tracks?: Track[],
                playlists?: any[],
                artists?: any[],
                albums?: any[]
            };
        },
        enabled: isAuthenticated // Always enabled, using 'a' default
    });

    return (
        <div className="space-y-6 md:space-y-10 pb-32 pt-2 md:pt-6">
            {/* SEARCH TABS - Apple Style */}
            <div className="sticky top-0 z-40 bg-[var(--background)]/80 backdrop-blur-md px-4 md:px-6 py-3 md:py-4 border-b border-white/5 flex items-center gap-2 overflow-x-auto no-scrollbar">
                {filters.map((filter) => (
                    <button
                        key={filter.id}
                        onClick={() => setSelectedFilter(filter.id)}
                        className={cn(
                            "px-5 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all shrink-0",
                            selectedFilter === filter.id
                                ? "bg-foreground text-background shadow-lg"
                                : "text-muted hover:text-foreground hover:bg-white/5"
                        )}
                    >
                        {filter.label}
                    </button>
                ))}
            </div>

            <div className="px-4 md:px-6 space-y-10 md:space-y-16 max-w-[1600px]">
                {/* Content Sections */}
                <AnimatePresence mode="wait">
                    {isLoading ? (
                        <motion.div
                            key="loading"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center justify-center py-32"
                        >
                            <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center animate-pulse">
                                <div className="w-2 h-2 rounded-full bg-white animate-ping" />
                            </div>
                            <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-500">Searching Archive</p>
                        </motion.div>
                    ) : (
                        <motion.div
                            key={debouncedQuery + selectedFilter}
                            initial={{ opacity: 0, filter: "blur(10px)" }}
                            animate={{ opacity: 1, filter: "blur(0px)" }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className="space-y-16"
                        >
                            {/* Top Tracks Section */}
                            {data?.tracks && data.tracks.length > 0 && (
                                <section className="space-y-6">
                                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                        <h2 className="text-sm font-black text-foreground uppercase tracking-wider">Top Songs</h2>
                                        <button className="text-[10px] font-bold text-accent hover:underline flex items-center gap-1 uppercase tracking-widest">
                                            View All <ChevronRight size={10} />
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-xs md:text-sm">
                                        {data.tracks.slice(0, 8).map((track) => (
                                            <TrackItem key={track.id} track={track} />
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* Artists Section */}
                            {data?.artists && data.artists.length > 0 && (
                                <section className="space-y-6">
                                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                        <h2 className="text-sm font-black text-foreground uppercase tracking-wider">Top Artists</h2>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-6">
                                        {data.artists.map((artist: any) => (
                                            <Link key={artist.id} href={`/artist/${artist.id}`} className="group block text-center space-y-3">
                                                <div className="aspect-square rounded-full overflow-hidden bg-zinc-900 shadow-xl relative ring-1 ring-white/5 group-hover:ring-accent/50 transition-all">
                                                    <img
                                                        src={getMediaUrl(artist.imageUrl) || `https://api.dicebear.com/7.x/identicon/svg?seed=${artist.id}`}
                                                        className="w-full h-full object-cover grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700"
                                                    />
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                                                </div>
                                                <h3 className="font-bold text-[12px] tracking-tight group-hover:text-accent transition-colors truncate">{artist.name}</h3>
                                            </Link>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* Albums Section */}
                            {data?.albums && data.albums.length > 0 && (
                                <section className="space-y-6">
                                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                        <h2 className="text-sm font-black text-foreground uppercase tracking-wider">Albums</h2>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-6">
                                        {data.albums.map((album: any) => (
                                            <MediaCard
                                                key={album.id}
                                                track={{ ...album, artist: album.artist, title: album.title } as any}
                                            />
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* Playlists Section */}
                            {data?.playlists && data.playlists.length > 0 && (
                                <section className="space-y-6">
                                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                        <h2 className="text-sm font-black text-foreground uppercase tracking-wider">Playlists</h2>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-6">
                                        {data.playlists.map((playlist: any) => (
                                            <Link key={playlist.id} href={`/playlist/${playlist.id}`} className="group block space-y-3">
                                                <div className="aspect-square bg-zinc-900 rounded-xl overflow-hidden shadow-xl ring-1 ring-white/5 group-hover:ring-accent/50 group-hover:scale-[1.02] transition-all">
                                                    <img
                                                        src={getMediaUrl(playlist.coverUrl) || `https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=400&q=80`}
                                                        className="w-full h-full object-cover transition-all duration-700"
                                                    />
                                                </div>
                                                <div className="px-1">
                                                    <h3 className="font-bold text-[12px] truncate group-hover:text-accent transition-colors">{playlist.name}</h3>
                                                    <p className="text-[10px] text-zinc-500 font-medium truncate mt-0.5">{playlist.description || "Curated playlist"}</p>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* No Results Fallback */}
                            {(!data || (
                                !data.tracks?.length &&
                                !data.artists?.length &&
                                !data.albums?.length &&
                                !data.playlists?.length
                            )) && (
                                    <div className="flex flex-col items-center justify-center py-32">
                                        <div className="w-20 h-20 rounded-full border border-white/5 bg-white/5 mb-8 flex items-center justify-center shadow-2xl ring-1 ring-white/10">
                                            <SearchIcon size={28} className="text-zinc-600" strokeWidth={1.5} />
                                        </div>
                                        <h3 className="text-lg font-bold text-white mb-2">No results found</h3>
                                        <p className="text-[11px] text-zinc-500 font-black uppercase tracking-[0.3em] text-center max-w-xs leading-loose">
                                            We couldn't find any {selectedFilter === 'all' ? 'results' : selectedFilter + 's'} for "{debouncedQuery}"
                                        </p>
                                    </div>
                                )}
                        </motion.div>
                    )}
                </AnimatePresence>

                {!debouncedQuery && !isLoading && !data && (
                    <div className="flex flex-col items-center justify-center py-32 opacity-10">
                        <Music size={64} strokeWidth={1} className="mb-6 animate-pulse" />
                        <p className="text-[10px] font-black uppercase tracking-[0.6em]">Explore the Archive</p>
                    </div>
                )}

                {!debouncedQuery && !isLoading && !data && (
                    <div className="flex flex-col items-center justify-center py-32 opacity-10">
                        <Music size={64} strokeWidth={1} className="mb-6 animate-pulse" />
                        <p className="text-[10px] font-black uppercase tracking-[0.6em]">Explore the Archive</p>
                    </div>
                )}
            </div>
        </div>
    );
}
