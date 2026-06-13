"use client";

import { Track, usePlayerStore } from "@/store/player";
import { Play, MoreHorizontal, Heart, Plus, Pause, Download, Check, X, User } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useUIStore } from "@/store/ui";
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
import { useAuthStore } from "@/store/authStore";
import { cn, getMediaUrl } from "@/lib/utils";
import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

interface TrackItemProps {
 track: Track;
 index?: number;
 onClick?: () => void;
 contextTracks?: Track[];
 hideThumbOnMobile?: boolean;
}

export function TrackItem({ track, index, contextTracks, hideThumbOnMobile, ...props }: TrackItemProps) {
 const pathname = usePathname();
 const router = useRouter();
 const currentTrack = usePlayerStore(state => state.currentTrack);
 const isPlaying = usePlayerStore(state => state.isPlaying);
 const setTrack = usePlayerStore(state => state.setTrack);
 const togglePlay = usePlayerStore(state => state.togglePlay);
 const openDownloadModal = useUIStore(state => state.openDownloadModal);
 const queryClient = useQueryClient();
 const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

 const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
 setToast({ msg, type });
 setTimeout(() => setToast(null), 2500);
 };

 const { data: likedTrackIds } = useQuery({
 queryKey: ['liked-track-ids'],
 queryFn: async () => {
 const res = await api.get('tracks/liked');
 return (res.data as Track[]).map(t => t.id);
 },
 staleTime: 1000 * 60 * 5,
 });

 const isLiked = likedTrackIds?.includes(track.id);

 const toggleLikeMutation = useMutation({
 mutationFn: async () => {
 await api.post(`tracks/${track.id}/like`);
 },
 onMutate: async () => {
 await queryClient.cancelQueries({ queryKey: ['liked-track-ids'] });
 const previousLikedIds = queryClient.getQueryData<string[]>(['liked-track-ids']);
 const newLikedIds = previousLikedIds ? (
 previousLikedIds.includes(track.id)
 ? previousLikedIds.filter(id => id !== track.id)
 : [...previousLikedIds, track.id]
 ) : [track.id];
 queryClient.setQueryData(['liked-track-ids'], newLikedIds);
 return { previousLikedIds };
 },
 onError: (err, newTodo, context) => {
 if (context?.previousLikedIds) {
 queryClient.setQueryData(['liked-track-ids'], context.previousLikedIds);
 }
 },
 onSettled: () => {
 queryClient.invalidateQueries({ queryKey: ['liked-track-ids'] });
 queryClient.invalidateQueries({ queryKey: ['liked-tracks'] });
 }
 });

 const { isAuthenticated } = useAuthStore();
 const { data: playlists } = useQuery({
 queryKey: ['my-playlists'],
 queryFn: async () => {
 try {
 const res = await api.get('playlists/my');
 return res.data as { id: string, name: string }[];
 } catch (e) { return []; }
 },
 enabled: isAuthenticated
 });

 const addToPlaylistMutation = useMutation({
 mutationFn: async (playlistId: string) => {
 await api.post(`playlists/${playlistId}/tracks`, { trackId: track.id });
 },
 onSuccess: (_, playlistId) => {
 queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] });
 showToast("Added to playlist!", "success");
 },
 onError: (err: any) => {
 showToast(err.response?.data?.message || "Failed to add to playlist", "error");
 }
 });

 const isActive = currentTrack?.id === track.id;

 const handlePlay = (e: React.MouseEvent) => {
 e.stopPropagation();
 useUIStore.getState().setPlayerMinimized(false);
 if (isActive) {
 togglePlay();
 } else {
 setTrack(track, contextTracks);
 }
 };

 return (
 <>
 <div
 className={cn(
 "group flex items-center p-2 rounded-lg transition-all duration-200 cursor-pointer hover:bg-white/5"
 )}
 onClick={(e) => {
 if (props.onClick) props.onClick();
 else {
 if (isActive) {
 handlePlay(e);
 } else {
 handlePlay(e);
 }
 }
 }}
 >
 {/* Play/Index State */}
 <div className="w-10 flex items-center justify-center shrink-0">
 {isActive ? (
 isPlaying ? (
 // Rose visualizer bars — same as MediaCard
 <div className="flex items-end gap-[1.5px] h-[14px] justify-center">
 {[0.4, 0.9, 0.3, 0.8].map((initialScale, i) => (
 <motion.div
 key={i}
 animate={{
 scaleY: [initialScale, 1.1, initialScale * 0.5, 1, initialScale]
 }}
 transition={{
 duration: 0.6 + i * 0.1,
 repeat: Infinity,
 ease: "easeInOut",
 delay: i * 0.05
 }}
 className="w-[2.5px] bg-brand rounded-full shadow-[0_0_6px_rgba(var(--accent-brand-rgb),0.5)]"
 style={{ height: "12px", transformOrigin: "bottom" }}
 />
 ))}
 </div>
 ) : (
 <Play size={14} className="text-accent fill-current" />
 )
 ) : (
 <>
 <span className="text-[11px] font-bold text-muted-dark group-hover:hidden">{index !== undefined ? index + 1 : ""}</span>
 <Play size={14} className="text-foreground fill-current hidden group-hover:block" />
 </>
 )}
 </div>

 {/* Thumbnail */}
 <div className={cn("w-10 h-10 rounded-md overflow-hidden bg-surface-hover mr-4 shrink-0 shadow-md", hideThumbOnMobile && "hidden md:block")}>
 <img
 src={getMediaUrl(track.coverUrl, 'image') || `https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=200&q=80`}
 className="w-full h-full object-cover"
 alt=""
 onError={(e) => {
 const target = e.target as HTMLImageElement;
 if (target.src.includes('unsplash')) {
 target.src = "/logo.png";
 } else {
 target.src = "https://images.unsplash.com/photo-1470225620353-fb4b183b523e?w=200&q=80&fit=crop";
 }
 }}
 />
 </div>

 <div className="flex-1 min-w-0">
 <h3 
 onClick={(e) => {
 e.stopPropagation();
 router.push(`/track/${track.id}`);
 }}
 className={cn(
 "text-[] font-sans font-bold truncate leading-snug tracking-tight transition-colors cursor-pointer hover:underline hover:text-brand",
 isActive ? "text-brand" : "text-foreground group-hover:text-brand"
 )}
 >
 {track.title}
 </h3>
 {(pathname !== '/' && track.artist?.id) ? (
 <Link
 href={`/artist/${track.artist.id}`}
 onClick={(e) => e.stopPropagation()}
 className="text-[11px] text-muted font-medium truncate mt-0.5 transition-colors hover:text-brand inline-block w-fit"
 >
 {track.artist?.name || 'Unknown Artist'}
 </Link>
 ) : (
 <p className="text-[11px] text-muted font-medium truncate mt-0.5 transition-colors">
 {track.artist?.name || 'Unknown Artist'}
 </p>
 )}
 </div>

 {/* Actions (Always visible for current track, hover for others) */}
 <div className={cn(
 "flex items-center gap-1 transition-all duration-300 px-2",
 isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0"
 )}>
 <button
 className="p-2 rounded-full transition-all outline-none bg-transparent"
 onClick={(e) => {
 e.stopPropagation();
 toggleLikeMutation.mutate();
 }}
 >
 <motion.div
 whileTap={{ scale: 0.7 }}
 animate={{ scale: isLiked ? [1, 1.4, 1] : 1 }}
 transition={{ duration: 0.35, ease: "easeOut" }}
 className={cn(
 isLiked ? "text-[#EF4444]" : "text-muted hover:text-foreground"
 )}
 >
 <Heart size={14} className={cn(isLiked && "fill-current")} />
 </motion.div>
 </button>

 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <button
 className="p-2 text-muted hover:text-foreground transition-all"
 onClick={(e) => e.stopPropagation()}
 >
 <MoreHorizontal size={14} />
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
 <motion.div
 animate={{ scale: isLiked ? [1, 1.3, 1] : 1 }}
 transition={{ duration: 0.3 }}
 >
 <Heart size={14} className={isLiked ? "fill-current text-[#EF4444]" : "opacity-70"} />
 </motion.div>
 <span>{isLiked ? "Liked" : "Add to Favorites"}</span>
 </DropdownMenuItem>

 {track.artist?.id && (
 <DropdownMenuItem onClick={(e) => {
 e.stopPropagation();
 window.location.href = `/artist/${track.artist.id}`;
 }}>
 <User size={14} className="opacity-70" /> <span>Go to Artist</span>
 </DropdownMenuItem>
 )}

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
 <Download size={14} className="opacity-70" /> <span>Download Track</span>
 </DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 </div>

 {/* Duration */}
 <div className="w-12 text-right text-[11px] font-bold text-muted tabular-nums pr-2 group-hover:text-foreground/60 transition-colors">
 {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
 </div>
 </div>

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
 {toast.type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
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
