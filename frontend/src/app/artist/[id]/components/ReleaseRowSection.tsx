"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Disc3 } from "lucide-react";
import { cn, getMediaUrl, formatDisplayTitle } from "@/lib/utils";
import { motion } from "framer-motion";

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
            className="group flex items-center gap-1.5 text-xl md:text-2xl font-bold text-white tracking-tight hover:text-white/80 transition-colors"
          >
            <span>{title}</span>
            <ChevronRight size={22} className="text-white/40 group-hover:text-white transition-colors group-hover:translate-x-0.5 duration-200" />
          </Link>
        ) : (
          <div className="flex items-center gap-1.5 text-xl md:text-2xl font-bold text-white tracking-tight">
            <span>{title}</span>
            <ChevronRight size={22} className="text-white/40" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-5">
        {items.slice(0, 12).map((item, idx) => {
          const cover = getMediaUrl(item.coverUrl || item.artwork);
          const rawYear = item.releaseDate || item.createdAt;
          const year = rawYear ? new Date(rawYear).getFullYear() : "";

          return (
            <motion.div
              key={item.id || `${title}-${idx}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: idx * 0.03 }}
            >
              <Link href={`/album/${item.id}`} className="block group">
                <div className="flex flex-col gap-2">
                  <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-zinc-900 border border-white/5 shadow-lg transition-transform duration-300 group-hover:scale-[1.02]">
                    {cover ? (
                      <img
                        src={cover}
                        alt={item.title || "Release cover"}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-700">
                        <Disc3 size={36} />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5 pt-1">
                    <p className="text-[14px] font-semibold text-white truncate group-hover:text-brand transition-colors">
                      {formatDisplayTitle(item.title || item.name) || item.title || item.name || "Untitled"}
                    </p>
                    <p className="text-[12px] text-white/60 truncate font-normal">
                      {year || (item.isSingle ? "Single" : "Album")}
                    </p>
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
