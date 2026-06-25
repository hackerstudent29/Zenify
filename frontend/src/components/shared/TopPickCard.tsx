"use client";

import { motion } from "framer-motion";
import { Play, Pause, Download, Plus, Heart } from "lucide-react";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { getMediaUrl, cn, formatDisplayTitle } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

interface TopPickCardProps {
 track: any;
 index: number;
 allTracks?: any[];
}

export function TopPickCard({ track, index, allTracks }: TopPickCardProps) {
 const router = useRouter();
 const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayerStore();
 const { openDownloadModal, isSidebarCollapsed } = useUIStore();
 const { isAuthenticated } = useAuthStore();
 const queryClient = useQueryClient();
 const isThisTrackPlaying = currentTrack?.id === track.id && isPlaying;
 const isActive = currentTrack?.id === track.id;

 const { data: likedTrackIds } = useQuery({
 queryKey: ['liked-track-ids'],
 queryFn: async () => {
 const res = await api.get('/tracks/liked');
 const arr = Array.isArray(res.data) ? res.data : (res.data?.items || []);
 return arr.map((t: any) => t.id);
 },
 staleTime: 1000 * 60 * 5,
 enabled: isAuthenticated,
 });

 const isLiked = likedTrackIds?.includes(track.id);

 const toggleLikeMutation = useMutation({
 mutationFn: async () => { await api.post(`/tracks/${track.id}/like`); },
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
 },
 });

 const handlePlay = (e: React.MouseEvent) => {
 e.stopPropagation();
 if (isActive) {
 togglePlay();
 } else {
 setTrack(track, allTracks || []);
 }
 };

 return (
 <div
 className={cn(
 "group relative flex-shrink-0 bg-[#1c1c1e] rounded-lg overflow-hidden border border-white/5 active:scale-95 transition-all duration-500 flex flex-col font-inter",
 isSidebarCollapsed 
 ? "w-[calc((100vw-44px)/2.1)] md:w-[295px]" 
 : "w-[calc((100vw-44px)/2.1)] md:w-[280px]"
 )}
 >
 {/* Image Area */}
 <div className="relative aspect-square overflow-hidden group-hover:brightness-90 transition-all duration-500">
 <img
 src={getMediaUrl(track.coverUrl, 'image')}
 alt={track.title}
 className="w-full h-full object-cover transition-transform duration-700"
 />

 {/* Play Overlay */}
 <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
 <button
 onClick={handlePlay}
 className="w-14 h-14 rounded-full bg-[#1c1c1e] text-red-500 flex items-center justify-center shadow-2xl scale-90 group- transition-transform duration-300 border border-white/10"
 >
 {isThisTrackPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
 </button>
 </div>

 {/* Visualizer (if playing) */}
 {isThisTrackPlaying && (
 <div className="absolute bottom-4 left-4 flex items-end gap-[3px] h-6 bg-black/40 backdrop-blur-md px-3 py-2 rounded-full border border-white/10">
 {[0.1, 0.4, 0.2].map((delay, i) => (
 <motion.div
 key={i}
 animate={{ height: ["30%", "100%", "30%"] }}
 transition={{ duration: 0.8 + i * 0.1, repeat: Infinity, ease: "easeInOut", delay }}
 className="w-[3px] bg-red-500 rounded-full"
 />
 ))}
 </div>
 )}
 </div>

 {/* Info Area */}
 <div className="p-3 md:p-5 flex flex-col justify-between flex-1">
 <div className="flex items-start justify-between gap-1">
 <div className="min-w-0 pr-1 flex-1">
 <h3 
 onClick={(e) => {
 e.stopPropagation();
 router.push(`/track/${track.id}`);
 }}
 className={cn(
 "font-inter text-[12px] md:text-[17px] font-bold tracking-tight leading-snug hover:text-brand hover:underline cursor-pointer transition-colors line-clamp-2 min-h-[2.6em]",
 isActive ? "text-red-500" : "text-white"
 )}
 >
 {formatDisplayTitle(track.title)}
 </h3>
 <p className="text-[10px] md:text-[13px] font-bold text-white/40 truncate mt-0.5">
 {formatDisplayTitle(track.artist?.name) || <><span className="font-zenify">zenify</span> Resident</>}
 </p>
 </div>
 <span className="text-[8px] md:text-[10px] font-black bg-white/5 border border-white/10 text-white/40 px-1.5 py-0.5 rounded-md uppercase tracking-[0.1em] shrink-0 mt-0.5">
 {new Date(track.createdAt || Date.now()).getFullYear()}
 </span>
 </div>

 <div className="flex items-center justify-between mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
 <div className="flex items-center gap-1">
 <button 
 onClick={(e) => { e.stopPropagation(); toggleLikeMutation.mutate(); }}
 className="w-8 h-8 rounded-full flex items-center justify-center transition-colors outline-none bg-transparent"
 >
 <motion.div
 whileTap={{ scale: 0.7 }}
 animate={{ scale: isLiked ? [1, 1.4, 1] : 1 }}
 transition={{ duration: 0.35, ease: "easeOut" }}
 className={cn(
 isLiked ? "text-brand" : "text-white/20 hover:text-brand"
 )}
 >
 <Heart size={16} className={cn(isLiked && "fill-current")} />
 </motion.div>
 </button>
 <button 
 onClick={(e) => { e.stopPropagation(); openDownloadModal(track); }}
 className="w-8 h-8 rounded-full flex items-center justify-center text-white/20 hover:text-white transition-colors"
 >
 <Download size={16} />
 </button>
 </div>
 <button className="w-8 h-8 rounded-full flex items-center justify-center text-white/20 hover:text-white transition-colors">
 <Plus size={16} />
 </button>
 </div>
 </div>
 </div>
 );
}
