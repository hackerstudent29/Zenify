"use client";

/**
 * TrackPage — Apple Music song/album-page style
 *
 * Mobile  (<640)   : centered artwork → title → artist → meta → action row → list
 * Tablet  (640–767): same stack, larger artwork
 * md+     (768+)   : artwork left, metadata + actions right (bottom-aligned)
 *
 * • Song row is minimal: index / play · title + artist · duration (tap row to play).
 *   No album name and no three-dot menu inside the list.
 * • The three-dot menu and all other actions live only in the hero.
 * • "More by [Artist]" and "You Might Also Like" carousels are unchanged in content.
 */

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Play, Pause, Disc3, Check, X, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { SwiftUILyrics, SwiftUIHeart } from "@/components/ui/SwiftUIIcons";

import api from "@/lib/api";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { ArtistLinks } from "@/components/shared/ArtistLinks";
import { DynamicBackground } from "@/components/shared/DynamicBackground";
import { TrackActionsDropdown } from "@/components/shared/TrackActionsDropdown";
import { MediaActionButtons } from "@/components/shared/MediaActionButtons";
import { applyArtworkTheme, resetArtworkTheme, extractArtworkAverageColor } from "@/lib/theme";
import {
  getMediaUrl,
  cn,
  formatDisplayTitle,
  decodeHtmlEntities,
  getArtistTarget,
  getArtistProfileImage,
} from "@/lib/utils";

/**
 * If your MediaActionButtons does NOT already render the three-dot menu itself,
 * set this to true and the hero will render TrackActionsDropdown next to the
 * lyrics button. Leave false if MediaActionButtons already shows the ⋯ button
 * (avoids a duplicate).
 */
const RENDER_HERO_MENU_SEPARATELY = false;

/* ─────────────────────────────────── Micro pieces ─────────────────────────────────── */

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

/* Horizontal scroll carousel — same structure as FansAlsoLike on the artist page */
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
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, [el, check]);

  const scroll = (dir: "left" | "right") => {
    if (!el) return;
    const style = getComputedStyle(el);
    const visible = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    el.scrollBy({ left: (dir === "left" ? -1 : 1) * Math.max(visible * 0.85, 240), behavior: "smooth" });
  };

  const EDGE_L = "calc(var(--sb-w) + var(--row-gutter, 20px))";
  const EDGE_R = "calc(var(--rp-w) + var(--row-gutter, 20px))";

  const arrowBase =
    "am-glass-chip absolute top-[calc(50%-28px)] z-30 hidden h-12 w-9 -translate-y-1/2 items-center justify-center " +
    "rounded-full text-white shadow-[0_8px_24px_rgba(0,0,0,0.45)] opacity-0 outline-none md:flex " +
    "transition-[opacity,transform] duration-300 hover:scale-105 active:scale-90 " +
    "group-hover/carousel:opacity-100 focus-visible:opacity-100 cursor-pointer";

  return (
    <section className="group/carousel mb-10 w-full select-none md:mb-14">
      <div className="mb-2 flex items-end justify-between md:mb-3" style={{ paddingInline: "var(--row-gutter, 20px)" }}>
        <h2 className="text-[19px] font-semibold leading-tight tracking-[-0.022em] text-white md:text-[22px]">
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
          className="am-layout-transition no-scrollbar flex snap-x snap-proximity gap-3 overflow-x-auto overscroll-x-contain pb-4 pt-1 sm:gap-4 md:gap-5 md:pb-6"
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
    </section>
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

  // Stabilise the cover URL so the artwork tint effect only re-fires when the
  // URL genuinely changes (prevents a double-flash when currentOrQueueTrack and
  // dbTrack deliver the same URL at different times).
  const rawCoverUrl = track ? getMediaUrl(track.coverUrl) || "/logo.png" : null;
  const [trackCoverUrl, setTrackCoverUrl] = useState<string | null>(rawCoverUrl);
  useEffect(() => {
    if (rawCoverUrl && rawCoverUrl !== "/logo.png" && rawCoverUrl !== trackCoverUrl) {
      setTrackCoverUrl(rawCoverUrl);
    } else if (rawCoverUrl && trackCoverUrl === null) {
      setTrackCoverUrl(rawCoverUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawCoverUrl]);

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

  /* ─── Artwork tint (cancel guard so a late promise never re-tints after reset) ─── */
  useEffect(() => {
    if (!trackCoverUrl) return;
    let cancelled = false;
    extractArtworkAverageColor(trackCoverUrl).then((rgb) => {
      if (!cancelled && rgb) applyArtworkTheme(rgb[0], rgb[1], rgb[2]);
    });
    // Do NOT reset here — that would flash neutral on every URL change.
    return () => {
      cancelled = true;
    };
  }, [trackCoverUrl]);

  // Reset the theme only when the page really unmounts.
  useEffect(() => {
    return () => resetArtworkTheme();
  }, []);

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

  /* ─── Push enriched metadata into the player ─── */
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbTrack?.id, dbTrack?.lyrics, dbTrack?.palette, dbTrack?.synced_lyrics, currentTrack?.id, updateCurrentTrackData]);

  /* ─── Background worker events ─── */
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

  /* ─── Toast (timer is cleared so quick successive toasts don't cut each other off) ─── */
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    useUIStore.getState().showToast(msg, type);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  /* ─── Likes ─── */
  const { data: likedTrackIds = [] } = useQuery<string[]>({
    queryKey: ["liked-track-ids"],
    queryFn: async () => {
      try {
        const res = await api.get("tracks/liked");
        const arr = Array.isArray(res.data) ? res.data : res.data?.items || [];
        return arr.map((t: any) => t.id) as string[];
      } catch {
        return [];
      }
    },
    staleTime: 1000 * 60 * 5,
  });
  const isLiked = likedTrackIds.includes(id) || (track?.id && likedTrackIds.includes(track.id));

  const toggleLikeMutation = useMutation({
    mutationFn: async () => {
      const targetId = track?.id || id;
      const res = await api.post(`tracks/${targetId}/like`, track);
      return res.data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["liked-track-ids"] });
      const prev = queryClient.getQueryData<string[]>(["liked-track-ids"]) || [];
      const targetId = track?.id || id;
      const was = prev.includes(targetId) || prev.includes(id);
      const next = was ? prev.filter((t) => t !== id && t !== targetId) : [...prev, targetId];
      queryClient.setQueryData(["liked-track-ids"], next);
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
      queryClient.invalidateQueries({ queryKey: ["library-overview"] });
    },
  });

  /* ─── Playback ─── */
  const isCurrentTrack = currentTrack?.id === id;
  const isCurrentTrackPlaying = isCurrentTrack && isPlaying;

  /** Start this track (setTrack autoplays), keeping it in the existing queue. */
  const startTrack = () => {
    if (!track) return;
    const inQueue = queue.some((t) => t.id === track.id);
    setTrack(track, inQueue ? queue : [...queue, track]);
    setPlayerMinimized(false);
  };

  const handlePlayTrack = (e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    if (!track) return;
    if (isCurrentTrack) togglePlay();
    else startTrack();
  };

  const handleShuffle = (e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    toggleShuffle();
    // Shuffling a not-yet-playing song also starts it. We don't call togglePlay
    // afterwards: setTrack already autoplays and a second toggle would pause it.
    if (!isCurrentTrack) startTrack();
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
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
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
  const durationSec = Math.max(0, Math.floor(Number(track.duration) || 0));
  const durationStr = `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, "0")}`;
  // Apple Music rounds the total ("1 song, 4 minutes"); never show "0 minutes".
  const totalMins = Math.max(1, Math.round(durationSec / 60));
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
  const rawAlbumId = track.album?.id || track.albumId || (track as any).collectionId;

  const isDummyAlbum =
    !rawAlbumTitle ||
    rawAlbumTitle.toLowerCase() === "single" ||
    rawAlbumTitle.toLowerCase() === "unknown" ||
    rawAlbumTitle.toLowerCase() === "undefined";

  const isSameAsSong = rawAlbumTitle.toLowerCase() === (track.title || "").trim().toLowerCase();
  const hasRealAlbum = !isDummyAlbum && !!rawAlbumId && !isSameAsSong;

  const albumDisplay = hasRealAlbum ? rawAlbumTitle : null;
  const albumHref = hasRealAlbum ? `/album/${encodeURIComponent(String(rawAlbumId))}` : undefined;
  const hasAlbum = !!albumDisplay && !!albumHref;

  const dateSrc = track.releaseDate || track.createdAt;
  const parsedDate = dateSrc ? new Date(dateSrc) : null;
  const validDate = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;
  const releaseDate = validDate
    ? validDate.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })
    : "";
  const year = validDate ? String(validDate.getFullYear()) : "";
  const genre: string =
    typeof (track as any).genre === "string" ? (track as any).genre : (track as any).genre?.name || "";

  const titleSize =
    formattedTitle.length > 40
      ? "text-[22px] sm:text-[26px] md:text-[28px]"
      : formattedTitle.length > 28
      ? "text-[24px] sm:text-[30px] md:text-[34px]"
      : "text-[26px] sm:text-[34px] md:text-[40px]";

  /* Albums by the same artist (strip the current track's album) */
  const otherAlbums: any[] = (artistData?.albums || []).filter(
    (a: any) => a.id !== rawAlbumId && a.id !== (track.album?.id || track.albumId)
  );

  const visibleRelated: any[] = relatedArtists.filter((r: any) => r?.id && r.id !== artistId);

  const artistName: string = track.artist?.name || (track as any).artistName || artistData?.name || "";

  const handleLyricsButton = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isCurrentTrack) startTrack();
    handleLyricsToggle();
  };

  /* Small meta line under the artist — built from parts so no dangling separators */
  const metaParts: React.ReactNode[] = [];
  if (hasAlbum) {
    metaParts.push(
      albumHref ? (
        <Link key="album" href={albumHref} className="transition-colors hover:text-brand hover:underline">
          {albumDisplay}
        </Link>
      ) : (
        <span key="album">{albumDisplay}</span>
      )
    );
  }
  if (genre) metaParts.push(<span key="genre">{genre}</span>);
  if (year) metaParts.push(<span key="year">{year}</span>);
  metaParts.push(
    <span key="lossless" className="font-semibold text-white/80">
      Lossless
    </span>
  );

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

      <div className="relative z-10 mx-auto w-full max-w-full px-5 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-4 sm:px-8 sm:pt-8 md:pt-[100px]">
        {/* ── Hero: artwork + meta + actions ── */}
        <motion.header
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
          className="mb-8 flex flex-col items-center gap-5 text-center sm:gap-6 md:mb-10 md:flex-row md:items-end md:gap-8 md:text-left"
        >
          {/* Artwork */}
          <div className="shrink-0">
            <img
              src={coverUrl}
              alt={`Cover art for ${track.title}`}
              width={340}
              height={340}
              fetchPriority="high"
              decoding="async"
              className="aspect-square w-[min(300px,72vw)] rounded-[10px] bg-zinc-900 object-cover shadow-[0_20px_50px_rgba(0,0,0,0.5)] ring-1 ring-white/10 sm:w-[300px] md:w-[240px] lg:w-[300px] xl:w-[338px]"
            />
          </div>

          {/* Metadata stack */}
          <div className="flex w-full min-w-0 flex-1 flex-col items-center md:items-start">
            <h1
              className={cn(
                "line-clamp-3 w-full break-words font-bold leading-[1.12] tracking-[-0.025em] text-white",
                titleSize
              )}
              title={formattedTitle}
            >
              {formattedTitle}
            </h1>

            {/* Artist — accent colour like Apple Music */}
            <div className="mt-1.5 max-w-full text-[17px] font-medium text-brand sm:text-[20px] md:mt-2 md:text-[22px]">
              <ArtistLinks
                track={track}
                maxArtists={4}
                linkClassName="text-brand hover:underline font-medium transition-colors"
              />
            </div>

            {/* Album · genre · year · Lossless */}
            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-white/50 sm:text-[13px] md:justify-start">
              {metaParts.map((part, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span aria-hidden="true">·</span>}
                  {part}
                </React.Fragment>
              ))}
            </div>

            {/* Action controls — the only place for play / shuffle / like / lyrics / ⋯ */}
            <div className="mt-5 flex w-full items-center justify-center gap-2 md:mt-6 md:justify-start">
              <MediaActionButtons
                isPlaying={isCurrentTrackPlaying}
                onPlay={() => handlePlayTrack()}
                isShuffled={isCurrentTrack && isShuffled}
                onShuffle={() => handleShuffle()}
                isLiked={!!isLiked}
                onToggleLike={() => toggleLikeMutation.mutate()}
                extraAction={
                  <button
                    type="button"
                    onClick={handleLyricsButton}
                    className={cn(
                      "flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/85 outline-none transition-colors duration-150 hover:bg-white/[0.18] hover:text-white focus-visible:ring-2 focus-visible:ring-brand",
                      isLyricsOpen && "!text-brand"
                    )}
                    title={isLyricsOpen ? "Close Lyrics" : "View Lyrics"}
                    aria-label={isLyricsOpen ? "Close Lyrics" : "View Lyrics"}
                    aria-pressed={isLyricsOpen}
                  >
                    <SwiftUILyrics size={16} stroke="currentColor" />
                  </button>
                }
                track={track}
                context="track-page"
              />

              {RENDER_HERO_MENU_SEPARATELY && (
                <TrackActionsDropdown
                  track={track}
                  context="track-page"
                  align="end"
                  glass
                  isLyricsOpen={isLyricsOpen}
                  onLyricsToggle={handleLyricsToggle}
                  showToast={showToast}
                  triggerClassName="size-9 rounded-full bg-white/10 text-white/85 hover:bg-white/[0.18] hover:text-white transition-colors"
                />
              )}
            </div>
          </div>
        </motion.header>

        {/* ── Song list (minimal: index · title/artist · duration) ── */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.08, duration: 0.3 }}
          aria-label="Songs"
          className="mb-6 w-full"
        >
          <div className="h-px bg-white/[0.1]" />

          <div
            role="button"
            tabIndex={0}
            aria-label={`${isCurrentTrackPlaying ? "Pause" : "Play"} ${formattedTitle}`}
            onClick={handlePlayTrack}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handlePlayTrack(e);
              }
            }}
            className={cn(
              "group relative flex min-h-[56px] cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand sm:gap-4 sm:px-3",
              isCurrentTrack
                ? "bg-white/[0.08]"
                : "[@media(hover:hover)]:hover:bg-white/[0.06] active:bg-white/[0.08]"
            )}
          >
            {/* Index ⇄ equalizer ⇄ play/pause on hover */}
            <div className="relative flex size-7 shrink-0 items-center justify-center text-[15px] tabular-nums text-white/45">
              <span
                className={cn(
                  "absolute inset-0 flex items-center justify-center transition-opacity",
                  "[@media(hover:hover)]:group-hover:opacity-0",
                  isCurrentTrack && !isCurrentTrackPlaying && "font-semibold text-brand"
                )}
              >
                {isCurrentTrackPlaying ? <Equalizer playing /> : "1"}
              </span>
              <span
                className="absolute inset-0 hidden items-center justify-center text-white opacity-0 transition-opacity [@media(hover:hover)]:flex [@media(hover:hover)]:group-hover:opacity-100"
                aria-hidden="true"
              >
                {isCurrentTrackPlaying ? (
                  <Pause size={16} className="fill-current" />
                ) : (
                  <Play size={16} className="ml-0.5 fill-current" />
                )}
              </span>
            </div>

            {/* Title + artist */}
            <div className="flex min-w-0 flex-1 flex-col">
              <span
                className={cn(
                  "block truncate text-[16px] font-medium tracking-[-0.01em] sm:text-[15px]",
                  isCurrentTrack ? "font-semibold text-brand" : "text-white"
                )}
              >
                {formattedTitle}
              </span>
              <div
                className="mt-0.5 truncate text-[13px] text-white/50"
                onClick={(e) => e.stopPropagation()}
              >
                <ArtistLinks
                  track={track}
                  maxArtists={3}
                  linkClassName="text-white/50 hover:text-white hover:underline"
                />
              </div>
            </div>

            {/* Heart button + Duration */}
            <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLikeMutation.mutate();
                }}
                aria-label={isLiked ? "Unlike" : "Like"}
                className={cn(
                  "p-1.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer",
                  isLiked ? "opacity-100" : "md:opacity-0 md:group-hover:opacity-100 opacity-80"
                )}
              >
                <SwiftUIHeart
                  size={15}
                  filled={!!isLiked}
                  className={cn(isLiked ? "text-brand" : "text-white/40 hover:text-white")}
                />
              </button>

              <span className="w-11 shrink-0 text-right text-[13px] tabular-nums text-white/45">
                {durationStr}
              </span>
            </div>
          </div>

          <div className="h-px bg-white/[0.1]" />
        </motion.section>

        {/* ── Footer metadata ── */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.12, duration: 0.3 }}
          className="mb-10 space-y-0.5 px-2 text-[12px] leading-relaxed text-white/50 sm:px-3 sm:text-[13px] md:mb-14"
        >
          {releaseDate && <p className="font-semibold text-white/70">{releaseDate}</p>}
          <p>
            1 song, {totalMins} minute{totalMins !== 1 ? "s" : ""}
          </p>
          <p>
            ℗ {year} {artistName || <span className="font-zenify">zenify</span>}
          </p>
          <div className="pt-2">
            <a
              href={`https://music.apple.com/search?term=${encodeURIComponent(formattedTitle + " " + artistName)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
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
              {otherAlbums.map((alb: any) => {
                const albYear = alb.releaseDate ? new Date(alb.releaseDate).getFullYear() : null;
                return (
                  <Link
                    key={alb.id}
                    href={`/album/${alb.id}`}
                    className="group flex w-[140px] shrink-0 flex-col gap-2 rounded-lg p-1.5 transition-all sm:w-[160px] md:w-[180px] [@media(hover:hover)]:hover:bg-white/5"
                    style={{ scrollSnapAlign: "start" }}
                  >
                    <div className="aspect-square w-full overflow-hidden rounded-[8px] bg-white/[0.06] shadow-[0_2px_10px_rgba(0,0,0,0.35)] ring-1 ring-inset ring-white/10">
                      <img
                        src={getMediaUrl(alb.coverUrl) || "/logo.png"}
                        alt={alb.title || "Album"}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        loading="lazy"
                      />
                    </div>
                    <p className="truncate text-[14px] font-medium leading-tight text-white transition-colors group-hover:text-brand">
                      {alb.title}
                    </p>
                    <p className="text-[12px] text-white/50">
                      {albYear && Number.isFinite(albYear) ? albYear : "Album"}
                    </p>
                  </Link>
                );
              })}
            </HorizontalCarousel>
          </motion.div>
        )}

        {/* ── You Might Also Like (related artists) — round artwork cards ── */}
        {visibleRelated.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: 0.3 }}
          >
            <HorizontalCarousel title="You Might Also Like">
              {visibleRelated.map((rel: any) => (
                <Link
                  key={rel.id}
                  href={`/artist/${rel.id}`}
                  className="group flex shrink-0 flex-col items-center gap-3 rounded-lg p-2 text-center transition-all [@media(hover:hover)]:hover:bg-white/5"
                  style={{
                    width: "calc(var(--artist-card-w, 140px))",
                    scrollSnapAlign: "start",
                  }}
                >
                  <div
                    className="aspect-square overflow-hidden rounded-full bg-zinc-800 shadow-xl shadow-black/40 ring-1 ring-inset ring-white/10 transition-all duration-300 group-hover:ring-2 group-hover:ring-brand/50"
                    style={{ width: "min(128px, 100%)", height: "min(128px, 100%)" }}
                  >
                    <img
                      src={getArtistProfileImage(rel)}
                      alt={rel.name || "Artist"}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                      loading="lazy"
                    />
                  </div>
                  <div className="w-full min-w-0">
                    <p className="mx-auto w-full max-w-[120px] truncate text-[14px] font-semibold text-white transition-colors group-hover:text-brand">
                      {rel.name}
                    </p>
                    <p className="mt-0.5 text-[11px] font-bold uppercase tracking-widest text-white/45">Artist</p>
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
            role="status"
            className="fixed bottom-28 left-1/2 z-[9999] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2.5 whitespace-nowrap rounded-xl border border-white/[0.14] bg-[#242426]/85 py-2.5 pl-3 pr-4 text-[13.5px] font-medium text-white shadow-[0_16px_40px_rgba(0,0,0,0.5)] backdrop-blur-2xl md:bottom-24"
          >
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full",
                toast.type === "error" ? "bg-red-500/25 text-red-400" : "bg-emerald-500/25 text-emerald-400"
              )}
            >
              {toast.type === "success" ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
            </span>
            <span className="truncate">{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}