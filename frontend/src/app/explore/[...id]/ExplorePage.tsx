"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track } from "@/store/player";
import { ChevronLeft } from "lucide-react";
import { motion } from "framer-motion";
import { useRouter, useParams } from "next/navigation";
import { useIsMobile } from "@/hooks/useIsMobile";
import { PCMediaCard } from "@/components/pc/PCMediaCard";
import { MobileMediaCard } from "@/components/mobile/MobileMediaCard";

export default function ExploreSectionPage() {
  const router = useRouter();
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string);
  const isMobile = useIsMobile();

  const { data: allTracks, isLoading, isError } = useQuery({
    queryKey: ["tracks-explore"],
    queryFn: async () => {
      const res = await api.get("tracks");
      return res.data.items as Track[];
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 bg-[#0A0A0C]">
        <div className="w-12 h-12 rounded-full border-2 border-brand/20 border-t-brand animate-spin" />
        <p className="text-white/20 font-bold text-[10px] tracking-widest uppercase">Fetching frequencies...</p>
      </div>
    );
  }

  if (isError || !allTracks) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 bg-[#0A0A0C] px-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-2">
          <ChevronLeft className="text-red-500/40 rotate-90" />
        </div>
        <h2 className="text-xl font-bold text-white">Oops! Signal Lost</h2>
        <p className="text-zinc-500 text-sm">We couldn't load the tracks for this section. Please try again later.</p>
        <button
          onClick={() => router.back()}
          className="mt-4 px-8 py-3 bg-white text-black rounded-xl font-bold text-xs uppercase tracking-widest"
        >
          Go Back
        </button>
      </div>
    );
  }

  const tracksArray = (allTracks as Track[]) || [];
  let sectionTracks: Track[] = [];
  let title = "";

  switch (id) {
    case "deep-focus":
      sectionTracks = tracksArray.filter(t => t.genre?.toLowerCase() === 'lofi' || t.genre?.toLowerCase() === 'ambient').slice(0, 50);
      title = "Deep Focus";
      break;
    case "new-arrivals":
      sectionTracks = tracksArray.slice().sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 50);
      title = "New Arrivals";
      break;
    case "trending":
      sectionTracks = tracksArray.filter(t => t.isTrending).slice(0, 50);
      title = "Trending Now";
      break;
    case "made-for-you":
      sectionTracks = tracksArray.slice(Math.max(0, tracksArray.length - 20), tracksArray.length).reverse();
      title = "Made for You";
      break;
    case "most-played":
      sectionTracks = tracksArray.slice().sort((a, b) => (b.streams || 0) - (a.streams || 0)).slice(0, 50);
      title = "Most Played";
      break;
    default:
      sectionTracks = tracksArray;
      title = "Explore Section";
  }

  return (
    <div className="min-h-screen bg-[#0A0A0C] pb-32">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#0A0A0C]/80 backdrop-blur-xl border-b border-white/5 px-6 py-5 flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2.5 rounded-full bg-white/5 active:scale-90 transition-all text-white/70 hover:text-white"
        >
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-xl md:text-2xl font-brand font-bold text-white tracking-tight">{title}</h1>
      </div>

      {/* Grid */}
      <div className="px-6 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 items-start">
          {sectionTracks.map((track, i) => (
            <motion.div
              key={track.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: Math.min(i * 0.03, 0.3) }}
            >
              {isMobile ? (
                <MobileMediaCard track={track} contextTracks={sectionTracks} />
              ) : (
                <PCMediaCard track={track} contextTracks={sectionTracks} />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
