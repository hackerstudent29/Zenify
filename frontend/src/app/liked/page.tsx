"use client";

/**
 * LikedSongsPage — Apple Music playlist layout for Liked Songs & Library Favorites
 *
 * Reuses canonical components:
 *   • MediaActionButtons (Play / Shuffle / Add Music)
 *   • JioSaavnSongTable (Editorial songs table with Recently Added / Newest / A-Z sorting)
 *   • JioSaavnCardSection + MediaCard (Horizontal full-bleed snap carousels for Albums and Artists)
 *   • MediaCard (Optional Card/Grid view for Songs)
 *   • AddMusicToLikedModal (Search and add songs/music to favorites)
 *   • DynamicBackground (Artwork ambient glow with --rp-w & --sb-w support)
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Plus, ChevronLeft, ChevronRight, ListMusic, LayoutGrid } from "lucide-react";
import { SwiftUIHeart } from "@/components/ui/SwiftUIIcons";
import { DynamicBackground } from "@/components/shared/DynamicBackground";
import { SEO } from "@/components/shared/SEO";
import { MediaActionButtons } from "@/components/shared/MediaActionButtons";
import { JioSaavnSongTable } from "@/app/artist/[id]/components/JioSaavnSongTable";
import { JioSaavnCardSection } from "@/app/artist/[id]/components/JioSaavnCardSection";
import { MediaCard } from "@/components/shared/MediaCard";
import { AddMusicToLikedModal } from "@/components/shared/AddMusicToLikedModal";
import api from "@/lib/api";
import { Track, usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/authStore";
import { cn, getMediaUrl } from "@/lib/utils";
import { applyArtworkTheme, resetArtworkTheme, extractArtworkAverageColor } from "@/lib/theme";

const shuffleArray = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export default function LikedSongsPage() {
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const { user, isAuthenticated } = useAuthStore();
  const { showToast, setPlayerMinimized } = useUIStore();
  const { currentTrack, isPlaying, togglePlay, setTrack, setQueue, isShuffled, toggleShuffle } = usePlayerStore();

  /* ─── Data: Liked Tracks, User Albums, Overview ─── */
  const { data: likedTracks = [], isLoading: isLoadingTracks } = useQuery<Track[]>({
    queryKey: ["liked-tracks"],
    queryFn: async () => {
      const res = await api.get("tracks/liked");
      const arr = Array.isArray(res.data) ? res.data : res.data?.items || [];
      return arr as Track[];
    },
    enabled: isAuthenticated,
  });

  const { data: userAlbums = [] } = useQuery({
    queryKey: ["my-albums"],
    queryFn: async () => {
      const res = await api.get("albums");
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: isAuthenticated,
  });

  const { data: overview } = useQuery({
    queryKey: ["library-overview"],
    queryFn: async () => {
      const res = await api.get("analytics/library-overview");
      return res.data;
    },
    enabled: isAuthenticated,
  });

  /* ─── Liked Albums: Derived from user albums & liked tracks ─── */
  const likedAlbums = useMemo(() => {
    const map = new Map<string, any>();
    const seenIds = new Set<string>();
    const seenTitles = new Set<string>();

    const isUnknownAlbum = (title?: string) => {
      const t = (title || "").trim().toLowerCase();
      return !t || t === "unknown" || t === "unknown album";
    };

    for (const alb of userAlbums || []) {
      const albId = alb?.id;
      const title = (alb?.title || "").trim();
      const normTitle = title.toLowerCase();
      if (albId && !isUnknownAlbum(title) && !seenIds.has(albId) && !seenTitles.has(normTitle)) {
        seenIds.add(albId);
        seenTitles.add(normTitle);
        map.set(albId, {
          id: albId,
          title: alb.title,
          name: alb.title,
          coverUrl: alb.coverUrl,
          artwork: alb.coverUrl,
          artist: alb.artist || { name: alb.artistName || "Unknown Artist" },
          subtitle: alb.artist?.name || alb.artistName || "Album",
          trackCount: alb._count?.tracks || alb.tracks?.length || 0,
          isAlbum: true,
          type: "album",
        });
      }
    }

    for (const t of likedTracks || []) {
      const alb = t.album;
      const albId = alb?.id || t.albumId;
      const title = (alb?.title || (t as any).albumTitle || "").trim();
      const normTitle = title.toLowerCase();
      if (albId && !isUnknownAlbum(title)) {
        if (!seenIds.has(albId) && !seenTitles.has(normTitle)) {
          seenIds.add(albId);
          seenTitles.add(normTitle);
          map.set(albId, {
            id: albId,
            title: title,
            name: title,
            coverUrl: alb?.coverUrl || t.coverUrl,
            artwork: alb?.coverUrl || t.coverUrl,
            artist: (alb as any)?.artist || t.artist || { name: (t as any).artistName || "Unknown Artist" },
            subtitle: (alb as any)?.artist?.name || t.artist?.name || (t as any).artistName || "Album",
            trackCount: 1,
            isAlbum: true,
            type: "album",
          });
        } else {
          const existing = map.get(albId);
          if (existing) {
            if (!existing.coverUrl && t.coverUrl) {
              existing.coverUrl = t.coverUrl;
              existing.artwork = t.coverUrl;
            }
            existing.trackCount += 1;
          }
        }
      }
    }

    return Array.from(map.values());
  }, [likedTracks, userAlbums]);

  /* ─── Liked Artists: Derived from top artists & liked tracks ─── */
  const likedArtists = useMemo(() => {
    const map = new Map<string, any>();
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();

    const isUnknownArtist = (name?: string, id?: string) => {
      const n = (name || "").toLowerCase().trim();
      const i = (id || "").toLowerCase().trim();
      return (
        !n ||
        n === "unknown" ||
        n === "unknown artist" ||
        n === "various artists" ||
        i === "artist-unknown-artist" ||
        i === "unknown" ||
        i === "unknown-artist"
      );
    };

    for (const art of overview?.topArtists || []) {
      const name = (art?.name || "").trim();
      const id = art?.id || `artist-${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
      const normName = name.toLowerCase();

      if (!isUnknownArtist(name, id) && !seenIds.has(id) && !seenNames.has(normName)) {
        seenIds.add(id);
        seenNames.add(normName);
        map.set(id, {
          id: id,
          name: name,
          title: name,
          imageUrl: art.imageUrl || art.avatarUrl,
          coverUrl: art.imageUrl || art.avatarUrl,
          avatarUrl: art.imageUrl || art.avatarUrl,
          artwork: art.imageUrl || art.avatarUrl,
          songCount: art.count || 0,
          isArtist: true,
          type: "artist",
        });
      }
    }

    for (const t of likedTracks || []) {
      const art = t.artist;
      const artId = art?.id || t.artistId;
      const artName = (art?.name || (t as any).artistName || "").trim();
      const normName = artName.toLowerCase();
      const computedId = artId || (artName ? `artist-${normName.replace(/[^a-z0-9]/g, "-")}` : "");

      if (!isUnknownArtist(artName, computedId)) {
        if (!seenIds.has(computedId) && !seenNames.has(normName)) {
          seenIds.add(computedId);
          seenNames.add(normName);
          const img = (art as any)?.imageUrl || (art as any)?.image || (t as any).artistImageUrl || t.coverUrl;
          map.set(computedId, {
            id: computedId,
            name: artName,
            title: artName,
            imageUrl: img,
            coverUrl: img,
            avatarUrl: img,
            artwork: img,
            songCount: 1,
            isArtist: true,
            type: "artist",
          });
        } else {
          const existing = map.get(computedId) || (Array.from(map.values()).find((a: any) => a.name.toLowerCase() === normName));
          if (existing) {
            if (!existing.imageUrl && t.coverUrl) {
              existing.imageUrl = t.coverUrl;
              existing.coverUrl = t.coverUrl;
              existing.avatarUrl = t.coverUrl;
              existing.artwork = t.coverUrl;
            }
            existing.songCount += 1;
          }
        }
      }
    }

    return Array.from(map.values());
  }, [likedTracks, overview?.topArtists]);

  /* ─── In-Page Search: Strictly filters ONLY the user's liked items ─── */
  const filteredTracks = useMemo(() => {
    let list = [...likedTracks];
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      list = list.filter((t) => {
        const titleMatch = (t.title || "").toLowerCase().includes(q);
        const artistMatch = (t.artist?.name || (t as any).artistName || "").toLowerCase().includes(q);
        const albumMatch = (t.album?.title || (t as any).albumTitle || "").toLowerCase().includes(q);
        return titleMatch || artistMatch || albumMatch;
      });
    }
    return list;
  }, [likedTracks, searchQuery]);

  const filteredAlbums = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return likedAlbums;
    return likedAlbums.filter(
      (a) =>
        (a.title || a.name || "").toLowerCase().includes(q) ||
        (a.artist?.name || "").toLowerCase().includes(q)
    );
  }, [likedAlbums, searchQuery]);

  const filteredArtists = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return likedArtists;
    return likedArtists.filter((a) => (a.name || a.title || "").toLowerCase().includes(q));
  }, [likedArtists, searchQuery]);

  /* ─── Playback state ─── */
  const isLikedActive = useMemo(() => {
    if (!currentTrack || !likedTracks.length) return false;
    return likedTracks.some((t) => t.id === currentTrack.id);
  }, [currentTrack, likedTracks]);
  const isLikedCurrentlyPlaying = isLikedActive && isPlaying;

  const handlePlayAll = () => {
    if (!likedTracks.length) {
      showToast("No liked songs to play", "error");
      return;
    }
    if (isLikedActive) {
      togglePlay();
    } else {
      setQueue(likedTracks);
      setTrack(likedTracks[0], likedTracks);
      setPlayerMinimized(false);
    }
  };

  const handleShufflePlay = () => {
    if (!likedTracks.length) {
      showToast("No liked songs to shuffle", "error");
      return;
    }
    if (isLikedActive) {
      toggleShuffle();
    } else {
      const shuffled = shuffleArray(likedTracks);
      setQueue(shuffled);
      setTrack(shuffled[0], shuffled);
      setPlayerMinimized(false);
      if (!isShuffled) toggleShuffle();
    }
  };

  const playCtx = useRef({ currentId: currentTrack?.id, list: filteredTracks });
  playCtx.current = { currentId: currentTrack?.id, list: filteredTracks };
  const handlePlayRow = useCallback(
    (t: Track) => {
      const { currentId, list } = playCtx.current;
      if (currentId === t.id) {
        togglePlay();
      } else {
        setQueue(list);
        setTrack(t, list);
        setPlayerMinimized(false);
      }
    },
    [togglePlay, setQueue, setTrack, setPlayerMinimized]
  );

  /* ─── Ambient dynamic glow ─── */
  const heroCover = likedTracks[0]?.coverUrl || null;
  useEffect(() => {
    if (!heroCover) return;
    let cancelled = false;
    extractArtworkAverageColor(heroCover).then((rgb) => {
      if (!cancelled && rgb) applyArtworkTheme(rgb[0], rgb[1], rgb[2]);
    });
    return () => {
      cancelled = true;
    };
  }, [heroCover]);
  useEffect(() => {
    return () => resetArtworkTheme();
  }, []);

  /* ─── Duration calculation ─── */
  const totalSec = useMemo(
    () => likedTracks.reduce((sum, t) => sum + (t.duration || 0), 0),
    [likedTracks]
  );
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const minsShown = hrs === 0 ? Math.max(mins, likedTracks.length ? 1 : 0) : mins;
  const durationShort = hrs > 0 ? `${hrs} hr ${mins} min` : `${minsShown} min`;

  const ownerName = user?.name || user?.username || "Your Library";
  const hasQuery = searchQuery.trim().length > 0;

  return (
    <div className="relative min-h-screen w-full bg-transparent text-white pb-32">
      <SEO
        title="Liked Songs – Zenify"
        description="Listen to your favorite liked songs, saved albums, and followed artists on Zenify."
        path="/liked"
        noindex={true}
      />

      {/* ── Ambient artwork background (with panel transitions) ── */}
      <div
        className="am-layout-transition pointer-events-none absolute inset-0 z-0 select-none overflow-hidden"
        style={{
          marginLeft: "calc(var(--sb-w) * -1)",
          marginRight: "calc(var(--rp-w) * -1)",
          width: "calc(100% + var(--sb-w) + var(--rp-w))",
        }}
      >
        <DynamicBackground surface="albumPage" coverUrl={heroCover} />
      </div>

      {/* ── Page Container with clear top padding to never hide behind header bar ── */}
      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 pb-12 pt-24 sm:px-8 sm:pt-28 md:px-12 md:pt-32 min-w-0">
        {/* Navigation Arrows (Back / Forward) */}
        <div className="flex items-center justify-end w-full mb-4">
          <div className="inline-flex items-center bg-black/30 border border-white/10 rounded-full p-1 gap-1">
            <button
              onClick={() => router.back()}
              className="p-1.5 text-white/60 hover:text-white transition-colors rounded-full hover:bg-white/10 cursor-pointer"
              title="Back"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => router.forward()}
              className="p-1.5 text-white/60 hover:text-white transition-colors rounded-full hover:bg-white/10 cursor-pointer"
              title="Forward"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* ── 1. Hero Header (Apple Music Layout) ── */}
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 sm:gap-8 lg:gap-10 mb-10 md:mb-12 w-full min-w-0 max-w-full">
          {/* Square Artwork with Heart Emblem */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="w-[min(260px,70vw)] sm:w-[280px] md:w-[280px] lg:w-[310px] aspect-square shrink-0 rounded-2xl shadow-2xl overflow-hidden bg-gradient-to-br from-[#9E2339] via-[#861E30] to-[#18181B] border border-white/10 relative flex items-center justify-center"
          >
            {heroCover ? (
              <>
                <img
                  src={getMediaUrl(heroCover) || "/logo.png"}
                  alt="Liked Songs Cover"
                  className="size-full select-none object-cover"
                  decoding="async"
                  fetchPriority="high"
                />
                <span className="absolute bottom-3 left-3 flex size-10 items-center justify-center rounded-full border border-white/20 bg-black/60 backdrop-blur-xl">
                  <SwiftUIHeart size={18} filled={true} className="text-brand" />
                </span>
              </>
            ) : (
              <span className="flex size-20 items-center justify-center rounded-full border border-white/15 bg-white/10 backdrop-blur-md">
                <SwiftUIHeart size={38} filled={true} className="text-white drop-shadow-md" />
              </span>
            )}
          </motion.div>

          {/* Hero Meta & Actions */}
          <div className="flex flex-col flex-1 min-w-0 w-full text-center md:text-left justify-start overflow-hidden">
            <p className="text-[12px] font-bold uppercase tracking-wider text-brand mb-1">
              Playlist Collection
            </p>

            <h1 className="text-[28px] sm:text-[34px] md:text-[42px] font-black text-white tracking-[-0.025em] leading-tight mb-2">
              Liked Songs
            </h1>

            <div className="text-[13px] sm:text-[14px] font-medium text-white/60 mb-2 flex items-center justify-center md:justify-start gap-2 flex-wrap">
              <span className="text-white font-semibold">{ownerName}</span>
              <span>·</span>
              <span>{likedTracks.length} {likedTracks.length === 1 ? "song" : "songs"}</span>
              {totalSec > 0 && (
                <>
                  <span>·</span>
                  <span>{durationShort}</span>
                </>
              )}
              <span>·</span>
              <span className="text-white/80 font-semibold">Lossless</span>
            </div>

            <p className="text-[13px] text-white/50 max-w-2xl mb-5 leading-relaxed">
              Your favorite tracks, saved albums, and followed artists in one personalized high-fidelity collection.
            </p>

            {/* Apple Music Hero Action Buttons (Reused MediaActionButtons + Add Music) */}
            <div className="flex items-center justify-center md:justify-start">
              <MediaActionButtons
                track={{ id: "liked-songs", title: "Liked Songs" }}
                context="playlist"
                isPlaying={isLikedCurrentlyPlaying}
                onPlay={handlePlayAll}
                isShuffled={isLikedActive && isShuffled}
                onShuffle={handleShufflePlay}
                isLiked={false}
                extraAction={
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(true)}
                    className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-white/10 px-4 text-[13px] font-semibold text-white outline-none transition-colors duration-150 hover:bg-white/[0.18] hover:text-white"
                  >
                    <Plus size={15} strokeWidth={2.5} />
                    <span>Add Music</span>
                  </button>
                }
              />
            </div>
          </div>
        </div>

        {/* ── 2. In-Page Search & View Filter Bar ── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6">
          {/* Search box strictly filtering liked items */}
          <div className="relative flex-1 max-w-md">
            <Search className="size-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in liked songs, albums, and artists..."
              className="w-full h-10 rounded-full bg-white/[0.07] border border-white/10 pl-10 pr-9 text-[13px] text-white placeholder-white/40 outline-none backdrop-blur-md focus:border-white/25 focus:bg-white/[0.12] transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-0.5 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* List vs Grid View Mode Toggle */}
          <div className="flex items-center justify-end gap-1 bg-white/[0.06] p-1 rounded-xl border border-white/10 shrink-0 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              title="List View"
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors cursor-pointer",
                viewMode === "list" ? "bg-white/20 text-white shadow-sm" : "text-white/50 hover:text-white"
              )}
            >
              <ListMusic size={15} />
              <span>List</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              title="Card Grid View"
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors cursor-pointer",
                viewMode === "grid" ? "bg-white/20 text-white shadow-sm" : "text-white/50 hover:text-white"
              )}
            >
              <LayoutGrid size={15} />
              <span>Cards</span>
            </button>
          </div>
        </div>

        {/* ── 3. Songs Section ── */}
        <section className="mb-12 w-full min-w-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[22px] font-bold tracking-[-0.02em] text-white">Songs</h2>
            {filteredTracks.length > 0 && (
              <span className="text-[12px] text-white/40 font-medium">
                {filteredTracks.length} {filteredTracks.length === 1 ? "track" : "tracks"}
              </span>
            )}
          </div>

          {viewMode === "list" ? (
            <JioSaavnSongTable
              tracks={filteredTracks}
              currentTrackId={currentTrack?.id}
              isPlaying={isPlaying}
              onPlayTrack={handlePlayRow}
              showArtist={true}
              tabs={[
                { key: "recent", label: "Recently Added" },
                { key: "newest", label: "Newest" },
                { key: "az", label: "A–Z" },
              ]}
              defaultSort="recent"
              pageSize={30}
              emptyMessage={
                hasQuery
                  ? `No liked songs matching "${searchQuery}".`
                  : "No liked songs yet. Click '+ Add Music' to add your favorites."
              }
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
              {filteredTracks.map((track, idx) => (
                <MediaCard
                  key={`liked-song-${track.id || idx}-${idx}`}
                  track={track}
                  index={idx}
                  contextTracks={filteredTracks}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── 4. Albums Carousel (Reusing JioSaavnCardSection & MediaCard) ── */}
        {filteredAlbums.length > 0 && (
          <section className="mb-8 w-full min-w-0">
            <JioSaavnCardSection
              title="Albums"
              items={filteredAlbums}
            />
          </section>
        )}

        {/* ── 5. Artists Carousel (Reusing JioSaavnCardSection & MediaCard) ── */}
        {filteredArtists.length > 0 && (
          <section className="mb-8 w-full min-w-0">
            <JioSaavnCardSection
              title="Artists"
              items={filteredArtists}
            />
          </section>
        )}

        {/* Empty Search Result Feedback */}
        {hasQuery &&
          filteredTracks.length === 0 &&
          filteredAlbums.length === 0 &&
          filteredArtists.length === 0 && (
            <div className="py-16 text-center text-white/50">
              <p className="text-base font-semibold">No liked songs, albums, or artists found for "{searchQuery}"</p>
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="mt-3 text-sm text-brand font-semibold hover:underline cursor-pointer"
              >
                Clear filter
              </button>
            </div>
          )}
      </div>

      {/* ── Add Music Modal ── */}
      <AddMusicToLikedModal open={isAddModalOpen} onOpenChange={setIsAddModalOpen} />
    </div>
  );
}
