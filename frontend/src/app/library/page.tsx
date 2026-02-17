"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { ListMusic, Plus, Heart } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

interface Playlist {
    id: string;
    name: string;
    isPublic: boolean;
    _count?: {
        tracks: number;
    }
}

export default function LibraryPage() {
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchLibrary();
    }, []);

    const fetchLibrary = async () => {
        try {
            const res = await api.get("/playlists/my");
            setPlaylists(res.data);
        } catch (error) {
            console.error("Failed to fetch library:", error);
        } finally {
            setLoading(false);
        }
    };

    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold">Your Library</h1>
                <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/10">
                    <Plus className="w-6 h-6" />
                </Button>
            </div>

            {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="space-y-2">
                            <Skeleton className="aspect-square w-full rounded-md" />
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-3 w-1/2" />
                        </div>
                    ))}
                </div>
            ) : (
                <motion.div
                    variants={container}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6"
                >
                    {/* Liked Songs Special Card */}
                    <motion.div variants={item}>
                        <Link href="/collection/tracks">
                            <div className="group cursor-pointer">
                                <div className="aspect-square bg-gradient-to-br from-indigo-500 to-purple-600 rounded-md mb-3 flex flex-col items-center justify-center p-6 shadow-lg group-hover:shadow-2xl transition-all relative overflow-hidden">
                                    <Heart className="w-12 h-12 text-white fill-white mb-2" />
                                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <h3 className="font-semibold truncate">Liked Songs</h3>
                                <p className="text-sm text-muted-foreground p-1">Auto-generated</p>
                            </div>
                        </Link>
                    </motion.div>

                    {/* User Playlists */}
                    {playlists.map((playlist) => (
                        <motion.div key={playlist.id} variants={item}>
                            <Link href={`/playlist/${playlist.id}`}>
                                <div className="group cursor-pointer">
                                    <div className="aspect-square bg-zinc-800/50 rounded-md mb-3 flex items-center justify-center shadow-lg group-hover:bg-zinc-800 transition-colors relative">
                                        <ListMusic className="w-12 h-12 text-zinc-600 group-hover:text-primary transition-colors" />
                                    </div>
                                    <h3 className="font-semibold truncate text-white group-hover:text-primary transition-colors">{playlist.name}</h3>
                                    <p className="text-sm text-muted-foreground">Playlist • {playlist._count?.tracks || 0} songs</p>
                                </div>
                            </Link>
                        </motion.div>
                    ))}
                </motion.div>
            )}

            {!loading && playlists.length === 0 && (
                <div className="text-center py-12">
                    <p className="text-muted-foreground">Create your first playlist to get started.</p>
                </div>
            )}
        </div>
    );
}
