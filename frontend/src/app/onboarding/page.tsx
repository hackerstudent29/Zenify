"use client";

import React, {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  AnimatePresence,
  LazyMotion,
  MotionConfig,
  domAnimation,
  m,
} from "framer-motion";
import {
  ArrowRight,
  Cake,
  CaretDown,
  CaretLeft,
  Check,
  Globe,
  MagnifyingGlass,
  Minus,
  MicrophoneStage,
  MusicNotes,
  Plus,
  SpinnerGap,
  Translate,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { SEO } from "@/components/shared/SEO";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";

/* ───────────────────────── types ───────────────────────── */

interface LanguageItem { code: string; name: string; nativeName: string }
interface CountryItem { code: string; name: string }
interface ArtistItem { id: string; name: string; image: string; source?: string }
type Step = 1 | 2 | 3 | 4;

/* ───────────────────────── constants ───────────────────────── */

const STORAGE_KEY = "zenify_onboarding_draft";
const LIMITS = { languages: [1, 5], genres: [4, 5], artists: [3, 10], age: [13, 100] } as const;

// Spring presets: snappy for presses, soft for page motion, pop for selections
const SNAP = { type: "spring", stiffness: 500, damping: 30 } as const;
const SOFT = { type: "spring", stiffness: 260, damping: 28 } as const;
const POP = { type: "spring", stiffness: 520, damping: 22 } as const;

const FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", var(--font-inter), "Segoe UI", Roboto, system-ui, sans-serif';

const STEPS = [
  { label: "Languages", icon: Translate, title: "What do you listen to?", sub: "Pick the languages you want to hear first." },
  { label: "Genres", icon: MusicNotes, title: "Choose your genres", sub: "Pick the styles that sound like you." },
  { label: "Artists", icon: MicrophoneStage, title: "Who do you love?", sub: "Tap the artists you listen to the most." },
  { label: "Age", icon: Cake, title: "How old are you?", sub: "We use this to tune recommendations." },
] as const;

const COUNTRY_LANG: Record<string, string> = {
  CN: "zh", TW: "zh", HK: "yue", JP: "ja", KR: "ko", FR: "fr", DE: "de", ES: "es",
  US: "en", GB: "en", CA: "en", AU: "en", IN: "ta", IT: "it", RU: "ru", BR: "pt",
  MX: "es", AE: "ar", SA: "ar",
};

const avatar = (name: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1c1c1e&color=e11d48`;
const artistKey = (a: { id?: string; name: string }) => (a.id || a.name).toLowerCase();
const toArtist = (a: any): ArtistItem => ({
  id: a.id || a.name,
  name: a.name,
  image: a.image || avatar(a.name),
  source: a.source || "Artist",
});

/* ───────────────────────── small UI pieces ───────────────────────── */

function SearchField({
  value, onChange, placeholder, label, loading, id, name,
}: { value: string; onChange: (v: string) => void; placeholder: string; label: string; loading?: boolean; id?: string; name?: string }) {
  const fieldId = id || `search-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const fieldName = name || fieldId;
  return (
    <label htmlFor={fieldId} className="flex h-11 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.07] px-3.5 transition-colors duration-150 focus-within:border-white/25 focus-within:bg-white/10">
      <MagnifyingGlass size={18} weight="bold" className="shrink-0 text-white/50" />
      <input
        id={fieldId}
        name={fieldName}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent text-[16px] text-white outline-none placeholder:text-white/40 sm:text-[15px]"
      />
      {loading ? (
        <SpinnerGap size={18} className="shrink-0 animate-spin text-white/50" />
      ) : value ? (
        <button type="button" aria-label="Clear search" onClick={() => onChange("")} className="shrink-0 rounded-full bg-white/20 p-0.5 text-black/70">
          <X size={12} weight="bold" />
        </button>
      ) : null}
    </label>
  );
}

const Chip = memo(function Chip({
  id, name, sub, selected, onToggle,
}: { id: string; name: string; sub?: string; selected: boolean; onToggle: (id: string) => void }) {
  return (
    <m.button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={() => onToggle(id)}
      whileTap={{ scale: 0.94 }}
      transition={SNAP}
      className={cn(
        "flex min-h-[40px] touch-manipulation items-center gap-1.5 rounded-full border px-4 text-[15px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/60",
        selected
          ? "border-brand bg-brand text-white"
          : "border-white/[0.08] bg-white/[0.07] text-white/90 [@media(hover:hover)]:hover:bg-white/[0.12]"
      )}
    >
      <AnimatePresence initial={false}>
        {selected && (
          <m.span
            key="check"
            initial={{ width: 0, opacity: 0, scale: 0.4 }}
            animate={{ width: 16, opacity: 1, scale: 1 }}
            exit={{ width: 0, opacity: 0, scale: 0.4 }}
            transition={POP}
            className="flex shrink-0 items-center overflow-hidden"
          >
            <Check size={16} weight="bold" />
          </m.span>
        )}
      </AnimatePresence>
      <span>{name}</span>
      {sub && sub !== name && <span className={cn("text-[13px]", selected ? "text-white/80" : "text-white/45")}>{sub}</span>}
    </m.button>
  );
});

const ArtistBubble = memo(function ArtistBubble({
  artist, selected, onToggle,
}: { artist: ArtistItem; selected: boolean; onToggle: (a: ArtistItem) => void }) {
  return (
    <m.button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={() => onToggle(artist)}
      whileTap={{ scale: 0.95 }}
      transition={SNAP}
      className="flex touch-manipulation flex-col items-center gap-1.5 rounded-2xl p-1 outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
    >
      <span className="relative block aspect-square w-full">
        <img
          src={artist.image}
          alt=""
          width={120}
          height={120}
          loading="lazy"
          decoding="async"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = avatar(artist.name); }}
          className="h-full w-full rounded-full bg-white/10 object-cover"
        />
        <AnimatePresence initial={false}>
          {selected && (
            <m.span
              key="sel"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={POP}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-brand/35 ring-[3px] ring-brand"
            >
              <Check size={28} weight="bold" className="text-white" />
            </m.span>
          )}
        </AnimatePresence>
      </span>
      <span className="line-clamp-2 w-full text-center text-[13px] font-medium leading-tight text-white/90">{artist.name}</span>
    </m.button>
  );
});

/* ───────────────────────── page ───────────────────────── */

export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, updateUser } = useAuthStore();

  const rootRef = useRef<HTMLDivElement>(null);
  const dirRef = useRef(1);

  const [step, setStep] = useState<Step>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // metadata
  const [languagesList, setLanguagesList] = useState<LanguageItem[]>([]);
  const [countriesList, setCountriesList] = useState<CountryItem[]>([]);
  const [genresList, setGenresList] = useState<string[]>([]);
  const [isMetaLoading, setIsMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState(false);

  // form
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [selectedCountry, setSelectedCountry] = useState("India");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedArtists, setSelectedArtists] = useState<ArtistItem[]>([]);
  const [age, setAge] = useState("21");

  // pickers
  const [langQuery, setLangQuery] = useState("");
  const [genreQuery, setGenreQuery] = useState("");
  const [artistQuery, setArtistQuery] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const countryRef = useRef<HTMLDivElement>(null);

  const [suggested, setSuggested] = useState<ArtistItem[]>([]);
  const [isSuggestedLoading, setIsSuggestedLoading] = useState(false);
  const suggestedKey = useRef("");
  const [searchResults, setSearchResults] = useState<ArtistItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // latest selections for stable toggle handlers (keeps memoised chips from re-rendering)
  const latest = useRef({ selectedLanguages, selectedGenres, selectedArtists });
  latest.current = { selectedLanguages, selectedGenres, selectedArtists };

  /* ── mobile keyboard height: written to a CSS variable, no React re-render ── */
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    let raf = 0;
    const apply = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => rootRef.current?.style.setProperty("--vvh", `${vv.height}px`));
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
    };
  }, []);

  /* ── restore draft ── */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const d = JSON.parse(saved);
      if (d.selectedLanguages) setSelectedLanguages(d.selectedLanguages);
      if (d.selectedCountry) setSelectedCountry(d.selectedCountry);
      if (d.selectedGenres) setSelectedGenres(d.selectedGenres);
      if (d.selectedArtists) setSelectedArtists(d.selectedArtists);
      if (d.age) setAge(d.age);
      if (d.step) setStep(d.step);
    } catch (e) {
      console.warn("Failed to restore draft:", e);
    }
  }, []);

  /* ── persist draft (debounced so typing never blocks on storage) ── */
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ selectedLanguages, selectedCountry, selectedGenres, selectedArtists, age, step })
        );
      } catch (e) {
        console.warn("Failed to save draft:", e);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [selectedLanguages, selectedCountry, selectedGenres, selectedArtists, age, step]);

  /* ── metadata ── */
  const loadMeta = useCallback(async () => {
    setIsMetaLoading(true);
    setMetaError(false);
    try {
      const res = await api.get("/preferences/metadata");
      setLanguagesList(res.data?.languages || []);
      setCountriesList(res.data?.countries || []);
      setGenresList(res.data?.genres || []);
    } catch (err) {
      console.error("Failed to load preferences metadata:", err);
      setMetaError(true);
    } finally {
      setIsMetaLoading(false);
    }
  }, []);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  /* ── suggested artists (once per language + genre combination) ── */
  useEffect(() => {
    if (step !== 3) return;
    const key = `${selectedLanguages.join(",")}|${selectedGenres.join(",")}`;
    if (suggestedKey.current === key) return;
    suggestedKey.current = key;
    let alive = true;
    setIsSuggestedLoading(true);
    api
      .get("/preferences/artists/suggested", {
        params: { languages: selectedLanguages.join(","), genres: selectedGenres.join(",") },
      })
      .then((res) => alive && setSuggested((res.data || []).map(toArtist)))
      .catch((err) => console.warn("Failed to load suggested artists:", err))
      .finally(() => alive && setIsSuggestedLoading(false));
    return () => { alive = false; };
  }, [step, selectedLanguages, selectedGenres]);

  /* ── live artist search: 250ms debounce, cancels older requests ── */
  useEffect(() => {
    const q = artistQuery.trim();
    if (!q) { setSearchResults([]); setIsSearching(false); return; }
    const ctl = new AbortController();
    setIsSearching(true);
    const id = setTimeout(async () => {
      try {
        const res = await api.get("/preferences/artists/search", { params: { q, limit: 12 }, signal: ctl.signal });
        setSearchResults((res.data || []).map(toArtist));
      } catch (e: any) {
        if (!ctl.signal.aborted) setSearchResults([]);
      } finally {
        if (!ctl.signal.aborted) setIsSearching(false);
      }
    }, 250);
    return () => { clearTimeout(id); ctl.abort(); };
  }, [artistQuery]);

  /* ── close country popover on outside tap or Escape ── */
  useEffect(() => {
    if (!countryOpen) return;
    const down = (e: PointerEvent) => {
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) setCountryOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setCountryOpen(false);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [countryOpen]);

  useEffect(() => () => clearTimeout(hintTimer.current), []);

  /* ── handlers ── */
  const flashHint = useCallback((msg: string) => {
    setHint(msg);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 1800);
  }, []);

  const toggleLanguage = useCallback((id: string) => {
    const cur = latest.current.selectedLanguages;
    if (cur.includes(id)) return setSelectedLanguages(cur.filter((x) => x !== id));
    if (cur.length >= LIMITS.languages[1]) return flashHint(`Up to ${LIMITS.languages[1]} languages`);
    setSelectedLanguages([...cur, id]);
  }, [flashHint]);

  const toggleGenre = useCallback((id: string) => {
    const cur = latest.current.selectedGenres;
    if (cur.includes(id)) return setSelectedGenres(cur.filter((x) => x !== id));
    if (cur.length >= LIMITS.genres[1]) return flashHint(`Up to ${LIMITS.genres[1]} genres`);
    setSelectedGenres([...cur, id]);
  }, [flashHint]);

  const toggleArtist = useCallback((a: ArtistItem) => {
    const cur = latest.current.selectedArtists;
    const k = artistKey(a);
    if (cur.some((x) => artistKey(x) === k)) return setSelectedArtists(cur.filter((x) => artistKey(x) !== k));
    if (cur.length >= LIMITS.artists[1]) return flashHint(`Up to ${LIMITS.artists[1]} artists`);
    setSelectedArtists([...cur, a]);
  }, [flashHint]);

  const go = useCallback((next: Step) => {
    dirRef.current = next > step ? 1 : -1;
    setErrorMessage(null);
    setStep(next);
  }, [step]);

  const ageNum = parseInt(age, 10);
  const ageValid = !isNaN(ageNum) && ageNum >= LIMITS.age[0] && ageNum <= LIMITS.age[1];
  const bumpAge = (d: number) =>
    setAge(String(Math.min(LIMITS.age[1], Math.max(LIMITS.age[0], (isNaN(ageNum) ? 21 : ageNum) + d))));

  const remaining =
    step === 1 ? LIMITS.languages[0] - selectedLanguages.length
    : step === 2 ? LIMITS.genres[0] - selectedGenres.length
    : step === 3 ? LIMITS.artists[0] - selectedArtists.length
    : 0;
  const canContinue = step === 4 ? ageValid : remaining <= 0;
  const noun = step === 1 ? "language" : step === 2 ? "genre" : "artist";

  const handleFinalSubmit = async () => {
    if (!ageValid) return setErrorMessage("Enter an age between 13 and 100.");
    if (selectedLanguages.length < LIMITS.languages[0]) { setErrorMessage("Pick at least 1 language."); return go(1); }
    if (selectedGenres.length < LIMITS.genres[0]) { setErrorMessage("Pick at least 4 genres."); return go(2); }
    if (selectedArtists.length < LIMITS.artists[0]) { setErrorMessage("Pick at least 3 artists."); return go(3); }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const payload = {
        languages: selectedLanguages,
        preferredGenres: selectedGenres,
        favoriteArtists: selectedArtists.map((a) => ({ id: a.id, name: a.name, image: a.image, source: a.source || "onboarding" })),
        country: selectedCountry,
        age: ageNum,
      };
      try {
        await api.put("/preferences", payload);
      } catch {
        await api.post("/preferences", payload); // fallback if PUT is blocked by CORS preflight
      }

      updateUser({
        country: selectedCountry,
        age: ageNum,
        preferences: {
          ...(user?.preferences || {}),
          onboardingCompleted: true,
          onboardingCompletedAt: new Date().toISOString(),
          languages: selectedLanguages,
          preferredGenres: selectedGenres,
          favoriteArtists: payload.favoriteArtists,
        },
      });

      localStorage.removeItem(STORAGE_KEY);
      const matched = countriesList.find((c) => c.name.toLowerCase() === selectedCountry.toLowerCase());
      const cCode = matched ? matched.code : selectedCountry;
      localStorage.setItem("zenify_selected_country", cCode);
      if (selectedLanguages[0]) localStorage.setItem("zenify_selected_language", selectedLanguages[0]);

      [
        "home-featured", "home-made-for-you", "home-top-country", "home-new-releases-lang",
        "home-trending-now", "home-popular-artists-lang", "home-genre-playlists", "home-recently-played",
      ].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      window.dispatchEvent(new CustomEvent("zenify:preferences-updated"));
      window.dispatchEvent(new CustomEvent("zenify:country-language-changed", {
        detail: { countryCode: cCode, languageCode: selectedLanguages[0] },
      }));

      router.push("/");
    } catch (err: any) {
      console.error("Failed to complete onboarding:", err);
      setErrorMessage(err.response?.data?.message || "Couldn't save your preferences. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ── derived data ── */
  const langSet = useMemo(() => new Set(selectedLanguages), [selectedLanguages]);
  const genreSet = useMemo(() => new Set(selectedGenres), [selectedGenres]);
  const artistSet = useMemo(() => new Set(selectedArtists.map(artistKey)), [selectedArtists]);

  const dLang = useDeferredValue(langQuery);
  const dGenre = useDeferredValue(genreQuery);

  const visibleLanguages = useMemo(() => {
    const q = dLang.trim().toLowerCase();
    return q
      ? languagesList.filter((l) => l.name.toLowerCase().includes(q) || l.nativeName?.toLowerCase().includes(q))
      : languagesList;
  }, [languagesList, dLang]);

  const visibleGenres = useMemo(() => {
    const q = dGenre.trim().toLowerCase();
    return q ? genresList.filter((g) => g.toLowerCase().includes(q)) : genresList;
  }, [genresList, dGenre]);

  const filteredCountries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    return q ? countriesList.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)) : countriesList;
  }, [countriesList, countrySearch]);

  const artistGrid = artistQuery.trim() ? searchResults : suggested;
  const artistLoading = artistQuery.trim() ? isSearching : isSuggestedLoading;

  const meta = STEPS[step - 1];
  const StepIcon = meta.icon;
  const counter =
    step === 1 ? `${selectedLanguages.length}/${LIMITS.languages[1]}`
    : step === 2 ? `${selectedGenres.length}/${LIMITS.genres[1]}`
    : step === 3 ? `${selectedArtists.length}/${LIMITS.artists[1]}`
    : "";

  const variants = {
    enter: (d: number) => ({ opacity: 0, x: d * 28 }),
    center: { opacity: 1, x: 0, transition: SOFT },
    exit: (d: number) => ({ opacity: 0, x: d * -28, transition: { duration: 0.12, ease: "easeIn" as const } }),
  };

  /* ───────────────────────── render ───────────────────────── */
  return (
    <LazyMotion features={domAnimation} strict={false}>
      <MotionConfig reducedMotion="user">
        <div
          ref={rootRef}
          className="isolate flex select-none flex-col overflow-hidden bg-[#121214] text-white"
          style={{ height: "var(--vvh, 100dvh)", fontFamily: FONT, WebkitFontSmoothing: "antialiased" }}
        >
          <SEO title="Welcome – Zenify" noindex={true} path="/onboarding" />

          {/* ── header: brand mark and spring step dots ── */}
          <header className="mx-auto flex w-full max-w-2xl shrink-0 items-center justify-between px-4 pb-2 pt-[max(14px,env(safe-area-inset-top))] sm:px-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand/15 text-[15px] font-bold text-brand">Z</div>
              <span className="text-[15px] font-semibold tracking-tight">Set up Zenify</span>
            </div>
            <div className="flex items-center gap-3" aria-label={`Step ${step} of 4`}>
              <span className="text-[13px] font-medium text-white/50">{meta.label}</span>
              <div className="flex items-center gap-1.5">
                {STEPS.map((_, i) => (
                  <m.span
                    key={i}
                    animate={{ width: i + 1 === step ? 22 : 7 }}
                    transition={SOFT}
                    className={cn(
                      "h-[7px] rounded-full transition-colors duration-200",
                      i + 1 === step ? "bg-brand" : i + 1 < step ? "bg-brand/55" : "bg-white/15"
                    )}
                  />
                ))}
              </div>
            </div>
          </header>

          {/* ── scrolling content ── */}
          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="mx-auto w-full max-w-2xl px-4 pb-6 pt-3 sm:px-6">
              <AnimatePresence mode="wait" custom={dirRef.current} initial={false}>
                <m.section
                  key={step}
                  custom={dirRef.current}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="space-y-4"
                >
                  {/* step heading */}
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-brand/15 text-brand">
                      <StepIcon size={24} weight="fill" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h1 className="text-[24px] font-bold leading-tight tracking-tight sm:text-[28px]">{meta.title}</h1>
                      <p className="mt-0.5 text-[15px] leading-snug text-white/60">{meta.sub}</p>
                    </div>
                    {step < 4 && (
                      <AnimatePresence mode="wait" initial={false}>
                        <m.span
                          key={hint ?? "count"}
                          initial={{ opacity: 0, scale: 0.85 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.85 }}
                          transition={SNAP}
                          className={cn(
                            "mt-1 shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold tabular-nums",
                            hint ? "bg-amber-400/15 text-amber-300" : "bg-white/[0.08] text-white/60"
                          )}
                        >
                          {hint ?? counter}
                        </m.span>
                      </AnimatePresence>
                    )}
                  </div>

                  {metaError && step < 3 && (
                    <div className="flex items-center justify-between gap-3 rounded-xl bg-rose-500/10 px-3.5 py-3 text-[14px] text-rose-200">
                      <span>Couldn't load the options.</span>
                      <button type="button" onClick={loadMeta} className="rounded-full bg-white/10 px-3 py-1 font-semibold">Try again</button>
                    </div>
                  )}

                  {/* STEP 1: languages and country */}
                  {step === 1 && (
                    <>
                      <SearchField value={langQuery} onChange={setLangQuery} placeholder="Search languages" label="Search languages" />
                      {isMetaLoading ? (
                        <div className="flex flex-wrap gap-2">
                          {Array.from({ length: 10 }).map((_, i) => (
                            <div key={i} className="h-10 animate-pulse rounded-full bg-white/[0.06]" style={{ width: 70 + ((i * 23) % 50) }} />
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Languages">
                          {visibleLanguages.map((l) => (
                            <Chip key={l.code} id={l.code} name={l.name} sub={l.nativeName} selected={langSet.has(l.code)} onToggle={toggleLanguage} />
                          ))}
                          {!visibleLanguages.length && <p className="py-4 text-[14px] text-white/45">No languages match "{dLang}".</p>}
                        </div>
                      )}

                      <div className="border-t border-white/[0.08] pt-4">
                        <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-white/55">
                          <Globe size={16} weight="fill" /> Your country
                        </div>
                        <div ref={countryRef} className="relative">
                          <m.button
                            type="button"
                            whileTap={{ scale: 0.985 }}
                            transition={SNAP}
                            onClick={() => setCountryOpen((o) => !o)}
                            aria-haspopup="listbox"
                            aria-expanded={countryOpen}
                            className="flex h-12 w-full touch-manipulation items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.07] px-4 text-left text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-brand/60 sm:text-[15px]"
                          >
                            <span>{selectedCountry || "Select country"}</span>
                            <m.span animate={{ rotate: countryOpen ? 180 : 0 }} transition={SOFT} className="text-white/50">
                              <CaretDown size={16} weight="bold" />
                            </m.span>
                          </m.button>

                          <AnimatePresence>
                            {countryOpen && (
                              <m.div
                                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.1 } }}
                                transition={SOFT}
                                style={{ transformOrigin: "top" }}
                                className="absolute inset-x-0 z-30 mt-2 flex max-h-[min(18rem,40dvh)] flex-col gap-2 rounded-2xl border border-white/[0.12] bg-[#1c1c1e]/95 p-2 shadow-2xl backdrop-blur-xl"
                              >
                                <SearchField value={countrySearch} onChange={setCountrySearch} placeholder="Search countries" label="Search countries" />
                                <div role="listbox" className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain">
                                  {filteredCountries.map((c) => {
                                    const on = selectedCountry === c.name;
                                    return (
                                      <button
                                        key={c.code}
                                        type="button"
                                        role="option"
                                        aria-selected={on}
                                        onClick={() => {
                                          setSelectedCountry(c.name);
                                          setCountryOpen(false);
                                          setCountrySearch("");
                                          const auto = COUNTRY_LANG[c.code.toUpperCase()];
                                          if (auto && !latest.current.selectedLanguages.length) setSelectedLanguages([auto]);
                                        }}
                                        className={cn(
                                          "flex h-10 w-full touch-manipulation items-center justify-between rounded-lg px-3 text-left text-[15px] transition-colors duration-100",
                                          on ? "bg-brand/20 font-semibold text-brand" : "text-white/85 [@media(hover:hover)]:hover:bg-white/[0.07]"
                                        )}
                                      >
                                        <span>{c.name}</span>
                                        {on ? <Check size={16} weight="bold" /> : <span className="text-[12px] text-white/35">{c.code}</span>}
                                      </button>
                                    );
                                  })}
                                </div>
                              </m.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </>
                  )}

                  {/* STEP 2: genres */}
                  {step === 2 && (
                    <>
                      <SearchField value={genreQuery} onChange={setGenreQuery} placeholder="Search genres" label="Search genres" />
                      {isMetaLoading ? (
                        <div className="flex flex-wrap gap-2">
                          {Array.from({ length: 12 }).map((_, i) => (
                            <div key={i} className="h-10 animate-pulse rounded-full bg-white/[0.06]" style={{ width: 64 + ((i * 29) % 60) }} />
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Genres">
                          {visibleGenres.map((g) => (
                            <Chip key={g} id={g} name={g} selected={genreSet.has(g)} onToggle={toggleGenre} />
                          ))}
                          {!visibleGenres.length && <p className="py-4 text-[14px] text-white/45">No genres match "{dGenre}".</p>}
                        </div>
                      )}
                    </>
                  )}

                  {/* STEP 3: artists */}
                  {step === 3 && (
                    <>
                      <div className="sticky top-0 z-10 -mx-1 space-y-2 bg-[#121214] px-1 pb-2 pt-1">
                        <SearchField
                          value={artistQuery}
                          onChange={setArtistQuery}
                          placeholder="Search any artist"
                          label="Search artists"
                          loading={isSearching}
                        />
                        <div className="flex min-h-[48px] items-center gap-2 overflow-x-auto overscroll-x-contain pb-0.5">
                          {selectedArtists.length === 0 && <p className="text-[14px] text-white/40">Your picks appear here.</p>}
                          <AnimatePresence initial={false}>
                            {selectedArtists.map((a) => (
                              <m.button
                                key={artistKey(a)}
                                layout
                                type="button"
                                aria-label={`Remove ${a.name}`}
                                onClick={() => toggleArtist(a)}
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.5 }}
                                transition={POP}
                                className="relative h-11 w-11 shrink-0 touch-manipulation"
                              >
                                <img src={a.image} alt="" width={44} height={44} decoding="async" className="h-full w-full rounded-full bg-white/10 object-cover" />
                                <span className="absolute -right-1 -top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-zinc-800 text-white ring-2 ring-[#121214]">
                                  <X size={10} weight="bold" />
                                </span>
                              </m.button>
                            ))}
                          </AnimatePresence>
                        </div>
                      </div>

                      {artistLoading && artistGrid.length === 0 ? (
                        <div className="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-4 md:grid-cols-5">
                          {Array.from({ length: 10 }).map((_, i) => (
                            <div key={i} className="flex flex-col items-center gap-2 p-1">
                              <div className="aspect-square w-full animate-pulse rounded-full bg-white/[0.06]" />
                              <div className="h-3 w-3/4 animate-pulse rounded bg-white/[0.06]" />
                            </div>
                          ))}
                        </div>
                      ) : artistGrid.length ? (
                        <div className="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-4 md:grid-cols-5" role="group" aria-label="Artists">
                          {artistGrid.map((a) => (
                            <ArtistBubble key={artistKey(a)} artist={a} selected={artistSet.has(artistKey(a))} onToggle={toggleArtist} />
                          ))}
                        </div>
                      ) : (
                        <p className="py-6 text-center text-[14px] text-white/45">
                          {artistQuery.trim() ? `No artists found for "${artistQuery.trim()}".` : "Search for an artist to get started."}
                        </p>
                      )}
                    </>
                  )}

                  {/* STEP 4: age and summary */}
                  {step === 4 && (
                    <div className="mx-auto max-w-sm space-y-5">
                      <div className="flex items-center justify-center gap-5 pt-2">
                        <m.button type="button" aria-label="Decrease age" whileTap={{ scale: 0.88 }} transition={SNAP} onClick={() => bumpAge(-1)}
                          className="flex h-12 w-12 touch-manipulation items-center justify-center rounded-full bg-white/[0.08] outline-none focus-visible:ring-2 focus-visible:ring-brand/60">
                          <Minus size={20} weight="bold" />
                        </m.button>
                        <label htmlFor="onboarding-age" className="sr-only">Your age</label>
                        <input
                          id="onboarding-age"
                          name="age"
                          aria-label="Your age"
                          value={age}
                          onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className="h-20 w-28 rounded-2xl border border-white/[0.08] bg-white/[0.07] text-center text-[44px] font-bold tabular-nums outline-none transition-colors focus:border-white/25"
                        />
                        <m.button type="button" aria-label="Increase age" whileTap={{ scale: 0.88 }} transition={SNAP} onClick={() => bumpAge(1)}
                          className="flex h-12 w-12 touch-manipulation items-center justify-center rounded-full bg-white/[0.08] outline-none focus-visible:ring-2 focus-visible:ring-brand/60">
                          <Plus size={20} weight="bold" />
                        </m.button>
                      </div>
                      <p className={cn("text-center text-[13px]", ageValid ? "text-white/40" : "text-amber-300")}>Between 13 and 100</p>

                      <div className="divide-y divide-white/[0.07] overflow-hidden rounded-2xl bg-white/[0.06] text-[14px]">
                        {[
                          { icon: Translate, k: "Languages", v: selectedLanguages.join(", ") || "None" },
                          { icon: Globe, k: "Country", v: selectedCountry },
                          { icon: MusicNotes, k: "Genres", v: selectedGenres.join(", ") || "None" },
                          { icon: MicrophoneStage, k: "Artists", v: `${selectedArtists.length} picked` },
                        ].map(({ icon: I, k, v }) => (
                          <div key={k} className="flex items-center gap-3 px-3.5 py-3">
                            <I size={18} weight="fill" className="shrink-0 text-brand" />
                            <span className="w-20 shrink-0 text-white/55">{k}</span>
                            <span className="min-w-0 flex-1 truncate text-right font-medium text-white">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {errorMessage && (
                    <m.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={SOFT}
                      role="alert"
                      className="flex items-start gap-2 rounded-xl bg-rose-500/10 px-3.5 py-3 text-[14px] text-rose-200"
                    >
                      <WarningCircle size={18} weight="fill" className="mt-px shrink-0" />
                      <span>{errorMessage}</span>
                    </m.div>
                  )}
                </m.section>
              </AnimatePresence>
            </div>
          </main>

          {/* ── docked footer ── */}
          <footer className="shrink-0 border-t border-white/[0.08] bg-[#121214]">
            <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 sm:px-6">
              <div className="w-24">
                {step > 1 && (
                  <m.button
                    type="button"
                    onClick={() => go((step - 1) as Step)}
                    whileTap={{ scale: 0.94 }}
                    transition={SNAP}
                    className="flex h-11 touch-manipulation items-center gap-1 rounded-full px-3 text-[16px] font-medium text-white/70 outline-none focus-visible:ring-2 focus-visible:ring-brand/60 [@media(hover:hover)]:hover:text-white"
                  >
                    <CaretLeft size={18} weight="bold" /> Back
                  </m.button>
                )}
              </div>

              <div className="min-w-0 flex-1 text-center text-[13px] text-white/45">
                <AnimatePresence mode="wait" initial={false}>
                  {remaining > 0 && step < 4 && (
                    <m.span key={`${step}-${remaining}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={SNAP} className="block truncate">
                      Pick {remaining} more {noun}{remaining > 1 ? "s" : ""}
                    </m.span>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex w-24 justify-end">
                {step < 4 ? (
                  <m.button
                    type="button"
                    onClick={() => canContinue && go((step + 1) as Step)}
                    disabled={!canContinue}
                    animate={{ opacity: canContinue ? 1 : 0.4 }}
                    whileTap={canContinue ? { scale: 0.94 } : undefined}
                    transition={SNAP}
                    className="flex h-11 touch-manipulation items-center gap-1.5 rounded-full bg-brand px-5 text-[16px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                  >
                    Next <ArrowRight size={18} weight="bold" />
                  </m.button>
                ) : (
                  <m.button
                    type="button"
                    onClick={handleFinalSubmit}
                    disabled={isSubmitting || !ageValid}
                    animate={{ opacity: isSubmitting || !ageValid ? 0.5 : 1 }}
                    whileTap={!isSubmitting && ageValid ? { scale: 0.94 } : undefined}
                    transition={SNAP}
                    className="flex h-11 touch-manipulation items-center gap-1.5 whitespace-nowrap rounded-full bg-brand px-5 text-[16px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                  >
                    {isSubmitting ? (<><SpinnerGap size={18} className="animate-spin" /> Saving</>) : (<>Done <Check size={18} weight="bold" /></>)}
                  </m.button>
                )}
              </div>
            </div>
          </footer>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}