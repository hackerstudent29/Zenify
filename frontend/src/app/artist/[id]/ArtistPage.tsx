"use client";

import React, { useRef, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { Disc3, Info, X, Play, Share2, Link2 } from "lucide-react";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/authStore";
import { cn, getMediaUrl, formatDisplayTitle, getArtistProfileImage, CANONICAL_APPLE_ARTISTS } from "@/lib/utils";
import { applyArtworkTheme, resetArtworkTheme, extractArtworkAverageColor } from "@/lib/theme";
import { motion, AnimatePresence } from "framer-motion";
import { SEO } from "@/components/shared/SEO";
import { MediaActionButtons } from "@/components/shared/MediaActionButtons";
import { TrackActionsDropdown } from "@/components/shared/TrackActionsDropdown";

import { JioSaavnSongTable } from "./components/JioSaavnSongTable";
import { JioSaavnCardSection } from "./components/JioSaavnCardSection";
import { FansAlsoLike } from "./components/FansAlsoLike";

export default function ArtistPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const queryClient = useQueryClient();

  const { setTrack, currentTrack, isPlaying, togglePlay, isShuffled, toggleShuffle } = usePlayerStore();
  const { setPlayerMinimized, setStickyPageTitle } = useUIStore();
  const { isAuthenticated } = useAuthStore();
  const heroNameRef = useRef<HTMLHeadingElement>(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [isBioOpen, setIsBioOpen] = useState(false);
  const [currentCollectionId, setCurrentCollectionId] = useState<string | null>(null);
  const [isWidescreen, setIsWidescreen] = useState<boolean | null>(null);

  const { data: artist, isLoading } = useQuery({
    queryKey: ['artist', id],
    queryFn: async () => {
      const res = await api.get(`/artists/${encodeURIComponent(id)}`);
      return res.data;
    },
    enabled: !!id,
    staleTime: 0, // Always fetch fresh to eliminate stale browser/DB cache
    refetchOnMount: true,
  });

  // Liked tracks query
  const { data: likedTrackIds = [] } = useQuery({
    queryKey: ["liked-track-ids"],
    queryFn: async () => {
      const res = await api.get("tracks/liked");
      const arr = Array.isArray(res.data) ? res.data : res.data?.items || [];
      return arr.map((tr: any) => tr.id);
    },
    staleTime: 1000 * 60 * 5,
    enabled: isAuthenticated,
  });

  const toggleLike = (trackId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    queryClient.cancelQueries({ queryKey: ["liked-track-ids"] });
    const prev = queryClient.getQueryData<string[]>(["liked-track-ids"]);
    const updated = prev
      ? prev.includes(trackId)
        ? prev.filter((tId) => tId !== trackId)
        : [...prev, trackId]
      : [trackId];
    queryClient.setQueryData(["liked-track-ids"], updated);
    api
      .post(`tracks/${trackId}/like`)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["liked-track-ids"] });
        queryClient.invalidateQueries({ queryKey: ["liked-tracks"] });
      })
      .catch(() => {
        if (prev !== undefined) queryClient.setQueryData(["liked-track-ids"], prev);
      });
  };

  // Sticky title sync on scroll
  useEffect(() => {
    if (!heroNameRef.current) return;
    const el = heroNameRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setStickyPageTitle(entry.isIntersecting ? null : (artist?.name ? formatDisplayTitle(artist.name) : null));
      },
      { threshold: 0.2, rootMargin: "-30px 0px 0px 0px" }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      setStickyPageTitle(null);
    };
  }, [artist?.name, setStickyPageTitle]);

  const isCircularMask = (url?: string | null): boolean => {
    if (!url) return false;
    return (
      url.includes('_cropped.png') ||
      url.includes('_cropped.jpg') ||
      url.includes('cw.png') ||
      url.includes('cw.jpg') ||
      url.includes('cw.webp') ||
      url.includes('AMCArtistImages') ||
      url.includes('1920x1080cw') ||
      url.includes('1200x630cw')
    );
  };

  const normKey = (artist?.name || id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const canonicalVisual = normKey && CANONICAL_APPLE_ARTISTS[normKey] ? CANONICAL_APPLE_ARTISTS[normKey] : null;

  const avatarUrl = canonicalVisual || getArtistProfileImage(artist);
  // Strictly filter out any circular Apple Music _cropped.png or cw.png masks to guarantee full-bleed rectangular artwork
  const cleanCover = artist?.coverUrl && !isCircularMask(artist.coverUrl) ? artist.coverUrl : null;
  const cleanBanner = artist?.bannerUrl && !isCircularMask(artist.bannerUrl) ? artist.bannerUrl : null;
  const cleanImage = artist?.imageUrl && !isCircularMask(artist.imageUrl) ? artist.imageUrl : null;
  const cleanAvatar = avatarUrl && !isCircularMask(avatarUrl) ? avatarUrl : null;
  const heroImageUrl = canonicalVisual || cleanCover || cleanBanner || cleanAvatar || cleanImage;

  // Aspect ratio detection to determine whether to use widescreen cover or perfectly contained portrait
  useEffect(() => {
    if (!heroImageUrl) {
      setIsWidescreen(false);
      return;
    }
    // Instant checks from known square/portrait dimensions
    if (
      heroImageUrl.includes('500x500') ||
      heroImageUrl.includes('600x600') ||
      heroImageUrl.includes('640x640') ||
      heroImageUrl.includes('1000x1000') ||
      heroImageUrl.includes('1080x1080')
    ) {
      setIsWidescreen(false);
      return;
    }
    // Instant checks from known widescreen dimensions
    if (
      heroImageUrl.includes('1920x1080') ||
      heroImageUrl.includes('2560x1440') ||
      heroImageUrl.includes('1200x630') ||
      heroImageUrl.includes('headerImage')
    ) {
      setIsWidescreen(true);
      return;
    }
    const img = new window.Image();
    img.src = getMediaUrl(heroImageUrl) || heroImageUrl;
    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      setIsWidescreen(ratio >= 1.35);
    };
    img.onerror = () => {
      setIsWidescreen(false);
    };
  }, [heroImageUrl]);

  // Artwork tint — multi-source saturation-first loop, isCancelled guard,
  // reset only on page unmount (not on every dep change)
  useEffect(() => {
    let isCancelled = false;

    async function resolveArtistTheme() {
      const candidates = [
        getMediaUrl(heroImageUrl),
        getMediaUrl(avatarUrl),
        getMediaUrl(cleanCover),
        getMediaUrl(cleanBanner),
        getMediaUrl(artist?.imageUrl),
      ].filter(Boolean) as string[];

      const topTracks = artist?.topTracks || artist?.topSongs || [];
      for (const tr of topTracks.slice(0, 5)) {
        const c = tr?.coverUrl || tr?.artwork || tr?.image || tr?.album?.coverUrl;
        if (c) {
          const formatted = getMediaUrl(c);
          if (formatted) candidates.push(formatted);
        }
      }

      for (const candidate of candidates) {
        if (isCancelled) return;
        const rgb = await extractArtworkAverageColor(candidate);
        if (!rgb) continue;

        const [R, G, B] = rgb.map((v) => v / 255);
        const d = Math.max(R, G, B) - Math.min(R, G, B);
        const l = (Math.max(R, G, B) + Math.min(R, G, B)) / 2;
        const sat = d ? d / (1 - Math.abs(2 * l - 1)) : 0;

        if (sat >= 0.05) {
          if (!isCancelled) applyArtworkTheme(rgb[0], rgb[1], rgb[2]);
          return;
        }
      }

      if (candidates[0]) {
        const fallbackRgb = await extractArtworkAverageColor(candidates[0]);
        if (fallbackRgb && !isCancelled) {
          applyArtworkTheme(fallbackRgb[0], fallbackRgb[1], fallbackRgb[2]);
          return;
        }
      }

      if (!isCancelled) resetArtworkTheme();
    }

    resolveArtistTheme();

    // Cancel in-flight async work on dep change, but DON'T reset the theme
    // here — that would flash to neutral every time artist data updates.
    return () => { isCancelled = true; };
  }, [heroImageUrl, avatarUrl, artist]);

  // Reset theme only when the artist page fully unmounts
  useEffect(() => {
    return () => resetArtworkTheme();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh] bg-transparent">
        <ZenLoading size="md" />
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 opacity-40 bg-transparent text-white">
        <Disc3 size={64} strokeWidth={1} />
        <p className="text-base font-bold tracking-tight">Artist not found</p>
      </div>
    );
  }

  const isArtistActive = artist.topTracks?.some((t: any) => t.id === currentTrack?.id);

  const handlePlayTopTracks = () => {
    if (!artist.topTracks?.length) return;
    if (isArtistActive) {
      togglePlay();
    } else {
      setTrack(artist.topTracks[0], artist.topTracks);
      setPlayerMinimized(false);
    }
  };

  const handleShufflePlay = () => {
    if (!artist.topTracks?.length) return;
    setPlayerMinimized(false);
    const player = usePlayerStore.getState();
    if (!player.isShuffled) {
      player.toggleShuffle();
    }
    const randomTrack = artist.topTracks[Math.floor(Math.random() * artist.topTracks.length)];
    player.setTrack(randomTrack, artist.topTracks);
  };

  const handlePlayTrack = (track: any) => {
    if (window.getSelection()?.toString()) return;
    const formatted = {
      ...track,
      artwork: track.artwork || track.coverUrl || track.image,
      streamUrl: track.streamUrl || track.audioUrl,
    };
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      setTrack(formatted, artist.topTracks || [formatted]);
      setPlayerMinimized(false);
    }
  };

  const handlePlayCollection = async (item: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentCollectionId(item.id);
    try {
      if (item.type === "song") {
        handlePlayTrack(item);
        return;
      }
      if (item.type === "playlist" || item.id?.startsWith("saavn-playlist-")) {
        const res = await api.get(`/playlists/${item.id}`);
        const playlistTracks = (res.data?.tracks || []).map((t: any) => t.track || t).filter(Boolean);
        if (playlistTracks.length > 0) {
          const first = {
            ...playlistTracks[0],
            artwork: playlistTracks[0].artwork || playlistTracks[0].coverUrl || playlistTracks[0].image,
            streamUrl: playlistTracks[0].streamUrl || playlistTracks[0].audioUrl,
          };
          setTrack(first, playlistTracks);
          setPlayerMinimized(false);
        }
        return;
      }
      // Album
      const res = await api.get(`/albums/${item.id}`);
      const albumTracks = (res.data?.tracks || []).filter(Boolean);
      if (albumTracks.length > 0) {
        const first = {
          ...albumTracks[0],
          artwork: albumTracks[0].artwork || albumTracks[0].coverUrl || albumTracks[0].image,
          streamUrl: albumTracks[0].streamUrl || albumTracks[0].audioUrl,
        };
        setTrack(first, albumTracks);
        setPlayerMinimized(false);
      }
    } catch (err) {
      console.error("Failed to stream collection:", err);
    }
  };

  const displayName = formatDisplayTitle(artist.name);

  /* ════════════════════════════════════════════════════════════════════
     HERO — plain, compact header (no glass panel, no full-bleed tricks)
       Sits in normal page flow, aligned with the song list below it.
       [ round photo ]  Artist
                        Name
                        [ ▶ Play ] [ ⤮ Shuffle ]  (i) (☆) (⋯)
     ════════════════════════════════════════════════════════════════════ */

  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.href);
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: displayName, url });
      } catch {
        /* dismissed */
      }
    } else {
      copyLink();
    }
  };

  const heroAvatarSrc = getMediaUrl(heroImageUrl || avatarUrl) || "/images/placeholder.png";

  return (
    <div className="min-h-screen w-full bg-transparent text-white relative">
      <SEO
        title={`${displayName} - Music, Albums & Songs on Zenify`}
        description={artist.bio || `Listen to songs and albums by ${displayName} on Zenify.`}
      />

      {/* ── 1. ARTIST HERO ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 mx-auto w-full max-w-[1400px] px-4 pb-6 pt-24 sm:px-8 sm:pb-8 sm:pt-28 md:px-12"
      >
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:gap-6 sm:text-left">
          {/* Round photo */}
          <img
            src={heroAvatarSrc}
            alt={displayName}
            className="size-32 shrink-0 rounded-full bg-zinc-800 object-cover object-[center_20%] shadow-[0_10px_30px_rgba(0,0,0,0.4)] sm:size-[148px]"
            fetchPriority="high"
            decoding="async"
            draggable={false}
          />

          <div className="flex min-w-0 flex-1 flex-col items-center sm:items-start">
            <p className="text-[12px] font-medium text-white/50">Artist</p>

            <h1
              ref={heroNameRef}
              className="mt-0.5 max-w-full select-text break-words text-[28px] font-bold leading-tight tracking-[-0.025em] text-white sm:text-[34px]"
            >
              {displayName}
            </h1>

            {/* Actions */}
            <MediaActionButtons
              isPlaying={isPlaying && isArtistActive}
              onPlay={handlePlayTopTracks}
              isShuffled={isArtistActive && isShuffled}
              onShuffle={handleShufflePlay}
              onInfo={() => setIsBioOpen(true)}
              isLiked={isFavorited}
              onToggleLike={() => setIsFavorited(!isFavorited)}
              track={artist}
              context="artist"
              className="mt-4"
            />
          </div>
        </div>
      </motion.div>

      {/* ── 2. JIOSAAVN REDESIGNED SECTIONS (The content sheet starts cleanly from section places) ── */}
      <div className="relative z-10 pt-4 sm:pt-6 pb-6 w-full bg-[var(--page,#121214)] text-white min-w-0 transition-colors duration-500">
        {/* SECTION 1: Top Songs Table with Popular, Date, Name filters & Load more */}
        <div className="px-4 sm:px-8 md:px-12 max-w-[1400px] mx-auto w-full mb-8">
          <JioSaavnSongTable
            tracks={artist.topTracks || artist.topSongs || []}
            currentTrackId={currentTrack?.id}
            isPlaying={isPlaying}
            likedTrackIds={likedTrackIds}
            onPlayTrack={handlePlayTrack}
            onToggleLike={toggleLike}
          />
        </div>

        {/* SECTION 2: "Just [Artist Name]" Dedicated Playlists */}
        {artist.dedicatedPlaylists && artist.dedicatedPlaylists.length > 0 && (
          <JioSaavnCardSection
            title={`Just ${displayName}`}
            items={artist.dedicatedPlaylists}
            onPlayItem={handlePlayCollection}
            currentCollectionId={currentCollectionId || undefined}
            isPlaying={isPlaying}
          />
        )}

        {/* SECTION 3: "Featured In" Playlists & Soundtracks */}
        {artist.featuredInPlaylists && artist.featuredInPlaylists.length > 0 && (
          <JioSaavnCardSection
            title="Featured In"
            items={artist.featuredInPlaylists}
            onPlayItem={handlePlayCollection}
            currentCollectionId={currentCollectionId || undefined}
            isPlaying={isPlaying}
          />
        )}

        {/* SECTION 4: "Top Albums" */}
        {((artist.topAlbums && artist.topAlbums.length > 0) || (artist.albums && artist.albums.length > 0)) && (
          <JioSaavnCardSection
            title="Top Albums"
            items={(artist.topAlbums || artist.albums || []).filter((a: any) => (a.trackCount || a.songCount || 0) > 1 && !a.isSingle)}
            onPlayItem={handlePlayCollection}
            currentCollectionId={currentCollectionId || undefined}
            isPlaying={isPlaying}
          />
        )}

        {/* SECTION 5: "Singles" */}
        {((artist.singles && artist.singles.length > 0) || (artist.singlesAndEPs && artist.singlesAndEPs.length > 0)) && (
          <JioSaavnCardSection
            title="Singles"
            items={((artist.singles && artist.singles.length > 0) ? artist.singles : artist.singlesAndEPs) || []}
            onPlayItem={handlePlayCollection}
            currentCollectionId={currentCollectionId || undefined}
            isPlaying={isPlaying}
          />
        )}

        {/* SECTION 6: "Latest Releases" */}
        {artist.latestReleases && artist.latestReleases.length > 0 && (
          <JioSaavnCardSection
            title="Latest Releases"
            items={artist.latestReleases}
            onPlayItem={handlePlayCollection}
            currentCollectionId={currentCollectionId || undefined}
            isPlaying={isPlaying}
          />
        )}

        {/* SECTION 7: "Fans Also Like" / Similar Artists */}
        {artist.relatedArtists && artist.relatedArtists.length > 0 && (
          <FansAlsoLike
            currentArtistId={artist.id}
            initialRelated={artist.relatedArtists}
          />
        )}
      </div>

      {/* ── FOOTER: a slightly darker shade of the page colour ──
          The layout reserves empty space under the page for the floating player.
          That space is outside this component, so the shadow below paints the same
          colour down into it and the footer visually reaches the bottom edge. */}
      <footer
        className="relative z-10 w-full px-4 py-4 sm:px-8 md:px-12"
        style={{
          backgroundColor: "color-mix(in srgb, var(--page, #121214) 70%, black)",
          boxShadow: "0 100vh 0 0 color-mix(in srgb, var(--page, #121214) 70%, black)",
        }}
      >
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 border-t border-white/[0.08] pt-3 text-[12px] text-white/40">
          <span>© {new Date().getFullYear()} Zenify. All rights reserved.</span>
          <span className="truncate">{displayName}</span>
        </div>
      </footer>

      {/* ── 3. ARTIST BIOGRAPHY MODAL ── */}
      <AnimatePresence>
        {isBioOpen && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-lg bg-[#18181b]/95 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl text-left"
            >
              <button
                onClick={() => setIsBioOpen(false)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center transition cursor-pointer"
                title="Close"
              >
                <X size={16} />
              </button>
              <h3 className="text-xl font-bold text-white mb-4 pr-8">About {displayName}</h3>
              <div className="text-sm text-zinc-300 leading-relaxed max-h-[60vh] overflow-y-auto pr-2 scrollbar-thin">
                {artist.bio ? (
                  <p className="whitespace-pre-line">{artist.bio}</p>
                ) : (
                  <p className="text-zinc-400">
                    Listen to {displayName}'s top releases, singles, albums, and curated playlists on Zenify.
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}