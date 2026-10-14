"use client";

import React from "react";
import Link from "next/link";
import { formatDisplayTitle, splitArtistNames } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface ArtistLinksProps {
  track: any;
  className?: string;
  linkClassName?: string;
  onClick?: (e: React.MouseEvent) => void;
  maxArtists?: number;
}

export interface ExtractedArtist {
  id?: string;
  name: string;
}

export function extractTrackArtists(track: any): ExtractedArtist[] {
  if (!track) return [];

  const rawCandidates: Array<{ id?: string; name: string }> = [];

  // 1. Primary artist array (e.g. from JioSaavn/Spotify/API)
  if (Array.isArray(track.artists) && track.artists.length > 0) {
    for (const a of track.artists) {
      if (typeof a === "string" && a.trim()) {
        rawCandidates.push({ name: a.trim() });
      } else if (a && typeof a === "object" && a.name) {
        rawCandidates.push({ id: a.id || a._id, name: a.name.trim() });
      }
    }
  }

  // 2. Primary artist object / string
  if (rawCandidates.length === 0 && track.artist) {
    if (typeof track.artist === "string" && track.artist.trim()) {
      rawCandidates.push({ name: track.artist.trim() });
    } else if (typeof track.artist === "object" && track.artist.name) {
      rawCandidates.push({ id: track.artist.id || track.artist._id, name: track.artist.name.trim() });
    }
  } else if (rawCandidates.length === 0 && track.artistName) {
    rawCandidates.push({ name: track.artistName.trim() });
  }

  // 3. Featured artists
  if (track.featuredArtists) {
    if (Array.isArray(track.featuredArtists)) {
      for (const fa of track.featuredArtists) {
        if (typeof fa === "string" && fa.trim()) {
          rawCandidates.push({ name: fa.trim() });
        } else if (fa && typeof fa === "object" && fa.name) {
          rawCandidates.push({ id: fa.id || fa._id, name: fa.name.trim() });
        }
      }
    } else if (typeof track.featuredArtists === "string") {
      const split = splitArtistNames(track.featuredArtists);
      for (const s of split) {
        if (s) rawCandidates.push({ name: s });
      }
    }
  }

  // 4. Split all candidates on combo delimiters (&, comma, feat, ft, etc.)
  const flattened: ExtractedArtist[] = [];
  for (const item of rawCandidates) {
    const parts = splitArtistNames(item.name);
    if (parts.length <= 1) {
      // Single atomic artist name: preserve ID if available
      flattened.push({ id: item.id, name: parts[0] || item.name });
    } else {
      // Multi-artist combo string: each sub-artist gets their own separate record.
      // Do not reuse the combo ID for sub-artists.
      for (const subName of parts) {
        if (subName.trim()) {
          flattened.push({ name: subName.trim() });
        }
      }
    }
  }

  // Deduplicate case-insensitively and sanitize names
  const seen = new Set<string>();
  const unique: ExtractedArtist[] = [];

  for (const item of flattened) {
    if (!item.name) continue;
    const clean = item.name.replace(/^[,\s/&·•\-–—|]+|[,\s/&·•\-–—|]+$/g, '').trim();
    if (!clean || clean.length < 2 || /^\d+$/.test(clean) || /^itunes\s*artist\s*\d+/i.test(clean)) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push({
        id: item.id,
        name: formatDisplayTitle(clean),
      });
    }
  }

  return unique;
}

export function ArtistLinks({ track, className, linkClassName, onClick, maxArtists }: ArtistLinksProps) {
  const allArtists = extractTrackArtists(track);

  if (allArtists.length === 0) {
    return <span className={cn("text-zinc-400", className)}>Unknown Artist</span>;
  }

  // If maxArtists is specified (e.g. 1-3), display only those top artists without altering underlying metadata
  const artists = (maxArtists && maxArtists > 0) ? allArtists.slice(0, maxArtists) : allArtists;

  return (
    <span className={cn("inline-flex flex-nowrap whitespace-nowrap items-center", className)}>
      {artists.map((artist, idx) => {
        const isLast = idx === artists.length - 1;
        const routeTarget = artist.id ? `/artist/${artist.id}` : `/artist/${encodeURIComponent(artist.name)}`;

        return (
          <React.Fragment key={artist.id || artist.name || idx}>
            <Link
              href={routeTarget}
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
            {!isLast && <span className="opacity-60 select-none mr-1.5">,</span>}
          </React.Fragment>
        );
      })}
    </span>
  );
}
