"use client";

import { SEO } from "@/components/shared/SEO";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { ZenLoading } from "@/components/ui/ZenLoading";
import {
  Play,
  Pause,
  Shuffle,
  MoreHorizontal,
  Share2,
  Plus,
  Download,
  User,
  Disc3,
  Music2,
  RefreshCw,
  ListPlus,
  Mic,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ChevronDown
} from "lucide-react";
import { usePlayerStore } from "@/store/player";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import { getMediaUrl, cn, formatDisplayTitle, getArtistTarget } from "@/lib/utils";
import { useRefetchAudio } from "@/hooks/useRefetchAudio";
import { useRefetchLyrics } from "@/hooks/useRefetchLyrics";
import { RefetchLyricsSubMenu } from "@/components/shared/RefetchLyricsSubMenu";
import { DynamicBackground } from "@/components/shared/DynamicBackground";
import { ArtistLinks } from "@/components/shared/ArtistLinks";
import { applyArtworkTheme, resetArtworkTheme, extractArtworkAverageColor } from "@/lib/theme";
import Link from "next/link";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const formatDuration = (s?: number | null) => {
  if (!s || isNaN(s)) return "0:00";
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export default function AlbumPage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params?.id) ? params.id[0] : (params?.id as string);
  const openAddToPlaylistModal = useUIStore((s) => s.openAddToPlaylistModal);
  const { refetchTrackAudio, isRefetching } = useRefetchAudio();
  const { refetchTrackLyrics } = useRefetchLyrics();
  const { setTrack, setQueue, currentTrack, isPlaying, togglePlay, isShuffled, toggleShuffle } = usePlayerStore();
  const { openDownloadModal, setPlayerMinimized } = useUIStore();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [showFullDesc, setShowFullDesc] = useState(false);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    useUIStore.getState().showToast(msg, type);
    setTimeout(() => setToast(null), 2500);
  };

  const { data: album, isLoading } = useQuery({
    queryKey: ["album", id],
    queryFn: async () => {
      const res = await api.get(`/albums/${id}`);
      return res.data;
    },
    enabled: !!id,
  });

  const user = useAuthStore((s) => s.user);

  // Fetch more albums by this artist
  const artistId = album?.artistId || album?.artist?.id;
  const { data: artistData } = useQuery({
    queryKey: ["artist-albums", artistId],
    queryFn: async () => {
      if (!artistId) return null;
      const res = await api.get(`/artists/${encodeURIComponent(artistId)}`);
      return res.data;
    },
    enabled: !!artistId,
  });

  // Fetch related albums / artists for "You might also like"
  const { data: relatedArtists = [] } = useQuery({
    queryKey: ["artist-related", artistId],
    queryFn: async () => {
      if (!artistId) return [];
      try {
        const res = await api.get(`/artists/${encodeURIComponent(artistId)}/related`);
        return Array.isArray(res.data) ? res.data : [];
      } catch {
        return [];
      }
    },
    enabled: !!artistId,
  });

  const coverUrl =
    getMediaUrl(album?.coverUrl) ||
    album?.tracks?.[0]?.coverUrl ||
    "/logo.png";

  // Dynamic Apple Music Artwork Tint: compute dominant RGB and update CSS variables (--h, --s, --page, --side)
  useEffect(() => {
    if (!coverUrl) return;
    extractArtworkAverageColor(coverUrl).then((rgb) => {
      if (rgb) {
        applyArtworkTheme(rgb[0], rgb[1], rgb[2]);
      }
    });
    return () => {
      resetArtworkTheme();
    };
  }, [coverUrl]);

  const isTrackMatch = (t1: any, t2: any) => {
    if (!t1 || !t2) return false;
    return t1.id === t2.id;
  };

  const isAlbumActive = album?.tracks?.some((t: any) => isTrackMatch(currentTrack, t));
  const isAlbumCurrentlyPlaying = isAlbumActive && isPlaying;

  const handlePlayAlbum = () => {
    if (isAlbumActive) {
      togglePlay();
    } else if ((album?.tracks?.length || 0) > 0) {
      setQueue(album.tracks);
      setTrack(album.tracks[0], album.tracks);
      setPlayerMinimized(false);
    }
  };

  const handleShufflePlay = () => {
    if ((album?.tracks?.length || 0) > 0) {
      if (isAlbumActive) {
        toggleShuffle();
        return;
      }
      if (!isShuffled) toggleShuffle();
      const randomIndex = Math.floor(Math.random() * (album?.tracks?.length || 1));
      setTrack(album.tracks[randomIndex], album.tracks);
      setPlayerMinimized(false);
    }
  };

  const handlePlayTrack = (track: any) => {
    if (window.getSelection()?.toString()) return;
    if (isTrackMatch(currentTrack, track)) {
      togglePlay();
    } else {
      setQueue(album.tracks);
      setTrack(track, album.tracks);
      setPlayerMinimized(false);
    }
  };

  const handleShare = async (item: any, type: "album" | "track" = "album") => {
    const url =
      type === "album"
        ? `${window.location.origin}/album/${id}`
        : `${window.location.origin}/album/${id}?track=${item.id}`;

    const title = type === "album" ? album.title : item.title;
    const text =
      type === "album"
        ? `Check out this album: ${album.title}`
        : `Listen to ${item.title} by ${album.artist?.name}`;

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch (err) {
        if ((err as Error).name !== "AbortError") showToast("Error sharing", "error");
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        showToast("Link copied to clipboard!");
      } catch {
        showToast("Failed to copy link", "error");
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <ZenLoading size="md" />
      </div>
    );
  }

  if (!album) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 opacity-40">
        <Disc3 size={64} strokeWidth={1} />
        <p className="text-sm font-bold tracking-tight text-white/50">Album not found</p>
      </div>
    );
  }

  const rawDate = album.releaseDate || album.year || album.createdAt;
  let releaseYear = "2026";
  let formattedReleaseDate = "2026";
  if (rawDate) {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      releaseYear = String(d.getFullYear());
      formattedReleaseDate = d.toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } else {
      const match = String(rawDate).match(/\d{4}/);
      if (match) {
        releaseYear = match[0];
        formattedReleaseDate = match[0];
      }
    }
  }

  const trackCount = album?.tracks?.length || 0;
  const totalSeconds = album?.tracks?.reduce((acc: number, t: any) => acc + (t.duration || 0), 0) || 0;
  const totalHours = Math.floor(totalSeconds / 3600);
  const totalMins = Math.floor((totalSeconds % 3600) / 60);
  const totalDurationStr =
    totalHours > 0 ? `${totalHours} hr ${totalMins} min` : `${totalMins} minutes`;

  const albumDescription =
    album.description ||
    album.overview ||
    `Experience the official album "${album.title}" by ${album.artist?.name || "various artists"}. High-fidelity lossless audio streaming on Zenify.`;

  const otherAlbums = (artistData?.albums || []).filter((a: any) => a.id !== album.id);

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[var(--page,#121214)] transition-colors duration-700 ease-out text-white relative pb-32">
      <SEO
        title={`${formatDisplayTitle(album.title)} by ${album.artist?.name || "Artist"} – Zenify`}
        description={albumDescription}
      />
      <DynamicBackground surface="albumPage" coverUrl={coverUrl} palette={album?.palette || album?.tracks?.[0]?.palette} />

      <div className="w-full relative z-10 max-w-7xl mx-auto px-4 sm:px-6 md:px-10 pt-4 md:pt-8 min-w-0 max-w-full overflow-hidden">
        {/* ── 1. Top Header Navigation (Back / Forward) ────────────────── */}
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

        {/* ── 2. Album Hero Header ────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 sm:gap-8 lg:gap-10 mb-10 md:mb-12 w-full min-w-0 max-w-full">
          {/* Artwork: responsive square, never exceeds viewport */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="w-[min(280px,80vw)] sm:w-[320px] md:w-[338px] aspect-square shrink-0 rounded-lg shadow-2xl overflow-hidden bg-zinc-900 border border-white/10 relative"
          >
            <img
              src={coverUrl}
              alt={album.title ? `Cover art for ${album.title}` : "Album cover"}
              width={338}
              height={338}
              fetchPriority="high"
              decoding="async"
              className="w-full h-full object-cover select-none"
            />
          </motion.div>

          {/* Album Information Stack */}
          <div className="flex flex-col flex-1 min-w-0 w-full text-center md:text-left justify-start overflow-hidden">
            {/* Title: Apple Music typography, reduced size */}
            <h1 className="text-[20px] sm:text-[24px] md:text-[28px] font-bold text-white tracking-[-0.015em] leading-tight mb-1 break-words line-clamp-3 max-w-full">
              {formatDisplayTitle(album.title)}
            </h1>

            {/* Artist: Apple Music editorial styling in grey, reduced size */}
            <div className="text-[15px] sm:text-[17px] md:text-[20px] font-normal text-zinc-400 mb-2 break-words max-w-full">
              <ArtistLinks
                album={album}
                showRoles={false}
                className="text-zinc-400 font-normal"
                linkClassName="text-zinc-400 hover:text-white hover:underline transition-colors font-normal"
              />
            </div>

            {/* Genre and Year: reduced size */}
            <div className="text-[12px] sm:text-[13px] font-medium text-white/50 flex items-center justify-center md:justify-start gap-2 mb-2.5 flex-wrap max-w-full">
              <span>{album.genre || "Pop"}</span>
              <span>·</span>
              <span>{releaseYear}</span>
              <span>·</span>
              <span className="text-white/80">Lossless</span>
            </div>

            {/* Description: reduced size */}
            <div className="text-[12px] sm:text-[13px] md:text-[14px] leading-[20px] text-[var(--text-2)] mb-4 max-w-3xl break-words">
              <p className={cn("transition-all duration-300", !showFullDesc && "line-clamp-2")}>
                {albumDescription}
              </p>
              {(albumDescription?.length || 0) > 120 && (
                <button
                  onClick={() => setShowFullDesc(!showFullDesc)}
                  className="text-white font-bold text-[12px] uppercase tracking-wider mt-1 hover:underline cursor-pointer"
                >
                  {showFullDesc ? "LESS" : "MORE"}
                </button>
              )}
            </div>

            {/* Apple Music Action Controls (Shuffle + Play Pill + More) */}
            <div className="flex items-center justify-center md:justify-start gap-2.5 sm:gap-3 flex-wrap max-w-full">
              {/* Shuffle button */}
              <motion.button
                whileTap={{ scale: 0.88 }}
                transition={{ type: "spring", stiffness: 450, damping: 24 }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (trackCount === 0) {
                    showToast("This album has no tracks", "error");
                    return;
                  }
                  handleShufflePlay();
                }}
                className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer",
                  isShuffled
                    ? "bg-brand text-white shadow-lg"
                    : "bg-white/10 hover:bg-white/20 text-white/90 border border-white/10"
                )}
                title="Shuffle"
              >
                <Shuffle size={16} />
              </motion.button>

              {/* Play Pill: White pill with page color label and icon */}
              <motion.button
                whileTap={{ scale: 0.94 }}
                transition={{ type: "spring", stiffness: 450, damping: 24 }}
                onClick={() => {
                  if (trackCount === 0) {
                    showToast("This album has no tracks", "error");
                    return;
                  }
                  handlePlayAlbum();
                }}
                className="h-9 px-6 rounded-full bg-white text-[var(--page,#0f3434)] hover:bg-white/90 active:scale-95 transition-all shadow-md flex items-center justify-center gap-2 font-semibold text-[14px] cursor-pointer"
              >
                {isAlbumCurrentlyPlaying ? (
                  <>
                    <Pause size={15} fill="currentColor" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play size={15} fill="currentColor" className="ml-0.5" />
                    <span>Play</span>
                  </>
                )}
              </motion.button>

              {/* More options menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <motion.button
                    whileTap={{ scale: 0.88 }}
                    transition={{ type: "spring", stiffness: 450, damping: 24 }}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white/80 bg-white/10 hover:bg-white/20 border border-white/10 transition-all cursor-pointer"
                    title="More options"
                  >
                    <MoreHorizontal size={16} />
                  </motion.button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="start">
                  <DropdownMenuItem
                    onClick={() => {
                      if (!album?.tracks || album.tracks.length === 0) {
                        showToast("This album has no tracks", "error");
                        return;
                      }
                      usePlayerStore.getState().addToUserQueue(album.tracks, { contextName: album.title });
                      showToast("Album added to queue");
                    }}
                  >
                    <ListPlus size={14} className="mr-2 text-brand" />
                    <span>Add to Queue</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        navigator.clipboard.writeText(window.location.href);
                        showToast("Album link copied to clipboard");
                      }
                    }}
                  >
                    <Share2 size={14} className="mr-2 text-white/60" />
                    <span>Share Album</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* ── 3. Apple Music Tracklist (No redundant label, fluid spring rows) ────────── */}
        <div className="w-full mb-10 pt-2 border-t border-white/[0.08] min-w-0 max-w-full overflow-hidden">
          <div className="flex flex-col min-w-0 max-w-full">
            {album.tracks?.map((track: any, index: number) => {
              const isActive = isTrackMatch(currentTrack, track);
              const isTrackPlaying = isActive && isPlaying;

              return (
                <motion.div
                  key={`${track.id}-${index}`}
                  onClick={() => handlePlayTrack(track)}
                  whileHover={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}
                  whileTap={{ scale: 0.995 }}
                  transition={{ type: "spring", stiffness: 450, damping: 28 }}
                  className="group relative flex items-center justify-between py-2 sm:py-2.5 px-2 sm:px-3 rounded-lg cursor-pointer border-b border-white/[0.08] transition-colors w-full min-w-0 max-w-full overflow-hidden"
                >
                  {/* Left: Index / Visualizer + Title (Artist shown on side ONLY when playing) */}
                  <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1 mr-2 sm:mr-4 overflow-hidden">
                    {/* Index / Visualizer */}
                    <div className="w-6 flex items-center justify-center shrink-0">
                      {isTrackPlaying ? (
                        <div className="flex items-end gap-[1.5px] h-[13px]">
                          {[0.1, 0.4, 0.2, 0.5].map((d, i) => (
                            <motion.div
                              key={i}
                              animate={{ height: ["30%", "100%", "30%"] }}
                              transition={{
                                duration: 0.8 + i * 0.1,
                                repeat: Infinity,
                                ease: "easeInOut",
                                delay: d,
                              }}
                              className="w-[2.5px] bg-brand rounded-full"
                            />
                          ))}
                        </div>
                      ) : isActive ? (
                        <div className="w-2.5 h-2.5 rounded-full bg-brand animate-pulse" />
                      ) : (
                        <span className="text-[13px] sm:text-[14px] font-normal text-white/40 group-hover:text-white/80 tabular-nums">
                          {index + 1}
                        </span>
                      )}
                    </div>

                    {/* Track Title (Clean, single-line. Artist displayed on side ONLY when active) */}
                    <div className="flex items-center min-w-0 flex-1 overflow-hidden gap-2">
                      <span
                        className={cn(
                          "text-[14px] sm:text-[15px] truncate font-medium",
                          isActive ? "text-brand font-semibold" : "text-white group-hover:text-white"
                        )}
                      >
                        {formatDisplayTitle(track.title)}
                      </span>
                      {isActive && (
                        <span className="text-[12px] sm:text-[13px] text-white/45 truncate font-normal shrink-0">
                          · <ArtistLinks track={track} maxArtists={2} />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Duration + More Dropdown */}
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[12px] sm:text-[13px] text-white/40 font-normal tabular-nums select-none">
                      {formatDuration(track.duration)}
                    </span>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="p-1.5 text-white/30 hover:text-white transition-colors rounded-full hover:bg-white/10"
                          title="Track options"
                        >
                          <MoreHorizontal size={18} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-56" align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            usePlayerStore.getState().addToUserQueue(track);
                            showToast("Added to queue");
                          }}
                        >
                          <ListPlus size={14} className="mr-2 text-brand" />
                          <span>Add to Queue</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            const target = getArtistTarget(track) || getArtistTarget(album);
                            if (target) router.push(target);
                            else showToast("Artist details unavailable", "error");
                          }}
                        >
                          <User size={14} className="mr-2" /> Go to Artist
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-white/10" />
                        <DropdownMenuItem onClick={() => openAddToPlaylistModal(track)}>
                          <Plus size={14} className="mr-2" /> Add to Playlist
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => refetchTrackAudio(track, showToast)}>
                          <RefreshCw
                            size={14}
                            className={cn("mr-2", isRefetching === track.id && "animate-spin text-brand")}
                          />
                          <span>{isRefetching === track.id ? "Refetching Audio..." : "Refetch Audio"}</span>
                        </DropdownMenuItem>
                        <RefetchLyricsSubMenu
                          track={track}
                          refetchTrackLyrics={refetchTrackLyrics}
                          showToast={showToast}
                        />
                        <DropdownMenuItem onClick={() => openDownloadModal({ ...track, artist: album.artist })}>
                          <Download size={14} className="mr-2" /> Download
                        </DropdownMenuItem>
                        {user?.role === "ADMIN" && (
                          <DropdownMenuItem
                            onClick={() => router.push(`/admin/lyric-sync?trackId=${track.id}`)}
                            className="text-violet-400 focus:text-violet-300 cursor-pointer"
                          >
                            <Mic size={14} className="mr-2 text-violet-400" /> Sync Lyrics
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator className="bg-white/10" />
                        <DropdownMenuItem onClick={() => handleShare(track, "track")}>
                          <Share2 size={14} className="mr-2" /> Share
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {(!album?.tracks || album.tracks.length === 0) && (
            <div className="py-20 text-center flex flex-col items-center gap-3">
              <Music2 size={36} className="text-white/20" />
              <p className="text-xs font-bold text-white/30 tracking-widest uppercase">Sonic Archive Empty</p>
            </div>
          )}
        </div>

        {/* ── 4. Album Details ─────────────────────────────────────────────── */}
        <div className="mb-14 pt-2 text-[13px] text-white/50 space-y-1">
          <p className="font-semibold text-white/70">{formattedReleaseDate}</p>
          <p>
            {trackCount} {trackCount === 1 ? "song" : "songs"}, {totalDurationStr}
          </p>
          <p className="text-white/40 text-[12px] pt-1">
            ℗ {releaseYear} {album.artist?.name || "Zenify"}
          </p>
          <div className="pt-2">
            <a
              href={`https://music.apple.com/search?term=${encodeURIComponent(album.title + " " + (album.artist?.name || ""))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline font-medium"
            >
              <span>Also available on Apple Music</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </div>

        {/* ── 6. More by this artist ────────────────────────────────────────── */}
        {(otherAlbums?.length || 0) > 0 && (
          <div className="mb-14">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[20px] font-bold text-white">More by {album.artist?.name || "this artist"}</h3>
              {(album.artistId || getArtistTarget(album)) && (
                <Link
                  href={album.artistId ? `/artist/${album.artistId}` : (getArtistTarget(album) || "#")}
                  className="text-sm font-semibold text-brand hover:underline"
                >
                  See all
                </Link>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {otherAlbums.slice(0, 6).map((oth: any) => (
                <Link
                  key={oth.id}
                  href={`/album/${oth.id}`}
                  className="group flex flex-col gap-2 rounded-lg p-2 hover:bg-white/5 transition-all"
                >
                  <div className="w-full aspect-square rounded-md overflow-hidden bg-zinc-800 shadow relative">
                    <img
                      src={getMediaUrl(oth.coverUrl)}
                      alt={oth.title}
                      className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                    />
                  </div>
                  <span className="text-[14px] font-medium text-white truncate">{oth.title}</span>
                  <span className="text-[12px] text-white/50">
                    {oth.releaseDate ? new Date(oth.releaseDate).getFullYear() : "Album"}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── 8. You might also like ─────────────────────────────────────────── */}
        {(relatedArtists?.length || 0) > 0 && (
          <div className="mb-14">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[20px] font-bold text-white">You might also like</h3>
              <span className="text-sm font-semibold text-brand">See all</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {(relatedArtists || []).slice(0, 6).map((rel: any) => (
                <Link
                  key={rel.id}
                  href={`/artist/${rel.id}`}
                  className="group flex flex-col items-center text-center gap-2 rounded-lg p-2 hover:bg-white/5 transition-all"
                >
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden bg-zinc-800 shadow relative">
                    <img
                      src={getMediaUrl(rel.imageUrl || rel.coverUrl)}
                      alt={rel.name}
                      className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                    />
                  </div>
                  <span className="text-[14px] font-medium text-white truncate w-full">{rel.name}</span>
                  <span className="text-[12px] text-white/50">Artist</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── 9. Language Strip ────────────────────────────────────────────── */}
        <div className="mb-14 pt-4 border-t border-[var(--line)]">
          <div className="flex flex-wrap items-center gap-2">
            {["English", "தமிழ்", "हिंदी", "తెలుగు", "മലയാളം", "ಕನ್ನಡ"].map((lang) => (
              <button
                key={lang}
                onClick={() => router.push(`/search?q=${encodeURIComponent(lang)}`)}
                className="px-4 py-1.5 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 text-white/90 border border-white/10 transition-colors"
              >
                {lang}
              </button>
            ))}
            <button
              onClick={() => router.push("/discover")}
              className="px-4 py-1.5 rounded-full text-xs font-semibold bg-white/5 hover:bg-white/15 text-white/60 transition-colors"
            >
              More
            </button>
          </div>
        </div>

        {/* ── 10. Footer Section ────────────────────────────────────────────── */}
        <div className="pt-6 border-t border-[var(--line)] text-xs text-white/40 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/15 rounded-md text-white/80 transition-colors">
              <span>Country or region</span>
              <ChevronDown size={14} />
            </button>
            <p>Copyright © {new Date().getFullYear()} Zenify Inc. All rights reserved.</p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/terms" className="hover:underline">Terms</Link>
            <span>·</span>
            <Link href="/privacy" className="hover:underline">Privacy</Link>
            <span>·</span>
            <Link href="/cookies" className="hover:underline">Cookies</Link>
            <span>·</span>
            <Link href="/support" className="hover:underline">Support</Link>
            <span>·</span>
            <Link href="/feedback" className="hover:underline">Feedback</Link>
          </div>
        </div>
      </div>

      {/* Floating Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={`fixed bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 rounded-2xl border backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-[9999] ${
              toast.type === "error"
                ? "bg-red-500/10 border-red-500/20 text-red-400"
                : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
            }`}
          >
            {toast.type === "success" ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
            <span className="text-[13px] font-semibold tracking-tight">{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
