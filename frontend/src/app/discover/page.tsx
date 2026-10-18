"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search as SearchIcon,
  Music,
  Sparkles,
  Play,
  Pause,
  Clock,
  Heart,
  User,
  Disc,
  ListMusic,
  X,
  History,
  TrendingUp,
  Compass,
  ChevronDown,
  ChevronUp,
  Globe,
  Flame,
  ArrowRight
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track, usePlayerStore } from "@/store/player";
import { useDebounce } from "use-debounce";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import Link from "next/link";
import { cn, getMediaUrl } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams, useRouter } from "next/navigation";
import { useIsMobile } from "@/hooks/useIsMobile";
import { ArtistLinks } from "@/components/shared/ArtistLinks";
import { SEO } from "@/components/shared/SEO";

// Spotify & Apple Music Curated Browse Categories
const DISCOVER_GENRES = [
  {
    name: "Tamil Hits",
    query: "Tamil",
    gradient: "from-[#9E2339] to-[#E11D48]",
    image: "https://images.unsplash.com/photo-1514525253361-bee8718a74a2?q=80&w=300",
  },
  {
    name: "Kollywood",
    query: "Kollywood",
    gradient: "from-[#1E3A8A] to-[#3B82F6]",
    image: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=300",
  },
  {
    name: "Top India",
    query: "India",
    gradient: "from-[#065F46] to-[#10B981]",
    image: "https://images.unsplash.com/photo-1459749411177-04218006d396?q=80&w=300",
  },
  {
    name: "Melody & Love",
    query: "Melody",
    gradient: "from-[#581C87] to-[#A855F7]",
    image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=300",
  },
  {
    name: "Hip-Hop",
    query: "Hip-Hop",
    gradient: "from-[#9A3412] to-[#F97316]",
    image: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?q=80&w=300",
  },
  {
    name: "Devotional",
    query: "Devotional",
    gradient: "from-[#854D0E] to-[#F59E0B]",
    image: "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=300",
  },
  {
    name: "Acoustic & Chill",
    query: "Acoustic",
    gradient: "from-[#0F766E] to-[#14B8A6]",
    image: "https://images.unsplash.com/photo-1487180144351-b8472da7d491?q=80&w=300",
  },
  {
    name: "Party & EDM",
    query: "Party",
    gradient: "from-[#831843] to-[#EC4899]",
    image: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?q=80&w=300",
  },
  {
    name: "Workout Pulse",
    query: "Workout",
    gradient: "from-[#7F1D1D] to-[#EF4444]",
    image: "https://images.unsplash.com/photo-1518611012118-696072aa579a?q=80&w=300",
  },
  {
    name: "Night Drive",
    query: "Drive",
    gradient: "from-[#312E81] to-[#6366F1]",
    image: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=300",
  },
  {
    name: "Rock & Metal",
    query: "Rock",
    gradient: "from-[#1E293B] to-[#475569]",
    image: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?q=80&w=300",
  },
  {
    name: "Lo-Fi & Study",
    query: "Lo-Fi",
    gradient: "from-[#701A75] to-[#D946EF]",
    image: "https://images.unsplash.com/photo-1518495973542-4542c06a5843?q=80&w=300",
  },
];

const DEFAULT_LANGUAGES = [
  "Tamil",
  "Hindi",
  "English",
  "Telugu",
  "Malayalam",
  "Punjabi",
  "Kannada",
  "Bengali",
];

type FilterTab = "all" | "tracks" | "artists" | "albums" | "playlists";

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
  const [regionalCategory, setRegionalCategory] = useState<"all" | "popular" | "new_releases" | "recommended">("all");

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
        params: {
          country: selectedCountry,
          language: selectedLanguage,
          category: regionalCategory,
          limit: 12
        }
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
    staleTime: 1000 * 60 * 10,
  });

  // Live provider search hints autocomplete (250-300ms debounce)
  const { data: suggestions, isLoading: isSuggestionsLoading } = useQuery({
    queryKey: ["search-hints", debouncedQuery],
    queryFn: async ({ signal }) => {
      if (!debouncedQuery || debouncedQuery.trim().length < 2) return [];
      const res = await api.get("search/autocomplete", { params: { q: debouncedQuery.trim() }, signal });
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: !!debouncedQuery && debouncedQuery.trim().length >= 2,
    staleTime: 1000 * 60 * 5,
  });

  // Discovery Home data (genres, top charts, trending, country top songs)
  const { data: homeData, isLoading: isHomeLoading } = useQuery({
    queryKey: ["discover-home"],
    queryFn: async () => {
      const res = await api.get("search/home");
      return res.data;
    },
    enabled: !debouncedQuery,
    staleTime: 1000 * 60 * 5,
  });

  // Spotify-style Top Result calculation
  const topResult = useMemo(() => {
    if (!results) return null;
    const q = debouncedQuery.toLowerCase().trim();

    // Prioritize direct artist match if query is artist name
    if (results.artists?.[0]) {
      const aName = results.artists[0].name.toLowerCase();
      if (aName.includes(q) || q.includes(aName)) {
        return { item: results.artists[0], type: "artist" };
      }
    }

    if (results.tracks?.[0]) {
      return { item: results.tracks[0], type: "track" };
    }

    if (results.artists?.[0]) {
      return { item: results.artists[0], type: "artist" };
    }

    if (results.albums?.[0]) {
      return { item: results.albums[0], type: "album" };
    }

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
    if (!suggestions || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter") {
      if (selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
        e.preventDefault();
        handleSelectSuggestion(suggestions[selectedSuggestionIndex].title);
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

  const userLanguages = homeData?.languages?.length ? homeData.languages : DEFAULT_LANGUAGES;

  return (
    <div className="min-h-screen bg-[#121214] text-foreground relative selection:bg-brand selection:text-white pt-[calc(64px+env(safe-area-inset-top,0px))] md:pt-[calc(72px+env(safe-area-inset-top,0px))] pb-[calc(80px+64px+env(safe-area-inset-bottom,0px))] md:pb-[calc(90px+env(safe-area-inset-bottom,0px))]">
      <SEO
        title={isSearchRoute ? "Search Songs, Artists & Multilingual Lyrics – Zenify" : "Discover Trending Music, New Releases & Top Charts – Zenify"}
        description={isSearchRoute ? "Search millions of tracks, albums, and artists with instant playback and synchronized lyrics in Tamil, Hindi, and English on Zenify." : "Explore trending tracks, newly released albums, and curated multilingual playlists with real-time synchronized lyrics on Zenify."}
        path={isSearchRoute ? "/search" : "/discover"}
      />
      {/* Subtle Apple Music Ambient Glow */}
      <div className="absolute top-0 inset-x-0 h-96 bg-[radial-gradient(ellipse_70%_60%_at_50%_-10%,rgba(225,29,72,0.12),transparent)] pointer-events-none" />

      <div className="max-w-[1340px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10 space-y-6">
        
        {/* ========================================================= */}
        {/* STICKY SEARCH BAR (Sits right below the fixed header)     */}
        {/* ========================================================= */}
        <div className="relative md:sticky md:top-[calc(64px+env(safe-area-inset-top,0px))] z-30 bg-[#121214]/95 backdrop-blur-2xl py-2 md:py-3 border-b border-white/5 space-y-2 md:space-y-3">
          
          {/* Unified Single Page Heading */}
          <div className="flex items-center justify-between gap-4 pt-1 md:pt-0">
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white flex items-center gap-2.5">
              <Compass className="text-brand w-6 h-6 sm:w-7 sm:h-7 shrink-0" />
              <span>{isSearchRoute ? "Search Music & Lyrics" : "Discover"}</span>
            </h1>
          </div>

          {/* Search Input Container - Apple Music iOS Style on Mobile */}
          <div className="flex items-center gap-2.5">
            <div className="relative group rounded-xl md:rounded-2xl transition-all flex-1">
              <div className="absolute inset-y-0 left-3.5 sm:left-5 flex items-center pointer-events-none text-zinc-400 group-focus-within:text-brand transition-colors">
                <SearchIcon size={18} className="md:w-5 md:h-5" />
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
                onBlur={() => {
                  setTimeout(() => setIsInputFocused(false), 200);
                }}
                onKeyDown={handleKeyDown}
                placeholder={isMobile ? "Artists, Songs, Lyrics, and More" : (placeholderText + (cursorBlink ? "|" : ""))}
                className="w-full bg-zinc-800/60 md:bg-zinc-900/90 hover:bg-zinc-800/80 md:hover:bg-zinc-900 border border-white/10 focus:border-brand/50 rounded-xl md:rounded-2xl py-2.5 sm:py-4 pl-10 sm:pl-14 pr-10 md:pr-24 text-sm sm:text-lg text-white placeholder:text-zinc-500 outline-none backdrop-blur-xl shadow-md md:shadow-xl transition-all"
              />

              <div className="absolute inset-y-0 right-2.5 md:right-3 flex items-center gap-1.5 md:gap-2">
                {query && (
                  <button
                    onClick={() => {
                      setQuery("");
                      inputRef.current?.focus();
                    }}
                    className="p-1 md:p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                    title="Clear search"
                  >
                    <X size={15} className="md:w-[18px] md:h-[18px]" />
                  </button>
                )}

                <button
                  onClick={() => setIsSmartSearching(!isSmartSearching)}
                  className={cn(
                    "hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer",
                    isSmartSearching
                      ? "bg-brand/20 border-brand/40 text-brand shadow-[0_0_15px_rgba(225,29,72,0.3)]"
                      : "bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10"
                  )}
                  title="Toggle AI Semantic Search"
                >
                  <Sparkles size={12} className={cn(isSmartSearching && "text-brand animate-pulse")} />
                  <span>{isSmartSearching ? "AI Active" : "AI Search"}</span>
                </button>
              </div>

              {/* Live Suggestions Autocomplete Dropdown */}
              <AnimatePresence>
                {isInputFocused && suggestions && suggestions.length > 0 && (
                  <motion.div
                    id="search-suggestions-listbox"
                    role="listbox"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 right-0 top-full mt-2 bg-zinc-900/95 border border-white/15 rounded-2xl shadow-2xl backdrop-blur-2xl z-50 overflow-hidden divide-y divide-white/5"
                  >
                    {suggestions.slice(0, 6).map((hint: any, idx: number) => (
                      <div
                        key={hint.id || idx}
                        role="option"
                        aria-selected={selectedSuggestionIndex === idx}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectSuggestion(hint.title);
                        }}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:text-white hover:bg-white/10 cursor-pointer transition-colors",
                          selectedSuggestionIndex === idx && "bg-brand/20 text-brand font-bold"
                        )}
                      >
                        <SearchIcon size={14} className="text-zinc-500 shrink-0" />
                        <span className="truncate flex-1">{hint.title}</span>
                        <ArrowRight size={13} className="text-zinc-600 shrink-0" />
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Apple Music Cancel Button for Mobile */}
            {isMobile && (isInputFocused || query) && (
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  setQuery("");
                  setIsInputFocused(false);
                  inputRef.current?.blur();
                }}
                className="text-sm font-semibold text-brand hover:opacity-80 transition-opacity shrink-0 px-1 py-1"
              >
                Cancel
              </button>
            )}
          </div>

          {/* Category Filter Pills (When query is active) */}
          {debouncedQuery && (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              {(["all", "tracks", "artists", "albums", "playlists"] as FilterTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSelectedFilter(tab)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-xs font-semibold capitalize tracking-wide transition-all shrink-0 cursor-pointer",
                    selectedFilter === tab
                      ? "bg-brand text-white shadow-md shadow-brand/20 font-bold"
                      : "bg-zinc-900/90 text-zinc-400 hover:text-white border border-white/5 hover:border-white/15"
                  )}
                >
                  {tab === "all" ? "Top Results" : tab}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* EMPTY STATE: DISCOVER MODE (When Query is Empty)          */}
        {/* ========================================================= */}
        {!debouncedQuery ? (
          <div className="space-y-10 pt-2">
            
            {/* REGIONAL MUSIC DISCOVERY SHELF (Strict Country & Language Filter) */}
            <div className="space-y-4 p-5 rounded-3xl bg-zinc-950/60 border border-white/10 shadow-xl backdrop-blur-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand">
                    <Globe size={15} className="text-brand" />
                    <span>Regional Music Discovery</span>
                    {regionalData?.country && regionalData?.language && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand/10 border border-brand/20 font-mono">
                        {regionalData.country.code} · {regionalData.language.code}
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg sm:text-xl font-black font-oswald uppercase text-white tracking-wide">
                    {regionalData?.country && regionalData?.language
                      ? `Songs from ${regionalData.country.name} in ${regionalData.language.name}`
                      : "Discover by Country & Language"}
                  </h2>
                  <p className="text-xs text-white/50 leading-relaxed font-sans">
                    Only authentic, verified songs originating from the selected country and sung in the chosen language.
                  </p>
                </div>

                <Link
                  href="/settings"
                  className="text-[11px] font-bold text-white/40 hover:text-white uppercase tracking-wider transition-colors px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20"
                >
                  Change In Settings
                </Link>
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
                {(["all", "popular", "new_releases", "recommended"] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setRegionalCategory(cat)}
                    className={cn(
                      "px-3.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0",
                      regionalCategory === cat
                        ? "bg-brand text-white shadow-sm shadow-brand/30"
                        : "bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/5"
                    )}
                  >
                    {cat.replace("_", " ")}
                  </button>
                ))}
              </div>

              {/* Tracks Grid */}
              {isRegionalLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="aspect-square rounded-2xl bg-white/5 animate-pulse" />
                  ))}
                </div>
              ) : regionalData?.items && regionalData.items.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5 pt-2">
                  {regionalData.items.slice(0, 12).map((track: any) => {
                    const isTrackPlaying = currentTrack?.id === track.id && isPlaying;
                    return (
                      <div
                        key={track.id}
                        onClick={() => {
                          setTrack(track);
                          setPlayerMinimized(false);
                        }}
                        className="group p-2.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 hover:border-brand/30 transition-all flex flex-col cursor-pointer active:scale-95 shadow-sm"
                      >
                        <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-zinc-900 border border-white/5 mb-2.5 shadow-md">
                          <img
                            src={getMediaUrl(track.coverUrl) || "/logo.png"}
                            alt={track.title || "Track artwork"}
                            width={160}
                            height={160}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div
                            className={cn(
                              "absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity",
                              isTrackPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                            )}
                          >
                            <div className="w-10 h-10 rounded-full bg-brand text-white flex items-center justify-center shadow-lg transform transition-transform group-hover:scale-110">
                              {isTrackPlaying ? (
                                <Pause size={18} className="fill-current" />
                              ) : (
                                <Play size={18} className="fill-current ml-0.5" />
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4 className={cn(
                            "text-xs font-bold truncate leading-tight transition-colors",
                            isTrackPlaying ? "text-brand" : "text-white group-hover:text-brand"
                          )}>
                            {track.title}
                          </h4>
                          <p className="text-[11px] text-zinc-400 truncate mt-0.5 font-medium">
                            {track.artist?.name || "Unknown Artist"}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/5 text-white/50 border border-white/5">
                              {track.countryCode || selectedCountry}
                            </span>
                            <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-brand/10 text-brand border border-brand/20">
                              {track.languageCode || selectedLanguage}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 px-6 rounded-2xl bg-white/[0.02] border border-dashed border-white/10 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center mx-auto text-brand">
                    <Globe size={20} />
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                    No verified songs available
                  </h3>
                  <p className="text-xs text-white/50 max-w-md mx-auto leading-relaxed">
                    No verified songs are available for this country and language yet. Try selecting a different country or language combination.
                  </p>
                </div>
              )}
            </div>
            
            {/* 1. Recent Searches (Clearable) */}
            {recentSearches.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
                    <History size={14} className="text-brand" />
                    <span>Recent Searches</span>
                  </div>
                  <button
                    onClick={clearRecentSearches}
                    className="text-[11px] font-semibold text-zinc-500 hover:text-brand transition-colors cursor-pointer"
                  >
                    Clear history
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((term) => (
                    <button
                      key={term}
                      onClick={() => setQuery(term)}
                      className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-900/80 hover:bg-zinc-800 border border-white/5 hover:border-brand/30 text-xs text-zinc-300 hover:text-white transition-all cursor-pointer"
                    >
                      <SearchIcon size={12} className="text-zinc-500" />
                      <span>{term}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 2. Browse by Language Chips (User Languages First, Never Alphabetical) */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
                <Globe size={14} className="text-brand" />
                <span>Browse by Language</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {userLanguages.map((lang: string) => (
                  <button
                    key={lang}
                    onClick={() => setQuery(lang)}
                    className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 hover:border-brand/40 text-xs font-bold uppercase tracking-wider text-white hover:text-brand transition-all cursor-pointer active:scale-95 shadow-sm"
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Trending Searches Chips */}
            {homeData?.trendingSearches && homeData.trendingSearches.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
                  <Flame size={14} className="text-brand" />
                  <span>Trending Searches</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {homeData.trendingSearches.map((term: string) => (
                    <button
                      key={term}
                      onClick={() => setQuery(term)}
                      className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-900/60 hover:bg-zinc-800 border border-white/5 hover:border-brand/30 text-xs text-zinc-300 hover:text-white transition-all cursor-pointer"
                    >
                      <TrendingUp size={12} className="text-brand" />
                      <span>{term}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 4. Browse by Genre/Mood 3D Tiles */}
            <div className="space-y-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white">
                  Browse Categories & Moods
                </h2>
                <p className="text-xs text-zinc-400">Explore curated sonic categories and trending sounds</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
                {DISCOVER_GENRES.map((genre) => (
                  <div
                    key={genre.name}
                    onClick={() => handleSelectGenre(genre.query)}
                    className={cn(
                      "relative h-32 sm:h-36 rounded-2xl overflow-hidden p-3.5 cursor-pointer select-none transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl active:scale-95 group",
                      `bg-gradient-to-br ${genre.gradient}`
                    )}
                  >
                    <span className="relative z-10 text-base sm:text-lg font-black text-white leading-tight uppercase tracking-tight drop-shadow-md">
                      {genre.name}
                    </span>

                    <div className="absolute -right-3 -bottom-3 w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden shadow-2xl transform rotate-[22deg] group-hover:rotate-[15deg] group-hover:scale-105 transition-transform duration-300 border border-white/20">
                      <img
                        src={genre.image}
                        alt={genre.name}
                        width={80}
                        height={80}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 5. Top Songs in [User Country] (Catalog-first) */}
            {homeData?.trendingTracks && homeData.trendingTracks.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                      <TrendingUp size={20} className="text-brand" />
                      <span>Top Songs in {homeData?.countryName || "Your Country"}</span>
                    </h2>
                    <p className="text-xs text-zinc-400">Official real-time catalog charts for your region</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {homeData.trendingTracks.slice(0, 9).map((track: any) => {
                    const isTrackPlaying = currentTrack?.id === track.id && isPlaying;
                    const mins = Math.floor((track.duration || 0) / 60);
                    const secs = (track.duration || 0) % 60;
                    const durationStr = `${mins}:${secs.toString().padStart(2, "0")}`;
                    const isLiked = likedTrackIds?.includes(track.id);

                    return (
                      <div
                        key={track.id}
                        onClick={() => {
                          setTrack(track);
                          setPlayerMinimized(false);
                          logSearchEvent("track", track.id, track.title);
                        }}
                        className="group flex items-center gap-3 p-2.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-white/5 hover:border-white/10 transition-all cursor-pointer"
                      >
                        <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-zinc-800 shrink-0 shadow-md">
                          <img
                            src={getMediaUrl(track.coverUrl) || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=120"}
                            alt={track.title || "Track artwork"}
                            width={48}
                            height={48}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <div
                            className={cn(
                              "absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity",
                              isTrackPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                            )}
                          >
                            {isTrackPlaying ? (
                              <Pause size={18} className="text-brand fill-current" />
                            ) : (
                              <Play size={18} className="text-white fill-current ml-0.5" />
                            )}
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "text-sm font-bold truncate leading-tight",
                              isTrackPlaying ? "text-brand" : "text-white group-hover:text-white"
                            )}
                          >
                            {track.title}
                          </p>
                          <p className="text-xs text-zinc-400 truncate mt-0.5">
                            {track.artist?.name || "Unknown Artist"}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => toggleLike(track.id, e)}
                            className={cn(
                              "p-1.5 rounded-full transition-colors cursor-pointer",
                              isLiked ? "text-brand" : "text-zinc-500 hover:text-white opacity-0 group-hover:opacity-100"
                            )}
                          >
                            <Heart size={14} className={cn(isLiked && "fill-current")} />
                          </button>
                          <span className="text-[11px] text-zinc-500 font-medium tabular-nums mr-1">
                            {durationStr}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 6. Trending Albums */}
            {homeData?.trendingAlbums && homeData.trendingAlbums.length > 0 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                    <Disc size={20} className="text-brand" />
                    <span>Trending Albums</span>
                  </h2>
                  <p className="text-xs text-zinc-400">Popular releases and top streaming projects</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {homeData.trendingAlbums.slice(0, 6).map((album: any) => (
                    <div
                      key={album.id}
                      onClick={() => {
                        setQuery(album.title);
                        logSearchEvent("album", album.id, album.title);
                      }}
                      className="group p-3 rounded-2xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-white/5 hover:border-brand/30 transition-all flex flex-col cursor-pointer"
                    >
                      <div className="w-full aspect-square rounded-xl overflow-hidden bg-zinc-800 shadow-xl mb-3 group-hover:scale-105 transition-transform border border-white/10">
                        <img
                          src={getMediaUrl(album.coverUrl) || "https://images.unsplash.com/photo-1514525253361-bee8718a74a2?w=300"}
                          alt={album.title || "Album artwork"}
                          width={160}
                          height={160}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <span className="text-sm font-bold text-white group-hover:text-brand transition-colors truncate">
                        {album.title}
                      </span>
                      <span className="text-xs text-zinc-500 truncate mt-0.5">
                        {album.artist?.name || "Album"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 7. Popular Artists in Your Languages */}
            {homeData?.artists && homeData.artists.length > 0 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                    <User size={20} className="text-brand" />
                    <span>Popular Artists</span>
                  </h2>
                  <p className="text-xs text-zinc-400">Discover top performing voices and creators in your languages</p>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
                  {homeData.artists.slice(0, 6).map((artist: any) => (
                    <div
                      key={artist.id}
                      onClick={() => {
                        setQuery(artist.name);
                        logSearchEvent("artist", artist.id, artist.name);
                      }}
                      className="group flex flex-col items-center text-center p-3 rounded-2xl bg-zinc-900/40 hover:bg-zinc-800/60 border border-white/5 hover:border-white/10 transition-all cursor-pointer"
                    >
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-zinc-800 shadow-xl mb-3 group-hover:scale-105 transition-transform border-2 border-white/10 group-hover:border-brand/40">
                        <img
                          src={getMediaUrl(artist.imageUrl) || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200"}
                          alt={artist.name || "Artist portrait"}
                          width={96}
                          height={96}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <span className="text-xs sm:text-sm font-bold text-white group-hover:text-brand transition-colors truncate w-full">
                        {artist.name}
                      </span>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mt-0.5">
                        Artist
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ========================================================= */
          /* LIVE SEARCH RESULTS MODE (When Query is Typed)            */
          /* ========================================================= */
          <div className="space-y-10">
            {isSearchLoading ? (
              <div className="py-24 text-center space-y-3">
                <div className="w-8 h-8 mx-auto border-2 border-brand border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">
                  Searching external catalog...
                </p>
              </div>
            ) : (
              <>
                {/* 1. TOP RESULT HERO CARD */}
                {(selectedFilter === "all" || selectedFilter === "tracks") && topResult && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-5 space-y-3">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                        Top Result
                      </h3>
                      <div
                        onClick={() => {
                          if (topResult.type === "track") {
                            setTrack(topResult.item);
                            setPlayerMinimized(false);
                            logSearchEvent("track", topResult.item.id, topResult.item.title);
                          } else if (topResult.type === "artist") {
                            router.push(`/artist/${topResult.item.id}`);
                          } else if (topResult.type === "album") {
                            router.push(`/album/${topResult.item.id}`);
                          }
                        }}
                        className="group relative p-6 rounded-3xl bg-zinc-900/90 hover:bg-zinc-800/90 border border-white/10 hover:border-brand/40 transition-all duration-300 cursor-pointer shadow-2xl"
                      >
                        <div
                          className={cn(
                            "overflow-hidden shadow-2xl mb-5 border border-white/10",
                            topResult.type === "artist" ? "w-24 h-24 rounded-full" : "w-24 h-24 rounded-2xl"
                          )}
                        >
                          <img
                            src={getMediaUrl(topResult.item.coverUrl || topResult.item.imageUrl) || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=200"}
                            alt={topResult.item.title || topResult.item.name || "Top search result"}
                            width={96}
                            height={96}
                            fetchPriority="high"
                            decoding="async"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        </div>

                        <h4 className="text-2xl sm:text-3xl font-black text-white group-hover:text-brand transition-colors truncate">
                          {topResult.item.title || topResult.item.name}
                        </h4>

                        <div className="flex items-center gap-2 mt-2">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/10 text-zinc-300 border border-white/10">
                            {topResult.type}
                          </span>
                          {topResult.item.artist?.name && (
                            <span className="text-xs text-zinc-400 truncate">
                              by <ArtistLinks track={topResult.item} className="inline" linkClassName="text-zinc-300 hover:text-white" />
                            </span>
                          )}
                        </div>

                        {/* Floating Play Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (topResult.type === "track") {
                              setTrack(topResult.item);
                              setPlayerMinimized(false);
                              logSearchEvent("track", topResult.item.id, topResult.item.title);
                            } else if (topResult.type === "artist") {
                              router.push(`/artist/${topResult.item.id}`);
                            } else if (topResult.type === "album") {
                              router.push(`/album/${topResult.item.id}`);
                            }
                          }}
                          className="absolute bottom-6 right-6 w-12 h-12 rounded-full bg-brand hover:bg-brand/90 text-white flex items-center justify-center shadow-xl shadow-brand/30 hover:scale-110 active:scale-95 transition-all cursor-pointer"
                        >
                          <Play size={20} className="fill-current ml-0.5" />
                        </button>
                      </div>
                    </div>

                    {/* Top Matching Songs List */}
                    {results?.tracks && results.tracks.length > 0 && (
                      <div className="lg:col-span-7 space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                            Songs
                          </h3>
                          {results.tracks.length > 5 && (
                            <button
                              onClick={() => setShowMoreTracks(!showMoreTracks)}
                              className="text-xs font-bold text-zinc-400 hover:text-brand transition-colors cursor-pointer"
                            >
                              {showMoreTracks ? "Show less" : `Show all (${results.tracks.length})`}
                            </button>
                          )}
                        </div>

                        <div className="space-y-1">
                          {results.tracks
                            .slice(0, showMoreTracks ? 24 : 5)
                            .map((track: any, i: number) => {
                              const isTrackPlaying = currentTrack?.id === track.id && isPlaying;
                              const mins = Math.floor((track.duration || 0) / 60);
                              const secs = (track.duration || 0) % 60;
                              const durationStr = `${mins}:${secs.toString().padStart(2, "0")}`;
                              const isLiked = likedTrackIds?.includes(track.id);

                              return (
                                <div
                                  key={track.id}
                                  onClick={() => {
                                    setTrack(track);
                                    setPlayerMinimized(false);
                                    logSearchEvent("track", track.id, track.title);
                                  }}
                                  className="group flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-900/80 border border-transparent hover:border-white/5 transition-all cursor-pointer"
                                >
                                  <span className="w-5 text-center text-xs font-bold text-zinc-500 tabular-nums">
                                    {i + 1}
                                  </span>

                                  <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                                    <img
                                      src={getMediaUrl(track.coverUrl) || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100"}
                                      alt={track.title || "Track artwork"}
                                      width={40}
                                      height={40}
                                      loading="lazy"
                                      decoding="async"
                                      className="w-full h-full object-cover"
                                    />
                                    <div
                                      className={cn(
                                        "absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity",
                                        isTrackPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                      )}
                                    >
                                      {isTrackPlaying ? (
                                        <Pause size={14} className="text-brand fill-current" />
                                      ) : (
                                        <Play size={14} className="text-white fill-current ml-0.5" />
                                      )}
                                    </div>
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <p
                                      className={cn(
                                        "text-sm font-bold truncate leading-tight",
                                        isTrackPlaying ? "text-brand" : "text-white group-hover:text-white"
                                      )}
                                    >
                                      {track.title}
                                    </p>
                                    <p className="text-xs text-zinc-400 truncate mt-0.5">
                                      {track.artist?.name || "Unknown Artist"}
                                    </p>
                                  </div>

                                  <button
                                    onClick={(e) => toggleLike(track.id, e)}
                                    className={cn(
                                      "p-1.5 rounded-full transition-colors cursor-pointer",
                                      isLiked ? "text-brand" : "text-zinc-500 hover:text-white opacity-0 group-hover:opacity-100"
                                    )}
                                  >
                                    <Heart size={14} className={cn(isLiked && "fill-current")} />
                                  </button>

                                  <span className="text-xs text-zinc-500 font-medium tabular-nums w-10 text-right">
                                    {durationStr}
                                  </span>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Collapsed "Other versions" Group (Covers, remixes, acoustic) */}
                {results?.otherVersions && results.otherVersions.length > 0 && (
                  <div className="rounded-2xl border border-white/10 bg-zinc-900/40 overflow-hidden">
                    <button
                      onClick={() => setShowOtherVersions(!showOtherVersions)}
                      className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">Other versions & remixes</span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/10 text-zinc-400">
                          {results.otherVersions.length}
                        </span>
                      </div>
                      {showOtherVersions ? <ChevronUp size={18} className="text-zinc-400" /> : <ChevronDown size={18} className="text-zinc-400" />}
                    </button>

                    <AnimatePresence>
                      {showOtherVersions && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="divide-y divide-white/5 border-t border-white/5 px-2 pb-2"
                        >
                          {results.otherVersions.map((track: any) => {
                            const isTrackPlaying = currentTrack?.id === track.id && isPlaying;
                            return (
                              <div
                                key={track.id}
                                onClick={() => {
                                  setTrack(track);
                                  setPlayerMinimized(false);
                                  logSearchEvent("track", track.id, track.title);
                                }}
                                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 cursor-pointer transition-colors"
                              >
                                <div className="w-9 h-9 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                                  <img
                                    src={getMediaUrl(track.coverUrl)}
                                    alt={track.title || "Track artwork"}
                                    width={36}
                                    height={36}
                                    loading="lazy"
                                    decoding="async"
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold text-white truncate">{track.title}</p>
                                  <p className="text-[11px] text-zinc-400 truncate">{track.artist?.name}</p>
                                </div>
                                <Play size={14} className="text-brand shrink-0" />
                              </div>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* 2. ARTISTS SECTION (Circular Images) */}
                {(selectedFilter === "all" || selectedFilter === "artists") && results?.artists && results.artists.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                        Artists
                      </h3>
                      {results.artists.length > 6 && (
                        <button
                          onClick={() => setShowMoreArtists(!showMoreArtists)}
                          className="text-xs font-bold text-zinc-400 hover:text-brand transition-colors cursor-pointer"
                        >
                          {showMoreArtists ? "Show less" : `Show more (${results.artists.length})`}
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {results.artists
                        .slice(0, showMoreArtists ? 12 : 6)
                        .map((artist: any) => (
                          <div
                            key={artist.id}
                            onClick={() => {
                              router.push(`/artist/${artist.id}`);
                              logSearchEvent("artist", artist.id, artist.name);
                            }}
                            className="group flex flex-col items-center text-center p-4 rounded-2xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-white/5 hover:border-brand/30 transition-all cursor-pointer"
                          >
                            <div className="w-24 h-24 rounded-full overflow-hidden bg-zinc-800 shadow-xl mb-3 group-hover:scale-105 transition-transform border border-white/10 group-hover:border-brand/40">
                              <img
                                src={getMediaUrl(artist.imageUrl) || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200"}
                                alt={artist.name || "Artist portrait"}
                                width={96}
                                height={96}
                                loading="lazy"
                                decoding="async"
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <span className="text-sm font-bold text-white group-hover:text-brand transition-colors truncate w-full">
                              {artist.name}
                            </span>
                            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mt-0.5">
                              Artist
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* 3. ALBUMS SECTION */}
                {(selectedFilter === "all" || selectedFilter === "albums") && results?.albums && results.albums.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                        Albums
                      </h3>
                      {results.albums.length > 6 && (
                        <button
                          onClick={() => setShowMoreAlbums(!showMoreAlbums)}
                          className="text-xs font-bold text-zinc-400 hover:text-brand transition-colors cursor-pointer"
                        >
                          {showMoreAlbums ? "Show less" : `Show more (${results.albums.length})`}
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {results.albums
                        .slice(0, showMoreAlbums ? 12 : 6)
                        .map((album: any) => (
                          <div
                            key={album.id}
                            onClick={() => {
                              router.push(`/album/${album.id}`);
                              logSearchEvent("album", album.id, album.title);
                            }}
                            className="group p-3 rounded-2xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-white/5 hover:border-brand/30 transition-all flex flex-col cursor-pointer"
                          >
                            <div className="w-full aspect-square rounded-xl overflow-hidden bg-zinc-800 shadow-xl mb-3 group-hover:scale-105 transition-transform border border-white/10">
                              <img
                                src={getMediaUrl(album.coverUrl) || "https://images.unsplash.com/photo-1514525253361-bee8718a74a2?w=300"}
                                alt={album.title || "Album artwork"}
                                width={160}
                                height={160}
                                loading="lazy"
                                decoding="async"
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <span className="text-sm font-bold text-white group-hover:text-brand transition-colors truncate">
                              {album.title}
                            </span>
                            <span className="text-xs text-zinc-500 truncate mt-0.5">
                              {album.artist?.name || "Album"}{album.year ? ` • ${album.year}` : ""}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* 4. PLAYLISTS SECTION */}
                {(selectedFilter === "all" || selectedFilter === "playlists") && results?.playlists && results.playlists.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                      Playlists
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {results.playlists.slice(0, 6).map((playlist: any) => (
                        <Link
                          key={playlist.id}
                          href={`/playlist/${playlist.id}`}
                          className="group p-3 rounded-2xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-white/5 hover:border-brand/30 transition-all flex flex-col"
                        >
                          <div className="w-full aspect-square rounded-xl overflow-hidden bg-zinc-800 shadow-xl mb-3 group-hover:scale-105 transition-transform border border-white/10 flex items-center justify-center">
                            {playlist.coverUrl ? (
                              <img
                                src={getMediaUrl(playlist.coverUrl)}
                                alt={playlist.name || "Playlist cover"}
                                width={160}
                                height={160}
                                loading="lazy"
                                decoding="async"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ListMusic size={32} className="text-zinc-600" />
                            )}
                          </div>
                          <span className="text-sm font-bold text-white group-hover:text-brand transition-colors truncate">
                            {playlist.name}
                          </span>
                          <span className="text-xs text-zinc-500 truncate mt-0.5">
                            Playlist
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* No Results Fallback */}
                {!results?.tracks?.length &&
                  !results?.artists?.length &&
                  !results?.albums?.length &&
                  !results?.playlists?.length && (
                    <div className="py-20 text-center space-y-2">
                      <Music size={36} className="mx-auto text-zinc-600" />
                      <h4 className="text-lg font-bold text-white">
                        No results found for &ldquo;{debouncedQuery}&rdquo;
                      </h4>
                      <p className="text-xs text-zinc-500">
                        Please check the spelling or try searching for another artist, track, or album.
                      </p>
                    </div>
                  )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
