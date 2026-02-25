"use client";

import { Library, Search, Plus, Filter, Heart, Clock, User, Disc, Music, Play } from "lucide-react";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn, getMediaUrl } from "@/lib/utils";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track } from "@/store/player";
import { TrackItem } from "@/components/track-item";
import Link from "next/link";

const categories = [
    { id: 'playlists', label: 'Playlists', icon: Library },
    { id: 'albums', label: 'Albums', icon: Disc },
    { id: 'liked', label: 'Liked Songs', icon: Heart },
    { id: 'artists', label: 'Artists', icon: User, disabled: true },
];

export default function LibraryPage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('playlists');

    const { data: likedTracks, isLoading: isLoadingTracks } = useQuery({
        queryKey: ['liked-tracks'],
        queryFn: async () => {
            const res = await api.get('/tracks/liked');
            return res.data as Track[];
        }
    });

    const { data: playlists, isLoading: isLoadingPlaylists } = useQuery({
        queryKey: ['my-playlists'],
        queryFn: async () => {
            const res = await api.get('/playlists/my');
            return res.data;
        }
    });

    const { data: albums, isLoading: isLoadingAlbums } = useQuery({
        queryKey: ['my-albums'],
        queryFn: async () => {
            const res = await api.get('/albums');
            return res.data as { id: string, title: string, coverUrl: string, artist: { name: string } }[];
        }
    });

    return (
        <div className="min-h-screen bg-background pb-32">
            {/* Header Area */}
            <div className="sticky top-0 z-50 glass border-b border-white/5 px-4 py-4 md:px-8">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center shadow-lg shadow-accent/20 border border-white/10">
                            <Library size={20} className="text-black" />
                        </div>
                        <h1 className="text-2xl font-black text-foreground tracking-tight">Your Library</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <button className="btn-icon bg-white/5 text-muted hover:text-foreground">
                            <Search size={18} />
                        </button>
                        <button className="btn-icon bg-white/5 text-muted hover:text-foreground">
                            <Plus size={18} />
                        </button>
                    </div>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                    {categories.map((cat) => (
                        <button
                            key={cat.id}
                            disabled={cat.disabled}
                            onClick={() => setActiveTab(cat.id)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all",
                                activeTab === cat.id
                                    ? "bg-foreground text-background"
                                    : "bg-surface-hover text-muted hover:text-foreground hover:bg-white/10"
                                , cat.disabled && "opacity-40 cursor-not-allowed"
                            )}
                        >
                            <cat.icon size={14} className={activeTab === cat.id ? "text-background" : "text-muted"} />
                            {cat.label}
                        </button>
                    ))}
                    <div className="w-px h-6 bg-white/10 mx-1" />
                    <button className="btn-icon h-8 w-8 bg-surface-hover text-muted hover:text-foreground">
                        <Filter size={14} />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="px-4 py-6 md:px-8">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                    >

                        {/* Playlists Tab */}
                        {activeTab === 'playlists' && (
                            <div>
                                {isLoadingPlaylists ? (
                                    <div className="flex items-center justify-center py-20">
                                        <ZenLoading size="md" />
                                    </div>
                                ) : playlists && playlists.length > 0 ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-5">
                                        {/* Create New Playlist Card */}
                                        <div className="group block space-y-3 cursor-pointer">
                                            <div className="aspect-square bg-white/[0.02] border border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center gap-2 group-hover:bg-white/[0.05] transition-colors">
                                                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                                                    <Plus size={20} className="text-muted group-hover:text-foreground" />
                                                </div>
                                            </div>
                                            <div className="px-1 text-center">
                                                <h3 className="font-bold text-[12px] truncate group-hover:text-foreground text-muted transition-colors">Create Playlist</h3>
                                            </div>
                                        </div>

                                        {playlists.map((playlist: any) => (
                                            <Link key={playlist.id} href={`/playlist/${playlist.id}`} className="group block space-y-3">
                                                <div className="aspect-square bg-zinc-900 rounded-xl overflow-hidden shadow-xl ring-1 ring-white/5 group-hover:ring-accent/50 group-hover:scale-[1.02] transition-all flex items-center justify-center">
                                                    {playlist.coverUrl ? (
                                                        <img
                                                            src={getMediaUrl(playlist.coverUrl)}
                                                            className="w-full h-full object-cover transition-all duration-700"
                                                            onError={(e) => {
                                                                (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80&fit=crop";
                                                            }}
                                                        />
                                                    ) : (
                                                        <img
                                                            src={`https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80`}
                                                            className="w-full h-full object-cover opacity-40 mix-blend-luminosity"
                                                            onError={(e) => {
                                                                (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1470225620353-fb4b183b523e?w=400&q=80&fit=crop";
                                                            }}
                                                        />
                                                    )}
                                                </div>
                                                <div className="px-1">
                                                    <h3 className="font-bold text-[12px] truncate group-hover:text-accent transition-colors text-foreground">{playlist.name}</h3>
                                                    <p className="text-[10px] text-zinc-500 font-medium truncate mt-0.5">{playlist._count?.tracks || 0} tracks</p>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-32 text-center">
                                        <div className="w-20 h-20 rounded-full border border-white/5 bg-white/5 mb-6 flex items-center justify-center">
                                            <Library size={28} className="text-zinc-600" strokeWidth={1.5} />
                                        </div>
                                        <h3 className="text-lg font-bold text-white mb-2 tracking-tight">Your library is empty</h3>
                                        <p className="text-xs text-muted max-w-xs mb-8">Start creating playlists or saving songs to build your personal collection.</p>
                                        <Button className="font-bold uppercase tracking-wider text-xs">Create Playlist</Button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Albums Tab */}
                        {activeTab === 'albums' && (
                            <div>
                                {isLoadingAlbums ? (
                                    <div className="flex items-center justify-center py-20">
                                        <ZenLoading size="md" />
                                    </div>
                                ) : albums && albums.length > 0 ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-5">
                                        {albums.map((album: any) => (
                                            <Link key={album.id} href={`/album/${album.id}`} className="group block space-y-3">
                                                <div className="aspect-square bg-zinc-900 rounded-xl overflow-hidden shadow-xl ring-1 ring-white/5 group-hover:ring-accent/50 group-hover:scale-[1.02] transition-all flex items-center justify-center">
                                                    {album.coverUrl ? (
                                                        <img
                                                            src={getMediaUrl(album.coverUrl)}
                                                            className="w-full h-full object-cover transition-all duration-700"
                                                            onError={(e) => {
                                                                (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=400&q=80&fit=crop";
                                                            }}
                                                        />
                                                    ) : (
                                                        <img
                                                            src={`https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=400&q=80`}
                                                            className="w-full h-full object-cover opacity-40 mix-blend-luminosity"
                                                        />
                                                    )}
                                                </div>
                                                <div className="px-1">
                                                    <h3 className="font-bold text-[12px] truncate group-hover:text-accent transition-colors text-foreground">{album.title}</h3>
                                                    <p className="text-[10px] text-zinc-500 font-medium truncate mt-0.5">{album.artist?.name || 'Unknown Artist'}</p>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-32 text-center">
                                        <div className="w-20 h-20 rounded-full border border-white/5 bg-white/5 mb-6 flex items-center justify-center">
                                            <Disc size={28} className="text-zinc-600" strokeWidth={1.5} />
                                        </div>
                                        <h3 className="text-lg font-bold text-white mb-2 tracking-tight">No albums yet</h3>
                                        <p className="text-xs text-muted max-w-xs mb-8">Import entire albums from external sources to see them collection here.</p>
                                        <Button onClick={() => router.push('/admin/playlist-import')} className="font-bold uppercase tracking-wider text-xs bg-rose-500 text-white hover:bg-rose-600">Import Music</Button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Liked Songs Tab */}
                        {activeTab === 'liked' && (
                            <div>
                                {isLoadingTracks ? (
                                    <div className="flex items-center justify-center py-20">
                                        <ZenLoading size="md" />
                                    </div>
                                ) : likedTracks && likedTracks.length > 0 ? (
                                    <div className="flex flex-col gap-1 max-w-5xl mx-auto">
                                        <div className="flex items-center justify-between mb-4">
                                            <h2 className="text-sm font-black text-foreground uppercase tracking-widest">{likedTracks.length} Saved Songs</h2>
                                            <Button size="sm" className="h-8 text-[11px] font-bold uppercase tracking-widest bg-accent text-black hover:bg-accent/90 rounded-full shadow-glow">
                                                <Play size={12} className="mr-1.5 fill-black" /> Play All
                                            </Button>
                                        </div>
                                        {likedTracks.map((track, i) => (
                                            <TrackItem key={track.id} track={track} index={i} contextTracks={likedTracks} />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-32 text-center">
                                        <div className="w-20 h-20 rounded-full border border-red-500/20 bg-red-500/10 mb-6 flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.1)]">
                                            <Heart size={28} className="text-red-500 fill-red-500/20" strokeWidth={1.5} />
                                        </div>
                                        <h3 className="text-lg font-bold text-white mb-2 tracking-tight">No liked songs yet</h3>
                                        <p className="text-xs text-muted max-w-xs mb-8">Tap the heart on any track to add it to your Liked Songs.</p>
                                        <Button variant="outline" onClick={() => router.push('/search')} className="font-bold uppercase tracking-wider text-xs border-white/10 hover:bg-white/5 text-foreground">Discover Music</Button>
                                    </div>
                                )}
                            </div>
                        )}

                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
