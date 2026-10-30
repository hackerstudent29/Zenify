"use client";

/**
 * TrackActionsDropdown — Apple Music (web) style context menu.
 *
 * Modelled on the menu in music.apple.com:
 *  • compact dark glass card, ~8-10px radius, hairline border
 *  • label on the LEFT, icon on the RIGHT of every row
 *  • hairline divider between every row, heavier gap between groups
 *  • fast fade + slight scale from the trigger, no bouncy stagger
 *  • phones (< 640px): same rows in a floating glass bottom sheet
 *
 * Public props are unchanged, so existing callers keep working.
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
  type DragControls,
  type Variants,
} from "framer-motion";
import {
  MoreHorizontal,
  Heart,
  Download,
  User,
  Music,
  Mic,
  RefreshCw,
  ListPlus,
  ListMusic,
  ScrollText,
  Share2,
  SkipForward,
  Info,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/authStore";
import { useRefetchAudio } from "@/hooks/useRefetchAudio";
import { useRefetchLyrics } from "@/hooks/useRefetchLyrics";
import { getRefetchLyricsAnimatedMenuItem } from "@/components/shared/RefetchLyricsSubMenu";
import type { AnimatedMenuItem } from "@/components/ui/animated-dropdown";
import { cn, getArtistTarget, getMediaUrl } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────────────────────── */

export type TrackActionsContext =
  | "track-page"
  | "album"
  | "playlist"
  | "card"
  | "row"
  | "artist";

interface MenuItem {
  id: string;
  label?: string;
  icon?: React.ReactNode;
  onClick?: () => void | Promise<void>;
  isSeparator?: boolean;
  disabled?: boolean;
  className?: string;
  hint?: string;
}

interface TrackActionsDropdownProps {
  track: any;
  trigger?: React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  size?: number;
  /** true = clearer glass (more of the background shows through) */
  glass?: boolean;
  extraItems?: AnimatedMenuItem[];
  hideItems?: string[];
  onShare?: () => Promise<void> | void;
  isLyricsOpen?: boolean;
  onLyricsToggle?: () => void;
  context?: TrackActionsContext;
  triggerClassName?: string;
  showToast?: (msg: string, type?: "success" | "error") => void;
}

/* ──────────────────────────────────────────────────────────────────────────
   Constants & helpers
   ────────────────────────────────────────────────────────────────────────── */

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const Z = 10050;
const GAP = 6;
const MARGIN = 8;
const SHEET_QUERY = "(max-width: 639px)";

const SPRING_POP = { type: "spring", stiffness: 520, damping: 38, mass: 0.6 } as const;
const SPRING_SHEET = { type: "spring", stiffness: 380, damping: 38, mass: 0.9 } as const;
const SPRING_HEART = { type: "spring", stiffness: 520, damping: 13, mass: 0.6 } as const;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * Apple Music glass: dark translucent grey, strong blur + saturation,
 * 1px light hairline border, soft shadow.
 * clear=true → a touch more transparent (used in dark-on-dark contexts)
 */
function glassSurface(clear: boolean, sheet = false): React.CSSProperties {
  const blurAmount = sheet ? 32 : 24;
  const blur = `blur(${blurAmount}px) saturate(200%)`;
  return {
    backgroundColor: clear
      ? "rgba(32, 32, 34, 0.62)"
      : "rgba(28, 28, 30, 0.82)",
    backgroundImage:
      "linear-gradient(180deg, rgba(255,255,255,0.075) 0%, rgba(255,255,255,0) 50%)",
    backdropFilter: blur,
    WebkitBackdropFilter: blur,
    border: "1px solid rgba(255,255,255,0.16)",
    boxShadow:
      "0 20px 60px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)",
  };
}

function trackMeta(track: any) {
  const title: string = track?.title ?? track?.name ?? "Unknown track";
  const artist: string =
    track?.artist?.name ??
    (typeof track?.artist === "string" ? track.artist : undefined) ??
    track?.artist_name ??
    track?.artistName ??
    track?.artists?.[0]?.name ??
    "";
  const rawCover =
    track?.cover_url ??
    track?.coverUrl ??
    track?.cover ??
    track?.image ??
    track?.thumbnail ??
    track?.album?.cover_url ??
    track?.album?.cover ??
    null;
  let cover: string | null = null;
  if (rawCover) {
    try {
      cover = getMediaUrl(rawCover) || rawCover;
    } catch {
      cover = rawCover;
    }
  }
  return { title, artist, cover };
}

type Placement = "top" | "bottom" | "left" | "right";
interface Pos {
  x: number;
  y: number;
  maxH: number;
  originX: number;
  originY: number;
  place: Placement;
}

function computePosition(
  rect: DOMRect,
  w: number,
  h: number,
  side: Placement = "bottom",
  align: "start" | "center" | "end" = "end",
  vw: number,
  vh: number
): Pos {
  const spaceB = vh - rect.bottom - MARGIN - GAP;
  const spaceT = rect.top - MARGIN - GAP;
  const spaceR = vw - rect.right - MARGIN - GAP;
  const spaceL = rect.left - MARGIN - GAP;

  let place: Placement = side;
  if (place === "bottom" && h > spaceB && spaceT > spaceB) place = "top";
  else if (place === "top" && h > spaceT && spaceB > spaceT) place = "bottom";
  else if (place === "right" && w > spaceR && spaceL > spaceR) place = "left";
  else if (place === "left" && w > spaceL && spaceR > spaceL) place = "right";

  let x: number;
  let y: number;
  if (place === "top" || place === "bottom") {
    y = place === "bottom" ? rect.bottom + GAP : rect.top - GAP - h;
    x =
      align === "start"
        ? rect.left
        : align === "center"
        ? rect.left + rect.width / 2 - w / 2
        : rect.right - w;
  } else {
    x = place === "right" ? rect.right + GAP : rect.left - GAP - w;
    y =
      align === "start"
        ? rect.top
        : align === "center"
        ? rect.top + rect.height / 2 - h / 2
        : rect.bottom - h;
  }

  const maxH = vh - MARGIN * 2;
  const hh = Math.min(h, maxH);
  x = clamp(x, MARGIN, Math.max(MARGIN, vw - w - MARGIN));
  y = clamp(y, MARGIN, Math.max(MARGIN, vh - hh - MARGIN));

  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return {
    x,
    y,
    maxH,
    place,
    originX: clamp(cx - x, 0, w),
    originY: place === "top" ? hh : place === "bottom" ? 0 : clamp(cy - y, 0, hh),
  };
}

function useMenuVariants(reduce: boolean | null, sheet: boolean) {
  return useMemo(() => {
    const panel: Variants = reduce
      ? {
          closed: { opacity: 0 },
          open: { opacity: 1, transition: { duration: 0.1 } },
          exit: { opacity: 0, transition: { duration: 0.08 } },
        }
      : sheet
      ? {
          closed: { y: "110%" },
          open: { y: 0, transition: SPRING_SHEET },
          exit: {
            y: "110%",
            transition: { type: "spring", stiffness: 420, damping: 44, mass: 0.8 },
          },
        }
      : {
          closed: { opacity: 0, scale: 0.94 },
          open: {
            opacity: 1,
            scale: 1,
            transition: { ...SPRING_POP, opacity: { duration: 0.12 } },
          },
          exit: {
            opacity: 0,
            scale: 0.97,
            transition: { duration: 0.1, ease: [0.4, 0, 1, 1] },
          },
        };
    return { panel };
  }, [reduce, sheet]);
}

/* ──────────────────────────────────────────────────────────────────────────
   Rows  (label left · icon right · hairline between rows)
   ────────────────────────────────────────────────────────────────────────── */

function PopoverRow({
  item,
  first,
  onSelect,
}: {
  item: MenuItem;
  first: boolean;
  onSelect: (item: MenuItem) => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-menu-item
      tabIndex={-1}
      disabled={item.disabled}
      onClick={() => onSelect(item)}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse" && !item.disabled) {
          e.currentTarget.focus({ preventScroll: true });
        }
      }}
      className={cn(
        "group relative flex h-10 w-full cursor-pointer select-none items-center justify-between gap-4 px-3.5 text-left",
        "text-[14.5px] font-normal tracking-[-0.01em] text-white outline-none",
        "transition-colors duration-100",
        "hover:bg-white/[0.12] focus-visible:bg-white/[0.12]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        // hairline between rows, inset like Apple's
        !first &&
          "before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-white/[0.1] hover:before:opacity-0 focus-visible:before:opacity-0",
        item.className
      )}
    >
      <span className="truncate">{item.label}</span>
      <span className="flex shrink-0 items-center gap-2 text-white/90 [&_svg]:size-[17px] [&_svg]:stroke-[1.7]">
        {item.hint && <span className="text-[11px] text-white/40">{item.hint}</span>}
        {item.icon}
      </span>
    </button>
  );
}

function SheetRow({
  item,
  first,
  onSelect,
}: {
  item: MenuItem;
  first: boolean;
  onSelect: (item: MenuItem) => void;
}) {
  return (
    <motion.button
      type="button"
      role="menuitem"
      data-menu-item
      disabled={item.disabled}
      whileTap={{ backgroundColor: "rgba(255,255,255,0.12)" }}
      transition={{ duration: 0.08 }}
      onClick={() => onSelect(item)}
      className={cn(
        "flex h-[52px] w-full cursor-pointer select-none items-center justify-between gap-4 px-4 text-left",
        "text-[16.5px] font-normal tracking-[-0.011em] text-white outline-none",
        "disabled:cursor-not-allowed disabled:opacity-40",
        !first && "border-t border-white/[0.1]",
        item.className
      )}
    >
      <span className="truncate">{item.label}</span>
      <span className="flex shrink-0 items-center gap-2 text-white/90 [&_svg]:size-[21px] [&_svg]:stroke-[1.6]">
        {item.hint && <span className="text-[13px] text-white/40">{item.hint}</span>}
        {item.icon}
      </span>
    </motion.button>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Popover (desktop / tablet)
   ────────────────────────────────────────────────────────────────────────── */

function Popover({
  groups,
  anchorRef,
  side,
  align,
  clear,
  focusFirst,
  onSelect,
  onClose,
}: {
  groups: MenuItem[][];
  anchorRef: React.RefObject<HTMLElement | null>;
  side?: Placement;
  align: "start" | "center" | "end";
  clear: boolean;
  focusFirst: boolean;
  onSelect: (item: MenuItem) => void;
  onClose: (returnFocus?: boolean) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const reduce = useReducedMotion();
  const { panel } = useMenuVariants(reduce, false);

  // Measure before paint so the menu never flashes in the wrong place.
  useIsoLayoutEffect(() => {
    const a = anchorRef.current;
    const w = wrapRef.current;
    if (!a || !w) return;
    setPos(
      computePosition(
        a.getBoundingClientRect(),
        w.offsetWidth,
        w.offsetHeight,
        side,
        align,
        window.innerWidth,
        window.innerHeight
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const panelEl = panelRef.current;
    if (!panelEl) return;
    if (focusFirst) {
      panelEl
        .querySelector<HTMLElement>("[data-menu-item]:not([disabled])")
        ?.focus({ preventScroll: true });
    } else {
      panelEl.focus({ preventScroll: true });
    }
  }, [focusFirst]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const els = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>("[data-menu-item]:not([disabled])") ?? []
    );
    if (!els.length) return;
    const i = els.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (e.key === "ArrowDown") next = i < 0 ? 0 : (i + 1) % els.length;
    else if (e.key === "ArrowUp") next = i < 0 ? els.length - 1 : (i - 1 + els.length) % els.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = els.length - 1;
    else if (e.key === "Tab") {
      e.preventDefault();
      onClose(true);
      return;
    }
    if (next !== null) {
      e.preventDefault();
      els[next].focus({ preventScroll: true });
      els[next].scrollIntoView({ block: "nearest" });
    }
  };

  return (
    <div
      ref={wrapRef}
      style={{
        position: "fixed",
        left: pos?.x ?? 0,
        top: pos?.y ?? 0,
        width: "min(232px, calc(100vw - 16px))",
        zIndex: Z,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      <motion.div
        ref={panelRef}
        role="menu"
        aria-label="Track actions"
        tabIndex={-1}
        variants={panel}
        initial="closed"
        animate="open"
        exit="exit"
        onKeyDown={onKeyDown}
        className="no-scrollbar overflow-y-auto overscroll-contain rounded-[10px] outline-none"
        style={{
          ...glassSurface(clear),
          transformOrigin: pos ? `${pos.originX}px ${pos.originY}px` : "top right",
          maxHeight: pos?.maxH,
          willChange: "transform, opacity",
        }}
      >
        {groups.map((group, gi) => (
          // heavier gap between groups, like Apple's sectioned menus
          <div key={gi} className={cn(gi > 0 && "border-t-[5px] border-black/25")}>
            {group.map((item, ii) => (
              <PopoverRow key={item.id} item={item} first={ii === 0} onSelect={onSelect} />
            ))}
          </div>
        ))}
      </motion.div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Sheet (phones)
   ────────────────────────────────────────────────────────────────────────── */

function Artwork({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="flex size-12 shrink-0 items-center justify-center rounded-[8px] bg-white/10 text-white/60">
        <Music size={20} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
      className="size-12 shrink-0 rounded-[8px] object-cover shadow-[0_4px_14px_rgba(0,0,0,0.4)]"
    />
  );
}

function Sheet({
  groups,
  track,
  clear,
  onSelect,
  onClose,
}: {
  groups: MenuItem[][];
  track: any;
  clear: boolean;
  onSelect: (item: MenuItem) => void;
  onClose: (returnFocus?: boolean) => void;
}) {
  const reduce = useReducedMotion();
  const controls: DragControls = useDragControls();
  const { panel } = useMenuVariants(reduce, true);
  const meta = trackMeta(track);

  return (
    <div className="fixed inset-0" style={{ zIndex: Z }}>
      <motion.div
        className="absolute inset-0 bg-black/45"
        style={{ touchAction: "none" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={() => onClose(false)}
      />

      <motion.div
        role="menu"
        aria-label="Track actions"
        variants={panel}
        initial="closed"
        animate="open"
        exit="exit"
        drag="y"
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.04, bottom: 0.7 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 110 || info.velocity.y > 700) onClose(false);
        }}
        className="absolute left-2 right-2 flex max-h-[82dvh] flex-col overflow-hidden rounded-[20px]"
        style={{
          ...glassSurface(clear, true),
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
          willChange: "transform",
        }}
      >
        {/* Drag handle + track header */}
        <div
          className="shrink-0 cursor-grab touch-none px-4 pb-3 pt-2.5 active:cursor-grabbing"
          onPointerDown={(e) => controls.start(e)}
        >
          <div className="mx-auto mb-3 h-[5px] w-9 rounded-full bg-white/30" />
          <div className="flex items-center gap-3">
            <Artwork src={meta.cover} />
            <div className="min-w-0">
              <p className="truncate text-[16px] font-semibold leading-tight tracking-[-0.015em] text-white">
                {meta.title}
              </p>
              {meta.artist && (
                <p className="mt-0.5 truncate text-[13.5px] text-white/60">{meta.artist}</p>
              )}
            </div>
          </div>
        </div>

        <div className="h-px shrink-0 bg-white/[0.1]" />

        <div className="no-scrollbar overflow-y-auto overscroll-contain">
          {groups.map((group, gi) => (
            <div key={gi} className={cn(gi > 0 && "border-t-[6px] border-black/25")}>
              {group.map((item, ii) => (
                <SheetRow key={item.id} item={item} first={ii === 0} onSelect={onSelect} />
              ))}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Main component
   ────────────────────────────────────────────────────────────────────────── */

export function TrackActionsDropdown({
  track,
  trigger,
  align = "end",
  side,
  size = 18,
  glass = false,
  extraItems = [],
  hideItems = [],
  onShare,
  isLyricsOpen,
  onLyricsToggle,
  context = "row",
  triggerClassName,
  showToast: externalShowToast,
}: TrackActionsDropdownProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const openDownloadModal = useUIStore((s) => s.openDownloadModal);
  const openAddToPlaylistModal = useUIStore((s) => s.openAddToPlaylistModal);
  const { refetchTrackAudio, isRefetching } = useRefetchAudio();
  const { refetchTrackLyrics } = useRefetchLyrics();

  const [open, setOpen] = useState(false);
  const [isSheet, setIsSheet] = useState(false);
  const [openedByKeyboard, setOpenedByKeyboard] = useState(false);
  const [likePop, setLikePop] = useState(0);
  const anchorRef = useRef<HTMLSpanElement>(null);

  const internalShowToast = (msg: string, type: "success" | "error" = "success") => {
    useUIStore.getState().showToast(msg, type);
  };
  const showToast = externalShowToast ?? internalShowToast;

  /* ── Open / close ── */
  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) {
      requestAnimationFrame(() => {
        anchorRef.current
          ?.querySelector<HTMLElement>("button, a, [tabindex]")
          ?.focus({ preventScroll: true });
      });
    }
  }, []);

  const handleTriggerClick = (e: React.MouseEvent) => {
    // Capture phase: runs before parent row/card/link handlers so opening
    // the menu never plays the track or navigates.
    e.preventDefault();
    e.stopPropagation();
    if (!open) {
      setIsSheet(window.matchMedia(SHEET_QUERY).matches);
      setOpenedByKeyboard(e.detail === 0);
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if ((t as HTMLElement).closest?.("[role='menu']")) return;
      close(false);
    };
    const onScroll = (e: Event) => {
      if (isSheet) return;
      if ((e.target as HTMLElement)?.closest?.("[role='menu']")) return;
      close(false);
    };
    const onResize = () => close(false);

    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, isSheet, close]);

  /* ── Liked state ── */
  const { data: likedTrackIds } = useQuery({
    queryKey: ["liked-track-ids"],
    queryFn: async () => {
      const res = await api.get("tracks/liked");
      const arr = Array.isArray(res.data) ? res.data : res.data?.items || [];
      return arr.map((t: any) => t.id) as string[];
    },
    staleTime: 1000 * 60 * 5,
  });

  const isLiked = likedTrackIds?.includes(track?.id);

  const toggleLikeMutation = useMutation({
    mutationFn: () => api.post(`/tracks/${track.id}/like`),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["liked-track-ids"] });
      const prev = queryClient.getQueryData<string[]>(["liked-track-ids"]);
      const next = prev
        ? prev.includes(track.id)
          ? prev.filter((id) => id !== track.id)
          : [...prev, track.id]
        : [track.id];
      queryClient.setQueryData(["liked-track-ids"], next);
      showToast(prev?.includes(track.id) ? "Removed from Liked Songs" : "Added to Liked Songs");
      return { prev };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["liked-track-ids"], ctx.prev);
      showToast("Failed to update liked state", "error");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["liked-track-ids"] });
      queryClient.invalidateQueries({ queryKey: ["liked-tracks"] });
    },
  });

  /* ── Share ── */
  const handleShare = async () => {
    if (onShare) {
      await onShare();
      return;
    }
    const url = `${window.location.origin}/track/${track.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: track.title, url });
      } catch (e) {
        if ((e as Error).name !== "AbortError") showToast("Error sharing", "error");
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        showToast("Link copied!");
      } catch {
        showToast("Failed to copy", "error");
      }
    }
  };

  /* ── Go to artist ── */
  const handleGoToArtist = () => {
    const target = getArtistTarget(track);
    if (target) router.push(target);
    else showToast("Artist information not available", "error");
  };

  /* ── Build items ── */
  const hide = new Set(hideItems);
  const playerState: any = usePlayerStore.getState();
  const canPlayNext = typeof playerState?.playNext === "function";

  const rawItems = [
    /* Group 1 · play */
    canPlayNext &&
      !hide.has("play-next") && {
        id: "play-next",
        icon: <SkipForward size={14} />,
        label: "Play Next",
        onClick: () => (usePlayerStore.getState() as any).playNext(track),
      },

    !hide.has("queue") && {
      id: "queue",
      icon: <ListPlus size={14} />,
      label: "Add to Queue",
      onClick: () => usePlayerStore.getState().addToUserQueue(track),
    },

    { id: "sep-play", isSeparator: true },

    /* Group 2 · library */
    !hide.has("like") && {
      id: "like",
      icon: (
        <motion.span
          key={likePop}
          className="flex"
          initial={likePop > 0 ? { scale: 0.4 } : false}
          animate={{ scale: 1 }}
          transition={SPRING_HEART}
        >
          <Heart size={14} className={cn(isLiked && "fill-current text-brand")} />
        </motion.span>
      ),
      label: isLiked ? "Liked" : "Like",
      onClick: () => {
        setLikePop((n) => n + 1);
        toggleLikeMutation.mutate();
      },
    },

    !hide.has("add-to-playlist") && {
      id: "add-to-playlist",
      icon: <ListMusic size={14} />,
      label: "Add to Playlist",
      onClick: () => openAddToPlaylistModal(track),
    },

    { id: "sep-library", isSeparator: true },

    /* Group 3 · navigate */
    !hide.has("lyrics") &&
      onLyricsToggle && {
        id: "lyrics",
        icon: <ScrollText size={14} />,
        label: isLyricsOpen ? "Close Lyrics" : "View Lyrics",
        onClick: () => {
          const store = usePlayerStore.getState();
          if (!store.currentTrack || store.currentTrack?.id !== track.id) {
            store.setTrack(track, [track]);
            useUIStore.getState().setPlayerMinimized(false);
          }
          onLyricsToggle();
        },
      },

    !hide.has("view-details") &&
      context !== "track-page" && {
        id: "view-details",
        icon: <Info size={14} />,
        label: "View Details",
        onClick: () => router.push(`/track/${track.id}`),
      },

    !hide.has("artist") &&
      getArtistTarget(track) && {
        id: "artist",
        icon: <User size={14} />,
        label: "Go to Artist",
        onClick: handleGoToArtist,
      },

    { id: "sep-nav", isSeparator: true },

    /* Group 4 · maintenance */
    !hide.has("refetch-audio") && {
      id: "refetch-audio",
      icon: (
        <RefreshCw
          size={14}
          className={cn(isRefetching === track.id && "animate-spin text-brand")}
        />
      ),
      label: isRefetching === track.id ? "Refetching Audio…" : "Refetch Audio",
      onClick: () => refetchTrackAudio(track, showToast),
    },

    !hide.has("refetch-lyrics") &&
      getRefetchLyricsAnimatedMenuItem(track, refetchTrackLyrics, showToast),

    !hide.has("sync-lyrics") &&
      user?.role === "ADMIN" && {
        id: "sync-lyrics",
        icon: <Mic size={14} className="text-violet-400" />,
        label: "Sync Lyrics",
        className: "text-violet-400",
        onClick: () => router.push(`/admin/lyric-sync?trackId=${track.id}`),
      },

    ...(extraItems.length > 0
      ? [{ id: "sep-extra", isSeparator: true }, ...(extraItems as unknown as MenuItem[])]
      : []),

    { id: "sep-end", isSeparator: true },

    /* Last group · share */
    !hide.has("download") && {
      id: "download",
      icon: <Download size={14} />,
      label: "Download",
      onClick: () => openDownloadModal(track),
    },

    !hide.has("share") && {
      id: "share",
      icon: <Share2 size={14} />,
      label: "Share",
      onClick: handleShare,
    },
  ].filter(Boolean) as unknown as MenuItem[];

  const groups = buildGroups(rawItems);

  const handleSelect = (item: MenuItem) => {
    if (item.disabled) return;
    if (item.id === "like") {
      item.onClick?.();
      window.setTimeout(() => close(false), 240);
      return;
    }
    close(false);
    item.onClick?.();
  };

  /* ── Default trigger ── */
  const defaultTrigger = (
    <motion.button
      whileTap={{ scale: 0.9 }}
      transition={{ type: "spring", stiffness: 420, damping: 22 }}
      className={cn(
        "flex cursor-pointer items-center justify-center rounded-full text-white/70 outline-none transition-colors hover:text-white",
        triggerClassName ??
          "h-9 w-9 border border-white/15 bg-white/10 backdrop-blur-md hover:bg-white/20"
      )}
      title="More options"
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
    >
      <MoreHorizontal size={size} />
    </motion.button>
  );

  return (
    <>
      <span ref={anchorRef} className="inline-flex" onClick={handleTriggerClick}>
        {trigger ?? defaultTrigger}
      </span>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <div
                key="track-actions-layer"
                // Portals bubble React events to ancestors (rows, cards, links).
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.stopPropagation()}
              >
                {isSheet ? (
                  <Sheet
                    groups={groups}
                    track={track}
                    clear={glass}
                    onSelect={handleSelect}
                    onClose={close}
                  />
                ) : (
                  <Popover
                    groups={groups}
                    anchorRef={anchorRef}
                    side={side}
                    align={align}
                    clear={glass}
                    focusFirst={openedByKeyboard}
                    onSelect={handleSelect}
                    onClose={close}
                  />
                )}
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Grouping helper
   ────────────────────────────────────────────────────────────────────────── */

function buildGroups(items: MenuItem[]): MenuItem[][] {
  const groups: MenuItem[][] = [[]];
  for (const it of items) {
    if (it.isSeparator) {
      if (groups[groups.length - 1].length) groups.push([]);
    } else {
      groups[groups.length - 1].push(it);
    }
  }
  return groups.filter((g) => g.length > 0);
}