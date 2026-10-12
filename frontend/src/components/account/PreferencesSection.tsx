"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import {
  Check,
  ChevronDown,
  Globe,
  RotateCcw,
  AlertCircle,
  Loader2,
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

  // Country Search & Dropdown
  const [countrySearch, setCountrySearch] = useState('');
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);

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

  // Live Artist Search API
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

  // Handlers for MultiSelectSearchDropdown
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

  // Filtered countries
  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return countriesList;
    const q = countrySearch.toLowerCase();
    return countriesList.filter(
      c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [countriesList, countrySearch]);

  // Save Preferences
  const handleSave = async () => {
    setErrorMessage(null);
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum < 13 || ageNum > 100) {
      setErrorMessage('Age must be between 13 and 100.');
      return;
    }

    if (selectedLanguages.length < 1 || selectedLanguages.length > 5) {
      setErrorMessage('Please select between 1 and 5 music languages.');
      return;
    }

    if (selectedGenres.length < 4 || selectedGenres.length > 5) {
      setErrorMessage('Please select between 4 and 5 music genres.');
      return;
    }

    if (selectedArtists.length < 3 || selectedArtists.length > 10) {
      setErrorMessage('Please select between 3 and 10 favorite artists.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        languages: selectedLanguages,
        preferredGenres: selectedGenres,
        favoriteArtists: selectedArtists.map(a => ({
          id: a.id,
          name: a.name,
          image: a.image,
          source: a.source || 'profile'
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
          languages: selectedLanguages,
          preferredGenres: selectedGenres,
          favoriteArtists: selectedArtists
        }
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);

      queryClient.invalidateQueries({ queryKey: ['home-made-for-you'] });
      queryClient.invalidateQueries({ queryKey: ['home-featured'] });
      queryClient.invalidateQueries({ queryKey: ['home-top-country'] });
      queryClient.invalidateQueries({ queryKey: ['home-new-releases-lang'] });
      queryClient.invalidateQueries({ queryKey: ['home-trending-now'] });
      queryClient.invalidateQueries({ queryKey: ['home-popular-artists-lang'] });
      queryClient.invalidateQueries({ queryKey: ['home-genre-playlists'] });
      queryClient.invalidateQueries({ queryKey: ['home-recently-played'] });
      window.dispatchEvent(new CustomEvent('zenify:preferences-updated'));
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

  // Prepare Dropdown item structures
  const languageDropdownItems: DropdownItem[] = languagesList.map(l => ({
    id: l.code,
    name: l.name,
    nativeName: l.nativeName
  }));

  const genreDropdownItems: DropdownItem[] = genresList.map(g => ({
    id: g,
    name: g
  }));

  const selectedArtistDropdownItems: DropdownItem[] = selectedArtists.map(a => ({
    id: a.id || a.name,
    name: a.name,
    image: a.image
  }));

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
                className="flex-1 h-10 rounded-xl bg-zinc-800 text-xs font-bold font-oswald uppercase tracking-wider text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetPersonalization}
                disabled={isResetting}
                className="flex-1 h-10 rounded-xl bg-brand hover:bg-brand/90 text-white text-xs font-bold font-oswald uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
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
        {/* 1. Shared MultiSelectSearchDropdown for Languages */}
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
          idPrefix="pref-lang"
        />

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
                className="w-full h-11 px-4 bg-zinc-900 border border-white/10 rounded-xl text-left text-xs sm:text-sm text-white flex items-center justify-between hover:border-white/20 cursor-pointer"
              >
                <span>{selectedCountry}</span>
                <ChevronDown className={cn("w-4 h-4 text-zinc-400 transition-transform", isCountryDropdownOpen && "rotate-180")} />
              </button>

              {isCountryDropdownOpen && (
                <div className="absolute z-50 left-0 right-0 mt-2 bg-[#18181B] border border-white/10 rounded-xl shadow-2xl p-2 space-y-2 max-h-60 overflow-hidden flex flex-col">
                  <input
                    type="text"
                    value={countrySearch}
                    onChange={e => setCountrySearch(e.target.value)}
                    placeholder="Search country..."
                    className="w-full h-9 px-3 bg-zinc-900 border border-white/10 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand"
                    autoFocus
                  />
                  <div className="overflow-y-auto space-y-1 flex-1 pr-1">
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
                          "w-full px-3 py-2 text-left rounded-lg text-xs flex items-center justify-between cursor-pointer",
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

        {/* 3. Shared MultiSelectSearchDropdown for Genres */}
        <div className="pt-4 border-t border-white/5">
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
            idPrefix="pref-genre"
          />
        </div>

        {/* 4. Shared MultiSelectSearchDropdown for Favorite Artists */}
        <div className="pt-4 border-t border-white/5">
          <MultiSelectSearchDropdown
            type="artist"
            title="Favorite Artists"
            placeholder="Search and add artists (e.g. A.R. Rahman, Anirudh, BTS)..."
            items={[]}
            selectedIds={selectedArtists.map(a => a.id || a.name)}
            selectedItems={selectedArtistDropdownItems}
            onToggle={handleToggleArtist}
            onRemove={handleRemoveArtist}
            minCount={3}
            maxCount={10}
            onSearch={searchArtistsApi}
            idPrefix="pref-artist"
          />
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
