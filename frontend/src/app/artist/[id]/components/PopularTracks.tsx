"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MediaCard } from "@/components/shared/MediaCard";
import { TrackItem } from "@/components/track-item";

interface PopularTracksProps {
  tracks: any[];
  currentTrackId?: string;
  isPlaying?: boolean;
  likedTrackIds?: string[];
  onPlayTrack?: (track: any) => void;
  onToggleLike?: (trackId: string, e: React.MouseEvent) => void;
  renderDropdown?: (track: any) => React.ReactNode;
}

export function PopularTracks({
  tracks,
  renderDropdown
}: PopularTracksProps) {
  const [expanded, setExpanded] = useState(false);
  
  if (!tracks || tracks.length === 0) return null;

  const top5Tracks = tracks.slice(0, 5);

  return (
    <section className="mb-16">
      <div className="flex items-center justify-between mb-6 px-2">
        <h2 className="text-2xl font-bold text-white tracking-tight font-brand">Popular</h2>
        {tracks.length > 5 && (
          <button 
            onClick={() => setExpanded(!expanded)}
            className="text-[12px] font-bold text-white/60 uppercase tracking-widest hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-4 py-1.5 rounded-full border border-white/10"
          >
            {expanded ? "Show less" : "See more"}
          </button>
        )}
      </div>
      
      <AnimatePresence mode="wait">
        {!expanded ? (
          <motion.div
            key="grid-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-4 md:gap-6"
          >
            {top5Tracks.map((track, index) => (
              <div key={track.id} className="relative group/trackcard">
                <MediaCard 
                  track={track} 
                  index={index} 
                  contextTracks={tracks} 
                />
                {renderDropdown && (
                  <div className="absolute top-2 right-2 opacity-0 group-hover/trackcard:opacity-100 transition-opacity z-50">
                    {renderDropdown(track)}
                  </div>
                )}
              </div>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="list-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-1.5 bg-zinc-950/40 p-3 md:p-4 rounded-2xl border border-white/5 backdrop-blur-xl"
          >
            {tracks.map((track, index) => (
              <TrackItem
                key={track.id}
                track={track}
                index={index}
                contextTracks={tracks}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

