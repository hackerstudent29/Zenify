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
  showRoles?: boolean;
}

export interface ExtractedArtist {
  id?: string;
  name: string;
  role?: string;
  isMain?: boolean;
}

/**
 * Extracts artists with composer / music director as primary prominent credit,
 * followed by secondary artists (singers, lyricists, featured) labeled with their roles.
 */
export function extractTrackArtists(track: any): ExtractedArtist[] {
  if (!track) return [];

  const seen = new Set<string>();
  const credits: ExtractedArtist[] = [];

  const addCredit = (name: string, role?: string, id?: string, isMain = false) => {
    if (!name) return;
    const parts = splitArtistNames(name);
    for (const p of parts) {
      const clean = p.replace(/^[,s/&·•\-–—|]+|[,s/&·•\-–—|]+$/g, '').trim();
      if (!clean || clean.length < 2 || /^\d+$/.test(clean) || /^itunes\s*artist\s*\d+/i.test(clean)) continue;
      const lower = clean.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        credits.push({
          id,
          name: formatDisplayTitle(clean),
          role,
          isMain
        });
      }
    }
  };

  // 1. Check for Composer / Music Director / Primary Music Creator
  const rawComposers = track.composers || 
                       track.music || 
                       track.musicDirector || 
                       track.more_info?.music || 
                       track.more_info?.composer || 
                       track.album?.musicDirector || 
                       track.album?.composer;

  const rawBgm = track.bgmComposer || track.bgm || track.more_info?.bgm;

  let hasComposer = false;
  if (rawComposers) {
    addCredit(String(rawComposers), undefined, undefined, true);
    hasComposer = credits.some(c => c.isMain);
  }

  if (rawBgm) {
    addCredit(String(rawBgm), "BGM", undefined, true);
  }

  // 2. Fall back to primary artist if composer data is missing
  let rawPrimary = "";
  let primaryId: string | undefined = undefined;

  if (Array.isArray(track.artists) && track.artists.length > 0) {
    const first = track.artists[0];
    if (typeof first === 'string') rawPrimary = first;
    else if (first && first.name) {
      rawPrimary = first.name;
      primaryId = first.id || first._id;
    }
  } else if (track.artist) {
    if (typeof track.artist === 'string') rawPrimary = track.artist;
    else if (track.artist.name) {
      rawPrimary = track.artist.name;
      primaryId = track.artist.id || track.artist._id;
    }
  } else if (track.artistName) {
    rawPrimary = track.artistName;
  } else if (track.primaryArtists) {
    rawPrimary = track.primaryArtists;
  } else if (track.album?.artist?.name) {
    rawPrimary = track.album.artist.name;
  }

  if (!hasComposer) {
    // Primary artist takes the main role when no composer is recorded
    if (rawPrimary) {
      addCredit(rawPrimary, undefined, primaryId, true);
    }
  }

  // 3. Secondary Artists: Singers
  const rawSingers = track.singers || 
                     track.more_info?.singers || 
                     track.singer || 
                     track.vocals || 
                     track.sungBy;
  if (rawSingers) {
    addCredit(String(rawSingers), "Singer");
  } else if (hasComposer && rawPrimary) {
    // When composer is main, the primary artist listed on metadata is usually the lead singer
    addCredit(rawPrimary, "Singer", primaryId);
  }

  // 4. Secondary Artists: Lyricists
  const rawLyricists = track.lyricist || 
                       track.lyricists || 
                       track.more_info?.lyricist || 
                       track.more_info?.lyrics;
  if (rawLyricists) {
    addCredit(String(rawLyricists), "Lyricist");
  }

  // 5. Secondary Artists: Featured / Collaborators
  if (track.featuredArtists) {
    addCredit(String(track.featuredArtists), "Featured");
  }

  // 6. Any other artists in track.artists array not yet captured
  if (Array.isArray(track.artists)) {
    for (const a of track.artists) {
      const name = typeof a === 'string' ? a : a?.name;
      const id = typeof a === 'object' ? (a?.id || a?._id) : undefined;
      if (name) addCredit(name, "Singer", id);
    }
  }

  // Final fallback to ensure no blanks
  if (credits.length === 0) {
    credits.push({ name: "Unknown Artist", isMain: true });
  }

  return credits;
}

export function ArtistLinks({ 
  track, 
  className, 
  linkClassName, 
  onClick, 
  maxArtists, 
  showRoles = true 
}: ArtistLinksProps) {
  const allArtists = extractTrackArtists(track);

  if (allArtists.length === 0) {
    return <span className={cn("text-zinc-400", className)}>Unknown Artist</span>;
  }

  const artists = (maxArtists && maxArtists > 0) ? allArtists.slice(0, maxArtists) : allArtists;

  return (
    <span className={cn("inline-flex flex-nowrap whitespace-nowrap items-center gap-1.5", className)}>
      {artists.map((artist, idx) => {
        const isLast = idx === artists.length - 1;
        const routeTarget = artist.id ? `/artist/${artist.id}` : `/artist/${encodeURIComponent(artist.name)}`;

        return (
          <React.Fragment key={artist.id || artist.name || idx}>
            <span className="inline-flex items-baseline">
              <Link
                href={routeTarget}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onClick) onClick(e);
                }}
                className={cn(
                  "hover:underline transition-colors cursor-pointer inline-block",
                  artist.isMain 
                    ? "text-white/90 font-medium hover:text-white" 
                    : "text-zinc-400 hover:text-zinc-200",
                  linkClassName
                )}
              >
                {artist.name}
              </Link>
              {showRoles && artist.role && (
                <span className="text-[10px] text-white/40 ml-1 font-normal select-none">
                  ({artist.role})
                </span>
              )}
            </span>
            {!isLast && <span className="text-white/30 select-none">•</span>}
          </React.Fragment>
        );
      })}
    </span>
  );
}
