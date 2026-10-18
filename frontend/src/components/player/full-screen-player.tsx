"use client";

import React from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { AnimatePresence } from "framer-motion";

const PCFullScreenPlayer = React.lazy(() =>
  import("@/components/pc/PCFullScreenPlayer").then((m) => ({ default: m.PCFullScreenPlayer }))
);

export function FullScreenPlayer() {
 const isMobile = useIsMobile(768);
 const { isFullScreenPlayerOpen } = useUIStore();
 const currentTrack = usePlayerStore(state => state.currentTrack);

 return (
 <AnimatePresence>
 {isFullScreenPlayerOpen && currentTrack && !isMobile && (
   <React.Suspense fallback={null}>
     <PCFullScreenPlayer key="pc-full-player" />
   </React.Suspense>
 )}
 </AnimatePresence>
 );
}
