import { useQueries, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { get, set } from "idb-keyval";
import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";

function getRecentArtistsFromClient(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('zenify_recently_played_tracks');
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    const artists: string[] = [];
    for (const t of list) {
      const name = t?.artist?.name || t?.artistName || (typeof t?.artist === 'string' ? t.artist : null);
      if (name && typeof name === 'string') {
        const clean = name.trim();
        if (clean && !artists.includes(clean)) {
          artists.push(clean);
        }
      }
    }
    return artists.slice(0, 6);
  } catch {
    return [];
  }
}

export function useHomepageData() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id || 'guest';
  const localLang = typeof window !== 'undefined' ? (localStorage.getItem('zenify_selected_language') || localStorage.getItem('zenify_selected_lang')) : null;
  const localCountry = typeof window !== 'undefined' ? localStorage.getItem('zenify_selected_country') : null;

  const LANG_CODE_TO_NAME: Record<string, string> = {
    ta: 'Tamil',
    te: 'Telugu',
    hi: 'Hindi',
    ml: 'Malayalam',
    kn: 'Kannada',
    en: 'English',
    pa: 'Punjabi',
    bn: 'Bengali'
  };

  const prefLang = user?.preferences?.languages?.[0];
  const resolvedPrefName = prefLang ? (LANG_CODE_TO_NAME[prefLang.toLowerCase()] || prefLang) : null;

  const rawLang = resolvedPrefName ||
                  (user as any)?.preferences?.selectedLanguageName ||
                  localLang ||
                  (user as any)?.preferences?.selectedLanguageCode ||
                  'Tamil';

  const userLang = (LANG_CODE_TO_NAME[rawLang.toLowerCase()] || rawLang).trim();

  // Purge any stale client localStorage if user preferences explicitly specify language
  useEffect(() => {
    if (resolvedPrefName && typeof window !== 'undefined') {
      const currentStored = localStorage.getItem('zenify_selected_language');
      if (currentStored !== resolvedPrefName) {
        localStorage.setItem('zenify_selected_language', resolvedPrefName);
        localStorage.setItem('zenify_selected_lang', resolvedPrefName);
      }
    }
  }, [resolvedPrefName]);

  const rawCountry = user?.country?.trim() || localCountry || 'India';
  const userCountry = rawCountry.trim();

  const fetchSection = async (endpoint: string) => {
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const recentArtists = getRecentArtistsFromClient();
    const cacheKey = `homepage_cache_v5_${userId}_${path}_${recentArtists.slice(0, 2).join('_')}`;

    try {
      const res = await api.get(`/homepage${path}`, {
        headers: {
          'x-user-language': userLang,
          'x-user-country': userCountry,
          'x-user-recent-artists': recentArtists.join(',')
        }
      });
      if (res.data) {
        await set(cacheKey, res.data); // Save fresh data to local cache
      }
      return res.data;
    } catch (error) {
      // If network fails or is rate-limited, gracefully fall back to offline cache
      try {
        const cachedData = await get(cacheKey);
        if (cachedData) return cachedData;
      } catch {}
      console.warn(`[Homepage] Section ${endpoint} failed, falling back to empty shelf:`, error);
      return null;
    }
  };

  // Listen for real-time track and playlist updates across the application
  useEffect(() => {
    const handleInvalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['home-continue-listening'] });
      queryClient.invalidateQueries({ queryKey: ['home-made-for-you'] });
      queryClient.invalidateQueries({ queryKey: ['home-popular-artists-lang'] });
      queryClient.invalidateQueries({ queryKey: ['home-trending-now'] });
      queryClient.invalidateQueries({ queryKey: ['home-genre-playlists'] });
    };

    const handleCountryLangChanged = () => {
      queryClient.invalidateQueries({ queryKey: ['home-made-for-you'] });
      queryClient.invalidateQueries({ queryKey: ['home-trending-now'] });
      queryClient.invalidateQueries({ queryKey: ['home-popular-artists-lang'] });
      queryClient.invalidateQueries({ queryKey: ['home-genre-playlists'] });
    };

    const handleTrackPlayed = () => {
      queryClient.invalidateQueries({ queryKey: ['home-continue-listening'] });
      queryClient.invalidateQueries({ queryKey: ['home-made-for-you'] });
      queryClient.invalidateQueries({ queryKey: ['home-popular-artists-lang'] });
      queryClient.invalidateQueries({ queryKey: ['home-trending-now'] });
      queryClient.invalidateQueries({ queryKey: ['home-genre-playlists'] });
    };

    window.addEventListener('zenify:track-updated', handleInvalidate);
    window.addEventListener('zenify:track-created', handleInvalidate);
    window.addEventListener('zenify:track-deleted', handleInvalidate);
    window.addEventListener('zenify:track-played', handleTrackPlayed);
    window.addEventListener('zenify:playlist-updated', handleInvalidate);
    window.addEventListener('zenify:preferences-updated', handleInvalidate);
    window.addEventListener('zenify:country-language-changed', handleCountryLangChanged);

    return () => {
      window.removeEventListener('zenify:track-updated', handleInvalidate);
      window.removeEventListener('zenify:track-created', handleInvalidate);
      window.removeEventListener('zenify:track-deleted', handleInvalidate);
      window.removeEventListener('zenify:track-played', handleTrackPlayed);
      window.removeEventListener('zenify:playlist-updated', handleInvalidate);
      window.removeEventListener('zenify:preferences-updated', handleInvalidate);
      window.removeEventListener('zenify:country-language-changed', handleCountryLangChanged);
    };
  }, [queryClient]);

  const REFETCH_INTERVAL = false as const;
  const STALE_TIME = 3 * 60 * 1000; // 3 minutes fresh cache

  const results = useQueries({
    queries: [
      // 1. Song Section 1: Continue Listening (Tracks user listened to)
      {
        queryKey: ['home-continue-listening', userId],
        queryFn: async () => {
          const res = await fetchSection('/continue-listening');
          if (res?.items && res.items.length > 0) {
            return res;
          }
          // Fall back to local recently played tracks if remote has no history yet
          try {
            if (typeof window !== 'undefined') {
              const raw = localStorage.getItem('zenify_recently_played_tracks');
              if (raw) {
                const localTracks = JSON.parse(raw);
                if (Array.isArray(localTracks) && localTracks.length > 0) {
                  return {
                    type: 'continue_listening',
                    title: 'Continue Listening',
                    subtitle: 'JUMP BACK IN',
                    items: localTracks.slice(0, 10)
                  };
                }
              }
            }
          } catch (e) {}
          return res;
        },
        staleTime: STALE_TIME,
        refetchInterval: REFETCH_INTERVAL,
      },
      // 2. Song Section 2: Made for You (Personalized songs based on user listening)
      {
        queryKey: ['home-made-for-you', userId, userLang, userCountry],
        queryFn: () => fetchSection(`/made-for-you?language=${encodeURIComponent(userLang)}&country=${encodeURIComponent(userCountry)}`),
        staleTime: STALE_TIME,
        refetchInterval: REFETCH_INTERVAL,
      },
      // 3. Artists Section: Artists You May Like / Popular Artists (Matching listening context)
      {
        queryKey: ['home-popular-artists-lang', userId, userLang, userCountry],
        queryFn: () => fetchSection(`/popular-artists-lang?language=${encodeURIComponent(userLang)}&country=${encodeURIComponent(userCountry)}`),
        staleTime: STALE_TIME,
        refetchInterval: REFETCH_INTERVAL,
      },
      // 4. Song Section 3: Trending Hits (Top trending tracks in user's taste and language)
      {
        queryKey: ['home-trending-now', userId, userLang, userCountry],
        queryFn: () => fetchSection(`/trending-now?language=${encodeURIComponent(userLang)}&country=${encodeURIComponent(userCountry)}`),
        staleTime: STALE_TIME,
        refetchInterval: REFETCH_INTERVAL,
      },
      // 5. Albums Section: Top Albums for You (Authentic albums from listened artists & language)
      {
        queryKey: ['home-genre-playlists', userId, userLang, userCountry],
        queryFn: () => fetchSection(`/genre-playlists?language=${encodeURIComponent(userLang)}&country=${encodeURIComponent(userCountry)}`),
        staleTime: STALE_TIME,
        refetchInterval: REFETCH_INTERVAL,
      }
    ]
  });

  const isLoading = results.some(r => r.isLoading);
  const isError = results.every(r => r.isError);

  const sectionConfigs = [
    { type: 'continue_listening', title: 'Continue Listening', subtitle: 'JUMP BACK IN' },
    { type: 'made_for_you', title: 'Made For You', subtitle: 'BASED ON YOUR LISTENING' },
    { type: 'popular_artists_lang', title: 'Artists You May Like', subtitle: 'VOICES FROM YOUR FREQUENCIES' },
    { type: 'trending_now', title: 'Trending Hits', subtitle: 'THE PULSE OF YOUR MUSIC' },
    { type: 'genre_playlists', title: 'Top Albums for You', subtitle: 'ALBUMS MATCHING YOUR TASTE' }
  ];

  const sections = results.map((r, index) => {
    const config = sectionConfigs[index];
    if (!r.data) {
      return {
        type: config.type,
        title: config.title,
        subtitle: config.subtitle,
        items: [],
        isLoading: r.isLoading
      };
    }

    return {
      type: r.data.type || config.type,
      title: r.data.title || config.title,
      subtitle: r.data.subtitle || config.subtitle,
      items: r.data.items || [],
      isLoading: false
    };
  });

  return {
    sections,
    isLoading,
    isError,
    refetchAll: () => results.forEach(r => r.refetch())
  };
}
