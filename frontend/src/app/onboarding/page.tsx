"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  ChevronDown,
  Globe,
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
import {
  MultiSelectSearchDropdown,
  DropdownItem
} from '@/components/shared/MultiSelectSearchDropdown';

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

  // Country Dropdown
  const [countrySearch, setCountrySearch] = useState('');
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);

  // Suggested Artists
  const [suggestedArtists, setSuggestedArtists] = useState<ArtistItem[]>([]);
  const [isSuggestedLoading, setIsSuggestedLoading] = useState(false);

  // Dynamic mobile visualViewport height handling (prevents button being pushed off-screen or behind virtual keyboard)
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const handleViewportChange = () => {
      if (window.visualViewport) {
        setViewportHeight(window.visualViewport.height);
      }
    };

    handleViewportChange();
    window.visualViewport.addEventListener('resize', handleViewportChange);
    window.visualViewport.addEventListener('scroll', handleViewportChange);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange);
        window.visualViewport.removeEventListener('scroll', handleViewportChange);
      }
    };
  }, []);

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
      })
      .then(res => {
        if (isMounted && res.data) {
          setSuggestedArtists(res.data);
        }
      })
      .catch(err => {
        console.warn('Failed to load suggested artists:', err);
      })
      .finally(() => {
        if (isMounted) setIsSuggestedLoading(false);
      });

      return () => {
        isMounted = false;
      };
    }
  }, [step, selectedLanguages, selectedGenres, suggestedArtists.length]);

  // Live artist search debounced worker
  const searchArtistsApi = useCallback(async (q: string, signal: AbortSignal): Promise<DropdownItem[]> => {
    const res = await api.get('/preferences/artists/search', {
      params: { q, limit: 12 },
      signal
    });
    return (res.data || []).map((a: any) => ({
      id: a.id || a.name,
      name: a.name,
      image: a.image,
      subtext: a.source || 'Artist'
    }));
  }, []);

  // Toggle Handlers
  const handleToggleLanguage = (item: DropdownItem) => {
    if (selectedLanguages.includes(item.id)) {
      setSelectedLanguages(selectedLanguages.filter(c => c !== item.id));
    } else {
      if (selectedLanguages.length < 5) {
        setSelectedLanguages([...selectedLanguages, item.id]);
      }
    }
  };

  const handleRemoveLanguage = (id: string) => {
    setSelectedLanguages(selectedLanguages.filter(c => c !== id));
  };

  const handleToggleGenre = (item: DropdownItem) => {
    if (selectedGenres.includes(item.id)) {
      setSelectedGenres(selectedGenres.filter(g => g !== item.id));
    } else {
      if (selectedGenres.length < 5) {
        setSelectedGenres([...selectedGenres, item.id]);
      }
    }
  };

  const handleRemoveGenre = (id: string) => {
    setSelectedGenres(selectedGenres.filter(g => g !== id));
  };

  const handleToggleArtist = (item: DropdownItem) => {
    const exists = selectedArtists.some(a => (a.id || a.name).toLowerCase() === item.id.toLowerCase());
    if (exists) {
      setSelectedArtists(selectedArtists.filter(a => (a.id || a.name).toLowerCase() !== item.id.toLowerCase()));
    } else {
      if (selectedArtists.length < 10) {
        setSelectedArtists([
          ...selectedArtists,
          {
            id: item.id,
            name: item.name,
            image: item.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=18181b&color=e11d48`,
            source: item.subtext || 'Artist'
          }
        ]);
      }
    }
  };

  const handleRemoveArtist = (id: string) => {
    setSelectedArtists(selectedArtists.filter(a => (a.id || a.name).toLowerCase() !== id.toLowerCase()));
  };

  // Filtered countries for country dropdown
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

      await api.put('/preferences', payload);

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

      localStorage.removeItem(STORAGE_KEY);

      queryClient.invalidateQueries({ queryKey: ['home-featured'] });
      queryClient.invalidateQueries({ queryKey: ['home-made-for-you'] });
      queryClient.invalidateQueries({ queryKey: ['home-recommendations'] });

      router.push('/');
    } catch (err: any) {
      console.error('Failed to complete onboarding:', err);
      setErrorMessage(err.response?.data?.message || 'Failed to save preferences. Please verify all fields and retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Prepare Dropdown items
  const languageDropdownItems: DropdownItem[] = useMemo(() => {
    return languagesList.map(l => ({
      id: l.code,
      name: l.name,
      nativeName: l.nativeName
    }));
  }, [languagesList]);

  const genreDropdownItems: DropdownItem[] = useMemo(() => {
    return genresList.map(g => ({
      id: g,
      name: g
    }));
  }, [genresList]);

  const suggestedArtistDropdownItems: DropdownItem[] = useMemo(() => {
    return suggestedArtists.map(a => ({
      id: a.id || a.name,
      name: a.name,
      image: a.image,
      subtext: a.source || 'Artist'
    }));
  }, [suggestedArtists]);

  const selectedArtistDropdownItems: DropdownItem[] = useMemo(() => {
    return selectedArtists.map(a => ({
      id: a.id || a.name,
      name: a.name,
      image: a.image
    }));
  }, [selectedArtists]);

  return (
    <div
      className="h-dvh max-h-dvh bg-[#121214] text-foreground flex flex-col p-4 sm:p-6 md:p-8 select-none overflow-hidden isolate"
      style={{
        height: viewportHeight ? `${viewportHeight}px` : '100dvh'
      }}
    >
      {/* ── Stable Header & Progress Indicator ── */}
      <div className="shrink-0 max-w-4xl w-full mx-auto space-y-3">
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

        {/* Step Progress Bar */}
        <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-brand"
            initial={{ width: '25%' }}
            animate={{ width: `${(step / 4) * 100}%` }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
          />
        </div>
      </div>

      {/* ── Main Form Content Area (Scrolls independently, flex-1 min-h-0) ── */}
      <div className="flex-1 min-h-0 overflow-y-auto max-w-4xl w-full mx-auto py-4 px-1 overscroll-contain space-y-6">
        <AnimatePresence mode="wait">
          {/* STEP 1: Languages & Country */}
          {step === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div>
                <h2 className="text-2xl sm:text-3xl font-black font-oswald uppercase tracking-wide text-primary">
                  What languages do you listen to?
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400 font-libre mt-1">
                  Select 1 to 5 music languages. We will feature songs in these languages first.
                </p>
              </div>

              {/* Shared Reusable MultiSelectSearchDropdown for Languages */}
              <MultiSelectSearchDropdown
                type="language"
                title="Music Languages"
                placeholder="Search languages (e.g. Tamil, English, Hindi)..."
                items={languageDropdownItems}
                selectedIds={selectedLanguages}
                onToggle={handleToggleLanguage}
                onRemove={handleRemoveLanguage}
                minCount={1}
                maxCount={5}
                isLoading={isMetaLoading}
                idPrefix="onboarding-lang"
              />

              {/* Country Selection Dropdown */}
              <div className="space-y-2 pt-2 border-t border-white/5">
                <label className="text-xs font-bold font-oswald uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-brand" />
                  Your Country (ISO 3166)
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                    className="w-full h-11 px-4 bg-zinc-900 border border-white/10 rounded-xl text-left text-xs sm:text-sm text-white flex items-center justify-between hover:border-white/20 transition-colors cursor-pointer"
                  >
                    <span>{selectedCountry || 'Select Country'}</span>
                    <ChevronDown className={cn("w-4 h-4 text-zinc-400 transition-transform", isCountryDropdownOpen && "rotate-180")} />
                  </button>

                  {isCountryDropdownOpen && (
                    <div className="absolute z-50 left-0 right-0 mt-2 bg-[#18181B] border border-white/15 rounded-2xl shadow-2xl p-2 space-y-2 max-h-56 overflow-hidden flex flex-col">
                      <input
                        type="text"
                        value={countrySearch}
                        onChange={e => setCountrySearch(e.target.value)}
                        placeholder="Search country..."
                        className="w-full h-9 px-3 bg-zinc-900 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand"
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
                              "w-full px-3 py-2 text-left rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer",
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
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
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

              {/* Shared Reusable MultiSelectSearchDropdown for Genres */}
              <MultiSelectSearchDropdown
                type="genre"
                title="Music Genres"
                placeholder="Search genres (e.g. Pop, Soundtrack, Hip-Hop, Classical)..."
                items={genreDropdownItems}
                selectedIds={selectedGenres}
                onToggle={handleToggleGenre}
                onRemove={handleRemoveGenre}
                minCount={4}
                maxCount={5}
                isLoading={isMetaLoading}
                idPrefix="onboarding-genre"
              />
            </motion.div>
          )}

          {/* STEP 3: Favorite Artists */}
          {step === 3 && (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
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

              {/* Shared Reusable MultiSelectSearchDropdown for Artists */}
              <MultiSelectSearchDropdown
                type="artist"
                title="Favorite Artists"
                placeholder="Search any artist (e.g. Anirudh, Arijit Singh, The Weeknd, BTS)..."
                items={suggestedArtistDropdownItems}
                selectedIds={selectedArtists.map(a => a.id || a.name)}
                selectedItems={selectedArtistDropdownItems}
                onToggle={handleToggleArtist}
                onRemove={handleRemoveArtist}
                minCount={3}
                maxCount={10}
                onSearch={searchArtistsApi}
                isLoading={isSuggestedLoading}
                idPrefix="onboarding-artist"
              />
            </motion.div>
          )}

          {/* STEP 4: Age Validation */}
          {step === 4 && (
            <motion.div
              key="step-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
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
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* ── Mandatory Dedicated Action Footer (Docked, visible at 320x568, visualViewport-aware) ── */}
      <div className="shrink-0 max-w-4xl w-full mx-auto pt-3 pb-[max(12px,env(safe-area-inset-bottom))] border-t border-white/10 flex items-center justify-between bg-[#121214]">
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
