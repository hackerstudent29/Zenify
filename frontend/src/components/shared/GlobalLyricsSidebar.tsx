import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "@/store/ui";
import { usePlayerStore } from "@/store/player";
import { LyricsView } from "@/components/shared/LyricsView";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Same width as the queue and the --rp-w variable set by the layout */
const SIDEBAR_W = 380;

const PANEL_SPRING = { type: "spring", stiffness: 340, damping: 32, mass: 0.85 } as const;

export function GlobalLyricsSidebar() {
  const { isLyricsOpen, setIsLyricsOpen, isFullScreenPlayerOpen } = useUIStore();
  const currentTrack = usePlayerStore(state => state.currentTrack);
  const duration = usePlayerStore(state => state.duration);

  return (
    <AnimatePresence>
      {isLyricsOpen && currentTrack && !isFullScreenPlayerOpen && (
        <motion.div
          initial={{ x: SIDEBAR_W }}
          animate={{ x: 0 }}
          exit={{ x: SIDEBAR_W }}
          transition={PANEL_SPRING}
          style={{ width: SIDEBAR_W }}
          // The glass blurs the cards scrolling underneath: no cover layer needed here.
          className={cn(
            "fixed top-0 right-0 bottom-0 z-[140] flex flex-col overflow-hidden pointer-events-auto",
            "am-glass am-glass-right shadow-[-20px_0_60px_rgba(0,0,0,0.35)] will-change-transform"
          )}
        >
          <motion.button
            onClick={() => setIsLyricsOpen(false)}
            whileTap={{ scale: 0.88 }}
            whileHover={{ scale: 1.06 }}
            transition={{ type: "spring", stiffness: 520, damping: 28 }}
            className="am-glass-chip absolute top-4 right-4 z-40 flex h-7 w-7 items-center justify-center rounded-full text-white/70 hover:text-white cursor-pointer"
            title="Close Lyrics"
            aria-label="Close Lyrics"
          >
            <X size={13} />
          </motion.button>

          <div className="relative z-20 h-full min-h-0 w-full flex-1 overflow-hidden pt-12 pb-[var(--player-height,80px)]">
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