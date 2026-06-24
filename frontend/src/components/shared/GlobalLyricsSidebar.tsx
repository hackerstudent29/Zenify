import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "@/store/ui";
import { usePlayerStore } from "@/store/player";
import { LyricsView } from "@/components/shared/LyricsView";
import { X } from "lucide-react";
import { cn, getTrackCover } from "@/lib/utils";
import { useAlbumColor } from "@/hooks/useAlbumColor";

export function GlobalLyricsSidebar() {
 const { isLyricsOpen, setIsLyricsOpen, isFullScreenPlayerOpen } = useUIStore();
 const currentTrack = usePlayerStore(state => state.currentTrack);
 const duration = usePlayerStore(state => state.duration);

 const loadedCover = getTrackCover(currentTrack);
 const colors = useAlbumColor(loadedCover, currentTrack?.palette);
 
 // `useAlbumColor` returns standard rgb() strings. We can manipulate them via CSS or just apply them directly.
 // For a dark gradient, we want to mix them with black.
 const dominantColor = colors[0] || "#000000";
 const mutedColor = colors[1] || "#111111";

 return (
 <AnimatePresence>
 {isLyricsOpen && currentTrack && !isFullScreenPlayerOpen && (
 <motion.div
 initial={{ width: 0, opacity: 0 }}
 animate={{ width: 360, opacity: 1 }}
 exit={{ width: 0, opacity: 0 }}
 transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
 className={cn(
 "relative h-full flex flex-col pointer-events-auto shrink-0 overflow-hidden",
 "border-l border-white/10 shadow-2xl z-[40]"
 )}
 >
 <div className="w-[360px] h-full flex flex-col relative overflow-hidden">
 {/* Static gradient background for performance */}
 <div 
 className="absolute inset-0 -z-10 opacity-60"
 style={{
 background: `linear-gradient(to bottom, ${dominantColor}, ${mutedColor}, rgba(0,0,0,0.9))`
 }}
 />
 <div className="absolute inset-0 -z-10 bg-black/75" />

 {/* Header */}
 <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0 z-10">
 <h2 className="text-sm font-bold text-white tracking-wide uppercase">Lyrics</h2>
 <button
 onClick={() => setIsLyricsOpen(false)}
 className="p-1.5 text-white/50 hover:text-white transition-colors rounded-full hover:bg-white/10"
 >
 <X size={18} />
 </button>
 </div>

 {/* Lyrics Content */}
 <div className="flex-1 min-h-0 relative pb-[var(--player-height,80px)]">
 <LyricsView
 trackId={currentTrack.id}
 title={currentTrack.title}
 artist={currentTrack.artist?.name}
 duration={duration}
 isLyricsOpen={true}
 isMobile={false}
 isFullscreen={false}
 transparent={true}
 />
 </div>
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 );
}
