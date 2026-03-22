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
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://listenzenifybackend.up.railway.app/api';
    const proxy = (url: string) => `${API_URL}/utils/proxy-image?url=${encodeURIComponent(url)}`;

    const [imgSrc, setImgSrc] = useState<string | null>(() => (imageUrl ? getMediaUrl(imageUrl) || null : null));
    const [hasFailedOnce, setHasFailedOnce] = useState(false);
    const [useFallback, setUseFallback] = useState(!imageUrl);

    const handleError = () => {
        if (!hasFailedOnce && imageUrl) {
            setHasFailedOnce(true);
            setImgSrc(proxy(imageUrl));
        } else {
            setUseFallback(true);
        }
    };

    const fallbackBg = "bg-rose-500/10";
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=e11d48&color=fff&size=${size}`;

    if (useFallback) {
        return (
            <div className={cn("flex items-center justify-center font-bold", fallbackBg, className)}>
                <img 
                    src={avatarUrl}
                    className="w-full h-full object-cover"
                    alt={name}
                />
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
