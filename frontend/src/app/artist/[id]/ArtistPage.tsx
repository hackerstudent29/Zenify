"use client";

import React, { useRef, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { Disc3, Star, Heart, Info, X } from "lucide-react";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/authStore";
import { cn, getMediaUrl, formatDisplayTitle, getArtistProfileImage } from "@/lib/utils";
import { applyArtworkTheme, resetArtworkTheme, extractArtworkAverageColor } from "@/lib/theme";
import { motion, AnimatePresence } from "framer-motion";
import { SEO } from "@/components/shared/SEO";
import {
  SwiftUIPlay,
  SwiftUIPause,
  SwiftUIShuffle,
  SwiftUIEllipsis,
} from "@/components/ui/SwiftUIIcons";
import { AnimatedDropdown } from "@/components/ui/animated-dropdown";

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

  const { data: artist, isLoading } = useQuery({
    queryKey: ['artist', id],
    queryFn: async () => {
      const res = await api.get(`/artists/${encodeURIComponent(id)}`);
      return res.data;
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 10, // 10 minutes cache
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

  const avatarUrl = getArtistProfileImage(artist);
  // Strictly filter out any circular Apple Music _cropped.png or cw.png masks to guarantee full-bleed rectangular artwork
  const cleanCover = artist?.coverUrl && !artist.coverUrl.includes('_cropped.png') && !artist.coverUrl.includes('cw.png') && !artist.coverUrl.includes('cw.jpg') ? artist.coverUrl : null;
  const cleanBanner = artist?.bannerUrl && !artist.bannerUrl.includes('_cropped.png') && !artist.bannerUrl.includes('cw.png') && !artist.bannerUrl.includes('cw.jpg') ? artist.bannerUrl : null;
  const cleanImage = artist?.imageUrl && !artist.imageUrl.includes('_cropped.png') && !artist.imageUrl.includes('cw.png') && !artist.imageUrl.includes('cw.jpg') ? artist.imageUrl : null;
  const heroImageUrl = cleanCover || cleanBanner || avatarUrl || cleanImage;

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

  /* ── Artist name + action buttons docked over the hero artwork ── */
  const heroHeader = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative z-20 flex w-full min-w-0 flex-col items-center px-4 pb-4 pt-1 text-center sm:pb-6"
    >
      <h1
        ref={heroNameRef}
        className="mb-3 max-w-4xl select-text break-words px-2 text-3xl font-bold tracking-tight text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.85)] sm:mb-4 sm:text-4xl md:text-5xl lg:text-[54px]"
      >
        {displayName}
      </h1>

      <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3.5">
        {/* Info / Bio Button */}
        <button
          onClick={() => setIsBioOpen(true)}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/90 shadow-xl backdrop-blur-xl transition hover:bg-white/20 hover:text-white active:scale-95 sm:h-11 sm:w-11"
          title="Artist Bio"
        >
          <Info size={18} strokeWidth={2.2} />
        </button>

        {/* Primary White Play Circle */}
        <button
          onClick={handlePlayTopTracks}
          className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-white text-black shadow-[0_6px_24px_rgba(255,255,255,0.35)] transition-all hover:scale-105 active:scale-95 sm:h-14 sm:w-14"
          title={isPlaying && isArtistActive ? "Pause" : "Play Top Songs"}
        >
          {isPlaying && isArtistActive ? (
            <SwiftUIPause size={22} fill="black" />
          ) : (
            <SwiftUIPlay size={22} fill="black" className="ml-0.5" />
          )}
        </button>

        {/* Star / Favorite Button */}
        <button
          onClick={() => setIsFavorited(!isFavorited)}
          className={cn(
            "flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border shadow-xl backdrop-blur-xl transition-all active:scale-95 sm:h-11 sm:w-11",
            isFavorited
              ? "border-brand bg-brand/20 text-brand"
              : "border-white/15 bg-black/40 text-white/90 hover:bg-white/20 hover:text-white"
          )}
          title={isFavorited ? "Favorited" : "Favorite Artist"}
        >
          <Star
            size={18}
            className={cn(isFavorited ? "fill-brand text-brand" : "text-white")}
            strokeWidth={2}
          />
        </button>

        {/* Glass Shuffle Circle */}
        <button
          onClick={handleShufflePlay}
          className={cn(
            "flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border shadow-xl backdrop-blur-xl transition-all active:scale-95 sm:h-11 sm:w-11",
            isShuffled
              ? "border-brand bg-brand/20 text-brand"
              : "border-white/15 bg-black/40 text-white/90 hover:bg-white/20 hover:text-white"
          )}
          title="Shuffle Artist Songs"
        >
          <SwiftUIShuffle size={18} stroke="currentColor" />
        </button>

        {/* Glass Ellipsis Menu */}
        <AnimatedDropdown
          align="center"
          trigger={
            <button
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-black/40 text-white shadow-xl backdrop-blur-xl transition-all hover:bg-white/20 active:scale-95 sm:h-11 sm:w-11"
              title="More Options"
            >
              <SwiftUIEllipsis size={18} fill="currentColor" />
            </button>
          }
          items={[
            {
              id: "share",
              label: "Share Artist",
              onClick: () => navigator.clipboard.writeText(window.location.href),
            },
            {
              id: "play-all",
              label: "Play All Songs",
              onClick: handlePlayTopTracks,
            },
          ]}
        />
      </div>
    </motion.div>
  );

  return (
    <div className="min-h-screen w-full bg-transparent text-white relative">
      <SEO
        title={`${displayName} - Music, Albums & Songs on Zenify`}
        description={artist.bio || `Listen to songs and albums by ${displayName} on Zenify.`}
      />

      {/* ── 1. ARTIST HERO (Full-bleed photograph, controls docked at the bottom over the image) ── */}
      {heroImageUrl ? (
        <div
          className="relative w-full h-[62vh] sm:h-[66vh] md:h-[68vh] min-h-[460px] max-h-[720px] overflow-hidden select-none am-layout-transition flex flex-col justify-end"
          style={{
            marginLeft: "calc(var(--sb-w) * -1)",
            marginRight: "calc(var(--rp-w) * -1)",
            width: "calc(100% + var(--sb-w) + var(--rp-w))",
          }}
        >
          {/* Ambient blurred backdrop so wide screens don't force excessive zoom on the artist */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <img
              src={getMediaUrl(heroImageUrl) || undefined}
              alt=""
              className="w-full h-full object-cover blur-3xl scale-125 opacity-35 brightness-75"
              aria-hidden="true"
            />
          </div>

          {/* Full-bleed rectangular portrait without any circular masks or letterboxing */}
          <img
            src={getMediaUrl(heroImageUrl) || undefined}
            alt={displayName}
            className="absolute inset-0 m-auto w-full h-full object-cover object-center sm:object-[center_20%] filter brightness-95 pointer-events-none"
            fetchPriority="high"
            decoding="async"
          />

          {/* Top subtle vignette for header contrast */}
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 via-black/20 to-transparent pointer-events-none z-10" />

          {/* Bottom gradient smoothly flowing into the section background */}
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[var(--page,#121214)] via-[var(--page,#121214)]/60 to-transparent pointer-events-none z-10" />

          {/* Artist title & controls docked directly over the image */}
          <div className="relative z-20 pb-3 sm:pb-5">
            {heroHeader}
          </div>
        </div>
      ) : (
        /* Minimal fallback when no artist artwork is available (Strictly NO circular avatars) */
        <div className="relative w-full pt-10 sm:pt-14 md:pt-16 pb-6 sm:pb-8 flex flex-col items-center justify-center text-center overflow-hidden select-none">
          {/* Subtle warm ambient radial glow behind artwork */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 sm:w-96 sm:h-96 rounded-2xl bg-white/[0.04] blur-3xl pointer-events-none" />

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 flex flex-col items-center"
          >
            {/* Boxy Asymmetrical Modern Showcase (Strictly NO circular shapes) */}
            <div className="relative w-36 h-36 sm:w-44 sm:h-44 md:w-52 md:h-52 rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.85)] border border-white/10 ring-1 ring-white/10 mx-auto bg-zinc-800 mb-6">
              <img
                src={getMediaUrl(avatarUrl) || "/images/placeholder.png"}
                alt={displayName}
                className="w-full h-full object-cover object-center filter brightness-95"
                fetchPriority="high"
                decoding="async"
              />
            </div>
            {heroHeader}
          </motion.div>
        </div>
      )}

      {/* ── 2. JIOSAAVN REDESIGNED SECTIONS (The content sheet starts cleanly here) ── */}
      <div className="relative z-10 pt-4 sm:pt-6 pb-28 w-full text-white min-w-0">
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
