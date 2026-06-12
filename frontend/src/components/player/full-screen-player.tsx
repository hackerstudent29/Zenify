"use client";

import React from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { PCFullScreenPlayer } from "@/components/pc/PCFullScreenPlayer";
import { motion, AnimatePresence } from "framer-motion";

export function FullScreenPlayer() {
 const isMobile = useIsMobile(768);
 const { isFullScreenPlayerOpen } = useUIStore();
 const currentTrack = usePlayerStore(state => state.currentTrack);

 return (
 <AnimatePresence>
 {isFullScreenPlayerOpen && currentTrack && !isMobile && (
 <PCFullScreenPlayer key="pc-full-player" />
 )}
 </AnimatePresence>
 );
}
