"use client";
import React from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  RepeatOnce,
  MagnifyingGlass,
  Queue,
  ListBullets,
  Microphone,
  SlidersHorizontal,
  DotsThree,
  Gear,
  User,
  House,
  Compass,
  Disc,
  Clock,
  Bell,
  CaretLeft,
  CaretRight,
  Plus,
  DownloadSimple,
  ShareNetwork,
  SignOut,
  SignIn,
  HardDrive,
  CreditCard,
  FileText,
  ShieldCheck,
  Sparkle,
  MusicNotes,
  Info,
  Check,
  X,
  SpeakerHigh,
  SpeakerLow,
  SpeakerSlash,
  SpeakerNone,
  ArrowSquareOut,
  FolderSimple,
  Trash,
  PencilSimple,
  ArrowClockwise,
  Eye,
  EyeSlash,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  SwiftUIPlay,
  SwiftUIPause,
  SwiftUIForward,
  SwiftUIBackward,
  SwiftUIShuffle,
  SwiftUIRepeat,
  SwiftUIRepeatOne,
  SwiftUIQueue,
  SwiftUILyrics,
  SwiftUIFx,
  SwiftUISpeaker,
  SwiftUIExpand,
  SwiftUIInfo,
  SwiftUIEllipsis,
  SwiftUIHeart,
} from "@/components/ui/SwiftUIIcons";

export type IconName =
  | "play"
  | "pause"
  | "skip-back"
  | "skip-forward"
  | "shuffle"
  | "repeat"
  | "repeat-once"
  | "heart"
  | "search"
  | "queue"
  | "list"
  | "microphone"
  | "sliders"
  | "more"
  | "settings"
  | "user"
  | "home"
  | "compass"
  | "disc"
  | "clock"
  | "bell"
  | "chevron-left"
  | "chevron-right"
  | "plus"
  | "download"
  | "share"
  | "logout"
  | "login"
  | "hard-drive"
  | "credit-card"
  | "file-text"
  | "shield"
  | "sparkles"
  | "music"
  | "info"
  | "check"
  | "close"
  | "volume-high"
  | "volume-low"
  | "volume-mute"
  | "speaker"
  | "external-link"
  | "folder"
  | "trash"
  | "edit"
  | "refresh"
  | "eye"
  | "eye-slash";

const ICON_MAP: Record<IconName, React.ComponentType<any>> = {
  play: SwiftUIPlay,
  pause: SwiftUIPause,
  "skip-back": SwiftUIBackward,
  "skip-forward": SwiftUIForward,
  shuffle: SwiftUIShuffle,
  repeat: SwiftUIRepeat,
  "repeat-once": SwiftUIRepeatOne,
  heart: SwiftUIHeart,
  search: MagnifyingGlass,
  queue: SwiftUIQueue,
  list: SwiftUIQueue,
  microphone: SwiftUILyrics,
  sliders: SwiftUIFx,
  more: SwiftUIEllipsis,
  settings: Gear,
  user: User,
  home: House,
  compass: Compass,
  disc: Disc,
  clock: Clock,
  bell: Bell,
  "chevron-left": CaretLeft,
  "chevron-right": CaretRight,
  plus: Plus,
  download: DownloadSimple,
  share: ShareNetwork,
  logout: SignOut,
  login: SignIn,
  "hard-drive": HardDrive,
  "credit-card": CreditCard,
  "file-text": FileText,
  shield: ShieldCheck,
  sparkles: Sparkle,
  music: MusicNotes,
  info: SwiftUIInfo,
  check: Check,
  close: X,
  "volume-high": SwiftUISpeaker,
  "volume-low": SwiftUISpeaker,
  "volume-mute": SwiftUISpeaker,
  speaker: SwiftUISpeaker,
  "external-link": ArrowSquareOut,
  folder: FolderSimple,
  trash: Trash,
  edit: PencilSimple,
  refresh: ArrowClockwise,
  eye: Eye,
  "eye-slash": EyeSlash,
};

export interface IconProps {
  name: IconName;
  size?: number;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
  active?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function Icon({
  name,
  size = 20,
  weight,
  active = false,
  className,
  style,
}: IconProps) {
  const Component = ICON_MAP[name];
  if (!Component) {
    console.warn(`[Icon] Unknown icon name: "${name}"`);
    return null;
  }

  // Active state uses "fill" weight for SF Symbols Apple style
  const resolvedWeight = weight || (active ? "fill" : "regular");

  return (
    <Component
      size={size}
      weight={resolvedWeight}
      className={cn(
        "inline-block shrink-0 transition-opacity duration-100",
        active && "text-brand",
        className
      )}
      style={style}
    />
  );
}
