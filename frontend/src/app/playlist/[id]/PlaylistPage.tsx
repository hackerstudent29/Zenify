"use client";


import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track, usePlayerStore } from "@/store/player";
import { Play, Trash2, Clock, Music, Plus, MoreHorizontal, Pause, Shuffle, User, Share2, Download, Edit2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import { cn, getMediaUrl, getTrackCover, formatDisplayTitle } from "@/lib/utils";
import { MarqueeText } from "@/components/shared/MarqueeText";
import { useAlbumColor } from "@/hooks/useAlbumColor";
import { SoftPageBackground } from "@/components/shared/SoftPageBackground";
import { UniversalMediaCover } from "@/components/shared/UniversalMediaCover";
import { EditPlaylistCoverModal } from "@/components/shared/EditPlaylistCoverModal";
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

import { motion } from "framer-motion";

interface Playlist {
 id: string;
 name: string;
 description?: string;
 coverUrl?: string;
 isPublic: boolean;
 tracks: { track: Track, addedAt: string }[];
 user?: { id: string, email: string, name?: string, username?: string, avatarUrl?: string };
}

export default function PlaylistDetailPage() {
 const params = useParams();
 const router = useRouter();
 const queryClient = useQueryClient();
 const { setQueue, setTrack } = usePlayerStore();
 const { user, isAuthenticated } = useAuthStore();
 const { openDownloadModal } = useUIStore();

 const [songSearchQuery, setSongSearchQuery] = React.useState('');
 const [searchedSongs, setSearchedSongs] = React.useState<any[]>([]);
 const [isSearchingSongs, setIsSearchingSongs] = React.useState(false);

 const [toast, setToast] = React.useState<{ msg: string; type: 'success' | 'error' } | null>(null);
 const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
 setToast({ msg, type });
 setTimeout(() => setToast(null), 2500);
 };

 const playlistId = params?.id ? (Array.isArray(params.id) ? params.id[0] : params.id) : '';

 React.useEffect(() => {
 if (!songSearchQuery.trim()) {
 setSearchedSongs([]);
 return;
 }
 
 const delayDebounce = setTimeout(async () => {
 setIsSearchingSongs(true);
 try {
 const res = await api.get('/search', { params: { q: songSearchQuery } });
 setSearchedSongs(res.data?.tracks || []);
 } catch (e) {
 console.error("Failed to search songs for quick-add:", e);
 } finally {
 setIsSearchingSongs(false);
 }
 }, 300);

 return () => clearTimeout(delayDebounce);
 }, [songSearchQuery]);

 const addToPlaylistMutation = useMutation({
 mutationFn: async (trackId: string) => {
 await api.post(`/playlists/${playlistId}/tracks`, { trackId });
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] });
 showToast("Added to playlist!", "success");
 },
 onError: (err: any) => {
 showToast(err.response?.data?.message || "Failed to add song", "error");
 }
 });

 const handleAddSongToPlaylist = (trackId: string) => {
 addToPlaylistMutation.mutate(trackId);
 };

 const scrollToSearch = () => {
 const el = document.getElementById("add-songs-section");
 if (el) {
 el.scrollIntoView({ behavior: "smooth" });
 }
 };

 const { data: playlist, isLoading, error } = useQuery({
 queryKey: ['playlist', playlistId],
 queryFn: async () => {
 const res = await api.get(`/playlists/${playlistId}`);
 return res.data as Playlist;
 },
 enabled: !!playlistId && isAuthenticated
 });

 const deletePlaylistMutation = useMutation({
 mutationFn: async () => {
 await api.delete(`/playlists/${playlistId}`);
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['my-playlists'] });
 router.push('/library');
 }
 });

 const removeTrackMutation = useMutation({
 mutationFn: async (trackId: string) => {
 await api.delete(`/playlists/${playlistId}/tracks/${trackId}`);
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] });
 }
 });

 const updatePlaylistMutation = useMutation({
 mutationFn: async (data: { coverUrl?: string; name?: string }) => {
 await api.put(`/playlists/${playlistId}`, data);
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] });
 queryClient.invalidateQueries({ queryKey: ['my-playlists'] });
 }
 });

 const [isEditCoverModalOpen, setIsEditCoverModalOpen] = React.useState(false);

 const handlePlayPlaylist = () => {
 if (!playlist || playlist.tracks.length === 0) return;
 const tracks = playlist.tracks.map(t => t.track);
 // Set queue and play first
 useUIStore.getState().setPlayerMinimized(false);
 setQueue(tracks);
 setTrack(tracks[0]);
 };

 const handlePlayTrack = (track: Track) => {
 if (!playlist) return;
 const tracks = playlist.tracks.map(t => t.track);
 useUIStore.getState().setPlayerMinimized(false);
 setTrack(track, tracks);
 const { isPlaying, togglePlay } = usePlayerStore.getState();
 if (!isPlaying) togglePlay();
 }

 const isOwner = user?.id === playlist?.user?.id;
 const colors = useAlbumColor(playlist?.coverUrl || playlist?.tracks?.[0]?.track?.coverUrl, playlist?.tracks?.[0]?.track?.palette);

 if (isLoading) return <div className="p-8 text-white">Loading playlist...</div>;
 if (error || !playlist) return <div className="p-8 text-white">Playlist not found</div>;

 return (
 <div className="min-h-screen w-full bg-black overflow-x-hidden text-white relative">
 <SoftPageBackground colors={colors} />
 {/* Grain/Noise Overlay */}
 <div 
 className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay"
 style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
 />
 <div className="w-full">
 {/* ── HEADER SECTION ─────────────────────────────────── */}
 <div className="relative px-6 pt-10 pb-8 md:px-10 md:pt-12 md:pb-12 text-center md:text-left flex flex-col items-center md:items-end md:flex-row gap-8">
 {/* Cover Art */}
 <motion.div
 initial={{ opacity: 0, scale: 0.95 }}
 animate={{ opacity: 1, scale: 1 }}
 className="shrink-0 w-64 h-64 md:w-80 md:h-80 rounded-lg overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)] bg-zinc-900 border border-white/10 relative group"
 >
 <UniversalMediaCover track={playlist} />
 {isOwner && (
 <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
 <Button 
 variant="ghost" 
 className="text-white hover:text-white hover:bg-white/10 hover:scale-105 transition-all flex flex-col items-center gap-2 h-auto py-4"
 onClick={() => setIsEditCoverModalOpen(true)}
 >
 <Edit2 size={32} />
 <span className="font-bold tracking-wider uppercase text-xs">Edit Cover</span>
 </Button>
 </div>
 )}
 </motion.div>

 {/* Info */}
 <div className="flex flex-col flex-1 min-w-0 overflow-hidden w-full">
 <span className="text-[11px] font-black uppercase tracking-[0.4em] text-red-500 mb-2">Playlist Collection</span>
 <h1 className="w-full mb-2">
 <MarqueeText className="text-xl md:text-3xl lg:text-4xl font-bold text-white tracking-tight leading-tight drop-shadow-md">
 {formatDisplayTitle(playlist.name)}
 </MarqueeText>
 </h1>

 <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 text-lg font-bold text-white/40 mb-6">
 <div className="flex items-center">
 {playlist.user?.avatarUrl ? (
 <img src={getMediaUrl(playlist.user.avatarUrl)} alt="" className="h-5 w-5 rounded-full mr-2 object-cover" />
 ) : (
 <div className="h-5 w-5 rounded-full bg-white/10 mr-2 flex-shrink-0" />
 )}
 <span className="font-sans text-sm font-medium text-white/80">{playlist.user?.username || playlist.user?.name || "User"}</span>
 </div>
 <span>•</span>
 <span>{playlist.tracks.length} tracks</span>
 </div>

 <div className="flex items-center justify-center md:justify-start gap-4 w-full">
 <button
 onClick={handlePlayPlaylist}
 disabled={playlist.tracks.length === 0}
 className="flex-1 md:flex-initial flex items-center justify-center gap-3 bg-[#1c1c1e] hover:bg-[#2c2c2e] text-white h-12 px-4 md:px-12 rounded-xl font-bold text-[14px] md:text-[15px] active:scale-95 transition-all border border-white/5"
 >
 <Play size={18} className="text-red-500" fill="currentColor" />
 Play
 </button>

 <button
 onClick={handlePlayPlaylist}
 disabled={playlist.tracks.length === 0}
 className="flex-1 md:flex-initial flex items-center justify-center gap-3 bg-[#1c1c1e] hover:bg-[#2c2c2e] text-white h-12 px-4 md:px-12 rounded-xl font-bold text-[14px] md:text-[15px] active:scale-95 transition-all border border-white/5"
 >
 <Shuffle size={18} className="text-red-500" fill="currentColor" />
 Shuffle
 </button>

 {isOwner && (
 <button
 onClick={() => {
 useUIStore.getState().openConfirmModal({
 title: "Delete Playlist?",
 message: `This will permanently remove "${playlist.name}" from your library.`,
 confirmText: "Erase Playlist",
 type: "danger",
 onConfirm: () => deletePlaylistMutation.mutate()
 });
 }}
 className="w-12 h-12 rounded-xl bg-[#1c1c1e] text-red-500 flex items-center justify-center hover:bg-red-500/10 active:scale-90 transition-all border border-white/5"
 >
 <Trash2 size={20} />
 </button>
 )}
 </div>
 </div>
 </div>

 {/* ── TRACK LIST ────────────────────────────────────── */}
 <div className="w-full px-4 md:px-10 mt-6">
 <div className="flex flex-col space-y-0.5">
 {playlist.tracks.map((item, index) => {
 const track = item.track;
 const isTrackPlaying = usePlayerStore.getState().currentTrack?.id === track.id && usePlayerStore.getState().isPlaying;
 const isActive = usePlayerStore.getState().currentTrack?.id === track.id;

 return (
 <div
 key={`${track.id}-${index}`}
 onClick={() => handlePlayTrack(track)}
 className={cn(
 "group flex items-center gap-4 px-3 py-3 rounded-xl transition-all cursor-pointer active:bg-white/[0.05]",
 isActive ? "bg-white/[0.03]" : ""
 )}
 >
 {/* Index / Visualizer */}
 <div className="w-6 flex items-center justify-center shrink-0">
 {isTrackPlaying ? (
 <div className="flex items-end gap-[1.5px] h-[12px] mb-0.5">
 {[0.1, 0.4, 0.2, 0.5].map((d, i) => (
 <motion.div key={i} animate={{ height: ["30%", "100%", "30%"] }} transition={{ duration: 0.8 + i * 0.1, repeat: Infinity, ease: "easeInOut", delay: d }} className="w-[2.5px] bg-red-500 rounded-full" />
 ))}
 </div>
 ) : (
 <span className="text-sm font-bold text-white/20 group-hover:text-white/40">{index + 1}</span>
 )}
 </div>

 {/* Track info */}
 <div className="flex flex-col flex-1 min-w-0">
 <div 
 onClick={(e) => {
 e.stopPropagation();
 router.push(`/track/${track.id}`);
 }}
 className={cn("text-[] font-sans font-bold truncate leading-snug cursor-pointer hover:underline hover:text-brand transition-colors", isActive ? "text-brand" : "text-white/90")}
 >
 {formatDisplayTitle(track.title)}
 </div>
 <div className="text-[12px] font-medium text-white/40 truncate">
 {formatDisplayTitle(track.artist?.name || "Unknown Artist")}
 </div>
 </div>

 {/* Actions */}
 <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
 <DropdownMenu>
 <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
 <button className="p-2 text-white/20 hover:text-white transition-colors">
 <MoreHorizontal size={20} />
 </button>
 </DropdownMenuTrigger>
 <DropdownMenuContent className="w-56" align="end">
 {track.artistId && (
 <DropdownMenuItem onClick={() => router.push(`/artist/${track.artistId}`)}>
 <User size={14} className="mr-2" /> Go to Artist
 </DropdownMenuItem>
 )}
 <DropdownMenuItem onClick={() => openDownloadModal(track)}>
 <Download size={14} className="mr-2" /> Download
 </DropdownMenuItem>
 <DropdownMenuSeparator className="bg-white/5" />
 {isOwner && (
 <DropdownMenuItem 
 className="text-red-400 focus:text-red-400 focus:bg-red-400/10"
 onClick={() => removeTrackMutation.mutate(track.id)}
 >
 <Trash2 size={14} className="mr-2" /> Remove from Playlist
 </DropdownMenuItem>
 )}
 </DropdownMenuContent>
 </DropdownMenu>
 </div>
 </div>
 );
 })}
 {playlist.tracks.length === 0 && (
 <div className="flex flex-col items-center justify-center py-20 text-center">
 <Music size={48} className="text-zinc-700 mb-4 opacity-20" />
 <h3 className="text-lg font-bold text-white mb-2">This playlist is empty</h3>
 <p className="text-sm text-zinc-500 max-w-xs mb-8">Go find some songs to add to your collection!</p>
 <Button
 onClick={scrollToSearch}
 className="bg-red-600 text-white font-bold tracking-wide text-xs px-8 h-12 rounded-full shadow-glow"
 >
 <Plus size={16} className="mr-2" /> Add songs
 </Button>
 </div>
 )}
 </div>
 </div>

 {/* Let's add some songs section */}
 {isOwner && (
 <div id="add-songs-section" className="w-full px-4 md:px-10 mt-16 max-w-4xl mx-auto border-t border-white/5 pt-12 pb-20">
 <h3 className="text-xl font-bold font-sans text-white mb-2">Let's add some songs to your playlist</h3>
 <p className="text-sm text-white/40 mb-6">Search for tracks by song title or artist name</p>
 
 <div className="flex gap-2 mb-6">
 <input
 type="text"
 value={songSearchQuery}
 onChange={(e) => setSongSearchQuery(e.target.value)}
 placeholder="Search for songs..."
 className="flex-1 h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm focus:outline-none focus:border-red-500/50 text-white"
 />
 {songSearchQuery && (
 <button 
 onClick={() => setSongSearchQuery('')}
 className="px-4 text-xs font-bold text-white/60 hover:text-white"
 >
 Clear
 </button>
 )}
 </div>

 {isSearchingSongs && (
 <div className="text-sm text-white/40 py-4 animate-pulse">Searching songs...</div>
 )}

 {!isSearchingSongs && searchedSongs.length > 0 && (
 <div className="flex flex-col space-y-2 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
 {searchedSongs.map((track: any) => (
 <div key={track.id} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl transition-all">
 <img
 src={getTrackCover(track)}
 alt=""
 className="w-10 h-10 rounded-lg object-cover bg-zinc-900 border border-white/5 shrink-0"
 />
 <div className="flex-1 min-w-0">
 <div className="text-sm font-bold text-white truncate">{track.title}</div>
 <div className="text-xs text-white/40 truncate">{track.artist?.name || "Unknown Artist"}</div>
 </div>
 <button
 onClick={() => handleAddSongToPlaylist(track.id)}
 className="flex items-center gap-1.5 bg-white/10 hover:bg-red-500 hover:text-white text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 shrink-0"
 >
 <Plus size={12} /> Add
 </button>
 </div>
 ))}
 </div>
 )}

 {!isSearchingSongs && songSearchQuery && searchedSongs.length === 0 && (
 <div className="text-sm text-white/40 py-4 text-center">No songs found matching "{songSearchQuery}"</div>
 )}
 </div>
 )}
 </div>

 {/* Inline Toast Notification */}
 {toast && (
 <div 
 className={`fixed bottom-8 right-8 flex items-center gap-3 px-6 py-4 rounded-2xl border backdrop-blur-2xl shadow-2xl z-[9999] ${toast.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}
 >
 <span className="text-[14px] font-bold text-white">{toast.msg}</span>
 </div>
 )}

 <EditPlaylistCoverModal 
 isOpen={isEditCoverModalOpen}
 onClose={() => setIsEditCoverModalOpen(false)}
 currentCoverUrl={playlist?.coverUrl}
 onSave={async (url) => {
 await updatePlaylistMutation.mutateAsync({ coverUrl: url });
 }}
 />
 </div>
 );
}
