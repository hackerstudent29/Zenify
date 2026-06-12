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
 // Since we can't easily parse rgb() string to add opacity in linear-gradient without css variables,
 // we'll just use the raw color strings and rely on the wrapper's `opacity-60` for transparency.
 const dominantColor = colors[0] || "#000000";
 const mutedColor = colors[1] || "#111111";



 return (
 <AnimatePresence>
 {isLyricsOpen && currentTrack && !isFullScreenPlayerOpen && (
 <motion.div
 initial={{ x: "100%", opacity: 0 }}
 animate={{ x: 0, opacity: 1 }}
 exit={{ x: "100%", opacity: 0 }}
 transition={{ type: "spring", damping: 25, stiffness: 200 }}
 className={cn(
 "fixed top-0 right-0 h-full w-[360px] z-[500] flex flex-col pointer-events-auto",
 "border-l border-white/10 shadow-2xl overflow-hidden"
 )}
 >
 {/* Reactive Animated Background */}
 <motion.div 
 className="absolute inset-0 -z-10 opacity-60"
 animate={{
 background: `linear-gradient(to bottom, ${dominantColor}, ${mutedColor}, rgba(0,0,0,0.9))`
 }}
 transition={{ duration: 1.5 }}
 />
 <div className="absolute inset-0 -z-10 bg-black/40 backdrop-blur-3xl" />

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
 <div className="flex-1 min-h-0 relative">
 <LyricsView
 trackId={currentTrack.id}
 title={currentTrack.title}
 artist={currentTrack.artist?.name}
 duration={duration}
 isLyricsOpen={true}
 isMobile={false}
 isFullscreen={false}
 transparent={true}
 albumArt={loadedCover}
 />
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 );
}
