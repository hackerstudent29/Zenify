import { useQueries } from "@tanstack/react-query";
import api from "@/lib/api";
import { get, set } from "idb-keyval";

export function useHomepageData() {
 const fetchSection = async (endpoint: string) => {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const cacheKey = `homepage_cache_${path}`;
  
  try {
    // We rely on React Query's built-in caching for memory, but for cross-session
    // or hard reloads, we manually check IndexedDB first for instant loading.
    const res = await api.get(`/homepage${path}`);
    await set(cacheKey, res.data); // Save to system cache
    return res.data;
  } catch (error) {
    // If network fails or is slow, try falling back to cache
    const cachedData = await get(cacheKey);
    if (cachedData) return cachedData;
    throw error;
  }
 };

 const REFETCH_INTERVAL = 30 * 1000; // 30 seconds
 const STALE_TIME = 30 * 1000;
 const MOODS_STALE_TIME = 10 * 60 * 1000; // 10 minutes

 const results = useQueries({
 queries: [
 {
 queryKey: ['home-featured'],
 queryFn: async () => {
   const cached = await get('homepage_cache_/featured');
   if (cached) {
     // Trigger background fetch, return cache immediately
     fetchSection('/featured').catch(console.error);
     return cached;
   }
   return fetchSection('/featured');
 },
 staleTime: STALE_TIME,
 refetchInterval: REFETCH_INTERVAL,
 },
 {
 queryKey: ['home-continue-listening'],
 queryFn: async () => {
   const cached = await get('homepage_cache_/continue-listening');
   if (cached) { fetchSection('/continue-listening').catch(console.error); return cached; }
   return fetchSection('/continue-listening');
 },
 staleTime: STALE_TIME,
 refetchInterval: REFETCH_INTERVAL,
 },
 {
 queryKey: ['home-recently-played'],
 queryFn: async () => {
   const cached = await get('homepage_cache_/recently-played');
   if (cached) { fetchSection('/recently-played').catch(console.error); return cached; }
   return fetchSection('/recently-played');
 },
 staleTime: STALE_TIME,
 refetchInterval: REFETCH_INTERVAL,
 },
 {
 queryKey: ['home-new-arrivals'],
 queryFn: async () => {
   const cached = await get('homepage_cache_/new-arrivals');
   if (cached) { fetchSection('/new-arrivals').catch(console.error); return cached; }
   return fetchSection('/new-arrivals');
 },
 staleTime: STALE_TIME,
 refetchInterval: REFETCH_INTERVAL,
 },
 {
 queryKey: ['home-trending'],
 queryFn: async () => {
   const cached = await get('homepage_cache_/trending');
   if (cached) { fetchSection('/trending').catch(console.error); return cached; }
   return fetchSection('/trending');
 },
 staleTime: STALE_TIME,
 refetchInterval: REFETCH_INTERVAL,
 },
 {
 queryKey: ['home-moods'],
 queryFn: async () => {
   const cached = await get('homepage_cache_/moods');
   if (cached) { fetchSection('/moods').catch(console.error); return cached; }
   return fetchSection('/moods');
 },
 staleTime: MOODS_STALE_TIME,
 // Moods are static, no need to refetch every 30s
 },
 {
 queryKey: ['home-recommendations'],
 queryFn: async () => {
   const cached = await get('homepage_cache_/recommendations');
   if (cached) { fetchSection('/recommendations').catch(console.error); return cached; }
   return fetchSection('/recommendations');
 },
 staleTime: STALE_TIME,
 refetchInterval: REFETCH_INTERVAL,
 },
 {
 queryKey: ['home-top-artists'],
 queryFn: async () => {
   const cached = await get('homepage_cache_/top-artists');
   if (cached) { fetchSection('/top-artists').catch(console.error); return cached; }
   return fetchSection('/top-artists');
 },
 staleTime: STALE_TIME,
 refetchInterval: REFETCH_INTERVAL,
 },
 {
 queryKey: ['home-top-albums'],
 queryFn: async () => {
   const cached = await get('homepage_cache_/top-albums');
   if (cached) { fetchSection('/top-albums').catch(console.error); return cached; }
   return fetchSection('/top-albums');
 },
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
