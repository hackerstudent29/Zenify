"use client";

import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { MediaCard } from "./MediaCard";
import { Track } from "@/store/player";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/authStore";
import { useIsMobile } from "@/hooks/useIsMobile";

interface ContentRowProps {
  title: string;
  subtitle?: string;
  items: Track[];
  className?: string;
  seeAllHref?: string;
  isLoading?: boolean;
}

export function ContentRow({ title, subtitle, items, className, seeAllHref, isLoading }: ContentRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const isSidebarCollapsed = useUIStore(state => state.isSidebarCollapsed);
  const isLyricsOpen = useUIStore(state => state.isLyricsOpen);
  const isQueueOpen = useUIStore(state => state.isQueueOpen);
  const { isAuthenticated } = useAuthStore();
  const isMobile = useIsMobile();
  const hasSidebar = !isMobile && isAuthenticated;
  const sidebarWidth = isMobile ? 0 : (isSidebarCollapsed ? 72 : 260);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 5);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 5);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [items]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const containerWidth = scrollRef.current.clientWidth;
      const scrollAmount = direction === 'left' ? -containerWidth * 0.8 : containerWidth * 0.8;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  if (items.length === 0 && !isLoading) return null;

  return (
    <section className={cn("space-y-4 w-full", className)}>
      <div className="flex items-end justify-between px-6 sm:px-8 md:px-10">
        <div className="space-y-1">
          <h2 className="text-lg font-bold tracking-tight text-foreground/95 font-brand" style={{ fontFamily: "'Orange Avenue', serif" }}>{title}</h2>
          {subtitle && <p className="text-[12px] text-muted font-medium opacity-60 uppercase tracking-wider">{subtitle}</p>}
        </div>

        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="text-xs font-bold text-accent hover:underline flex items-center gap-1 group/link mr-2"
          >
            See All
            <ArrowRight size={12} className="group-hover/link:translate-x-1 transition-transform" />
          </Link>
        )}
      </div>

      <div 
        className={cn(
          "relative group/scroll w-full transition-all duration-500",
          hasSidebar && "md:-ml-[260px] md:pl-[260px]",
          (isLyricsOpen || isQueueOpen) && !isMobile && "md:-mr-[380px] md:pr-[380px]"
        )}
      >
        {/* Apple Music Floating Movers over Content */}
        {canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            className={cn(
              "absolute top-[38%] -translate-y-1/2 z-30 w-8 h-12 sm:w-9 sm:h-14 rounded-full bg-black/75 hover:bg-black/95 backdrop-blur-xl border border-white/20 text-white flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.6)] hover:scale-105 active:scale-95 transition-all cursor-pointer opacity-0 group-hover/scroll:opacity-100",
              hasSidebar ? "left-[270px] sm:left-[274px]" : "left-2 sm:left-4"
            )}
            aria-label="Scroll left"
          >
            <ChevronLeft size={22} strokeWidth={2.4} />
          </button>
        )}

        {canScrollRight && (
          <button
            onClick={() => scroll('right')}
            className={cn(
              "absolute top-[38%] -translate-y-1/2 z-30 w-8 h-12 sm:w-9 sm:h-14 rounded-full bg-black/75 hover:bg-black/95 backdrop-blur-xl border border-white/20 text-white flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.6)] hover:scale-105 active:scale-95 transition-all cursor-pointer opacity-0 group-hover/scroll:opacity-100",
              (isLyricsOpen || isQueueOpen) && !isMobile ? "right-[392px] sm:right-[396px]" : "right-2 sm:right-4"
            )}
            aria-label="Scroll right"
          >
            <ChevronRight size={22} strokeWidth={2.4} />
          </button>
        )}

        <div
          ref={scrollRef}
          onScroll={checkScroll}
          className="flex gap-4 overflow-x-auto pb-6 no-scrollbar scroll-smooth snap-x snap-mandatory w-full px-6 sm:px-8 md:px-10"
        >
          {isLoading ? (
   Array.from({ length: 5 }).map((_, i) => (
     <div 
       key={i} 
       className={cn(
         "flex-shrink-0 snap-start animate-pulse space-y-3",
         isLyricsOpen
           ? "w-[160px] sm:w-[170px] md:w-[185px] lg:w-[195px] xl:w-[205px]"
           : isSidebarCollapsed
           ? "w-[44vw] sm:w-[195px] md:w-[225px] lg:w-[235px] xl:w-[245px]"
           : "w-[42vw] sm:w-[180px] md:w-[210px] lg:w-[220px] xl:w-[230px]"
       )}
     >
       <div className="aspect-square w-full rounded-2xl bg-white/5 border border-white/10" />
       <div className="h-4 bg-white/10 rounded w-3/4" />
       <div className="h-3 bg-white/5 rounded w-1/2" />
     </div>
   ))
 ) : (
   (Array.isArray(items) ? items : []).map((item, index) => (
     <MediaCard
       key={`${item.id || "item"}-${index}`}
       track={item}
       index={index}
       contextTracks={Array.isArray(items) ? items : []}
       className={cn(
         "flex-shrink-0 snap-start transition-all duration-500 ease-[0.16,1,0.3,1]",
         isLyricsOpen
           ? "w-[160px] sm:w-[170px] md:w-[185px] lg:w-[195px] xl:w-[205px]"
           : isSidebarCollapsed
           ? "w-[44vw] sm:w-[195px] md:w-[225px] lg:w-[235px] xl:w-[245px]"
           : "w-[42vw] sm:w-[180px] md:w-[210px] lg:w-[220px] xl:w-[230px]"
       )}
     />
   ))
 )}
 {/* Padding at end */}
 <div className="min-w-[20px] h-full flex-shrink-0" />
 </div>
 </div>
 </section>
 );
}
