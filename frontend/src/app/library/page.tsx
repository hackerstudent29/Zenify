"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track } from "@/store/player";
import { Button } from "@/components/ui/button";
import { TrackItem } from "@/components/track-item";
import { Plus, Heart, Music, Mic2, Disc, LayoutGrid, List } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useState } from "react";
import { CreatePlaylistModal } from "@/components/create-playlist-modal";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const tabs = [
    { id: 'all', label: 'Overview', icon: LayoutGrid },
    { id: 'playlists', label: 'Playlists', icon: List },
    { id: 'liked', label: 'Liked Songs', icon: Heart },
    { id: 'albums', label: 'Albums', icon: Disc },
    { id: 'artists', label: 'Artists', icon: Mic2 },
];

export default function LibraryPage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('all');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const { isAuthenticated } = useAuthStore();

    const { data: likedTracks, isLoading: tracksLoading } = useQuery({
        queryKey: ['liked-tracks'],
        queryFn: async () => {
            try {
                const res = await api.get('/tracks/liked');
                return res.data as Track[];
            } catch (e) { return [] }
        },
        enabled: isAuthenticated
    });

    const { data: playlists, isLoading: playlistsLoading } = useQuery({
        queryKey: ['my-playlists'],
        queryFn: async () => {
            try {
                const res = await api.get('/playlists/my');
                return res.data as any[];
            } catch (e) { return [] }
        },
        enabled: isAuthenticated
    });

    const isLoading = tracksLoading || playlistsLoading || !isAuthenticated;

    if (isLoading) return (
        <div className="flex flex-col items-center justify-center h-[60vh] text-[var(--muted-dark)] animate-pulse">
            <Music size={48} className="mb-4 opacity-20" />
            <p className="text-xs font-bold uppercase tracking-[0.4em]">Loading Library...</p>
        </div>
    );

    // Derived unique artists and albums from liked tracks (Simplified for now)
    const uniqueArtists = Array.from(new Set(likedTracks?.map(t => JSON.stringify(t.artist)))).map(s => JSON.parse(s));
    const uniqueAlbums = Array.from(new Set(likedTracks?.filter(t => t.album).map(t => JSON.stringify(t.album)))).map(s => JSON.parse(s));

    return (
        <div className="max-w-7xl mx-auto pb-32 pt-8 px-6 space-y-12">
            {/* Header & Tabs */}
            <div className="space-y-8">
                <div className="flex items-end justify-between">
                    <div>
                        <h1 className="text-4xl font-bold tracking-tight text-white mb-2">Your Library</h1>
                        <p className="text-sm text-[var(--muted-dark)] font-medium uppercase tracking-[0.1em]">Your music, playlists and artists</p>
                    </div>
                    <Button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="bg-[var(--accent)] text-black hover:bg-violet-400 rounded-full px-6 py-6 font-bold text-xs uppercase tracking-widest transition-transform active:scale-95"
                    >
                        <Plus className="mr-2 h-4 w-4" /> Create Playlist
                    </Button>
                </div>

                <div className="flex items-center gap-2 p-1.5 bg-[var(--surface-hover)]/40 backdrop-blur-3xl rounded-2xl border border-[var(--border)] w-fit">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all relative",
                                activeTab === tab.id ? "text-white" : "text-[var(--muted-dark)] hover:text-[var(--foreground)]"
                            )}
                        >
                            <tab.icon size={14} />
                            {tab.label}
                            {activeTab === tab.id && (
                                <motion.div layoutId="lib-tab-active" className="absolute inset-0 bg-white/5 rounded-xl border border-white/5 shadow-xl" />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                >
                    {/* OVERVIEW TAB */}
                    {activeTab === 'all' && (
                        <div className="space-y-16">
                            <section>
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--accent)]">Playlists</h2>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                                    {playlists?.slice(0, 5).map((p) => (
                                        <CollectionCard key={p.id} item={p} type="playlist" />
                                    ))}
                                    {(!playlists || playlists.length === 0) && <EmptyState label="Library is empty" />}
                                </div>
                            </section>

                            <section>
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--accent)]">Liked Songs</h2>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {likedTracks?.slice(0, 6).map((track) => (
                                        <TrackItem key={track.id} track={track} />
                                    ))}
                                    {(!likedTracks || likedTracks.length === 0) && <EmptyState label="No songs found" />}
                                </div>
                            </section>
                        </div>
                    )}

                    {/* PLAYLISTS TAB */}
                    {activeTab === 'playlists' && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                            {playlists?.map((p) => (
                                <CollectionCard key={p.id} item={p} type="playlist" />
                            ))}
                            {(!playlists || playlists.length === 0) && <EmptyState label="No curated contexts yet" />}
                        </div>
                    )}

                    {/* LIKED SONGS TAB */}
                    {activeTab === 'liked' && (
                        <div className="space-y-1 max-w-4xl">
                            {likedTracks?.map((track) => (
                                <TrackItem key={track.id} track={track} />
                            ))}
                            {(!likedTracks || likedTracks.length === 0) && <EmptyState label="Nothing here yet" />}
                        </div>
                    )}

                    {/* ALBUMS TAB */}
                    {activeTab === 'albums' && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                            {uniqueAlbums.map((album) => (
                                <CollectionCard key={album.id} item={album} type="album" />
                            ))}
                            {uniqueAlbums.length === 0 && <EmptyState label="No saved collections" />}
                        </div>
                    )}

                    {/* ARTISTS TAB */}
                    {activeTab === 'artists' && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                            {uniqueArtists.map((artist) => (
                                <Link key={artist.id} href={`/artist/${artist.id}`} className="group block text-center space-y-4">
                                    <div className="aspect-square rounded-full overflow-hidden border-2 border-white/5 transition-all duration-500 group-hover:border-[var(--accent)] shadow-2xl grayscale group-hover:grayscale-0">
                                        <img src={artist.imageUrl || `https://picsum.photos/seed/${artist.id}/400/400`} alt={artist.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                    </div>
                                    <h3 className="font-bold text-sm tracking-tight">{artist.name}</h3>
                                </Link>
                            ))}
                            {uniqueArtists.length === 0 && <EmptyState label="No followed entities" />}
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>

            <CreatePlaylistModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
            />
        </div>
    );
}

function CollectionCard({ item, type }: { item: any, type: 'playlist' | 'album' }) {
    return (
        <Link href={`/${type}/${item.id}`} className="group block space-y-3">
            <div className="aspect-square bg-[var(--surface-hover)] rounded-2xl overflow-hidden border border-[var(--border)] group-hover:border-[var(--accent)]/50 transition-all shadow-xl relative">
                <img
                    src={item.coverUrl || `https://picsum.photos/seed/${item.id}/500/500`}
                    alt={item.name || item.title}
                    className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                    <div className="w-10 h-10 rounded-full bg-[var(--accent)] flex items-center justify-center text-black shadow-2xl transform translate-y-4 group-hover:translate-y-0 transition-transform">
                        <Plus size={18} strokeWidth={3} />
                    </div>
                </div>
            </div>
            <div>
                <h3 className="font-bold text-sm truncate">{item.name || item.title}</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted-dark)]">
                    {type === 'playlist' ? (item.isPublic ? 'Public Playlist' : 'Private Playlist') : item.artist?.name}
                </p>
            </div>
        </Link>
    );
}

function EmptyState({ label }: { label: string }) {
    return (
        <div className="col-span-full py-20 flex flex-col items-center justify-center border border-dashed border-white/5 rounded-3xl opacity-30 text-[var(--muted-dark)] space-y-4">
            <div className="w-16 h-16 rounded-full border border-white/10 flex items-center justify-center">
                <Music size={24} strokeWidth={1} />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.2em]">{label}</p>
        </div>
    )
}
