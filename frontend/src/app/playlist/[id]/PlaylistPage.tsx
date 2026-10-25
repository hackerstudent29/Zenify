import { SEO } from "@/components/shared/SEO";
"use client";


import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track, usePlayerStore } from "@/store/player";
import { Play, Trash2, Clock, Music, Plus, MoreHorizontal, Pause, Shuffle, User, Share2, Download, Edit2, ArrowLeft, Check, Mic, RefreshCw, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import { cn, getMediaUrl, getTrackCover, formatDisplayTitle, formatArtists, getArtistTarget } from "@/lib/utils";
import { MarqueeText } from "@/components/shared/MarqueeText";
import { useAlbumColor } from "@/hooks/useAlbumColor";
import { UniversalMediaCover } from "@/components/shared/UniversalMediaCover";
import { useRefetchAudio } from "@/hooks/useRefetchAudio";
import { useRefetchLyrics } from "@/hooks/useRefetchLyrics";
import { RefetchLyricsSubMenu } from "@/components/shared/RefetchLyricsSubMenu";
import { EditPlaylistCoverModal } from "@/components/shared/EditPlaylistCoverModal";
import { AddSongsToPlaylistModal } from "@/components/shared/AddSongsToPlaylistModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

import { motion } from "framer-motion";

interface Playlist {
 id: string;
 name: string;
 description?: string;
 coverUrl?: string;
 isPublic: boolean;
 tracks: any[];
 user?: { id: string, email: string, name?: string, username?: string, avatarUrl?: string };
}

export default function PlaylistDetailPage() {
 const params = useParams();
 const router = useRouter();
 const queryClient = useQueryClient();
 const { setQueue, setTrack, isShuffled, toggleShuffle, currentTrack, isPlaying, togglePlay } = usePlayerStore();
 const { user, isAuthenticated } = useAuthStore();
 const { openDownloadModal, isFullScreenPlayerOpen } = useUIStore();

  const [isAddSongsModalOpen, setIsAddSongsModalOpen] = React.useState(false);
  const [toast, setToast] = React.useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    useUIStore.getState().showToast(msg, type);
    setTimeout(() => setToast(null), 2500);
  };

  const playlistId = params?.id ? (Array.isArray(params.id) ? params.id[0] : params.id) : '';
 const openAddToPlaylistModal = useUIStore(s => s.openAddToPlaylistModal);
 const { refetchTrackAudio, isRefetching } = useRefetchAudio();
  const { refetchTrackLyrics } = useRefetchLyrics();

 

 const { data: playlist, isLoading, error } = useQuery({
 queryKey: ['playlist', playlistId],
 queryFn: async () => {
 const res = await api.get(`/playlists/${playlistId}`);
 return res.data as Playlist;
 },
 enabled: !!playlistId && isAuthenticated
 });

 const isPlaylistActive = playlist?.tracks?.some((t: any) => (t.track || t).id === currentTrack?.id);
  const isPlaylistCurrentlyPlaying = isPlaylistActive && isPlaying;

   const setPageCoverUrl = useUIStore(s => s.setPageCoverUrl);
  const setPageCovers = useUIStore(s => s.setPageCovers);

  React.useEffect(() => {
    if (!playlist) return;

    let singleCover: string | null = null;
    if (playlist.coverUrl && !playlist.coverUrl.startsWith("gradient:")) {
      singleCover = playlist.coverUrl;
    } else if (playlist.tracks && Array.isArray(playlist.tracks)) {
      for (const item of playlist.tracks) {
        const trackObj = item.track || item;
        if (trackObj?.coverUrl) {
          singleCover = trackObj.coverUrl;
          break;
        }
      }
    }

    if (singleCover) {
      const resolvedCover = getMediaUrl(singleCover) || singleCover;
      setPageCoverUrl(resolvedCover);
    }

    const covers = playlist.tracks?.slice(0, 4).map((item: any) => {
      const t = item.track || item;
      return t?.coverUrl ? (getMediaUrl(t.coverUrl) || t.coverUrl) : null;
    }).filter(Boolean);
    if (covers && covers.length > 0) {
      setPageCovers(covers);
    }

    return () => {
      setPageCoverUrl(null);
      setPageCovers(null);
    };
  }, [playlist?.coverUrl, playlist?.tracks, setPageCoverUrl, setPageCovers]);

 const deletePlaylistMutation = useMutation({
 mutationFn: async () => {
 await api.delete(`/playlists/${playlistId}`);
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['my-playlists'] });
 showToast("Playlist deleted", "success");
 router.push('/library');
 }
 });

 const removeTrackMutation = useMutation({
 mutationFn: async (trackId: string) => {
 await api.delete(`/playlists/${playlistId}/tracks/${trackId}`);
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] });
 showToast("Removed from playlist", "success");
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
 if (!playlist || !playlist.tracks || playlist.tracks.length === 0) return;
 const tracks = (playlist.tracks || []).map((t: any) => t.track || t);
 // Set queue and play first
 useUIStore.getState().setPlayerMinimized(false);
 setQueue(tracks);
 setTrack(tracks[0]);
 };

 const handleShufflePlay = () => {
 if (!playlist || !playlist.tracks || playlist.tracks.length === 0) return;
 
 if (isPlaylistActive) {
 toggleShuffle();
 return;
 }
 
 const tracks = (playlist.tracks || []).map((t: any) => t.track || t);
 useUIStore.getState().setPlayerMinimized(false);
 
 if (!isShuffled) {
 toggleShuffle();
 }
 
 const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
 setTrack(randomTrack, tracks);
 };

  const isTrackMatch = (t1: any, t2: any) => {
    if (!t1 || !t2) return false;
    return t1.id === t2.id;
  };

  const handlePlayTrack = (track: any) => {
    if (window.getSelection()?.toString()) return;
    if (!playlist) return;
    const tracks = (playlist.tracks || []).map((t: any) => t.track || t);
    useUIStore.getState().setPlayerMinimized(false);
    if (isTrackMatch(currentTrack, track)) {
      togglePlay();
    } else {
      setQueue(tracks);
      setTrack(track, tracks);
    }
  };

 const isOwner = user?.id === playlist?.user?.id;
 const firstTrack = playlist?.tracks?.[0]?.track || playlist?.tracks?.[0];
 const colors = useAlbumColor(playlist?.coverUrl || firstTrack?.coverUrl, firstTrack?.palette);

 if (isLoading) return <div className="p-8 text-white">Loading playlist...</div>;
 if (error || !playlist) return <div className="p-8 text-white">Playlist not found</div>;

 return (
 <div className="min-h-screen w-full bg-transparent overflow-x-hidden text-white relative">
 <div className="w-full relative z-10">
 {/* ── HEADER SECTION ─────────────────────────────────── */}
 <div className="relative px-6 pt-4 pb-8 md:px-10 md:pt-[110px] md:pb-12 text-center md:text-left flex flex-col items-center md:items-end md:flex-row gap-8">
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
 <span className="text-[11px] font-black uppercase tracking-[0.4em] text-brand mb-2">Playlist Collection</span>
 <h1 className="w-full mb-2">
 <MarqueeText className="font-outfit text-lg md:text-2xl lg:text-3xl font-medium text-white tracking-tight leading-normal drop-shadow-md">
 {formatDisplayTitle(playlist.name)}
 </MarqueeText>
 </h1>

 <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 text-lg font-bold text-white/50 mb-6">
 <div className="flex items-center">
 {playlist.user?.avatarUrl ? (
 <img src={getMediaUrl(playlist.user.avatarUrl)} alt={playlist.user?.name || "User avatar"} width={20} height={20} loading="lazy" decoding="async" className="h-5 w-5 rounded-full mr-2 object-cover" />
 ) : (
 <div className="h-5 w-5 rounded-full bg-white/10 mr-2 flex-shrink-0" />
 )}
 <span className="font-sans text-sm font-medium text-white/80">{playlist.user?.username || playlist.user?.name || "User"}</span>
 </div>
 <span>•</span>
 <span>{(playlist.tracks || []).length} tracks</span>
 </div>

 <div className="flex items-center justify-center sm:justify-start gap-4 flex-wrap">
          {/* Play / Pause pill */}
          <button
            onClick={() => {
              if (!playlist || !playlist.tracks || playlist.tracks.length === 0) {
                showToast("This playlist has no tracks yet", "error");
                return;
              }
              handlePlayPlaylist();
            }}
            className="flex items-center justify-center gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/15 text-white h-12 px-8 rounded-full font-bold text-[15px] active:scale-95 transition-all cursor-pointer shadow-none"
          >
            {isPlaylistCurrentlyPlaying ? (
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
              if (!playlist || !playlist.tracks || playlist.tracks.length === 0) {
                showToast("This playlist has no tracks yet", "error");
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

          {isOwner && (
            <button
              onClick={() => setIsAddSongsModalOpen(true)}
              className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/15 text-brand h-12 px-6 rounded-full font-bold text-[14px] md:text-[15px] active:scale-95 transition-all cursor-pointer shadow-none"
            >
              <Plus size={18} className="text-brand" strokeWidth={2.5} />
              <span>Add Songs</span>
            </button>
          )}

                    

          {/* Playlist Three-Dot Actions Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                className="w-12 h-12 rounded-full flex items-center justify-center text-white/80 bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/15 active:scale-90 cursor-pointer transition-all shadow-none"
                title="Playlist Options"
              >
                <MoreHorizontal size={20} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="start">
              {isOwner && (
                <>
                  <DropdownMenuItem onClick={() => setIsAddSongsModalOpen(true)}>
                    <Plus size={14} className="mr-2 text-brand" />
                    <span>Add Songs to Playlist</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsEditCoverModalOpen(true)}>
                    <Edit2 size={14} className="mr-2 text-white/60" />
                    <span>Edit Cover Art</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/10" />
                </>
              )}
              <DropdownMenuItem onClick={() => {
                if (!playlist || !playlist.tracks || playlist.tracks.length === 0) {
                  showToast("This playlist has no tracks yet", "error");
                  return;
                }
                const tracks = (playlist.tracks || []).map((t: any) => t.track || t);
                usePlayerStore.getState().addToUserQueue(tracks, { contextName: playlist.name });
              }}>
                <ListPlus size={14} className="mr-2 text-brand" />
                <span>Add to Queue</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                if (typeof window !== 'undefined') {
                  navigator.clipboard.writeText(window.location.href);
                  showToast("Playlist link copied to clipboard!", "success");
                }
              }}>
                <Share2 size={14} className="mr-2 text-white/60" />
                <span>Share Playlist Link</span>
              </DropdownMenuItem>
              {isOwner && (
                <>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem
                    className="text-red-400 focus:text-red-400 focus:bg-red-500/10 cursor-pointer"
                    onClick={() => {
                      useUIStore.getState().openConfirmModal({
                        title: "Delete Playlist?",
                        message: `This will permanently remove "${playlist.name}" from your library.`,
                        confirmText: "Erase Playlist",
                        type: "danger",
                        onConfirm: () => deletePlaylistMutation.mutate()
                      });
                    }}
                  >
                    <Trash2 size={14} className="mr-2 text-red-400" />
                    <span>Delete Playlist</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
 </div>
 </div>
 </div>

 {/* ── TRACK LIST ────────────────────────────────────── */}
 <div className="w-full px-4 md:px-10 mt-6">
 <div className="flex flex-col space-y-0.5">
  {(playlist.tracks || []).map((item, index) => {
  const track = item.track || item;
  const isActive = isTrackMatch(currentTrack, track);
  const isTrackPlaying = isActive && isPlaying;

 return (
 <div
 key={`${track.id}-${index}`}
 onClick={() => handlePlayTrack(track)}
 className="group flex items-center gap-4 px-3 py-3 rounded-lg transition-all cursor-pointer hover:bg-white/[0.02]"
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
 className="w-[2.5px] bg-brand rounded-full"
 />
 ))}
 </div>
 ) : (
 <span className="text-sm font-bold text-white opacity-40 group-hover:opacity-70">{index + 1}</span>
 )}
 </div>

 {/* Track Cover */}
 <div className="w-10 h-10 rounded-md overflow-hidden shrink-0 bg-zinc-800 relative shadow-md">
 {track.coverUrl || track.album?.coverUrl ? (
 <img src={getMediaUrl(track.coverUrl || track.album?.coverUrl)} className="w-full h-full object-cover" alt={track.title || "Track cover"} width={40} height={40} loading="lazy" decoding="async" />
 ) : (
 <div className="w-full h-full flex items-center justify-center">
 <Music size={16} className="text-zinc-600" />
 </div>
 )}
 </div>

 {/* Track Info */}
 <div className="flex-1 min-w-0">
 <div 
 className={cn(
 "text-base font-normal truncate leading-snug cursor-pointer hover:underline transition-colors", 
 isActive ? "text-brand font-bold" : "text-white opacity-90 hover:text-brand"
 )}
 style={isActive ? { color: "var(--accent-brand, #e11d48)" } : {}}
 onClick={(e) => {
 if (window.getSelection()?.toString()) return;
 e.stopPropagation();
 router.push(`/track/${track.id}`);
 }}
 >
 {formatDisplayTitle(track.title)}
 </div>
 <div className="text-xs font-medium text-white opacity-60 truncate">
 {formatArtists(track)}
 </div>
 </div>

 {/* Actions */}
 <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <button className="p-2 text-white/20 hover:text-white transition-colors outline-none bg-transparent cursor-pointer">
 <MoreHorizontal size={20} />
 </button>
 </DropdownMenuTrigger>
 <DropdownMenuContent className="w-52" align="end">
 <DropdownMenuItem onClick={() => {
 usePlayerStore.getState().addToUserQueue(track);
 }}>
 <ListPlus size={14} className="mr-2 text-brand" />
 <span>Add to Queue</span>
 </DropdownMenuItem>
 {getArtistTarget(track) && (
 <DropdownMenuItem onClick={() => {
 const target = getArtistTarget(track);
 if (target) router.push(target);
 }}>
 <User size={14} className="mr-2 text-white/60" />
 <span>Go to Artist</span>
 </DropdownMenuItem>
 )}
 <DropdownMenuItem onClick={() => openAddToPlaylistModal(track)}>
  <Plus size={14} className="mr-2 text-white/60" />
  <span>Add to Playlist</span>
</DropdownMenuItem>
<DropdownMenuItem onClick={() => refetchTrackAudio(track, showToast)}>
  <RefreshCw size={14} className={cn("mr-2 text-white/60", isRefetching === track.id && "animate-spin text-brand")} />
  <span>{isRefetching === track.id ? "Refetching Audio..." : "Refetch Audio"}</span>
</DropdownMenuItem>
<RefetchLyricsSubMenu track={track} refetchTrackLyrics={refetchTrackLyrics} showToast={showToast} />
<DropdownMenuItem onClick={() => openDownloadModal(track)}>
 <Download size={14} className="mr-2 text-white/60" />
 <span>Download</span>
 </DropdownMenuItem>
 {user?.role === 'ADMIN' && (
 <DropdownMenuItem 
 onClick={() => router.push(`/admin/lyric-sync?trackId=${track.id}`)}
 className="text-violet-400 focus:text-violet-300 cursor-pointer"
 >
 <Mic size={14} className="mr-2 text-violet-400" />
 <span>Sync Lyrics</span>
 </DropdownMenuItem>
 )}
 {isOwner && (
 <>
 <DropdownMenuSeparator className="bg-white/10" />
 <DropdownMenuItem
 className="text-red-400 focus:text-red-400 focus:bg-red-500/10 cursor-pointer"
 onClick={() => removeTrackMutation.mutate(track.id)}
 >
 <Trash2 size={14} className="mr-2 text-red-400" />
 <span>Remove from Playlist</span>
 </DropdownMenuItem>
 </>
 )}
 </DropdownMenuContent>
 </DropdownMenu>
 </div>
 </div>
 );
 })}
 {(!playlist.tracks || playlist.tracks.length === 0) && (
 <div className="flex flex-col items-center justify-center py-20 text-center">
 <Music size={48} className="text-zinc-700 mb-4 opacity-20" />
 <h3 className="text-lg font-bold text-white mb-2">This playlist is empty</h3>
 <p className="text-sm text-zinc-500 max-w-xs mb-8">Go find some songs to add to your collection!</p>
 <button
 onClick={() => setIsAddSongsModalOpen(true)}
 className="flex items-center justify-center gap-2 glass-panel hover:bg-white/[0.08] text-white h-12 px-8 rounded-full font-bold text-[14px] active:scale-95 transition-all border-none shadow-md cursor-pointer"
 >
 <Plus size={16} className="text-brand" strokeWidth={2.5} />
 <span>Add Songs</span>
 </button>
 </div>
 )}
 </div>
 </div>

 

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

 <AddSongsToPlaylistModal
 isOpen={isAddSongsModalOpen}
 onClose={() => setIsAddSongsModalOpen(false)}
 playlistId={playlistId}
 playlistName={playlist?.name || ""}
 existingTrackIds={playlist?.tracks?.map((t: any) => (t.track || t).id) || []}
 />
 </div>
 );
}
