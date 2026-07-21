"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { User2 } from "lucide-react";
import { cn, getMediaUrl, formatDisplayTitle } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

interface FansAlsoLikeProps {
  currentArtistId: string;
}

export function FansAlsoLike({ currentArtistId }: FansAlsoLikeProps) {
  const [artists, setArtists] = useState<any[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setHasDragged(false);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  };

  const handleMouseLeave = () => setIsDragging(false);
  const handleMouseUp = () => setIsDragging(false);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 2;
    if (Math.abs(walk) > 5) setHasDragged(true);
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  // Fetch some related artists (mocking it by grabbing generic artists if a specific endpoint doesn't exist)
  useEffect(() => {
    const fetchRelated = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/artists`);
        if (res.ok) {
          const data = await res.json();
          // Filter out current artist and take top 10
          const related = data.filter((a: any) => a.id !== currentArtistId).slice(0, 10);
          setArtists(related);
        }
      } catch (err) {
        console.error("Failed to load related artists", err);
      }
    };
    fetchRelated();
  }, [currentArtistId]);

  if (!artists || artists.length === 0) return null;

  return (
    <section className="mb-16">
      <h2 className="text-2xl font-bold text-white tracking-tight mb-6 px-2">Fans Also Like</h2>
      
      <div 
        ref={scrollRef}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        className="flex gap-4 md:gap-8 overflow-x-auto pb-6 pt-2 px-2 hide-scrollbar cursor-grab active:cursor-grabbing select-none"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {artists.map((artist, idx) => (
          <motion.div
            key={artist.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="shrink-0"
          >
            <Link 
              href={`/artist/${artist.id}`} 
              onClick={(e) => {
                if (hasDragged) {
                  e.preventDefault();
                }
              }}
              draggable={false}
              className="flex flex-col items-center group w-32 md:w-40 text-center"
            >
              <div className="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden mb-4 bg-zinc-900 border-2 border-transparent group-hover:border-white/10 shadow-lg transition-all pointer-events-none">
                {artist.imageUrl ? (
                  <img 
                    src={getMediaUrl(artist.imageUrl)} 
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 pointer-events-none" 
                    alt={artist.name} 
                    draggable={false}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center pointer-events-none">
                    <User2 size={40} className="text-zinc-700" />
                  </div>
                )}
              </div>
              <p className="text-[14px] md:text-[15px] font-bold text-white tracking-tight truncate w-full group-hover:underline decoration-white/30 underline-offset-4 pointer-events-none">
                {formatDisplayTitle(artist.name)}
              </p>
              <p className="text-[12px] text-white/40 font-medium mt-1 uppercase tracking-wider pointer-events-none">
                Artist
              </p>
            </Link>
          </motion.div>
        ))}
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}} />
    </section>
  );
}
