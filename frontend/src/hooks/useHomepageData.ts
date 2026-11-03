import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useEffect, useMemo } from "react";
import { useAuthStore } from "@/store/authStore";

const GUEST_LANG_KEY = "zenify_guest_languages";

function getClientLanguages(userLanguages?: string[]): string[] {
  if (userLanguages && userLanguages.length > 0) {
    return userLanguages;
  }

  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(GUEST_LANG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}

    // Fallback: detect from browser language without hardcoding country defaults
    try {
      const browserCode = (navigator.language || "en").split("-")[0].toLowerCase();
      const codeMap: Record<string, string> = {
        ta: "tamil",
        te: "telugu",
        hi: "hindi",
        en: "english",
        pa: "punjabi",
        ml: "malayalam",
        kn: "kannada",
        bn: "bengali",
        mr: "marathi",
        gu: "gujarati",
        es: "spanish",
        fr: "french",
        ur: "urdu",
        bho: "bhojpuri",
      };
      if (codeMap[browserCode]) {
        return [codeMap[browserCode]];
      }
    } catch {}
  }

  return ["english"];
}

export function useHomepageData() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id || "guest";

  const selectedLanguages = useMemo(() => {
    return getClientLanguages(user?.preferences?.languages);
  }, [user?.preferences?.languages]);

  const sortedLangKey = [...selectedLanguages].sort().join("-");

  const {
    data,
    isLoading,
    isError,
    refetch
  } = useQuery({
    queryKey: ["home-feed", userId, sortedLangKey],
    queryFn: async () => {
      const res = await api.get("/homepage/feed", {
        params: {
          languages: selectedLanguages.join(",")
        },
        headers: {
          "x-user-languages": selectedLanguages.join(",")
        }
      });
      return res.data;
    },
    staleTime: 3 * 60 * 1000, // 3 minutes fresh cache
    refetchOnWindowFocus: false,
  });

  // Listen for real-time preferences and playback updates across the application
  useEffect(() => {
    let trackPlayedTimeout: any = null;

    const handleInvalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["home-feed"] });
    };

    const handleTrackPlayed = () => {
      if (trackPlayedTimeout) clearTimeout(trackPlayedTimeout);
      trackPlayedTimeout = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["home-feed"] });
      }, 2500);
    };

    window.addEventListener("zenify:track-created", handleInvalidate);
    window.addEventListener("zenify:track-deleted", handleInvalidate);
    window.addEventListener("zenify:track-played", handleTrackPlayed);
    window.addEventListener("zenify:playlist-updated", handleInvalidate);
    window.addEventListener("zenify:preferences-updated", handleInvalidate);
    window.addEventListener("zenify:country-language-changed", handleInvalidate);

    return () => {
      if (trackPlayedTimeout) clearTimeout(trackPlayedTimeout);
      window.removeEventListener("zenify:track-created", handleInvalidate);
      window.removeEventListener("zenify:track-deleted", handleInvalidate);
      window.removeEventListener("zenify:track-played", handleTrackPlayed);
      window.removeEventListener("zenify:playlist-updated", handleInvalidate);
      window.removeEventListener("zenify:preferences-updated", handleInvalidate);
      window.removeEventListener("zenify:country-language-changed", handleInvalidate);
    };
  }, [queryClient]);

  // If loading and no cached data, render skeleton row placeholders
  const sections = useMemo(() => {
    if (isLoading && !data) {
      return [
        { id: "skel-1", type: "tracks", title: "Recommended for You", subtitle: "LOADING YOUR SOUNDS", items: [], isLoading: true },
        { id: "skel-2", type: "tracks", title: "Trending Now", subtitle: "FETCHING TOP TRACKS", items: [], isLoading: true },
        { id: "skel-3", type: "artists", title: "Artists You May Like", subtitle: "DISCOVERING ARTISTS", items: [], isLoading: true },
        { id: "skel-4", type: "tracks", title: "New Releases", subtitle: "LOADING FRESH MUSIC", items: [], isLoading: true },
      ];
    }

    if (!data?.sections || !Array.isArray(data.sections)) {
      return [];
    }

    return data.sections.map((sec: any) => ({
      id: sec.id,
      type: sec.type || "tracks",
      title: sec.title,
      subtitle: sec.subtitle,
      items: sec.items || [],
      isLoading: false
    }));
  }, [data, isLoading]);

  return {
    sections,
    isLoading,
    isError,
    coldStart: data?.coldStart ?? true,
    languages: data?.languages || selectedLanguages,
    refetchAll: refetch,
  };
}
