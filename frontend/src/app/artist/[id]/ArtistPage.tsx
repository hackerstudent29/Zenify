"use client";

import React, { useRef, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { Disc3, Star, Heart } from "lucide-react";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/authStore";
import { cn, getMediaUrl, formatDisplayTitle, getArtistProfileImage } from "@/lib/utils";
import { motion } from "framer-motion";
import { SEO } from "@/components/shared/SEO";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SwiftUIPlay,
  SwiftUIPause,
  SwiftUIShuffle,
  SwiftUIEllipsis,
} from "@/components/ui/SwiftUIIcons";

// Subcomponents matching Apple Music structure
import { ArtistLatestAndTopSongs } from "./components/ArtistLatestAndTopSongs";
import { EssentialAlbums } from "./components/EssentialAlbums";
import { ReleaseRowSection } from "./components/ReleaseRowSection";
import { ArtistPlaylists } from "./components/ArtistPlaylists";
import { FansAlsoLike } from "./components/FansAlsoLike";
import { StatsForwardAbout } from "./components/StatsForwardAbout";

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

  const { data: artist, isLoading } = useQuery({
    queryKey: ['artist', id],
    queryFn: async () => {
      const res = await api.get(`/artists/${encodeURIComponent(id)}`);
      return res.data;
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 10, // 10 minutes cache
  });

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
  const bannerUrl = artist.coverUrl || artist.imageUrl || null;

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
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      setTrack(track, artist.topTracks);
      setPlayerMinimized(false);
    }
  };

  const displayName = formatDisplayTitle(artist.name);

  return (
    <div className="min-h-screen w-full bg-[#121214] text-white overflow-x-hidden relative">
      <SEO
        title={`${displayName} - Music, Albums & Songs on Zenify`}
        description={artist.bio || `Listen to songs and albums by ${displayName} on Zenify.`}
      />

      {/* ── 1. APPLE MUSIC HERO SECTION (Screenshot 2) ────────────────── */}
      <div className="relative w-full h-[62vh] md:h-[76vh] overflow-hidden select-none">
        {/* Full-bleed high-res artist photography */}
        {bannerUrl ? (
          <img
            src={getMediaUrl(bannerUrl) || undefined}
            alt={displayName}
            className="absolute inset-0 w-full h-full object-cover object-[50%_25%] filter brightness-95"
            fetchPriority="high"
            decoding="async"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-800 to-[#121214]" />
        )}

        {/* Ambient top vignette & smooth bottom fade into universal dark charcoal #121214 */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#121214] via-[#121214]/40 to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-[#121214] pointer-events-none" />

        {/* Centered Hero Content: Artist Name & Swift UI Controls */}
        <div className="absolute inset-0 flex flex-col justify-end items-center text-center px-4 pb-10 md:pb-14 z-10">
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center max-w-4xl w-full"
          >
            {/* Bold Centered Artist Title */}
            <h1
              ref={heroNameRef}
              className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight drop-shadow-[0_8px_24px_rgba(0,0,0,0.8)] mb-6 select-text"
            >
              {displayName}
            </h1>

            {/* Swift UI Circular Action Buttons (Play, Shuffle, Star, More) */}
            <div className="flex items-center justify-center gap-4">
              {/* Star / Favorite Button */}
              <button
                onClick={() => setIsFavorited(!isFavorited)}
                className={cn(
                  "w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center backdrop-blur-xl border transition-all active:scale-95 shadow-xl",
                  isFavorited
                    ? "bg-brand/20 border-brand text-brand"
                    : "bg-white/10 hover:bg-white/20 border-white/15 text-white/90 hover:text-white"
                )}
                title={isFavorited ? "Favorited" : "Favorite Artist"}
              >
                <Star
                  size={20}
                  className={cn(isFavorited ? "fill-brand text-brand" : "text-white")}
                  strokeWidth={2}
                />
              </button>

              {/* Primary White Play Circle */}
              <button
                onClick={handlePlayTopTracks}
                className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-[0_10px_30px_rgba(0,0,0,0.6)] cursor-pointer"
                title={isPlaying && isArtistActive ? "Pause" : "Play"}
              >
                {isPlaying && isArtistActive ? (
                  <SwiftUIPause size={26} fill="black" />
                ) : (
                  <SwiftUIPlay size={26} fill="black" className="ml-1" />
                )}
              </button>

              {/* Glass Shuffle Circle */}
              <button
                onClick={handleShufflePlay}
                className={cn(
                  "w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center backdrop-blur-xl border transition-all active:scale-95 shadow-xl",
                  isShuffled
                    ? "bg-brand/20 border-brand text-brand"
                    : "bg-white/10 hover:bg-white/20 border-white/15 text-white/90 hover:text-white"
                )}
                title="Shuffle Artist Songs"
              >
                <SwiftUIShuffle size={20} stroke="currentColor" />
              </button>

              {/* Glass Ellipsis Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="w-11 h-11 md:w-12 md:h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/15 text-white flex items-center justify-center active:scale-95 transition-all shadow-xl"
                    title="More Options"
                  >
                    <SwiftUIEllipsis size={20} fill="currentColor" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-48 bg-zinc-900 border border-white/10 text-white rounded-xl shadow-2xl p-1">
                  <DropdownMenuItem
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.href);
                    }}
                    className="cursor-pointer text-xs font-semibold py-2"
                  >
                    Share Artist
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handlePlayTopTracks}
                    className="cursor-pointer text-xs font-semibold py-2"
                  >
                    Play All Songs
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── 2. MAIN APPLE MUSIC BODY SECTIONS ─────────────────────────── */}
      <div className="px-5 sm:px-8 md:px-12 lg:px-16 pt-8 pb-28 max-w-[1600px] mx-auto w-full">
        {/* Latest Release (Left) & Top Songs > (Right) (Screenshot 3) */}
        <ArtistLatestAndTopSongs
          artist={artist}
          currentTrackId={currentTrack?.id}
          isPlaying={isPlaying}
          onPlayTrack={handlePlayTrack}
        />

        {/* Essential Albums (Screenshot 3 Bottom) */}
        <EssentialAlbums
          albums={artist.essentialAlbums || artist.studioAlbums || artist.albums || []}
          artistName={displayName}
        />

        {/* Albums > (Screenshot 4) */}
        <ReleaseRowSection
          title="Albums"
          items={artist.studioAlbums || artist.albums || []}
          seeAllHref={`/artist/${artist.id}/albums`}
        />

        {/* Singles & EPs > (Screenshot 4 Bottom) */}
        <ReleaseRowSection
          title="Singles & EPs"
          items={artist.singlesAndEPs || []}
          seeAllHref={`/artist/${artist.id}/singles`}
        />

        {/* Artist Playlists (Screenshot 5: Apple Music Essentials Style) */}
        <ArtistPlaylists
          artistName={displayName}
          playlists={artist.playlists || []}
        />

        {/* Compilations > (Screenshot 5 Bottom) */}
        <ReleaseRowSection
          title="Compilations"
          items={artist.compilations || []}
          seeAllHref={`/artist/${artist.id}/compilations`}
        />

        {/* Fans Also Like (Circular Artist Cards) */}
        <FansAlsoLike
          currentArtistId={artist.id}
          initialRelated={artist.relatedArtists}
        />

        {/* About Artist Section */}
        <StatsForwardAbout artist={artist} />
      </div>
    </div>
  );
}
