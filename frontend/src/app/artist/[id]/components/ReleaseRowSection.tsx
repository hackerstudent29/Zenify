"use client";

import React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { MediaCard } from "@/components/shared/MediaCard";

interface ReleaseRowSectionProps {
  title: string;
  items: any[];
  seeAllHref?: string;
}

export function ReleaseRowSection({ title, items, seeAllHref }: ReleaseRowSectionProps) {
  if (!items || items.length === 0) return null;

  return (
    <section className="mb-14">
      <div className="flex items-center justify-between gap-4 mb-4">
        {seeAllHref ? (
          <Link
            href={seeAllHref}
            className="group flex items-center gap-1.5 text-xl md:text-2xl font-bold text-white tracking-tight hover:text-white/80 transition-colors font-brand"
            style={{ fontFamily: "'Orange Avenue', serif" }}
          >
            <span>{title}</span>
            <ChevronRight size={22} className="text-white/40 group-hover:text-white transition-colors group-hover:translate-x-0.5 duration-200" />
          </Link>
        ) : (
          <div
            className="flex items-center gap-1.5 text-xl md:text-2xl font-bold text-white tracking-tight font-brand"
            style={{ fontFamily: "'Orange Avenue', serif" }}
          >
            <span>{title}</span>
            <ChevronRight size={22} className="text-white/40" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
        {items.slice(0, 12).map((item, idx) => {
          const rawYear = item.releaseDate || item.createdAt;
          const year = rawYear ? new Date(rawYear).getFullYear() : "";
          const count = Number(item.trackCount || item.songCount || 0);
          let subtitle = "";
          if (title === "Appears On" && item.artistName) {
            subtitle = item.artistName;
          } else if (count > 1) {
            subtitle = `${count} Songs`;
          } else if (count === 1 || item.isSingle) {
            subtitle = year ? `${year} · Single` : "Single";
          } else {
            subtitle = year ? `${year} · ${item.isSingle ? "Single" : "Album"}` : (item.isSingle ? "Single" : "Album");
          }

          const formattedTrack = {
            ...item,
            id: item.id || `release-${idx}`,
            title: item.title || item.name,
            name: item.name || item.title,
            artwork: item.coverUrl || item.artwork || item.image,
            coverUrl: item.coverUrl || item.artwork || item.image,
            isAlbum: true,
            subtitle,
            href: `/album/${item.id}`,
          };

          return (
            <MediaCard
              key={item.id || `${title}-${idx}`}
              track={formattedTrack}
              index={idx}
              className="w-full"
            />
          );
        })}
      </div>
    </section>
  );
}
