"use client";
import React, { useState } from 'react';
import { format } from 'date-fns';
import { getMediaUrl, cn } from '@/lib/utils';
import { Edit2, Trash2, MoreVertical, Play, Pause, Volume2, Music, Folder, ChevronDown, Mic } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Button } from '@/components/ui/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useUIStore } from '@/store/ui';
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription
} from "@/components/ui/dialog";
import { motion, AnimatePresence } from 'framer-motion';

interface TrackManagementListProps {
 tracks: any[];
 onEdit: (track: any) => void;
}

export function TrackManagementList({ tracks, onEdit }: TrackManagementListProps) {
 const queryClient = useQueryClient();
 const navigate = useNavigate();
 const [toast, setToast] = useState<{ msg: string, type: 'success' | 'error' } | null>(null);
 const [previewTrack, setPreviewTrack] = useState<any>(null);
 const [trackToDelete, setTrackToDelete] = useState<any>(null);
 const [isPlaying, setIsPlaying] = useState(false);
 const [currentTime, setCurrentTime] = useState(0);
 const [duration, setDuration] = useState(0);
 const [expandedAlbums, setExpandedAlbums] = useState<Set<string>>(new Set());
 const [activeTab, setActiveTab] = useState<'all' | 'folders' | 'singles'>('all');
 const audioRef = React.useRef<HTMLAudioElement | null>(null);

 const toggleAlbum = (albumId: string) => {
 const newExpanded = new Set(expandedAlbums);
 if (newExpanded.has(albumId)) {
 newExpanded.delete(albumId);
 } else {
 newExpanded.add(albumId);
 }
 setExpandedAlbums(newExpanded);
 };

 const groupedItems = React.useMemo(() => {
 const groups: { [key: string]: any } = {};
 const standalone: any[] = [];

 tracks.forEach(track => {
 if (track.albumId) {
 if (!groups[track.albumId]) {
 groups[track.albumId] = {
 isAlbum: true,
 albumId: track.albumId,
 title: track.album?.title || "Unknown Album",
 coverUrl: track.album?.coverUrl || track.coverUrl,
 artistName: track.album?.artist?.name || track.artist?.name || track.artistName,
 genre: track.genre,
 createdAt: track.createdAt,
 tracks: [],
 totalDuration: 0
 };
 }
 groups[track.albumId].tracks.push(track);
 groups[track.albumId].totalDuration += (track.duration || 0);
 } else {
 standalone.push(track);
 }
 });

 const finalItems: any[] = Object.values(groups);

 return {
 folders: finalItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
 singles: standalone.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
 };
 }, [tracks]);

 const formatTime = (seconds: number) => {
 const mins = Math.floor(seconds / 60);
 const secs = Math.floor(seconds % 60);
 return `${mins}:${secs.toString().padStart(2, '0')}`;
 };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (!previewTrack?.audioUrl) {
        showToast("No preview stream is available for this track.", "error");
        return;
      }
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
          })
          .catch((err) => {
            console.error("Preview playback failed:", err);
            setIsPlaying(false);
            showToast("Could not play the audio stream. Format may be unsupported.", "error");
          });
      } else {
        setIsPlaying(true);
      }
    }
  };

 const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
 setToast({ msg, type });
 setTimeout(() => setToast(null), 3000);
 };

 const deleteMutation = useMutation({
 mutationFn: async (id: string) => {
 await api.delete(`/tracks/${id}`);
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['admin-tracks'] });
 showToast("Track deleted permanently", "success");
 },
 onError: () => {
 showToast("Failed to delete track", "error");
 }
 });

 const deleteAlbumMutation = useMutation({
 mutationFn: async (albumId: string) => {
 await api.delete(`/albums/${albumId}`);
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['admin-tracks'] });
 showToast("Album and all its tracks deleted", "success");
 },
 onError: () => {
 showToast("Failed to delete album", "error");
 }
 });

 const handleDeleteClick = (track: any) => {
 useUIStore.getState().openConfirmModal({
 title: "Delete Frequency?",
 message: <>&quot;{track.title}&quot; will be permanently erased from the <span className="font-zenify">zenify</span> archives. This action is final.</>,
 confirmText: "Erase Asset",
 type: "danger",
 onConfirm: () => deleteMutation.mutate(track.id)
 });
 };

 const handleDeleteAlbum = (item: any) => {
 useUIStore.getState().openConfirmModal({
 title: "Delete Entire Album?",
 message: `"${item.title}" and all ${item.tracks.length} tracks inside will be permanently erased. This cannot be undone.`,
 confirmText: "Delete Album",
 type: "danger",
 onConfirm: () => deleteAlbumMutation.mutate(item.albumId)
 });
 };

 const renameAlbumMutation = useMutation({
 mutationFn: async ({ albumId, title }: { albumId: string, title: string }) => {
 await api.patch(`/albums/${albumId}`, { title });
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['admin-tracks'] });
 showToast("Album renamed", "success");
 },
 onError: () => {
 showToast("Failed to rename album", "error");
 }
 });

 const updateAlbumCoverMutation = useMutation({
 mutationFn: async ({ albumId, coverUrl }: { albumId: string, coverUrl: string }) => {
 await api.patch(`/albums/${albumId}`, { coverUrl });
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['admin-tracks'] });
 showToast("Album art updated", "success");
 },
 onError: () => {
 showToast("Failed to update album art", "error");
 }
 });

 const updateTrackMutation = useMutation({
 mutationFn: async ({ trackId, data }: { trackId: string, data: any }) => {
 await api.put(`/tracks/${trackId}`, data);
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['admin-tracks'] });
 showToast("Track updated", "success");
 },
 onError: () => {
 showToast("Failed to update track", "error");
 }
 });

 const handleRenameAlbum = (item: any) => {
 const newTitle = window.prompt("Enter new album name:", item.title);
 if (newTitle && newTitle.trim() !== "" && newTitle !== item.title) {
 renameAlbumMutation.mutate({ albumId: item.albumId, title: newTitle.trim() });
 }
 };

 const handleChangeAlbumArt = (item: any) => {
 const newCover = window.prompt("Enter new image URL for album art:");
 if (newCover && newCover.trim() !== "") {
 updateAlbumCoverMutation.mutate({ albumId: item.albumId, coverUrl: newCover.trim() });
 }
 };

 const handleChangeTrackArt = (track: any) => {
 const newCover = window.prompt("Enter new image URL for track art:");
 if (newCover && newCover.trim() !== "") {
 updateTrackMutation.mutate({ trackId: track.id, data: { coverUrl: newCover.trim() } });
 }
 };

 const handleRemoveFromAlbum = (track: any) => {
 if (window.confirm(`Are you sure you want to remove "${track.title}" from its album?`)) {
 updateTrackMutation.mutate({ trackId: track.id, data: { albumId: null } });
 }
 };

 if (!tracks || tracks.length === 0) {
 return (
 <div className="flex flex-col items-center justify-center py-24 text-center">
 <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
 <Play className="text-zinc-600 w-6 h-6" />
 </div>
 <h3 className="text-white font-medium">No tracks found</h3>
 <p className="text-zinc-500 text-sm mt-1">Upload your first frequency to get started.</p>
 </div>
 );
 }

 return (
 <div className="w-full">
 {/* Tab Controls */}
 <div className="px-6 py-4 flex gap-2 border-b border-white/5 bg-zinc-950">
 <button
 onClick={() => setActiveTab('all')}
 className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'all' ? 'bg-white text-black' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}
 >
 All Items
 </button>
 <button
 onClick={() => setActiveTab('folders')}
 className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'folders' ? 'bg-brand text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}
 >
 <Folder size={16} /> Folders
 </button>
 <button
 onClick={() => setActiveTab('singles')}
 className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'singles' ? 'bg-blue-500 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}
 >
 <Music size={16} /> Singles
 </button>
 </div>

 {/* Table header — hidden on mobile */}
 <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 border-b border-white/5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
 <div className="col-span-1 text-center font-mono">#</div>
 <div className="col-span-5">Track Details</div>
 <div className="col-span-2">Genre</div>
 <div className="col-span-2">Statistics</div>
 <div className="col-span-2 text-right">Actions</div>
 </div>

 <div className="divide-y divide-white/5 max-h-[500px] overflow-y-auto custom-scrollbar relative">

 {/* FOLDERS SECTION */}
 {(activeTab === 'all' || activeTab === 'folders') && groupedItems.folders.length > 0 && (
 <>
 <div className="px-6 py-3 bg-zinc-900/90 backdrop-blur-xl text-xs font-semibold text-brand border-b border-white/5 flex items-center gap-2 sticky top-0 z-20 shadow-md">
 <Folder size={14} /> Folders & Collections
 </div>
 {groupedItems.folders.map((item, i) => {
 const isExpanded = expandedAlbums.has(item.albumId);
 return (
 <React.Fragment key={`album-${item.albumId}`}>
 {/* Album Row */}
 <div onClick={() => toggleAlbum(item.albumId)} className="flex md:grid md:grid-cols-12 gap-3 md:gap-4 px-4 md:px-6 py-4 md:py-5 items-center hover:bg-white/[0.04] bg-white/[0.01] transition-all group cursor-pointer relative overflow-hidden">
 <div className="absolute left-0 top-0 bottom-0 w-1 bg-white/10 group-hover:bg-brand/50 transition-colors" />
 {/* Mobile: toggle icon, Desktop: col-span-1 centered */}
 <div className="md:col-span-1 text-center text-zinc-500 flex justify-center group-hover:text-brand transition-colors shrink-0">
 {isExpanded ? <ChevronDown size={18} /> : <Folder size={18} />}
 </div>

 <div className="md:col-span-5 flex items-center gap-3 min-w-0 flex-1">
 <div className="relative w-10 h-10 md:w-12 md:h-12 bg-zinc-900 rounded-xl overflow-hidden flex-shrink-0 shadow-lg border border-white/10">
 {item.coverUrl ? (
 <img key={item.coverUrl} src={getMediaUrl(item.coverUrl)} alt={item.title} className="w-full h-full object-cover" />
 ) : (
 <div className="w-full h-full border border-dashed border-white/20 rounded-md flex items-center justify-center bg-white/5 p-2">
 <Music size={14} className="text-white/40" />
 </div>
 )}
 </div>
 <div className="min-w-0">
 <div className="font-bold text-white truncate text-[12px] md:text-[13px] flex items-center gap-2">
 {item.title}
 <span className="hidden sm:inline px-1.5 py-0.5 rounded-md bg-white/10 text-[9px] font-black tracking-widest text-zinc-300 uppercase shrink-0">Album</span>
 </div>
 <div className="text-[10px] md:text-[11px] text-zinc-400 truncate font-medium">
 {item.artistName} · <span className="text-brand">{item.tracks.length} tracks</span>
 </div>
 </div>
 </div>

 {/* Genre — hidden on mobile */}
 <div className="hidden md:block md:col-span-2">
 <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-white/5 text-zinc-400 border border-white/5 uppercase tracking-wider">
 {item.genre || "Multiple"}
 </span>
 </div>

 {/* Stats — hidden on mobile */}
 <div className="hidden md:block md:col-span-2 space-y-1">
 <div className="text-[10px] text-zinc-500 flex items-center gap-1.5 uppercase font-bold tracking-widest">Bulk Intake</div>
 <div className="text-[11px] text-zinc-600 font-mono">{format(new Date(item.createdAt), 'MMM dd, yyyy')} • <span className="text-white">{formatTime(item.totalDuration || 0)}</span></div>
 </div>

 {/* Actions */}
 <div className="md:col-span-2 flex items-center justify-end gap-2 md:pr-4 shrink-0">
 <Button variant="ghost" size="sm" className="h-7 md:h-8 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-white/5 hover:bg-white/10 text-white transition-all px-2 md:px-3">
 {isExpanded ? "Collapse" : "Expand"}
 </Button>
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <Button
 variant="ghost"
 size="icon"
 onClick={e => e.stopPropagation()}
 className="w-8 h-8 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10 transition-all focus-visible:ring-0 focus-visible:bg-white/10 data-[state=open]:bg-white/10"
 >
 <MoreVertical size={13} />
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end" className="bg-[#1c1c1e] border-white/10 text-white min-w-[170px] rounded-xl p-1.5 shadow-2xl z-[150]">
 <DropdownMenuItem
 onClick={e => { e.stopPropagation(); handleRenameAlbum(item); }}
 className="rounded-lg gap-2 text-xs font-medium text-white hover:text-white hover:bg-white/10 cursor-pointer mb-1"
 >
 <Edit2 size={14} /> Rename Album
 </DropdownMenuItem>
 <DropdownMenuItem
 onClick={e => { e.stopPropagation(); handleChangeAlbumArt(item); }}
 className="rounded-lg gap-2 text-xs font-medium text-white hover:text-white hover:bg-white/10 cursor-pointer mb-1"
 >
 <Edit2 size={14} /> Change Album Art
 </DropdownMenuItem>
 <DropdownMenuItem
 onClick={e => { e.stopPropagation(); handleDeleteAlbum(item); }}
 className="rounded-lg gap-2 text-xs font-medium text-red-400 hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
 >
 <Trash2 size={14} /> Delete Album &amp; All Tracks
 </DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 </div>
 </div>

 {/* Expanded Tracks */}
 <AnimatePresence>
 {isExpanded && (
 <motion.div
 initial={{ height: 0, opacity: 0 }}
 animate={{ height: "auto", opacity: 1 }}
 exit={{ height: 0, opacity: 0 }}
 className="overflow-hidden bg-black/40 border-y border-white/5 shadow-inner"
 >
 {item.tracks.map((track: any, trackIdx: number) => (
 <div key={track.id} className="flex md:grid md:grid-cols-12 gap-3 md:gap-4 px-4 md:px-6 py-3 md:py-4 items-center hover:bg-white/[0.02] transition-all group pl-10 md:pl-12 border-b border-white/[0.02] last:border-0">
 <div className="hidden md:block md:col-span-1 text-center text-zinc-700 font-mono text-[10px] font-bold">{trackIdx + 1}</div>

 <div className="md:col-span-5 flex items-center gap-3 min-w-0 flex-1">
 <div className="relative w-9 h-9 md:w-10 md:h-10 bg-zinc-800 rounded-lg overflow-hidden flex-shrink-0">
 <img key={track.coverUrl} src={getMediaUrl(track.coverUrl)} alt={track.title} className="w-full h-full object-cover" />
 </div>
 <div className="min-w-0">
 <div className="font-bold text-zinc-200 group-hover:text-white transition-colors truncate text-[12px]">{track.title}</div>
 <div className="text-[10px] text-zinc-600 truncate font-medium">{track.artist?.name || track.artistName}</div>
 </div>
 </div>

 {/* Genre/Stats — hidden on mobile */}
 <div className="hidden md:block md:col-span-2">
 <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black text-zinc-500 border border-white/5 uppercase">{track.genre || "Pop"}</span>
 </div>
 <div className="hidden md:block md:col-span-2 space-y-1">
 <div className="text-[9px] text-zinc-500 font-bold uppercase"><span className="text-zinc-300">{track.streams || 0}</span> STREAMS</div>
 <div className="text-[10px] text-white font-mono font-medium">{formatTime(track.duration || 0)}</div>
 </div>

 <div className="col-span-2 flex items-center justify-end gap-1">
 <Button
 variant="ghost"
 size="icon"
 onClick={(e) => { e.stopPropagation(); onEdit(track); }}
 className="w-8 h-8 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10 transition-all md:opacity-0 md:group-hover:opacity-100"
 >
 <Edit2 size={12} />
 </Button>

 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <Button
 variant="ghost"
 size="icon"
 className="w-8 h-8 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10 transition-all md:opacity-0 md:group-hover:opacity-100 data-[state=open]:opacity-100 focus-visible:ring-0 focus-visible:bg-white/10"
 >
 <MoreVertical size={12} />
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end" className="bg-[#1c1c1e] border-white/10 text-white min-w-[170px] rounded-xl p-1.5 shadow-2xl z-[150]">
 <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setPreviewTrack(track); }} className="rounded-lg gap-2 text-xs font-medium cursor-pointer focus:bg-brand/10 focus:text-brand">
 <Play size={14} className="text-brand" /> Preview Stream
 </DropdownMenuItem>
 <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/admin/lyric-sync?trackId=${track.id}`); }} className="rounded-lg gap-2 text-xs font-medium cursor-pointer focus:bg-violet-500/10 focus:text-violet-300 text-violet-300 hover:bg-violet-500/10">
 <Mic size={14} /> Sync Lyrics
 </DropdownMenuItem>
 <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleChangeTrackArt(track); }} className="rounded-lg gap-2 text-xs font-medium cursor-pointer text-white hover:bg-white/10">
 <Edit2 size={14} /> Change Track Art
 </DropdownMenuItem>
 <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRemoveFromAlbum(track); }} className="rounded-lg gap-2 text-xs font-medium cursor-pointer text-yellow-500 hover:bg-yellow-500/10">
 <Folder size={14} /> Remove From Album
 </DropdownMenuItem>
 <DropdownMenuItem
 onClick={(e) => { e.stopPropagation(); handleDeleteClick(track); }}
 className="rounded-lg gap-2 text-xs font-medium text-brand hover:text-brand hover:bg-brand/10 cursor-pointer"
 >
 <Trash2 size={14} /> Delete Track
 </DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 </div>
 </div>
 ))}
 </motion.div>
 )}
 </AnimatePresence>
 </React.Fragment>
 );
 })}
 </>
 )}

 {/* SINGLES SECTION */}
 {(activeTab === 'all' || activeTab === 'singles') && groupedItems.singles.length > 0 && (
 <>
 <div className="px-6 py-3 bg-zinc-900/90 backdrop-blur-xl text-xs font-semibold text-blue-400 border-b border-white/5 flex items-center gap-2 sticky top-0 z-20 shadow-md">
 <Music size={14} /> Individual Uploads
 </div>
 {groupedItems.singles.map((track, i) => {
 return (
 <div key={track.id} className="flex md:grid md:grid-cols-12 gap-3 md:gap-4 px-4 md:px-6 py-4 md:py-5 items-center hover:bg-white/[0.02] transition-all group">
 <div className="hidden md:block md:col-span-1 text-center text-zinc-600 font-mono text-xs">{i + 1}</div>

 <div className="md:col-span-5 flex items-center gap-3 min-w-0 flex-1">
 <div className="relative w-10 h-10 md:w-12 md:h-12 bg-zinc-800 rounded-lg overflow-hidden flex-shrink-0 shadow-lg">
 <img src={getMediaUrl(track.coverUrl)} alt={track.title} className="w-full h-full object-cover" />
 </div>
 <div className="min-w-0">
 <div className="font-bold text-white truncate text-[12px] md:text-[13px]">{track.title}</div>
 <div className="text-[10px] md:text-[11px] text-zinc-500 truncate font-medium">{track.artist?.name || track.artistName}</div>
 <div className="flex items-center gap-2 mt-0.5">
 {track.releaseStatus === 'DRAFT' && (
 <span className="text-[9px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">Draft</span>
 )}
 {track.isUnlisted && (
 <span className="text-[9px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded bg-zinc-500/10 text-zinc-500 border border-zinc-500/20">Unlisted</span>
 )}
 </div>
 </div>
 </div>

 {/* Genre — hidden on mobile */}
 <div className="hidden md:block md:col-span-2">
 <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-white/5 text-zinc-400 border border-white/5 uppercase tracking-wider">
 {track.genre || "Pop"}
 </span>
 </div>

 {/* Stats — hidden on mobile */}
 <div className="hidden md:block md:col-span-2 space-y-1">
 <div className="text-[10px] text-zinc-500 flex items-center gap-1.5">
 <span className="text-zinc-200 font-bold">{track.streams || 0}</span> STREAMS
 </div>
 <div className="text-[11px] text-zinc-600 font-mono">{format(new Date(track.createdAt), 'MMM dd, yyyy')} • <span className="text-white">{formatTime(track.duration || 0)}</span></div>
 </div>

 <div className="col-span-2 flex items-center justify-end gap-2">
 <Button
 variant="ghost"
 size="icon"
 onClick={(e) => { e.stopPropagation(); onEdit(track); }}
 className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-all"
 >
 <Edit2 size={14} />
 </Button>

 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <Button
 variant="ghost"
 size="icon"
 onClick={(e) => e.stopPropagation()}
 className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white transition-all focus-visible:ring-0 focus-visible:bg-white/10 data-[state=open]:bg-white/10"
 >
 <MoreVertical size={14} />
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end" className="bg-[#1c1c1e] border-white/10 text-white min-w-[170px] rounded-xl p-1.5 shadow-2xl z-[150]">
 <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setPreviewTrack(track); }} className="rounded-lg gap-2 text-xs font-medium cursor-pointer focus:bg-brand/10 focus:text-brand">
 <Play size={14} className="text-brand" /> Preview Stream
 </DropdownMenuItem>
 <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/admin/lyric-sync?trackId=${track.id}`); }} className="rounded-lg gap-2 text-xs font-medium cursor-pointer text-violet-300 hover:bg-violet-500/10">
 <Mic size={14} /> Sync Lyrics
 </DropdownMenuItem>
 <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleChangeTrackArt(track); }} className="rounded-lg gap-2 text-xs font-medium cursor-pointer text-white hover:bg-white/10">
 <Edit2 size={14} /> Change Track Art
 </DropdownMenuItem>
 <DropdownMenuItem
 onClick={(e) => { e.stopPropagation(); handleDeleteClick(track); }}
 className="rounded-lg gap-2 text-xs font-medium text-brand hover:text-brand hover:bg-brand/10 cursor-pointer"
 >
 <Trash2 size={14} /> Delete Track
 </DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 </div>
 </div>
 );
 })}
 </>
 )}
 </div>

 {/* Premium Preview Terminal - Apple Music Inspired */}
 <Dialog open={!!previewTrack} onOpenChange={(open) => {
 if (!open) {
 setPreviewTrack(null);
 setIsPlaying(false);
 }
 }}>
 <DialogContent className="bg-[#0f0f13] border-white/5 text-white max-w-md rounded-[32px] p-0 overflow-hidden shadow-2xl backdrop-blur-xl">
 <DialogHeader className="sr-only">
 <DialogTitle>Sonic Preview</DialogTitle>
 <DialogDescription>Registry Verification</DialogDescription>
 </DialogHeader>
 <AnimatePresence>
 {previewTrack && (
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, scale: 0.95 }}
 transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
 className="relative p-8 pt-8"
 >
 {/* Header - Integrated close button removed to avoid duplicates */}
 <div className="flex items-center gap-3 mb-8">
 <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
 <Music className="text-white/40 w-4 h-4" />
 </div>
 <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Registry Verification</h3>
 </div>

 {/* Center Artwork */}
 <div className="mx-auto w-56 h-56 rounded-[24px] overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.4)] border border-white/5">
 <img
 src={getMediaUrl(previewTrack?.coverUrl)}
 alt={previewTrack?.title || "Track Preview"}
 className="w-full h-full object-cover"
 />
 </div>

 {/* Metadata */}
 <div className="text-center mt-6">
 <h2 className="text-[18px] font-semibold text-[#f5f5f7] tracking-tight leading-tight">
 {previewTrack?.title}
 </h2>
 <p className="text-[14px] text-[#8e8e93] font-medium mt-4">
 {previewTrack?.artist?.name || previewTrack?.artistName}
 </p>
 </div>

 {/* Timeline & Controls */}
 <div className="mt-6">
 {/* Progress Bar */}
 <div className="space-y-3">
 <div className="relative w-full h-1 group">
 <div className="absolute inset-0 bg-[#2a2a2a] rounded-full overflow-hidden">
 <div
 className="h-full bg-white transition-all duration-100"
 style={{ width: `${(currentTime / duration) * 100 || 0}%` }}
 />
 </div>
 <input
 type="range"
 min="0"
 max={duration || 0}
 step="0.1"
 value={currentTime}
 onChange={(e) => {
 const time = parseFloat(e.target.value);
 if (audioRef.current) {
 audioRef.current.currentTime = time;
 setCurrentTime(time);
 }
 }}
 className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 appearance-none bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:opacity-0 group-hover:[&::-webkit-slider-thumb]:opacity-100 [&::-webkit-slider-thumb]:transition-opacity"
 />
 </div>
 <div className="flex justify-between text-[11px] font-medium tabular-nums text-white/20">
 <span>{formatTime(currentTime)}</span>
 <span>{formatTime(duration)}</span>
 </div>
 </div>

 {/* Play Controls */}
 <div className="flex items-center justify-center gap-10 mt-8">
 <button className="text-white/20 hover:text-white transition-colors">
 <Music size={20} className="rotate-[-10deg]" />
 </button>

 <motion.button
 whileHover={{ scale: 1.05 }}
 whileTap={{ scale: 0.95 }}
 onClick={togglePlay}
 className="w-[60px] h-[60px] rounded-full flex items-center justify-center text-brand"
 >
 {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
 </motion.button>

 <button className="text-white/20 hover:text-white transition-colors">
 <Volume2 size={20} />
 </button>
 </div>
 </div>
 </motion.div>
 )}
 </AnimatePresence>

 <audio
 ref={audioRef}
 src={getMediaUrl(previewTrack?.audioUrl)}
 crossOrigin="anonymous"
 onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
 onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
 onEnded={() => setIsPlaying(false)}
 className="sr-only"
 />
 </DialogContent>
 </Dialog>

 {toast && (
 <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 rounded-2xl border backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-[100] transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 ${toast.type === 'error'
 ? 'bg-red-500/10 border-red-500/20 text-red-400'
 : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
 }`}>
 <span className="text-[13px] font-semibold tracking-tight">{toast.msg}</span>
 </div>
 )}
 </div>
 );
}
