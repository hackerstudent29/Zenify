"use client";

import React from "react";
import { Play, Pause, Heart, MoreHorizontal, ShoppingCart, Plus, Download, Maximize2, User, ArrowRight, Mic, ListPlus, RefreshCw } from "lucide-react";
import { useRefetchAudio } from "@/hooks/useRefetchAudio";
import { useRefetchLyrics } from "@/hooks/useRefetchLyrics";
import { getRefetchLyricsAnimatedMenuItem } from "@/components/shared/RefetchLyricsSubMenu";
import { cn, getMediaUrl, getTrackCover, formatDisplayTitle, formatArtists, getArtistTarget } from "@/lib/utils";
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
import { ArtistLinks } from "@/components/shared/ArtistLinks";

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

export const PCMediaCard = React.memo(function PCMediaCard({ track, className, index = 0, contextTracks }: MediaCardProps) {
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
  const { refetchTrackAudio, isRefetching } = useRefetchAudio();
  const { refetchTrackLyrics } = useRefetchLyrics();
 const queryClient = useQueryClient();
 const isArtist = (track as any).isArtist;
 const isAlbum = (track as any).isAlbum;
 const isPlaylist = (track as any).isPlaylist || (track as any).type === 'playlist';
 const isLink = isArtist || isAlbum || isPlaylist || (track as any).isMood;
 const targetHref = (track as any).href || (
   isArtist ? `/artist/${track.id}` :
   isPlaylist ? `/playlist/${track.id}` :
   isAlbum ? `/album/${track.id}` :
   `/track/${track.id}`
 );
 const isCurrent = !isLink && currentTrack?.id === track.id;
 const isCurrentAlbum = isAlbum && (currentTrack?.albumId === track.id || (currentTrack as any)?.album?.id === track.id || (currentTrack as any)?.collectionId === track.id);
 const isCurrentPlaylist = isPlaylist && ((currentTrack as any)?.playlistId === track.id || (currentTrack as any)?.collectionId === track.id);
 const isActuallyPlaying = (isCurrent || isCurrentAlbum || isCurrentPlaylist) && isPlaying;

 const [toast, setToast] = React.useState<{ msg: string; type: 'success' | 'error' } | null>(null);

 const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
 setToast({ msg, type }); useUIStore.getState().showToast(msg, type);
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
 enabled: isAuthenticated && !isLink,
 staleTime: 5 * 60 * 1000
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
   if (isAlbum || isPlaylist) {
     const cover = getTrackCover(track);
     if (cover) {
       useUIStore.getState().setPageCoverUrl(cover);
     }
   }
 router.push(targetHref);
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
  whileTap={{ scale: 0.975 }}
  onMouseEnter={() => {
    setIsArtHovered(true);
    checkOverflow();
  }}
  onMouseLeave={() => {
    setIsArtHovered(false);
  }}
  transition={{ duration: 0.2, ease: "easeOut" }}
  className={cn(
  "group/art relative aspect-square w-full overflow-hidden bg-white/[0.06] shadow-[0_2px_10px_rgba(0,0,0,0.35)]",
  isArtist ? "rounded-full" : "rounded-[8px]"
  )}
  >
 <UniversalMediaCover
 track={track}
 className="w-full h-full object-cover"
 />

 {/* Hairline ring so light artwork keeps an edge on dark backgrounds */}
 <div className={cn(
   "pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10",
   isArtist ? "rounded-full" : "rounded-[8px]"
 )} />

 {/* Bottom Scrim for Controls Visibility */}
 {!isArtist && (
   <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity duration-300 group-hover/art:opacity-100" />
 )}

 {/* Top-Right Like Button */}
 {!isArtist && !isAlbum && (
   <button
     onClick={(e) => {
       e.stopPropagation();
       toggleLikeMutation.mutate();
     }}
     aria-label={isLiked ? "Unlike" : "Like"}
     className="am-glass-chip absolute top-2.5 right-2.5 z-20 flex h-7 w-7 items-center justify-center rounded-full text-white outline-none opacity-0 group-hover/art:opacity-100 transition-opacity hover:bg-white/25 cursor-pointer"
   >
     <motion.div
       whileTap={{ scale: 0.7 }}
       animate={{ scale: isLiked ? [1, 1.4, 1] : 1 }}
       transition={{ duration: 0.35, ease: "easeOut" }}
       className={cn(
         isLiked
           ? "text-brand"
           : "text-white/80 hover:text-brand"
       )}
     >
       <Heart size={14} className={cn(isLiked && "fill-current")} />
     </motion.div>
   </button>
 )}

 {/* Bottom Controls: Play Button & More Options (Apple Music Style) */}
 {!isArtist && (
   <>
     <button
       type="button"
       onClick={async (e) => {
         e.preventDefault();
         e.stopPropagation();
         if (isActuallyPlaying) {
           togglePlay();
           return;
         }
         if (isAlbum) {
           try {
             const albumData = (track as any).tracks?.length ? track : (await api.get(`/albums/${track.id}`)).data;
             const albumTracks = (albumData?.tracks || []).filter(Boolean);
             if (albumTracks.length > 0) {
               const first = {
                 ...albumTracks[0],
                 artwork: albumTracks[0].artwork || albumTracks[0].coverUrl || albumTracks[0].image || getTrackCover(track),
                 streamUrl: albumTracks[0].streamUrl || albumTracks[0].audioUrl,
               };
               setTrack(first, albumTracks);
               setPlayerMinimized(false);
             }
           } catch (err) {
             console.error("Failed to play album:", err);
           }
           return;
         }
         if (isPlaylist) {
           try {
             const plData = (track as any).tracks?.length ? track : (await api.get(`/playlists/${track.id}`)).data;
             const tracks = (plData?.tracks || []).map((t: any) => t.track || t).filter(Boolean);
             if (tracks.length > 0) {
               const first = {
                 ...tracks[0],
                 artwork: tracks[0].artwork || tracks[0].coverUrl || tracks[0].image || getTrackCover(track),
                 streamUrl: tracks[0].streamUrl || tracks[0].audioUrl,
               };
               setTrack(first, tracks);
               setPlayerMinimized(false);
             }
           } catch (err) {
             console.error("Failed to play playlist:", err);
           }
           return;
         }
         if (isCurrent) {
           togglePlay();
         } else {
           setTrack(track, contextTracks);
           setPlayerMinimized(false);
         }
       }}
       aria-label={isActuallyPlaying ? "Pause" : `Play ${formatDisplayTitle(track.title || (track as any).name)}`}
       className={cn(
         "am-glass-chip absolute bottom-2.5 left-2.5 z-20 flex h-8 w-8 items-center justify-center rounded-full text-white outline-none cursor-pointer",
         "translate-y-1.5 scale-90 opacity-0 transition-[opacity,transform] duration-300 ease-[var(--spring)]",
         "group-hover/art:translate-y-0 group-hover/art:scale-100 group-hover/art:opacity-100",
         "focus-visible:translate-y-0 focus-visible:scale-100 focus-visible:opacity-100 active:!scale-90 hover:bg-white/25",
         isActuallyPlaying && "!translate-y-0 !scale-100 !opacity-100"
       )}
     >
       {isActuallyPlaying ? (
         <Pause size={14} className="fill-current" />
       ) : (
         <Play size={14} className="fill-current ml-0.5" />
       )}
     </button>

     <div
       className={cn(
         "am-glass-chip absolute bottom-2.5 right-2.5 z-20 flex h-8 w-8 items-center justify-center rounded-full text-white outline-none cursor-pointer",
         "translate-y-1.5 scale-90 opacity-0 transition-[opacity,transform] duration-300 ease-[var(--spring)]",
         "group-hover/art:translate-y-0 group-hover/art:scale-100 group-hover/art:opacity-100",
         "focus-visible:translate-y-0 focus-visible:scale-100 focus-visible:opacity-100 active:!scale-90 hover:bg-white/25"
       )}
     >
       <AnimatedDropdown
         align="end"
         contentClassName="z-[100] pointer-events-auto"
         trigger={
           <button
             type="button"
             onClick={(e) => e.stopPropagation()}
             className="w-full h-full flex items-center justify-center text-white outline-none bg-transparent cursor-pointer"
           >
             <MoreHorizontal size={16} />
           </button>
         }
         items={[
           {
             id: 'add-to-queue',
             icon: <ListPlus size={16} className="opacity-70 text-brand" />,
             label: "Add to Queue",
             onClick: async (e: any) => {
               e.stopPropagation();
               try {
                 if (isAlbum) {
                   const albumData = (track as any).tracks ? track : (await api.get(`/albums/${track.id}`)).data;
                   if (albumData?.tracks?.length) {
                     usePlayerStore.getState().addToUserQueue(albumData.tracks, { contextName: track.title || (track as any).name });
                   } else {
                     showToast("Album has no tracks", "error");
                   }
                 } else if (isPlaylist) {
                   const plData = (track as any).tracks ? track : (await api.get(`/playlists/${track.id}`)).data;
                   const tracks = plData?.tracks?.map((t: any) => t.track || t) || [];
                   if (tracks.length) {
                     usePlayerStore.getState().addToUserQueue(tracks, { contextName: track.title || (track as any).name });
                   } else {
                     showToast("Playlist has no tracks", "error");
                   }
                 } else {
                   usePlayerStore.getState().addToUserQueue(track);
                 }
               } catch (err) {
                 showToast("Failed to queue items", "error");
               }
             }
           },
           ...(!isAlbum && !isPlaylist ? [
             {
               id: 'refetch-audio',
               icon: <RefreshCw size={16} className={cn("opacity-70", isRefetching === track.id && "animate-spin text-brand")} />,
               label: isRefetching === track.id ? "Refetching Audio..." : "Refetch Audio",
               onClick: (e: any) => { e.stopPropagation(); refetchTrackAudio(track, showToast); }
             },
             getRefetchLyricsAnimatedMenuItem(track, refetchTrackLyrics, showToast),
           ] : []),
           ...(!isAlbum ? [{
             id: 'favorite',
             icon: <Heart size={16} className={isLiked ? "fill-current text-[#EF4444]" : "opacity-70"} />,
             label: isLiked ? "Saved to Library" : "Save to Library",
             onClick: (e: any) => { e.stopPropagation(); toggleLikeMutation.mutate(); }
           }] : []),
           ...(getArtistTarget(track) ? [{
             id: 'artist',
             icon: <User size={16} className="opacity-70" />,
             label: "Go to Artist",
             onClick: (e: any) => { e.stopPropagation(); const target = getArtistTarget(track); if (target) router.push(target); }
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
                 isSeparator: (playlists?.length || 0) > 0
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
   </>
 )}

 {/* Playing Indicator */}
 <AnimatePresence>
 {isActuallyPlaying && (
 <div className="absolute bottom-3 left-12 pointer-events-none z-20">
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
  router.push(targetHref);
  }}
  className={cn("text-[15px] font-normal transition-colors text-white tracking-tight leading-snug hover:text-rose-500 cursor-pointer overflow-hidden whitespace-nowrap block relative w-full", isArtist ? "text-center" : "text-left", isCurrent && "text-rose-500")}
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
 <p className="text-[12px] text-brand font-medium truncate group-hover:text-brand/80 tracking-tight transition-colors flex-1 font-sans text-center">
 Artist
 </p>
 ) : isPlaylist ? (
 <p className="text-[12px] text-zinc-400 font-medium truncate tracking-tight transition-colors flex-1 font-sans">
 {(track as any).description || (track as any).subtitle || 'Curated Playlist'}
 </p>
 ) : isAlbum ? (
 <p className="text-[12px] text-zinc-400 font-medium truncate tracking-tight transition-colors flex-1 font-sans">
 {(track as any).subtitle || ((track as any).year ? `${(track as any).year} · ${(track as any).isSingle ? "Single" : "Album"}` : ((track as any).artist?.name || (track as any).artistName || 'Album'))}
 </p>
 ) : (
 <div className="flex-1 min-w-0 overflow-hidden">
   <ArtistLinks
     track={track}
     className="text-[12px] font-medium tracking-tight font-sans text-zinc-400 truncate block"
     linkClassName={cn("transition-colors", isCurrent ? "text-zinc-400" : "text-zinc-400 hover:text-white hover:underline")}
   />
 </div>
 )}

 {/* Hover Duration in Rose (Hidden for Artists, Playlists, and Albums) */}
 {!isArtist && !isPlaylist && !isAlbum && (
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
});
