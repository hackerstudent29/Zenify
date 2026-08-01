"use client";

import React from "react";
import Link from "next/link";
import { formatDisplayTitle } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface ArtistLinksProps {
  track: any;
  className?: string;
  linkClassName?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export interface ExtractedArtist {
  id?: string;
  name: string;
}

export function extractTrackArtists(track: any): ExtractedArtist[] {
  if (!track) return [];

  const list: ExtractedArtist[] = [];

  // 1. Primary artist array (e.g. from JioSaavn/Spotify/API)
  if (Array.isArray(track.artists) && track.artists.length > 0) {
    for (const a of track.artists) {
      if (typeof a === "string" && a.trim()) {
        list.push({ name: a.trim() });
      } else if (a && typeof a === "object" && a.name) {
        list.push({ id: a.id || a._id, name: a.name.trim() });
      }
    }
  }

  // 2. Primary artist object / string
  if (list.length === 0 && track.artist) {
    if (typeof track.artist === "string" && track.artist.trim()) {
      list.push({ name: track.artist.trim() });
    } else if (typeof track.artist === "object" && track.artist.name) {
      list.push({ id: track.artist.id || track.artist._id, name: track.artist.name.trim() });
    }
  } else if (list.length === 0 && track.artistName) {
    list.push({ name: track.artistName.trim() });
  }

  // 3. Featured artists
  if (track.featuredArtists) {
    if (Array.isArray(track.featuredArtists)) {
      for (const fa of track.featuredArtists) {
        if (typeof fa === "string" && fa.trim()) {
          list.push({ name: fa.trim() });
        } else if (fa && typeof fa === "object" && fa.name) {
          list.push({ id: fa.id || fa._id, name: fa.name.trim() });
        }
      }
    } else if (typeof track.featuredArtists === "string") {
      const split = track.featuredArtists.split(",").map((s: string) => s.trim());
      for (const s of split) {
        if (s) list.push({ name: s });
      }
    }
  }

  // Deduplicate case-insensitively
  const seen = new Set<string>();
  const unique: ExtractedArtist[] = [];

  for (const item of list) {
    if (!item.name) continue;
    const key = item.name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push({
        id: item.id,
        name: formatDisplayTitle(item.name),
      });
    }
  }

  return unique;
}

export function ArtistLinks({ track, className, linkClassName, onClick }: ArtistLinksProps) {
  const artists = extractTrackArtists(track);

  if (artists.length === 0) {
    return <span className={cn("text-zinc-400", className)}>Unknown Artist</span>;
  }

  return (
    <span className={cn("inline-flex flex-nowrap whitespace-nowrap items-center gap-x-1", className)}>
      {artists.map((artist, idx) => {
        const isLast = idx === artists.length - 1;

        if (artist.id) {
          return (
            <React.Fragment key={artist.id || idx}>
              <Link
                href={`/artist/${artist.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onClick) onClick(e);
                }}
                className={cn(
                  "hover:underline hover:text-white transition-colors cursor-pointer inline-block",
                  linkClassName
                )}
              >
                {artist.name}
              </Link>
              {!isLast && <span className="opacity-60 select-none">,</span>}
            </React.Fragment>
          );
        }

        return (
          <React.Fragment key={idx}>
            <span className={linkClassName}>{artist.name}</span>
            {!isLast && <span className="opacity-60 select-none">,</span>}
          </React.Fragment>
        );
      })}
    </span>
  );
}
