"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { MediaCard, MEDIA_CARD_WIDTH } from "@/components/shared/MediaCard";

interface FansAlsoLikeProps {
  currentArtistId: string;
  initialRelated?: any[];
}

const EDGE_L = "calc(var(--sb-w) + var(--row-gutter, 28px))";
const EDGE_R = "calc(var(--rp-w) + var(--row-gutter, 28px))";

export function FansAlsoLike({ currentArtistId, initialRelated }: FansAlsoLikeProps) {
  const [artists, setArtists] = useState<any[]>(initialRelated && initialRelated.length > 0 ? initialRelated : []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => ro.disconnect();
  }, [artists, checkScroll]);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const visible = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    el.scrollBy({ left: (dir === "left" ? -1 : 1) * Math.max(visible * 0.85, 240), behavior: "smooth" });
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

  const arrowBase =
    "am-glass-chip absolute top-[calc(50%-28px)] z-30 hidden h-12 w-9 -translate-y-1/2 items-center justify-center " +
    "rounded-full text-white shadow-[0_8px_24px_rgba(0,0,0,0.45)] opacity-0 outline-none md:flex " +
    "transition-[opacity,transform] duration-300 ease-[var(--spring)] hover:scale-105 active:scale-90 " +
    "group-hover/fans:opacity-100 focus-visible:opacity-100 cursor-pointer";

  return (
    <section className="group/fans mb-16 w-full select-none">
      <div className="mb-3 flex items-end justify-between" style={{ paddingInline: "var(--row-gutter, 28px)" }}>
        <h2
          className="truncate text-[22px] font-semibold leading-tight tracking-[-0.022em] text-white font-brand"
          style={{ fontFamily: "'Orange Avenue', serif" }}
        >
          Fans Also Like
        </h2>
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
            aria-label="Scroll left"
            className={cn(arrowBase, "am-layout-transition")}
            style={{ left: "calc(var(--sb-w) + 12px)" }}
          >
            <ChevronLeft size={22} strokeWidth={2.4} />
          </button>
        )}

        {canScrollRight && (
          <button
            type="button"
            onClick={() => scroll("right")}
            aria-label="Scroll right"
            className={cn(arrowBase, "am-layout-transition")}
            style={{ right: "calc(var(--rp-w) + 12px)" }}
          >
            <ChevronRight size={22} strokeWidth={2.4} />
          </button>
        )}

        <div
          ref={scrollRef}
          onScroll={checkScroll}
          className="am-layout-transition no-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto overscroll-x-contain pb-6 pt-1"
          style={{
            paddingLeft: EDGE_L,
            paddingRight: EDGE_R,
            scrollPaddingLeft: EDGE_L,
            scrollPaddingRight: EDGE_R,
            WebkitOverflowScrolling: "touch",
          }}
        >
          {artists.map((artist, idx) => {
            const artistItem = {
              ...artist,
              id: artist.id,
              title: artist.name || artist.title,
              name: artist.name || artist.title,
              coverUrl: artist.imageUrl || artist.coverUrl || artist.picture_xl || artist.image,
              artwork: artist.imageUrl || artist.coverUrl || artist.picture_xl || artist.image,
              isArtist: true,
              subtitle: "Artist",
              href: `/artist/${artist.id}`,
            };

            return (
              <MediaCard
                key={artist.id || idx}
                track={artistItem}
                index={idx}
                className={cn("shrink-0 snap-start", MEDIA_CARD_WIDTH)}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
