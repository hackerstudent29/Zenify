import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "@/store/ui";
import { usePlayerStore } from "@/store/player";
import { LyricsView } from "@/components/shared/LyricsView";
import { X } from "lucide-react";
import { useReactiveBgStore } from "@/store/reactiveBgStore";
import { cn, getTrackCover } from "@/lib/utils";
import { DynamicBackground } from "@/components/shared/DynamicBackground";

/** compact Apple Music sidebar width */
const SIDEBAR_W = 400;

export function GlobalLyricsSidebar() {
  const { isLyricsOpen, setIsLyricsOpen, isFullScreenPlayerOpen } = useUIStore();
  const showReactiveBg = useReactiveBgStore(state => state.lyrics);
  const currentTrack = usePlayerStore(state => state.currentTrack);
  const duration = usePlayerStore(state => state.duration);

  const loadedCover = getTrackCover(currentTrack);

  return (
    <AnimatePresence mode="wait">
      {isLyricsOpen && currentTrack && !isFullScreenPlayerOpen && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: SIDEBAR_W, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 320,
            damping: 33,
            mass: 0.85,
            opacity: { duration: 0.22 }
          }}
          className={cn(
            "relative h-full max-h-screen flex flex-col pointer-events-auto shrink-0 overflow-hidden",
            "border-l border-white/10 shadow-[0_0_60px_rgba(0,0,0,0.85)] z-[40]"
          )}
        >
          <motion.div
            initial={{ x: 48, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 48, opacity: 0 }}
            transition={{
              type: "spring",
              stiffness: 320,
              damping: 30,
              mass: 0.85,
              delay: 0.05
            }}
            style={{ width: SIDEBAR_W }}
            className="h-full max-h-screen flex flex-col relative overflow-hidden bg-[#0e0e11]/90 backdrop-blur-3xl"
          >

            {/* Reactive Liquid Background for sidebar lyrics */}
            {showReactiveBg && (
              <div className="absolute inset-0 z-0 overflow-hidden">
                <DynamicBackground surface="other" coverUrl={loadedCover} />
                <div className="absolute inset-0 bg-black/55 pointer-events-none z-10" />
              </div>
            )}

            {/* Apple-style floating minimal close button (compact) */}
            <motion.button
              onClick={() => setIsLyricsOpen(false)}
              whileTap={{ scale: 0.88 }}
              whileHover={{ scale: 1.06 }}
              transition={{ type: "spring", stiffness: 520, damping: 28 }}
              className="absolute top-3 right-3 z-40 flex h-7 w-7 items-center justify-center text-white/60 hover:text-white bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/10 rounded-full shadow-lg transition-colors cursor-pointer"
              title="Close Lyrics"
              aria-label="Close Lyrics"
            >
              <X size={13} />
            </motion.button>

            {/* Full-Length Lyrics Content (No header taking up space) */}
            <div className="flex-1 min-h-0 h-full w-full relative pb-[var(--player-height,80px)] z-20">
              <LyricsView
                trackId={currentTrack.id}
                title={currentTrack.title}
                artist={currentTrack.artist?.name}
                duration={duration}
                isLyricsOpen={true}
                isMobile={false}
                isFullscreen={false}
                isSidebar={true}
                transparent={true}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}