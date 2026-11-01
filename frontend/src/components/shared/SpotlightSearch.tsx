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
import { getMediaUrl, getTrackCover, cn } from "@/lib/utils";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { useNavigate } from "react-router-dom";
import { glassSurface } from "@/components/shared/TrackActionsDropdown";

/* -------------------------------------------------------------------------- */
/*  Shared motion + glass styles                                              */
/* -------------------------------------------------------------------------- */

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"; // smooth, iOS-like deceleration

const SPOTLIGHT_CSS = `
.sp-glass-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 9999px;
  cursor: pointer;
  outline: none;
  color: rgba(255,255,255,0.78);
  background: linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05));
  -webkit-backdrop-filter: blur(10px) saturate(160%);
  backdrop-filter: blur(10px) saturate(160%);
  border: 1px solid rgba(255,255,255,0.18);
  box-shadow:
    0 4px 14px rgba(0,0,0,0.18),
    inset 0 1px 0 rgba(255,255,255,0.28),
    inset 0 -1px 0 rgba(255,255,255,0.04);
  transition:
    transform .5s ${EASE},
    background .4s ease,
    border-color .4s ease,
    box-shadow .4s ease,
    color .3s ease,
    opacity .35s ease;
  will-change: transform;
}
.sp-glass-btn:hover {
  transform: scale(1.08);
  color: #fff;
  border-color: rgba(255,255,255,0.32);
  background: linear-gradient(135deg, rgba(255,255,255,0.24), rgba(255,255,255,0.08));
  box-shadow:
    0 8px 22px rgba(0,0,0,0.24),
    inset 0 1px 0 rgba(255,255,255,0.4),
    inset 0 -1px 0 rgba(255,255,255,0.06);
}
.sp-glass-btn:active {
  transform: scale(0.92);
  transition-duration: .15s;
}
.sp-glass-btn:focus-visible {
  box-shadow: 0 0 0 2px rgba(255,255,255,0.55), 0 4px 14px rgba(0,0,0,0.18);
}
.sp-glass-btn[data-open="true"] {
  opacity: 0;
  transform: scale(0.8);
  pointer-events: none;
}
.sp-glass-btn .sp-glass-icon {
  transition: transform .5s ${EASE};
}
.sp-glass-btn:hover .sp-glass-icon {
  transform: scale(1.1) rotate(-8deg);
}

.sp-collapse {
  display: grid;
  transition: grid-template-rows .4s ${EASE}, opacity .3s ease;
}
.sp-collapse > .sp-collapse-inner {
  min-height: 0;
  overflow: hidden;
}

@keyframes sp-item-in {
  from { opacity: 0; transform: translateY(8px) scale(0.985); }
  to   { opacity: 1; transform: none; }
}
@keyframes sp-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  .sp-glass-btn, .sp-glass-btn .sp-glass-icon, .sp-collapse { transition: none !important; }
  .sp-item, .sp-empty { animation: none !important; }
}
`;

function SpotlightStyles() {
  return <style>{SPOTLIGHT_CSS}</style>;
}

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
      const typing = /input|textarea/i.test((e.target as HTMLElement).tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) return; // overlay handles its own close animation
        openSearch();
      } else if (e.key === "/" && !typing && !open) {
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
        title="Search (⌘K or /)"
        data-open={open}
        onClick={openSearch}
        className="sp-glass-btn"
      >
        <Icon name="search" size={17} className="sp-glass-icon" />
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

/* -------------------------------------------------------------------------- */
/*  Overlay                                                                   */
/* -------------------------------------------------------------------------- */

export function SpotlightSearchOverlay({
  onClose,
  originRect = null,
}: {
  onClose: () => void;
  /** Bounding box of the trigger button; the panel grows out of / shrinks back into it. */
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
  }>({
    tracks: [],
    artists: [],
    albums: [],
  });
  const [sel, setSel] = useState(0);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const navigate = useNavigate();

  /* ---- open / close choreography (panel morphs from/to the button) ------- */

  const getPanelTransform = () => {
    const panel = panelRef.current;
    if (!panel) return "translateY(-12px) scale(0.96)";
    const p = panel.getBoundingClientRect();
    if (!originRect) return "translateY(-12px) scale(0.96)";
    const dx = originRect.left + originRect.width / 2 - (p.left + p.width / 2);
    const dy = originRect.top + originRect.height / 2 - (p.top + p.height / 2);
    const s = Math.max(originRect.width / p.width, 0.08);
    return `translate(${dx}px, ${dy}px) scale(${s})`;
  };

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const scrim = scrimRef.current;
    if (!panel || !scrim) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    scrim.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 350,
      easing: "ease-out",
      fill: "backwards",
    });
    panel.animate(
      [
        { transform: getPanelTransform(), opacity: 0 },
        { opacity: 1, offset: 0.35 },
        { transform: "translate(0,0) scale(1)", opacity: 1 },
      ],
      { duration: 520, easing: EASE, fill: "backwards" }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    const panel = panelRef.current;
    const scrim = scrimRef.current;
    if (
      !panel ||
      !scrim ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      onClose();
      return;
    }
    scrim.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 320,
      easing: "ease-in",
      fill: "forwards",
    });
    const anim = panel.animate(
      [
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        { opacity: 0, offset: 0.7 },
        { transform: getPanelTransform(), opacity: 0 },
      ],
      { duration: 380, easing: "cubic-bezier(0.5, 0, 0.75, 0)", fill: "forwards" }
    );
    anim.onfinish = () => onClose();
    // safety net in case onfinish never fires
    setTimeout(onClose, 600);
  };

  /* ---- focus + scroll lock ---------------------------------------------- */

  useEffect(() => {
    input.current?.focus({ preventScroll: true });
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /* ---- ⌘K toggles closed while open ------------------------------------- */

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

    const allItems: SearchItem[] = [];
    const seen = new Set<string>();

    if (resultsData.topResult) {
      allItems.push(resultsData.topResult);
      seen.add(resultsData.topResult.raw?.id || resultsData.topResult.id);
    }

    const pool = [
      ...resultsData.tracks,
      ...resultsData.artists,
      ...resultsData.albums,
    ];
    pool.sort((a, b) => (b.raw?.score || 0) - (a.raw?.score || 0));

    for (const item of pool) {
      const key = item.raw?.id || item.id;
      if (!seen.has(key)) {
        seen.add(key);
        allItems.push(item);
      }
    }

    return allItems.slice(0, 20);
  }, [activeFilter, resultsData]);

  const tabCounts = useMemo(
    () => ({
      all:
        resultsData.tracks.length +
        resultsData.artists.length +
        resultsData.albums.length,
      track: resultsData.tracks.length,
      artist: resultsData.artists.length,
      album: resultsData.albums.length,
    }),
    [resultsData]
  );

  /* ---- actions ----------------------------------------------------------- */

  const selectItem = (item: SearchItem) => {
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
    if (e.key === "Escape") {
      e.preventDefault();
      requestClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, filteredItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredItems[sel]) selectItem(filteredItems[sel]);
    }
  };

  const hasQuery = dq.trim().length > 0;
  const hasResults = filteredItems.length > 0;

  /* ---- render ------------------------------------------------------------ */

  return createPortal(
    <>
      <SpotlightStyles />
      <div
        ref={scrimRef}
        className="sp-scrim"
        onMouseDown={requestClose}
        role="presentation"
        style={{
          background: "rgba(0,0,0,0.22)",
          WebkitBackdropFilter: "blur(4px)",
          backdropFilter: "blur(4px)",
        }}
      >
        <div
          ref={panelRef}
          className="sp-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={onKey}
          style={{
            ...glassSurface(false, true),
            // lighter, more translucent glass with only a slight blur
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04)), rgba(28,28,32,0.52)",
            WebkitBackdropFilter: "blur(14px) saturate(160%)",
            backdropFilter: "blur(14px) saturate(160%)",
            border: "1px solid rgba(255,255,255,0.16)",
            boxShadow:
              "0 24px 60px rgba(0,0,0,0.35), 0 4px 14px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.22)",
            borderRadius: 22,
            willChange: "transform, opacity",
          }}
        >
          <div className="sp-input-row">
            <Icon name="search" size={20} className="text-white/50 shrink-0" />
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              className="sp-input"
            />
            <div
              className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white/80 animate-spin shrink-0"
              style={{
                opacity: loading ? 1 : 0,
                transform: loading ? "scale(1)" : "scale(0.5)",
                transition: `opacity .25s ease, transform .35s ${EASE}`,
              }}
            />
          </div>

          {/* Filter tabs — slide open smoothly once the user starts typing */}
          <div
            className="sp-collapse"
            style={{
              gridTemplateRows: hasQuery ? "1fr" : "0fr",
              opacity: hasQuery ? 1 : 0,
            }}
          >
            <div className="sp-collapse-inner">
              <div className="flex items-center gap-1.5 px-4 py-2 border-y border-white/[0.08] bg-white/[0.02] text-xs">
                {FILTER_TABS.map((tab) => {
                  const count = tabCounts[tab.id];
                  const active = activeFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      tabIndex={hasQuery ? 0 : -1}
                      onClick={() => {
                        setActiveFilter(tab.id);
                        setSel(0);
                      }}
                      className={cn(
                        "px-3 py-1 rounded-full font-semibold flex items-center gap-1.5 cursor-pointer outline-none text-[11px] active:scale-95",
                        active
                          ? "bg-white/20 text-white shadow-sm ring-1 ring-white/25"
                          : "text-white/55 hover:text-white hover:bg-white/10"
                      )}
                      style={{
                        transition: `background .3s ease, color .3s ease, box-shadow .3s ease, transform .3s ${EASE}`,
                      }}
                    >
                      <span>{tab.label}</span>
                      {count > 0 && (
                        <span
                          className={cn(
                            "text-[10px] px-1.5 rounded-full",
                            active ? "bg-black/25 text-white" : "bg-white/10 text-white/55"
                          )}
                          style={{ transition: "background .3s ease, color .3s ease" }}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Results — the panel grows / shrinks to fit */}
          <div
            className="sp-collapse"
            style={{
              gridTemplateRows: hasResults ? "1fr" : "0fr",
              opacity: hasResults ? 1 : 0,
            }}
          >
            <div className="sp-collapse-inner">
              <ul className="sp-results divide-y divide-white/5">
                {filteredItems.map((it, i) => (
                  <li
                    key={it.id}
                    data-sel={i === sel}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => selectItem(it)}
                    className="sp-item flex items-center gap-3 px-3 py-2.5 cursor-pointer rounded-xl"
                    style={{
                      transition: "background-color .2s ease",
                      animation: `sp-item-in .4s ${EASE} both`,
                      animationDelay: `${Math.min(i, 10) * 24}ms`,
                    }}
                  >
                    <div
                      className={cn(
                        "overflow-hidden bg-white/5 shrink-0 border border-white/10 flex items-center justify-center",
                        it.type === "artist"
                          ? "w-11 h-11 rounded-full ring-1 ring-white/20 shadow-sm"
                          : "w-11 h-11 rounded-xl"
                      )}
                    >
                      <img
                        src={getMediaUrl(it.coverUrl) || "/logo.png"}
                        alt={it.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "/logo.png";
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white/95 truncate">
                        {it.title}
                      </p>
                      <p className="text-xs text-white/50 truncate flex items-center mt-0.5">
                        <span
                          className={cn(
                            "uppercase text-[9px] tracking-wider font-bold mr-1.5 px-1.5 rounded",
                            it.type === "artist"
                              ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                              : it.type === "album"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              : "bg-brand/20 text-brand border border-brand/30"
                          )}
                        >
                          {it.type === "track" ? "Song" : it.type}
                        </span>
                        <span className="truncate">{it.subtitle}</span>
                      </p>
                    </div>
                    <Icon
                      name={it.type === "track" ? "play" : "chevron-right"}
                      size={16}
                      className="text-white/40 shrink-0"
                    />
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {hasQuery && !loading && !hasResults && (
            <div
              className="sp-empty p-8 text-center text-white/45 text-xs font-medium"
              style={{ animation: `sp-fade-in .4s ${EASE} both` }}
            >
              No results in {activeFilter === "all" ? "the catalog" : activeFilter + "s"} for “{dq}”
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}