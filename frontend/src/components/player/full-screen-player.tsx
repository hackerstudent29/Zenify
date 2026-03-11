"use client";

import React from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { MobileFullScreenPlayer } from "@/components/mobile/MobileFullScreenPlayer";
import { PCFullScreenPlayer } from "@/components/pc/PCFullScreenPlayer";
import { AnimatePresence } from "framer-motion";

export function FullScreenPlayer() {
    const isMobile = useIsMobile(1024);
    const isFullScreenPlayerOpen = useUIStore(state => state.isFullScreenPlayerOpen);
    const currentTrack = usePlayerStore(state => state.currentTrack);

    return (
        <AnimatePresence>
            {isFullScreenPlayerOpen && (
                isMobile ? (
                    <MobileFullScreenPlayer key="mobile-player" />
                ) : (
                    <PCFullScreenPlayer key="pc-player" />
                )
            )}
        </AnimatePresence>
    );
}
