"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MediaCard, MEDIA_CARD_WIDTH } from "./MediaCard";
import { Track } from "@/store/player";
import { cn } from "@/lib/utils";

interface ContentRowProps {
  title: string;
  subtitle?: string;
  items: Track[];
  className?: string;
  seeAllHref?: string;
  isLoading?: boolean;
}

/**
 * How the "cards slide under the sidebar / queue / lyrics" effect works
 * ---------------------------------------------------------------------
 * The layout puts padding-left: var(--sb-w) and padding-right: var(--rp-w) on the page content.
 * This row cancels both with matching NEGATIVE margins, so the scroller is always the full width
 * of the viewport (and therefore physically sits behind the glass panels).
 * It then re-adds the same amounts as scroller PADDING, so the first card still starts right next
 * to the sidebar and scroll-snap lands cards in the visible area.
 * All four values transition with the same duration/easing, so everything moves as one piece.
 */
const EDGE_L = "calc(var(--sb-w) + var(--row-gutter))";
const EDGE_R = "calc(var(--rp-w) + var(--row-gutter))";

const CARD_W = MEDIA_CARD_WIDTH;

export function ContentRow({ title, subtitle, items, className, seeAllHref, isLoading }: ContentRowProps) {
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

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    // Scroll by the *visible* width, not the full bleed width
    const style = getComputedStyle(el);
    const visible = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    el.scrollBy({ left: (dir === "left" ? -1 : 1) * Math.max(visible * 0.85, 240), behavior: "smooth" });
  };

  if (items.length === 0 && !isLoading) return null;

  const arrowBase =
    "am-glass-chip absolute top-[calc(50%-28px)] z-30 hidden h-12 w-9 -translate-y-1/2 items-center justify-center " +
    "rounded-full text-white shadow-[0_8px_24px_rgba(0,0,0,0.45)] opacity-0 outline-none md:flex " +
    "transition-[opacity,transform] duration-300 ease-[var(--spring)] hover:scale-105 active:scale-90 " +
    "group-hover/row:opacity-100 focus-visible:opacity-100 cursor-pointer";

  return (
    <section className={cn("group/row w-full", className)}>
      {/* Heading: "Updated Playlists >" */}
      <div className="mb-3 flex items-end justify-between" style={{ paddingInline: "var(--row-gutter)" }}>
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
          {subtitle && <p className="mt-0.5 text-[13px] font-normal text-white/50">{subtitle}</p>}
        </div>
      </div>

      {/* Full-bleed wrapper (cancels the layout padding) */}
      <div
        className="am-layout-transition relative"
        style={{ marginLeft: "calc(var(--sb-w) * -1)", marginRight: "calc(var(--rp-w) * -1)" }}
      >
        {canScrollLeft && (
          <button
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
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className={cn("shrink-0 snap-start animate-pulse", CARD_W)}>
                  <div className="aspect-square w-full rounded-[8px] bg-white/[0.07]" />
                  <div className="mt-2.5 h-3.5 w-3/4 rounded bg-white/[0.08]" />
                  <div className="mt-1.5 h-3 w-1/2 rounded bg-white/[0.05]" />
                </div>
              ))
            : (Array.isArray(items) ? items : []).map((item, index) => (
                <MediaCard
                  key={`${item.id || "item"}-${index}`}
                  track={item}
                  index={index}
                  contextTracks={Array.isArray(items) ? items : []}
                  className={cn("shrink-0 snap-start", CARD_W)}
                />
              ))}
        </div>
      </div>
    </section>
  );
}
