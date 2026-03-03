"use client";

import React from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobilePlayerBar } from "@/components/mobile/MobilePlayerBar";
import { PCPlayerBar } from "@/components/pc/PCPlayerBar";

export function PlayerBar() {
    const isMobile = useIsMobile();

    if (isMobile) {
        return <MobilePlayerBar />;
    }

    return <PCPlayerBar />;
}
