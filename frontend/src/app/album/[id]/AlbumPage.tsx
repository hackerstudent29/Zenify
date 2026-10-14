"use client";


import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { Play, MoreHorizontal, Pause, Shuffle, Share2, Plus, Download, User, Disc3, Music2, AudioLines, Check, X, Mic, RefreshCw, Sparkles } from "lucide-react";
import { usePlayerStore } from "@/store/player";
import { useAuthStore } from "@/store/authStore";
import { getMediaUrl, cn, formatDisplayTitle, formatArtists, getArtistTarget } from "@/lib/utils";
import { MarqueeText } from "@/components/shared/MarqueeText";
import { useAlbumColor } from "@/hooks/useAlbumColor";
import { useReactiveBgStore } from "@/store/reactiveBgStore";
import { useRefetchAudio } from "@/hooks/useRefetchAudio";
import { StaticGlassBackground } from "@/components/shared/StaticGlassBackground";
import Link from "next/link";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const formatDuration = (s?: number | null) => {
  if (!s || isNaN(s)) return "0:00";
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};
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
 const { album: showReactiveBg, toggleReactiveBg } = useReactiveBgStore();
 const openAddToPlaylistModal = useUIStore(s => s.openAddToPlaylistModal);
 const { refetchTrackAudio, isRefetching } = useRefetchAudio();
 const { setTrack, setQueue, currentTrack, isPlaying, togglePlay, isShuffled, toggleShuffle } = usePlayerStore();
 const { openDownloadModal, setFullScreenPlayerOpen, setPlayerMinimized, isFullScreenPlayerOpen } = useUIStore();
 const queryClient = useQueryClient();
 const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);
 const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

 const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
 setToast({ msg, type });
 useUIStore.getState().showToast(msg, type);
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

 const user = useAuthStore(s => s.user);
 const colors = useAlbumColor(album?.coverUrl, album?.palette);

 const setPageCoverUrl = useUIStore(s => s.setPageCoverUrl);
 const setPageCovers = useUIStore(s => s.setPageCovers);
 useEffect(() => {
   let singleCover = album?.coverUrl;
   if (!singleCover && album?.tracks?.length) {
     singleCover = album.tracks[0]?.coverUrl;
   }
   if (singleCover) {
     const resolvedCover = getMediaUrl(singleCover) || singleCover;
     setPageCoverUrl(resolvedCover);
   }

   const covers = album?.tracks?.slice(0, 4).map((t: any) => {
     return t?.coverUrl ? (getMediaUrl(t.coverUrl) || t.coverUrl) : null;
   }).filter(Boolean);
   if (covers && covers.length > 0) {
     setPageCovers(covers);
   }
 }, [album?.coverUrl, album?.tracks, setPageCoverUrl, setPageCovers]);

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

  const isTrackMatch = (t1: any, t2: any) => {
    if (!t1 || !t2) return false;
    if (t1.id === t2.id) return true;
    const id1 = String(t1.id || '').replace(/^(itunes-|sp-|yt-|track-)/i, '').trim();
    const id2 = String(t2.id || '').replace(/^(itunes-|sp-|yt-|track-)/i, '').trim();
    if (id1 && id2 && id1 === id2) return true;
    
    const title1 = (t1.title || '').trim().toLowerCase();
    const title2 = (t2.title || '').trim().toLowerCase();
    if (!title1 || !title2 || title1 !== title2) return false;
    
    const artist1 = (t1.artist?.name || t1.artistName || '').trim().toLowerCase();
    const artist2 = (t2.artist?.name || t2.artistName || album?.artist?.name || '').trim().toLowerCase();
    if (!artist1 || !artist2) return true;
    return artist1 === artist2 || artist1.includes(artist2) || artist2.includes(artist1);
  };

  const isAlbumActive = album.tracks?.some((t: any) => isTrackMatch(currentTrack, t));
  const isAlbumCurrentlyPlaying = isAlbumActive && isPlaying;

  const handlePlayAlbum = () => {
    if (isAlbumActive) {
      togglePlay();
    } else if (album.tracks?.length > 0) {
      setQueue(album.tracks);
      setTrack(album.tracks[0], album.tracks);
      setPlayerMinimized(false);
    }
  };

 const handleShufflePlay = () => {
 if (album.tracks?.length > 0) {
 if (isAlbumActive) {
 toggleShuffle();
 return;
 }
 
 if (!isShuffled) toggleShuffle();
 
 const randomIndex = Math.floor(Math.random() * album.tracks.length);
 setTrack(album.tracks[randomIndex], album.tracks);
 setPlayerMinimized(false);
 }
 };

  const handlePlayTrack = (track: any) => {
    if (window.getSelection()?.toString()) return;
    if (isTrackMatch(currentTrack, track)) {
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
 <div className="min-h-screen w-full bg-transparent overflow-x-hidden text-white relative">
 <div className="w-full relative z-10">
 {/* ── HEADER SECTION ─────────────────────────────────── */}
 <div className="relative px-6 pt-4 pb-8 md:px-10 md:pt-[110px] md:pb-12 text-center md:text-left flex flex-col items-center md:items-end md:flex-row gap-8">
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

 <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-[11px] font-bold text-white/50 uppercase tracking-widest mb-8">
 <span>{album.genre || "Soundtrack"}</span>
 <span>•</span>
 <span>{releaseYear}</span>
 <span>•</span>
 <span className="flex items-center gap-1">
 <AudioLines size={12} className="text-white/30" /> {album.genre === 'Hi-Res' ? 'Hi-Res Lossless' : 'Lossless'}
 </span>
 </div>

 <div className="flex items-center justify-center md:justify-start gap-4 flex-wrap">
          {/* Play / Pause pill */}
          <button
            onClick={() => {
              if (trackCount === 0) {
                showToast("This album has no tracks", "error");
                return;
              }
              handlePlayAlbum();
            }}
            className="flex items-center justify-center gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/15 text-white h-12 px-8 rounded-full font-bold text-[15px] active:scale-95 transition-all cursor-pointer shadow-none"
          >
            {isAlbumCurrentlyPlaying ? (
              <>
                <Pause size={18} className="text-brand" fill="currentColor" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play size={18} className="text-brand" fill="currentColor" />
                <span>Play</span>
              </>
            )}
          </button>

          {/* Shuffle (circular) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (trackCount === 0) {
                showToast("This album has no tracks", "error");
                return;
              }
              handleShufflePlay();
            }}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-xl transition-all active:scale-90 cursor-pointer shadow-none",
              isShuffled ? "text-brand border border-brand/50 bg-brand/20 shadow-[0_0_15px_rgba(225,29,72,0.2)]" : "text-white/80 bg-white/10 hover:bg-white/20 border border-white/15"
            )}
            title="Shuffle"
          >
            <Shuffle size={18} />
          </button>

                    {/* Reactive Background Toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleReactiveBg('album');
              showToast(showReactiveBg ? "Album reactive background disabled" : "Album reactive background enabled", "success");
            }}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-xl transition-all active:scale-90 cursor-pointer shadow-none",
              showReactiveBg ? "text-brand border border-brand/50 bg-brand/20 shadow-[0_0_15px_rgba(225,29,72,0.2)]" : "text-white/80 bg-white/10 hover:bg-white/20 border border-white/15"
            )}
            title={showReactiveBg ? "Disable Reactive Background" : "Enable Reactive Background"}
          >
            <Sparkles size={18} />
          </button>

          {/* Three-dot dropdown options menu (circular) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-12 h-12 rounded-full flex items-center justify-center text-white/80 bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/15 active:scale-90 cursor-pointer transition-all shadow-none" title="More options">
                <MoreHorizontal size={20} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="start">
              <DropdownMenuItem onClick={() => {
                if (typeof window !== "undefined") {
                  navigator.clipboard.writeText(window.location.href);
                  useUIStore.getState().showToast("Album link copied to clipboard", "success");
                }
              }}>
                <Share2 size={14} className="mr-2 text-white/60" />
                <span>Share Album</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
 </div>
 </div>

 {/* ── TRACK LIST ────────────────────────────────────── */}
 <div className="w-full px-4 md:px-10 mt-6">
 <div className="flex flex-col space-y-0.5">
  {album.tracks?.map((track: any, index: number) => {
  const isActive = isTrackMatch(currentTrack, track);
  const isTrackPlaying = isActive && isPlaying;

  return (
  <div
  key={track.id}
  onClick={() => handlePlayTrack(track)}
  className="group flex items-center gap-4 px-3 py-3 rounded-lg transition-all cursor-pointer hover:bg-white/[0.02]"
  >
  {/* Index / Playing Indicator */}
  <div className="w-6 flex items-center justify-center shrink-0">
  {isTrackPlaying ? (
  <div className="flex items-end gap-[1.5px] h-[12px] mb-0.5">
  {[0.1, 0.4, 0.2, 0.5].map((d, i) => (
  <motion.div
  key={i}
  animate={{ height: ["30%", "100%", "30%"] }}
  transition={{ duration: 0.8 + i * 0.1, repeat: Infinity, ease: "easeInOut", delay: d }}
  className="w-[2.5px] bg-brand rounded-full"
  />
  ))}
  </div>
  ) : isActive ? (
  <div className="w-2.5 h-2.5 rounded-full bg-brand animate-pulse" />
  ) : (
  <span className="text-sm font-bold text-white/30 group-hover:text-white/60">{index + 1}</span>
  )}
  </div>

 {/* Track Cover */}
 <div className="w-10 h-10 rounded-md overflow-hidden shrink-0 bg-zinc-800 relative shadow-md">
   {track.coverUrl || album.coverUrl ? (
     <img src={getMediaUrl(track.coverUrl || album.coverUrl)} className="w-full h-full object-cover" alt="" />
   ) : (
     <div className="w-full h-full flex items-center justify-center">
       <Music2 size={16} className="text-zinc-600" />
     </div>
   )}
 </div>

 {/* Track Info */}
 <div className="flex-1 min-w-0">
 <div className={cn("text-[15px] font-sans truncate leading-snug", isActive ? "text-brand font-black" : "text-white/80 font-bold")}>
 {formatDisplayTitle(track.title)}
 </div>
 <div className="text-[12px] font-medium text-white/50 truncate">
 {formatArtists(track, album.artist?.name)}
 </div>
 </div>

 {/* Actions */}
  <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
  <span className="text-xs text-rose-500/80 font-mono hidden sm:inline tabular-nums select-none mr-1">
  {formatDuration(track.duration)}
  </span>
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <button className="p-2 text-white/20 hover:text-white transition-colors">
 <MoreHorizontal size={20} />
 </button>
 </DropdownMenuTrigger>
 <DropdownMenuContent className="w-56" align="end">
 <DropdownMenuItem onClick={() => {
 const target = getArtistTarget(track) || getArtistTarget(album);
 if (target) router.push(target);
 else showToast("Artist details unavailable", "error");
 }}>
 <User size={14} className="mr-2" /> Go to Artist
 </DropdownMenuItem>
 <DropdownMenuSeparator className="bg-white/5" />
 <DropdownMenuItem onClick={() => openAddToPlaylistModal(track)}>
 <Plus size={14} className="mr-2" /> Add to Playlist
 </DropdownMenuItem>
 <DropdownMenuItem onClick={() => refetchTrackAudio(track, showToast)}>
 <RefreshCw size={14} className={cn("mr-2", isRefetching === track.id && "animate-spin text-brand")} />
 <span>{isRefetching === track.id ? "Refetching Audio..." : "Refetch Audio"}</span>
 </DropdownMenuItem>
 <DropdownMenuItem onClick={() => openDownloadModal({ ...track, artist: album.artist })}>
 <Download size={14} className="mr-2" /> Download
 </DropdownMenuItem>
 {user?.role === 'ADMIN' && (
 <DropdownMenuItem 
 onClick={() => router.push(`/admin/lyric-sync?trackId=${track.id}`)}
 className="text-violet-400 focus:text-violet-300 cursor-pointer"
 >
 <Mic size={14} className="mr-2 text-violet-400" /> Sync Lyrics
 </DropdownMenuItem>
 )}
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
 <div className="mt-12 mb-20 px-3 text-[11px] font-medium text-white/40 space-y-1">
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
