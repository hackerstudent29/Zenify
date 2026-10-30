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
  const [isWidescreen, setIsWidescreen] = useState<boolean | null>(null);

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

  useEffect(() => {
    const targetUrl = artist?.bannerUrl || artist?.coverUrl || artist?.imageUrl;
    if (!targetUrl) {
      setIsWidescreen(false);
      return;
    }
    if (
      targetUrl.includes('AMCArtistImages') ||
      targetUrl.includes('headerImage') ||
      targetUrl.includes('2560x1440') ||
      targetUrl.includes('1920x1080')
    ) {
      setIsWidescreen(true);
      return;
    }
    if (targetUrl.includes('500x500') || targetUrl.includes('600x600') || targetUrl.includes('640x640')) {
      setIsWidescreen(false);
      return;
    }
    const img = new window.Image();
    img.src = getMediaUrl(targetUrl);
    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      setIsWidescreen(ratio >= 1.35);
    };
    img.onerror = () => {
      setIsWidescreen(false);
    };
  }, [artist?.bannerUrl, artist?.coverUrl, artist?.imageUrl]);

  const rawBanner = (artist?.bannerUrl && artist.bannerUrl !== artist?.imageUrl) ? artist.bannerUrl : null;
  const isWidescreenUrl = Boolean(isWidescreen === true && rawBanner && !rawBanner.includes('500x500') && !rawBanner.includes('600x600'));
  const bannerUrl = isWidescreenUrl ? rawBanner : null;
  const avatarUrl = artist?.imageUrl || artist?.coverUrl || artist?.bannerUrl || null;

  // Artwork tint — multi-source saturation-first loop, isCancelled guard,
  // reset only on page unmount (not on every dep change)
  useEffect(() => {
    let isCancelled = false;

    async function resolveArtistTheme() {
      const candidates = [
        getMediaUrl(bannerUrl || rawBanner),
        getMediaUrl(avatarUrl),
        getMediaUrl(artist?.imageUrl),
        getMediaUrl(artist?.coverUrl),
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
  }, [bannerUrl, avatarUrl, rawBanner, artist]);

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

  return (
    <div className="min-h-screen w-full bg-transparent text-white relative">
      <SEO
        title={`${displayName} - Music, Albums & Songs on Zenify`}
        description={artist.bio || `Listen to songs and albums by ${displayName} on Zenify.`}
      />

      {/* ── 1. ARTIST HERO ── */}
      {isWidescreenUrl && bannerUrl ? (
        /* WIDESCREEN FULL-SIZE MASTER BANNER: Apple Music Extended Showcase */
        <div 
          className="relative w-full h-[62vh] sm:h-[70vh] md:h-[76vh] min-h-[500px] max-h-[760px] overflow-hidden select-none am-layout-transition mb-6 sm:mb-8"
          style={{
            marginLeft: "calc(var(--sb-w) * -1)",
            marginRight: "calc(var(--rp-w) * -1)",
            width: "calc(100% + var(--sb-w) + var(--rp-w))",
          }}
        >
          <img
            src={getMediaUrl(bannerUrl) || undefined}
            alt={displayName}
            className="absolute inset-0 w-full h-full object-cover object-top filter brightness-95"
            fetchPriority="high"
            decoding="async"
          />

          {/* Top subtle vignette for header contrast */}
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 via-black/20 to-transparent pointer-events-none z-10" />

          {/* Smooth bottom transition to page background directly before songs list */}
          <div className="absolute inset-x-0 bottom-0 h-44 sm:h-56 bg-gradient-to-t from-[var(--page,#121214)] via-[var(--page,#121214)]/70 to-transparent pointer-events-none z-10" />

          {/* Hero Content: Artist Name & Action Controls LIVE OVER THE EXPANDED BANNER IMAGE */}
          <div className="absolute inset-x-0 bottom-6 sm:bottom-8 z-20 flex flex-col items-center text-center px-4">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center max-w-4xl w-full min-w-0"
            >
              <h1
                ref={heroNameRef}
                className="text-3xl sm:text-4xl md:text-5xl lg:text-[54px] font-bold text-white tracking-tight drop-shadow-[0_4px_32px_rgba(0,0,0,0.95)] mb-3 sm:mb-4 select-text max-w-full px-2 break-words"
              >
                {displayName}
              </h1>

              <div className="flex items-center justify-center gap-2.5 sm:gap-3.5 flex-wrap">
                {/* Info / Bio Button */}
                <button
                  onClick={() => setIsBioOpen(true)}
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white/90 hover:text-white flex items-center justify-center backdrop-blur-xl transition active:scale-95 shadow-xl cursor-pointer"
                  title="Artist Bio"
                >
                  <Info size={18} strokeWidth={2.2} />
                </button>

                {/* Primary White Play Circle */}
                <button
                  onClick={handlePlayTopTracks}
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-[0_6px_24px_rgba(255,255,255,0.25)] cursor-pointer"
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
                    "w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center backdrop-blur-xl border transition-all active:scale-95 shadow-xl cursor-pointer",
                    isFavorited
                      ? "bg-brand/20 border-brand text-brand"
                      : "bg-white/10 hover:bg-white/20 border-white/15 text-white/90 hover:text-white"
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
                    "w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center backdrop-blur-xl border transition-all active:scale-95 shadow-xl cursor-pointer",
                    isShuffled
                      ? "bg-brand/20 border-brand text-brand"
                      : "bg-white/10 hover:bg-white/20 border-white/15 text-white/90 hover:text-white"
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
                      className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/15 text-white flex items-center justify-center active:scale-95 transition-all shadow-xl cursor-pointer"
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
          </div>
        </div>
      ) : (
        /* ROUND SHAPE PROFILE PIC (When artist has no banner or square avatar) */
        <div className="relative w-full pt-10 sm:pt-14 md:pt-16 pb-8 sm:pb-10 flex flex-col items-center justify-center text-center overflow-hidden select-none">
          {/* Subtle warm ambient radial glow behind avatar */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 sm:w-96 sm:h-96 rounded-full bg-white/[0.04] blur-3xl pointer-events-none" />

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 flex flex-col items-center"
          >
            {/* Centered Circular Artist Avatar */}
            <div className="relative w-36 h-36 sm:w-44 sm:h-44 md:w-52 md:h-52 rounded-full overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.85)] border border-white/10 ring-1 ring-white/10 mx-auto mb-6 bg-zinc-800">
              <img
                src={getMediaUrl(avatarUrl || rawBanner) || "/images/placeholder.png"}
                alt={displayName}
                className="w-full h-full object-cover object-center filter brightness-95"
                fetchPriority="high"
                decoding="async"
              />
            </div>

            {/* Apple Music centered Artist Title */}
            <h1
              ref={heroNameRef}
              className="text-3xl sm:text-4xl md:text-5xl lg:text-[46px] font-bold text-white tracking-tight drop-shadow-md mb-5 px-4 break-words"
            >
              {displayName}
            </h1>

            {/* Centered Action Controls */}
            <div className="flex items-center justify-center gap-2.5 sm:gap-3.5 flex-wrap">
              {/* Info / Bio Button */}
                  <button
                    onClick={() => setIsBioOpen(true)}
                    className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white/90 hover:text-white flex items-center justify-center backdrop-blur-xl transition active:scale-95 shadow-xl cursor-pointer"
                    title="Artist Bio"
                  >
                    <Info size={18} strokeWidth={2.2} />
                  </button>

                  {/* Primary White Play Circle */}
                  <button
                    onClick={handlePlayTopTracks}
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-[0_6px_24px_rgba(255,255,255,0.25)] cursor-pointer"
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
                      "w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center backdrop-blur-xl border transition-all active:scale-95 shadow-xl cursor-pointer",
                      isFavorited
                        ? "bg-brand/20 border-brand text-brand"
                        : "bg-white/10 hover:bg-white/20 border-white/15 text-white/90 hover:text-white"
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
                      "w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center backdrop-blur-xl border transition-all active:scale-95 shadow-xl cursor-pointer",
                      isShuffled
                        ? "bg-brand/20 border-brand text-brand"
                        : "bg-white/10 hover:bg-white/20 border-white/15 text-white/90 hover:text-white"
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
                        className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/15 text-white flex items-center justify-center active:scale-95 transition-all shadow-xl cursor-pointer"
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
        </div>
      )}

      {/* ── 2. JIOSAAVN REDESIGNED SECTIONS (Screenshot 1 & Screenshot 2) ── */}
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

        {/* SECTION 2: "Just [Artist Name]" Dedicated Playlists (Screenshot 2) */}
        {artist.dedicatedPlaylists && artist.dedicatedPlaylists.length > 0 && (
          <JioSaavnCardSection
            title={`Just ${displayName}`}
            items={artist.dedicatedPlaylists}
            onPlayItem={handlePlayCollection}
            currentCollectionId={currentCollectionId || undefined}
            isPlaying={isPlaying}
          />
        )}

        {/* SECTION 3: "Featured In" Playlists & Soundtracks (Screenshot 2) */}
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

      {/* ── 3. APPLE MUSIC ARTIST BIOGRAPHY MODAL ── */}
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
