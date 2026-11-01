"use client";
import React, {
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import api from "@/lib/api";
import { getMediaUrl, getTrackCover } from "@/lib/utils";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { useNavigate } from "react-router-dom";

/* -------------------------------------------------------------------------- */
/*  Spring physics                                                            */
/*  A real damped-spring is sampled into a CSS `linear()` easing, so the same */
/*  physics drives both Web Animations and CSS transitions. Browsers without  */
/*  linear() support fall back to a smooth cubic-bezier.                      */
/* -------------------------------------------------------------------------- */

type SpringCfg = { stiffness: number; damping: number; mass?: number };
type Spring = { easing: string; duration: number };

const FALLBACK_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const springCache = new Map<string, Spring>();

function makeSpring({ stiffness, damping, mass = 1 }: SpringCfg): Spring {
  const key = `${stiffness}/${damping}/${mass}`;
  const hit = springCache.get(key);
  if (hit) return hit;

  const w0 = Math.sqrt(stiffness / mass);
  const zeta = Math.min(damping / (2 * Math.sqrt(stiffness * mass)), 0.999);
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  const x = (t: number) =>
    1 -
    Math.exp(-zeta * w0 * t) *
      (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));

  const T = Math.log(1 / 0.002) / (zeta * w0); // time until motion is imperceptible
  const N = Math.min(120, Math.max(24, Math.ceil(T * 60)));
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) pts.push(x((T * i) / N).toFixed(4));
  pts[pts.length - 1] = "1";

  const out = { easing: `linear(${pts.join(", ")})`, duration: Math.round(T * 1000) };
  springCache.set(key, out);
  return out;
}

const supportsLinear = () =>
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  CSS.supports("animation-timing-function", "linear(0, 1)");

/** Spring for Web Animations (falls back gracefully). */
const springAnim = (cfg: SpringCfg): Spring => {
  const s = makeSpring(cfg);
  return supportsLinear() ? s : { easing: FALLBACK_EASE, duration: Math.min(s.duration, 520) };
};

const OPEN_SPRING: SpringCfg = { stiffness: 300, damping: 23 }; // lively, ~6% overshoot
const CLOSE_SPRING: SpringCfg = { stiffness: 420, damping: 40 }; // quick, no bounce
const SETTLE_SPRING: SpringCfg = { stiffness: 380, damping: 26 }; // drag release
const UI_SPRING = makeSpring({ stiffness: 380, damping: 28 }); // buttons / rows

const PANEL_RADIUS = 26;

/* -------------------------------------------------------------------------- */
/*  Styles                                                                    */
/* -------------------------------------------------------------------------- */

const SPOTLIGHT_CSS = `
.sp-glass-btn, .sp2-scrim {
  --sp-ease: ${FALLBACK_EASE};
  --sp-spring: var(--sp-ease);
  --sp-dur: .5s;
  --sp-sheet-extra: 120px;
}
@supports (transition-timing-function: linear(0, 1)) {
  .sp-glass-btn, .sp2-scrim {
    --sp-spring: ${UI_SPRING.easing};
    --sp-dur: ${UI_SPRING.duration}ms;
  }
}

/* ------------------------------ header button ----------------------------- */
.sp-glass-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 9999px;
  cursor: pointer;
  outline: none;
  color: rgba(255,255,255,0.8);
  background: linear-gradient(135deg, rgba(255,255,255,0.17), rgba(255,255,255,0.05));
  -webkit-backdrop-filter: blur(14px) saturate(165%);
  backdrop-filter: blur(14px) saturate(165%);
  border: 1px solid rgba(255,255,255,0.18);
  box-shadow:
    0 4px 14px rgba(0,0,0,0.18),
    inset 0 1px 0 rgba(255,255,255,0.28),
    inset 0 -1px 0 rgba(255,255,255,0.04);
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  transition:
    transform var(--sp-dur) var(--sp-spring),
    background .35s ease,
    border-color .35s ease,
    box-shadow .35s ease,
    color .25s ease,
    opacity .3s ease;
  will-change: transform;
}
@media (pointer: coarse) {
  .sp-glass-btn { width: 44px; height: 44px; }
}
@media (hover: hover) {
  .sp-glass-btn:hover {
    transform: scale(1.1);
    color: #fff;
    border-color: rgba(255,255,255,0.32);
    background: linear-gradient(135deg, rgba(255,255,255,0.26), rgba(255,255,255,0.09));
    box-shadow:
      0 8px 22px rgba(0,0,0,0.26),
      inset 0 1px 0 rgba(255,255,255,0.4),
      inset 0 -1px 0 rgba(255,255,255,0.06);
  }
  .sp-glass-btn:hover .sp-glass-icon { transform: scale(1.12) rotate(-10deg); }
}
.sp-glass-btn:active {
  transform: scale(0.88);
  transition-duration: .12s, .35s, .35s, .35s, .25s, .3s;
}
.sp-glass-btn:focus-visible {
  box-shadow: 0 0 0 2px rgba(255,255,255,0.6), 0 4px 14px rgba(0,0,0,0.18);
}
.sp-glass-btn[data-open="true"] {
  opacity: 0;
  transform: scale(0.7);
  pointer-events: none;
}
.sp-glass-icon { transition: transform var(--sp-dur) var(--sp-spring); }

/* ---------------------------------- scrim --------------------------------- */
.sp2-scrim {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: max(56px, 11vh) 16px 16px;
  background: rgba(0,0,0,0.2);
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
  overscroll-behavior: contain;
}

/* ---------------------------------- panel --------------------------------- */
.sp2-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 680px;
  max-height: min(620px, calc(var(--sp-vh, 100dvh) - 96px));
  border-radius: ${PANEL_RADIUS}px;
  overflow: hidden;
  color: #fff;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.02)),
    rgba(30,30,34,0.34);
  -webkit-backdrop-filter: blur(20px) saturate(190%);
  backdrop-filter: blur(20px) saturate(190%);
  border: 0.5px solid rgba(255,255,255,0.2);
  box-shadow:
    0 24px 60px rgba(0,0,0,0.3),
    inset 0 0.5px 0 rgba(255,255,255,0.3);
  will-change: transform, opacity;
  transform: translateZ(0);
}

/* desktop + tablet: one single glass surface, no nested field box */
@media (min-width: 640px) {
  .sp2-head { padding: 6px 12px 6px 18px; }
  .sp2-field {
    height: 54px;
    gap: 12px;
    padding: 0;
    background: transparent;
    border-radius: 0;
  }
  .sp2-field:focus-within { background: transparent; box-shadow: none; }
  .sp2-input { font-size: 18px; font-weight: 500; letter-spacing: -0.01em; }
  .sp2-input::placeholder { color: rgba(255,255,255,0.5); font-weight: 500; }
}

/* tablet */
@media (min-width: 640px) and (max-width: 1023px) {
  .sp2-scrim { padding-top: max(40px, 8vh); }
  .sp2-panel { max-width: 600px; }
}
/* short landscape screens */
@media (max-height: 500px) and (min-width: 640px) {
  .sp2-scrim { padding-top: 12px; }
  .sp2-panel { max-height: calc(var(--sp-vh, 100dvh) - 24px); }
}
/* phone: full-height bottom sheet (Apple Music style) */
@media (max-width: 639px) {
  .sp2-scrim { padding: 0; align-items: flex-end; }
  .sp2-panel {
    max-width: none;
    max-height: none;
    height: calc(100% - max(env(safe-area-inset-top), 10px) + var(--sp-sheet-extra));
    margin-bottom: calc(var(--sp-sheet-extra) * -1);
    padding-bottom: calc(var(--sp-sheet-extra) + env(safe-area-inset-bottom));
    border-radius: 24px 24px 0 0;
    border-bottom: 0;
  }
  .sp2-grabber { display: flex; }
  .sp2-cancel { display: block; }
  .sp2-body { grid-template-rows: 1fr !important; opacity: 1 !important; flex: 1 1 auto !important; }
  .sp2-hint { display: flex; }
}

.sp2-grabber {
  display: none;
  justify-content: center;
  padding: 10px 0 2px;
  flex: none;
  touch-action: none;
  cursor: grab;
}
.sp2-grabber i {
  display: block;
  width: 38px;
  height: 5px;
  border-radius: 3px;
  background: rgba(255,255,255,0.3);
}

/* ---------------------------------- header -------------------------------- */
.sp2-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  flex: none;
  border-bottom: 1px solid transparent;
  transition: border-color .3s ease;
}
.sp2-panel[data-body="true"] .sp2-head { border-bottom-color: rgba(255,255,255,0.1); }
.sp2-field {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 12px;
  border-radius: 12px;
  background: rgba(255,255,255,0.08);
  transition: background .3s ease, box-shadow .3s ease;
}
.sp2-field:focus-within { background: rgba(255,255,255,0.12); }
.sp2-input {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #fff;
  font: inherit;
  font-size: 16px; /* 16px stops iOS from zooming the page on focus */
  line-height: 1.2;
  -webkit-appearance: none;
  appearance: none;
}
.sp2-input::placeholder { color: rgba(255,255,255,0.45); }
.sp2-input::-webkit-search-cancel-button,
.sp2-input::-webkit-search-decoration { display: none; -webkit-appearance: none; }

.sp2-spin {
  width: 16px;
  height: 16px;
  flex: none;
  border-radius: 9999px;
  border: 2px solid rgba(255,255,255,0.2);
  border-top-color: rgba(255,255,255,0.85);
  animation: sp-spin .7s linear infinite;
  opacity: 0;
  transform: scale(0.5);
  transition: opacity .25s ease, transform var(--sp-dur) var(--sp-spring);
}
.sp2-spin[data-show="true"] { opacity: 1; transform: scale(1); }

.sp2-clear {
  flex: none;
  width: 20px;
  height: 20px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  cursor: pointer;
  background: rgba(255,255,255,0.32);
  color: rgba(20,20,24,0.8);
  transform: scale(0);
  opacity: 0;
  pointer-events: none;
  transition: transform var(--sp-dur) var(--sp-spring), opacity .2s ease;
  -webkit-tap-highlight-color: transparent;
}
.sp2-clear[data-show="true"] { transform: scale(1); opacity: 1; pointer-events: auto; }
.sp2-clear:active { transform: scale(0.85); }

.sp2-cancel {
  display: none;
  flex: none;
  padding: 10px 2px;
  border: 0;
  background: none;
  color: #fff;
  font: inherit;
  font-size: 16px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: opacity .2s ease, transform var(--sp-dur) var(--sp-spring);
}
.sp2-cancel:active { opacity: .6; transform: scale(.94); }

/* ---------------------------------- tabs ---------------------------------- */
.sp2-tabs {
  position: relative;
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  -webkit-overflow-scrolling: touch;
}
.sp2-tabs::-webkit-scrollbar { display: none; }
.sp2-pill {
  position: absolute;
  left: 0;
  top: 8px;
  height: 32px;
  border-radius: 9999px;
  background: rgba(255,255,255,0.2);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.2), 0 2px 8px rgba(0,0,0,0.15);
  pointer-events: none;
}
.sp2-pill[data-ready="true"] {
  transition: transform var(--sp-dur) var(--sp-spring), width .35s var(--sp-ease);
}
.sp2-tab {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  flex: none;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  color: rgba(255,255,255,0.6);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: color .25s ease, transform var(--sp-dur) var(--sp-spring);
}
.sp2-tab[data-active="true"] { color: #fff; }
.sp2-tab:active { transform: scale(0.94); }
@media (hover: hover) { .sp2-tab:hover { color: #fff; } }
.sp2-tab small {
  font-size: 11px;
  padding: 0 6px;
  border-radius: 9999px;
  background: rgba(255,255,255,0.12);
  color: rgba(255,255,255,0.65);
}

/* ------------------------------ collapse regions --------------------------- */
.sp-collapse {
  display: grid;
  min-height: 0;
  transition: grid-template-rows .45s var(--sp-ease, ${FALLBACK_EASE}), opacity .3s ease;
}
.sp-collapse > .sp-collapse-inner {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.sp2-body { flex: 0 1 auto; }

.sp2-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 6px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.22) transparent;
  animation: sp-fade-in .4s var(--sp-ease) both;
}

/* ---------------------------------- rows ---------------------------------- */
.sp2-list { list-style: none; margin: 0; padding: 0; }
.sp2-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 60px;
  padding: 6px 10px;
  border-radius: 14px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color .2s ease, transform var(--sp-dur) var(--sp-spring);
  animation: sp-item-in .45s var(--sp-ease) both;
}
@media (hover: hover) and (pointer: fine) {
  .sp2-row[data-sel="true"] { background: rgba(255,255,255,0.1); }
  .sp2-row[data-sel="true"] .sp2-trail { opacity: 0.9; transform: translateX(0); }
}
.sp2-row:active { transform: scale(0.985); background: rgba(255,255,255,0.12); transition-duration: .1s; }
.sp2-art {
  width: 48px;
  height: 48px;
  flex: none;
  overflow: hidden;
  border-radius: 8px;
  background: rgba(255,255,255,0.08);
  box-shadow: 0 0 0 0.5px rgba(255,255,255,0.14), 0 2px 8px rgba(0,0,0,0.28);
  transition: width .3s var(--sp-ease), height .3s var(--sp-ease);
}
.sp2-art[data-round="true"] { border-radius: 9999px; }
.sp2-art img { display: block; width: 100%; height: 100%; object-fit: cover; }
.sp2-row[data-top="true"] .sp2-art { width: 60px; height: 60px; }
.sp2-text { flex: 1; min-width: 0; }
.sp2-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
  color: rgba(255,255,255,0.96);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sp2-meta {
  margin: 2px 0 0;
  font-size: 13px;
  line-height: 1.3;
  color: rgba(255,255,255,0.55);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sp2-trail {
  flex: none;
  color: #fff;
  opacity: 0.4;
  transform: translateX(-3px);
  transition: opacity .25s ease, transform var(--sp-dur) var(--sp-spring);
}
.sp2-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 4px;
  font-size: 13px;
  font-weight: 600;
  color: rgba(255,255,255,0.5);
}
.sp2-link {
  padding: 4px 2px;
  border: 0;
  background: none;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.sp2-link:active { opacity: .6; }

.sp2-recent-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: 9999px;
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.6);
}
.sp2-iconbtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: 9999px;
  background: none;
  color: rgba(255,255,255,0.45);
  cursor: pointer;
  transition: background-color .2s ease, color .2s ease, transform var(--sp-dur) var(--sp-spring);
}
.sp2-iconbtn:active { transform: scale(0.85); }
@media (hover: hover) { .sp2-iconbtn:hover { background: rgba(255,255,255,0.1); color: #fff; } }

.sp2-skel { display: flex; align-items: center; gap: 12px; padding: 6px 10px; min-height: 60px; }
.sp2-skel i, .sp2-skel b {
  display: block;
  border-radius: 8px;
  background: linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0.06) 75%);
  background-size: 200% 100%;
  animation: sp-shimmer 1.4s ease-in-out infinite;
}
.sp2-skel i { width: 48px; height: 48px; flex: none; }
.sp2-skel div { flex: 1; display: grid; gap: 8px; }
.sp2-skel b { height: 11px; width: 55%; border-radius: 6px; }
.sp2-skel b + b { width: 35%; height: 9px; }

.sp2-empty, .sp2-hint {
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 32px 20px;
  font-size: 14px;
  color: rgba(255,255,255,0.45);
}
.sp2-hint { display: none; height: 100%; }

/* -------------------------------- keyframes ------------------------------- */
@keyframes sp-item-in {
  from { opacity: 0; transform: translateY(10px) scale(0.985); }
  to   { opacity: 1; transform: none; }
}
@keyframes sp-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: none; }
}
@keyframes sp-spin { to { transform: rotate(360deg); } }
@keyframes sp-shimmer {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .sp-glass-btn, .sp-glass-icon, .sp-collapse, .sp2-pill, .sp2-row, .sp2-clear,
  .sp2-spin, .sp2-tab, .sp2-trail { transition: none !important; }
  .sp2-row, .sp2-scroll, .sp2-skel i, .sp2-skel b { animation: none !important; }
}
`;

function SpotlightStyles() {
  return <style>{SPOTLIGHT_CSS}</style>;
}

/* -------------------------------------------------------------------------- */
/*  Small inline icons (so we don't depend on extra Icon names)               */
/* -------------------------------------------------------------------------- */

const ClockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
const XIcon = ({ size = 10 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isSheet = () => window.matchMedia("(max-width: 639px)").matches;

const RECENT_KEY = "sp:recent-searches";
const MAX_RECENTS = 8;
const loadRecents = (): string[] => {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr)
      ? arr.filter((x) => typeof x === "string").slice(0, MAX_RECENTS)
      : [];
  } catch {
    return [];
  }
};
const saveRecents = (list: string[]) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
};

/* -------------------------------------------------------------------------- */
/*  Header button                                                             */
/* -------------------------------------------------------------------------- */

export function HeaderSearchButton() {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState<DOMRect | null>(null);
  const btn = useRef<HTMLButtonElement>(null);

  const openSearch = () => {
    setOrigin(btn.current?.getBoundingClientRect() ?? null);
    setOpen(true);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (open) return; // the overlay handles its own shortcuts + close animation
      const t = e.target as HTMLElement;
      const typing = /input|textarea|select/i.test(t.tagName) || t.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openSearch();
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      <SpotlightStyles />
      <button
        ref={btn}
        type="button"
        aria-label="Search"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Search (⌘K or /)"
        data-open={open}
        onClick={openSearch}
        className="sp-glass-btn"
      >
        <Icon name="search" size={18} className="sp-glass-icon" />
      </button>
      {open && (
        <SpotlightSearchOverlay
          originRect={origin}
          onClose={() => {
            setOpen(false);
            btn.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface SearchItem {
  id: string;
  type: "track" | "artist" | "album" | "playlist";
  title: string;
  subtitle: string;
  coverUrl?: string;
  raw: any;
}

type FilterType = "all" | "track" | "artist" | "album";

const FILTER_TABS: { id: FilterType; label: string }[] = [
  { id: "all", label: "All" },
  { id: "track", label: "Songs" },
  { id: "artist", label: "Artists" },
  { id: "album", label: "Albums" },
];

const TYPE_LABEL: Record<SearchItem["type"], string> = {
  track: "Song",
  artist: "Artist",
  album: "Album",
  playlist: "Playlist",
};

const metaFor = (it: SearchItem) => {
  const label = TYPE_LABEL[it.type];
  const sub = (it.subtitle || "").replace(/ • /g, " · ");
  return !sub || sub === label ? label : `${label} · ${sub}`;
};

/* -------------------------------------------------------------------------- */
/*  Overlay                                                                   */
/* -------------------------------------------------------------------------- */

export function SpotlightSearchOverlay({
  onClose,
  originRect = null,
}: {
  onClose: () => void;
  /** Bounding box of the trigger button; on tablet/desktop the panel grows out of / shrinks into it. */
  originRect?: DOMRect | null;
}) {
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [resultsData, setResultsData] = useState<{
    topResult?: SearchItem;
    tracks: SearchItem[];
    artists: SearchItem[];
    albums: SearchItem[];
  }>({ tracks: [], artists: [], albums: [] });
  const [sel, setSel] = useState(0);
  const [loading, setLoading] = useState(false);
  const [recents, setRecents] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : loadRecents()
  );
  const [pill, setPill] = useState({ x: 0, w: 0, ready: false });

  const input = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const finishedRef = useRef(false);
  const keyNavRef = useRef(false);
  const drag = useRef({ active: false, startY: 0, dy: 0, lastY: 0, lastT: 0, vy: 0 });
  const navigate = useNavigate();

  const hasQuery = dq.trim().length > 0;

  /* ---- morph geometry (tablet / desktop) --------------------------------- */

  const morphFrom = () => {
    const panel = panelRef.current;
    const fallback = { transform: "translateY(-14px) scale(0.94)", radius: "" };
    if (!panel || !originRect) return fallback;
    const p = panel.getBoundingClientRect();
    const dx = originRect.left + originRect.width / 2 - (p.left + p.width / 2);
    const dy = originRect.top + originRect.height / 2 - (p.top + p.height / 2);
    const s = Math.max(originRect.width / p.width, 0.06);
    return {
      transform: `translate(${dx}px, ${dy}px) scale(${s})`,
      radius: `${originRect.height / 2 / s}px`, // reads as a circle once scaled
    };
  };

  /* ---- open animation ---------------------------------------------------- */

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const scrim = scrimRef.current;
    if (!panel || !scrim || reducedMotion()) return;

    const s = springAnim(OPEN_SPRING);
    scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: "ease-out" });

    if (isSheet()) {
      panel.animate(
        [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }],
        { duration: s.duration, easing: s.easing }
      );
    } else {
      const m = morphFrom();
      panel.animate(
        [{ transform: m.transform }, { transform: "translate(0,0) scale(1)" }],
        { duration: s.duration, easing: s.easing }
      );
      panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
      if (m.radius) {
        panel.animate(
          [{ borderRadius: m.radius }, { borderRadius: `${PANEL_RADIUS}px` }],
          { duration: 420, easing: FALLBACK_EASE }
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- close animation --------------------------------------------------- */

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onClose();
  };

  const requestClose = (fromY = 0) => {
    if (closingRef.current) return;
    closingRef.current = true;
    const panel = panelRef.current;
    const scrim = scrimRef.current;
    if (!panel || !scrim || reducedMotion()) {
      finish();
      return;
    }

    const s = springAnim(CLOSE_SPRING);
    const startOpacity = parseFloat(scrim.style.opacity || "1");
    scrim.style.opacity = "";
    panel.style.transform = "";

    scrim.animate([{ opacity: startOpacity }, { opacity: 0 }], {
      duration: Math.min(s.duration, 320),
      easing: "ease-in",
      fill: "forwards",
    });

    let main: Animation;
    if (isSheet()) {
      main = panel.animate(
        [{ transform: `translateY(${fromY}px)` }, { transform: "translateY(100%)" }],
        { duration: s.duration, easing: s.easing, fill: "forwards" }
      );
    } else {
      const m = morphFrom();
      main = panel.animate(
        [{ transform: "translate(0,0) scale(1)" }, { transform: m.transform }],
        { duration: s.duration, easing: s.easing, fill: "forwards" }
      );
      panel.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: Math.round(s.duration * 0.7),
        delay: Math.round(s.duration * 0.15),
        easing: "ease-in",
        fill: "forwards",
      });
      if (m.radius) {
        panel.animate(
          [{ borderRadius: `${PANEL_RADIUS}px` }, { borderRadius: m.radius }],
          { duration: s.duration, easing: FALLBACK_EASE, fill: "forwards" }
        );
      }
    }
    main.onfinish = finish;
    window.setTimeout(finish, s.duration + 300); // safety net
  };

  /* ---- swipe-down to dismiss (phone sheet) -------------------------------- */

  const onGrabDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (closingRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const d = drag.current;
    d.active = true;
    d.startY = e.clientY;
    d.lastY = e.clientY;
    d.lastT = performance.now();
    d.vy = 0;
    d.dy = 0;
  };
  const onGrabMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active || !panelRef.current || !scrimRef.current) return;
    const raw = e.clientY - d.startY;
    const dy = raw > 0 ? raw : raw * 0.15; // rubber-band when pulling up
    d.dy = dy;
    const now = performance.now();
    const dt = now - d.lastT;
    if (dt > 0) d.vy = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = now;
    panelRef.current.style.transform = `translateY(${dy}px)`;
    scrimRef.current.style.opacity = String(Math.max(0.2, 1 - dy / 500));
  };
  const onGrabUp = () => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    const panel = panelRef.current;
    const scrim = scrimRef.current;
    if (!panel || !scrim) return;

    if (d.dy > 110 || d.vy > 0.6) {
      requestClose(d.dy);
      return;
    }
    const s = springAnim(SETTLE_SPRING);
    const op = parseFloat(scrim.style.opacity || "1");
    panel.style.transform = "";
    scrim.style.opacity = "";
    panel.animate(
      [{ transform: `translateY(${d.dy}px)` }, { transform: "translateY(0)" }],
      { duration: s.duration, easing: s.easing }
    );
    scrim.animate([{ opacity: op }, { opacity: 1 }], { duration: 250, easing: "ease-out" });
  };

  /* ---- focus, scroll lock, keyboard-aware height (mobile) ------------------ */

  useEffect(() => {
    input.current?.focus({ preventScroll: true });
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    const scrim = scrimRef.current;
    if (!vv || !scrim) return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const sync = () => {
      scrim.style.top = `${vv.offsetTop}px`;
      scrim.style.bottom = "auto";
      scrim.style.height = `${vv.height}px`;
      scrim.style.setProperty("--sp-vh", `${vv.height}px`);
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

  /* ⌘K toggles the overlay closed */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        requestClose();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- search ------------------------------------------------------------ */

  useEffect(() => {
    if (!dq.trim()) {
      setResultsData({ tracks: [], artists: [], albums: [] });
      setLoading(false);
      return;
    }
    const ctl = new AbortController();
    setLoading(true);

    const id = setTimeout(async () => {
      try {
        const res = await api.get("search", {
          params: { q: dq.trim(), limit: 30 },
          signal: ctl.signal,
        });
        const data = res.data;
        const mappedTracks: SearchItem[] = [];
        const mappedArtists: SearchItem[] = [];
        const mappedAlbums: SearchItem[] = [];
        let mappedTopResult: SearchItem | undefined = undefined;

        if (data?.topResult?.item) {
          const top = data.topResult.item;
          const topType =
            data.topResult.type ||
            (top.isArtist ? "artist" : top.isAlbum ? "album" : "track");
          mappedTopResult = {
            id: `top-${top.id}`,
            type: topType,
            title: top.title || top.name,
            subtitle:
              topType === "artist"
                ? top.follower_count
                  ? `${top.follower_count.toLocaleString()} Monthly Listeners`
                  : "Artist"
                : topType === "album"
                ? [
                    top.artist?.name || "Album",
                    top.year,
                    top.trackCount
                      ? `${top.trackCount} ${top.trackCount === 1 ? "Song" : "Songs"}`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" • ")
                : top.artist?.name || top.artistName || "Song",
            coverUrl:
              topType === "artist"
                ? top.imageUrl || top.coverUrl
                : top.coverUrl || getTrackCover(top),
            raw: top,
          };
        }

        if (Array.isArray(data?.tracks)) {
          data.tracks.forEach((t: any) => {
            mappedTracks.push({
              id: `track-${t.id}`,
              type: "track",
              title: t.title,
              subtitle: t.artist?.name || t.artistName || "Track",
              coverUrl: getTrackCover(t),
              raw: t,
            });
          });
        }

        if (Array.isArray(data?.artists)) {
          data.artists.forEach((a: any) => {
            mappedArtists.push({
              id: `artist-${a.id}`,
              type: "artist",
              title: a.name,
              subtitle: a.trackCount
                ? `${a.trackCount} ${a.trackCount === 1 ? "Song" : "Songs"}`
                : "Artist",
              coverUrl: a.imageUrl || a.coverUrl,
              raw: a,
            });
          });
        }

        if (Array.isArray(data?.albums)) {
          data.albums.forEach((al: any) => {
            const artistName = al.artist?.name || "Album";
            const year = al.releaseDate ? String(al.releaseDate).slice(0, 4) : "";
            const tracksInfo = al.trackCount
              ? `${al.trackCount} ${al.trackCount === 1 ? "Song" : "Songs"}`
              : "";
            const meta = [artistName, year, tracksInfo].filter(Boolean).join(" • ");
            mappedAlbums.push({
              id: `album-${al.id}`,
              type: "album",
              title: al.title,
              subtitle: meta,
              coverUrl: al.coverUrl,
              raw: al,
            });
          });
        }

        setResultsData({
          topResult: mappedTopResult,
          tracks: mappedTracks,
          artists: mappedArtists,
          albums: mappedAlbums,
        });
        setSel(0);
      } catch (err: any) {
        if (err.name !== "CanceledError" && err.name !== "AbortError") {
          console.error("[SpotlightSearch] Query error:", err);
        }
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(id);
      ctl.abort();
    };
  }, [dq]);

  /* ---- derived lists ----------------------------------------------------- */

  const filteredItems = useMemo(() => {
    if (activeFilter === "track") return resultsData.tracks;
    if (activeFilter === "artist") return resultsData.artists;
    if (activeFilter === "album") return resultsData.albums;

    // Dedupe on type + id: a track and an album can share the same raw id.
    const keyOf = (it: SearchItem) => `${it.type}:${it.raw?.id ?? it.id}`;
    const allItems: SearchItem[] = [];
    const seen = new Set<string>();

    if (resultsData.topResult) {
      allItems.push(resultsData.topResult);
      seen.add(keyOf(resultsData.topResult));
    }

    const pool = [...resultsData.tracks, ...resultsData.artists, ...resultsData.albums];
    pool.sort((a, b) => (b.raw?.score || 0) - (a.raw?.score || 0));

    for (const item of pool) {
      const key = keyOf(item);
      if (!seen.has(key)) {
        seen.add(key);
        allItems.push(item);
      }
    }
    return allItems.slice(0, 20);
  }, [activeFilter, resultsData]);

  const tabCounts = useMemo(
    () => ({
      all: resultsData.tracks.length + resultsData.artists.length + resultsData.albums.length,
      track: resultsData.tracks.length,
      artist: resultsData.artists.length,
      album: resultsData.albums.length,
    }),
    [resultsData]
  );

  const hasResults = filteredItems.length > 0;
  const showRecents = !hasQuery && recents.length > 0;
  const bodyOpen = hasQuery || showRecents;
  const showSkeleton = hasQuery && loading && !hasResults;
  const showEmpty = hasQuery && !loading && !hasResults;
  const hasTop =
    activeFilter === "all" && !!resultsData.topResult && filteredItems[0] === resultsData.topResult;
  const mode = hasQuery ? "results" : showRecents ? "recent" : "hint";

  /* ---- sliding tab pill -------------------------------------------------- */

  useLayoutEffect(() => {
    const el = tabsRef.current?.querySelector<HTMLElement>(`[data-tab="${activeFilter}"]`);
    if (!el) return;
    setPill((p) => ({ x: el.offsetLeft, w: el.offsetWidth, ready: p.w > 0 }));
  }, [activeFilter, tabCounts, hasQuery]);

  /* keep keyboard selection in view */
  useEffect(() => {
    if (!keyNavRef.current) return;
    keyNavRef.current = false;
    panelRef.current
      ?.querySelector<HTMLElement>(`#sp-opt-${sel}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [activeFilter]);

  /* ---- actions ----------------------------------------------------------- */

  const pushRecent = (term: string) => {
    const t = term.trim();
    if (!t) return;
    const next = [t, ...recents.filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(
      0,
      MAX_RECENTS
    );
    setRecents(next);
    saveRecents(next);
  };
  const removeRecent = (term: string) => {
    const next = recents.filter((r) => r !== term);
    setRecents(next);
    saveRecents(next);
  };
  const clearRecents = () => {
    setRecents([]);
    saveRecents([]);
  };

  const selectItem = (item: SearchItem) => {
    pushRecent(q);
    try {
      navigator.vibrate?.(6);
    } catch {
      /* not supported */
    }
    if (item.type === "track") {
      usePlayerStore.getState().setTrack(item.raw);
      useUIStore.getState().setPlayerMinimized(false);
    } else if (item.type === "artist") {
      navigate(`/artist/${item.raw.id}`);
    } else if (item.type === "album") {
      navigate(`/album/${item.raw.id}`);
    } else if (item.type === "playlist") {
      navigate(`/playlist/${item.raw.id}`);
    }
    requestClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (closingRef.current) return;
    if (e.key === "Escape") {
      e.preventDefault();
      requestClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      keyNavRef.current = true;
      setSel((s) => Math.min(s + 1, filteredItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      keyNavRef.current = true;
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      if (e.nativeEvent.isComposing) return; // don't fire while an IME is composing
      e.preventDefault();
      if (hasQuery && filteredItems[sel]) selectItem(filteredItems[sel]);
    } else if (e.key === "Tab") {
      // keep focus inside the dialog
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(
        'input, button:not([tabindex="-1"]):not([disabled])'
      );
      if (!nodes || nodes.length === 0) return;
      const list = Array.from(nodes).filter((n) => n.offsetParent !== null);
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  /* ---- render ------------------------------------------------------------ */

  const renderRow = (it: SearchItem, i: number) => (
    <li
      key={it.id}
      id={`sp-opt-${i}`}
      role="option"
      aria-selected={i === sel}
      data-sel={i === sel}
      data-top={hasTop && i === 0}
      className="sp2-row"
      style={{ animationDelay: `${Math.min(i, 10) * 26}ms` }}
      onMouseMove={() => sel !== i && setSel(i)}
      onClick={() => selectItem(it)}
    >
      <div className="sp2-art" data-round={it.type === "artist"}>
        <img
          src={getMediaUrl(it.coverUrl) || "/logo.png"}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={(e) => {
            const img = e.currentTarget;
            if (img.dataset.fb) return; // avoid an error loop if the fallback is missing
            img.dataset.fb = "1";
            img.src = "/logo.png";
          }}
        />
      </div>
      <div className="sp2-text">
        <p className="sp2-title">{it.title}</p>
        <p className="sp2-meta">{metaFor(it)}</p>
      </div>
      <span className="sp2-trail">
        <Icon name={it.type === "track" ? "play" : "chevron-right"} size={16} />
      </span>
    </li>
  );

  return createPortal(
    <>
      <SpotlightStyles />
      <div
        ref={scrimRef}
        className="sp2-scrim"
        role="presentation"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) requestClose();
        }}
      >
        <div
          ref={panelRef}
          className="sp2-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          data-body={bodyOpen}
          onKeyDown={onKey}
        >
          {/* drag handle (phone only) */}
          <div
            className="sp2-grabber"
            onPointerDown={onGrabDown}
            onPointerMove={onGrabMove}
            onPointerUp={onGrabUp}
            onPointerCancel={onGrabUp}
          >
            <i />
          </div>

          <div className="sp2-head">
            <div className="sp2-field">
              <Icon name="search" size={20} className="shrink-0 text-white/55" />
              <input
                ref={input}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search"
                className="sp2-input"
                role="combobox"
                aria-expanded={hasResults}
                aria-controls="sp-listbox"
                aria-activedescendant={hasQuery && hasResults ? `sp-opt-${sel}` : undefined}
                aria-label="Search music"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <span className="sp2-spin" data-show={loading} aria-hidden="true" />
              <button
                type="button"
                className="sp2-clear"
                data-show={q.length > 0}
                aria-label="Clear search"
                tabIndex={q.length > 0 ? 0 : -1}
                onMouseDown={(e) => e.preventDefault()} // keep the keyboard open
                onClick={() => {
                  setQ("");
                  input.current?.focus();
                }}
              >
                <XIcon />
              </button>
            </div>
            <button type="button" className="sp2-cancel" onClick={() => requestClose()}>
              Cancel
            </button>
          </div>

          {/* filter tabs with a spring-driven sliding pill */}
          <div
            className="sp-collapse"
            style={{
              gridTemplateRows: hasQuery ? "1fr" : "0fr",
              opacity: hasQuery ? 1 : 0,
              flex: "none",
            }}
          >
            <div className="sp-collapse-inner">
              <div ref={tabsRef} className="sp2-tabs" role="tablist" aria-label="Filter results">
                <span
                  className="sp2-pill"
                  data-ready={pill.ready}
                  style={{ transform: `translateX(${pill.x}px)`, width: pill.w }}
                />
                {FILTER_TABS.map((tab) => {
                  const count = tabCounts[tab.id];
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={activeFilter === tab.id}
                      data-tab={tab.id}
                      data-active={activeFilter === tab.id}
                      tabIndex={hasQuery ? 0 : -1}
                      className="sp2-tab"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setActiveFilter(tab.id);
                        setSel(0);
                      }}
                    >
                      {tab.label}
                      {count > 0 && <small>{count}</small>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* body: recents / skeleton / results / empty */}
          <div
            className="sp-collapse sp2-body"
            style={{ gridTemplateRows: bodyOpen ? "1fr" : "0fr", opacity: bodyOpen ? 1 : 0 }}
          >
            <div className="sp-collapse-inner">
              <div
                key={mode}
                ref={scrollRef}
                className="sp2-scroll"
                onTouchMove={() => {
                  // like Apple Music: dragging the list dismisses the keyboard
                  if (document.activeElement === input.current) input.current?.blur();
                }}
              >
                {mode === "recent" && (
                  <>
                    <div className="sp2-label">
                      <span>Recent</span>
                      <button
                        type="button"
                        className="sp2-link text-brand"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={clearRecents}
                      >
                        Clear
                      </button>
                    </div>
                    <ul className="sp2-list" role="list">
                      {recents.map((term, i) => (
                        <li
                          key={term}
                          className="sp2-row"
                          style={{ animationDelay: `${Math.min(i, 8) * 24}ms`, minHeight: 52 }}
                          onClick={() => {
                            setQ(term);
                            input.current?.focus();
                          }}
                        >
                          <span className="sp2-recent-icon">
                            <ClockIcon />
                          </span>
                          <div className="sp2-text">
                            <p className="sp2-title" style={{ fontWeight: 500 }}>
                              {term}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="sp2-iconbtn"
                            aria-label={`Remove ${term}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeRecent(term);
                            }}
                          >
                            <XIcon size={12} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {mode === "hint" && (
                  <div className="sp2-hint">Search for songs, artists and albums</div>
                )}

                {mode === "results" && (
                  <>
                    {showSkeleton &&
                      [0, 1, 2, 3, 4].map((n) => (
                        <div className="sp2-skel" key={n} style={{ opacity: 1 - n * 0.16 }}>
                          <i />
                          <div>
                            <b />
                            <b />
                          </div>
                        </div>
                      ))}

                    {hasResults && (
                      <>
                        {hasTop && <div className="sp2-label">Top Result</div>}
                        <ul id="sp-listbox" className="sp2-list" role="listbox" aria-label="Results">
                          {filteredItems.map(renderRow)}
                        </ul>
                      </>
                    )}

                    {showEmpty && (
                      <div className="sp2-empty" style={{ display: "flex" }}>
                        No results for “{dq.trim()}”
                        {activeFilter !== "all" ? ` in ${activeFilter}s` : ""}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}