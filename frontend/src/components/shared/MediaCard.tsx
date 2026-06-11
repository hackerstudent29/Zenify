"use client";

import React from "react";
import { Track } from "@/store/player";
import { useIsMobile } from "@/hooks/useIsMobile";
import { PCMediaCard } from "../pc/PCMediaCard";
import { MobileMediaCard } from "../mobile/MobileMediaCard";
import { Music } from "lucide-react";
import { cn, getMediaUrl, getTrackCover } from "@/lib/utils";

interface MediaCardProps {
    track: Track;
    className?: string;
    index?: number;
    contextTracks?: Track[];
}

export function MediaCard(props: MediaCardProps) {
    const isMobile = useIsMobile();

    if (isMobile) {
        return <MobileMediaCard {...props} />;
    }

    return <PCMediaCard {...props} />;
}


