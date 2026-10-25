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
  Heart,
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
  play: Play,
  pause: Pause,
  "skip-back": SkipBack,
  "skip-forward": SkipForward,
  shuffle: Shuffle,
  repeat: Repeat,
  "repeat-once": RepeatOnce,
  heart: Heart,
  search: MagnifyingGlass,
  queue: Queue,
  list: ListBullets,
  microphone: Microphone,
  sliders: SlidersHorizontal,
  more: DotsThree,
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
  info: Info,
  check: Check,
  close: X,
  "volume-high": SpeakerHigh,
  "volume-low": SpeakerLow,
  "volume-mute": SpeakerSlash,
  speaker: SpeakerHigh,
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
