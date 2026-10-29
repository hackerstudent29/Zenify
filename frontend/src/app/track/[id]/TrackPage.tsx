"use client";

/**
 * TrackPage — Apple Music album-page style
 *
 * Layout mirrors AlbumPage:
 *  • Large artwork left, metadata right (md+), stacked on mobile
 *  • Play pill + Shuffle pill + icon buttons (Like, Lyrics, More)
 *  • Tracklist below divider
 *  • Footer meta (date, length, copyright)
 *  • Bottom sections: "More by [Artist]" + "You Might Also Like" carousels
 *    with artist-page–sized round artwork cards
 */

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Play,
  Pause,
  Heart,
  Disc3,
  Check,
  X,
  Shuffle,
  ScrollText,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

import api from "@/lib/api";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { ArtistLinks } from "@/components/shared/ArtistLinks";
import { DynamicBackground } from "@/components/shared/DynamicBackground";
import { TrackActionsDropdown } from "@/components/shared/TrackActionsDropdown";
import { MediaCard, MEDIA_CARD_WIDTH } from "@/components/shared/MediaCard";
import { applyArtworkTheme, resetArtworkTheme, extractArtworkAverageColor } from "@/lib/theme";
import { getMediaUrl, cn, formatDisplayTitle, decodeHtmlEntities, getArtistTarget } from "@/lib/utils";

/* ─────────────────────────────────── Micro pieces ─────────────────────────────────── */

function PillButton({
  children,
  onClick,
  variant = "glass",
  active,
  label,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  variant?: "solid" | "glass";
  active?: boolean;
  label?: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.1 }}
      className={cn(
        "flex h-[38px] min-w-[110px] cursor-pointer items-center justify-center gap-2 rounded-full px-5 text-[14px] font-semibold tracking-[-0.01em] outline-none transition-colors",
        variant === "solid"
          ? "bg-white text-[var(--page,#0d1117)] shadow-md hover:bg-white/90"
          : cn(
              "border border-white/15 backdrop-blur-xl",
              active
                ? "bg-brand/20 text-brand border-brand/40"
                : "bg-white/10 text-white hover:bg-white/[0.18]"
            )
      )}
    >
      {children}
    </motion.button>
  );
}

const IconCircle = React.forwardRef<
  HTMLButtonElement,
  {
    children: React.ReactNode;
    title: string;
    active?: boolean;
    onClick?: (e: React.MouseEvent) => void;
  } & Omit<React.ComponentPropsWithoutRef<"button">, "onClick" | "title" | "children">
>(function IconCircle({ children, title, active, onClick, className, ...rest }, ref) {
  return (
    <motion.button
      ref={ref as any}
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      transition={{ duration: 0.1 }}
      className={cn(
        "flex size-[38px] cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/10 outline-none backdrop-blur-xl transition-colors hover:bg-white/[0.18]",
        active ? "text-brand border-brand/40 bg-brand/20" : "text-white/80",
        className
      )}
      {...(rest as any)}
    >
      {children}
    </motion.button>
  );
});

function Equalizer({ playing }: { playing: boolean }) {
  const reduce = useReducedMotion();
  const frames = [
    [0.35, 1, 0.45, 0.85, 0.35],
    [0.9, 0.4, 1, 0.5, 0.9],
    [0.5, 0.85, 0.35, 1, 0.5],
  ];
  return (
    <span className="flex h-3.5 items-end gap-[2px]" aria-hidden="true">
      {frames.map((f, i) => (
        <motion.span
          key={i}
          className="w-[2.5px] origin-bottom rounded-full bg-brand"
          style={{ height: "100%" }}
          animate={playing && !reduce ? { scaleY: f } : { scaleY: 0.3 }}
          transition={
            playing && !reduce
              ? { duration: 0.8 + i * 0.12, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.2 }
          }
        />
      ))}
    </span>
  );
}

/* Horizontal scroll carousel — identical structure to FansAlsoLike on artist page */
function HorizontalCarousel({
  title,
  seeAllHref,
  children,
}: {
  title: string;
  seeAllHref?: string;
  children: React.ReactNode;
}) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [canL, setCanL] = useState(false);
  const [canR, setCanR] = useState(false);

  const check = useCallback(() => {
    if (!el) return;
    setCanL(el.scrollLeft > 4);
    setCanR(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, [el]);

  useEffect(() => {
    check();
    if (!el) return;
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", check); ro.disconnect(); };
  }, [el, check]);

  const scroll = (dir: "left" | "right") => {
    if (!el) return;
    const style = getComputedStyle(el);
    const visible = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    el.scrollBy({ left: (dir === "left" ? -1 : 1) * Math.max(visible * 0.85, 240), behavior: "smooth" });
  };

  const EDGE_L = "calc(var(--sb-w) + var(--row-gutter, 28px))";
  const EDGE_R = "calc(var(--rp-w) + var(--row-gutter, 28px))";

  const arrowBase =
    "am-glass-chip absolute top-[calc(50%-28px)] z-30 hidden h-12 w-9 -translate-y-1/2 items-center justify-center " +
    "rounded-full text-white shadow-[0_8px_24px_rgba(0,0,0,0.45)] opacity-0 outline-none md:flex " +
    "transition-[opacity,transform] duration-300 hover:scale-105 active:scale-90 " +
    "group-hover/carousel:opacity-100 focus-visible:opacity-100 cursor-pointer";

  return (
    <div className="group/carousel mb-16 w-full select-none">
      <div className="mb-3 flex items-end justify-between" style={{ paddingInline: "var(--row-gutter, 28px)" }}>
        <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.022em] text-white">
          {title}
        </h2>
        {seeAllHref && (
          <Link href={seeAllHref} className="text-[13px] font-semibold text-brand hover:underline">
            See All
          </Link>
        )}
      </div>

      <div
        className="am-layout-transition relative"
        style={{
          marginLeft: "calc(var(--sb-w) * -1)",
          marginRight: "calc(var(--rp-w) * -1)",
        }}
      >
        {canL && (
          <button
            type="button"
            onClick={() => scroll("left")}
            aria-label="Scroll left"
            className={cn(arrowBase, "am-layout-transition")}
            style={{ left: "calc(var(--sb-w) + 12px)" }}
          >
            <ChevronLeft size={22} strokeWidth={2.4} />
          </button>
        )}
        {canR && (
          <button
            type="button"
            onClick={() => scroll("right")}
            aria-label="Scroll right"
            className={cn(arrowBase, "am-layout-transition")}
            style={{ right: "calc(var(--rp-w) + 12px)" }}
          >
            <ChevronRight size={22} strokeWidth={2.4} />
          </button>
        )}

        <div
          ref={setEl}
          className="am-layout-transition no-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto overscroll-x-contain pb-6 pt-1"
          style={{
            paddingLeft: EDGE_L,
            paddingRight: EDGE_R,
            scrollPaddingLeft: EDGE_L,
            scrollPaddingRight: EDGE_R,
            WebkitOverflowScrolling: "touch",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────── Page ─────────────────────────────────── */

export default function TrackPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string);
  const id = rawId ? rawId.replace(/^(itunes-)+/, "itunes-") : rawId;

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const setTrack = usePlayerStore((s) => s.setTrack);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const isShuffled = usePlayerStore((s) => s.isShuffled);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const queue = usePlayerStore((s) => s.queue);
  const updateCurrentTrackData = usePlayerStore((s) => s.updateCurrentTrackData);

  const { setPlayerMinimized, isLyricsOpen, setIsLyricsOpen } = useUIStore();
  const setPageCoverUrl = useUIStore((s) => s.setPageCoverUrl);
  const queryClient = useQueryClient();

  const [previousTrackId, setPreviousTrackId] = useState<string | null>(currentTrack?.id || null);

  useEffect(() => {
    if (currentTrack && previousTrackId && currentTrack.id !== previousTrackId) {
      if (!currentTrack.id.startsWith("yt-")) router.replace(`/track/${currentTrack.id}`);
    }
    if (currentTrack) setPreviousTrackId(currentTrack.id);
  }, [currentTrack, previousTrackId, router]);

  /* ─── Main track query ─── */
  const { data: dbTrack, isLoading } = useQuery({
    queryKey: ["track-detail", id],
    queryFn: async () => (await api.get(`/tracks/${id}`)).data,
    enabled: !!id,
    refetchInterval: (query: any) => {
      const d = query?.state?.data;
      if (!d) return false;
      if (!d.palette || !d.lyrics || !d.synced_lyrics) return 2000;
      return false;
    },
  });

  const currentOrQueueTrack =
    currentTrack && (currentTrack.id === id || (currentTrack as any).youtubeId === id)
      ? currentTrack
      : queue.find((t) => t.id === id || (t as any).youtubeId === id);

  const track = dbTrack || currentOrQueueTrack;
  const trackCoverUrl = track ? getMediaUrl(track.coverUrl) || "/logo.png" : null;

  /* ─── Artist ID for related queries ─── */
  const artistId = dbTrack?.artist?.id || dbTrack?.artistId;

  /* ─── More by this artist ─── */
  const { data: artistData } = useQuery({
    queryKey: ["artist-for-track", artistId],
    queryFn: async () => {
      if (!artistId) return null;
      const res = await api.get(`/artists/${encodeURIComponent(artistId)}`);
      return res.data;
    },
    enabled: !!artistId,
    staleTime: 1000 * 60 * 10,
  });

  /* ─── Related artists (You Might Also Like) ─── */
  const { data: relatedArtists = [] } = useQuery({
    queryKey: ["related-artists-for-track", artistId],
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
    staleTime: 1000 * 60 * 10,
  });

  /* ─── Artwork tint ─── */
  useEffect(() => {
    if (!trackCoverUrl) return;
    extractArtworkAverageColor(trackCoverUrl).then((rgb) => {
      if (rgb) applyArtworkTheme(rgb[0], rgb[1], rgb[2]);
    });
    return () => resetArtworkTheme();
  }, [trackCoverUrl]);

  /* ─── Instant DB import for YT/unsaved tracks ─── */
  useEffect(() => {
    if (!dbTrack && currentOrQueueTrack && !isLoading) {
      api
        .post("/tracks/import-instant", {
          title: currentOrQueueTrack.title,
          artistName:
            currentOrQueueTrack.artist?.name || (currentOrQueueTrack as any).artistName || "Unknown Artist",
          albumTitle: currentOrQueueTrack.album?.title || (currentOrQueueTrack as any).albumTitle,
          coverUrl: currentOrQueueTrack.coverUrl,
          audioUrl: currentOrQueueTrack.audioUrl,
          duration: currentOrQueueTrack.duration,
          lyrics: currentOrQueueTrack.lyrics,
          id: currentOrQueueTrack.id,
          sourceId: (currentOrQueueTrack as any).youtubeId,
        })
        .then((res) => {
          if (res.data) {
            queryClient.setQueryData(["track-detail", id], res.data);
            queryClient.invalidateQueries({ queryKey: ["track-detail", id] });
          }
        })
        .catch((err) => console.warn("[TrackPage] Instant auto-import warning:", err.message));
    }
  }, [dbTrack, currentOrQueueTrack, isLoading, id, queryClient]);

  /* ─── Push enriched metadata into player ─── */
  useEffect(() => {
    if (dbTrack && currentTrack?.id === dbTrack.id) {
      const needsLyrics = !currentTrack.lyrics && dbTrack.lyrics;
      const needsPalette = !currentTrack.palette && dbTrack.palette;
      const needsSynced = !currentTrack.synced_lyrics && dbTrack.synced_lyrics;
      if (needsLyrics || needsPalette || needsSynced) {
        updateCurrentTrackData({
          lyrics: dbTrack.lyrics || currentTrack.lyrics,
          synced_lyrics: dbTrack.synced_lyrics || currentTrack.synced_lyrics,
          romanizedLyrics: dbTrack.romanizedLyrics || currentTrack.romanizedLyrics,
          palette: dbTrack.palette || currentTrack.palette,
        });
      }
    }
  }, [dbTrack?.id, dbTrack?.lyrics, dbTrack?.palette, dbTrack?.synced_lyrics, currentTrack?.id, updateCurrentTrackData]);

  /* ─── Background worker ─── */
  useEffect(() => {
    const handler = (e: any) => {
      if (e?.detail?.id === id) queryClient.invalidateQueries({ queryKey: ["track-detail", id] });
    };
    window.addEventListener("zenify:track-updated", handler);
    return () => window.removeEventListener("zenify:track-updated", handler);
  }, [id, queryClient]);

  /* ─── Page cover ─── */
  useEffect(() => {
    if (track?.coverUrl) setPageCoverUrl(track.coverUrl);
  }, [track?.coverUrl, setPageCoverUrl]);
  useEffect(() => () => setPageCoverUrl(null), [setPageCoverUrl]);

  /* ─── Toast ─── */
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    useUIStore.getState().showToast(msg, type);
    setTimeout(() => setToast(null), 2500);
  };

  /* ─── Likes ─── */
  const { data: likedTrackIds } = useQuery({
    queryKey: ["liked-track-ids"],
    queryFn: async () => {
      const res = await api.get("/tracks/liked");
      const arr = Array.isArray(res.data) ? res.data : res.data?.items || [];
      return arr.map((t: any) => t.id);
    },
    staleTime: 1000 * 60 * 5,
  });
  const isLiked = likedTrackIds?.includes(id);

  const toggleLikeMutation = useMutation({
    mutationFn: () => api.post(`/tracks/${id}/like`),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["liked-track-ids"] });
      const prev = queryClient.getQueryData<string[]>(["liked-track-ids"]);
      const was = prev?.includes(id);
      queryClient.setQueryData(
        ["liked-track-ids"],
        prev ? (was ? prev.filter((t) => t !== id) : [...prev, id]) : [id]
      );
      showToast(was ? "Removed from Liked Songs" : "Added to Liked Songs");
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) queryClient.setQueryData(["liked-track-ids"], ctx.prev);
      showToast("Failed to update liked state", "error");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["liked-track-ids"] });
      queryClient.invalidateQueries({ queryKey: ["liked-tracks"] });
    },
  });

  /* ─── Playback ─── */
  const isCurrentTrack = currentTrack?.id === id;
  const isCurrentTrackPlaying = isCurrentTrack && isPlaying;

  const handlePlayTrack = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!track) return;
    if (isCurrentTrack) {
      togglePlay();
    } else {
      const inQueue = queue.some((t) => t.id === track.id);
      setTrack(track, inQueue ? queue : [...queue, track]);
      setPlayerMinimized(false);
    }
  };

  const handleShuffle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleShuffle();
    if (!isCurrentTrack && track) {
      setTrack(track, [track]);
      if (!isPlaying) togglePlay();
      setPlayerMinimized(false);
    }
  };

  const handleLyricsToggle = () => setIsLyricsOpen(!isLyricsOpen);

  /* ─── Loading / not found ─── */
  if (isLoading && !track)
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <ZenLoading size="md" />
      </div>
    );

  if (!track)
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <div className="flex size-20 items-center justify-center rounded-[18px] bg-white/[0.06]">
          <Disc3 size={36} className="text-white/25" strokeWidth={1.2} />
        </div>
        <p className="text-[15px] font-medium text-white/50">Song not found</p>
        <button
          onClick={() => router.back()}
          className="cursor-pointer rounded-full bg-white/[0.14] px-5 py-2 text-[14px] font-semibold text-brand hover:bg-white/[0.2]"
        >
          Go Back
        </button>
      </div>
    );

  /* ─── Derived display data ─── */
  const coverUrl = trackCoverUrl || getMediaUrl(track.coverUrl) || "/logo.png";
  const totalMins = Math.floor(track.duration / 60);
  const totalSecs = track.duration % 60;
  const durationStr = `${totalMins}:${String(totalSecs).padStart(2, "0")}`;
  const formattedTitle = formatDisplayTitle(track.title) || "";

  const extractMovieFromTitle = (s: string): string | null => {
    if (!s) return null;
    const m = decodeHtmlEntities(s).match(/[\(\[]\s*From\s+["'"]?([^"'"\)\]]+)["'"]?\s*[\)\]]/i);
    return m ? m[1].trim() : null;
  };

  const embeddedMovie = extractMovieFromTitle(track.title);
  const rawAlbumTitle = decodeHtmlEntities(
    (track.album?.title || (track as any).albumTitle || (track as any).collectionName || "").trim()
  );
  const isSameAsSong = rawAlbumTitle.toLowerCase() === track.title.trim().toLowerCase();
  const albumDisplay = embeddedMovie
    ? embeddedMovie
    : !isSameAsSong && rawAlbumTitle && rawAlbumTitle.toLowerCase() !== "unknown"
    ? rawAlbumTitle
    : "Single";

  const rawAlbumId = track.album?.id || track.albumId || (track as any).collectionId;
  const isExternalAlbum =
    rawAlbumId &&
    ["saavn-album-", "itunes-album-", "yt-album-"].some((p) => String(rawAlbumId).startsWith(p));
  const albumTarget = embeddedMovie
    ? embeddedMovie
    : isExternalAlbum
    ? rawAlbumId
    : albumDisplay && albumDisplay !== "Single"
    ? albumDisplay
    : rawAlbumId;
  const albumHref = albumTarget ? `/album/${encodeURIComponent(albumTarget)}` : undefined;

  const rawLabel = (track as any).label || (track as any).publisher || (track.album as any)?.label;
  const labelDisplay =
    !rawLabel || ["unknown", "null"].includes(rawLabel.trim().toLowerCase()) ? "Zenify" : rawLabel;

  const dateSrc = track.releaseDate || track.createdAt;
  const releaseDate = (() => {
    try {
      return new Date(dateSrc).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
    } catch {
      return "";
    }
  })();
  const year = (() => {
    const y = new Date(dateSrc).getFullYear();
    return Number.isFinite(y) ? String(y) : "";
  })();
  const genre: string =
    typeof (track as any).genre === "string" ? (track as any).genre : (track as any).genre?.name || "";

  const titleSize =
    formattedTitle.length > 40
      ? "text-[22px] sm:text-[26px] md:text-[28px]"
      : formattedTitle.length > 28
      ? "text-[26px] sm:text-[30px] md:text-[34px]"
      : "text-[28px] sm:text-[34px] md:text-[40px]";

  /* Albums by the same artist (strip the current track's album) */
  const otherAlbums: any[] = (artistData?.albums || []).filter(
    (a: any) => a.id !== rawAlbumId && a.id !== (track.album?.id || track.albumId)
  );

  const artistName: string =
    track.artist?.name || (track as any).artistName || artistData?.name || "";

  return (
    <div className="relative min-h-screen w-full text-foreground">
      {/* Flowing artwork background — full bleed behind everything */}
      <div
        className="am-layout-transition pointer-events-none absolute inset-0 z-0 select-none overflow-hidden"
        style={{
          marginLeft: "calc(var(--sb-w) * -1)",
          marginRight: "calc(var(--rp-w) * -1)",
          width: "calc(100% + var(--sb-w) + var(--rp-w))",
        }}
      >
        <DynamicBackground surface="trackPage" coverUrl={coverUrl} palette={track?.palette} />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-full px-4 pb-32 pt-4 sm:px-8 md:pt-[100px]">

        {/* ── Hero: artwork + meta ── */}
        <motion.header
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center gap-6 text-center md:flex-row md:items-end md:gap-8 md:text-left mb-10 md:mb-12"
        >
          {/* Artwork */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="shrink-0"
          >
            <img
              src={coverUrl}
              alt={`Cover art for ${track.title}`}
              width={340}
              height={340}
              fetchPriority="high"
              decoding="async"
              className="aspect-square w-[min(280px,80vw)] sm:w-[310px] md:w-[338px] rounded-lg bg-zinc-900 object-cover shadow-2xl ring-1 ring-white/10"
            />
          </motion.div>

          {/* Metadata stack */}
          <div className="flex min-w-0 flex-1 flex-col items-center md:items-start">
            {/* Song type badge */}
            <span className="mb-2 text-[11px] font-black uppercase tracking-[0.4em] text-brand">
              {genre || "Song"}
            </span>

            {/* Title */}
            <h1
              className={cn(
                "w-full font-bold leading-[1.12] tracking-[-0.025em] text-white break-words line-clamp-3",
                titleSize
              )}
              title={formattedTitle}
            >
              {formattedTitle}
            </h1>

            {/* Artist */}
            <div className="mt-2 max-w-full text-[17px] sm:text-[20px] font-normal text-zinc-400">
              <ArtistLinks
                track={track}
                maxArtists={4}
                linkClassName="text-zinc-400 hover:text-white hover:underline font-normal transition-colors"
              />
            </div>

            {/* Album + year */}
            <div className="mt-1 flex items-center gap-2 text-[13px] font-medium text-white/50 flex-wrap justify-center md:justify-start">
              {albumDisplay && albumDisplay !== "Single" && (
                <>
                  {albumHref ? (
                    <Link href={albumHref} className="hover:text-brand hover:underline transition-colors">
                      {albumDisplay}
                    </Link>
                  ) : (
                    <span>{albumDisplay}</span>
                  )}
                  <span>·</span>
                </>
              )}
              {year && <span>{year}</span>}
              <span>·</span>
              <span className="text-white/80 font-semibold">Lossless</span>
            </div>

            {/* Action controls */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 md:justify-start">
              {/* Play pill — white like AlbumPage */}
              <PillButton variant="solid" onClick={handlePlayTrack} label={isCurrentTrackPlaying ? "Pause" : "Play"}>
                {isCurrentTrackPlaying ? (
                  <Pause size={16} fill="currentColor" />
                ) : (
                  <Play size={16} fill="currentColor" className="ml-0.5" />
                )}
                {isCurrentTrackPlaying ? "Pause" : "Play"}
              </PillButton>

              {/* Shuffle */}
              <PillButton active={isShuffled} onClick={handleShuffle} label="Shuffle">
                <Shuffle size={16} />
                Shuffle
              </PillButton>

              {/* Like */}
              <IconCircle
                title={isLiked ? "Unlike" : "Like"}
                active={!!isLiked}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLikeMutation.mutate();
                }}
              >
                <motion.span
                  className="flex"
                  initial={false}
                  animate={{ scale: isLiked ? [1, 1.35, 1] : 1 }}
                  transition={isLiked ? { duration: 0.4, ease: [0.34, 1.56, 0.64, 1] } : { duration: 0.1 }}
                >
                  <Heart size={17} className={cn(isLiked && "fill-current")} />
                </motion.span>
              </IconCircle>

              {/* Lyrics */}
              <IconCircle
                title={isLyricsOpen ? "Close Lyrics" : "View Lyrics"}
                active={isLyricsOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isCurrentTrack && track) {
                    setTrack(track, [track]);
                    setPlayerMinimized(false);
                  }
                  handleLyricsToggle();
                }}
              >
                <ScrollText size={17} />
              </IconCircle>

              {/* Three-dot — glass aligned with AlbumPage */}
              <TrackActionsDropdown
                track={track}
                context="track-page"
                align="start"
                glass
                isLyricsOpen={isLyricsOpen}
                onLyricsToggle={handleLyricsToggle}
                showToast={showToast}
                trigger={
                  <IconCircle title="More options" aria-haspopup="menu">
                    <MoreHorizontal size={19} />
                  </IconCircle>
                }
              />
            </div>
          </div>
        </motion.header>

        {/* ── Track list ── */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.08, duration: 0.3 }}
          aria-label="Songs"
          className="w-full mb-6"
        >
          <div className="h-px bg-white/[0.08]" />

          <div
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-2 py-3 transition-colors",
              isCurrentTrack ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"
            )}
          >
            {/* Index / Equalizer */}
            <div className="w-6 shrink-0 flex items-center justify-center text-[14px] font-normal tabular-nums text-white/40">
              {isCurrentTrackPlaying ? (
                <Equalizer playing />
              ) : isCurrentTrack ? (
                <div className="w-2.5 h-2.5 rounded-full bg-brand animate-pulse" />
              ) : (
                <span>1</span>
              )}
            </div>

            {/* Thumbnail with play overlay */}
            <button
              type="button"
              onClick={handlePlayTrack}
              aria-label={isCurrentTrackPlaying ? "Pause" : "Play"}
              className="relative size-12 shrink-0 cursor-pointer overflow-hidden rounded-[6px] bg-zinc-900 outline-none ring-1 ring-white/10"
            >
              <img src={coverUrl} alt="" className="size-full object-cover" loading="lazy" />
              <span
                className={cn(
                  "absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[2px] transition-opacity duration-150",
                  isCurrentTrackPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
              >
                {isCurrentTrackPlaying ? (
                  <Pause size={15} className="fill-white text-white" />
                ) : (
                  <Play size={15} className="ml-0.5 fill-white text-white" />
                )}
              </span>
            </button>

            {/* Title + artist */}
            <div className="flex min-w-0 flex-1 flex-col">
              <button onClick={handlePlayTrack} className="w-fit max-w-full cursor-pointer text-left outline-none">
                <span
                  className={cn(
                    "block truncate text-[15px] font-medium tracking-[-0.01em]",
                    isCurrentTrack ? "text-brand font-semibold" : "text-white"
                  )}
                >
                  {formattedTitle}
                </span>
              </button>
              <div className="truncate text-[13px] text-white/50 mt-0.5">
                <ArtistLinks
                  track={track}
                  maxArtists={3}
                  linkClassName="text-white/50 hover:text-white hover:underline"
                />
              </div>
            </div>

            {/* Album — shown md+ */}
            <div className="hidden min-w-0 basis-[30%] truncate text-[13px] text-white/45 md:block">
              {albumHref ? (
                <Link href={albumHref} className="hover:text-white hover:underline transition-colors">
                  {albumDisplay}
                </Link>
              ) : (
                <span>{albumDisplay}</span>
              )}
            </div>

            {/* Duration */}
            <span className="w-10 shrink-0 text-right text-[13px] tabular-nums text-white/45">
              {durationStr}
            </span>

            {/* Row menu */}
            <TrackActionsDropdown
              track={track}
              context="track-page"
              align="end"
              glass
              isLyricsOpen={isLyricsOpen}
              onLyricsToggle={handleLyricsToggle}
              showToast={showToast}
              triggerClassName="size-8 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            />
          </div>

          <div className="h-px bg-white/[0.08]" />
        </motion.section>

        {/* ── Footer metadata ── */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.12, duration: 0.3 }}
          className="mb-14 space-y-0.5 text-[13px] leading-relaxed text-white/50"
        >
          {releaseDate && <p className="font-semibold text-white/70">{releaseDate}</p>}
          <p>1 song, {totalMins} minute{totalMins !== 1 ? "s" : ""}</p>
          <p>℗ {year} {artistName || <span className="font-zenify">zenify</span>}</p>
          <div className="pt-2">
            <a
              href={`https://music.apple.com/search?term=${encodeURIComponent(formattedTitle + " " + artistName)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline font-medium"
            >
              <span>Also available on Apple Music</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </motion.footer>

        {/* ── More by this artist ── */}
        {otherAlbums.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.3 }}
          >
            <HorizontalCarousel
              title={`More by ${artistName}`}
              seeAllHref={artistId ? `/artist/${artistId}` : getArtistTarget(track) || undefined}
            >
              {otherAlbums.map((alb: any) => (
                <Link
                  key={alb.id}
                  href={`/album/${alb.id}`}
                  className="group w-[150px] sm:w-[165px] md:w-[180px] shrink-0 flex flex-col gap-2 rounded-lg p-1.5 hover:bg-white/5 transition-all"
                  style={{ scrollSnapAlign: "start" }}
                >
                  <div className="w-full aspect-square rounded-[8px] overflow-hidden bg-white/[0.06] shadow-[0_2px_10px_rgba(0,0,0,0.35)] ring-1 ring-inset ring-white/10">
                    <img
                      src={getMediaUrl(alb.coverUrl) || "/logo.png"}
                      alt={alb.title || "Album"}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                  <p className="text-[14px] font-medium text-white truncate leading-tight group-hover:text-brand transition-colors">
                    {alb.title}
                  </p>
                  <p className="text-[12px] text-white/50">
                    {alb.releaseDate ? new Date(alb.releaseDate).getFullYear() : "Album"}
                  </p>
                </Link>
              ))}
            </HorizontalCarousel>
          </motion.div>
        )}

        {/* ── You Might Also Like (related artists) — artist-page–sized round cards ── */}
        {relatedArtists.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: 0.3 }}
          >
            <HorizontalCarousel title="You Might Also Like">
              {relatedArtists.map((rel: any) => (
                <Link
                  key={rel.id}
                  href={`/artist/${rel.id}`}
                  className="group shrink-0 flex flex-col items-center text-center gap-3 rounded-lg p-2 hover:bg-white/5 transition-all"
                  style={{
                    width: "calc(var(--artist-card-w, 140px))",
                    scrollSnapAlign: "start",
                  }}
                >
                  {/* Round artwork — same proportions as artist-page circular portraits */}
                  <div
                    className="w-full aspect-square rounded-full overflow-hidden bg-zinc-800 ring-1 ring-inset ring-white/10 shadow-xl shadow-black/40 group-hover:ring-2 group-hover:ring-brand/50 transition-all duration-300"
                    style={{ width: "min(128px, 100%)", height: "min(128px, 100%)" }}
                  >
                    <img
                      src={getMediaUrl(rel.imageUrl || rel.coverUrl) || "/logo.png"}
                      alt={rel.name || "Artist"}
                      className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-white truncate group-hover:text-brand transition-colors w-[120px]">
                      {rel.name}
                    </p>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-white/45 mt-0.5">
                      Artist
                    </p>
                  </div>
                </Link>
              ))}
            </HorizontalCarousel>
          </motion.div>
        )}
      </div>

      {/* ── Toast ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-24 left-1/2 z-[9999] flex -translate-x-1/2 items-center gap-2.5 whitespace-nowrap rounded-xl border border-white/[0.14] bg-[#242426]/85 py-2.5 pl-3 pr-4 text-[13.5px] font-medium text-white shadow-[0_16px_40px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
          >
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full",
                toast.type === "error" ? "bg-red-500/25 text-red-400" : "bg-emerald-500/25 text-emerald-400"
              )}
            >
              {toast.type === "success" ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
            </span>
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
