"use client";

import React from "react";
import Link from "next/link";
import { Disc3 } from "lucide-react";
import { cn, getMediaUrl, formatDisplayTitle } from "@/lib/utils";
import { motion } from "framer-motion";

interface EssentialAlbumsProps {
  albums: any[];
  artistName: string;
}

export function EssentialAlbums({ albums, artistName }: EssentialAlbumsProps) {
  if (!albums || albums.length === 0) return null;

  // Filter or take up to 6 major albums
  const displayAlbums = albums.slice(0, 6);

  return (
    <section className="mb-14">
      <div className="flex items-center justify-between gap-4 mb-5">
        <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">
          Essential Albums
        </h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4 md:gap-6">
        {displayAlbums.map((album, idx) => {
          const cover = getMediaUrl(album.coverUrl);
          const rawYear = album.releaseDate || album.createdAt;
          const year = rawYear ? new Date(rawYear).getFullYear() : "";

          // Generate or format authentic Apple Music editorial synopsis
          const synopsis = album.description || (album.genre ? `${album.genre} masterpiece by ${artistName}.` : `Classic soundtrack composed by ${artistName}.`);

          return (
            <motion.div
              key={album.id || `ess-${idx}`}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
            >
              <Link href={`/album/${album.id}`} className="block group">
                <div className="flex flex-col gap-2.5">
                  <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-zinc-900 border border-white/5 shadow-xl transition-transform duration-300 group-hover:scale-[1.02]">
                    {cover ? (
                      <img
                        src={cover}
                        alt={album.title || "Essential Album"}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-700">
                        <Disc3 size={40} />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 pt-1">
                    <p className="text-[14px] md:text-[15px] font-semibold text-white truncate leading-tight group-hover:text-brand transition-colors">
                      {formatDisplayTitle(album.title || album.name) || album.title || album.name || "Untitled Album"}
                    </p>
                    <p className="text-[12px] text-white/60 line-clamp-2 leading-snug font-normal">
                      {synopsis}
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
