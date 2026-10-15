"use client";

import React from "react";
import {
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { FileText, Sparkles, Mic, Music, Radio, Disc3, Globe, Video, Wand2 } from "lucide-react";
import { LYRICS_PROVIDERS, LyricsProvider } from "@/hooks/useRefetchLyrics";
import { AnimatedMenuItem } from "@/components/ui/animated-dropdown";

interface RefetchLyricsSubMenuProps {
  track: any;
  refetchTrackLyrics: (track: any, provider?: LyricsProvider, showToast?: (msg: string, type: 'success' | 'error') => void) => Promise<any>;
  showToast?: (msg: string, type: 'success' | 'error') => void;
  className?: string;
}

export function RefetchLyricsSubMenu({
  track,
  refetchTrackLyrics,
  showToast,
  className
}: RefetchLyricsSubMenuProps) {
  if (!track?.id) return null;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className={className || "flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium outline-none transition-all hover:bg-white/10 hover:text-white"}>
        <FileText size={14} className="text-brand opacity-70" />
        <span>Refetch Lyrics</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="min-w-[230px] bg-zinc-900/95 backdrop-blur-2xl border border-white/10 shadow-2xl rounded-2xl p-1.5 z-[9999]">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
            Select Provider Engine
          </div>
          {LYRICS_PROVIDERS.map((provider) => (
            <DropdownMenuItem
              key={provider.id}
              onSelect={(e) => {
                e?.preventDefault?.();
                refetchTrackLyrics(track, provider.id, showToast);
              }}
              className="flex items-center justify-between px-2.5 py-2 text-xs rounded-xl cursor-pointer hover:bg-white/10 text-white/90 hover:text-white transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-sm shrink-0">{provider.icon}</span>
                <span className="font-medium truncate">{provider.label}</span>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}

export function getRefetchLyricsAnimatedMenuItem(
  track: any,
  refetchTrackLyrics: (track: any, provider?: LyricsProvider, showToast?: (msg: string, type: 'success' | 'error') => void) => Promise<any>,
  showToast?: (msg: string, type: 'success' | 'error') => void
): AnimatedMenuItem {
  return {
    id: "refetch-lyrics",
    icon: <FileText size={14} className="opacity-70 text-brand" />,
    label: "Refetch Lyrics",
    subMenu: LYRICS_PROVIDERS.map((provider) => ({
      id: `lyrics-${provider.id}`,
      icon: <span className="text-xs">{provider.icon}</span>,
      label: provider.label,
      onClick: (e: any) => {
        e?.stopPropagation?.();
        refetchTrackLyrics(track, provider.id, showToast);
      }
    }))
  };
}
