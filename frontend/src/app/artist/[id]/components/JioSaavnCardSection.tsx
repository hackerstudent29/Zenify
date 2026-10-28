"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { MediaCard, MEDIA_CARD_WIDTH } from "@/components/shared/MediaCard";

interface JioSaavnCardSectionProps {
  title: string;
  items: any[];
  seeAllHref?: string;
  onPlayItem?: (item: any, e: React.MouseEvent) => void;
  currentCollectionId?: string;
  isPlaying?: boolean;
}

const EDGE_L = "calc(var(--sb-w) + var(--row-gutter, 28px))";
const EDGE_R = "calc(var(--rp-w) + var(--row-gutter, 28px))";

export function JioSaavnCardSection({
  title,
  items,
  seeAllHref,
}: JioSaavnCardSectionProps) {
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
  }, [items, checkScroll]);

  if (!items || items.length === 0) return null;

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const visible = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    el.scrollBy({ left: (dir === "left" ? -1 : 1) * Math.max(visible * 0.85, 240), behavior: "smooth" });
  };

  const getItemLink = (item: any) => {
    if (item.type === "playlist" || item.id?.startsWith("saavn-playlist-")) {
      return `/playlist/${item.id}`;
    }
    if (item.type === "album" || item.id?.startsWith("saavn-album-") || item.id?.startsWith("itunes-album-")) {
      return `/album/${item.id}`;
    }
    return `/album/${item.id || item.albumId || "single"}`;
  };

  const arrowBase =
    "am-glass-chip absolute top-[calc(50%-28px)] z-30 hidden h-12 w-9 -translate-y-1/2 items-center justify-center " +
    "rounded-full text-white shadow-[0_8px_24px_rgba(0,0,0,0.45)] opacity-0 outline-none md:flex " +
    "transition-[opacity,transform] duration-300 ease-[var(--spring)] hover:scale-105 active:scale-90 " +
    "group-hover/section:opacity-100 focus-visible:opacity-100 cursor-pointer";

  return (
    <section className="group/section mb-10 w-full select-none">
      {/* ── Section title ── */}
      <div className="mb-3 flex items-end justify-between" style={{ paddingInline: "var(--row-gutter, 28px)" }}>
        <div className="min-w-0">
          {seeAllHref ? (
            <Link
              href={seeAllHref}
              className="group/title inline-flex items-center gap-0.5 text-[22px] font-semibold leading-tight tracking-[-0.022em] text-white outline-none font-brand"
              style={{ fontFamily: "'Orange Avenue', serif" }}
            >
              <span className="truncate">{title}</span>
              <ChevronRight
                size={20}
                strokeWidth={2.6}
                className="mt-0.5 shrink-0 text-white/40 transition-transform duration-300 ease-[var(--spring)] group-hover/title:translate-x-0.5 group-hover/title:text-white/70"
              />
            </Link>
          ) : (
            <h2
              className="truncate text-[22px] font-semibold leading-tight tracking-[-0.022em] text-white font-brand"
              style={{ fontFamily: "'Orange Avenue', serif" }}
            >
              {title}
            </h2>
          )}
        </div>
      </div>

      {/* ── Full-Bleed Carousel with Apple Music Media Cards ── */}
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
          {items.map((item, idx) => {
            const isPlaylist = item.type === "playlist" || item.id?.startsWith("saavn-playlist-");
            const isAlbum = item.type === "album" || item.id?.startsWith("saavn-album-") || item.id?.startsWith("itunes-album-") || (!isPlaylist && !item.isArtist);
            const rawYear = item.year || item.releaseDate || item.createdAt;
            const year = rawYear ? (typeof rawYear === "string" && rawYear.length === 4 ? rawYear : new Date(rawYear).getFullYear()) : "";
            const count = Number(item.trackCount || item.songCount || 0);
            let subtitle = "";
            if (count > 1) {
              subtitle = `${count} Songs`;
            } else if (count === 1 || item.isSingle) {
              subtitle = year ? `${year} · Single` : "Single";
            } else if (item.subtitle && !item.subtitle.includes("1 Songs")) {
              subtitle = item.subtitle;
            } else {
              subtitle = year ? `${year} · ${item.isSingle ? "Single" : "Album"}` : (item.isSingle ? "Single" : "Album");
            }

            const formattedTrack = {
              ...item,
              id: item.id || `item-${idx}`,
              title: item.title || item.name,
              name: item.name || item.title,
              artwork: item.artwork || item.coverUrl || item.image,
              coverUrl: item.coverUrl || item.image || item.artwork,
              isAlbum,
              isPlaylist,
              isArtist: item.isArtist || false,
              subtitle,
              href: getItemLink(item),
            };

            return (
              <MediaCard
                key={item.id || `${title}-${idx}`}
                track={formattedTrack}
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
