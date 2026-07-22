"use client";

import { useHomepageData } from "@/hooks/useHomepageData";
import { useAuthStore } from "@/store/authStore";
import { usePlayerStore } from "@/store/player";
import { Button } from "@/components/ui/button";
import { Info, Music } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ContentRow } from "@/components/shared/ContentRow";
import { cn } from "@/lib/utils";
import { MobileHomePage } from "@/components/mobile/MobileHomePage";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function Home() {
  const isMobile = useIsMobile();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const router = useRouter();
  const { user } = useAuthStore();
  const currentTrack = usePlayerStore(state => state.currentTrack);

  const { sections, isLoading: isAllLoading, isError: fetchError } = useHomepageData();

  // Extract items but strictly filter out non-playable entities from the "Tracks" stream
  const allTracks = sections?.flatMap((s: any) => s.items || []).filter((item: any) => 
    !item.isArtist && !item.isAlbum && !item.isMood && !item.isPlaylist
  ) || [];

  const isError = !isAllLoading && sections.length === 0 && !currentTrack && fetchError;

  if (isError) {
    console.error("Connection error details:", {
      apiUrl: (import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL) || 'Local Engine (3000)',
      all: !!allTracks
    });

    return (
      <div className="flex flex-col items-center justify-center h-[80vh] gap-6 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <Info className="text-red-500 w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-white uppercase tracking-widest">Connection Refused</h2>
          <p className="text-xs text-white/40 max-w-xs leading-relaxed uppercase tracking-wider font-bold">The Archive is currently unreachable. Please check your connection or try again.</p>
          <p className="text-[10px] text-white/20 uppercase tracking-[0.2em] mt-4">
            Attempting: {(import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL) || 'Local Engine (3000)'}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => window.location.reload()}
          className="rounded-full px-8 bg-white/5 border-white/10 hover:bg-white/10"
        >
          Retry Connection
        </Button>
      </div>
    );
  }

  if (!isMounted) {
    return <div className="h-screen w-full bg-background" />;
  }

  return isMobile ? <MobileHomePage /> : (
    <div className="space-y-8 md:space-y-12 pb-24 pt-[88px] md:pt-[104px] min-h-screen bg-background">
      <div className="space-y-12 px-0">
        {(!allTracks || allTracks.length === 0) && !isAllLoading ? (
          <div className="flex flex-col items-center justify-center py-24 px-6 text-center border border-dashed border-white/5 rounded-3xl bg-white/[0.02] mx-4 md:mx-6">
            <div className="w-16 h-16 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center mb-6">
              <Music className="text-brand w-8 h-8" />
            </div>
            <h2 className={cn(
              "text-xl font-bold mb-2 uppercase tracking-widest transition-colors duration-500",
              user?.role === 'ADMIN' ? "text-white" : "text-brand drop-shadow-[0_0_8px_rgba(var(--accent-brand-rgb),0.4)]"
            )}>
              {user?.role === 'ADMIN' ? "The Archive is Empty" : "Coming Soon"}
            </h2>
            <p className={cn(
              "text-sm max-w-sm mb-8 leading-relaxed font-medium transition-colors duration-500",
              user?.role === 'ADMIN' ? "text-white/40" : "text-brand/60"
            )}>
              {user?.role === 'ADMIN'
                ? <>Your sonic journey begins here. Be the first to upload a frequency to the <span className="font-zenify">zenify</span> network.</>
                : "We are currently adding new music to the archive. This section will be ready for you very soon!"
              }
            </p>
            {user?.role === 'ADMIN' && (
              <Button
                onClick={() => router.push('/admin')}
                className="rounded-full h-10 px-8 bg-white/10 text-brand border border-white/5 hover:bg-white/20 font-bold uppercase tracking-wider text-[10px]"
              >
                Admin Console
              </Button>
            )}
          </div>
        ) : (
          sections?.map((section: any) => (
            (section.isLoading || (section.items && section.items.length > 0)) && (
              <ContentRow
                key={section.type}
                title={section.title}
                subtitle={section.subtitle}
                items={section.items}
                isLoading={section.isLoading}
                seeAllHref={`/section/${section.type}`}
              />
            )
          ))
        )}
      </div>
    </div>
  );
}

