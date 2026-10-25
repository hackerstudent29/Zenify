"use client";

import React from "react";
import Link from "next/link";
import { formatDisplayTitle, splitArtistNames, stripHonorifics } from "@/lib/utils";
import { cn } from "@/lib/utils";

export interface ArtistLinksProps {
  track?: any;
  album?: any;
  artists?: any;
  artist?: any;
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
 * Universal artist extractor.
 * Handles tracks, albums, artist objects, and raw delimited strings.
 * Preserves roles when appropriate (Composer, Singer, Lyricist, Featured).
 */
export function extractArtists(source: { track?: any; album?: any; artists?: any; artist?: any } | any): ExtractedArtist[] {
  if (!source) return [];

  const seen = new Set<string>();
  const credits: ExtractedArtist[] = [];

  const addCredit = (name: string, role?: string, id?: string, isMain = false) => {
    if (!name || typeof name !== "string") return;
    const parts = splitArtistNames(name);
    for (const p of parts) {
      const clean = stripHonorifics(p.replace(/^[,s/&·•\-–—|]+|[,s/&·•\-–—|]+$/g, "").trim());
      if (!clean || clean.length < 2 || /^\d+$/.test(clean) || /^itunes\s*artist\s*\d+/i.test(clean)) continue;
      const lower = clean.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        // Assign specific entity ID only if there was exactly 1 artist part and valid ID
        const individualId = parts.length === 1 && id && !id.startsWith("temp-") ? id : undefined;
        credits.push({
          id: individualId,
          name: formatDisplayTitle(clean),
          role,
          isMain,
        });
      }
    }
  };

  // Case A: Explicit artists array passed
  const rawArtistsList = source.artists || (Array.isArray(source) ? source : null);
  if (Array.isArray(rawArtistsList) && rawArtistsList.length > 0) {
    for (const a of rawArtistsList) {
      if (typeof a === "string") {
        addCredit(a, undefined, undefined, true);
      } else if (a && typeof a === "object") {
        addCredit(a.name, a.role || (a.isMain ? undefined : "Featured"), a.id || a._id, a.isMain ?? false);
      }
    }
    if (credits.length > 0) return credits;
  }

  // Case B: Album object passed
  const album = source.album || (source.tracks !== undefined && source.artist !== undefined && !source.audioUrl ? source : null);
  if (album) {
    if (album.artist?.name) {
      addCredit(album.artist.name, undefined, album.artist.id || album.artistId, true);
    } else if (typeof album.artist === "string") {
      addCredit(album.artist, undefined, album.artistId, true);
    } else if (album.artistName) {
      addCredit(album.artistName, undefined, album.artistId, true);
    }

    if (album.musicDirector) {
      addCredit(String(album.musicDirector), "Music Director", undefined, true);
    }
    if (album.composer) {
      addCredit(String(album.composer), "Composer", undefined, true);
    }

    if (Array.isArray(album.artists)) {
      for (const a of album.artists) {
        const name = typeof a === "string" ? a : a?.name;
        const id = typeof a === "object" ? (a?.id || a?._id) : undefined;
        if (name) addCredit(name, undefined, id);
      }
    }

    if (credits.length > 0) return credits;
  }

  // Case C: Single string or artist object passed
  if (typeof source === "string") {
    addCredit(source, undefined, undefined, true);
    if (credits.length > 0) return credits;
  } else if (source.artist && (typeof source.artist === "string" || (typeof source.artist === "object" && source.artist.name && !source.audioUrl && !source.track && !source.title))) {
    const aName = typeof source.artist === "string" ? source.artist : source.artist.name;
    const aId = typeof source.artist === "object" ? (source.artist.id || source.artistId) : source.artistId;
    addCredit(aName, undefined, aId, true);
    if (credits.length > 0) return credits;
  }

  // Case D: Track object passed (either source.track or source itself)
  const track = source.track || source;
  if (track) {
    // Check for explicit normalized artists array with valid IDs
    if (Array.isArray(track.artists) && track.artists.length > 0 && typeof track.artists[0] === "object") {
      for (const a of track.artists) {
        if (a && a.name) {
          addCredit(a.name, a.role || (a.isMain ? undefined : "Featured"), a.id || a._id, a.isMain ?? false);
        }
      }
      if (credits.length > 0) return credits;
    }

    // 1. Composer / Music Director
    const rawComposers =
      track.composers ||
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
      hasComposer = credits.some((c) => c.isMain);
    }
    if (rawBgm) {
      addCredit(String(rawBgm), "BGM", undefined, true);
    }

    // 2. Primary artist from metadata
    let rawPrimary = "";
    let primaryId: string | undefined = undefined;

    if (track.artist) {
      if (typeof track.artist === "string") {
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

    if (!hasComposer && rawPrimary) {
      addCredit(rawPrimary, undefined, primaryId, true);
    }

    // 3. Secondary Artists: Singers
    const rawSingers =
      track.singers ||
      track.more_info?.singers ||
      track.singer ||
      track.vocals ||
      track.sungBy;
    if (rawSingers) {
      addCredit(String(rawSingers), "Singer");
    } else if (hasComposer && rawPrimary) {
      addCredit(rawPrimary, "Singer", primaryId);
    }

    // 4. Secondary Artists: Lyricists
    const rawLyricists =
      track.lyricist ||
      track.lyricists ||
      track.more_info?.lyricist ||
      track.more_info?.lyrics;
    if (rawLyricists) {
      addCredit(String(rawLyricists), "Lyricist");
    }

    // 5. Secondary Artists: Featured
    if (track.featuredArtists) {
      addCredit(String(track.featuredArtists), "Featured");
    }

    // 6. Any other artists in track.artists
    if (Array.isArray(track.artists)) {
      for (const a of track.artists) {
        const name = typeof a === "string" ? a : a?.name;
        const id = typeof a === "object" ? (a?.id || a?._id) : undefined;
        if (name) addCredit(name, "Singer", id);
      }
    }
  }

  if (credits.length === 0) {
    credits.push({ name: "Unknown Artist", isMain: true });
  }

  return credits;
}

export const extractTrackArtists = extractArtists;

export function ArtistLinks({
  track,
  album,
  artists: rawArtistsProp,
  artist: rawArtistProp,
  className,
  linkClassName,
  onClick,
  maxArtists,
  showRoles = true,
}: ArtistLinksProps) {
  const allArtists = extractArtists({ track, album, artists: rawArtistsProp, artist: rawArtistProp });

  if (allArtists.length === 0) {
    return <span className={cn("text-zinc-400", className)}>Unknown Artist</span>;
  }

  const artists = maxArtists && maxArtists > 0 ? allArtists.slice(0, maxArtists) : allArtists;

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1 gap-y-0.5", className)}>
      {artists.map((artist, idx) => {
        const isLast = idx === artists.length - 1;
        const separator = idx === artists.length - 2 ? " & " : ", ";
        const isUnknown = !artist.name || artist.name === "Unknown Artist" || artist.name.toLowerCase() === "unknown";
        const targetHref = artist.id && !artist.id.startsWith("temp-")
          ? `/artist/${artist.id}`
          : `/artist/${encodeURIComponent(artist.name.trim())}`;

        return (
          <React.Fragment key={`${artist.id || artist.name}-${idx}`}>
            <span className="inline-flex items-baseline whitespace-nowrap">
              {!isUnknown ? (
                <Link
                  href={targetHref}
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
                    artist.isMain ? "text-white/90 font-medium" : "text-zinc-400",
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
            {!isLast && <span className="opacity-40 select-none">{separator}</span>}
          </React.Fragment>
        );
      })}
    </span>
  );
}

export default ArtistLinks;
