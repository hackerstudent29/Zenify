"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search as SearchIcon,
  Music,
  Sparkles,
  Play,
  Pause,
  Heart,
  ListMusic,
  X,
  History,
  TrendingUp,
  ChevronRight,
  ChevronDown,
  User,
  Disc,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { usePlayerStore } from "@/store/player";
import { useDebounce } from "use-debounce";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import Link from "next/link";
import { cn, getMediaUrl } from "@/lib/utils";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { useSearchParams, useRouter } from "next/navigation";
import { useIsMobile } from "@/hooks/useIsMobile";
import { ArtistLinks } from "@/components/shared/ArtistLinks";
import { SEO } from "@/components/shared/SEO";

/* ------------------------------------------------------------------ */
/*  Tokens                                                             */
/* ------------------------------------------------------------------ */
const SPRING = { type: "spring", stiffness: 520, damping: 32, mass: 0.7 } as const;
const SPRING_SOFT = { type: "spring", stiffness: 340, damping: 34, mass: 0.9 } as const;
const SF_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", system-ui, sans-serif';

const FALLBACK_TRACK = "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=160";
const FALLBACK_ALBUM = "https://images.unsplash.com/photo-1514525253361-bee8718a74a2?w=300";
const FALLBACK_ARTIST = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200";

// Browse categories (tiles)
const DISCOVER_GENRES = [
  { name: "Tamil Hits", query: "Tamil", gradient: "from-[#9E2339] to-[#E11D48]", image: "https://images.unsplash.com/photo-1514525253361-bee8718a74a2?q=80&w=300" },
  { name: "Kollywood", query: "Kollywood", gradient: "from-[#1E3A8A] to-[#3B82F6]", image: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=300" },
  { name: "Top India", query: "India", gradient: "from-[#065F46] to-[#10B981]", image: "https://images.unsplash.com/photo-1459749411177-04218006d396?q=80&w=300" },
  { name: "Melody & Love", query: "Melody", gradient: "from-[#581C87] to-[#A855F7]", image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=300" },
  { name: "Hip-Hop", query: "Hip-Hop", gradient: "from-[#9A3412] to-[#F97316]", image: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?q=80&w=300" },
  { name: "Devotional", query: "Devotional", gradient: "from-[#854D0E] to-[#F59E0B]", image: "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=300" },
  { name: "Acoustic & Chill", query: "Acoustic", gradient: "from-[#0F766E] to-[#14B8A6]", image: "https://images.unsplash.com/photo-1487180144351-b8472da7d491?q=80&w=300" },
  { name: "Party & EDM", query: "Party", gradient: "from-[#831843] to-[#EC4899]", image: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?q=80&w=300" },
  { name: "Workout Pulse", query: "Workout", gradient: "from-[#7F1D1D] to-[#EF4444]", image: "https://images.unsplash.com/photo-1518611012118-696072aa579a?q=80&w=300" },
  { name: "Night Drive", query: "Drive", gradient: "from-[#312E81] to-[#6366F1]", image: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=300" },
  { name: "Rock & Metal", query: "Rock", gradient: "from-[#1E293B] to-[#475569]", image: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?q=80&w=300" },
  { name: "Lo-Fi & Study", query: "Lo-Fi", gradient: "from-[#701A75] to-[#D946EF]", image: "https://images.unsplash.com/photo-1518495973542-4542c06a5843?q=80&w=300" },
];

const DEFAULT_LANGUAGES = ["Tamil", "Hindi", "English", "Telugu", "Malayalam", "Punjabi", "Kannada", "Bengali"];

type FilterTab = "all" | "tracks" | "artists" | "albums" | "playlists";
type RegionalCategory = "all" | "popular" | "new_releases" | "recommended";

const fmtDuration = (d?: number) => {
  const total = Math.floor(d || 0);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
};

/* ------------------------------------------------------------------ */
/*  macOS building blocks                                              */
/* ------------------------------------------------------------------ */

/** macOS segmented control with a spring-sliding selection pill */
function Segmented<T extends string>({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex p-[3px] rounded-[9px] bg-white/[0.08] border border-white/[0.06] backdrop-blur-xl shrink-0">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative px-3.5 py-1 text-[13px] font-medium rounded-[7px] outline-none cursor-pointer transition-colors duration-200 whitespace-nowrap",
              active ? "text-white" : "text-white/60 hover:text-white/90"
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={SPRING}
                className="absolute inset-0 rounded-[7px] bg-white/[0.18] shadow-[0_1px_3px_rgba(0,0,0,0.35),inset_0_0.5px_0_rgba(255,255,255,0.2)]"
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** "Best New Songs >" style shelf header */
function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-0.5 text-[22px] leading-7 font-bold tracking-[-0.02em] text-white">
          <span className="truncate">{title}</span>
          <ChevronRight size={20} strokeWidth={2.5} className="text-white/35 shrink-0" />
        </h2>
        {subtitle && <p className="text-[13px] text-white/50 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Animated equalizer shown on the artwork of the playing song */
function Equalizer({ playing }: { playing: boolean }) {
  return (
    <div className="flex items-end gap-[2px] h-3.5">
      {[0, 1, 2, 3].map((i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-white"
          style={{ height: "30%" }}
          animate={playing ? { height: ["30%", "100%", "45%", "85%", "30%"] } : { height: "30%" }}
          transition={playing ? { duration: 0.9 + i * 0.15, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
        />
      ))}
    </div>
  );
}

/** Apple Music style song row: artwork, title/artist, hover heart, duration */
function SongRow({
  track,
  index,
  isCurrent,
  isPlaying,
  liked,
  onPlay,
  onLike,
}: {
  track: any;
  index?: number;
  isCurrent: boolean;
  isPlaying: boolean;
  liked: boolean;
  onPlay: () => void;
  onLike: (e: React.MouseEvent) => void;
}) {
  const active = isCurrent && isPlaying;
  return (
    <motion.div
      whileTap={{ scale: 0.992 }}
      transition={SPRING}
      onClick={onPlay}
      className="group relative flex items-center gap-3 px-2 h-[60px] rounded-lg hover:bg-white/[0.07] cursor-pointer transition-colors after:absolute after:bottom-0 after:left-[64px] after:right-2 after:h-px after:bg-white/[0.07] last:after:hidden hover:after:opacity-0"
    >
      {index !== undefined && (
        <span className="w-5 text-center text-[13px] font-medium text-white/40 tabular-nums">{index + 1}</span>
      )}

      <div className="relative w-11 h-11 rounded-md overflow-hidden bg-zinc-800 shrink-0 shadow-md ring-1 ring-white/10">
        <img
          src={getMediaUrl(track.coverUrl) || FALLBACK_TRACK}
          alt={track.title || "Track artwork"}
          width={44}
          height={44}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
        />
        <div
          className={cn(
            "absolute inset-0 bg-black/45 backdrop-blur-[2px] flex items-center justify-center transition-opacity duration-200",
            isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        >
          {active ? (
            <>
              <span className="group-hover:hidden"><Equalizer playing /></span>
              <Pause size={16} className="hidden group-hover:block text-white fill-current" />
            </>
          ) : (
            <Play size={16} className="text-white fill-current ml-0.5" />
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className={cn("text-[15px] leading-5 font-medium truncate", isCurrent ? "text-brand" : "text-white")}>
          {track.title}
        </p>
        <div className="text-[13px] leading-4 text-white/55 truncate" onClick={(e) => e.stopPropagation()}>
          <ArtistLinks track={track} maxArtists={3} linkClassName="text-white/55 hover:text-white hover:underline" />
        </div>
      </div>

      <motion.button
        whileTap={{ scale: 0.8 }}
        transition={SPRING}
        onClick={onLike}
        className={cn(
          "p-1.5 rounded-full outline-none cursor-pointer transition-all",
          liked ? "text-brand" : "text-white/50 hover:text-white opacity-0 group-hover:opacity-100"
        )}
        title={liked ? "Unlike" : "Like"}
      >
        <Heart size={15} className={cn(liked && "fill-current")} />
      </motion.button>

      <span className="text-[13px] text-white/45 tabular-nums w-10 text-right">{fmtDuration(track.duration)}</span>
    </motion.div>
  );
}

/** Square artwork card (albums / regional tracks) - Apple Music MediaCard aesthetic */
function ArtCard({
  cover,
  title,
  subtitle,
  caption,
  onClick,
  playable,
  isPlayingNow,
  alt,
}: {
  cover: string;
  title: string;
  subtitle?: string;
  caption?: string;
  onClick: () => void;
  playable?: boolean;
  isPlayingNow?: boolean;
  alt: string;
}) {
  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col gap-1 p-1 rounded-lg transition-all duration-300 hover:bg-white/[0.03] cursor-pointer font-sans min-w-0"
    >
      <div className="group/art relative aspect-square w-full overflow-hidden rounded-[8px] bg-white/[0.06] shadow-[0_2px_10px_rgba(0,0,0,0.35)] ring-1 ring-inset ring-white/10">
        <img
          src={cover}
          alt={alt}
          width={180}
          height={180}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
        />
        {playable && (
          <>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity duration-300 group-hover/art:opacity-100" />
            <div
              className={cn(
                "am-glass-chip absolute bottom-2.5 left-2.5 z-20 flex h-8 w-8 items-center justify-center rounded-full text-white outline-none cursor-pointer",
                "translate-y-1.5 scale-90 opacity-0 transition-[opacity,transform] duration-300 ease-[var(--spring)]",
                "group-hover/art:translate-y-0 group-hover/art:scale-100 group-hover/art:opacity-100",
                "active:!scale-90 hover:bg-white/25",
                isPlayingNow && "!translate-y-0 !scale-100 !opacity-100"
              )}
            >
              {isPlayingNow ? <Pause size={14} className="fill-current" /> : <Play size={14} className="fill-current ml-0.5" />}
            </div>
          </>
        )}
      </div>
      <div className="flex flex-col min-w-0 flex-1 px-1 gap-0.5 mt-2">
        <p className={cn("text-sm font-sans font-semibold tracking-normal truncate transition-colors leading-snug", isPlayingNow ? "text-brand" : "text-white/95 group-hover:text-brand")}>{title}</p>
        {subtitle && <p className="text-[12px] font-medium tracking-tight font-sans text-zinc-400 truncate">{subtitle}</p>}
        {caption && <p className="text-[11px] font-medium tracking-tight font-sans text-zinc-500 truncate">{caption}</p>}
      </div>
    </div>
  );
}

/** Circular artist card - Apple Music MediaCard aesthetic */
function ArtistCard({ artist, onClick }: { artist: any; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col items-center text-center gap-1 p-1 rounded-lg transition-all duration-300 cursor-pointer font-sans min-w-0"
    >
      <div className="group/art relative aspect-square w-full rounded-full overflow-hidden bg-white/[0.06] shadow-[0_2px_10px_rgba(0,0,0,0.35)] ring-1 ring-inset ring-white/10">
        <img
          src={getMediaUrl(artist.imageUrl) || FALLBACK_ARTIST}
          alt={artist.name || "Artist portrait"}
          width={140}
          height={140}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex flex-col items-center min-w-0 w-full px-1 gap-0.5 mt-2">
        <p className="text-sm font-sans font-semibold tracking-normal text-white/95 group-hover:text-brand truncate w-full transition-colors">{artist.name}</p>
        <p className="text-[12px] font-medium tracking-tight font-sans text-brand">Artist</p>
      </div>
    </div>
  );
}

/** Pill chip used for recents / trending / languages */
function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.95 }}
      transition={SPRING}
      onClick={onClick}
      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.06] text-[13px] font-medium text-white/85 hover:text-white transition-colors cursor-pointer outline-none backdrop-blur-xl"
    >
      {children}
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function DiscoverPage({ isSearchRoute = false }: { isSearchRoute?: boolean } = {}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const [query, setQuery] = useState(searchParams.get("q") || searchParams.get("query") || "");
  const [debouncedQuery] = useDebounce(query, 280);
  const [selectedFilter, setSelectedFilter] = useState<FilterTab>("all");
  const [isSmartSearching, setIsSmartSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const user = useAuthStore((s) => s.user);
  const preferredCountry = user?.country?.trim() || "";
  const preferredLang = user?.preferences?.languages?.[0]?.trim() || "";

  // Regional Country & Language Discovery State
  const [selectedCountry, setSelectedCountry] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("zenify_selected_country") || preferredCountry || "IN";
    }
    return preferredCountry || "IN";
  });
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("zenify_selected_language") || preferredLang || "en";
    }
    return preferredLang || "en";
  });
  const [regionalCategory, setRegionalCategory] = useState<RegionalCategory>("all");

  useEffect(() => {
    if (preferredCountry) setSelectedCountry(preferredCountry);
    if (preferredLang) setSelectedLanguage(preferredLang);
  }, [preferredCountry, preferredLang]);

  useEffect(() => {
    const handleCountryLang = (e: any) => {
      if (e.detail?.countryCode && e.detail?.languageCode) {
        setSelectedCountry(e.detail.countryCode);
        setSelectedLanguage(e.detail.languageCode);
      }
    };
    window.addEventListener("zenify:country-language-changed", handleCountryLang);
    return () => window.removeEventListener("zenify:country-language-changed", handleCountryLang);
  }, []);

  // Strict Regional Discovery Query
  const { data: regionalData, isLoading: isRegionalLoading } = useQuery({
    queryKey: ["discover-regional-tracks", selectedCountry, selectedLanguage, regionalCategory],
    queryFn: async () => {
      if (!selectedCountry || !selectedLanguage) return null;
      const res = await api.get("/discover/tracks", {
        params: { country: selectedCountry, language: selectedLanguage, category: regionalCategory, limit: 12 },
      });
      return res.data;
    },
    enabled: !debouncedQuery && !!selectedCountry && !!selectedLanguage,
    staleTime: 1000 * 60 * 5,
  });

  // Autocomplete UI & Keyboard Navigation
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Show more toggles
  const [showMoreTracks, setShowMoreTracks] = useState(false);
  const [showMoreArtists, setShowMoreArtists] = useState(false);
  const [showMoreAlbums, setShowMoreAlbums] = useState(false);
  const [showOtherVersions, setShowOtherVersions] = useState(false);

  const { isAuthenticated } = useAuthStore();
  const { currentTrack, setTrack, isPlaying } = usePlayerStore();
  const { setPlayerMinimized } = useUIStore();

  // Dynamic typing animation placeholder
  const [placeholderText, setPlaceholderText] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [cursorBlink, setCursorBlink] = useState(true);

  const placeholders = [
    "What do you want to listen to?",
    "Search songs, artists, or albums",
    "Search 'Anirudh' or 'A.R. Rahman'",
    "Search 'The Weeknd' or 'Starboy'",
    "Type a mood, vibe, or genre",
    "Explore the zenify sound waves",
  ];

  useEffect(() => {
    try {
      const stored = localStorage.getItem("zenify_recent_searches");
      if (stored) setRecentSearches(JSON.parse(stored));
    } catch {}
  }, []);

  const saveRecentSearch = (term: string) => {
    if (!term || term.trim().length < 2) return;
    const clean = term.trim();
    const updated = [clean, ...recentSearches.filter((s) => s.toLowerCase() !== clean.toLowerCase())].slice(0, 8);
    setRecentSearches(updated);
    try {
      localStorage.setItem("zenify_recent_searches", JSON.stringify(updated));
    } catch {}
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem("zenify_recent_searches");
    } catch {}
  };

  useEffect(() => {
    const interval = setInterval(() => setCursorBlink((b) => !b), 530);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const currentWord = placeholders[placeholderIndex];
    let timer: NodeJS.Timeout;

    if (isDeleting) {
      if (charIndex > 0) {
        timer = setTimeout(() => {
          setPlaceholderText(currentWord.substring(0, charIndex - 1));
          setCharIndex((prev) => prev - 1);
        }, 20);
      } else {
        setIsDeleting(false);
        setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
      }
    } else {
      if (charIndex < currentWord.length) {
        timer = setTimeout(() => {
          setPlaceholderText(currentWord.substring(0, charIndex + 1));
          setCharIndex((prev) => prev + 1);
        }, 30);
      } else {
        timer = setTimeout(() => setIsDeleting(true), 3200);
      }
    }

    return () => clearTimeout(timer);
  }, [charIndex, isDeleting, placeholderIndex]);

  // Sync state with URL search params
  useEffect(() => {
    const q = searchParams.get("q") || searchParams.get("query");
    if (q && q !== query) {
      setQuery(q);
    }
  }, [searchParams]);

  // Liked tracks
  const { data: likedTrackIds } = useQuery({
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
        ? prev.filter((id) => id !== trackId)
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

  // Live query results
  const { data: results, isLoading: isSearchLoading } = useQuery({
    queryKey: ["discover-search", debouncedQuery],
    queryFn: async ({ signal }) => {
      if (!debouncedQuery) return null;
      saveRecentSearch(debouncedQuery);
      const res = await api.get("search", { params: { q: debouncedQuery, limit: 24 }, signal });
      return res.data;
    },
    enabled: !!debouncedQuery,
    staleTime: 15000,
  });

  // Live provider search rich autocomplete (Artists, Tracks, Albums & Hints)
  const { data: autocompleteData } = useQuery({
    queryKey: ["search-autocomplete", debouncedQuery],
    queryFn: async ({ signal }) => {
      if (!debouncedQuery || debouncedQuery.trim().length < 2) return null;
      const res = await api.get("search/autocomplete", { params: { q: debouncedQuery.trim() }, signal });
      return res.data;
    },
    enabled: !!debouncedQuery && debouncedQuery.trim().length >= 2,
    staleTime: 1000 * 60 * 5,
  });

  const suggestions = useMemo(() => {
    if (!autocompleteData) return [];
    if (Array.isArray(autocompleteData)) return autocompleteData;
    return autocompleteData.hints || [];
  }, [autocompleteData]);

  const autocompleteArtists = useMemo(() => autocompleteData?.artists || [], [autocompleteData]);
  const autocompleteTracks = useMemo(() => autocompleteData?.tracks || [], [autocompleteData]);
  const autocompleteAlbums = useMemo(() => autocompleteData?.albums || [], [autocompleteData]);

  // Flattened items for keyboard navigation (Down/Up/Enter)
  const flattenedNavItems = useMemo(() => {
    const list: { type: "artist" | "track" | "album" | "hint"; data: any }[] = [];
    autocompleteArtists.slice(0, 2).forEach((a: any) => list.push({ type: "artist", data: a }));
    autocompleteTracks.slice(0, 4).forEach((t: any) => list.push({ type: "track", data: t }));
    autocompleteAlbums.slice(0, 2).forEach((alb: any) => list.push({ type: "album", data: alb }));
    suggestions.slice(0, 3).forEach((h: any) => list.push({ type: "hint", data: h }));
    return list;
  }, [autocompleteArtists, autocompleteTracks, autocompleteAlbums, suggestions]);

  // Discovery Home data (genres, top charts, trending, country top songs)
  const { data: homeData } = useQuery({
    queryKey: ["discover-home"],
    queryFn: async () => {
      const res = await api.get("search/home");
      return res.data;
    },
    enabled: !debouncedQuery,
    staleTime: 1000 * 60 * 5,
  });

  // Top Result calculation
  const topResult = useMemo(() => {
    if (!results) return null;
    const q = debouncedQuery.toLowerCase().trim();

    if (results.artists?.[0]) {
      const aName = results.artists[0].name.toLowerCase();
      if (aName.includes(q) || q.includes(aName)) {
        return { item: results.artists[0], type: "artist" };
      }
    }
    if (results.tracks?.[0]) return { item: results.tracks[0], type: "track" };
    if (results.artists?.[0]) return { item: results.artists[0], type: "artist" };
    if (results.albums?.[0]) return { item: results.albums[0], type: "album" };
    return null;
  }, [results, debouncedQuery]);

  const handleSelectGenre = (genreQuery: string) => {
    setQuery(genreQuery);
    setIsInputFocused(false);
  };

  const handleSelectSuggestion = (hint: string) => {
    setQuery(hint);
    setIsInputFocused(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (flattenedNavItems.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) => Math.min(prev + 1, flattenedNavItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter") {
      if (selectedSuggestionIndex >= 0 && flattenedNavItems[selectedSuggestionIndex]) {
        e.preventDefault();
        const item = flattenedNavItems[selectedSuggestionIndex];
        if (item.type === "track") {
          playTrack(item.data);
          setIsInputFocused(false);
        } else if (item.type === "artist") {
          router.push(`/artist/${item.data.id}`);
          setIsInputFocused(false);
        } else if (item.type === "album") {
          router.push(`/album/${item.data.id}`);
          setIsInputFocused(false);
        } else if (item.type === "hint") {
          handleSelectSuggestion(item.data.title);
        }
      } else {
        setIsInputFocused(false);
      }
    } else if (e.key === "Escape") {
      setIsInputFocused(false);
    }
  };

  const logSearchEvent = (type: string, id: string, title: string) => {
    try {
      api.post("search/event", { query: debouncedQuery, type, id, title }).catch(() => {});
    } catch {}
  };

  const playTrack = (track: any, log = true) => {
    const formatted = {
      ...track,
      artwork: track.artwork || track.coverUrl || track.image,
      streamUrl: track.streamUrl || track.audioUrl,
    };
    setTrack(formatted);
    setPlayerMinimized(false);
    if (log) logSearchEvent("track", track.id, track.title);
  };

  const openTopResult = () => {
    if (!topResult) return;
    if (topResult.type === "track") playTrack(topResult.item);
    else if (topResult.type === "artist") router.push(`/artist/${topResult.item.id}`);
    else if (topResult.type === "album") router.push(`/album/${topResult.item.id}`);
  };

  const userLanguages = homeData?.languages?.length ? homeData.languages : DEFAULT_LANGUAGES;
  const isLiked = (id: string) => !!likedTrackIds?.includes(id);

  const ShowMore = ({ open, onToggle, count, label = "Show All" }: { open: boolean; onToggle: () => void; count: number; label?: string }) => (
    <button
      onClick={onToggle}
      className="text-[13px] font-medium text-brand hover:opacity-70 transition-opacity cursor-pointer outline-none shrink-0"
    >
      {open ? "Show Less" : `${label} (${count})`}
    </button>
  );

  const filterOptions: { value: FilterTab; label: string }[] = [
    { value: "all", label: "Top Results" },
    { value: "tracks", label: "Songs" },
    { value: "artists", label: "Artists" },
    { value: "albums", label: "Albums" },
    { value: "playlists", label: "Playlists" },
  ];

  const regionalOptions: { value: RegionalCategory; label: string }[] = [
    { value: "all", label: "All" },
    { value: "popular", label: "Popular" },
    { value: "new_releases", label: "New Releases" },
    { value: "recommended", label: "For You" },
  ];

  return (
    <MotionConfig reducedMotion="user">
      <div
        style={{ fontFamily: SF_FONT }}
        className="min-h-screen bg-[#1c1c1e] text-white relative antialiased selection:bg-brand selection:text-white pt-[calc(64px+env(safe-area-inset-top,0px))] md:pt-[calc(72px+env(safe-area-inset-top,0px))] pb-[calc(80px+64px+env(safe-area-inset-bottom,0px))] md:pb-[calc(110px+env(safe-area-inset-bottom,0px))]"
      >
        <SEO
          title={isSearchRoute ? "Search Songs, Artists & Multilingual Lyrics – Zenify" : "Discover Trending Music, New Releases & Top Charts – Zenify"}
          description={isSearchRoute ? "Search millions of tracks, albums, and artists with instant playback and synchronized lyrics in Tamil, Hindi, and English on Zenify." : "Explore trending tracks, newly released albums, and curated multilingual playlists with real-time synchronized lyrics on Zenify."}
          path={isSearchRoute ? "/search" : "/discover"}
        />

        {/* Ambient tint, like the artwork wash behind Apple Music's sidebar */}
        <div className="absolute top-0 inset-x-0 h-[420px] bg-[radial-gradient(ellipse_70%_60%_at_50%_-10%,rgba(250,36,60,0.14),transparent)] pointer-events-none" />

        <div className="max-w-[1340px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          {/* Large title */}
          <h1 className="text-[28px] sm:text-[34px] leading-tight font-bold tracking-[-0.03em] text-white pt-3 pb-3">
            {isSearchRoute ? "Search" : "Browse"}
          </h1>

          {/* ===== Sticky toolbar: search field + segmented filter ===== */}
          <div className="relative md:sticky md:top-[calc(64px+env(safe-area-inset-top,0px))] z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-2.5 bg-[rgba(28,28,30,0.72)] backdrop-blur-2xl backdrop-saturate-150 border-b border-white/[0.07] space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 group">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-white/45 group-focus-within:text-white/80 transition-colors">
                  <SearchIcon size={16} strokeWidth={2.2} />
                </div>

                <input
                  ref={inputRef}
                  type="text"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={isInputFocused && !!suggestions?.length}
                  aria-controls="search-suggestions-listbox"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelectedSuggestionIndex(-1);
                  }}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setTimeout(() => setIsInputFocused(false), 200)}
                  onKeyDown={handleKeyDown}
                  placeholder={isMobile ? "Artists, Songs, Lyrics, and More" : placeholderText + (cursorBlink ? "|" : "")}
                  className="w-full h-10 md:h-11 rounded-[10px] bg-white/[0.09] hover:bg-white/[0.12] focus:bg-white/[0.14] border border-white/[0.06] focus:border-brand/60 focus:ring-4 focus:ring-brand/20 pl-9 pr-24 text-[15px] text-white placeholder:text-white/40 outline-none transition-all duration-200"
                />

                <div className="absolute inset-y-0 right-2 flex items-center gap-1.5">
                  <AnimatePresence>
                    {query && (
                      <motion.button
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        transition={SPRING}
                        onClick={() => {
                          setQuery("");
                          inputRef.current?.focus();
                        }}
                        className="w-[18px] h-[18px] rounded-full bg-white/30 hover:bg-white/45 text-[#1c1c1e] flex items-center justify-center cursor-pointer outline-none transition-colors"
                        title="Clear search"
                      >
                        <X size={11} strokeWidth={3} />
                      </motion.button>
                    )}
                  </AnimatePresence>

                  <motion.button
                    whileTap={{ scale: 0.94 }}
                    transition={SPRING}
                    onClick={() => setIsSmartSearching(!isSmartSearching)}
                    className={cn(
                      "hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-medium outline-none cursor-pointer transition-colors",
                      isSmartSearching
                        ? "bg-brand text-white shadow-[0_0_14px_rgba(250,36,60,0.45)]"
                        : "bg-white/10 text-white/60 hover:text-white hover:bg-white/15"
                    )}
                    title="Toggle AI Semantic Search"
                  >
                    <Sparkles size={12} className={cn(isSmartSearching && "animate-pulse")} />
                    <span>{isSmartSearching ? "AI On" : "AI"}</span>
                  </motion.button>
                </div>

                {/* Rich Spotify / Apple Music style autocomplete dropdown */}
                <AnimatePresence>
                  {isInputFocused && flattenedNavItems.length > 0 && (
                    <motion.div
                      id="search-suggestions-listbox"
                      role="listbox"
                      initial={{ opacity: 0, scale: 0.98, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98, y: -4 }}
                      transition={SPRING}
                      style={{ transformOrigin: "top center" }}
                      className="absolute left-0 right-0 top-full mt-2 p-1.5 rounded-2xl bg-[rgba(24,24,27,0.92)] backdrop-blur-2xl backdrop-saturate-150 border border-white/[0.14] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] z-50 max-h-[480px] overflow-y-auto no-scrollbar space-y-1"
                    >
                      {/* Top Artists Section */}
                      {autocompleteArtists.length > 0 && (
                        <div className="p-1">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 px-2.5 py-1 flex items-center gap-1.5">
                            <User size={11} className="text-brand" />
                            <span>Artists</span>
                          </div>
                          {autocompleteArtists.slice(0, 2).map((artist: any, aIdx: number) => {
                            const navIdx = aIdx;
                            const isSelected = selectedSuggestionIndex === navIdx;
                            return (
                              <div
                                key={artist.id || `artist-${aIdx}`}
                                role="option"
                                aria-selected={isSelected}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  router.push(`/artist/${artist.id}`);
                                  setIsInputFocused(false);
                                }}
                                className={cn(
                                  "flex items-center gap-3 px-2.5 py-2 rounded-xl cursor-pointer transition-all group",
                                  isSelected
                                    ? "bg-white/15 text-white"
                                    : "text-white/85 hover:bg-white/10 hover:text-white"
                                )}
                              >
                                {artist.imageUrl || artist.image ? (
                                  <img
                                    src={getMediaUrl(artist.imageUrl || artist.image)}
                                    alt={artist.name}
                                    className="w-9 h-9 rounded-full object-cover border border-white/10 shrink-0"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = FALLBACK_ARTIST;
                                    }}
                                  />
                                ) : (
                                  <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                                    <User size={14} className="text-white/60" />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="text-[13px] font-semibold text-white truncate group-hover:text-brand transition-colors">
                                    {artist.name}
                                  </div>
                                  <div className="text-[11px] text-white/45 truncate">
                                    Artist {artist.follower_count || artist.followers ? `• ${((artist.follower_count || artist.followers) / 1000).toFixed(0)}k followers` : ""}
                                  </div>
                                </div>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/60 uppercase font-bold tracking-wider shrink-0">
                                  Artist
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Top Songs Section */}
                      {autocompleteTracks.length > 0 && (
                        <div className="p-1 border-t border-white/5">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 px-2.5 py-1 flex items-center gap-1.5">
                            <Music size={11} className="text-brand" />
                            <span>Songs</span>
                          </div>
                          {autocompleteTracks.slice(0, 4).map((track: any, tIdx: number) => {
                            const navIdx = Math.min(autocompleteArtists.length, 2) + tIdx;
                            const isSelected = selectedSuggestionIndex === navIdx;
                            const isCurrent = currentTrack?.id === track.id;
                            return (
                              <div
                                key={track.id || `track-${tIdx}`}
                                role="option"
                                aria-selected={isSelected}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  playTrack(track);
                                  setIsInputFocused(false);
                                }}
                                className={cn(
                                  "flex items-center gap-3 px-2.5 py-1.5 rounded-xl cursor-pointer transition-all group",
                                  isSelected
                                    ? "bg-white/15 text-white"
                                    : "text-white/85 hover:bg-white/10 hover:text-white"
                                )}
                              >
                                <div className="relative w-9 h-9 shrink-0 rounded-lg overflow-hidden border border-white/10">
                                  <img
                                    src={getMediaUrl(track.coverUrl || track.artwork || track.image)}
                                    alt={track.title}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = FALLBACK_TRACK;
                                    }}
                                  />
                                  <div
                                    className={cn(
                                      "absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity",
                                      isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                    )}
                                  >
                                    {isCurrent && isPlaying ? (
                                      <Pause size={12} className="text-white fill-white" />
                                    ) : (
                                      <Play size={12} className="text-white fill-white ml-0.5" />
                                    )}
                                  </div>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div
                                    className={cn(
                                      "text-[13px] font-medium truncate transition-colors",
                                      isCurrent ? "text-brand font-semibold" : "text-white group-hover:text-white"
                                    )}
                                  >
                                    {track.title}
                                  </div>
                                  <div className="text-[11px] text-white/45 truncate">
                                    {track.artist || track.artists?.map((a: any) => a.name).join(", ")}
                                    {track.album ? ` • ${track.album}` : ""}
                                  </div>
                                </div>
                                {track.duration ? (
                                  <span className="text-[11px] text-white/40 tabular-nums shrink-0">
                                    {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, "0")}
                                  </span>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Top Albums Section */}
                      {autocompleteAlbums.length > 0 && (
                        <div className="p-1 border-t border-white/5">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 px-2.5 py-1 flex items-center gap-1.5">
                            <Disc size={11} className="text-brand" />
                            <span>Albums</span>
                          </div>
                          {autocompleteAlbums.slice(0, 2).map((album: any, albIdx: number) => {
                            const navIdx =
                              Math.min(autocompleteArtists.length, 2) +
                              Math.min(autocompleteTracks.length, 4) +
                              albIdx;
                            const isSelected = selectedSuggestionIndex === navIdx;
                            return (
                              <div
                                key={album.id || `album-${albIdx}`}
                                role="option"
                                aria-selected={isSelected}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  router.push(`/album/${album.id}`);
                                  setIsInputFocused(false);
                                }}
                                className={cn(
                                  "flex items-center gap-3 px-2.5 py-1.5 rounded-xl cursor-pointer transition-all group",
                                  isSelected
                                    ? "bg-white/15 text-white"
                                    : "text-white/85 hover:bg-white/10 hover:text-white"
                                )}
                              >
                                <img
                                  src={getMediaUrl(album.coverUrl || album.artwork || album.image)}
                                  alt={album.title || album.name}
                                  className="w-9 h-9 rounded-md object-cover border border-white/10 shrink-0"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = FALLBACK_ALBUM;
                                  }}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-[13px] font-medium text-white truncate group-hover:text-brand transition-colors">
                                    {album.title || album.name}
                                  </div>
                                  <div className="text-[11px] text-white/45 truncate">
                                    Album • {album.artist || album.artists?.map((a: any) => a.name).join(", ")}
                                    {album.year ? ` • ${album.year}` : ""}
                                  </div>
                                </div>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/60 uppercase font-bold tracking-wider shrink-0">
                                  Album
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Search Hints */}
                      {suggestions.length > 0 && (
                        <div className="p-1 border-t border-white/5">
                          {suggestions.slice(0, 3).map((hint: any, hIdx: number) => {
                            const navIdx =
                              Math.min(autocompleteArtists.length, 2) +
                              Math.min(autocompleteTracks.length, 4) +
                              Math.min(autocompleteAlbums.length, 2) +
                              hIdx;
                            const isSelected = selectedSuggestionIndex === navIdx;
                            return (
                              <div
                                key={hint.id || `hint-${hIdx}`}
                                role="option"
                                aria-selected={isSelected}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleSelectSuggestion(hint.title);
                                }}
                                className={cn(
                                  "flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] cursor-pointer transition-colors",
                                  isSelected
                                    ? "bg-brand text-white"
                                    : "text-white/70 hover:bg-white/10 hover:text-white"
                                )}
                              >
                                <SearchIcon size={12} className="opacity-50 shrink-0" />
                                <span className="truncate flex-1">{hint.title}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {isMobile && (isInputFocused || query) && (
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setQuery("");
                    setIsInputFocused(false);
                    inputRef.current?.blur();
                  }}
                  className="text-[15px] font-medium text-brand hover:opacity-70 transition-opacity shrink-0"
                >
                  Cancel
                </button>
              )}
            </div>

            <AnimatePresence initial={false}>
              {debouncedQuery && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={SPRING_SOFT}
                  className="overflow-hidden"
                >
                  <div className="overflow-x-auto no-scrollbar">
                    <Segmented id="filter" value={selectedFilter} onChange={(v) => setSelectedFilter(v as FilterTab)} options={filterOptions} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ===== Content ===== */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={debouncedQuery ? "results" : "discover"}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            >
              {!debouncedQuery ? (
                /* ================= DISCOVER ================= */
                <div className="space-y-11 pt-7">
                  {/* Regional shelf */}
                  <section>
                    <SectionHeader
                      title={
                        regionalData?.country && regionalData?.language
                          ? `Songs from ${regionalData.country.name} in ${regionalData.language.name}`
                          : "Discover by Country & Language"
                      }
                      subtitle="Verified songs from the selected country, sung in your chosen language."
                      action={
                        <Link href="/settings" className="text-[13px] font-medium text-brand hover:opacity-70 transition-opacity shrink-0 pb-0.5">
                          Change in Settings
                        </Link>
                      }
                    />

                    <div className="overflow-x-auto no-scrollbar mb-4">
                      <Segmented id="regional" value={regionalCategory} onChange={(v) => setRegionalCategory(v as RegionalCategory)} options={regionalOptions} />
                    </div>

                    {isRegionalLoading ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div key={i}>
                            <div className="aspect-square rounded-xl bg-white/[0.06] animate-pulse" />
                            <div className="h-3 w-3/4 rounded bg-white/[0.06] animate-pulse mt-2.5" />
                            <div className="h-3 w-1/2 rounded bg-white/[0.04] animate-pulse mt-1.5" />
                          </div>
                        ))}
                      </div>
                    ) : regionalData?.items && regionalData.items.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {regionalData.items.slice(0, 12).map((track: any) => (
                          <ArtCard
                            key={track.id}
                            cover={getMediaUrl(track.coverUrl) || "/logo.png"}
                            alt={track.title || "Track artwork"}
                            title={track.title}
                            subtitle={track.artist?.name || "Unknown Artist"}
                            caption={`${track.countryCode || selectedCountry} · ${track.languageCode || selectedLanguage}`}
                            playable
                            isPlayingNow={currentTrack?.id === track.id && isPlaying}
                            onClick={() => playTrack(track, false)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="py-14 px-6 rounded-2xl bg-white/[0.04] border border-white/[0.07] text-center">
                        <div className="w-12 h-12 rounded-xl bg-white/[0.08] flex items-center justify-center mx-auto text-white/60 mb-3">
                          <Music size={22} />
                        </div>
                        <h3 className="text-[17px] font-semibold text-white">No Songs Available</h3>
                        <p className="text-[13px] text-white/50 max-w-md mx-auto mt-1">
                          There are no verified songs for this country and language yet. Try a different combination in Settings.
                        </p>
                      </div>
                    )}
                  </section>

                  {/* Recent searches */}
                  {recentSearches.length > 0 && (
                    <section>
                      <div className="flex items-end justify-between mb-3">
                        <h2 className="flex items-center gap-2 text-[22px] leading-7 font-bold tracking-[-0.02em]">
                          <History size={18} className="text-white/40" />
                          Recently Searched
                        </h2>
                        <button
                          onClick={clearRecentSearches}
                          className="text-[13px] font-medium text-brand hover:opacity-70 transition-opacity cursor-pointer pb-0.5"
                        >
                          Clear
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {recentSearches.map((term) => (
                          <Chip key={term} onClick={() => setQuery(term)}>
                            <SearchIcon size={12} className="text-white/45" />
                            <span>{term}</span>
                          </Chip>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Languages */}
                  <section>
                    <SectionHeader title="Browse by Language" />
                    <div className="flex flex-wrap gap-2">
                      {userLanguages.map((lang: string) => (
                        <Chip key={lang} onClick={() => setQuery(lang)}>
                          {lang}
                        </Chip>
                      ))}
                    </div>
                  </section>

                  {/* Trending searches */}
                  {homeData?.trendingSearches && homeData.trendingSearches.length > 0 && (
                    <section>
                      <SectionHeader title="Trending Searches" />
                      <div className="flex flex-wrap gap-2">
                        {homeData.trendingSearches.map((term: string) => (
                          <Chip key={term} onClick={() => setQuery(term)}>
                            <TrendingUp size={12} className="text-brand" />
                            <span>{term}</span>
                          </Chip>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Browse categories */}
                  <section>
                    <SectionHeader title="Browse Categories" subtitle="Explore curated sounds and moods." />
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
                      {DISCOVER_GENRES.map((genre) => (
                        <motion.div
                          key={genre.name}
                          whileHover={{ scale: 1.03, y: -2 }}
                          whileTap={{ scale: 0.97 }}
                          transition={SPRING}
                          onClick={() => handleSelectGenre(genre.query)}
                          className={cn(
                            "group relative h-[120px] sm:h-[132px] rounded-xl overflow-hidden p-3.5 cursor-pointer select-none shadow-[0_8px_24px_-10px_rgba(0,0,0,0.7)] ring-1 ring-white/10",
                            `bg-gradient-to-br ${genre.gradient}`
                          )}
                        >
                          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.12] to-transparent pointer-events-none" />
                          <span className="relative z-10 text-[17px] leading-tight font-bold text-white tracking-tight drop-shadow-sm">
                            {genre.name}
                          </span>
                          <div className="absolute -right-3 -bottom-3 w-[72px] h-[72px] sm:w-20 sm:h-20 rounded-lg overflow-hidden shadow-2xl rotate-[22deg] group-hover:rotate-[14deg] group-hover:scale-110 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ring-1 ring-white/25">
                            <img src={genre.image} alt={genre.name} width={80} height={80} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </section>

                  {/* Top songs */}
                  {homeData?.trendingTracks && homeData.trendingTracks.length > 0 && (
                    <section>
                      <SectionHeader
                        title={`Top Songs in ${homeData?.countryName || "Your Country"}`}
                        subtitle="Real-time charts for your region."
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6">
                        {homeData.trendingTracks.slice(0, 9).map((track: any) => (
                          <SongRow
                            key={track.id}
                            track={track}
                            isCurrent={currentTrack?.id === track.id}
                            isPlaying={isPlaying}
                            liked={isLiked(track.id)}
                            onLike={(e) => toggleLike(track.id, e)}
                            onPlay={() => playTrack(track)}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Trending albums */}
                  {homeData?.trendingAlbums && homeData.trendingAlbums.length > 0 && (
                    <section>
                      <SectionHeader title="Trending Albums" subtitle="Popular releases and top projects." />
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {homeData.trendingAlbums.slice(0, 6).map((album: any) => (
                          <ArtCard
                            key={album.id}
                            cover={getMediaUrl(album.coverUrl) || FALLBACK_ALBUM}
                            alt={album.title || "Album artwork"}
                            title={album.title}
                            subtitle={album.artist?.name || "Album"}
                            onClick={() => {
                              setQuery(album.title);
                              logSearchEvent("album", album.id, album.title);
                            }}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Popular artists */}
                  {homeData?.artists && homeData.artists.length > 0 && (
                    <section>
                      <SectionHeader title="Popular Artists" subtitle="Top voices and creators in your languages." />
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
                        {homeData.artists.slice(0, 6).map((artist: any) => (
                          <ArtistCard
                            key={artist.id}
                            artist={artist}
                            onClick={() => {
                              setQuery(artist.name);
                              logSearchEvent("artist", artist.id, artist.name);
                            }}
                          />
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              ) : (
                /* ================= RESULTS ================= */
                <div className="space-y-10 pt-7">
                  {isSearchLoading ? (
                    <div className="py-28 text-center space-y-3">
                      <div className="w-6 h-6 mx-auto border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                      <p className="text-[13px] text-white/50">Searching…</p>
                    </div>
                  ) : (
                    <>
                      {/* Top result + songs */}
                      {(selectedFilter === "all" || selectedFilter === "tracks") && topResult && (
                        <section className="grid grid-cols-1 lg:grid-cols-12 gap-x-8 gap-y-6">
                          <div className="lg:col-span-5">
                            <SectionHeader title="Top Result" />
                            <motion.div
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.985 }}
                              transition={SPRING}
                              onClick={openTopResult}
                              className="group relative p-5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.09] border border-white/[0.09] backdrop-blur-xl shadow-[0_16px_40px_-16px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.08)] cursor-pointer transition-colors"
                            >
                              <div
                                className={cn(
                                  "w-[104px] h-[104px] overflow-hidden mb-4 shadow-[0_12px_30px_-10px_rgba(0,0,0,0.8)] ring-1 ring-white/10",
                                  topResult.type === "artist" ? "rounded-full" : "rounded-xl"
                                )}
                              >
                                <img
                                  src={getMediaUrl(topResult.item.coverUrl || topResult.item.imageUrl) || FALLBACK_TRACK}
                                  alt={topResult.item.title || topResult.item.name || "Top search result"}
                                  width={104}
                                  height={104}
                                  fetchPriority="high"
                                  decoding="async"
                                  className="w-full h-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-105"
                                />
                              </div>

                              <h4 className="text-[26px] leading-8 font-bold tracking-[-0.02em] text-white truncate pr-14">
                                {topResult.item.title || topResult.item.name}
                              </h4>

                              <p className="text-[14px] text-white/55 mt-1 truncate pr-14">
                                <span className="capitalize">{topResult.type === "track" ? "Song" : topResult.type}</span>
                                {topResult.item.artist?.name && (
                                  <>
                                    {" · "}
                                    <ArtistLinks track={topResult.item} className="inline" linkClassName="text-white/70 hover:text-white hover:underline" />
                                  </>
                                )}
                              </p>

                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.88 }}
                                transition={SPRING}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openTopResult();
                                }}
                                className="absolute bottom-5 right-5 w-11 h-11 rounded-full bg-brand text-white flex items-center justify-center shadow-[0_8px_24px_-6px_rgba(250,36,60,0.6)] cursor-pointer outline-none"
                                title="Play"
                              >
                                <Play size={19} className="fill-current ml-0.5" />
                              </motion.button>
                            </motion.div>
                          </div>

                          {results?.tracks && results.tracks.length > 0 && (
                            <div className="lg:col-span-7">
                              <SectionHeader
                                title="Songs"
                                action={
                                  results.tracks.length > 5 ? (
                                    <ShowMore open={showMoreTracks} onToggle={() => setShowMoreTracks(!showMoreTracks)} count={results.tracks.length} />
                                  ) : undefined
                                }
                              />
                              <motion.div layout transition={SPRING_SOFT}>
                                {results.tracks.slice(0, showMoreTracks ? 24 : 5).map((track: any, i: number) => (
                                  <SongRow
                                    key={track.id}
                                    track={track}
                                    index={i}
                                    isCurrent={currentTrack?.id === track.id}
                                    isPlaying={isPlaying}
                                    liked={isLiked(track.id)}
                                    onLike={(e) => toggleLike(track.id, e)}
                                    onPlay={() => playTrack(track)}
                                  />
                                ))}
                              </motion.div>
                            </div>
                          )}
                        </section>
                      )}

                      {/* Other versions: macOS disclosure group */}
                      {results?.otherVersions && results.otherVersions.length > 0 && (
                        <div className="rounded-xl bg-white/[0.05] border border-white/[0.08] overflow-hidden">
                          <button
                            onClick={() => setShowOtherVersions(!showOtherVersions)}
                            className="w-full flex items-center gap-2 px-4 py-3 hover:bg-white/[0.05] transition-colors cursor-pointer text-left outline-none"
                          >
                            <motion.span animate={{ rotate: showOtherVersions ? 0 : -90 }} transition={SPRING} className="flex text-white/50">
                              <ChevronDown size={16} strokeWidth={2.5} />
                            </motion.span>
                            <span className="text-[15px] font-medium text-white">Other Versions & Remixes</span>
                            <span className="text-[12px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-white/60">
                              {results.otherVersions.length}
                            </span>
                          </button>

                          <AnimatePresence initial={false}>
                            {showOtherVersions && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={SPRING_SOFT}
                                className="overflow-hidden border-t border-white/[0.07]"
                              >
                                <div className="p-2">
                                  {results.otherVersions.map((track: any) => (
                                    <SongRow
                                      key={track.id}
                                      track={track}
                                      isCurrent={currentTrack?.id === track.id}
                                      isPlaying={isPlaying}
                                      liked={isLiked(track.id)}
                                      onLike={(e) => toggleLike(track.id, e)}
                                      onPlay={() => playTrack(track)}
                                    />
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      {/* Artists */}
                      {(selectedFilter === "all" || selectedFilter === "artists") && results?.artists && results.artists.length > 0 && (
                        <section>
                          <SectionHeader
                            title="Artists"
                            action={
                              results.artists.length > 6 ? (
                                <ShowMore open={showMoreArtists} onToggle={() => setShowMoreArtists(!showMoreArtists)} count={results.artists.length} label="Show More" />
                              ) : undefined
                            }
                          />
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
                            {results.artists.slice(0, showMoreArtists ? 12 : 6).map((artist: any) => (
                              <ArtistCard
                                key={artist.id}
                                artist={artist}
                                onClick={() => {
                                  router.push(`/artist/${artist.id}`);
                                  logSearchEvent("artist", artist.id, artist.name);
                                }}
                              />
                            ))}
                          </div>
                        </section>
                      )}

                      {/* Albums */}
                      {(selectedFilter === "all" || selectedFilter === "albums") && results?.albums && results.albums.length > 0 && (
                        <section>
                          <SectionHeader
                            title="Albums"
                            action={
                              results.albums.length > 6 ? (
                                <ShowMore open={showMoreAlbums} onToggle={() => setShowMoreAlbums(!showMoreAlbums)} count={results.albums.length} label="Show More" />
                              ) : undefined
                            }
                          />
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            {results.albums.slice(0, showMoreAlbums ? 12 : 6).map((album: any) => (
                              <ArtCard
                                key={album.id}
                                cover={getMediaUrl(album.coverUrl) || FALLBACK_ALBUM}
                                alt={album.title || "Album artwork"}
                                title={album.title}
                                subtitle={`${album.artist?.name || "Album"}${album.year ? ` • ${album.year}` : ""}`}
                                caption={album.trackCount ? `${album.trackCount} ${album.trackCount === 1 ? 'Song' : 'Songs'}` : undefined}
                                onClick={() => {
                                  router.push(`/album/${album.id}`);
                                  logSearchEvent("album", album.id, album.title);
                                }}
                              />
                            ))}
                          </div>
                        </section>
                      )}

                      {/* Playlists */}
                      {(selectedFilter === "all" || selectedFilter === "playlists") && results?.playlists && results.playlists.length > 0 && (
                        <section>
                          <SectionHeader title="Playlists" />
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            {results.playlists.slice(0, 6).map((playlist: any) => (
                              <Link key={playlist.id} href={`/playlist/${playlist.id}`} className="group block min-w-0">
                                <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} transition={SPRING}>
                                  <div className="aspect-square w-full rounded-xl overflow-hidden bg-white/[0.06] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)] ring-1 ring-white/10 flex items-center justify-center">
                                    {playlist.coverUrl ? (
                                      <img
                                        src={getMediaUrl(playlist.coverUrl)}
                                        alt={playlist.name || "Playlist cover"}
                                        width={180}
                                        height={180}
                                        loading="lazy"
                                        decoding="async"
                                        className="w-full h-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-[1.04]"
                                      />
                                    ) : (
                                      <ListMusic size={34} className="text-white/30" />
                                    )}
                                  </div>
                                  <p className="mt-2 text-[14px] leading-5 font-medium text-white truncate">{playlist.name}</p>
                                  <p className="text-[13px] leading-4 text-white/55">Playlist</p>
                                </motion.div>
                              </Link>
                            ))}
                          </div>
                        </section>
                      )}

                      {/* No results */}
                      {!results?.tracks?.length &&
                        !results?.artists?.length &&
                        !results?.albums?.length &&
                        !results?.playlists?.length && (
                          <div className="py-24 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-white/[0.07] flex items-center justify-center mx-auto text-white/50 mb-4">
                              <Music size={26} />
                            </div>
                            <h4 className="text-[20px] font-semibold tracking-tight text-white">
                              No Results for &ldquo;{debouncedQuery}&rdquo;
                            </h4>
                            <p className="text-[14px] text-white/50 mt-1">Check the spelling or try a new search.</p>
                          </div>
                        )}
                    </>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </MotionConfig>
  );
}