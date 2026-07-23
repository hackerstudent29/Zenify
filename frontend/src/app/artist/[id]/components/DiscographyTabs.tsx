"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Disc3 } from "lucide-react";
import { cn, getMediaUrl, formatDisplayTitle } from "@/lib/utils";

interface DiscographyTabsProps {
  albums: any[];
}

export function DiscographyTabs({ albums }: DiscographyTabsProps) {
  const [activeTab, setActiveTab] = useState<"All" | "Albums" | "Singles">("All");

  if (!albums || albums.length === 0) return null;

  // Simple heuristic for Singles/EPs vs Albums if the API doesn't specify:
  // We'll treat anything with "Single" or "EP" in the title as such, or just fallback to All
  const filteredAlbums = albums.filter(album => {
    if (activeTab === "All") return true;
    const isSingleOrEP = album.title.toLowerCase().includes("single") || album.title.toLowerCase().includes("ep");
    if (activeTab === "Singles") return isSingleOrEP;
    if (activeTab === "Albums") return !isSingleOrEP;
    return true;
  });

  const tabs: ("All" | "Albums" | "Singles")[] = ["All", "Albums", "Singles"];

  return (
    <section className="mb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 px-2">
        <h2 className="text-2xl font-bold text-white tracking-tight">Discography</h2>
        
        <div className="flex items-center gap-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "relative px-4 py-1.5 text-sm font-semibold rounded-full transition-colors outline-none",
                activeTab === tab ? "text-white" : "text-white/40 hover:text-white/80 hover:bg-white/5"
              )}
            >
              {activeTab === tab && (
                <motion.div 
                  layoutId="activeTab"
                  className="absolute inset-0 bg-white/10 rounded-full"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10">{tab}</span>
            </button>
          ))}
        </div>
      </div>

      <motion.div layout className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-4 md:gap-6">
        <AnimatePresence>
          {filteredAlbums.map((album, idx) => (
            <motion.div
              layout
              key={album.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
            >
              <Link href={`/album/${album.id}`} className="block group font-sans">
                <div className={cn(
                  "group relative flex flex-col gap-1 p-1 rounded-lg transition-all duration-500 hover:bg-white/[0.03]"
                )}>
                  <div className="relative aspect-square w-full overflow-hidden bg-zinc-900 shadow-xl transition-all duration-500 rounded-lg">
                    {album.coverUrl ? (
                      <img
                        src={getMediaUrl(album.coverUrl)}
                        className="w-full h-full object-cover"
                        alt={album.title}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Disc3 size={32} className="text-zinc-700" />
                      </div>
                    )}
                  </div>
                  <div className="px-1 pt-2 pb-1 flex flex-col gap-0.5">
                    <p className="text-[15px] font-medium transition-colors text-white tracking-tight leading-snug group-hover:text-rose-500 truncate block relative w-full">
                      {formatDisplayTitle(album.title)}
                    </p>
                    <div className="flex items-center gap-1.5 overflow-hidden h-4">
                      <p className="text-[12px] font-medium truncate tracking-tight transition-colors flex-1 font-sans text-zinc-400 capitalize">
                        {new Date(album.releaseDate || album.createdAt).getFullYear()} • {album.title.toLowerCase().includes("single") ? "Single" : "Album"}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
      
      {filteredAlbums.length === 0 && (
        <div className="text-center py-12 text-white/40">
          No releases found in this category.
        </div>
      )}
    </section>
  );
}
