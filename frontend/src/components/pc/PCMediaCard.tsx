"use client";

import React from "react";
import { Play, Pause, Heart, MoreHorizontal, ShoppingCart, Plus, Download, Maximize2, User, ArrowRight, Mic } from "lucide-react";
import { cn, getMediaUrl, getTrackCover, formatDisplayTitle, formatArtists } from "@/lib/utils";
import { UniversalMediaCover } from "../shared/UniversalMediaCover";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { Track, usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatedDropdown } from "@/components/ui/animated-dropdown";

export const InlinePlaylistCreator = ({ trackId, onSuccess }: { trackId: string, onSuccess: () => void }) => {
  const [name, setName] = React.useState("");
  const [isCreating, setIsCreating] = React.useState(false);
  const queryClient = useQueryClient();
  
  const createMutation = useMutation({
    mutationFn: async (playlistName: string) => {
      const res = await api.post('playlists', { name: playlistName, isPublic: false });
      await api.post(`playlists/${res.data.id}/tracks`, { trackId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-playlists'] });
      onSuccess();
      setName("");
      setIsCreating(false);
    }
  });

  if (!isCreating) {
    return (
      <button 
        className="w-full text-left px-2 py-1 text-sm text-brand hover:text-brand/80 font-bold tracking-tight transition-colors flex items-center gap-2"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setIsCreating(true); }}
      >
        <Plus size={14} strokeWidth={3} /> Create New Playlist
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-1" onClick={e => { e.stopPropagation(); e.preventDefault(); }}>
      <input 
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Name your playlist..."
        className="w-full bg-white/5 border border-white/20 rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-brand focus:bg-white/10 text-white placeholder:text-white/40 transition-all"
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Enter' && name.trim()) {
            createMutation.mutate(name.trim());
          }
        }}
      />
      <div className="flex items-center justify-end gap-2 px-1">
        <button onClick={() => setIsCreating(false)} className="text-[10px] text-white/40 hover:text-white uppercase font-bold">Cancel</button>
        <button 
          onClick={() => name.trim() && createMutation.mutate(name.trim())} 
          className="text-[10px] text-brand hover:text-brand/80 uppercase font-black tracking-wider"
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
};

interface MediaCardProps {
 track: Track;
 className?: string;
 index?: number;
 contextTracks?: Track[];
}

export function PCMediaCard({ track, className, index = 0, contextTracks }: MediaCardProps) {
 const pathname = usePathname();
 const router = useRouter();
 const currentTrack = usePlayerStore(state => state.currentTrack);
 const isPlaying = usePlayerStore(state => state.isPlaying);
 const setTrack = usePlayerStore(state => state.setTrack);
 const togglePlay = usePlayerStore(state => state.togglePlay);

 const [isArtHovered, setIsArtHovered] = React.useState(false);
 const [isOverflowing, setIsOverflowing] = React.useState(false);
 const [scrollDistance, setScrollDistance] = React.useState(0);
 const titleContainerRef = React.useRef<HTMLHeadingElement>(null);
 const titleTextRef = React.useRef<HTMLSpanElement>(null);

 const checkOverflow = React.useCallback(() => {
   if (titleContainerRef.current && titleTextRef.current) {
     const containerWidth = titleContainerRef.current.clientWidth;
     const textWidth = titleTextRef.current.scrollWidth;
     const overflow = textWidth > containerWidth;
     setIsOverflowing(overflow);
     if (overflow) {
       setScrollDistance(textWidth - containerWidth + 8);
     } else {
       setScrollDistance(0);
     }
   }
 }, []);

 React.useEffect(() => {
   checkOverflow();
   if (typeof ResizeObserver !== "undefined" && titleContainerRef.current) {
     const observer = new ResizeObserver(() => checkOverflow());
     observer.observe(titleContainerRef.current);
     return () => observer.disconnect();
   }
 }, [track.title, (track as any).name, checkOverflow]);

 const isPlayerMinimized = useUIStore(state => state.isPlayerMinimized);
 const setFullScreenPlayerOpen = useUIStore(state => state.setFullScreenPlayerOpen);
 const setPlayerMinimized = useUIStore(state => state.setPlayerMinimized);
 const openDownloadModal = useUIStore(state => state.openDownloadModal);
 const queryClient = useQueryClient();
 const isArtist = (track as any).isArtist;
 const isAlbum = (track as any).isAlbum;
 const isLink = isArtist || isAlbum || (track as any).isMood || (track as any).isPlaylist;
 const isCurrent = !isLink && currentTrack?.id === track.id;
 const isActuallyPlaying = isCurrent && isPlaying;

 const [toast, setToast] = React.useState<{ msg: string; type: 'success' | 'error' } | null>(null);

 const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
 setToast({ msg, type });
 setTimeout(() => setToast(null), 2500);
 };

 const { data: likedTrackIds } = useQuery({
 queryKey: ['liked-track-ids'],
 queryFn: async () => {
  const res = await api.get('tracks/liked');
  const arr = Array.isArray(res.data) ? res.data : (res.data?.items || []);
  return arr.map((t: any) => t.id);
 },
 staleTime: 1000 * 60 * 5,
 enabled: !isLink
 });

 const isLiked = !isLink && likedTrackIds?.includes(track.id);

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

 const { user, isAuthenticated } = useAuthStore();
 const { data: playlists } = useQuery({
 queryKey: ['my-playlists'],
 queryFn: async () => {
 try {
 const res = await api.get('playlists/my');
 return res.data as { id: string, name: string }[];
 } catch (e) { return []; }
 },
 enabled: isAuthenticated && !isLink
 });

 const addToPlaylistMutation = useMutation({
 mutationFn: async (playlistId: string) => {
 await api.post(`playlists/${playlistId}/tracks`, { trackId: track.id });
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['my-playlists'] });
 showToast("Added to playlist!", "success");
 },
 onError: (err: any) => {
 showToast(err.response?.data?.message || "Failed to add to playlist", "error");
 }
 });

 return (
 <>
 <div
 className={cn(
 "group relative flex flex-col gap-1 p-1 rounded-lg transition-all duration-500 cursor-pointer font-sans",
 !isArtist && "hover:bg-white/[0.03]",
 className
 )}
 onClick={(e) => {
 e.stopPropagation();
 if (isLink) {
 router.push((track as any).href);
 return;
 }
 if (isCurrent) {
 togglePlay();
 } else {
 setTrack(track, contextTracks);
 setPlayerMinimized(false);
 }
 }}
 >
 {/* PC Artwork Container */}
 <motion.div
  onMouseEnter={() => {
    setIsArtHovered(true);
    checkOverflow();
  }}
  onMouseLeave={() => {
    setIsArtHovered(false);
  }}
  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
  className={cn(
  "group/art relative aspect-square w-full overflow-hidden bg-surface-hover shadow-xl transition-all duration-500",
  isArtist ? "rounded-full" : "rounded-lg"
  )}
  >
 <UniversalMediaCover
 track={track}
 className={cn(
 "w-full h-full object-cover transition-transform duration-700 ease-out"
 )}
 />

 {(track as any).resumeProgress && track.duration && (
 <div className={cn(
 "absolute bottom-0 left-0 right-0 h-[3px] bg-black/50 overflow-hidden z-10",
 isArtist ? "rounded-b-full" : "rounded-b-lg"
 )}>
 <div 
 className="h-full bg-brand" 
 style={{ width: `${((track as any).resumeProgress / track.duration) * 100}%` }}
 />
 </div>
 )}

  {/* Top Gradient for Action Buttons Visibility */}
  {!isArtist && (
  <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-30 pointer-events-none" />
  )}

  {/* Micro-Interaction Actions */}
 {!isArtist && (
 <div className="absolute top-3 right-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-[-10px] group-hover:translate-y-0 z-40">
 {!isAlbum && (
 <button
 onClick={(e) => {
 e.stopPropagation();
 toggleLikeMutation.mutate();
 }}
 className="p-1 outline-none bg-transparent"
 >
 <motion.div
 whileTap={{ scale: 0.7 }}
 animate={{ scale: isLiked ? [1, 1.4, 1] : 1 }}
 transition={{ duration: 0.35, ease: "easeOut" }}
 className={cn(
 isLiked
 ? "text-brand"
 : "text-white/60 hover:text-brand"
 )}
 >
 <Heart size={18} className={cn(isLiked && "fill-current")} />
 </motion.div>
 </button>
 )}

 <AnimatedDropdown
 align="end"
 contentClassName="z-[100] pointer-events-auto"
 trigger={
 <button
 onClick={(e) => e.stopPropagation()}
 className="p-1 text-white/60 hover:text-rose-500 transition-colors outline-none bg-transparent"
 >
 <MoreHorizontal size={18} />
 </button>
 }
 items={[
 ...(!isAlbum ? [{
 id: 'favorite',
 icon: <Heart size={16} className={isLiked ? "fill-current text-[#EF4444]" : "opacity-70"} />,
 label: isLiked ? "Saved to Library" : "Save to Library",
 onClick: (e: any) => { e.stopPropagation(); toggleLikeMutation.mutate(); }
 }] : []),
 ...(track.artist?.id ? [{
 id: 'artist',
 icon: <User size={16} className="opacity-70" />,
 label: "Go to Artist",
 onClick: (e: any) => { e.stopPropagation(); window.location.href = `/artist/${track.artist.id}`; }
 }] : []),
 ...(!isAlbum ? [{
 id: 'playlist',
 icon: <Plus size={16} className="opacity-70" />,
 label: "Add to Playlist",
 subMenu: [
 ...(playlists || []).map((p: any) => ({
 id: p.id,
 label: p.name,
 onClick: (e: any) => { e.stopPropagation(); addToPlaylistMutation.mutate(p.id); }
 })),
 {
 id: 'create-inline',
 isSeparator: (playlists?.length || 0) > 0 // only add separator if there are existing playlists above it
 },
 {
 id: 'create-inline-content',
 content: <InlinePlaylistCreator trackId={track.id} onSuccess={() => showToast("Created & Added!", "success")} />
 }
 ].filter(item => !(item as any).isSeparator || ((item as any).isSeparator && (playlists?.length || 0) > 0))
 }] : []),
 ...(user?.role === 'ADMIN' && !isAlbum ? [{
 id: 'sync',
 icon: <Mic size={16} className="opacity-70 text-violet-400" />,
 label: "Sync Lyrics",
 className: "text-violet-400 focus:text-violet-300",
 onClick: (e: any) => { e.stopPropagation(); router.push(`/admin/lyric-sync?trackId=${track.id}`); }
 }] : []),
 { id: 'sep1', isSeparator: true },
 {
 id: 'download',
 icon: isAlbum ? <ArrowRight size={16} className="opacity-70" /> : <Download size={16} className="opacity-70 text-brand" />,
 label: isAlbum ? "View Album" : "Download Hi-Res",
 className: "text-brand focus:text-brand",
 onClick: (e: any) => { e.stopPropagation(); if (isAlbum) { window.location.href = (track as any).href; } else { openDownloadModal(track); } }
 }
 ]}
 />
 </div>
 )}

 {/* Playing Indicator */}
 <AnimatePresence>
 {isActuallyPlaying && (
 <div className="absolute bottom-3 left-3 pointer-events-none z-20">
 <div className="flex items-end gap-[2px] h-[14px]">
 {[0.2, 0.4, 0.1, 0.5].map((delay, i) => (
 <motion.div
 key={i}
 animate={{ height: ["35%", "100%", "35%"] }}
 transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut", delay }}
 className="w-[3px] bg-brand rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.5)]"
 />
 ))}
 </div>
 </div>
 )}
 </AnimatePresence>
 </motion.div>

 {/* PC Info Section */}
 <div className="flex flex-col min-w-0 flex-1 px-1 gap-1 mt-3">
  <h3 
  ref={titleContainerRef}
  onClick={(e) => {
  e.stopPropagation();
  if (!isArtist) router.push(`/track/${track.id}`);
  else router.push(`/artist/${track.id}`);
  }}
  className={cn("font-sans text-[15px] font-medium transition-colors text-white tracking-tight leading-snug hover:text-rose-500 cursor-pointer overflow-hidden whitespace-nowrap block relative w-full", isCurrent && "text-rose-500")}
  >
  <span
    ref={titleTextRef}
    className={cn(
      "inline-block whitespace-nowrap",
      isOverflowing && isArtHovered ? "animate-marquee-scroll" : "truncate w-full block"
    )}
    style={{
      transform: isOverflowing && isArtHovered ? undefined : 'none',
      ['--scroll-distance' as any]: `-${scrollDistance}px`
    }}
  >
    {formatDisplayTitle(track.title || (track as any).name)}
  </span>
  </h3>
 
 <div className="flex items-center justify-between gap-2 overflow-hidden h-4">
 {isArtist ? (
 <p className="text-[12px] text-brand font-medium truncate group-hover:text-brand/80 tracking-tight transition-colors flex-1 font-sans">
 Artist
 </p>
 ) : (pathname !== '/' && track.artist?.id) ? (
 <Link
 href={`/artist/${track.artist.id}`}
 onClick={(e) => e.stopPropagation()}
 className={cn("text-[12px] font-medium truncate transition-colors tracking-tight flex-1 font-sans hover:underline", isCurrent ? "text-zinc-400" : "text-zinc-400 hover:text-zinc-300")}
 >
 {formatArtists(track)}
 </Link>
 ) : (
 <p className={cn("text-[12px] font-medium truncate tracking-tight transition-colors flex-1 font-sans", isCurrent ? "text-zinc-400" : "text-zinc-400")}>
 {formatArtists(track)}
 </p>
 )}

 {/* Hover Duration in Rose (Hidden for Artists) */}
 {!isArtist && (
 <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
 <span className="text-[11px] font-bold text-red-500 tabular-nums">
 {(() => {
 const m = Math.floor((track.duration || 0) / 60);
 const s = (track.duration || 0) % 60;
 return `${m}:${s.toString().padStart(2, '0')}`;
 })()}
 </span>
 </div>
 )}
 </div>
 </div>
 </div>

 {/* Inline Toast Notification */}
 <AnimatePresence>
 {toast && (
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: 20 }}
 className={`fixed bottom-8 right-8 flex items-center gap-3 px-6 py-4 rounded-2xl border backdrop-blur-2xl shadow-2xl z-[9999] ${toast.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}
 >
 <span className="text-[14px] font-bold text-white">{toast.msg}</span>
 </motion.div>
 )}
 </AnimatePresence>
 </>
 );
}
