"use client";

import React from "react";
import Link from "next/link";
import { formatDisplayTitle, splitArtistNames, stripHonorifics } from "@/lib/utils";
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
 * Normalizes multi-artist compound strings into separate canonical entities.
 */
export function extractTrackArtists(track: any): ExtractedArtist[] {
  if (!track) return [];

  const seen = new Set<string>();
  const credits: ExtractedArtist[] = [];

  const addCredit = (name: string, role?: string, id?: string, isMain = false) => {
    if (!name) return;
    const parts = splitArtistNames(name);
    for (const p of parts) {
      const clean = stripHonorifics(p.replace(/^[,s/&·•\-–—|]+|[,s/&·•\-–—|]+$/g, '').trim());
      if (!clean || clean.length < 2 || /^\d+$/.test(clean) || /^itunes\s*artist\s*\d+/i.test(clean)) continue;
      const lower = clean.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        // Only assign specific entity ID if there was exactly 1 artist part;
        // if this was a combined artist string (e.g. "Anirudh Ravichander & Arivu"),
        // do not assign the joint group ID to the individual split artists.
        const individualId = parts.length === 1 && id && !id.startsWith('temp-') ? id : undefined;
        credits.push({
          id: individualId,
          name: formatDisplayTitle(clean),
          role,
          isMain
        });
      }
    }
  };

  // If track already has an explicit normalized artists array with valid IDs, use directly
  if (Array.isArray(track.artists) && track.artists.length > 0 && typeof track.artists[0] === 'object') {
    for (const a of track.artists) {
      if (a && a.name) {
        addCredit(a.name, a.role || (a.isMain ? undefined : "Featured"), a.id || a._id, a.isMain ?? false);
      }
    }
    if (credits.length > 0) return credits;
  }

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

  // 2. Primary artist from metadata
  let rawPrimary = "";
  let primaryId: string | undefined = undefined;

  if (track.artist) {
    if (typeof track.artist === 'string') {
      rawPrimary = track.artist;
    } else if (track.artist.name) {
      rawPrimary = track.artist.name;
      primaryId = track.artist.id || track.artist._id;
    }
  } else if (track.artistName) {
    rawPrimary = track.artistName;
    primaryId = track.artistId;
  } else if (track.primaryArtists) {
    rawPrimary = track.primaryArtists;
  } else if (track.album?.artist?.name) {
    rawPrimary = track.album.artist.name;
    primaryId = track.album.artist.id;
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
    <span className={cn("inline-flex flex-wrap items-center gap-x-1 gap-y-0.5", className)}>
      {artists.map((artist, idx) => {
        const isLast = idx === artists.length - 1;
        const separator = idx === artists.length - 2 ? " & " : ", ";

        return (
          <React.Fragment key={`${track?.id || 'track'}-${artist.id || artist.name}-${idx}`}>
            <span className="inline-flex items-baseline whitespace-nowrap">
              {artist.id ? (
                <Link
                  href={`/artist/${artist.id}`}
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
              ) : (
                <span
                  className={cn(
                    "inline-block",
                    artist.isMain 
                      ? "text-white/90 font-medium" 
                      : "text-zinc-400",
                    linkClassName
                  )}
                >
                  {artist.name}
                </span>
              )}
              {showRoles && artist.role && (
                <span className="text-[10px] text-white/40 ml-1 font-normal select-none">
                  ({artist.role})
                </span>
              )}
            </span>
            {!isLast && <span className="text-white/30 select-none">{separator}</span>}
          </React.Fragment>
        );
      })}
    </span>
  );
}

export default ArtistLinks;
