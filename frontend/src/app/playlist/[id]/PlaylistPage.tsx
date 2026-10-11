"use client";


import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track, usePlayerStore } from "@/store/player";
import { Play, Trash2, Clock, Music, Plus, MoreHorizontal, Pause, Shuffle, User, Share2, Download, Edit2, ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import { cn, getMediaUrl, getTrackCover, formatDisplayTitle, formatArtists, getArtistTarget } from "@/lib/utils";
import { MarqueeText } from "@/components/shared/MarqueeText";
import { useAlbumColor } from "@/hooks/useAlbumColor";
import { StaticGlassBackground } from "@/components/shared/StaticGlassBackground";
import { UniversalMediaCover } from "@/components/shared/UniversalMediaCover";
import { EditPlaylistCoverModal } from "@/components/shared/EditPlaylistCoverModal";
import { AddSongsToPlaylistModal } from "@/components/shared/AddSongsToPlaylistModal";
import { AnimatedDropdown } from "@/components/ui/animated-dropdown";

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
 const { setQueue, setTrack, isShuffled, toggleShuffle, currentTrack, isPlaying } = usePlayerStore();
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

    const resolvedCover = singleCover ? (getMediaUrl(singleCover) || singleCover) : (currentTrack?.coverUrl || "/logo.png");
    setPageCoverUrl(resolvedCover);
    setPageCovers(null);

    return () => {
      setPageCoverUrl(null);
      setPageCovers(null);
    };
  }, [playlist?.coverUrl, playlist?.tracks, currentTrack?.coverUrl, setPageCoverUrl, setPageCovers]);

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
 if (!playlist || playlist.tracks.length === 0) return;
 const tracks = playlist.tracks.map((t: any) => t.track || t);
 // Set queue and play first
 useUIStore.getState().setPlayerMinimized(false);
 setQueue(tracks);
 setTrack(tracks[0]);
 };

 const handleShufflePlay = () => {
 if (!playlist || playlist.tracks.length === 0) return;
 
 if (isPlaylistActive) {
 toggleShuffle();
 return;
 }
 
 const tracks = playlist.tracks.map((t: any) => t.track || t);
 useUIStore.getState().setPlayerMinimized(false);
 
 if (!isShuffled) {
 toggleShuffle();
 }
 
 const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
 setTrack(randomTrack, tracks);
 };

  const handlePlayTrack = (track: Track) => {
    if (window.getSelection()?.toString()) return;
    if (!playlist) return;
    const tracks = playlist.tracks.map((t: any) => t.track || t);
    useUIStore.getState().setPlayerMinimized(false);
    setQueue(tracks);
    setTrack(track, tracks);
  }

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
 <img src={getMediaUrl(playlist.user.avatarUrl)} alt="" className="h-5 w-5 rounded-full mr-2 object-cover" />
 ) : (
 <div className="h-5 w-5 rounded-full bg-white/10 mr-2 flex-shrink-0" />
 )}
 <span className="font-sans text-sm font-medium text-white/80">{playlist.user?.username || playlist.user?.name || "User"}</span>
 </div>
 <span>•</span>
 <span>{playlist.tracks.length} tracks</span>
 </div>

 <div className="flex items-center justify-center sm:justify-start gap-4 flex-wrap">
          {/* Play / Pause pill */}
          <button
            onClick={handlePlayPlaylist}
            disabled={playlist.tracks.length === 0}
            className="flex items-center justify-center gap-3 glass-panel hover:bg-white/[0.08] text-white h-12 px-8 rounded-full font-bold text-[15px] active:scale-95 transition-all border-none disabled:opacity-50 cursor-pointer"
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
              handleShufflePlay();
            }}
            disabled={playlist.tracks.length === 0}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-90 cursor-pointer disabled:opacity-50",
              isShuffled ? "text-brand border border-brand/40 bg-brand/20 shadow-[0_0_15px_rgba(225,29,72,0.2)]" : "text-white/80 glass-panel hover:bg-white/[0.08] border-none"
            )}
            title="Shuffle"
          >
            <Shuffle size={18} />
          </button>

          {isOwner && (
            <button
              onClick={() => setIsAddSongsModalOpen(true)}
              className="flex items-center justify-center gap-2 glass-panel hover:bg-white/[0.08] text-brand h-12 px-6 rounded-full font-bold text-[14px] md:text-[15px] active:scale-95 transition-all border-none shadow-md cursor-pointer"
            >
              <Plus size={18} className="text-brand" strokeWidth={2.5} />
              <span>Add Songs</span>
            </button>
          )}

          {/* Playlist Three-Dot Actions Dropdown */}
          <AnimatedDropdown
            align="end"
            trigger={
              <button 
                className="w-12 h-12 rounded-full flex items-center justify-center text-white/80 glass-panel hover:bg-white/[0.08] border-none active:scale-90 cursor-pointer"
                title="Playlist Options"
              >
                <MoreHorizontal size={20} />
              </button>
            }
            items={[
 ...(isOwner ? [
 {
 id: 'add-songs',
 icon: <Plus size={15} className="text-brand" />,
 label: "Add Songs to Playlist",
 onClick: (e: any) => { e?.stopPropagation(); setIsAddSongsModalOpen(true); }
 },
 {
 id: 'edit-cover',
 icon: <Edit2 size={15} className="opacity-70" />,
 label: "Edit Cover Art",
 onClick: (e: any) => { e?.stopPropagation(); setIsEditCoverModalOpen(true); }
 },
 { id: 'sep1', isSeparator: true },
 ] : []),
 {
 id: 'share',
 icon: <Share2 size={15} className="opacity-70" />,
 label: "Share Playlist Link",
 onClick: (e: any) => {
 e?.stopPropagation();
 if (typeof window !== 'undefined') {
 navigator.clipboard.writeText(window.location.href);
 showToast("Playlist link copied to clipboard!", "success");
 }
 }
 },
 ...(isOwner ? [
 { id: 'sep2', isSeparator: true },
 {
 id: 'delete-playlist',
 icon: <Trash2 size={15} className="text-red-400" />,
 label: "Delete Playlist",
 className: "text-red-400 focus:text-red-400",
 onClick: (e: any) => {
 e?.stopPropagation();
 useUIStore.getState().openConfirmModal({
 title: "Delete Playlist?",
 message: `This will permanently remove "${playlist.name}" from your library.`,
 confirmText: "Erase Playlist",
 type: "danger",
 onConfirm: () => deletePlaylistMutation.mutate()
 });
 }
 }
 ] : [])
 ]}
 />
 </div>
 </div>
 </div>

 {/* ── TRACK LIST ────────────────────────────────────── */}
 <div className="w-full px-4 md:px-10 mt-6">
 <div className="flex flex-col space-y-0.5">
 {playlist.tracks.map((item, index) => {
 const track = item.track || item;
 const isTrackPlaying = usePlayerStore.getState().currentTrack?.id === track.id && usePlayerStore.getState().isPlaying;
 const isActive = usePlayerStore.getState().currentTrack?.id === track.id;

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
 <img src={getMediaUrl(track.coverUrl || track.album?.coverUrl)} className="w-full h-full object-cover" alt="" />
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
 "text-base font-sans truncate leading-snug cursor-pointer hover:underline transition-colors", 
 isActive ? "text-brand font-black" : "text-white opacity-90 font-bold hover:text-brand"
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
 <AnimatedDropdown
 align="end"
 trigger={
 <button className="p-2 text-white/20 hover:text-white transition-colors outline-none bg-transparent">
 <MoreHorizontal size={20} />
 </button>
 }
 items={[
 ...(getArtistTarget(track) ? [{
 id: 'artist',
 icon: <User size={14} className="opacity-70" />,
 label: "Go to Artist",
 onClick: (e: any) => {
 e?.stopPropagation();
 const target = getArtistTarget(track);
 if (target) router.push(target);
 }
 }] : []),
 {
 id: 'download',
 icon: <Download size={14} className="opacity-70" />,
 label: "Download",
 onClick: (e: any) => { e?.stopPropagation(); openDownloadModal(track); }
 },
 ...(isOwner ? [
 { id: 'sep1', isSeparator: true },
 {
 id: 'remove',
 icon: <Trash2 size={14} className="opacity-70 text-red-400" />,
 label: "Remove from Playlist",
 className: "text-red-400 focus:text-red-400",
 onClick: (e: any) => { e?.stopPropagation(); removeTrackMutation.mutate(track.id); }
 }
 ] : [])
 ]}
 />
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
 onClick={() => setIsAddSongsModalOpen(true)}
 className="bg-red-600 text-white font-bold tracking-wide text-xs px-8 h-12 rounded-full shadow-glow"
 >
 <Plus size={16} className="mr-2" /> Add songs
 </Button>
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
