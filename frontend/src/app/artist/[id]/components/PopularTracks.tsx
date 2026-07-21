"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Music2, Heart, MoreHorizontal } from "lucide-react";
import { cn, getMediaUrl, formatDisplayTitle } from "@/lib/utils";
import { MediaCard } from "@/components/shared/MediaCard";

interface PopularTracksProps {
  tracks: any[];
  currentTrackId?: string;
  isPlaying: boolean;
  likedTrackIds: string[];
  onPlayTrack: (track: any) => void;
  onToggleLike: (trackId: string, e: React.MouseEvent) => void;
  renderDropdown: (track: any) => React.ReactNode;
}

export function PopularTracks({
  tracks,
  renderDropdown
}: PopularTracksProps) {
  const [expanded, setExpanded] = useState(false);
  
  if (!tracks || tracks.length === 0) return null;

  const displayCount = expanded ? tracks.length : Math.min(tracks.length, 5);
  const visibleTracks = tracks.slice(0, displayCount);

  return (
    <section className="mb-16">
      <div className="flex items-center justify-between mb-6 px-2">
        <h2 className="text-2xl font-bold text-white tracking-tight">Popular</h2>
        {tracks.length > 5 && (
          <button 
            onClick={() => setExpanded(!expanded)}
            className="text-[13px] font-bold text-white/60 uppercase tracking-widest hover:text-white transition-colors"
          >
            {expanded ? "Show less" : "See more"}
          </button>
        )}
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-4 md:gap-6">
        <AnimatePresence initial={false}>
          {visibleTracks.map((track, index) => (
            <motion.div
              key={track.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
            >
              <div className="relative group/trackcard">
                <MediaCard 
                  track={track} 
                  index={index} 
                  contextTracks={tracks} 
                />
                <div className="absolute top-2 right-2 opacity-0 group-hover/trackcard:opacity-100 transition-opacity z-50">
                  {renderDropdown(track)}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}
