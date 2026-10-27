import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "@/store/ui";
import { usePlayerStore } from "@/store/player";
import { LyricsView } from "@/components/shared/LyricsView";
import { X } from "lucide-react";
import { useReactiveBgStore } from "@/store/reactiveBgStore";
import { cn, getTrackCover } from "@/lib/utils";
import { DynamicBackground } from "@/components/shared/DynamicBackground";

/** Slim & lengthy Apple Music frosted glass sidebar width (compact 280px) */
const SIDEBAR_W = 280;

export function GlobalLyricsSidebar() {
  const { isLyricsOpen, setIsLyricsOpen, isFullScreenPlayerOpen } = useUIStore();
  const showReactiveBg = useReactiveBgStore(state => state.lyrics);
  const currentTrack = usePlayerStore(state => state.currentTrack);
  const duration = usePlayerStore(state => state.duration);

  const loadedCover = getTrackCover(currentTrack);

  return (
    <AnimatePresence>
      {isLyricsOpen && currentTrack && !isFullScreenPlayerOpen && (
        <motion.div
          initial={{ x: SIDEBAR_W, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: SIDEBAR_W, opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 340,
            damping: 32,
            mass: 0.85
          }}
          style={{ width: SIDEBAR_W }}
          className={cn(
            "fixed top-0 right-0 bottom-0 flex flex-col pointer-events-auto overflow-hidden",
            "border-l border-white/10 shadow-[-16px_0_40px_rgba(0,0,0,0.4)] z-[140]",
            "bg-black/15 backdrop-blur-md"
          )}
        >
          {/* Apple-style floating minimal close button (compact) */}
          <motion.button
            onClick={() => setIsLyricsOpen(false)}
            whileTap={{ scale: 0.88 }}
            whileHover={{ scale: 1.06 }}
            transition={{ type: "spring", stiffness: 520, damping: 28 }}
            className="absolute top-4 right-4 z-40 flex h-7 w-7 items-center justify-center text-white/60 hover:text-white bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/10 rounded-full shadow-lg transition-colors cursor-pointer"
            title="Close Lyrics"
            aria-label="Close Lyrics"
          >
            <X size={13} />
          </motion.button>

          {/* Full-Length Lyrics Content - Completely transparent over the frosted glass */}
          <div className="flex-1 min-h-0 h-full w-full relative pt-12 pb-[var(--player-height,80px)] z-20 overflow-hidden">
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
      )}
    </AnimatePresence>
  );
}