"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { usePlayerStore } from "@/store/player";
import { Play, Pause, Music2, ListMusic } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Types matching backend response
interface SearchResults {
    tracks?: Track[];
    playlists?: Playlist[];
}

interface Track {
    id: string;
    title: string;
    artist: string;
    audioUrl: string;
    duration: number;
    coverUrl?: string;
}

interface Playlist {
    id: string;
    name: string;
    isPublic: boolean;
}

export default function SearchPage() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResults | null>(null);
    const [loading, setLoading] = useState(false);
    const { currentTrack, isPlaying, setTrack, setQueue, togglePlay } = usePlayerStore();

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (query.trim()) {
                setLoading(true);
                try {
                    const res = await api.get(`/search?q=${encodeURIComponent(query)}&type=all`);
                    setResults(res.data);
                } catch (error) {
                    console.error("Search failed:", error);
                } finally {
                    setLoading(false);
                }
            } else {
                setResults(null);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [query]);

    const handlePlay = (track: Track) => {
        if (currentTrack?.id === track.id) {
            togglePlay();
        } else {
            setTrack(track);
            // If we have search results, maybe set them as queue? 
            // For now just play the song.
            if (results?.tracks) {
                setQueue(results.tracks);
            }
        }
    };

    return (
        <div className="space-y-6">
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur py-4">
                <h1 className="text-3xl font-bold mb-4">Search</h1>
                <Input
                    placeholder="What do you want to listen to?"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="h-12 text-lg bg-secondary/50 border-transparent focus:border-primary transition-all rounded-full px-6"
                />
            </div>

            <div className="space-y-8">
                {/* Loading State */}
                {loading && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <Skeleton key={i} className="h-20 w-full rounded-md" />
                        ))}
                    </div>
                )}

                {/* Empty State */}
                {!loading && !results && query.trim() === "" && (
                    <div className="flex flex-col items-center justify-center h-[50vh] text-muted-foreground">
                        <Music2 className="w-16 h-16 mb-4 opacity-20" />
                        <p>Play what you love</p>
                        <p className="text-sm">Search for artists, songs, podcasts, and more.</p>
                    </div>
                )}

                {/* No Results */}
                {!loading && results && (!results.tracks?.length && !results.playlists?.length) && (
                    <div className="text-center text-muted-foreground py-12">
                        <p>No results found for "{query}"</p>
                        <p className="text-sm">Please try a different keyword.</p>
                    </div>
                )}

                {/* Tracks Section */}
                {results?.tracks && results.tracks.length > 0 && (
                    <section>
                        <h2 className="text-xl font-semibold mb-4">Songs</h2>
                        <div className="space-y-2">
                            {results.tracks.map((track) => (
                                <motion.div
                                    key={track.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    whileHover={{ scale: 1.01, backgroundColor: "rgba(255,255,255,0.05)" }}
                                    className="group flex items-center p-2 rounded-md transition-colors cursor-pointer"
                                    onClick={() => handlePlay(track)}
                                >
                                    <div className="relative w-12 h-12 bg-secondary rounded flex items-center justify-center mr-4 group-hover:bg-primary/20 transition-colors">
                                        {currentTrack?.id === track.id && isPlaying ? (
                                            <Pause className="w-5 h-5 text-primary" />
                                        ) : (
                                            <>
                                                <Music2 className="w-6 h-6 text-muted-foreground group-hover:hidden" />
                                                <Play className="w-5 h-5 text-white hidden group-hover:block ml-1" />
                                            </>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <h3 className={`font-medium ${currentTrack?.id === track.id ? 'text-primary' : 'text-white'}`}>
                                            {track.title}
                                        </h3>
                                        <p className="text-sm text-muted-foreground">{track.artist}</p>
                                    </div>
                                    <div className="text-sm text-muted-foreground hidden md:block">
                                        {Math.floor((track.duration || 0) / 60)}:{((track.duration || 0) % 60).toString().padStart(2, '0')}
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Playlists Section */}
                {results?.playlists && results.playlists.length > 0 && (
                    <section>
                        <h2 className="text-xl font-semibold mb-4">Playlists</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {results.playlists.map((playlist) => (
                                <Card key={playlist.id} className="p-4 hover:bg-secondary/80 transition-colors cursor-pointer group">
                                    <div className="aspect-square bg-gradient-to-br from-zinc-800 to-zinc-900 rounded-md mb-3 flex items-center justify-center shadow-lg group-hover:shadow-2xl transition-all">
                                        <ListMusic className="w-12 h-12 text-zinc-700 group-hover:text-primary transition-colors" />
                                    </div>
                                    <h3 className="font-semibold truncate">{playlist.name}</h3>
                                    <p className="text-sm text-muted-foreground">Playlist</p>
                                </Card>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}
