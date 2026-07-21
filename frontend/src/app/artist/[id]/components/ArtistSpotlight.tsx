"use client";

import { Play, Sparkles } from "lucide-react";
import { cn, getMediaUrl, formatDisplayTitle } from "@/lib/utils";
import { motion } from "framer-motion";

interface ArtistSpotlightProps {
  artist: any;
  onPlay: (track: any) => void;
}

export function ArtistSpotlight({ artist, onPlay }: ArtistSpotlightProps) {
  // Use the top track as the spotlight if there isn't an explicit one
  if (!artist?.topTracks || artist.topTracks.length === 0) return null;

  const spotlightTrack = artist.topTracks[0];
  const cover = spotlightTrack.coverUrl || spotlightTrack.album?.coverUrl || artist.imageUrl;

  return (
    <section className="mb-16">
      <h2 className="text-2xl font-bold text-white tracking-tight mb-6 px-2">Artist Pick</h2>
      
      <div 
        className="group flex items-center gap-4 sm:gap-5 p-3 sm:p-4 rounded-2xl hover:bg-white/[0.04] transition-all cursor-pointer max-w-3xl"
        onClick={() => onPlay(spotlightTrack)}
      >
        <div className="relative shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden shadow-lg border border-white/5">
          {cover ? (
            <img src={getMediaUrl(cover)} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt="" />
          ) : (
            <div className="w-full h-full bg-zinc-800" />
          )}
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm">
            <Play size={24} className="fill-white text-white ml-1" />
          </div>
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles size={12} className="text-brand" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand">Artist Pick</span>
          </div>
          <h3 className="text-xl font-bold text-white mb-1 truncate group-hover:text-white transition-colors">
            {formatDisplayTitle(spotlightTrack.title)}
          </h3>
          <p className="text-white/50 text-[13px] sm:text-sm line-clamp-1">
            Dive into the signature sound that fans are listening to right now.
          </p>
        </div>
      </div>
    </section>
  );
}
