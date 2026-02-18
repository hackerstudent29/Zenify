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
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
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
        <div className="space-y-10 pb-32 pt-6">
            {/* SEARCH TABS - Apple Style */}
            <div className="sticky top-0 z-40 bg-[var(--background)]/80 backdrop-blur-md px-6 py-4 border-b border-white/5 flex items-center gap-2 overflow-x-auto no-scrollbar">
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

            <div className="px-6 space-y-16 max-w-[1600px]">
                {isLoading && (
                    <div className="flex flex-col items-center justify-center py-20 animate-pulse">
                        <div className="w-12 h-12 rounded-xl bg-accent/20 border border-accent/40 animate-spin mb-4" />
                        <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-muted-dark">Searching Archive...</p>
                    </div>
                )}

                {/* Top Tracks Section */}
                {data?.tracks && data.tracks.length > 0 && (
                    <section className="space-y-6">
                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                            <h2 className="text-sm font-black text-foreground uppercase tracking-wider">Top Songs</h2>
                            <button className="text-[10px] font-bold text-accent hover:underline flex items-center gap-1 uppercase tracking-widest">
                                View All Result <ChevronRight size={10} />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-1">
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
                                    <div className="aspect-square rounded-full overflow-hidden bg-surface-hover shadow-xl relative ring-1 ring-white/5 group-hover:ring-accent/50 transition-all">
                                        <img
                                            src={artist.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${artist.name}`}
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

                {/* Albums & Playlists Section */}
                {(data?.albums || data?.playlists) && (
                    <div className="space-y-16">
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

                        {data?.playlists && data.playlists.length > 0 && (
                            <section className="space-y-6">
                                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                    <h2 className="text-sm font-black text-foreground uppercase tracking-wider">Playlists</h2>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-6">
                                    {data.playlists.map((playlist: any) => (
                                        <Link key={playlist.id} href={`/playlist/${playlist.id}`} className="group block space-y-3">
                                            <div className="aspect-square bg-surface-hover rounded-xl overflow-hidden shadow-xl ring-1 ring-white/5 group-hover:ring-accent/50 group-hover:scale-[1.02] transition-all">
                                                <img
                                                    src={playlist.coverUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${playlist.name}`}
                                                    className="w-full h-full object-cover transition-all duration-700"
                                                />
                                            </div>
                                            <div className="px-1">
                                                <h3 className="font-bold text-[12px] truncate group-hover:text-accent transition-colors">{playlist.name}</h3>
                                                <p className="text-[10px] text-muted font-medium truncate mt-0.5">{playlist.description || "Curated playlist"}</p>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>
                )}

                {/* Empty State */}
                {!isLoading && debouncedQuery && (!data?.tracks?.length && !data?.playlists?.length && !data?.artists?.length && !data?.albums?.length) && (
                    <div className="flex flex-col items-center justify-center py-32 opacity-20">
                        <div className="w-16 h-16 rounded-full border border-dashed border-white/40 mb-6 flex items-center justify-center">
                            <SearchIcon size={24} />
                        </div>
                        <p className="text-xs font-black uppercase tracking-[0.4em]">No results found</p>
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
