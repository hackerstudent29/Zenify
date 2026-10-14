import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "@/store/ui";
import { usePlayerStore } from "@/store/player";
import { LyricsView } from "@/components/shared/LyricsView";
import { X, Sparkles } from "lucide-react";
import { useReactiveBgStore } from "@/store/reactiveBgStore";
import { cn, getTrackCover } from "@/lib/utils";
import { LiquidBackground } from "@/components/shared/LiquidBackground";

export function GlobalLyricsSidebar() {
  const { isLyricsOpen, setIsLyricsOpen, isFullScreenPlayerOpen } = useUIStore();
  const { lyrics: showReactiveBg, toggleReactiveBg } = useReactiveBgStore();
  const currentTrack = usePlayerStore(state => state.currentTrack);
  const duration = usePlayerStore(state => state.duration);

  const loadedCover = getTrackCover(currentTrack);

  return (
    <AnimatePresence mode="wait">
      {isLyricsOpen && currentTrack && !isFullScreenPlayerOpen && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 380, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 350,
            damping: 32,
            mass: 0.8
          }}
          className={cn(
            "relative h-full flex flex-col pointer-events-auto shrink-0 overflow-hidden",
            "border-l border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.8)] z-[40]"
          )}
        >
          <motion.div 
            initial={{ x: 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 60, opacity: 0 }}
            transition={{
              type: "spring",
              stiffness: 350,
              damping: 32,
              mass: 0.8,
              delay: 0.05
            }}
            className="w-[380px] h-full flex flex-col relative overflow-hidden bg-black"
          >

            {/* Reactive Liquid Background for sidebar lyrics (Default OFF) */}
            {showReactiveBg && (
              <div className="absolute inset-0 z-0 overflow-hidden">
                <LiquidBackground coverUrl={loadedCover} />
                <div className="absolute inset-0 bg-black/40 pointer-events-none z-10" />
              </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0 z-20 bg-black/30 backdrop-blur-md">
              <h2 className="text-sm font-bold text-white tracking-wide uppercase font-brand">Lyrics</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleReactiveBg('lyrics')}
                  className={cn(
                    "p-1.5 transition-colors rounded-full hover:bg-white/10 active:scale-90",
                    showReactiveBg ? "text-brand" : "text-white/40 hover:text-white"
                  )}
                  title={showReactiveBg ? "Disable Reactive Background" : "Enable Reactive Background"}
                >
                  <Sparkles size={16} />
                </button>
                <button
                  onClick={() => setIsLyricsOpen(false)}
                  className="p-1.5 text-white/50 hover:text-white transition-colors rounded-full hover:bg-white/10 active:scale-90"
                  title="Close Lyrics"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Lyrics Content */}
            <div className="flex-1 min-h-0 relative pb-[var(--player-height,80px)] z-20">
              <LyricsView
                trackId={currentTrack.id}
                title={currentTrack.title}
                artist={currentTrack.artist?.name}
                duration={duration}
                isLyricsOpen={true}
                isMobile={false}
                isFullscreen={false}
                transparent={showReactiveBg}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

