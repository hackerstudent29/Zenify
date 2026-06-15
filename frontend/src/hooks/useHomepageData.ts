import { useQueries } from "@tanstack/react-query";
import api from "@/lib/api";

export function useHomepageData() {
 const fetchSection = async (endpoint: string) => {
 const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
 const res = await api.get(`/homepage${path}`);
 return res.data;
 };

 const REFETCH_INTERVAL = 30 * 1000; // 30 seconds
 const STALE_TIME = 30 * 1000;
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
 // Moods are static, no need to refetch every 30s
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
