"use client";

import React from "react";
import { Music } from "lucide-react";
import { cn, getMediaUrl, getTrackCover } from "@/lib/utils";

export function UniversalMediaCover({ track, className }: { track: any; className?: string }) {
 if (!track) {
 return (
 <div className={cn("w-full h-full flex items-center justify-center bg-zinc-800 text-white/10", className)}>
 <Music size={40} />
 </div>
 );
 }

 if (track.coverUrl && track.coverUrl.startsWith("gradient:")) {
 const gradientName = track.coverUrl.replace("gradient:", "");
 const gradientMap: Record<string, string> = {
 mist: "linear-gradient(to bottom right, #e2e8f0, #94a3b8)",
 rose: "linear-gradient(to bottom right, #fecdd3, #fda4af)",
 ocean: "linear-gradient(to bottom right, #bae6fd, #7dd3fc)",
 dusk: "linear-gradient(to bottom right, #c7d2fe, #a5b4fc)",
 sunset: "linear-gradient(to bottom right, #fed7aa, #fdba74)",
 midnight: "linear-gradient(to bottom right, #1e293b, #0f172a)"
 };
 const background = gradientMap[gradientName] || gradientMap.mist;
 return (
 <div className={cn("w-full h-full flex items-center justify-center shadow-inner", className)} style={{ background }}>
 <Music size={40} className="text-black/20" />
 </div>
 );
 }

 if (track.coverUrl) {
 return (
 <img 
 src={getMediaUrl(track.coverUrl, 'image') || '/logo.png'} 
 alt={track.title || track.name || ""} 
 className={cn("w-full h-full object-cover", className)} 
 />
 );
 }

 const isPlaylist = track.isPlaylist || !!(track as any).user; // Playlists have users, tracks/albums usually have artists

 if (isPlaylist) {
 const uniqueCovers: string[] = [];
 
 // 1. From track.covers (homepage formatting)
 if (track.covers && Array.isArray(track.covers)) {
 for (let i = track.covers.length - 1; i >= 0; i--) {
 const c = track.covers[i];
 if (c && !uniqueCovers.includes(c)) {
 uniqueCovers.push(c);
 }
 }
 }
 
 // 2. From track.tracks (playlist API formatting)
 if (track.tracks && Array.isArray(track.tracks) && uniqueCovers.length < 4) {
 for (let i = track.tracks.length - 1; i >= 0; i--) {
 const item = track.tracks[i];
 const cover = item.track?.coverUrl;
 if (cover && !uniqueCovers.includes(cover)) {
 uniqueCovers.push(cover);
 if (uniqueCovers.length === 4) break;
 }
 }
 }

 if (uniqueCovers.length >= 4) {
 return (
 <div className={cn("w-full h-full grid grid-cols-2 grid-rows-2", className)}>
 {uniqueCovers.slice(0, 4).map((cover, i) => (
 <img 
 key={i} 
 src={getMediaUrl(cover) || '/logo.png'} 
 alt="" 
 className="w-full h-full object-cover" 
 />
 ))}
 </div>
 );
 } else if (uniqueCovers.length > 0) {
 return (
 <img 
 src={getMediaUrl(uniqueCovers[0]) || '/logo.png'} 
 alt="" 
 className={cn("w-full h-full object-cover", className)} 
 />
 );
 } else {
 return (
 <div className={cn("w-full h-full flex items-center justify-center bg-zinc-800 text-white/10", className)}>
 <Music size={40} />
 </div>
 );
 }
 }

 return (
 <img
 src={getTrackCover(track)}
 alt={track.title || ""}
 className={cn("w-full h-full object-cover", className)}
 />
 );
}
