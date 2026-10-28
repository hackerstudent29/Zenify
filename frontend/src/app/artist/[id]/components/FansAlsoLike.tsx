"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { User2, ChevronLeft, ChevronRight } from "lucide-react";
import { cn, getMediaUrl, formatDisplayTitle } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/authStore";
import { useIsMobile } from "@/hooks/useIsMobile";

interface FansAlsoLikeProps {
  currentArtistId: string;
  initialRelated?: any[];
}

export function FansAlsoLike({ currentArtistId, initialRelated }: FansAlsoLikeProps) {
  const [artists, setArtists] = useState<any[]>(initialRelated && initialRelated.length > 0 ? initialRelated : []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isLyricsOpen = useUIStore(state => state.isLyricsOpen);
  const isQueueOpen = useUIStore(state => state.isQueueOpen);
  const { isAuthenticated } = useAuthStore();
  const isMobile = useIsMobile();
  const hasSidebar = !isMobile && isAuthenticated;
  
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    checkScroll();
  }, [artists]);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.clientWidth * 0.75;
    el.scrollBy({ left: dir === "left" ? -distance : distance, behavior: "smooth" });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setHasDragged(false);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  };

  const handleMouseLeave = () => setIsDragging(false);
  const handleMouseUp = () => setIsDragging(false);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 2;
    if (Math.abs(walk) > 5) setHasDragged(true);
    scrollRef.current.scrollLeft = scrollLeft - walk;
    checkScroll();
  };

  // Fetch real related artists from dedicated endpoint
  useEffect(() => {
    if (initialRelated && initialRelated.length > 0) {
      setArtists(initialRelated);
      return;
    }
    const fetchRelated = async () => {
      try {
        const res = await api.get(`/artists/${encodeURIComponent(currentArtistId)}/related`);
        if (res.data && Array.isArray(res.data) && res.data.length > 0) {
          setArtists(res.data);
          return;
        }
        const fallbackRes = await api.get('/artists');
        if (fallbackRes.data && Array.isArray(fallbackRes.data)) {
          const related = fallbackRes.data.filter((a: any) => a.id !== currentArtistId).slice(0, 10);
          setArtists(related);
        }
      } catch (err) {
        console.error("Failed to load related artists", err);
      }
    };
    fetchRelated();
  }, [currentArtistId, initialRelated]);

  if (!artists || artists.length === 0) return null;

  return (
    <section className="mb-16 select-none group/fans">
      <div className="mb-4" style={{ paddingInline: "var(--row-gutter, 28px)" }}>
        <h2 className="text-2xl font-bold text-white tracking-tight">Fans Also Like</h2>
      </div>

      <div 
        className="am-layout-transition relative"
        style={{
          marginLeft: "calc(var(--sb-w) * -1)",
          marginRight: "calc(var(--rp-w) * -1)",
        }}
      >
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scroll("left")}
            style={{ left: "calc(var(--sb-w) + 12px)" }}
            className="am-glass-chip am-layout-transition absolute top-[38%] -translate-y-1/2 z-30 h-10 w-10 sm:h-12 sm:w-12 rounded-full text-white flex items-center justify-center opacity-0 group-hover/fans:opacity-100 hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
            aria-label="Scroll left"
          >
            <ChevronLeft size={22} strokeWidth={2.4} />
          </button>
        )}

        {canScrollRight && (
          <button
            type="button"
            onClick={() => scroll("right")}
            style={{ right: "calc(var(--rp-w) + 12px)" }}
            className="am-glass-chip am-layout-transition absolute top-[38%] -translate-y-1/2 z-30 h-10 w-10 sm:h-12 sm:w-12 rounded-full text-white flex items-center justify-center opacity-0 group-hover/fans:opacity-100 hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
            aria-label="Scroll right"
          >
            <ChevronRight size={22} strokeWidth={2.4} />
          </button>
        )}

        <div 
          ref={scrollRef}
          onScroll={checkScroll}
          onMouseDown={handleMouseDown}
          onMouseLeave={handleMouseLeave}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
          className="am-layout-transition flex gap-4 md:gap-7 overflow-x-auto pb-6 pt-2 hide-scrollbar cursor-grab active:cursor-grabbing select-none"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            paddingLeft: "calc(var(--sb-w) + var(--row-gutter, 28px))",
            paddingRight: "calc(var(--rp-w) + var(--row-gutter, 28px))",
          }}
        >
          {artists.map((artist, idx) => (
            <motion.div
              key={artist.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(idx * 0.04, 0.25) }}
              className="shrink-0"
            >
              <Link 
                href={`/artist/${artist.id}`} 
                onClick={(e) => {
                  if (hasDragged) {
                    e.preventDefault();
                  }
                }}
                draggable={false}
                className="flex flex-col items-center group w-32 md:w-38 text-center"
              >
                <div className="w-32 h-32 md:w-38 md:h-38 rounded-full overflow-hidden mb-3 bg-zinc-900 ring-1 ring-inset ring-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.4)] transition-all pointer-events-none">
                  {(artist.imageUrl || artist.coverUrl || artist.picture_xl) ? (
                    <img 
                      src={getMediaUrl(artist.imageUrl || artist.coverUrl || artist.picture_xl)} 
                      className="w-full h-full object-cover pointer-events-none" 
                      alt={artist.name ? `Similar artist ${artist.name}` : "Artist"} 
                      width={160}
                      height={160}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center pointer-events-none text-zinc-600">
                      <User2 size={40} />
                    </div>
                  )}
                </div>
                <p className="text-[14px] md:text-[15px] font-medium text-white tracking-tight truncate w-full group-hover:underline decoration-white/40 underline-offset-4 pointer-events-none">
                  {formatDisplayTitle(artist.name) || artist.name || "Artist"}
                </p>
                <p className="text-[12px] text-white/50 font-normal mt-0.5 tracking-tight pointer-events-none">
                  Artist
                </p>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}} />
    </section>
  );
}
