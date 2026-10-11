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
      await set(cacheKey, res.data); // Save fresh data to local cache
      return res.data;
    } catch (error) {
      // If network fails or is slow, fall back to offline cache
      const cachedData = await get(cacheKey);
      if (cachedData) return cachedData;
      throw error;
    }
  };

  // Listen for real-time track and playlist updates across the application
  useEffect(() => {
    const handleInvalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['home-featured'] });
      queryClient.invalidateQueries({ queryKey: ['home-continue-listening'] });
      queryClient.invalidateQueries({ queryKey: ['home-recently-played'] });
      queryClient.invalidateQueries({ queryKey: ['home-new-arrivals'] });
      queryClient.invalidateQueries({ queryKey: ['home-trending'] });
      queryClient.invalidateQueries({ queryKey: ['home-recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['home-top-artists'] });
      queryClient.invalidateQueries({ queryKey: ['home-top-albums'] });
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

  const REFETCH_INTERVAL = 30 * 1000; // 30 seconds
  const STALE_TIME = 15 * 1000; // 15 seconds
  const MOODS_STALE_TIME = 10 * 60 * 1000; // 10 minutes

  const results = useQueries({
    queries: [
      {
        queryKey: ['home-featured'],
        queryFn: () => fetchSection('/featured'),
        staleTime: STALE_TIME,
        refetchInterval: REFETCH_INTERVAL,
      },
      {
        queryKey: ['home-continue-listening'],
        queryFn: () => fetchSection('/continue-listening'),
        staleTime: STALE_TIME,
        refetchInterval: REFETCH_INTERVAL,
      },
      {
        queryKey: ['home-recently-played'],
        queryFn: () => fetchSection('/recently-played'),
        staleTime: STALE_TIME,
        refetchInterval: REFETCH_INTERVAL,
      },
      {
        queryKey: ['home-new-arrivals'],
        queryFn: () => fetchSection('/new-arrivals'),
        staleTime: STALE_TIME,
        refetchInterval: REFETCH_INTERVAL,
      },
      {
        queryKey: ['home-trending'],
        queryFn: () => fetchSection('/trending'),
        staleTime: STALE_TIME,
        refetchInterval: REFETCH_INTERVAL,
      },
      {
        queryKey: ['home-moods'],
        queryFn: () => fetchSection('/moods'),
        staleTime: MOODS_STALE_TIME,
      },
      {
        queryKey: ['home-recommendations'],
        queryFn: () => fetchSection('/recommendations'),
        staleTime: STALE_TIME,
        refetchInterval: REFETCH_INTERVAL,
      },
      {
        queryKey: ['home-top-artists'],
        queryFn: () => fetchSection('/top-artists'),
        staleTime: STALE_TIME,
        refetchInterval: REFETCH_INTERVAL,
      },
      {
        queryKey: ['home-top-albums'],
        queryFn: () => fetchSection('/top-albums'),
        staleTime: STALE_TIME,
        refetchInterval: REFETCH_INTERVAL,
      }
    ]
  });

  const isLoading = results.some(r => r.isLoading);
  const isError = results.some(r => r.isError);

  // Map the results back to sections array in exact stable order
  const sections = results.map((r, index) => {
    const types = [
      'featured', 'continue_listening', 'recently_played', 'new', 
      'trending', 'moods', 'personalized', 'top_artists', 'top_albums'
    ];
    const titles = [
      'Featured Now', 'Continue Listening', 'Recently Played', 'New Arrivals',
      'Trending & Charts', 'Browse By Mood', 'Made For You', 'Top Artists', 'Top Albums'
    ];
    const subtitles = [
      'TOP PICKS FROM THE EDITORIAL TEAM', 'JUMP BACK IN', 'PICK UP WHERE YOU LEFT OFF', 'FRESHLY PRESSED FROM THE STUDIO',
      'THE PULSE OF THE COMMUNITY', 'EXPLORE DIFFERENT FREQUENCIES', 'BASED ON YOUR SONIC PREFERENCES', 'THE MOST STREAMED VOICES', 'MASTERPIECES FROM THE ARCHIVE'
    ];

    if (!r.data) {
      return {
        type: types[index],
        title: titles[index],
        subtitle: subtitles[index],
        items: [],
        isLoading: r.isLoading
      };
    }

    return {
      ...r.data,
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
