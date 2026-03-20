"use client";

import React from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { PCFullScreenPlayer } from "@/components/pc/PCFullScreenPlayer";

export function FullScreenPlayer() {
    const isMobile = useIsMobile(768);
    const currentTrack = usePlayerStore(state => state.currentTrack);

    if (!currentTrack) return null;

    // Mobile is now handled by PremiumMobilePlayer in a single component flow
    if (isMobile) {
        return null;
    }

    return <PCFullScreenPlayer />;
}
