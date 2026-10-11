"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import {
  Search,
  X,
  Check,
  ChevronDown,
  Globe,
  Music2,
  Sparkles,
  RotateCcw,
  AlertCircle,
  Loader2,
  SlidersHorizontal
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

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

export function PreferencesSection() {
  const { user, updateUser } = useAuthStore();
  const queryClient = useQueryClient();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Metadata
  const [languagesList, setLanguagesList] = useState<LanguageItem[]>([]);
  const [countriesList, setCountriesList] = useState<CountryItem[]>([]);
  const [genresList, setGenresList] = useState<string[]>([]);

  // User Preferences Form State
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('India');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedArtists, setSelectedArtists] = useState<ArtistItem[]>([]);
  const [age, setAge] = useState<string>('21');

  // Search & Filters
  const [langSearch, setLangSearch] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);

  // Artist Search
  const [artistQuery, setArtistQuery] = useState('');
  const [artistSearchResults, setArtistSearchResults] = useState<ArtistItem[]>([]);
  const [isArtistSearching, setIsArtistSearching] = useState(false);
  const [isArtistDropdownOpen, setIsArtistDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchAbortRef = useRef<AbortController | null>(null);

  // Reset Personalization Modal
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  // Load Metadata & Current Preferences
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setIsLoading(true);
      try {
        const [metaRes, prefRes] = await Promise.all([
          api.get('/preferences/metadata'),
          api.get('/preferences')
        ]);

        if (isMounted) {
          if (metaRes.data) {
            setLanguagesList(metaRes.data.languages || []);
            setCountriesList(metaRes.data.countries || []);
            setGenresList(metaRes.data.genres || []);
          }

          if (prefRes.data) {
            setSelectedLanguages(prefRes.data.languages || []);
            setSelectedCountry(prefRes.data.country || user?.country || 'India');
            setSelectedGenres(prefRes.data.preferredGenres || []);
            setSelectedArtists(prefRes.data.favoriteArtists || []);
            setAge(String(prefRes.data.age || user?.age || '21'));
          }
        }
      } catch (err) {
        console.error('Failed to load preferences:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [user]);

  // Artist Live Search Debounce
  useEffect(() => {
    if (!artistQuery.trim()) {
      setArtistSearchResults([]);
      setIsArtistSearching(false);
      setIsArtistDropdownOpen(false);
      return;
    }

    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setIsArtistSearching(true);
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
        }
      } finally {
        setIsArtistSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [artistQuery]);

  const toggleLanguage = (code: string) => {
    if (selectedLanguages.includes(code)) {
      if (selectedLanguages.length > 1) {
        setSelectedLanguages(selectedLanguages.filter(c => c !== code));
      }
    } else {
      if (selectedLanguages.length < 5) {
        setSelectedLanguages([...selectedLanguages, code]);
      }
    }
  };

  const toggleGenre = (genre: string) => {
    if (selectedGenres.includes(genre)) {
      if (selectedGenres.length > 4) {
        setSelectedGenres(selectedGenres.filter(g => g !== genre));
      }
    } else {
      if (selectedGenres.length < 5) {
        setSelectedGenres([...selectedGenres, genre]);
      }
    }
  };

  const toggleArtist = (artist: ArtistItem) => {
    const exists = selectedArtists.some(a => a.name.toLowerCase() === artist.name.toLowerCase());
    if (exists) {
      if (selectedArtists.length > 3) {
        setSelectedArtists(selectedArtists.filter(a => a.name.toLowerCase() !== artist.name.toLowerCase()));
      }
    } else {
      if (selectedArtists.length < 10) {
        setSelectedArtists([...selectedArtists, artist]);
      }
    }
  };

  const filteredLanguages = useMemo(() => {
    if (!langSearch.trim()) return languagesList;
    const q = langSearch.toLowerCase();
    return languagesList.filter(
      l => l.name.toLowerCase().includes(q) || l.nativeName.toLowerCase().includes(q)
    );
  }, [languagesList, langSearch]);

  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return countriesList;
    const q = countrySearch.toLowerCase();
    return countriesList.filter(
      c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [countriesList, countrySearch]);

  // Save Preferences
  const handleSave = async () => {
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum < 13 || ageNum > 100) {
      setErrorMessage('Please enter a valid age between 13 and 100.');
      return;
    }
    if (selectedLanguages.length < 1 || selectedLanguages.length > 5) {
      setErrorMessage('Please select between 1 and 5 languages.');
      return;
    }
    if (selectedGenres.length < 4 || selectedGenres.length > 5) {
      setErrorMessage('Please select between 4 and 5 genres.');
      return;
    }
    if (selectedArtists.length < 3 || selectedArtists.length > 10) {
      setErrorMessage('Please select between 3 and 10 favorite artists.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const payload = {
        languages: selectedLanguages,
        preferredGenres: selectedGenres,
        favoriteArtists: selectedArtists,
        country: selectedCountry,
        age: ageNum
      };

      await api.put('/preferences', payload);

      updateUser({
        country: selectedCountry,
        age: ageNum,
        preferences: {
          ...(user?.preferences || {}),
          languages: selectedLanguages,
          preferredGenres: selectedGenres,
          favoriteArtists: selectedArtists
        }
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);

      // Instantly refresh Home recommendations
      queryClient.invalidateQueries({ queryKey: ['home-made-for-you'] });
      queryClient.invalidateQueries({ queryKey: ['home-featured'] });
      queryClient.invalidateQueries({ queryKey: ['home-recommendations'] });
    } catch (err: any) {
      console.error('Failed to update preferences:', err);
      setErrorMessage(err.response?.data?.message || 'Failed to save preferences.');
    } finally {
      setIsSaving(false);
    }
  };

  // Reset Personalization (Privacy)
  const handleResetPersonalization = async () => {
    setIsResetting(true);
    try {
      await api.post('/activity/reset');
      setResetSuccess(true);
      setIsResetDialogOpen(false);
      setTimeout(() => setResetSuccess(false), 4000);
      queryClient.invalidateQueries();
    } catch (err) {
      console.error('Failed to reset personalization:', err);
    } finally {
      setIsResetting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3 text-zinc-500 text-xs">
        <Loader2 className="w-6 h-6 text-brand animate-spin" />
        <span>Loading your taste profile...</span>
      </div>
    );
  }

  return (
    <section className="space-y-6 max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black font-oswald uppercase tracking-tight text-white mb-1">
            Music Preferences
          </h2>
          <p className="text-zinc-400 text-xs sm:text-sm font-libre font-medium">
            Fine-tune the frequencies that shape your recommendations, discover feeds, and search priority.
          </p>
        </div>

        {/* Reset Personalization Button */}
        <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="h-10 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2 cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5 text-brand" />
              Reset Personalization
            </button>
          </DialogTrigger>
          <DialogContent className="bg-[#18181B] border border-white/10 text-white max-w-sm rounded-2xl p-6">
            <DialogHeader className="space-y-2 text-center items-center">
              <div className="w-12 h-12 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
                <RotateCcw className="w-6 h-6" />
              </div>
              <DialogTitle className="text-lg font-black font-oswald uppercase tracking-wide">
                Reset Personalization
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-400 font-libre">
                This will erase your computed interest profile, AI mood tags, and all recorded activity history. Your saved preferences will stay intact as a clean baseline.
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-3 mt-4">
              <button
                type="button"
                onClick={() => setIsResetDialogOpen(false)}
                className="flex-1 h-10 rounded-xl bg-zinc-800 text-xs font-bold font-oswald uppercase tracking-wider text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetPersonalization}
                disabled={isResetting}
                className="flex-1 h-10 rounded-xl bg-brand hover:bg-brand/90 text-white text-xs font-bold font-oswald uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isResetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirm Reset'}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {resetSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-libre flex items-center gap-2.5">
          <Check className="w-4 h-4 shrink-0" />
          <span>Personalization history reset successfully. Your feeds have returned to a pristine state.</span>
        </div>
      )}

      <div className="bg-[#18181B] p-6 md:p-8 rounded-[2rem] border border-white/5 space-y-8">
        {/* 1. Languages */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black font-oswald uppercase tracking-wider text-white">
                Music Languages
              </h3>
              <p className="text-[11px] text-zinc-400 font-libre">
                Select 1 to 5 languages. Featured first across Home & Search.
              </p>
            </div>
            <span className="text-xs font-libre font-bold text-brand">
              {selectedLanguages.length}/5 Selected
            </span>
          </div>

          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
            <input
              type="text"
              value={langSearch}
              onChange={e => setLangSearch(e.target.value)}
              placeholder="Search languages..."
              className="w-full h-10 pl-10 pr-4 bg-zinc-900 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1 bg-zinc-900/40 rounded-xl border border-white/5">
            {filteredLanguages.map(lang => {
              const isSelected = selectedLanguages.includes(lang.code);
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => toggleLanguage(lang.code)}
                  className={cn(
                    "p-2.5 rounded-xl border text-left text-xs transition-all active:scale-95 cursor-pointer flex items-center justify-between",
                    isSelected
                      ? "bg-brand/15 border-brand text-white font-bold"
                      : "bg-zinc-900/80 border-white/5 text-zinc-300 hover:border-white/20"
                  )}
                >
                  <span className="truncate">{lang.name}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-brand shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Country & Age */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-white/5">
          <div className="space-y-2">
            <label className="text-xs font-black font-oswald uppercase tracking-wider text-white flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-brand" />
              Country (ISO 3166)
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                className="w-full h-11 px-4 bg-zinc-900 border border-white/10 rounded-xl text-left text-xs sm:text-sm text-white flex items-center justify-between hover:border-white/20"
              >
                <span>{selectedCountry}</span>
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
                  <div className="overflow-y-auto space-y-1 flex-1">
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
                          "w-full px-3 py-2 text-left rounded-lg text-xs flex items-center justify-between",
                          selectedCountry === c.name ? "bg-brand/20 text-brand font-bold" : "text-zinc-300 hover:bg-white/5"
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

          <div className="space-y-2">
            <label className="text-xs font-black font-oswald uppercase tracking-wider text-white">
              Age (13–100)
            </label>
            <input
              type="number"
              min="13"
              max="100"
              value={age}
              onChange={e => setAge(e.target.value)}
              className="w-full h-11 px-4 bg-zinc-900 border border-white/10 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-brand font-bold"
            />
          </div>
        </div>

        {/* 3. Genres */}
        <div className="space-y-4 pt-4 border-t border-white/5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black font-oswald uppercase tracking-wider text-white">
                Music Genres
              </h3>
              <p className="text-[11px] text-zinc-400 font-libre">Select 4 to 5 genres.</p>
            </div>
            <span className="text-xs font-libre font-bold text-brand">
              {selectedGenres.length}/5 Selected
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {genresList.map(genre => {
              const isSelected = selectedGenres.includes(genre);
              return (
                <button
                  key={genre}
                  type="button"
                  onClick={() => toggleGenre(genre)}
                  className={cn(
                    "p-3 rounded-xl border text-left text-xs transition-all active:scale-95 cursor-pointer flex items-center justify-between",
                    isSelected
                      ? "bg-brand/15 border-brand text-white font-bold"
                      : "bg-zinc-900 border-white/5 text-zinc-300 hover:border-white/20"
                  )}
                >
                  <span className="truncate">{genre}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-brand shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Favorite Artists */}
        <div className="space-y-4 pt-4 border-t border-white/5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black font-oswald uppercase tracking-wider text-white">
                Favorite Artists
              </h3>
              <p className="text-[11px] text-zinc-400 font-libre">Select 3 to 10 artists.</p>
            </div>
            <span className="text-xs font-libre font-bold text-brand">
              {selectedArtists.length}/10 Selected
            </span>
          </div>

          {/* Selected Artist Chips */}
          {selectedArtists.length > 0 && (
            <div className="flex flex-wrap gap-2 p-2 bg-zinc-900/60 rounded-xl border border-white/5 max-h-36 overflow-y-auto">
              {selectedArtists.map(a => (
                <div
                  key={a.id || a.name}
                  className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-full bg-zinc-800 border border-white/10 text-white text-xs"
                >
                  <img
                    src={a.image}
                    alt={a.name}
                    className="w-6 h-6 rounded-full object-cover shrink-0"
                    onError={e => {
                      (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(a.name)}&background=18181b&color=e11d48`;
                    }}
                  />
                  <span className="font-medium text-xs truncate max-w-[120px]">{a.name}</span>
                  <button
                    type="button"
                    onClick={() => toggleArtist(a)}
                    className="text-zinc-400 hover:text-brand transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Artist Search Dropdown */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
            <input
              type="text"
              value={artistQuery}
              onChange={e => setArtistQuery(e.target.value)}
              placeholder="Search and add artists..."
              className="w-full h-11 pl-10 pr-10 bg-zinc-900 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand"
            />
            {isArtistSearching && (
              <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand w-4 h-4 animate-spin" />
            )}

            {isArtistDropdownOpen && (
              <div className="absolute z-50 left-0 right-0 mt-2 bg-zinc-900 border border-white/15 rounded-2xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
                {artistSearchResults.map(artist => {
                  const isSelected = selectedArtists.some(a => a.name.toLowerCase() === artist.name.toLowerCase());
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
                        "w-full px-4 py-2.5 flex items-center justify-between text-left transition-colors border-b border-white/5 last:border-none hover:bg-white/5",
                        isSelected && "bg-brand/10 text-brand"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={artist.image}
                          alt={artist.name}
                          className="w-8 h-8 rounded-full object-cover shrink-0"
                          onError={e => {
                            (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(artist.name)}&background=18181b&color=e11d48`;
                          }}
                        />
                        <span className="text-xs font-bold text-white">{artist.name}</span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-brand shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Action Controls */}
        <div className="pt-4 border-t border-white/5 flex items-center justify-between">
          {saveSuccess ? (
            <span className="text-xs text-emerald-400 font-bold flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-400" />
              Preferences updated! Home recommendations refreshed.
            </span>
          ) : <div />}

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="h-10 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
                Saving...
              </>
            ) : (
              <>
                Save Preferences
                <Check className="w-3.5 h-3.5 text-brand" />
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
