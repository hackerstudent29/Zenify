"use client";

import React from "react";
import { Track } from "@/store/player";
import { useIsMobile } from "@/hooks/useIsMobile";
import { PCMediaCard } from "../pc/PCMediaCard";
import { MobileMediaCard } from "../mobile/MobileMediaCard";

export const MEDIA_CARD_WIDTH = "w-[168px] sm:w-[184px] lg:w-[200px] xl:w-[216px] 2xl:w-[232px]";

export interface MediaCardProps {
  track: Track | any;
  className?: string;
  index?: number;
  contextTracks?: Track[] | any[];
}

export const MediaCard = React.memo(function MediaCard(props: MediaCardProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobileMediaCard {...props} />;
  }

  return <PCMediaCard {...props} />;
});
