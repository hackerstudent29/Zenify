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

    const isPlaylist = track.isPlaylist || !!(track as any).user; // Playlists have users, tracks/albums usually have artists

    if (isPlaylist) {
        const uniqueCovers: string[] = [];
        
        // 1. From track.covers (homepage formatting)
        if (track.covers && Array.isArray(track.covers)) {
            for (const c of track.covers) {
                if (c && !uniqueCovers.includes(c)) {
                    uniqueCovers.push(c);
                }
            }
        }
        
        // 2. From track.tracks (playlist API formatting)
        if (track.tracks && Array.isArray(track.tracks) && uniqueCovers.length < 4) {
            for (const item of track.tracks) {
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
