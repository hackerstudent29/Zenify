"use client";


import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { Play, MoreHorizontal, Pause, Shuffle, Share2, Plus, Download, User, Disc3, Music2, AudioLines, Check, X } from "lucide-react";
import { usePlayerStore } from "@/store/player";
import { getMediaUrl, cn, formatDisplayTitle } from "@/lib/utils";
import { MarqueeText } from "@/components/shared/MarqueeText";
import { useAlbumColor } from "@/hooks/useAlbumColor";
import { SoftPageBackground } from "@/components/shared/SoftPageBackground";
import Link from "next/link";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

export default function AlbumPage() {
 const params = useParams();
 const router = useRouter();
 const id = Array.isArray(params?.id) ? params.id[0] : (params?.id as string);
 const { setTrack, setQueue, currentTrack, isPlaying, togglePlay, isShuffled, toggleShuffle } = usePlayerStore();
 const { openDownloadModal, setFullScreenPlayerOpen, setPlayerMinimized } = useUIStore();
 const queryClient = useQueryClient();
 const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);
 const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

 const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
 setToast({ msg, type });
 setTimeout(() => setToast(null), 2500);
 };

 const { data: album, isLoading } = useQuery({
 queryKey: ['album', id],
 queryFn: async () => {
 const res = await api.get(`/albums/${id}`);
 return res.data;
 },
 enabled: !!id,
 });

 const colors = useAlbumColor(album?.coverUrl, album?.palette);

 const setPageCoverUrl = useUIStore(s => s.setPageCoverUrl);
 useEffect(() => {
   if (album?.coverUrl) {
     setPageCoverUrl(album.coverUrl);
   }
   return () => setPageCoverUrl(null);
 }, [album?.coverUrl, setPageCoverUrl]);

 const { data: playlists } = useQuery({
 queryKey: ['my-playlists'],
 queryFn: async () => {
 try {
 const res = await api.get('/playlists/my');
 const arr = Array.isArray(res.data) ? res.data : (res.data?.items || []);
 return arr as { id: string, name: string }[];
 } catch (e) { return []; }
 }
 });

 const addToPlaylistMutation = useMutation({
 mutationFn: async ({ playlistId, trackId }: { playlistId: string, trackId: string }) => {
 await api.post(`/playlists/${playlistId}/tracks`, { trackId });
 },
 onSuccess: (_, variables) => {
 queryClient.invalidateQueries({ queryKey: ['playlist', variables.playlistId] });
 showToast("Added to playlist!", "success");
 },
 onError: (err: any) => {
 showToast(err.response?.data?.message || "Failed to add to playlist", "error");
 }
 });

 const { data: likedTrackIds } = useQuery({
 queryKey: ['liked-track-ids'],
 queryFn: async () => {
  const res = await api.get('/tracks/liked');
  const arr = Array.isArray(res.data) ? res.data : (res.data?.items || []);
  return arr.map((t: any) => t.id);
 },
 staleTime: 1000 * 60 * 5,
 });

 const toggleLikeMutation = useMutation({
 mutationFn: async (trackId: string) => {
 await api.post(`/tracks/${trackId}/like`);
 },
 onMutate: async (trackId: string) => {
 await queryClient.cancelQueries({ queryKey: ['liked-track-ids'] });
 const previousLikedIds = queryClient.getQueryData<string[]>(['liked-track-ids']);
 const newLikedIds = previousLikedIds ? (
 previousLikedIds.includes(trackId)
 ? previousLikedIds.filter(id => id !== trackId)
 : [...previousLikedIds, trackId]
 ) : [trackId];
 queryClient.setQueryData(['liked-track-ids'], newLikedIds);
 return { previousLikedIds };
 },
 onError: (_err, _vars, context) => {
 if (context?.previousLikedIds !== undefined) {
 queryClient.setQueryData(['liked-track-ids'], context.previousLikedIds);
 }
 },
 onSettled: () => {
 queryClient.invalidateQueries({ queryKey: ['liked-track-ids'] });
 queryClient.invalidateQueries({ queryKey: ['liked-tracks'] });
 }
 });

 const handleShare = async (item: any, type: 'album' | 'track' = 'album') => {
 const url = type === 'album'
 ? `${window.location.origin}/album/${id}`
 : `${window.location.origin}/album/${id}?track=${item.id}`;

 const title = type === 'album' ? album.title : item.title;
 const text = type === 'album' ? `Check out this album: ${album.title}` : `Listen to ${item.title} by ${album.artist?.name}`;

 if (navigator.share) {
 try {
 await navigator.share({ title, text, url });
 } catch (err) {
 if ((err as Error).name !== 'AbortError') showToast('Error sharing', 'error');
 }
 } else {
 try {
 await navigator.clipboard.writeText(url);
 showToast('Link copied to clipboard!');
 } catch (err) {
 showToast('Failed to copy link', 'error');
 }
 }
 };

 // Global Spacebar listener for Play/Pause
 useEffect(() => {
 const handleGlobalKeyDown = (e: KeyboardEvent) => {
 // Only trigger if not typing in an input/textarea
 if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

 if (e.code === 'Space') {
 e.preventDefault();
 togglePlay();
 }
 };

 window.addEventListener('keydown', handleGlobalKeyDown);
 return () => window.removeEventListener('keydown', handleGlobalKeyDown);
 }, [togglePlay]);

 if (isLoading) {
 return (
 <div className="flex items-center justify-center min-h-[60vh]">
 <ZenLoading size="md" />
 </div>
 );
 }

 if (!album) {
 return (
 <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 opacity-30">
 <Disc3 size={64} strokeWidth={1} />
 <p className="text-sm font-bold tracking-tight text-white/40">Album not found</p>
 </div>
 );
 }

 const isAlbumActive = album.tracks?.some((t: any) => t.id === currentTrack?.id);
 const isAlbumCurrentlyPlaying = isAlbumActive && isPlaying;

 const handlePlayAlbum = () => {
 if (isAlbumActive) {
 togglePlay();
 } else if (album.tracks?.length > 0) {
 setQueue(album.tracks);
 setTrack(album.tracks[0]);
 setPlayerMinimized(false);
 }
 };

 const handleShufflePlay = () => {
 if (album.tracks?.length > 0) {
 // Force shuffle to ON 
 if (!isShuffled) toggleShuffle();

 // Start a random track
 const randomIndex = Math.floor(Math.random() * album.tracks.length);
 setTrack(album.tracks[randomIndex], album.tracks);
 setPlayerMinimized(false);
 }
 };

 const handlePlayTrack = (track: any) => {
 if (currentTrack?.id === track.id) {
 togglePlay();
 } else {
 setQueue(album.tracks);
 setTrack(track, album.tracks);
 setPlayerMinimized(false);
 }
 };

 const coverUrl = getMediaUrl(album.coverUrl)
 || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=800";
 
 const releaseYear = album.releaseDate ? new Date(album.releaseDate).getFullYear() : new Date(album.createdAt).getFullYear();
 const trackCount = album.tracks?.length || 0;

 const totalSeconds = album.tracks?.reduce((acc: number, t: any) => acc + (t.duration || 0), 0) || 0;
 const totalHours = Math.floor(totalSeconds / 3600);
 const totalMins = Math.floor((totalSeconds % 3600) / 60);
 const totalDurationStr = totalHours > 0
 ? `${totalHours} hr ${totalMins} min`
 : `${totalMins} min ${totalSeconds % 60} sec`;

 return (
 <div className="min-h-screen w-full bg-black overflow-x-hidden text-white relative">
 <SoftPageBackground colors={colors} />
 <div className="w-full relative z-10">
 {/* ── HEADER SECTION ─────────────────────────────────── */}
 <div className="relative px-6 pt-[100px] pb-8 md:px-10 md:pt-[110px] md:pb-12 text-center md:text-left flex flex-col items-center md:items-end md:flex-row gap-8">
 {/* Album Artwork */}
 <motion.div
 initial={{ opacity: 0, scale: 0.95 }}
 animate={{ opacity: 1, scale: 1 }}
 className="shrink-0 w-[42vw] sm:w-[180px] md:w-[210px] lg:w-[220px] xl:w-[230px] h-[42vw] sm:h-[180px] md:h-[210px] lg:h-[220px] xl:h-[230px] rounded-lg shadow-xl overflow-hidden bg-zinc-900 border border-white/10"
 >
 <img src={coverUrl} alt={album.title} className="w-full h-full object-cover" />
 </motion.div>

 {/* Info */}
 <div className="flex flex-col flex-1 min-w-0 overflow-hidden w-full">
 <h1 className="w-full mb-2">
 <MarqueeText className="font-outfit text-lg md:text-2xl lg:text-3xl font-medium text-white tracking-tight leading-normal drop-shadow-md">
 {formatDisplayTitle(album.title)}
 </MarqueeText>
 </h1>

 <Link
 href={`/artist/${album.artistId}`}
 className="text-sm md:text-base font-sans font-medium text-white/80 hover:text-white transition-colors mb-4 block"
 >
 {formatDisplayTitle(album.artist?.name)}
 </Link>

 <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-[11px] font-bold text-white/40 uppercase tracking-widest mb-8">
 <span>{album.genre || "Soundtrack"}</span>
 <span>•</span>
 <span>{releaseYear}</span>
 <span>•</span>
 <span className="flex items-center gap-1">
 <AudioLines size={12} className="text-white/20" /> {album.genre === 'Hi-Res' ? 'Hi-Res Lossless' : 'Lossless'}
 </span>
 </div>

 <div className="flex items-center justify-center md:justify-start gap-4 w-full">
 <button
 onClick={handlePlayAlbum}
 disabled={trackCount === 0}
 className="flex-1 md:flex-initial flex items-center justify-center gap-3 bg-[#1c1c1e] hover:bg-[#2c2c2e] text-white h-12 px-12 rounded-xl font-bold text-[15px] active:scale-95 transition-all border border-white/5"
 >
 {isAlbumCurrentlyPlaying ? (
 <Pause size={18} className="text-brand" fill="currentColor" />
 ) : (
 <Play size={18} className="text-brand" fill="currentColor" />
 )}
 {isAlbumCurrentlyPlaying ? 'Pause' : 'Play'}
 </button>

 <button
 onClick={handleShufflePlay}
 disabled={trackCount === 0}
 className="flex-1 md:flex-initial flex items-center justify-center gap-3 bg-[#1c1c1e] hover:bg-[#2c2c2e] text-white h-12 px-12 rounded-xl font-bold text-[15px] active:scale-95 transition-all border border-white/5"
 >
 <Shuffle size={18} className="text-brand" fill="currentColor" />
 Shuffle
 </button>
 </div>
 </div>
 </div>

 {/* ── TRACK LIST ────────────────────────────────────── */}
 <div className="w-full px-4 md:px-10 mt-6">
 <div className="flex flex-col space-y-0.5">
 {album.tracks?.map((track: any, index: number) => {
 const isTrackPlaying = currentTrack?.id === track.id && isPlaying;
 const isActive = currentTrack?.id === track.id;

 return (
 <div
 key={track.id}
 onClick={() => handlePlayTrack(track)}
 className={cn(
 "group flex items-center gap-4 px-3 py-3 rounded-xl transition-all cursor-pointer active:bg-white/[0.05]",
 isActive ? "bg-white/[0.03]" : ""
 )}
 >
 {/* Index */}
 <div className="w-6 flex items-center justify-center shrink-0">
 {isTrackPlaying ? (
 <div className="flex items-end gap-[1.5px] h-[12px] mb-0.5">
 {[0.1, 0.4, 0.2, 0.5].map((d, i) => (
 <motion.div
 key={i}
 animate={{ height: ["30%", "100%", "30%"] }}
 transition={{ duration: 0.8 + i * 0.1, repeat: Infinity, ease: "easeInOut", delay: d }}
 className="w-[2.5px] bg-red-500 rounded-full"
 />
 ))}
 </div>
 ) : (
 <span className="text-sm font-bold text-white/20 group-hover:text-white/40">{index + 1}</span>
 )}
 </div>

 {/* Track Info */}
 <div className="flex-1 min-w-0">
 <div className={cn("text-[] font-sans font-bold truncate leading-snug", isActive ? "text-white" : "text-white/80")}>
 {formatDisplayTitle(track.title)}
 </div>
 <div className="text-[12px] font-medium text-white/40 truncate">
 {formatDisplayTitle(track.artist?.name || album.artist?.name)}
 </div>
 </div>

 {/* Actions */}
 <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <button className="p-2 text-white/20 hover:text-white transition-colors">
 <MoreHorizontal size={20} />
 </button>
 </DropdownMenuTrigger>
 <DropdownMenuContent className="w-56" align="end">
 <DropdownMenuItem onClick={() => router.push(`/artist/${track.artistId || album.artistId}`)}>
 <User size={14} className="mr-2" /> Go to Artist
 </DropdownMenuItem>
 <DropdownMenuSeparator className="bg-white/5" />
 <DropdownMenuSub>
 <DropdownMenuSubTrigger>
 <Plus size={14} className="mr-2" /> Add to Playlist
 </DropdownMenuSubTrigger>
 <DropdownMenuPortal>
 <DropdownMenuSubContent className="w-48 ml-1">
 {(Array.isArray(playlists) ? playlists : []).map((p: any) => (
 <DropdownMenuItem key={p.id} onClick={() => addToPlaylistMutation.mutate({ playlistId: p.id, trackId: track.id })}>
 {p.name}
 </DropdownMenuItem>
 ))}
 </DropdownMenuSubContent>
 </DropdownMenuPortal>
 </DropdownMenuSub>
 <DropdownMenuItem onClick={() => openDownloadModal({ ...track, artist: album.artist })}>
 <Download size={14} className="mr-2" /> Download
 </DropdownMenuItem>
 <DropdownMenuSeparator className="bg-white/5" />
 <DropdownMenuItem onClick={() => handleShare(track, 'track')}>
 <Share2 size={14} className="mr-2" /> Share
 </DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 </div>
 </div>
 );
 })}
 </div>

 {(!album.tracks || album.tracks.length === 0) && (
 <div className="py-32 text-center flex flex-col items-center gap-4">
 <Music2 size={40} className="text-white/10" />
 <p className="text-xs font-bold text-white/20 tracking-widest uppercase">Sonic Archive Empty</p>
 </div>
 )}

 {/* Footer Info */}
 <div className="mt-12 mb-20 px-3 text-[11px] font-medium text-white/30 space-y-1">
 <p>{new Date(album.releaseDate || album.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
 <p>{trackCount} songs, {totalDurationStr}</p>
 <p className="pt-2">℗ {releaseYear} <span className="font-zenify">zenify</span> Entertainment India Pvt. Ltd.</p>
 </div>
 </div>
 </div>

 <AnimatePresence>
 {toast && (
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: 10 }}
 className={`fixed bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 rounded-2xl border backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-[9999] ${toast.type === 'error'
 ? 'bg-red-500/10 border-red-500/20 text-red-400'
 : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
 }`}
 >
 {toast.type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
 <span className="text-[13px] font-semibold tracking-tight">{toast.msg}</span>
 </motion.div>
 )}
 </AnimatePresence>
 </div>
 );
}
