"use client";

import React from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { PremiumMobilePlayer } from "@/components/mobile/PremiumMobilePlayer";
import { PCPlayerBar } from "@/components/pc/PCPlayerBar";

export function PlayerBar() {
 const isMobile = useIsMobile();

 if (isMobile) {
 return <PremiumMobilePlayer />;
 }

 return <PCPlayerBar />;
}
