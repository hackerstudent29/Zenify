"use client";

import { BadgeCheck } from "lucide-react";
import { cn, getMediaUrl, formatDisplayTitle } from "@/lib/utils";

interface StatsForwardAboutProps {
  artist: any;
}

export function StatsForwardAbout({ artist }: StatsForwardAboutProps) {
  if (!artist) return null;

  const imageUrl = artist.imageUrl;
  
  // Format stats nicely
  const formatStat = (num: number) => {
    if (!num) return "0";
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toLocaleString();
  };

  // Aggregate total streams from top tracks as a mock for monthly listeners if not available
  const estimatedListeners = artist.topTracks 
    ? artist.topTracks.reduce((acc: number, t: any) => acc + (t.streams || 0), 0) * 2.5 
    : 1450000; // Mock default if empty

  return (
    <section className="mb-24 mt-8">
      <div className="relative rounded-[2rem] overflow-hidden bg-black shadow-2xl border border-white/[0.05]">
        {/* Background Image Treatment */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/20 z-10" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-transparent z-10" />
          {imageUrl && (
            <img 
              src={getMediaUrl(imageUrl)} 
              className="w-full h-full object-cover opacity-60 saturate-50 blur-[2px]" 
              alt="" 
            />
          )}
        </div>

        <div className="relative z-20 p-8 md:p-12 lg:p-16 flex flex-col justify-end min-h-[400px]">
          {/* Top massive stats */}
          <div className="mb-8 md:mb-12">
            <h2 className="text-[56px] md:text-[80px] font-black text-white leading-none tracking-tighter mb-2">
              {formatStat(estimatedListeners)}
            </h2>
            <p className="text-white/60 font-bold uppercase tracking-widest text-sm md:text-base">
              Monthly Listeners
            </p>
          </div>

          <div className="flex flex-col lg:flex-row gap-8 lg:gap-16 items-start">
            {/* Bio */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-2xl font-bold text-white tracking-tight">About {formatDisplayTitle(artist.name)}</h3>
                {artist.verified && <BadgeCheck size={20} className="text-brand" />}
              </div>
              <p className="text-white/80 text-base md:text-lg leading-relaxed font-medium max-w-3xl">
                {artist.bio || "No biography recorded for this artist yet. Dive into their discography to experience their sonic journey."}
              </p>
            </div>

            {/* Secondary Stats */}
            <div className="shrink-0 flex gap-8 md:gap-12 pt-6 lg:pt-0 lg:border-l border-white/10 lg:pl-16">
              <div className="flex flex-col">
                <p className="text-3xl font-bold text-white mb-1">
                  {formatStat(artist.trackCount || 0)}
                </p>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Total Tracks</p>
              </div>
              
              <div className="flex flex-col">
                <p className="text-3xl font-bold text-white mb-1">
                  {formatStat((estimatedListeners * 0.4))}
                </p>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Followers</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
