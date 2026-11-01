"use client";

/**
 * TrackActionsDropdown — compact Apple Music style menu with in-place drill-down.
 *
 *  • small, compact rows (32px desktop / 44px phone), ~208px wide
 *  • rows with more options (Go to ▸, Share ▸, Admin ▸) open a sub-menu IN THE SAME
 *    PANEL: the content slides, the panel height springs to fit, a back row returns
 *  • result states on the rows that need them: Plays next · Added to queue · Liked ·
 *    Link copied · Playing · Shuffling  (icon + label swap with spring physics)
 *  • lighter glass: less blur, more transparency, so the page behind shows through
 *  • phones (< 640px): same views in a floating bottom sheet (drag to dismiss)
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
  Play,
  Disc,
  FileText,
  Check,
  ChevronRight,
  ChevronLeft,
  Link2,
  ShieldCheck,
} from "lucide-react";
import { SwiftUIHeart, SwiftUIShuffle, SwiftUIEllipsis } from "@/components/ui/SwiftUIIcons";
import { useRouter, usePathname } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/authStore";
import { useRefetchAudio } from "@/hooks/useRefetchAudio";
import { useRefetchLyrics } from "@/hooks/useRefetchLyrics";
import type { AnimatedMenuItem } from "@/components/ui/animated-dropdown";
import { cn, getArtistTarget, getMediaUrl, getTrackCover } from "@/lib/utils";

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

export interface MenuItem {
  id: string;
  label?: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: (e?: any) => void | Promise<void>;
  isSeparator?: boolean;
  disabled?: boolean;
  className?: string;
  hint?: string;
  /** Opens these items in the same panel (drill-down) */
  children?: MenuItem[];
  /** After the click, the row shows this text + a check, then the menu closes */
  doneLabel?: string;
  doneIcon?: React.ReactNode;
}

export interface TrackActionsDropdownProps {
  track?: any;
  items?: MenuItem[];
  trigger?: React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  size?: number;
  /** true = clearer glass (even more of the background shows through) */
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
const DONE_MS = 800;

/* Springs */
const SPRING_POP = { type: "spring", stiffness: 560, damping: 36, mass: 0.6 } as const;
const SPRING_HEIGHT = { type: "spring", stiffness: 520, damping: 40, mass: 0.7 } as const;
const SPRING_VIEW = { type: "spring", stiffness: 560, damping: 38, mass: 0.55 } as const;
const SPRING_ICON = { type: "spring", stiffness: 720, damping: 20, mass: 0.5 } as const;
const SPRING_SHEET = { type: "spring", stiffness: 380, damping: 38, mass: 0.9 } as const;
const SPRING_HEART = { type: "spring", stiffness: 520, damping: 13, mass: 0.6 } as const;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * Lighter glass: low blur + low opacity so the background shows through.
 * clear = even lighter.
 */
export function glassSurface(clear: boolean = false, sheet = false): React.CSSProperties {
  const blur = sheet
    ? "blur(12px) saturate(170%)"
    : clear
    ? "blur(5px) saturate(160%)"
    : "blur(8px) saturate(170%)";
  return {
    backgroundColor: clear
      ? "rgba(28, 28, 30, 0.32)"
      : sheet
      ? "rgba(28, 28, 30, 0.54)"
      : "rgba(28, 28, 30, 0.44)",
    backgroundImage:
      "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 55%)",
    backdropFilter: blur,
    WebkitBackdropFilter: blur,
    border: "1px solid rgba(255,255,255,0.18)",
    boxShadow:
      "0 16px 44px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.12)",
    textShadow: "0 1px 3px rgba(0,0,0,0.4)",
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
  /** distance from the viewport bottom — used when the menu opens upward */
  by: number;
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
    by: vh - (y + hh),
    maxH,
    place,
    originX: clamp(cx - x, 0, w),
    originY: place === "top" ? hh : place === "bottom" ? 0 : clamp(cy - y, 0, hh),
  };
}

function usePanelVariants(reduce: boolean | null, sheet: boolean) {
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
          closed: { opacity: 0, scale: 0.9 },
          open: {
            opacity: 1,
            scale: 1,
            transition: { ...SPRING_POP, opacity: { duration: 0.12 } },
          },
          exit: {
            opacity: 0,
            scale: 0.96,
            transition: { duration: 0.1, ease: [0.4, 0, 1, 1] },
          },
        };
    return panel;
  }, [reduce, sheet]);
}

/* ──────────────────────────────────────────────────────────────────────────
   View stack — animates between root / sub-menus inside ONE panel
   ────────────────────────────────────────────────────────────────────────── */

interface ViewProps {
  viewKey: string;
  dir: 1 | -1;
  title: React.ReactNode;
  onBack?: () => void;
  groups: MenuItem[][];
  doneId: string | null;
  onSelect: (item: MenuItem) => void;
}

function Row({
  item,
  sheet,
  done,
  onSelect,
}: {
  item: MenuItem;
  sheet: boolean;
  done: boolean;
  onSelect: (item: MenuItem) => void;
}) {
  const hasSub = Boolean(item.children?.length);
  return (
    <button
      type="button"
      role="menuitem"
      data-menu-item
      data-sub={hasSub ? "" : undefined}
      tabIndex={-1}
      disabled={item.disabled}
      onClick={() => onSelect(item)}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center justify-between gap-3 text-left font-medium text-white outline-none transition-colors duration-150",
        "hover:bg-white/[0.12] active:bg-white/[0.20] focus-visible:bg-white/[0.12]",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
        sheet
          ? "h-11 rounded-[10px] px-3.5 text-[15px] tracking-[-0.011em]"
          : "h-8 rounded-[7px] px-2.5 text-[13px] tracking-[-0.006em]",
        item.className
      )}
    >
      <span className="relative min-w-0 flex-1">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={done ? "done" : "idle"}
            initial={{ opacity: 0, y: 7 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -7 }}
            transition={SPRING_VIEW}
            className="block truncate"
          >
            {done ? item.doneLabel : item.label}
          </motion.span>
        </AnimatePresence>
      </span>

      <span
        className={cn(
          "relative flex shrink-0 items-center gap-1.5 text-white/80",
          sheet ? "[&_svg]:size-[19px]" : "[&_svg]:size-[15px]",
          "[&_svg]:stroke-[1.8]"
        )}
      >
        {item.hint && <span className="text-[11px] text-white/45">{item.hint}</span>}
        {hasSub ? (
          <ChevronRight className="text-white/55" />
        ) : (
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={done ? "done" : "idle"}
              initial={{ scale: 0.3, opacity: 0, rotate: -30 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.3, opacity: 0 }}
              transition={SPRING_ICON}
              className={cn("flex", done && "text-brand")}
            >
              {done ? item.doneIcon ?? <Check strokeWidth={2.6} /> : item.icon}
            </motion.span>
          </AnimatePresence>
        )}
      </span>
    </button>
  );
}

function ViewStack({
  view,
  sheet,
  maxH,
}: {
  view: ViewProps;
  sheet: boolean;
  maxH: number | string;
}) {
  const reduce = useReducedMotion();
  const innerRef = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | null>(null);

  // Track the natural height of whichever view is showing; the panel springs to it.
  useIsoLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const viewVariants: Variants = {
    enter: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * 22 }),
    center: { opacity: 1, x: 0, transition: reduce ? { duration: 0.1 } : SPRING_VIEW },
    exit: (d: number) => ({
      opacity: 0,
      x: reduce ? 0 : d * -22,
      transition: { duration: 0.08, ease: [0.4, 0, 1, 1] },
    }),
  };

  return (
    <motion.div
      initial={false}
      animate={h == null ? undefined : { height: h }}
      transition={reduce ? { duration: 0 } : SPRING_HEIGHT}
      style={{ overflow: "hidden" }}
    >
      <div ref={innerRef}>
        <AnimatePresence mode="wait" initial={false} custom={view.dir}>
          <motion.div
            key={view.viewKey}
            custom={view.dir}
            variants={viewVariants}
            initial="enter"
            animate="center"
            exit="exit"
            style={{ maxHeight: maxH }}
            className={cn(
              "no-scrollbar relative overflow-y-auto overscroll-contain",
              sheet ? "p-2" : "p-1"
            )}
          >
            {view.onBack && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  data-menu-item
                  tabIndex={-1}
                  onClick={view.onBack}
                  className={cn(
                    "relative flex w-full cursor-pointer select-none items-center gap-1.5 text-left font-semibold text-white outline-none transition-colors duration-150 hover:bg-white/[0.12] active:bg-white/[0.20] focus-visible:bg-white/[0.12]",
                    sheet
                      ? "h-11 rounded-[10px] px-2.5 text-[15px]"
                      : "h-8 rounded-[7px] px-1.5 text-[13px]"
                  )}
                >
                  <ChevronLeft className={sheet ? "size-5" : "size-4"} strokeWidth={2.2} />
                  <span className="truncate">{view.title}</span>
                </button>
                <div className="mx-2 my-1 h-px bg-white/[0.14]" />
              </>
            )}

            {view.groups.map((group, gi) => (
              <React.Fragment key={gi}>
                {gi > 0 && <div className="mx-2 my-1 h-px bg-white/[0.14]" />}
                {group.map((item) => (
                  <Row
                    key={item.id}
                    item={item}
                    sheet={sheet}
                    done={view.doneId === item.id && Boolean(item.doneLabel)}
                    onSelect={view.onSelect}
                  />
                ))}
              </React.Fragment>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Popover (desktop / tablet)
   ────────────────────────────────────────────────────────────────────────── */

function Popover({
  view,
  anchorRef,
  side,
  align,
  clear,
  focusFirst,
  onClose,
}: {
  view: ViewProps;
  anchorRef: React.RefObject<HTMLElement | null>;
  side?: Placement;
  align: "start" | "center" | "end";
  clear: boolean;
  focusFirst: boolean;
  onClose: (returnFocus?: boolean) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const reduce = useReducedMotion();
  const panel = usePanelVariants(reduce, false);

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

  // Keyboard users: land on the first row of every view
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const t = window.setTimeout(() => {
      if (focusFirst) {
        el.querySelector<HTMLElement>("[data-menu-item]:not([disabled])")?.focus({ preventScroll: true });
      } else if (!el.contains(document.activeElement)) {
        el.focus({ preventScroll: true });
      }
    }, view.viewKey === "root" ? 0 : 140);
    return () => window.clearTimeout(t);
  }, [focusFirst, view.viewKey]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const els = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>("[data-menu-item]:not([disabled])") ?? []
    );
    if (!els.length) return;
    const cur = document.activeElement as HTMLElement;
    const i = els.indexOf(cur);
    let next: number | null = null;
    if (e.key === "ArrowDown") next = i < 0 ? 0 : (i + 1) % els.length;
    else if (e.key === "ArrowUp") next = i < 0 ? els.length - 1 : (i - 1 + els.length) % els.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = els.length - 1;
    else if (e.key === "ArrowRight" && cur?.hasAttribute("data-sub")) {
      e.preventDefault();
      cur.click();
      return;
    } else if (e.key === "ArrowLeft" && view.onBack) {
      e.preventDefault();
      view.onBack();
      return;
    } else if (e.key === "Tab") {
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

  const up = pos?.place === "top";

  return (
    <div
      ref={wrapRef}
      style={{
        position: "fixed",
        left: pos?.x ?? 0,
        // opening upward? keep the bottom edge fixed so growing views extend up
        ...(up ? { bottom: pos!.by } : { top: pos?.y ?? 0 }),
        width: "min(208px, calc(100vw - 16px))",
        zIndex: Z,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      <motion.div
        ref={panelRef}
        role="menu"
        aria-label="Actions"
        tabIndex={-1}
        variants={panel}
        initial="closed"
        animate="open"
        exit="exit"
        onKeyDown={onKeyDown}
        className="overflow-hidden rounded-[12px] outline-none"
        style={{
          ...glassSurface(clear),
          transformOrigin: pos ? `${pos.originX}px ${up ? "100%" : pos.originY + "px"}` : "top right",
          maxHeight: pos?.maxH,
          willChange: "transform, opacity",
        }}
      >
        <ViewStack view={view} sheet={false} maxH={pos?.maxH ?? "80vh"} />
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
      <div className="flex size-10 shrink-0 items-center justify-center rounded-[7px] bg-white/10 text-white/60">
        <Music size={18} />
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
      className="size-10 shrink-0 rounded-[7px] object-cover shadow-[0_4px_14px_rgba(0,0,0,0.4)]"
    />
  );
}

function Sheet({
  view,
  track,
  clear,
  onClose,
}: {
  view: ViewProps;
  track?: any;
  clear: boolean;
  onClose: (returnFocus?: boolean) => void;
}) {
  const reduce = useReducedMotion();
  const controls: DragControls = useDragControls();
  const panel = usePanelVariants(reduce, true);
  const meta = track ? trackMeta(track) : null;
  const showHeader = Boolean(meta && (meta.title !== "Unknown track" || meta.artist));

  return (
    <div className="fixed inset-0" style={{ zIndex: Z }}>
      <motion.div
        className="absolute inset-0 bg-black/35"
        style={{ touchAction: "none" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={() => onClose(false)}
      />

      <motion.div
        role="menu"
        aria-label="Actions"
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
          if (info.offset.y > 100 || info.velocity.y > 650) onClose(false);
        }}
        className="absolute left-2 right-2 mx-auto flex max-h-[80dvh] max-w-[420px] flex-col overflow-hidden rounded-[20px]"
        style={{
          ...glassSurface(clear, true),
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
          willChange: "transform",
        }}
      >
        {/* Drag handle (+ compact track header) */}
        <div
          className={cn("shrink-0 cursor-grab touch-none px-4 active:cursor-grabbing", showHeader ? "pb-2.5 pt-2" : "py-2.5")}
          onPointerDown={(e) => controls.start(e)}
        >
          <div className={cn("mx-auto h-[4px] w-9 rounded-full bg-white/35", showHeader && "mb-2.5")} />
          {showHeader && meta && (
            <div className="flex items-center gap-2.5">
              <Artwork src={meta.cover} />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold leading-tight tracking-[-0.012em] text-white">
                  {meta.title}
                </p>
                {meta.artist && <p className="mt-0.5 truncate text-[12.5px] text-white/65">{meta.artist}</p>}
              </div>
            </div>
          )}
        </div>

        <div className="h-px shrink-0 bg-white/[0.12]" />

        <ViewStack view={view} sheet maxH="calc(80dvh - 96px)" />
      </motion.div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Main component
   ────────────────────────────────────────────────────────────────────────── */

export function TrackActionsDropdown({
  track,
  items,
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
  const pathname = usePathname() || "";
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
  const [path, setPath] = useState<string[]>([]);
  const [dir, setDir] = useState<1 | -1>(1);
  const [doneId, setDoneId] = useState<string | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<number | null>(null);
  const pathRef = useRef<string[]>([]);
  pathRef.current = path;

  const internalShowToast = (msg: string, type: "success" | "error" = "success") => {
    useUIStore.getState().showToast(msg, type);
  };
  const showToast = externalShowToast ?? internalShowToast;

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  useEffect(() => clearTimer, []);

  /* ── Open / close ── */
  const close = useCallback((returnFocus = false) => {
    clearTimer();
    setOpen(false);
    if (returnFocus) {
      requestAnimationFrame(() => {
        anchorRef.current
          ?.querySelector<HTMLElement>("button, a, [tabindex]")
          ?.focus({ preventScroll: true });
      });
    }
  }, []);

  const goBack = useCallback(() => {
    setDir(-1);
    setPath((p) => p.slice(0, -1));
  }, []);

  const handleTriggerClick = (e: React.MouseEvent) => {
    // Capture phase: runs before parent row/card/link handlers so opening
    // the menu never plays the track or navigates.
    e.preventDefault();
    e.stopPropagation();
    if (!open) {
      clearTimer();
      setPath([]);
      setDoneId(null);
      setDir(1);
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
        if (pathRef.current.length) goBack();
        else close(true);
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
  }, [open, isSheet, close, goBack]);

  /* ── Context & entity detection ── */
  const onArtistPage = pathname.startsWith("/artist");
  const onAlbumPage = pathname.startsWith("/album");
  const onTrackPage = pathname.startsWith("/track");
  const onPlaylistPage = pathname.startsWith("/playlist");

  const isAdmin = user?.role === "ADMIN" || (user as any)?.role === "admin";

  const isArtist =
    context === "artist" ||
    track?.type === "artist" ||
    Boolean(track?.isArtist) ||
    Boolean(track?.artistRole) ||
    (Boolean(track?.bio) && !track?.albumId && !track?.streamUrl);

  const isAlbum =
    context === "album" ||
    track?.type === "album" ||
    Boolean(track?.isAlbum) ||
    Boolean(track?.albumType) ||
    (track?.totalTracks !== undefined && !track?.playlistId);

  const isPlaylist =
    context === "playlist" ||
    track?.type === "playlist" ||
    Boolean(track?.isPlaylist) ||
    (track?.trackCount !== undefined && !track?.albumType && track?.totalTracks === undefined);

  const isSong = !isArtist && !isAlbum && !isPlaylist;

  /* ── Liked state (songs) ── */
  const { data: likedTrackIds } = useQuery({
    queryKey: ["liked-track-ids"],
    queryFn: async () => {
      const res = await api.get("tracks/liked");
      const arr = Array.isArray(res.data) ? res.data : res.data?.items || [];
      return arr.map((t: any) => t.id) as string[];
    },
    staleTime: 1000 * 60 * 5,
    enabled: Boolean(track?.id && isSong),
  });

  const isLiked = track?.id ? likedTrackIds?.includes(track.id) : false;

  const toggleLikeMutation = useMutation({
    mutationFn: () => api.post(`/tracks/${track?.id}/like`),
    onMutate: async () => {
      if (!track?.id) return;
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

  /* ── Share helpers ── */
  const shareId = String(track?.id || track?.name || "");
  const sharePath = isArtist
    ? getArtistTarget(track) || `/artist/${encodeURIComponent(shareId)}`
    : isAlbum
    ? (track as any)?.href || `/album/${encodeURIComponent(shareId)}`
    : isPlaylist
    ? `/playlist/${encodeURIComponent(shareId)}`
    : `/track/${encodeURIComponent(shareId)}`;
  const shareTitle = track?.title || track?.name || "Music on Zenify";
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${sharePath}`);
    } catch {
      showToast("Failed to copy", "error");
    }
  };
  const nativeShare = async () => {
    try {
      await navigator.share({ title: shareTitle, url: `${window.location.origin}${sharePath}` });
    } catch (e) {
      if ((e as Error).name !== "AbortError") showToast("Error sharing", "error");
    }
  };

  const handleGoToArtist = () => {
    const target = getArtistTarget(track);
    if (target) router.push(target);
    else showToast("Artist information not available", "error");
  };

  /* ── Item builders ── */
  const hide = new Set(hideItems);
  const playerState: any = usePlayerStore.getState();
  const canPlayNext = typeof playerState?.playNext === "function";

  const clean = (arr: (MenuItem | false | null | undefined)[]) => arr.filter(Boolean) as MenuItem[];
  const sep = (id: string): MenuItem => ({ id, isSeparator: true });

  /** One entry → shown directly. Several → a "Go to ▸" sub-menu. */
  const goTo = (list: MenuItem[]): MenuItem | false => {
    if (list.length === 0) return false;
    if (list.length === 1) return { ...list[0], label: `Go to ${list[0].label}` };
    return { id: "goto", label: "Go to", children: list };
  };

  /** Share ▸  (Copy Link · Share… · extras). With onShare → one direct row. */
  const shareItem = (extra: MenuItem[] = []): MenuItem | false => {
    if (hide.has("share")) return false;
    if (onShare) return { id: "share", icon: <Share2 />, label: "Share", onClick: onShare };
    return {
      id: "share",
      label: "Share",
      children: clean([
        {
          id: "copy-link",
          icon: <Link2 />,
          label: "Copy Link",
          doneLabel: "Link copied",
          onClick: copyLink,
        },
        canNativeShare && { id: "share-native", icon: <Share2 />, label: "Share…", onClick: nativeShare },
        ...extra,
      ]),
    };
  };

  let rawItems: (MenuItem | false | null | undefined)[] = [];

  if (items && items.length > 0) {
    rawItems = [...items, ...(extraItems as unknown as MenuItem[])];
  } else if (isArtist) {
    const artistId = track?.id || track?.name || track?.title || "Artist";
    const artistTarget = getArtistTarget(track) || `/artist/${encodeURIComponent(String(artistId))}`;

    const loadArtistTracks = async () => {
      const data = track?.topTracks?.length
        ? track
        : (await api.get(`/artists/${encodeURIComponent(String(artistId))}`)).data;
      return [...(data?.topTracks || data?.topSongs || [])];
    };

    rawItems = [
      !hide.has("play") && {
        id: "play-top",
        icon: <Play />,
        label: "Play Top Songs",
        doneLabel: "Playing",
        onClick: async () => {
          try {
            const tracks = await loadArtistTracks();
            if (tracks.length) {
              usePlayerStore.getState().setTrack(tracks[0], tracks);
              useUIStore.getState().setPlayerMinimized(false);
            } else showToast("No tracks found for this artist", "error");
          } catch {
            showToast("Failed to play artist tracks", "error");
          }
        },
      },
      !hide.has("shuffle") && {
        id: "shuffle-artist",
        icon: <SwiftUIShuffle size={15} />,
        label: "Shuffle",
        doneLabel: "Shuffling",
        onClick: async () => {
          try {
            const tracks = (await loadArtistTracks()).sort(() => Math.random() - 0.5);
            if (tracks.length) {
              usePlayerStore.getState().setTrack(tracks[0], tracks);
              useUIStore.getState().setPlayerMinimized(false);
            } else showToast("No tracks found for this artist", "error");
          } catch {
            showToast("Failed to shuffle artist tracks", "error");
          }
        },
      },
      sep("s1"),
      !hide.has("artist") &&
        !onArtistPage && {
          id: "view-artist",
          icon: <User />,
          label: "Go to Artist",
          onClick: () => router.push(artistTarget),
        },
      ...(extraItems as unknown as MenuItem[]),
      shareItem(),
    ];
  } else if (isAlbum) {
    const albumTitle = track?.title || track?.name || "Album";
    const albumId = track?.id || albumTitle;
    const albumTarget = (track as any)?.href || `/album/${encodeURIComponent(String(albumId))}`;
    const artistTarget = getArtistTarget(track);

    const loadAlbum = async () =>
      track?.tracks?.length ? track : (await api.get(`/albums/${track?.id}`)).data;

    rawItems = [
      !hide.has("play") && {
        id: "play-album",
        icon: <Play />,
        label: "Play Album",
        doneLabel: "Playing",
        onClick: async () => {
          try {
            const albumData = await loadAlbum();
            const albumTracks = (albumData?.tracks || []).filter(Boolean);
            if (albumTracks.length) {
              const first = {
                ...albumTracks[0],
                artwork:
                  albumTracks[0].artwork ||
                  albumTracks[0].coverUrl ||
                  albumTracks[0].image ||
                  getTrackCover(track),
                streamUrl: albumTracks[0].streamUrl || albumTracks[0].audioUrl,
              };
              usePlayerStore.getState().setTrack(first, albumTracks);
              useUIStore.getState().setPlayerMinimized(false);
            } else showToast("Album has no tracks", "error");
          } catch {
            showToast("Failed to play album", "error");
          }
        },
      },
      !hide.has("queue") && {
        id: "queue-album",
        icon: <ListPlus />,
        label: "Add to Queue",
        doneLabel: "Added to queue",
        onClick: async () => {
          try {
            const albumData = await loadAlbum();
            if (albumData?.tracks?.length) {
              usePlayerStore.getState().addToUserQueue(albumData.tracks, { contextName: albumTitle });
            } else showToast("Album has no tracks", "error");
          } catch {
            showToast("Failed to queue album", "error");
          }
        },
      },
      sep("s1"),
      goTo(
        clean([
          !hide.has("artist") &&
            artistTarget &&
            !onArtistPage && { id: "artist", icon: <User />, label: "Artist", onClick: () => router.push(artistTarget) },
          !hide.has("view-album") &&
            !onAlbumPage && { id: "view-album", icon: <Disc />, label: "Album", onClick: () => router.push(albumTarget) },
        ])
      ),
      ...(extraItems as unknown as MenuItem[]),
      shareItem(),
    ];
  } else if (isPlaylist) {
    const playlistTitle = track?.name || track?.title || "Playlist";
    const playlistId = track?.id;

    const loadPlaylistTracks = async () => {
      const pl = track?.tracks?.length ? track : (await api.get(`/playlists/${playlistId}`)).data;
      return (pl?.tracks || []).map((t: any) => t.track || t).filter(Boolean);
    };

    rawItems = [
      !hide.has("play") && {
        id: "play-playlist",
        icon: <Play />,
        label: "Play Playlist",
        doneLabel: "Playing",
        onClick: async () => {
          try {
            const tracks = await loadPlaylistTracks();
            if (tracks.length) {
              const first = {
                ...tracks[0],
                artwork: tracks[0].artwork || tracks[0].coverUrl || tracks[0].image || getTrackCover(track),
                streamUrl: tracks[0].streamUrl || tracks[0].audioUrl,
              };
              usePlayerStore.getState().setTrack(first, tracks);
              useUIStore.getState().setPlayerMinimized(false);
            } else showToast("Playlist has no tracks", "error");
          } catch {
            showToast("Failed to play playlist", "error");
          }
        },
      },
      !hide.has("queue") && {
        id: "queue-playlist",
        icon: <ListPlus />,
        label: "Add to Queue",
        doneLabel: "Added to queue",
        onClick: async () => {
          try {
            const tracks = await loadPlaylistTracks();
            if (tracks.length) usePlayerStore.getState().addToUserQueue(tracks, { contextName: playlistTitle });
            else showToast("Playlist has no tracks", "error");
          } catch {
            showToast("Failed to queue playlist", "error");
          }
        },
      },
      sep("s1"),
      !hide.has("view-playlist") &&
        !onPlaylistPage && {
          id: "view-playlist",
          icon: <ListMusic />,
          label: "View Playlist",
          onClick: () => router.push(`/playlist/${playlistId}`),
        },
      ...(extraItems as unknown as MenuItem[]),
      shareItem(),
    ];
  } else {
    /* Song / track */
    const albumId = track?.album?.id || track?.albumId || track?.collectionId;
    const albumTitle = track?.album?.title || track?.albumTitle || track?.collectionName;
    const albumTarget = albumId
      ? `/album/${encodeURIComponent(String(albumId))}`
      : albumTitle &&
        albumTitle.toLowerCase() !== "unknown" &&
        albumTitle.toLowerCase() !== track?.title?.toLowerCase()
      ? `/album/${encodeURIComponent(String(albumTitle))}`
      : null;
    const artistTarget = getArtistTarget(track);

    const downloadItem: MenuItem | false = !hide.has("download") && {
      id: "download",
      icon: <Download />,
      label: "Download",
      onClick: () => openDownloadModal(track),
    };

    const adminKids = clean([
      !hide.has("refetch-audio") && {
        id: "refetch-audio",
        icon: <RefreshCw className={cn(isRefetching === track?.id && "animate-spin text-brand")} />,
        label: isRefetching === track?.id ? "Refetching Audio…" : "Refetch Audio",
        onClick: () => {
          refetchTrackAudio(track, showToast);
        },
      },
      !hide.has("refetch-lyrics") && {
        id: "refetch-lyrics",
        icon: <FileText />,
        label: "Refetch Lyrics",
        onClick: () => {
          refetchTrackLyrics(track, undefined, showToast);
        },
      },
      !hide.has("sync-lyrics") && {
        id: "sync-lyrics",
        icon: <Mic className="text-violet-400" />,
        label: "Sync Lyrics",
        className: "text-violet-300",
        onClick: () => router.push(`/admin/lyric-sync?trackId=${track?.id}`),
      },
    ]);

    rawItems = [
      /* play */
      canPlayNext &&
        !hide.has("play-next") && {
          id: "play-next",
          icon: <SkipForward />,
          label: "Play Next",
          doneLabel: "Plays next",
          onClick: () => (usePlayerStore.getState() as any).playNext(track),
        },
      !hide.has("queue") && {
        id: "queue",
        icon: <ListPlus />,
        label: "Add to Queue",
        doneLabel: "Added to queue",
        onClick: () => usePlayerStore.getState().addToUserQueue(track),
      },

      sep("s-play"),

      /* library */
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
            <SwiftUIHeart size={15} filled={!!isLiked} className={cn(isLiked ? "text-brand" : "text-white/80")} />
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
        icon: <ListMusic />,
        label: "Add to Playlist",
        onClick: () => openAddToPlaylistModal(track),
      },

      sep("s-lib"),

      /* navigate */
      !hide.has("lyrics") &&
        onLyricsToggle && {
          id: "lyrics",
          icon: <ScrollText />,
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
      goTo(
        clean([
          !hide.has("album") &&
            albumTarget &&
            !onAlbumPage && { id: "album", icon: <Disc />, label: "Album", onClick: () => router.push(albumTarget) },
          !hide.has("artist") &&
            artistTarget &&
            !onArtistPage && { id: "artist", icon: <User />, label: "Artist", onClick: handleGoToArtist },
          !hide.has("view-details") &&
            context !== "track-page" &&
            !onTrackPage &&
            track?.id && {
              id: "view-details",
              icon: <Info />,
              label: "Details",
              onClick: () => router.push(`/track/${track.id}`),
            },
        ])
      ),

      ...(extraItems && extraItems.length > 0
        ? [sep("s-extra"), ...(extraItems as unknown as MenuItem[])]
        : []),

      sep("s-end"),

      /* share (+ download inside), admin */
      hide.has("share") ? downloadItem : shareItem([downloadItem].filter(Boolean) as MenuItem[]),
      isAdmin && adminKids.length > 0 && { id: "admin", label: "Admin", children: adminKids },
    ];
  }

  const itemsFiltered = clean(rawItems);

  /* ── Resolve the current view from the drill-down path ── */
  let currentItems = itemsFiltered;
  let viewTitle: React.ReactNode = null;
  const validPath: string[] = [];
  for (const id of path) {
    const it = currentItems.find((i) => i.id === id);
    if (!it?.children?.length) break;
    currentItems = it.children;
    viewTitle = it.label;
    validPath.push(id);
  }
  const groups = buildGroups(currentItems);

  /* ── Selecting a row ── */
  const handleSelect = (item: MenuItem) => {
    if (item.disabled) return;

    // drill into a sub-menu, in the same panel
    if (item.children?.length) {
      setDir(1);
      setPath((p) => [...p, item.id]);
      return;
    }

    item.onClick?.();

    // rows with a visible result: show it, then close
    if (item.doneLabel) {
      setDoneId(item.id);
      clearTimer();
      timerRef.current = window.setTimeout(() => close(false), DONE_MS);
    } else if (item.id === "like") {
      clearTimer();
      timerRef.current = window.setTimeout(() => close(false), 650);
    } else {
      close(false);
    }
  };

  const view: ViewProps = {
    viewKey: validPath.length ? validPath.join("/") : "root",
    dir,
    title: viewTitle,
    onBack: validPath.length ? goBack : undefined,
    groups,
    doneId,
    onSelect: handleSelect,
  };

  /* ── Default trigger ── */
  const defaultTrigger = (
    <motion.button
      whileTap={{ scale: 0.9 }}
      transition={{ type: "spring", stiffness: 420, damping: 22 }}
      className={cn(
        "flex cursor-pointer items-center justify-center rounded-full text-white/70 outline-none transition-colors hover:text-white",
        triggerClassName ?? "h-9 w-9 border border-white/15 bg-white/10 backdrop-blur-md hover:bg-white/20"
      )}
      title="More options"
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
    >
      <SwiftUIEllipsis size={size} fill="currentColor" />
    </motion.button>
  );

  return (
    <>
      <span
        ref={anchorRef}
        className="inline-flex cursor-pointer items-center justify-center"
        onClick={handleTriggerClick}
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
      >
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
                  <Sheet view={view} track={track} clear={glass} onClose={close} />
                ) : (
                  <Popover
                    view={view}
                    anchorRef={anchorRef}
                    side={side}
                    align={align}
                    clear={glass}
                    focusFirst={openedByKeyboard}
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

export default TrackActionsDropdown;
