import { useQueries, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { get, set } from "idb-keyval";
import { useEffect } from "react";

export function useHomepageData() {
  const queryClient = useQueryClient();

  const fetchSection = async (endpoint: string) => {
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const cacheKey = `homepage_cache_${path}`;

    try {
      const res = await api.get(`/homepage${path}`);
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
      queryClient.invalidateQueries({ queryKey: ['home-made-for-you'] });
      queryClient.invalidateQueries({ queryKey: ['home-top-country'] });
      queryClient.invalidateQueries({ queryKey: ['home-new-releases-lang'] });
      queryClient.invalidateQueries({ queryKey: ['home-trending-now'] });
      queryClient.invalidateQueries({ queryKey: ['home-because-you-like'] });
      queryClient.invalidateQueries({ queryKey: ['home-popular-artists-lang'] });
      queryClient.invalidateQueries({ queryKey: ['home-genre-playlists'] });
      queryClient.invalidateQueries({ queryKey: ['home-recently-played'] });
      queryClient.invalidateQueries({ queryKey: ['home-continue-listening'] });
      queryClient.invalidateQueries({ queryKey: ['home-featured'] });
    };

    window.addEventListener('zenify:track-updated', handleInvalidate);
    window.addEventListener('zenify:track-created', handleInvalidate);
    window.addEventListener('zenify:track-deleted', handleInvalidate);
    window.addEventListener('zenify:playlist-updated', handleInvalidate);

    return () => {
      window.removeEventListener('zenify:track-updated', handleInvalidate);
      window.removeEventListener('zenify:track-created', handleInvalidate);
      window.removeEventListener('zenify:track-deleted', handleInvalidate);
      window.removeEventListener('zenify:playlist-updated', handleInvalidate);
    };
  }, [queryClient]);

  const REFETCH_INTERVAL = 45 * 1000; // 45 seconds
  const STALE_TIME = 30 * 1000; // 30 seconds

  const results = useQueries({
    queries: [
      // 1. Featured Now
      {
        queryKey: ['home-featured'],
        queryFn: () => fetchSection('/featured'),
        staleTime: STALE_TIME,
        refetchInterval: REFETCH_INTERVAL,
      },
      // 2. Continue Listening (Resume progress)
      {
        queryKey: ['home-continue-listening'],
        queryFn: () => fetchSection('/continue-listening'),
        staleTime: STALE_TIME,
        refetchInterval: REFETCH_INTERVAL,
      },
      // 3. Made for you (personalized by language, genre, artist weights)
      {
        queryKey: ['home-made-for-you'],
        queryFn: () => fetchSection('/made-for-you'),
        staleTime: STALE_TIME,
        refetchInterval: REFETCH_INTERVAL,
      },
      // 4. Top songs in your country
      {
        queryKey: ['home-top-country'],
        queryFn: () => fetchSection('/top-country'),
        staleTime: STALE_TIME,
        refetchInterval: REFETCH_INTERVAL,
      },
      // 5. New releases in your languages
      {
        queryKey: ['home-new-releases-lang'],
        queryFn: () => fetchSection('/new-releases-lang'),
        staleTime: STALE_TIME,
        refetchInterval: REFETCH_INTERVAL,
      },
      // 6. Trending now
      {
        queryKey: ['home-trending-now'],
        queryFn: () => fetchSection('/trending-now'),
        staleTime: STALE_TIME,
        refetchInterval: REFETCH_INTERVAL,
      },
      // 7. Because you like [artist]
      {
        queryKey: ['home-because-you-like'],
        queryFn: () => fetchSection('/because-you-like'),
        staleTime: STALE_TIME,
        refetchInterval: REFETCH_INTERVAL,
      },
      // 8. Popular artists in your languages
      {
        queryKey: ['home-popular-artists-lang'],
        queryFn: () => fetchSection('/popular-artists-lang'),
        staleTime: STALE_TIME,
        refetchInterval: REFETCH_INTERVAL,
      },
      // 9. Top genre playlists
      {
        queryKey: ['home-genre-playlists'],
        queryFn: () => fetchSection('/genre-playlists'),
        staleTime: STALE_TIME,
        refetchInterval: REFETCH_INTERVAL,
      },
      // 10. Recently played
      {
        queryKey: ['home-recently-played'],
        queryFn: () => fetchSection('/recently-played'),
        staleTime: STALE_TIME,
        refetchInterval: REFETCH_INTERVAL,
      }
    ]
  });

  const isLoading = results.some(r => r.isLoading);
  const isError = results.every(r => r.isError);

  const sectionConfigs = [
    { type: 'featured', title: 'Featured Now', subtitle: 'TOP PICKS FROM THE EDITORIAL TEAM' },
    { type: 'continue_listening', title: 'Continue Listening', subtitle: 'JUMP BACK IN' },
    { type: 'made_for_you', title: 'Made For You', subtitle: 'BASED ON YOUR SONIC PREFERENCES' },
    { type: 'top_country', title: 'Top Songs In Your Country', subtitle: "WHAT'S BIG IN YOUR REGION" },
    { type: 'new_releases_lang', title: 'New Releases In Your Languages', subtitle: 'FRESH DROPS IN YOUR FAVORITE FREQUENCIES' },
    { type: 'trending_now', title: 'Trending Now', subtitle: 'THE PULSE OF THE COMMUNITY' },
    { type: 'because_you_like', title: 'Because You Like', subtitle: 'RECOMMENDED FOR YOU' },
    { type: 'popular_artists_lang', title: 'Popular Artists In Your Languages', subtitle: 'VOICES LEADING THE SCENE' },
    { type: 'genre_playlists', title: 'Top Genre Playlists', subtitle: 'CURATED SOUNDSCAPES FOR YOUR TASTE' },
    { type: 'recently_played', title: 'Recently Played', subtitle: 'PICK UP WHERE YOU LEFT OFF' }
  ];

  // Map results back to sections, filtering out any failed or empty sections gracefully
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
