"use client";

/**
 * LikedSongsPage — Apple Music playlist layout for Liked Songs & Library Favorites
 *
 * Reuses canonical components (unchanged):
 *   • MediaActionButtons   (Play / Shuffle / Add Music)
 *   • JioSaavnSongTable    (Songs table with Recently Added / Newest / A-Z sorting)
 *   • JioSaavnCardSection  (Albums + Artists carousels)
 *   • MediaCard            (Songs card view)
 *   • AddMusicToLikedModal
 *   • DynamicBackground
 *
 * What's new in this version
 *   • Hero: three fanned cover images (center + two slanted sides) that spring open.
 *   • Hero is compact: content starts right under the header (no big top gap).
 *   • Mobile: cover stack on the left, title + buttons on the right.
 *   • Back / Forward arrows removed.
 *   • New glass search bar + sliding segmented List/Cards toggle + small spring details.
 *   • Scroll arrows (◀ ▶) on mobile & tablet for Songs (cards), Albums and Artists.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * REPLACEABLE PLACEHOLDER: <ArrowCarousel> + <ScrollArrows> (bottom of file)
 *   Local stand-ins for the shared "left / right section arrows" component.
 *   Swap them for the app's reusable arrows component. The three places they
 *   are used are marked with  // REUSABLE-ARROWS
 * ──────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence, LayoutGroup, type Variants } from "framer-motion";
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

/* ──────────────────────────────────────────────────────────────────────────
   Motion tokens (springs used across the page)
   ────────────────────────────────────────────────────────────────────────── */
const SPRING = { type: "spring", stiffness: 300, damping: 30 } as const;
const SPRING_SNAPPY = { type: "spring", stiffness: 520, damping: 34, mass: 0.6 } as const;
const SPRING_PILL = { type: "spring", stiffness: 560, damping: 38, mass: 0.6 } as const;
const SPRING_FAN = { type: "spring", stiffness: 180, damping: 18, mass: 0.9 } as const;

/* ──────────────────────────────────────────────────────────────────────────
   ONE LEFT-EDGE RULE for every section
   ─────────────────────────────────
   --pad = the app's --row-gutter (clamp(20px, 2.4vw, 40px)). JioSaavnCardSection
   already pads itself with that same gutter, so:

     • hero, search, Songs title + table → padding-inline: var(--pad)
     • Albums / Artists                  → no extra padding (the section adds the gutter)
     • everything sits in a 1400px column centred in the page area

   Result: the hero, search, "Songs", the table, "Albums" and "Artists" all start on the
   same vertical line. Carousels additionally run off the right edge of the page area.
   ────────────────────────────────────────────────────────────────────────── */
const PAD_X: React.CSSProperties = { paddingInline: "var(--pad)" };
/** Space left of the 1400px column when the page area is wider than that (0 otherwise) */
const COLUMN_OFFSET = "max(0px, calc((100% - 1400px) / 2))";
/** Same offset + the gutter: where content starts inside a full-width row */
const BLEED_LEFT = "max(var(--pad), calc((100% - 1400px) / 2 + var(--pad)))";
/** Wrapper for JioSaavnCardSection (it adds the gutter itself) */
const BLEED_OUTER: React.CSSProperties = { paddingLeft: COLUMN_OFFSET };
/** Keeps the ◀ ▶ arrows on the content column's right edge */
const BLEED_ARROWS: React.CSSProperties = { right: BLEED_LEFT };

/** Staggered fade-up used by the hero text */
const rise = (i: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring", stiffness: 260, damping: 26, delay: 0.1 + i * 0.05 } as const,
});

const shuffleArray = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/* ──────────────────────────────────────────────────────────────────────────
   Hero cover stack (center + two slanted side covers)
   Size is driven by --s (center cover size) which grows with the hero's
   own width (container queries), so it adapts to sidebar / right panel.
   ────────────────────────────────────────────────────────────────────────── */
const stackParent: Variants = {
  hidden: {},
  rest: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
  hover: { transition: { staggerChildren: 0 } },
};

const centerV: Variants = {
  hidden: { opacity: 0, scale: 0.9, y: 10 },
  rest: { opacity: 1, scale: 1, y: 0, transition: SPRING_FAN },
  hover: { opacity: 1, scale: 1.03, y: -4, transition: SPRING_SNAPPY },
};

const sideV = (dir: -1 | 1): Variants => ({
  hidden: { opacity: 0, x: "0%", rotate: 0, scale: 0.8 },
  rest: { opacity: 1, x: `${dir * 62}%`, rotate: dir * 9, scale: 1, transition: SPRING_FAN },
  hover: { opacity: 1, x: `${dir * 72}%`, rotate: dir * 12, scale: 1.02, transition: SPRING_SNAPPY },
});
const leftV = sideV(-1);
const rightV = sideV(1);

function StackCard({
  src,
  variants,
  scale,
  top,
  z,
  dim,
  origin = "50% 100%",
  badge,
}: {
  src: string | null;
  variants: Variants;
  scale: number;
  top: number;
  z: number;
  dim?: boolean;
  origin?: string;
  badge?: React.ReactNode;
}) {
  const url = src ? getMediaUrl(src) || src : null;
  return (
    <motion.div
      variants={variants}
      style={{
        position: "absolute",
        width: `calc(var(--s) * ${scale})`,
        height: `calc(var(--s) * ${scale})`,
        left: `calc(50% - var(--s) * ${scale / 2})`,
        top: `calc(var(--s) * ${top})`,
        zIndex: z,
        transformOrigin: origin,
        willChange: "transform",
      }}
      className="overflow-hidden rounded-[10px] border border-white/10 bg-gradient-to-br from-[#9E2339] via-[#861E30] to-[#18181B] shadow-[0_18px_40px_rgba(0,0,0,0.5)] @lg:rounded-xl"
    >
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          decoding="async"
          className="size-full select-none object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center">
          <SwiftUIHeart size={22} filled={true} className="text-white/80" />
        </div>
      )}
      {dim && <div className="absolute inset-0 bg-black/35" />}
      {badge}
    </motion.div>
  );
}

function CoverStack({ covers }: { covers: (string | null)[] }) {
  return (
    <motion.div
      variants={stackParent}
      initial="hidden"
      animate="rest"
      whileHover="hover"
      className="relative shrink-0 [--s:88px] @lg:[--s:140px] @2xl:[--s:170px] @4xl:[--s:200px]"
      style={{ width: "calc(var(--s) * 1.95)", height: "var(--s)" }}
    >
      <StackCard
        src={covers[0]}
        variants={centerV}
        scale={1}
        top={0}
        z={3}
        origin="50% 50%"
        badge={
          covers[0] ? (
            <span className="absolute bottom-1.5 left-1.5 flex size-6 items-center justify-center rounded-full border border-white/20 bg-black/60 backdrop-blur-xl @lg:bottom-3 @lg:left-3 @lg:size-9">
              <SwiftUIHeart size={13} filled={true} className="text-brand" />
            </span>
          ) : null
        }
      />
      <StackCard src={covers[1]} variants={leftV} scale={0.8} top={0.1} z={1} dim />
      <StackCard src={covers[2]} variants={rightV} scale={0.8} top={0.1} z={2} dim />
    </motion.div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Small UI pieces
   ────────────────────────────────────────────────────────────────────────── */

/** List / Cards switch with a pill that glides between options */
function ViewToggle({
  value,
  onChange,
}: {
  value: "list" | "grid";
  onChange: (v: "list" | "grid") => void;
}) {
  const opts = [
    { key: "list" as const, label: "List", Icon: ListMusic },
    { key: "grid" as const, label: "Cards", Icon: LayoutGrid },
  ];
  return (
    <LayoutGroup id="liked-view-toggle">
      <div
        role="tablist"
        aria-label="View mode"
        className="relative inline-flex shrink-0 items-center rounded-full bg-white/[0.08] p-1 ring-1 ring-inset ring-white/10 backdrop-blur-xl"
      >
        {opts.map(({ key, label, Icon }) => {
          const active = value === key;
          return (
            <motion.button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              title={`${label} view`}
              whileTap={{ scale: 0.92 }}
              transition={SPRING_SNAPPY}
              onClick={() => onChange(key)}
              className={cn(
                "relative flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold outline-none transition-colors duration-200 sm:px-3.5",
                active ? "text-white" : "text-white/50 hover:text-white/80"
              )}
            >
              {active && (
                <motion.span
                  layoutId="liked-view-pill"
                  transition={SPRING_PILL}
                  className="absolute inset-0 rounded-full bg-white/[0.2] shadow-[0_2px_10px_rgba(0,0,0,0.25),inset_0_0.5px_0_rgba(255,255,255,0.25)]"
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <Icon size={15} />
                <span className="hidden sm:inline">{label}</span>
              </span>
            </motion.button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

/** "12 tracks" label that rolls when the number changes */
function AnimatedCount({ value, singular, plural }: { value: number; singular: string; plural: string }) {
  return (
    <span className="relative inline-flex overflow-hidden text-[12px] font-medium text-white/40">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -10, opacity: 0 }}
          transition={SPRING_SNAPPY}
        >
          {value} {value === 1 ? singular : plural}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Section wrapper: fades up when scrolled into view, fades out when removed */
function FadeUp({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10, transition: { duration: 0.15 } }}
      viewport={{ once: true, margin: "-40px" }}
      transition={SPRING}
      className={className}
    >
      {children}
    </motion.section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Page
   ────────────────────────────────────────────────────────────────────────── */

export default function LikedSongsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { user, isAuthenticated } = useAuthStore();
  const { showToast, setPlayerMinimized } = useUIStore();
  const { currentTrack, isPlaying, togglePlay, setTrack, setQueue, isShuffled, toggleShuffle } = usePlayerStore();

  /* ─── Data: Liked Tracks, User Albums, Overview ─── */
  const { data: likedTracks = [] } = useQuery<Track[]>({
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

  const { data: followedArtists = [] } = useQuery<any[]>({
    queryKey: ["liked-artists"],
    queryFn: async () => {
      try {
        const res = await api.get("artists/liked");
        return Array.isArray(res.data) ? res.data : [];
      } catch {
        return [];
      }
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

    for (const art of followedArtists || []) {
      const name = (art?.name || art?.title || "").trim();
      const id = art?.id || `artist-${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
      const normName = name.toLowerCase();

      if (!isUnknownArtist(name, id) && !seenIds.has(id) && !seenNames.has(normName)) {
        seenIds.add(id);
        seenNames.add(normName);
        const img = art.image || art.imageUrl || art.coverUrl || art.avatarUrl;
        map.set(id, {
          id: id,
          name: name,
          title: name,
          imageUrl: img,
          coverUrl: img,
          avatarUrl: img,
          artwork: img,
          songCount: art.songCount || 0,
          isArtist: true,
          type: "artist",
        });
      }
    }

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
  }, [likedTracks, overview?.topArtists, followedArtists]);

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

  /* ─── Hero covers: first 3 distinct covers (center + left + right) ─── */
  const stackCovers = useMemo(() => {
    const seen = new Set<string>();
    const out: (string | null)[] = [];
    for (const t of likedTracks) {
      const c = t.coverUrl;
      if (c && !seen.has(c)) {
        seen.add(c);
        out.push(c);
        if (out.length === 3) break;
      }
    }
    while (out.length < 3) out.push(null);
    return out;
  }, [likedTracks]);
  const heroCover = stackCovers[0];

  /* ─── Ambient dynamic glow ─── */
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
  const totalMatches = filteredTracks.length + filteredAlbums.length + filteredArtists.length;

  return (
    <div className="relative min-h-screen w-full bg-transparent pb-32 text-white">
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

      {/* ── Page Container: starts right under the header (no big gap) ── */}
      <div className="relative z-10 w-full min-w-0 pb-12 pt-[calc(var(--header-height,64px)+12px)] [--pad:var(--row-gutter,2rem)] sm:pt-[calc(var(--header-height,64px)+18px)]">
        <div className="mx-auto w-full max-w-[1400px]" style={PAD_X}>
        {/* ── 1. Hero ──
            @container → sizes below react to the hero's own width, so the layout
            stays right when the sidebar or the lyrics/queue panel opens. */}
        <div className="@container mb-5 w-full min-w-0 sm:mb-7">
          <div className="flex w-full min-w-0 items-center gap-4 @lg:gap-8">
            <CoverStack covers={stackCovers} />

            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <motion.p
                {...rise(0)}
                className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-brand @lg:text-[12px]"
              >
                Playlist<span className="hidden @lg:inline"> Collection</span>
              </motion.p>

              <motion.h1
                {...rise(1)}
                className="mb-1 line-clamp-2 text-[22px] font-black leading-[1.1] tracking-[-0.025em] text-white @lg:mb-2 @lg:text-[34px] @3xl:text-[44px]"
              >
                Liked Songs
              </motion.h1>

              <motion.div
                {...rise(2)}
                className="flex flex-wrap items-center gap-x-1.5 text-[12px] font-medium text-white/60 @lg:text-[14px]"
              >
                <span className="hidden font-semibold text-white @lg:inline">{ownerName}</span>
                <span className="hidden @lg:inline">·</span>
                <span>
                  {likedTracks.length} {likedTracks.length === 1 ? "song" : "songs"}
                </span>
                {totalSec > 0 && (
                  <>
                    <span>·</span>
                    <span>{durationShort}</span>
                  </>
                )}
                <span className="hidden @lg:inline">·</span>
                <span className="hidden font-semibold text-white/80 @lg:inline">Lossless</span>
              </motion.div>

              <motion.p
                {...rise(3)}
                className="mt-2 hidden max-w-2xl text-[13px] leading-relaxed text-white/50 @2xl:block"
              >
                Your favorite tracks, saved albums, and followed artists in one personalized high-fidelity collection.
              </motion.p>

              <motion.div {...rise(4)} className="mt-3 flex min-w-0 flex-wrap items-center @lg:mt-5">
                <MediaActionButtons
                  track={{ id: "liked-songs", title: "Liked Songs" }}
                  context="playlist"
                  isPlaying={isLikedCurrentlyPlaying}
                  onPlay={handlePlayAll}
                  isShuffled={isLikedActive && isShuffled}
                  onShuffle={handleShufflePlay}
                  isLiked={false}
                  extraAction={
                    <motion.button
                      type="button"
                      aria-label="Add Music"
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.93 }}
                      transition={SPRING_SNAPPY}
                      onClick={() => setIsAddModalOpen(true)}
                      className="flex size-9 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-white/10 text-[13px] font-semibold text-white outline-none transition-colors duration-150 hover:bg-white/[0.18] @lg:w-auto @lg:px-4"
                    >
                      <Plus size={16} strokeWidth={2.5} />
                      <span className="hidden @lg:inline">Add Music</span>
                    </motion.button>
                  }
                />
              </motion.div>
            </div>
          </div>
        </div>

        {/* ── 2. Search + view toggle ── */}
        <div className="mb-5 flex items-center gap-2.5 sm:gap-3">
          <motion.div
            initial={false}
            animate={{ maxWidth: searchFocused || hasQuery ? 480 : 380 }}
            transition={SPRING}
            className="relative min-w-0 flex-1"
          >
            <div
              className={cn(
                "flex h-10 items-center gap-2 rounded-full pl-3.5 pr-1.5 ring-1 ring-inset backdrop-blur-xl",
                "transition-[background-color,box-shadow] duration-300",
                searchFocused
                  ? "bg-white/[0.14] shadow-[0_10px_34px_rgba(0,0,0,0.3)] ring-white/30"
                  : "bg-white/[0.08] ring-white/10 hover:bg-white/[0.11]"
              )}
            >
              <motion.span
                animate={{ scale: searchFocused ? 1.12 : 1, rotate: searchFocused ? -8 : 0 }}
                transition={SPRING_SNAPPY}
                className={cn(
                  "flex shrink-0 transition-colors duration-200",
                  searchFocused || hasQuery ? "text-white" : "text-white/45"
                )}
              >
                <Search size={16} strokeWidth={2.25} />
              </motion.span>

              <input
                ref={searchInputRef}
                type="text"
                inputMode="search"
                enterKeyHint="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    if (searchQuery) setSearchQuery("");
                    else searchInputRef.current?.blur();
                  }
                }}
                placeholder="Search in Liked Songs"
                aria-label="Search liked songs, albums and artists"
                // 16px on phones stops iOS from zooming the page when focused
                className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-medium tracking-[-0.01em] text-white outline-none placeholder:text-white/40 sm:text-[13.5px]"
              />

              <AnimatePresence initial={false}>
                {hasQuery && (
                  <motion.span
                    key="count"
                    initial={{ opacity: 0, scale: 0.8, x: 6 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.8, x: 6 }}
                    transition={SPRING_SNAPPY}
                    className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white/70"
                  >
                    {totalMatches} found
                  </motion.span>
                )}
                {hasQuery && (
                  <motion.button
                    key="clear"
                    type="button"
                    aria-label="Clear search"
                    initial={{ opacity: 0, scale: 0.4 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.4 }}
                    whileTap={{ scale: 0.82 }}
                    transition={SPRING_SNAPPY}
                    // keep focus in the input while clearing
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setSearchQuery("")}
                    className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/20 text-white outline-none hover:bg-white/30"
                  >
                    <X size={13} strokeWidth={2.5} />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          <div className="ml-auto">
            <ViewToggle value={viewMode} onChange={setViewMode} />
          </div>
        </div>

        </div>

        {/* ── 3. Songs ── */}
        <FadeUp className="mb-8 w-full min-w-0">
          {/* REUSABLE-ARROWS (1/3): cards view scrolls sideways → show arrows.
              `enabled` is off in list view so the table never gets arrows. */}
          <ArrowCarousel enabled={viewMode === "grid"} arrowsStyle={BLEED_ARROWS}>
            <div className="mx-auto w-full max-w-[1400px]" style={PAD_X}>
              <div className="mb-3 flex h-[30px] items-center gap-2.5">
                <h2 className="text-[22px] font-bold tracking-[-0.02em] text-white">Songs</h2>
                {filteredTracks.length > 0 && (
                  <AnimatedCount value={filteredTracks.length} singular="track" plural="tracks" />
                )}
              </div>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {viewMode === "list" ? (
                <motion.div
                  key="songs-list"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }}
                  transition={SPRING}
                  className="mx-auto w-full max-w-[1400px]"
                  style={PAD_X}
                >
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
                </motion.div>
              ) : (
                <motion.div
                  key="songs-cards"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }}
                  transition={SPRING}
                  // Full-width scroller: cards start on the content column and run off the right edge
                  className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 sm:gap-4"
                  style={{
                    paddingLeft: BLEED_LEFT,
                    paddingRight: "var(--pad)",
                    scrollPaddingLeft: BLEED_LEFT,
                  }}
                >
                  {filteredTracks.length === 0 ? (
                    <p className="w-full py-10 text-center text-sm text-white/50">
                      {hasQuery ? `No liked songs matching "${searchQuery}".` : "No liked songs yet."}
                    </p>
                  ) : (
                    filteredTracks.map((track, idx) => (
                      <motion.div
                        key={`liked-song-${track.id || idx}-${idx}`}
                        initial={{ opacity: 0, y: 16, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ ...SPRING, delay: Math.min(idx, 10) * 0.03 }}
                        className="w-[148px] shrink-0 snap-start sm:w-[168px] lg:w-[184px]"
                      >
                        <MediaCard track={track} index={idx} contextTracks={filteredTracks} />
                      </motion.div>
                    ))
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </ArrowCarousel>
        </FadeUp>

        {/* ── 4 + 5. Albums & Artists carousels (JioSaavnCardSection untouched) ──
            Wrapper only offsets the 1400px column; the section adds its own gutter,
            so the "Albums" / "Artists" titles line up with "Songs" and the table. */}
        <AnimatePresence initial={false}>
          {filteredAlbums.length > 0 && (
            <FadeUp key="albums" className="mb-8 w-full min-w-0">
              {/* REUSABLE-ARROWS (2/3): hidden ≥lg so the section's own desktop arrows aren't doubled */}
              <ArrowCarousel hideOnDesktop arrowsStyle={BLEED_ARROWS}>
                <div style={BLEED_OUTER}>
                  <JioSaavnCardSection title="Albums" items={filteredAlbums} />
                </div>
              </ArrowCarousel>
            </FadeUp>
          )}

          {filteredArtists.length > 0 && (
            <FadeUp key="artists" className="mb-8 w-full min-w-0">
              {/* REUSABLE-ARROWS (3/3) */}
              <ArrowCarousel hideOnDesktop arrowsStyle={BLEED_ARROWS}>
                <div style={BLEED_OUTER}>
                  <JioSaavnCardSection title="Artists" items={filteredArtists} />
                </div>
              </ArrowCarousel>
            </FadeUp>
          )}
        </AnimatePresence>

        {/* Empty Search Result Feedback */}
        <div className="mx-auto w-full max-w-[1400px]" style={PAD_X}>
          <AnimatePresence>
            {hasQuery && totalMatches === 0 && (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 14, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8 }}
                transition={SPRING}
                className="py-16 text-center text-white/50"
              >
                <p className="text-base font-semibold">
                  No liked songs, albums, or artists found for &ldquo;{searchQuery}&rdquo;
                </p>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  transition={SPRING_SNAPPY}
                  onClick={() => setSearchQuery("")}
                  className="mt-3 cursor-pointer text-sm font-semibold text-brand hover:underline"
                >
                  Clear filter
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Add Music Modal ── */}
      <AddMusicToLikedModal open={isAddModalOpen} onOpenChange={setIsAddModalOpen} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   REPLACEABLE PLACEHOLDER · ArrowCarousel + ScrollArrows

   Local stand-in for the app's shared "section left / right arrows".
   Swap it for the reusable component. Nothing else in this file depends on
   its internals.

   How it works
   • <ArrowCarousel> wraps a section. It finds the horizontally scrollable
     element inside by itself (works with JioSaavnCardSection without editing
     it), tracks scroll position, and shows ◀ ▶ at the top-right of the
     section on every screen size (mobile, tablet, desktop).
   • Arrows fade out automatically when nothing overflows, and each one
     dims at the start / end of the scroll.

   Props
     enabled        false → no arrows (used for the table / list view)
     hideOnDesktop  true  → arrows hidden at ≥lg (use when the wrapped section
                            already draws its own desktop arrows)
     arrowsClassName  tweak position, e.g. "top-1"
     arrowsStyle      inline position override (the page uses it to keep the arrows
                      on the content column's right edge while the row bleeds)
   ══════════════════════════════════════════════════════════════════════════ */

function ArrowButton({
  dir,
  disabled,
  onClick,
}: {
  dir: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = dir === "left" ? ChevronLeft : ChevronRight;
  return (
    <motion.button
      type="button"
      aria-label={dir === "left" ? "Scroll left" : "Scroll right"}
      disabled={disabled}
      animate={{ opacity: disabled ? 0.35 : 1 }}
      whileHover={disabled ? undefined : { scale: 1.08 }}
      whileTap={disabled ? undefined : { scale: 0.86 }}
      transition={SPRING_SNAPPY}
      onClick={onClick}
      className="pointer-events-auto flex size-[30px] cursor-pointer items-center justify-center rounded-full bg-white/10 text-white outline-none ring-1 ring-inset ring-white/10 backdrop-blur-md transition-colors hover:bg-white/[0.2] disabled:cursor-default"
    >
      <Icon size={16} strokeWidth={2.5} />
    </motion.button>
  );
}

function ScrollArrows({
  canPrev,
  canNext,
  onPrev,
  onNext,
}: {
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={SPRING_SNAPPY}
      className="flex items-center gap-1.5"
    >
      <ArrowButton dir="left" disabled={!canPrev} onClick={onPrev} />
      <ArrowButton dir="right" disabled={!canNext} onClick={onNext} />
    </motion.div>
  );
}

function ArrowCarousel({
  children,
  className,
  arrowsClassName,
  arrowsStyle,
  hideOnDesktop = false,
  enabled = true,
}: {
  children: React.ReactNode;
  className?: string;
  arrowsClassName?: string;
  arrowsStyle?: React.CSSProperties;
  hideOnDesktop?: boolean;
  enabled?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const [state, setState] = useState({ show: false, prev: false, next: false });

  useEffect(() => {
    const root = rootRef.current;
    const hidden = { show: false, prev: false, next: false };

    if (!enabled || !root) {
      scrollerRef.current = null;
      setState((s) => (s.show ? hidden : s));
      return;
    }

    let current: HTMLElement | null = null;
    let raf = 0;

    const update = () => {
      const el = current;
      if (!el) {
        setState((s) => (s.show ? hidden : s));
        return;
      }
      const max = el.scrollWidth - el.clientWidth;
      const next = { show: max > 2, prev: el.scrollLeft > 2, next: el.scrollLeft < max - 2 };
      setState((s) => (s.show === next.show && s.prev === next.prev && s.next === next.next ? s : next));
    };

    const ro = new ResizeObserver(update);

    // The horizontally scrollable element inside this section (prefers one that overflows)
    const find = (): HTMLElement | null => {
      let fallback: HTMLElement | null = null;
      const nodes = root.querySelectorAll<HTMLElement>("*");
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        const ox = getComputedStyle(el).overflowX;
        if (ox !== "auto" && ox !== "scroll") continue;
        if (el.scrollWidth > el.clientWidth + 2) return el;
        if (!fallback) fallback = el;
      }
      return fallback;
    };

    const attach = () => {
      const found = find();
      if (found !== current) {
        if (current) {
          current.removeEventListener("scroll", update);
          ro.unobserve(current);
        }
        current = found;
        scrollerRef.current = found;
        if (found) {
          found.addEventListener("scroll", update, { passive: true });
          ro.observe(found);
        }
      }
      update();
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(attach);
    };

    const mo = new MutationObserver(schedule);
    mo.observe(root, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    root.addEventListener("load", schedule, true); // images finishing → sizes change
    schedule();

    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      root.removeEventListener("load", schedule, true);
      if (current) current.removeEventListener("scroll", update);
      scrollerRef.current = null;
    };
  }, [enabled]);

  const scrollByDir = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.85, 200), behavior: "smooth" });
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {children}
      <div
        className={cn(
          "pointer-events-none absolute right-0 top-[-1px] z-20",
          hideOnDesktop && "lg:hidden",
          arrowsClassName
        )}
        style={arrowsStyle}
      >
        <AnimatePresence>
          {enabled && state.show && (
            <ScrollArrows
              key="arrows"
              canPrev={state.prev}
              canNext={state.next}
              onPrev={() => scrollByDir(-1)}
              onNext={() => scrollByDir(1)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}