"use client";

/**
 * Track page — Apple Music (web) layout.
 *
 *  ┌──────────────────────────────────────────────┐
 *  │  [ artwork ]   Title                         │
 *  │                Artist (accent colour)        │
 *  │                Genre · Year                  │
 *  │                [ ▶ Play ] [ ⤮ Shuffle ] ♡ ⋯  │
 *  ├──────────────────────────────────────────────┤
 *  │  ▢  Title / Artist       Album   3:42    ⋯   │
 *  ├──────────────────────────────────────────────┤
 *  │  October 22, 2026                            │
 *  │  1 song, 3 minutes                           │
 *  │  © 2026 Artist                               │
 *  └──────────────────────────────────────────────┘
 *
 * "Stable": no scroll-linked hero, no sticky sheet that slides over content,
 * no 3D tilt, no springy artwork. Everything sits in normal flow, so nothing
 * jumps while the page loads or while background enrichment refetches.
 */

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Play, Pause, Heart, Disc3, Check, X, Shuffle, ScrollText, MoreHorizontal } from "lucide-react";

import api from "@/lib/api";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { ArtistLinks } from "@/components/shared/ArtistLinks";
import { DynamicBackground } from "@/components/shared/DynamicBackground";
import { TrackActionsDropdown } from "@/components/shared/TrackActionsDropdown";
import { applyArtworkTheme, resetArtworkTheme, extractArtworkAverageColor } from "@/lib/theme";
import { getMediaUrl, cn, formatDisplayTitle, decodeHtmlEntities } from "@/lib/utils";

/* ───────────────────────── small pieces ───────────────────────── */

/** Apple-style rounded-rectangle button (Play / Shuffle) */
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
      whileTap={{ scale: 0.96 }}
      transition={{ duration: 0.1 }}
      className={cn(
        "flex h-10 min-w-[116px] cursor-pointer items-center justify-center gap-2 rounded-[10px] px-5 text-[15px] font-semibold tracking-[-0.01em] outline-none transition-colors",
        variant === "solid"
          ? "bg-brand text-white hover:brightness-110"
          : cn(
              "backdrop-blur-xl hover:bg-white/[0.2]",
              active ? "bg-white/[0.24] text-brand" : "bg-white/[0.14] text-brand"
            )
      )}
    >
      {children}
    </motion.button>
  );
}

/** Round 40px glass icon button (Like / More) */
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
      whileTap={{ scale: 0.92 }}
      transition={{ duration: 0.1 }}
      className={cn(
        "flex size-10 cursor-pointer items-center justify-center rounded-full bg-white/[0.14] outline-none backdrop-blur-xl transition-colors hover:bg-white/[0.2]",
        active ? "text-brand" : "text-white/90",
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
    [0.7, 0.35, 0.9, 0.4, 0.7],
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

/* ───────────────────────── page ───────────────────────── */

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

  /* Follow the player to the new track page (persistent tracks only) */
  useEffect(() => {
    if (currentTrack && previousTrackId && currentTrack.id !== previousTrackId) {
      if (!currentTrack.id.startsWith("yt-")) router.replace(`/track/${currentTrack.id}`);
    }
    if (currentTrack) setPreviousTrackId(currentTrack.id);
  }, [currentTrack, previousTrackId, router]);

  /* ─── Queries ─── */
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

  /* Artwork tint */
  useEffect(() => {
    if (!trackCoverUrl) return;
    extractArtworkAverageColor(trackCoverUrl).then((rgb) => {
      if (rgb) applyArtworkTheme(rgb[0], rgb[1], rgb[2]);
    });
    return () => resetArtworkTheme();
  }, [trackCoverUrl]);

  /* Instant import when the song is playing but not yet in the DB */
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

  /* Push enriched metadata into the active player */
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

  /* Background worker updates */
  useEffect(() => {
    const handler = (e: any) => {
      if (e?.detail?.id === id) queryClient.invalidateQueries({ queryKey: ["track-detail", id] });
    };
    window.addEventListener("zenify:track-updated", handler);
    return () => window.removeEventListener("zenify:track-updated", handler);
  }, [id, queryClient]);

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
          className="cursor-pointer rounded-[10px] bg-white/[0.14] px-5 py-2 text-[14px] font-semibold text-brand hover:bg-white/[0.2]"
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
    const m = decodeHtmlEntities(s).match(/[\(\[]\s*From\s+["'“]?([^"'”\)\]]+)["'”]?\s*[\)\]]/i);
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
  const metaLine = [genre || "Song", year].filter(Boolean).join(" · ");
  const lengthStr = `1 song, ${totalMins} minute${totalMins !== 1 ? "s" : ""}`;

  const titleSize =
    formattedTitle.length > 36 ? "text-[24px] sm:text-[30px]" : "text-[28px] sm:text-[36px]";

  return (
    <div className="relative min-h-screen w-full text-foreground">
      {/* Flowing artwork background */}
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

      <div className="relative z-10 mx-auto w-full max-w-[1000px] px-5 pb-40 pt-8 sm:px-8 sm:pt-12">
        {/* ── Header ── */}
        <header className="flex flex-col items-center gap-6 text-center md:flex-row md:items-end md:gap-8 md:text-left">
          <img
            src={coverUrl}
            alt={`Cover art for ${track.title}`}
            width={300}
            height={300}
            fetchPriority="high"
            decoding="async"
            className="aspect-square size-[240px] shrink-0 rounded-[10px] bg-zinc-900 object-cover shadow-[0_18px_48px_rgba(0,0,0,0.45)] ring-1 ring-white/10 sm:size-[280px] md:size-[300px]"
          />

          <div className="flex min-w-0 flex-1 flex-col items-center md:items-start">
            <h1
              className={cn(
                "w-full max-w-full font-outfit font-bold leading-[1.12] tracking-[-0.025em] text-white",
                "line-clamp-2",
                titleSize
              )}
              title={formattedTitle}
            >
              {formattedTitle}
            </h1>

            <div className="mt-1 max-w-full truncate text-[20px] font-medium text-brand sm:text-[22px]">
              <ArtistLinks
                track={track}
                maxArtists={4}
                linkClassName="text-brand hover:underline"
              />
            </div>

            <p className="mt-1 text-[13px] font-medium text-white/55">{metaLine}</p>

            {/* Actions */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 md:justify-start">
              <PillButton variant="solid" onClick={handlePlayTrack} label={isCurrentTrackPlaying ? "Pause" : "Play"}>
                {isCurrentTrackPlaying ? (
                  <Pause size={18} fill="currentColor" />
                ) : (
                  <Play size={18} fill="currentColor" />
                )}
                {isCurrentTrackPlaying ? "Pause" : "Play"}
              </PillButton>

              <PillButton active={isShuffled} onClick={handleShuffle} label="Shuffle">
                <Shuffle size={18} />
                Shuffle
              </PillButton>

              <IconCircle
                title={isLiked ? "Unlike" : "Like"}
                active={!!isLiked}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLikeMutation.mutate();
                }}
              >
                <Heart size={18} className={cn(isLiked && "fill-current")} />
              </IconCircle>

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
                <ScrollText size={18} />
              </IconCircle>

              <TrackActionsDropdown
                track={track}
                context="track-page"
                align="end"
                glass
                isLyricsOpen={isLyricsOpen}
                onLyricsToggle={handleLyricsToggle}
                showToast={showToast}
                trigger={
                  <IconCircle title="More options" aria-haspopup="menu">
                    <MoreHorizontal size={20} />
                  </IconCircle>
                }
              />
            </div>
          </div>
        </header>

        {/* ── Track list ── */}
        <section className="mt-10" aria-label="Songs">
          <div className="h-px bg-white/[0.12]" />

          <div
            className={cn(
              "group relative -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors",
              isCurrentTrack ? "bg-white/[0.1]" : "hover:bg-white/[0.07]"
            )}
          >
            {/* Artwork with play overlay (number slot, like Apple's rows) */}
            <button
              type="button"
              onClick={handlePlayTrack}
              aria-label={isCurrentTrackPlaying ? "Pause" : "Play"}
              className="relative size-11 shrink-0 cursor-pointer overflow-hidden rounded-md bg-zinc-900 outline-none ring-1 ring-white/10"
            >
              <img src={coverUrl} alt="" className="size-full object-cover" loading="lazy" />
              <span
                className={cn(
                  "absolute inset-0 flex items-center justify-center bg-black/45 transition-opacity duration-150",
                  isCurrentTrackPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
              >
                {isCurrentTrackPlaying ? (
                  <Equalizer playing />
                ) : (
                  <Play size={16} className="ml-0.5 fill-white text-white" />
                )}
              </span>
            </button>

            {/* Title + artist */}
            <div className="flex min-w-0 flex-1 flex-col">
              <button onClick={handlePlayTrack} className="w-fit max-w-full cursor-pointer text-left outline-none">
                <span
                  className={cn(
                    "block truncate text-[15px] font-medium tracking-[-0.01em]",
                    isCurrentTrack ? "text-brand" : "text-white"
                  )}
                >
                  {formattedTitle}
                </span>
              </button>
              <div className="truncate text-[13px] text-white/50">
                <ArtistLinks
                  track={track}
                  maxArtists={3}
                  linkClassName="text-white/50 hover:text-white hover:underline"
                />
              </div>
            </div>

            {/* Album */}
            <div className="hidden min-w-0 basis-[30%] truncate text-[13px] text-white/50 md:block">
              {albumHref ? (
                <Link href={albumHref} className="hover:text-white hover:underline">
                  {albumDisplay}
                </Link>
              ) : (
                albumDisplay
              )}
            </div>

            {/* Duration */}
            <span className="w-10 shrink-0 text-right text-[13px] tabular-nums text-white/50">
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
              triggerClassName="size-8 rounded-full text-white/60 hover:text-white hover:bg-white/10"
            />
          </div>

          <div className="h-px bg-white/[0.12]" />
        </section>

        {/* ── Footer metadata ── */}
        <footer className="mt-6 space-y-0.5 text-[13px] leading-relaxed text-white/50">
          {releaseDate && <p>{releaseDate}</p>}
          <p>{lengthStr}</p>
          <p>
            © {year}{" "}
            {track.artist?.name || <span className="font-zenify">zenify</span>}, marketed by{" "}
            {labelDisplay === "Zenify" ? (
              <>
                <span className="font-zenify">zenify</span> Music
              </>
            ) : (
              labelDisplay
            )}
            .
          </p>
        </footer>
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