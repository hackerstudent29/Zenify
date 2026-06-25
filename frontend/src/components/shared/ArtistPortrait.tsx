"use client";

import { cn, getMediaUrl } from "@/lib/utils";
import { useState } from "react";

interface ArtistPortraitProps {
 imageUrl?: string | null;
 name: string;
 className?: string;
 size?: number;
}

export function ArtistPortrait({ imageUrl, name, className, size = 512 }: ArtistPortraitProps) {
 const API_URL = import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL || 'https://zenify-production-111f.up.railway.app/api';
 const proxy = (url: string) => `${API_URL}/utils/proxy-image?url=${encodeURIComponent(url)}`;

 const [imgSrc, setImgSrc] = useState<string | null>(() => (imageUrl ? getMediaUrl(imageUrl) || null : null));
 const [hasFailedOnce, setHasFailedOnce] = useState(false);
 const [useFallback, setUseFallback] = useState(!imageUrl);

 const handleError = () => {
 if (!hasFailedOnce && imageUrl) {
 const fallbackUrl = proxy(imageUrl);
 if (imgSrc === fallbackUrl) {
 setUseFallback(true);
 } else {
 setHasFailedOnce(true);
 setImgSrc(fallbackUrl);
 }
 } else {
 setUseFallback(true);
 }
 };

 const fallbackBg = "bg-gradient-to-br from-rose-500/20 to-rose-600/40 text-rose-200 border border-rose-500/10";
 
 // Extract initials (e.g. "Anirudh Ravichander" -> "AR")
 const getInitials = (name: string) => {
  if (!name) return "?";
  const parts = name.split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

 if (useFallback) {
 return (
 <div className={cn("flex items-center justify-center font-bold tracking-wider shadow-xl shadow-rose-500/5", fallbackBg, className)}>
 <span className="opacity-80" style={{ fontSize: `${Math.max(12, size / 3)}px` }}>
 {getInitials(name)}
 </span>
 </div>
 );
 }

 return (
 <div className={cn("overflow-hidden bg-zinc-900 shadow-xl shadow-rose-500/5", className)}>
 <img
 src={imgSrc || ""}
 onError={handleError}
 className="w-full h-full object-cover"
 alt={name}
 />
 </div>
 );
}
