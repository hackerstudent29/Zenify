"use client";

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

  return (
    <section className="mb-16">
      <div className="flex items-center justify-between gap-4 mb-6 px-2">
        <div className="flex items-center gap-3">
          <ListMusic size={22} className="text-brand" />
          <h2 className="text-2xl font-bold text-white tracking-tight">
            Playlists Featuring {formatDisplayTitle(artistName)}
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-5">
        {playlists.map((playlist) => (
          <motion.div
            key={playlist.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Link href={`/playlist/${playlist.id}`} className="block group">
              <div className="flex flex-col gap-2 p-2 rounded-xl transition-all duration-300 hover:bg-white/[0.04]">
                <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-zinc-900 border border-white/5 shadow-lg">
                  {playlist.coverUrl ? (
                    <img
                      src={getMediaUrl(playlist.coverUrl)}
                      alt={playlist.name || playlist.title || "Playlist cover"}
                      width={200}
                      height={200}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-700">
                      <ListMusic size={32} />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-0.5 px-0.5">
                  <p className="text-[14px] font-medium text-white truncate group-hover:text-brand transition-colors">
                    {formatDisplayTitle(playlist.name || playlist.title)}
                  </p>
                  <p className="text-[12px] text-zinc-400 truncate font-sans">
                    {playlist.owner ? `By ${playlist.owner}` : "Spotify Playlist"}
                  </p>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
