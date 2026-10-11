"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  Search,
  X,
  ChevronDown,
  Globe,
  Music2,
  Sparkles,
  UserCheck,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertCircle
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

interface LanguageItem {
  code: string;
  name: string;
  nativeName: string;
}

interface CountryItem {
  code: string;
  name: string;
}

interface ArtistItem {
  id: string;
  name: string;
  image: string;
  source?: string;
}

const STORAGE_KEY = 'zenify_onboarding_draft';

export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, updateUser } = useAuthStore();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Metadata from backend
  const [languagesList, setLanguagesList] = useState<LanguageItem[]>([]);
  const [countriesList, setCountriesList] = useState<CountryItem[]>([]);
  const [genresList, setGenresList] = useState<string[]>([]);
  const [isMetaLoading, setIsMetaLoading] = useState(true);

  // Form State
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('India');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedArtists, setSelectedArtists] = useState<ArtistItem[]>([]);
  const [age, setAge] = useState<string>('21');

  // Search & Filters
  const [langSearch, setLangSearch] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);

  // Artist Live Search
  const [artistQuery, setArtistQuery] = useState('');
  const [artistSearchResults, setArtistSearchResults] = useState<ArtistItem[]>([]);
  const [isArtistSearching, setIsArtistSearching] = useState(false);
  const [artistSearchError, setArtistSearchError] = useState<string | null>(null);
  const [isArtistDropdownOpen, setIsArtistDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchAbortRef = useRef<AbortController | null>(null);

  // Suggested Artists
  const [suggestedArtists, setSuggestedArtists] = useState<ArtistItem[]>([]);
  const [isSuggestedLoading, setIsSuggestedLoading] = useState(false);

  // 1. Restore draft progress from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft.selectedLanguages) setSelectedLanguages(draft.selectedLanguages);
        if (draft.selectedCountry) setSelectedCountry(draft.selectedCountry);
        if (draft.selectedGenres) setSelectedGenres(draft.selectedGenres);
        if (draft.selectedArtists) setSelectedArtists(draft.selectedArtists);
        if (draft.age) setAge(draft.age);
        if (draft.step) setStep(draft.step);
      }
    } catch (e) {
      console.warn('Failed to restore draft:', e);
    }
  }, []);

  // 2. Persist draft progress to localStorage
  useEffect(() => {
    try {
      const draft = {
        selectedLanguages,
        selectedCountry,
        selectedGenres,
        selectedArtists,
        age,
        step
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch (e) {
      console.warn('Failed to save draft:', e);
    }
  }, [selectedLanguages, selectedCountry, selectedGenres, selectedArtists, age, step]);

  // 3. Fetch metadata from backend
  useEffect(() => {
    let isMounted = true;
    async function loadMeta() {
      setIsMetaLoading(true);
      try {
        const res = await api.get('/preferences/metadata');
        if (isMounted && res.data) {
          setLanguagesList(res.data.languages || []);
          setCountriesList(res.data.countries || []);
          setGenresList(res.data.genres || []);
        }
      } catch (err) {
        console.error('Failed to load preferences metadata:', err);
      } finally {
        if (isMounted) setIsMetaLoading(false);
      }
    }
    loadMeta();
    return () => {
      isMounted = false;
    };
  }, []);

  // 4. Load Suggested Artists when entering Step 3
  useEffect(() => {
    if (step === 3 && suggestedArtists.length === 0) {
      let isMounted = true;
      setIsSuggestedLoading(true);
      api.get('/preferences/artists/suggested', {
        params: {
          languages: selectedLanguages.join(','),
          genres: selectedGenres.join(',')
        }
      }).then(res => {
        if (isMounted && Array.isArray(res.data)) {
          setSuggestedArtists(res.data);
        }
      }).catch(err => {
        console.error('Failed to load suggested artists:', err);
      }).finally(() => {
        if (isMounted) setIsSuggestedLoading(false);
      });

      return () => {
        isMounted = false;
      };
    }
  }, [step, selectedLanguages, selectedGenres, suggestedArtists.length]);

  // 5. Live Artist Search (300ms debounce, abort controller, error handling)
  useEffect(() => {
    if (!artistQuery.trim()) {
      setArtistSearchResults([]);
      setIsArtistSearching(false);
      setIsArtistDropdownOpen(false);
      setArtistSearchError(null);
      return;
    }

    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setIsArtistSearching(true);
    setArtistSearchError(null);
    setHighlightedIndex(-1);

    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/preferences/artists/search', {
          params: { q: artistQuery.trim(), limit: 8 },
          signal: controller.signal
        });
        setArtistSearchResults(res.data || []);
        setIsArtistDropdownOpen(true);
      } catch (err: any) {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
          console.error('Artist search failed:', err);
          setArtistSearchError('Failed to search artists. Please try again.');
        }
      } finally {
        setIsArtistSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [artistQuery]);

  // Keyboard Navigation for Artist Search Dropdown
  const handleArtistKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isArtistDropdownOpen || artistSearchResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev < artistSearchResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : artistSearchResults.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && artistSearchResults[highlightedIndex]) {
        toggleArtist(artistSearchResults[highlightedIndex]);
        setArtistQuery('');
        setIsArtistDropdownOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsArtistDropdownOpen(false);
    }
  };

  // Helper functions for selection
  const toggleLanguage = (code: string) => {
    if (selectedLanguages.includes(code)) {
      setSelectedLanguages(selectedLanguages.filter(c => c !== code));
    } else {
      if (selectedLanguages.length < 5) {
        setSelectedLanguages([...selectedLanguages, code]);
      }
    }
  };

  const toggleGenre = (genre: string) => {
    if (selectedGenres.includes(genre)) {
      setSelectedGenres(selectedGenres.filter(g => g !== genre));
    } else {
      if (selectedGenres.length < 5) {
        setSelectedGenres([...selectedGenres, genre]);
      }
    }
  };

  const toggleArtist = (artist: ArtistItem) => {
    const exists = selectedArtists.some(a => a.name.toLowerCase() === artist.name.toLowerCase());
    if (exists) {
      setSelectedArtists(selectedArtists.filter(a => a.name.toLowerCase() !== artist.name.toLowerCase()));
    } else {
      if (selectedArtists.length < 10) {
        setSelectedArtists([...selectedArtists, artist]);
      }
    }
  };

  // Filtered lists
  const filteredLanguages = useMemo(() => {
    if (!langSearch.trim()) return languagesList;
    const q = langSearch.toLowerCase();
    return languagesList.filter(
      l => l.name.toLowerCase().includes(q) || l.nativeName.toLowerCase().includes(q) || l.code.toLowerCase().includes(q)
    );
  }, [languagesList, langSearch]);

  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return countriesList;
    const q = countrySearch.toLowerCase();
    return countriesList.filter(
      c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [countriesList, countrySearch]);

  // Submit preferences to backend
  const handleFinalSubmit = async () => {
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum < 13 || ageNum > 100) {
      setErrorMessage('Please enter a valid age between 13 and 100.');
      return;
    }

    if (selectedLanguages.length < 1) {
      setErrorMessage('Please select at least 1 language.');
      setStep(1);
      return;
    }

    if (selectedGenres.length < 4) {
      setErrorMessage('Please select at least 4 genres.');
      setStep(2);
      return;
    }

    if (selectedArtists.length < 3) {
      setErrorMessage('Please select at least 3 favorite artists.');
      setStep(3);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = {
        languages: selectedLanguages,
        preferredGenres: selectedGenres,
        favoriteArtists: selectedArtists.map(a => ({
          id: a.id,
          name: a.name,
          image: a.image,
          source: a.source || 'onboarding'
        })),
        country: selectedCountry,
        age: ageNum
      };

      const res = await api.put('/preferences', payload);

      // Update Zustand auth store
      updateUser({
        country: selectedCountry,
        age: ageNum,
        preferences: {
          ...(user?.preferences || {}),
          onboardingCompleted: true,
          onboardingCompletedAt: new Date().toISOString(),
          languages: selectedLanguages,
          preferredGenres: selectedGenres,
          favoriteArtists: payload.favoriteArtists
        }
      });

      // Clear draft
      localStorage.removeItem(STORAGE_KEY);

      // Invalidate home queries to immediately load personalized feeds
      queryClient.invalidateQueries({ queryKey: ['home-featured'] });
      queryClient.invalidateQueries({ queryKey: ['home-made-for-you'] });
      queryClient.invalidateQueries({ queryKey: ['home-recommendations'] });

      // Redirect to home
      router.push('/');
    } catch (err: any) {
      console.error('Failed to complete onboarding:', err);
      setErrorMessage(err.response?.data?.message || 'Failed to save preferences. Please verify all fields and retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#121214] text-foreground flex flex-col justify-between p-4 sm:p-6 md:p-10 select-none">
      {/* Top Header & Progress */}
      <div className="max-w-4xl w-full mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand font-black text-sm">
              Z
            </div>
            <div>
              <h1 className="text-sm font-black font-oswald uppercase tracking-wider text-white">
                Personalized Setup
              </h1>
              <p className="text-[11px] text-zinc-400 font-libre">
                Tune your high-fidelity sonic universe
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[11px] font-oswald font-black uppercase tracking-widest text-brand">
              Step {step} of 4
            </span>
            <p className="text-[10px] text-zinc-500 font-libre font-medium">
              {step === 1 && 'Languages & Country'}
              {step === 2 && 'Genres'}
              {step === 3 && 'Favorite Artists'}
              {step === 4 && 'Your Age'}
            </p>
          </div>
        </div>

        {/* Smooth Step Progress Bar */}
        <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-brand"
            initial={{ width: '25%' }}
            animate={{ width: `${(step / 4) * 100}%` }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
          />
        </div>
      </div>

      {/* Main Multi-Step Content */}
      <div className="max-w-4xl w-full mx-auto my-8">
        <AnimatePresence mode="wait">
          {/* STEP 1: Languages & Country */}
          {step === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
              className="space-y-8"
            >
              <div>
                <h2 className="text-2xl sm:text-3xl font-black font-oswald uppercase tracking-wide text-primary">
                  What languages do you listen to?
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400 font-libre mt-1">
                  Select 1 to 5 music languages. We will feature songs in these languages first.
                </p>
              </div>

              {/* Language Counter & Search */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-libre font-semibold text-zinc-300">
                    Languages Selected: <strong className="text-brand">{selectedLanguages.length}</strong> / 5
                  </span>
                  {selectedLanguages.length >= 5 && (
                    <span className="text-[11px] text-amber-400 font-medium font-libre">Maximum reached</span>
                  )}
                </div>

                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
                  <input
                    type="text"
                    value={langSearch}
                    onChange={e => setLangSearch(e.target.value)}
                    placeholder="Search all languages (e.g. Tamil, English, Hindi, Korean)..."
                    className="w-full h-11 pl-10 pr-4 bg-zinc-900 border border-white/10 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand transition-colors"
                  />
                  {langSearch && (
                    <button
                      onClick={() => setLangSearch('')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Languages Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-[260px] overflow-y-auto p-1 pr-2 rounded-xl border border-white/5 bg-zinc-900/40">
                  {filteredLanguages.map(lang => {
                    const isSelected = selectedLanguages.includes(lang.code);
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => toggleLanguage(lang.code)}
                        className={cn(
                          "flex flex-col items-start p-3 rounded-xl border text-left transition-all active:scale-95 cursor-pointer",
                          isSelected
                            ? "bg-brand/15 border-brand text-white shadow-[0_0_15px_rgba(225,29,72,0.25)]"
                            : "bg-zinc-900/80 border-white/5 text-zinc-300 hover:border-white/20 hover:bg-zinc-800/60"
                        )}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-xs font-bold font-oswald uppercase tracking-wide truncate">
                            {lang.name}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-brand shrink-0" />}
                        </div>
                        <span className="text-[11px] text-zinc-400 font-libre mt-0.5 truncate">
                          {lang.nativeName}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Country Selection Dropdown */}
              <div className="space-y-2 pt-4 border-t border-white/5">
                <label className="text-xs font-bold font-oswald uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-brand" />
                  Your Country (ISO 3166)
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                    className="w-full h-11 px-4 bg-zinc-900 border border-white/10 rounded-xl text-left text-xs sm:text-sm text-white flex items-center justify-between hover:border-white/20 transition-colors"
                  >
                    <span>{selectedCountry || 'Select Country'}</span>
                    <ChevronDown className={cn("w-4 h-4 text-zinc-400 transition-transform", isCountryDropdownOpen && "rotate-180")} />
                  </button>

                  {isCountryDropdownOpen && (
                    <div className="absolute z-50 left-0 right-0 mt-2 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl p-2 space-y-2 max-h-60 overflow-hidden flex flex-col">
                      <input
                        type="text"
                        value={countrySearch}
                        onChange={e => setCountrySearch(e.target.value)}
                        placeholder="Search country..."
                        className="w-full h-9 px-3 bg-zinc-800 border border-white/10 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand"
                        autoFocus
                      />
                      <div className="overflow-y-auto space-y-1 pr-1 flex-1">
                        {filteredCountries.map(c => (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => {
                              setSelectedCountry(c.name);
                              setIsCountryDropdownOpen(false);
                              setCountrySearch('');
                            }}
                            className={cn(
                              "w-full px-3 py-2 text-left rounded-lg text-xs flex items-center justify-between transition-colors",
                              selectedCountry === c.name
                                ? "bg-brand/20 text-brand font-bold"
                                : "text-zinc-300 hover:bg-white/5"
                            )}
                          >
                            <span>{c.name}</span>
                            <span className="text-[10px] text-zinc-500">{c.code}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 2: Genres */}
          {step === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              <div>
                <h2 className="text-2xl sm:text-3xl font-black font-oswald uppercase tracking-wide text-primary">
                  Choose your top genres
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400 font-libre mt-1">
                  Select 4 to 5 music styles to tune your recommendation frequencies.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-libre font-semibold text-zinc-300">
                  Genres Selected: <strong className="text-brand">{selectedGenres.length}</strong> / 5 (Min 4)
                </span>
                {selectedGenres.length >= 5 && (
                  <span className="text-[11px] text-amber-400 font-medium font-libre">Maximum 5 reached</span>
                )}
              </div>

              {/* Genre Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {genresList.map(genre => {
                  const isSelected = selectedGenres.includes(genre);
                  return (
                    <button
                      key={genre}
                      type="button"
                      onClick={() => toggleGenre(genre)}
                      className={cn(
                        "p-4 rounded-xl border text-left flex items-center justify-between transition-all active:scale-95 cursor-pointer",
                        isSelected
                          ? "bg-brand/15 border-brand text-white shadow-[0_0_15px_rgba(225,29,72,0.25)]"
                          : "bg-zinc-900/90 border-white/10 text-zinc-300 hover:border-white/20 hover:bg-zinc-800"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <Music2 className={cn("w-4 h-4", isSelected ? "text-brand" : "text-zinc-500")} />
                        <span className="text-xs font-bold font-oswald uppercase tracking-wider">
                          {genre}
                        </span>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-brand shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* STEP 3: Favorite Artists (Real API Data) */}
          {step === 3 && (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              <div>
                <h2 className="text-2xl sm:text-3xl font-black font-oswald uppercase tracking-wide text-primary">
                  Select your favorite artists
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400 font-libre mt-1">
                  Pick 3 to 10 artists you love. Real artists are fetched from our music catalog.
                </p>
              </div>

              {/* Counter */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-libre font-semibold text-zinc-300">
                  Artists Selected: <strong className="text-brand">{selectedArtists.length}</strong> / 10 (Min 3)
                </span>
                {selectedArtists.length >= 10 && (
                  <span className="text-[11px] text-amber-400 font-medium font-libre">Maximum 10 reached</span>
                )}
              </div>

              {/* Selected Artists Showcase */}
              {selectedArtists.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] font-bold font-oswald uppercase tracking-widest text-zinc-400">
                    Your Selection ({selectedArtists.length})
                  </span>
                  <div className="flex flex-wrap gap-2.5 max-h-36 overflow-y-auto p-2 bg-zinc-900/60 border border-white/5 rounded-xl">
                    {selectedArtists.map(artist => (
                      <div
                        key={artist.id || artist.name}
                        className="flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-full bg-zinc-800 border border-white/10 text-white text-xs group"
                      >
                        <img
                          src={artist.image}
                          alt={artist.name}
                          className="w-7 h-7 rounded-full object-cover shrink-0 border border-white/20"
                          onError={e => {
                            (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(artist.name)}&background=18181b&color=e11d48`;
                          }}
                        />
                        <span className="font-libre font-medium text-xs truncate max-w-[120px]">
                          {artist.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleArtist(artist)}
                          className="text-zinc-400 hover:text-brand transition-colors p-0.5 rounded-full"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Live Artist Search Bar with Dropdown */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
                <input
                  type="text"
                  value={artistQuery}
                  onChange={e => setArtistQuery(e.target.value)}
                  onKeyDown={handleArtistKeyDown}
                  placeholder="Search any artist (e.g. Anirudh, Arijit Singh, The Weeknd, BTS)..."
                  className="w-full h-11 pl-10 pr-10 bg-zinc-900 border border-white/10 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand transition-colors"
                />
                {isArtistSearching && (
                  <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand w-4 h-4 animate-spin" />
                )}
                {artistQuery && !isArtistSearching && (
                  <button
                    type="button"
                    onClick={() => {
                      setArtistQuery('');
                      setIsArtistDropdownOpen(false);
                    }}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                {/* Dropdown Results */}
                {isArtistDropdownOpen && (
                  <div className="absolute z-50 left-0 right-0 mt-2 bg-zinc-900 border border-white/15 rounded-2xl shadow-2xl overflow-hidden max-h-72 overflow-y-auto">
                    {artistSearchError && (
                      <div className="p-3 text-xs text-rose-400 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{artistSearchError}</span>
                      </div>
                    )}

                    {!artistSearchError && artistSearchResults.length === 0 && !isArtistSearching && (
                      <div className="p-4 text-center text-xs text-zinc-500 font-libre">
                        No artists found for "{artistQuery}". Try another name.
                      </div>
                    )}

                    {artistSearchResults.map((artist, idx) => {
                      const isSelected = selectedArtists.some(a => a.name.toLowerCase() === artist.name.toLowerCase());
                      const isHighlighted = idx === highlightedIndex;

                      return (
                        <button
                          key={artist.id || artist.name}
                          type="button"
                          onClick={() => {
                            toggleArtist(artist);
                            setArtistQuery('');
                            setIsArtistDropdownOpen(false);
                          }}
                          className={cn(
                            "w-full px-4 py-2.5 flex items-center justify-between text-left transition-colors border-b border-white/5 last:border-none",
                            isHighlighted ? "bg-white/10" : "hover:bg-white/5",
                            isSelected && "bg-brand/10 text-brand"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <img
                              src={artist.image}
                              alt={artist.name}
                              className="w-9 h-9 rounded-full object-cover shrink-0 border border-white/15"
                              onError={e => {
                                (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(artist.name)}&background=18181b&color=e11d48`;
                              }}
                            />
                            <div>
                              <p className="text-xs font-bold text-white truncate">{artist.name}</p>
                              <span className="text-[10px] text-zinc-500 uppercase tracking-widest">
                                {artist.source || 'Artist'}
                              </span>
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-brand shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Suggested Popular Artists for User Languages & Genres */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold font-oswald uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-brand" />
                    Suggested For You
                  </span>
                  <span className="text-[10px] text-zinc-500 font-libre">Based on your languages & genres</span>
                </div>

                {isSuggestedLoading ? (
                  <div className="py-10 flex flex-col items-center justify-center gap-2 text-zinc-500 text-xs">
                    <Loader2 className="w-5 h-5 text-brand animate-spin" />
                    <span>Loading suggested artists from catalog...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[280px] overflow-y-auto p-1 pr-2">
                    {suggestedArtists.map(artist => {
                      const isSelected = selectedArtists.some(a => a.name.toLowerCase() === artist.name.toLowerCase());
                      return (
                        <button
                          key={artist.id || artist.name}
                          type="button"
                          onClick={() => toggleArtist(artist)}
                          className={cn(
                            "flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all active:scale-95 cursor-pointer",
                            isSelected
                              ? "bg-brand/15 border-brand text-white shadow-[0_0_15px_rgba(225,29,72,0.25)]"
                              : "bg-zinc-900 border-white/5 text-zinc-300 hover:border-white/20 hover:bg-zinc-800"
                          )}
                        >
                          <img
                            src={artist.image}
                            alt={artist.name}
                            className="w-10 h-10 rounded-full object-cover shrink-0 border border-white/20"
                            onError={e => {
                              (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(artist.name)}&background=18181b&color=e11d48`;
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold font-oswald uppercase tracking-tight truncate">
                              {artist.name}
                            </p>
                            <span className="text-[10px] text-zinc-500">Artist</span>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-brand shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* STEP 4: Age Validation */}
          {step === 4 && (
            <motion.div
              key="step-4"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
              className="space-y-6 max-w-md mx-auto text-center"
            >
              <div className="w-16 h-16 rounded-full bg-brand/10 border border-brand/20 text-brand mx-auto flex items-center justify-center">
                <UserCheck className="w-8 h-8" />
              </div>

              <div>
                <h2 className="text-2xl sm:text-3xl font-black font-oswald uppercase tracking-wide text-primary">
                  How old are you?
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400 font-libre mt-1">
                  We use your age to curate era-appropriate recommendations and culture milestones. Valid range: 13–100.
                </p>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold font-oswald uppercase tracking-wider text-zinc-400 block">
                  Your Age (Years)
                </label>
                <input
                  type="number"
                  min="13"
                  max="100"
                  value={age}
                  onChange={e => setAge(e.target.value)}
                  className="w-32 h-14 mx-auto text-center font-oswald font-black text-3xl bg-zinc-900 border border-white/10 rounded-2xl text-white focus:outline-none focus:border-brand transition-colors"
                  autoFocus
                />
                <p className="text-[11px] text-zinc-500 font-libre">
                  Must be between 13 and 100 years old
                </p>
              </div>

              {/* Summary Review */}
              <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/5 text-left text-xs space-y-2 mt-6">
                <p className="font-bold font-oswald uppercase tracking-wide text-zinc-300">Profile Summary</p>
                <div className="flex justify-between text-zinc-400">
                  <span>Languages:</span>
                  <span className="text-white font-medium">{selectedLanguages.join(', ')}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Country:</span>
                  <span className="text-white font-medium">{selectedCountry}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Genres:</span>
                  <span className="text-white font-medium">{selectedGenres.join(', ')}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Favorite Artists:</span>
                  <span className="text-white font-medium">{selectedArtists.length} chosen</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {errorMessage && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Mandatory Signature Action Controls & Navigation Footer */}
      <div className="max-w-4xl w-full mx-auto pt-6 border-t border-white/10 flex items-center justify-between">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              setStep((step - 1) as any);
            }}
            className="h-10 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-white text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
        ) : (
          <div />
        )}

        {step < 4 ? (
          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              if (step === 1 && selectedLanguages.length < 1) {
                setErrorMessage('Please select at least 1 language.');
                return;
              }
              if (step === 2 && selectedGenres.length < 4) {
                setErrorMessage('Please select at least 4 genres.');
                return;
              }
              if (step === 3 && selectedArtists.length < 3) {
                setErrorMessage('Please select at least 3 favorite artists.');
                return;
              }
              setStep((step + 1) as any);
            }}
            disabled={
              (step === 1 && selectedLanguages.length < 1) ||
              (step === 2 && selectedGenres.length < 4) ||
              (step === 3 && selectedArtists.length < 3)
            }
            className="h-10 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            Continue
            <ArrowRight className="w-3.5 h-3.5 text-brand" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleFinalSubmit}
            disabled={isSubmitting || parseInt(age, 10) < 13 || parseInt(age, 10) > 100}
            className="h-10 px-6 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-[0_0_20px_rgba(225,29,72,0.3)]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
                Saving Profile...
              </>
            ) : (
              <>
                Complete Setup
                <Check className="w-3.5 h-3.5 text-brand" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
