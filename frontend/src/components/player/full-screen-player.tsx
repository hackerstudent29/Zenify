"use client";

import React from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { MobileFullScreenPlayer } from "@/components/mobile/MobileFullScreenPlayer";
import { PCFullScreenPlayer } from "@/components/pc/PCFullScreenPlayer";

export function FullScreenPlayer() {
    const isMobile = useIsMobile(768);
    const currentTrack = usePlayerStore(state => state.currentTrack);

    if (!currentTrack) return null;

    // MobileFullScreenPlayer manages its own AnimatePresence internally
    if (isMobile) {
        return <MobileFullScreenPlayer />;
    }

    return <PCFullScreenPlayer />;
}
