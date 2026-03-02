"use client";

import React from "react";
import { Play, Pause, Heart, MoreHorizontal, ShoppingCart, Plus, Download } from "lucide-react";
import { cn, getMediaUrl } from "@/lib/utils";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { Track, usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useRef } from "react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
    DropdownMenuPortal,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface MediaCardProps {
    track: Track;
    className?: string;
    index?: number;
    contextTracks?: Track[];
}

export function MediaCard({ track, className, index = 0, contextTracks }: MediaCardProps) {
    const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayerStore();
    const openDownloadModal = useUIStore(state => state.openDownloadModal);
    const queryClient = useQueryClient();
    const isCurrent = currentTrack?.id === track.id;
    const isActuallyPlaying = isCurrent && isPlaying;

    const ref = useRef(null);
    const inView = useInView(ref, { amount: 0.1, once: true });
    const [toast, setToast] = React.useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 2500);
    };

    // Liked status sync
    const { data: likedTrackIds } = useQuery({
        queryKey: ['liked-track-ids'],
        queryFn: async () => {
            const res = await api.get('/tracks/liked');
            return (res.data as Track[]).map(t => t.id);
        },
        staleTime: 1000 * 60 * 5,
    });

    const isLiked = likedTrackIds?.includes(track.id);

    const toggleLikeMutation = useMutation({
        mutationFn: async () => {
            await api.post(`/tracks/${track.id}/like`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['liked-track-ids'] });
            queryClient.invalidateQueries({ queryKey: ['liked-tracks'] });
        }
    });

    const { data: playlists } = useQuery({
        queryKey: ['my-playlists'],
        queryFn: async () => {
            try {
                const res = await api.get('/playlists/my');
                return res.data as { id: string, name: string }[];
            } catch (e) { return []; }
        }
    });

    const addToPlaylistMutation = useMutation({
        mutationFn: async (playlistId: string) => {
            await api.post(`/playlists/${playlistId}/tracks`, { trackId: track.id });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-playlists'] });
            showToast("Added to playlist!", "success");
        },
        onError: (err: any) => {
            showToast(err.response?.data?.message || "Failed to add to playlist", "error");
        }
    });

    const handlePlayClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        useUIStore.getState().setPlayerMinimized(false);
        if (isCurrent) {
            togglePlay();
        } else {
            setTrack(track, contextTracks);
        }
    };

    const handlePurchase = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const amount = track.price || 9900; // Default to 99 INR (9900 paise) if not set

            // 1. Create order on backend
            const res = await api.post("/billing/checkout", {
                type: 'TRACK_PURCHASE',
                trackId: track.id,
                amount: amount
            });

            const order = res.data;

            // 2. Setup verification handler
            const handleSuccess = async (response: any) => {
                try {
                    const verifyRes = await api.post("/billing/verify", {
                        orderId: order.orderId,
                        paymentId: response.zenwallet_payment_id || response.paymentId,
                        signature: response.zenwallet_signature || response.signature
                    });

                    if (verifyRes.data.status === "SUCCESS") {
                        queryClient.invalidateQueries({ queryKey: ['liked-tracks'] });
                        window.location.reload();
                    } else {
                        alert("Payment verification failed");
                    }
                } catch (err) {
                    console.error("Verification failed:", err);
                    alert("An error occurred during payment verification.");
                }
            };

            const handleFailure = (err: any) => {
                console.error("Payment failed:", err);
                const errorMsg = err?.message || "Payment cancelled or generic error";
                alert("Payment failed: " + errorMsg);
            };

            const options = {
                key: process.env.NEXT_PUBLIC_ZENWALLET_PUBLIC_KEY || "pk_live_80a35f3d4342f8fcf2ae65b34a7e",
                amount: order.amount,
                currency: "INR",
                name: "Purchase Track",
                description: `Buying "${track.title}"`,
                order_id: order.orderId,
                onSuccess: handleSuccess,
                onFailure: handleFailure,
                theme: { color: "#A855F7" }
            };

            const ZenWallet = (window as any).ZenWallet;
            if (ZenWallet?.open) {
                ZenWallet.open(options);
            } else {
                setTimeout(() => {
                    const zw = (window as any).ZenWallet;
                    if (zw?.open) zw.open(options);
                    else alert("Payment gateway not yet initialized.");
                }, 1000);
            }

        } catch (error) {
            console.error("Purchase failed", error);
        }
    };

    return (
        <>
            <motion.div
                ref={ref}
                initial={{ opacity: 0, y: 15 }}
                animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
                transition={{
                    duration: 0.6,
                    ease: [0.22, 1, 0.36, 1],
                    delay: Math.min(index * 0.05, 0.2)
                }}
                className={cn(
                    "group relative flex flex-col gap-3 p-2 rounded-xl transition-all duration-300 hover:bg-white/5 cursor-pointer",
                    className
                )}
                onClick={() => {
                    if (isCurrent) {
                        useUIStore.getState().setFullScreenPlayerOpen(true);
                    } else {
                        setTrack(track, contextTracks);
                        useUIStore.getState().setPlayerMinimized(false);
                    }
                }}
            >
                {/* Image Container with 1:1 Ratio and Cinematic Fallbacks */}
                <div className="group/art relative aspect-square w-full rounded-lg overflow-hidden bg-surface-hover shadow-xl">
                    <div className="relative w-full h-full group-hover:scale-105 transition-transform duration-700 ease-out">
                        <img
                            src={getMediaUrl(track.coverUrl) || "/logo.png"}
                            alt={track.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.src = "/logo.png";
                            }}
                        />

                        {/* Cinematic Enhancements for Default Placeholders */}
                        {!track.coverUrl && (
                            <>
                                {/* Dark Overlay (25%) */}
                                <div className="absolute inset-0 bg-black/30 pointer-events-none" />

                                {/* Subtle Vignette */}
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(0,0,0,0.5)_110%)] pointer-events-none" />

                                {/* Gradient for Readability */}
                                <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                            </>
                        )}
                    </div>

                    {/* Interaction Overlay (Purchases & Shadows) */}
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/art:opacity-100 transition-all duration-300 flex items-center justify-center gap-2">
                        {track.price !== undefined && track.price > 0 && !track.isPurchased && (
                            <button
                                onClick={handlePurchase}
                                className="w-11 h-11 bg-white text-black rounded-full flex items-center justify-center shadow-2xl scale-95 group-hover/art:scale-100 transition-all hover:bg-white/90 z-20"
                                title={`Purchase for $${(track.price / 100).toFixed(2)}`}
                            >
                                <ShoppingCart size={18} />
                            </button>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                    </div>

                    {/* Centered Music Visualizer Overlay */}
                    <AnimatePresence>
                        {isActuallyPlaying && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute bottom-3 left-3 flex items-center justify-center pointer-events-none z-10"
                            >
                                <div className="flex items-end gap-[2px] h-[14px]">
                                    {[0.2, 0.4, 0.1, 0.5].map((delay, i) => (
                                        <motion.div
                                            key={i}
                                            animate={{
                                                height: ["30%", "100%", "30%"],
                                            }}
                                            transition={{
                                                duration: 0.8,
                                                repeat: Infinity,
                                                ease: "easeInOut",
                                                delay: delay
                                            }}
                                            className="w-1 bg-brand rounded-full shadow-[0_0_8px_rgba(var(--accent-brand-rgb),0.5)]"
                                        />
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Micro-Interaction Actions - Pure Icon Mode */}
                    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover/art:opacity-100 transition-all duration-300 md:translate-y-2 md:group-hover/art:translate-y-0 z-30">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleLikeMutation.mutate();
                            }}
                            className={cn(
                                "p-1.5 rounded-full bg-transparent hover:bg-white/10 transition-all",
                                isLiked ? "text-[#EF4444]" : "text-white/40 hover:text-white"
                            )}
                        >
                            {toggleLikeMutation.isPending ? (
                                <ZenLoading size="xs" />
                            ) : (
                                <Heart size={16} className={cn(isLiked && "fill-current")} />
                            )}
                        </button>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    className="p-1.5 rounded-full bg-transparent hover:bg-white/10 text-white/40 hover:text-white transition-all"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <MoreHorizontal size={16} />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                className="w-52"
                                align="end"
                            >
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleLikeMutation.mutate();
                                    }}
                                >
                                    <Heart size={14} className={isLiked ? "fill-current text-[#EF4444]" : "opacity-70"} />
                                    <span>{isLiked ? "Liked" : "Add to Favorites"}</span>
                                </DropdownMenuItem>

                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>
                                        <Plus size={14} className="opacity-70" /> <span>Add to Playlist</span>
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuPortal>
                                        <DropdownMenuSubContent className="w-48 ml-1">
                                            {playlists?.map((p: any) => (
                                                <DropdownMenuItem
                                                    key={p.id}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        addToPlaylistMutation.mutate(p.id);
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
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openDownloadModal(track);
                                    }}
                                >
                                    <Download size={14} className="text-brand" /> <span className="text-brand">Download Track</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* Info Section - High density */}
                <div className="flex flex-col min-w-0 px-1">
                    <h3 className={cn(
                        "text-[13px] font-medium truncate leading-snug transition-colors text-brand",
                        isCurrent && "scale-[1.02]"
                    )}>
                        {track.title}
                    </h3>
                    <p className="text-[11px] text-muted font-medium truncate mt-0.5 transition-colors">
                        {track.artist.name}
                    </p>
                </div>
            </motion.div>

            {/* Inline Toast Notification */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, x: 50, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 20, scale: 0.95 }}
                        className={`fixed bottom-8 right-8 flex items-center gap-3 px-6 py-4 rounded-2xl border backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[9999] min-w-[280px] ${toast.type === 'error'
                            ? 'bg-red-500/10 border-red-500/20 text-red-400'
                            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            }`}
                    >
                        <div className={`p-2 rounded-full ${toast.type === 'error' ? 'bg-red-500/20' : 'bg-emerald-500/20'}`}>
                            {toast.type === 'success' ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                            ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            )}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[14px] font-bold tracking-tight text-white">{toast.type === 'success' ? 'Success' : 'Error'}</span>
                            <span className="text-[12px] opacity-80 font-medium">{toast.msg}</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
