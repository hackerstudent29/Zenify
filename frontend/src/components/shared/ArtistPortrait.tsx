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
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
    const proxy = (url: string) => `${API_URL}/utils/proxy-image?url=${encodeURIComponent(url)}`;
    
    const [imgSrc, setImgSrc] = useState<string | null>(() => (imageUrl ? getMediaUrl(imageUrl) || null : null));
    const [hasFailedOnce, setHasFailedOnce] = useState(false);
    const [useFallback, setUseFallback] = useState(!imageUrl);

    const handleError = () => {
        if (!hasFailedOnce && imageUrl) {
            // Tier 1: Try proxying
            setHasFailedOnce(true);
            setImgSrc(proxy(imageUrl));
        } else {
            // Tier 2: UI-avatars
            setUseFallback(true);
        }
    };

    if (useFallback) {
        return (
            <div className={cn("flex items-center justify-center bg-zinc-900 text-white/40 font-bold", className)}>
                <img 
                    src={`https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&size=${size}`}
                    className="w-full h-full object-cover"
                    alt={name}
                />
            </div>
        );
    }

    return (
        <div className={cn("overflow-hidden bg-zinc-900", className)}>
            <img
                src={imgSrc || ""}
                onError={handleError}
                className="w-full h-full object-cover"
                alt={name}
            />
        </div>
    );
}
