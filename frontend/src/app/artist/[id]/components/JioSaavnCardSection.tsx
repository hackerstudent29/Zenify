"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, ChevronLeft, Disc3, Play, Pause } from "lucide-react";
import { getMediaUrl, formatDisplayTitle } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

/* ── Springs (iOS-like: quick response, no wobble) ── */
const SPRING = { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.8 };
const SPRING_SOFT = { type: "spring" as const, stiffness: 300, damping: 32, mass: 0.9 };
const SPRING_SNAPPY = { type: "spring" as const, stiffness: 620, damping: 32, mass: 0.6 };

interface JioSaavnCardSectionProps {
  title: string;
  items: any[];
  seeAllHref?: string;
  onPlayItem?: (item: any, e: React.MouseEvent) => void;
  currentCollectionId?: string;
  isPlaying?: boolean;
}

/** Flat round scroll arrow (Apple Music style) */
function NavArrow({
  dir,
  disabled,
  onClick,
}: {
  dir: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      animate={{ opacity: disabled ? 0.3 : 1 }}
      whileTap={disabled ? undefined : { scale: 0.9 }}
      transition={SPRING_SNAPPY}
      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white/[0.08] text-white/80 outline-none transition-colors hover:bg-white/[0.14] hover:text-white disabled:cursor-default"
      title={dir === "left" ? "Previous" : "Next"}
      aria-label={dir === "left" ? "Scroll left" : "Scroll right"}
    >
      {dir === "left" ? <ChevronLeft size={16} strokeWidth={2.4} /> : <ChevronRight size={16} strokeWidth={2.4} />}
    </motion.button>
  );
}

/** One card: flat artwork, dims on hover, small play button bottom-left like Apple Music */
function ReleaseCard({
  item,
  idx,
  sectionTitle,
  href,
  isThisPlaying,
  onPlayItem,
}: {
  item: any;
  idx: number;
  sectionTitle: string;
  href: string;
  isThisPlaying: boolean;
  onPlayItem?: (item: any, e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);

  const cover = getMediaUrl(item.coverUrl || item.image || item.artwork);
  const rawYear = item.year || item.releaseDate || item.createdAt;
  const year = rawYear ? (typeof rawYear === "string" && rawYear.length === 4 ? rawYear : new Date(rawYear).getFullYear()) : "";
  const subtitle = item.subtitle || (item.trackCount ? `${item.trackCount} Songs` : (year ? `${year} · ${item.isSingle ? "Single" : "Album"}` : "Release"));
  const cardTitle = formatDisplayTitle(item.title || item.name) || item.title || item.name || "Untitled";

  const showPlay = hovered || isThisPlaying;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.985 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      transition={{
        opacity: { duration: 0.24, delay: Math.min(idx * 0.03, 0.2) },
        y: { ...SPRING_SOFT, delay: Math.min(idx * 0.03, 0.2) },
        scale: SPRING,
      }}
      style={{ scrollSnapAlign: "start" }}
      className="group w-[150px] shrink-0 sm:w-[165px] md:w-[180px]"
    >
      <Link href={href} className="block outline-none">
        <div className="flex flex-col gap-2">
          {/* Flat artwork: 6px corners, hairline ring, no shadow glow */}
          <div className="relative aspect-square w-full overflow-hidden rounded-[6px] bg-zinc-900 ring-1 ring-inset ring-white/[0.08]">
            {cover ? (
              <img
                src={cover}
                alt={cardTitle}
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1514525253361-bee8718a74a2?w=300";
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-zinc-700">
                <Disc3 size={36} />
              </div>
            )}

            {/* Hover dim */}
            <div
              className="pointer-events-none absolute inset-0 bg-black/30 transition-opacity duration-200"
              style={{ opacity: showPlay ? 1 : 0 }}
            />

            {/* Play button, bottom-left */}
            <AnimatePresence>
              {showPlay && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ ...SPRING_SNAPPY, opacity: { duration: 0.14 } }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (onPlayItem) onPlayItem(item, e);
                  }}
                  className="absolute bottom-2 left-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white text-black outline-none"
                  title={isThisPlaying ? "Pause" : "Play"}
                  aria-label={isThisPlaying ? "Pause" : "Play"}
                >
                  {isThisPlaying ? (
                    <Pause size={14} className="fill-black" />
                  ) : (
                    <Play size={14} className="ml-0.5 fill-black" />
                  )}
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Text */}
          <div className="flex flex-col gap-px">
            <p className="truncate text-[14px] font-medium leading-[18px] tracking-[-0.01em] text-white">
              {cardTitle}
            </p>
            <p className="truncate text-[13px] font-normal leading-[17px] text-white/55">{subtitle}</p>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export function JioSaavnCardSection({
  title,
  items,
  seeAllHref,
  onPlayItem,
  currentCollectionId,
  isPlaying,
}: JioSaavnCardSectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: true, right: false });

  const updateEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setEdge({
      left: el.scrollLeft <= 4,
      right: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    updateEdges();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateEdges);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items, updateEdges]);

  if (!items || items.length === 0) return null;

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const distance = scrollRef.current.clientWidth * 0.85;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -distance : distance,
      behavior: "smooth",
    });
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

  return (
    <section className="mb-9 select-none">
      {/* ── Section title + arrows ── */}
      <div className="mb-3 flex items-center justify-between gap-4">
        {seeAllHref ? (
          <Link
            href={seeAllHref}
            className="group flex items-center gap-0.5 text-[22px] font-bold leading-7 tracking-[-0.02em] text-white outline-none"
          >
            <span>{title}</span>
            <motion.span
              className="flex text-white/40 transition-colors group-hover:text-white/80"
              whileHover={{ x: 2 }}
              transition={SPRING_SNAPPY}
            >
              <ChevronRight size={20} strokeWidth={2.6} />
            </motion.span>
          </Link>
        ) : (
          <h2 className="text-[22px] font-bold leading-7 tracking-[-0.02em] text-white">{title}</h2>
        )}

        <div className="hidden items-center gap-1.5 sm:flex">
          <NavArrow dir="left" disabled={edge.left} onClick={() => scroll("left")} />
          <NavArrow dir="right" disabled={edge.right} onClick={() => scroll("right")} />
        </div>
      </div>

      {/* ── Carousel ── */}
      <div
        ref={scrollRef}
        onScroll={updateEdges}
        className="no-scrollbar flex items-start gap-3.5 overflow-x-auto scroll-smooth pb-1"
        style={{ scrollSnapType: "x proximity", overscrollBehaviorX: "contain" }}
      >
        {items.map((item, idx) => (
          <ReleaseCard
            key={item.id || `${title}-${idx}`}
            item={item}
            idx={idx}
            sectionTitle={title}
            href={getItemLink(item)}
            isThisPlaying={currentCollectionId === item.id && !!isPlaying}
            onPlayItem={onPlayItem}
          />
        ))}
      </div>
    </section>
  );
}