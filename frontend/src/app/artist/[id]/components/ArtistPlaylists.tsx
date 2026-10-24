"use client";

import React from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { ListMusic } from "lucide-react";
import { cn, getMediaUrl, formatDisplayTitle } from "@/lib/utils";

interface ArtistPlaylistsProps {
  artistName: string;
  playlists: any[];
}

export function ArtistPlaylists({ artistName, playlists }: ArtistPlaylistsProps) {
  if (!playlists || playlists.length === 0) return null;

  // Filter out video playlists since user explicitly said: "dont fetch vieos section"
  const audioPlaylists = playlists.filter(p => {
    const title = (p.name || p.title || '').toLowerCase();
    return !title.includes('video');
  });

  if (audioPlaylists.length === 0) return null;

  const getPlaylistCategory = (title: string): string => {
    const t = title.toLowerCase();
    if (t.includes('essential')) return 'Essentials';
    if (t.includes('set list') || t.includes('tour')) return 'Set List';
    if (t.includes('love') || t.includes('romantic')) return 'Love Songs';
    if (t.includes('party') || t.includes('dance') || t.includes('hits')) return 'Party Starters';
    return 'Essentials';
  };

  return (
    <section className="mb-14">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">
          Artist Playlists
        </h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-4 md:gap-5">
        {audioPlaylists.slice(0, 10).map((playlist, idx) => {
          const rawTitle = playlist.name || playlist.title || "";
          const category = getPlaylistCategory(rawTitle);
          const cover = getMediaUrl(playlist.coverUrl);

          return (
            <motion.div
              key={playlist.id || `pl-${idx}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: idx * 0.04 }}
            >
              <Link href={`/playlist/${playlist.id}`} className="block group">
                <div className="flex flex-col gap-2">
                  {/* Apple Music Essentials Card Frame */}
                  <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-[#d8c39e] border border-white/10 shadow-xl flex flex-col justify-between transition-transform duration-300 group-hover:scale-[1.02]">
                    {/* Top Essentials Banner */}
                    <div className="w-full pt-3 px-3.5 pb-2 flex items-center justify-between z-10">
                      <span className="font-bold text-[18px] md:text-[20px] text-black tracking-tight leading-none">
                        {category}
                      </span>
                      {/* Apple Music Logo Symbol */}
                      <div className="flex items-center gap-0.5 text-black font-semibold text-[11px] tracking-tighter">
                        <span className="text-[13px] leading-none"></span>
                        <span className="font-bold text-[10px] uppercase tracking-wide">Music</span>
                      </div>
                    </div>

                    {/* Bottom Image Showcase */}
                    <div className="w-full h-[68%] relative overflow-hidden mt-auto">
                      {cover ? (
                        <img
                          src={cover}
                          alt={rawTitle}
                          className="w-full h-full object-cover object-top"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-zinc-900 text-white/30">
                          <ListMusic size={32} />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Playlist Details */}
                  <div className="flex flex-col gap-0.5 pt-0.5">
                    <p className="text-[13px] md:text-[14px] font-semibold text-white truncate group-hover:text-brand transition-colors">
                      {formatDisplayTitle(rawTitle)}
                    </p>
                    <p className="text-[12px] text-white/50 truncate font-normal">
                      {playlist.owner ? `Apple Music ${playlist.owner}` : `Apple Music`}
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
