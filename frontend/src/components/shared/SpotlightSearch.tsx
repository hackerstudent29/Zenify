"use client";
import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import api from "@/lib/api";
import { getMediaUrl, getTrackCover, cn } from "@/lib/utils";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { useNavigate } from "react-router-dom";
import { Glass } from "@/components/ui/glass";

export function HeaderSearchButton() {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const typing = /input|textarea/i.test((e.target as HTMLElement).tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label="Spotlight Search"
        title="Search (⌘K or /)"
        onClick={() => setOpen(true)}
        className="group relative flex items-center gap-2.5 h-10 w-10 sm:w-60 md:w-72 lg:w-80 rounded-full px-2.5 sm:px-3.5 cursor-pointer shrink-0 transition-all duration-300 ease-out select-none active:scale-[0.98] outline-none justify-center sm:justify-start"
      >
        {/* Glassmorphism background matching the global player */}
        <div
          className="absolute inset-0 pointer-events-none rounded-full overflow-hidden backdrop-blur-xl bg-black/20 hover:bg-black/15 transition-all border border-white/15 group-hover:border-white/25"
          style={{
            boxShadow: "0 10px 24px -8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.12)"
          }}
        >
          <div className="absolute -inset-1 opacity-90 group-hover:opacity-100 transition-opacity">
            <Glass
              className="w-full h-full"
              radius={20}
              blur={12}
              behind="transparent"
              optics={{
                chroma: 0.1,
                domeDepth: 30,
                edgeHighlight: 0.15,
                glow: 0.12,
                tint: 0.05,
                frost: 12
              }}
            >
              <div className="w-full h-12" />
            </Glass>
          </div>
        </div>

        {/* Search Icon with subtle brand red accent on hover */}
        <div className="relative z-10 flex items-center justify-center shrink-0 text-white/70 group-hover:text-brand transition-colors">
          <Icon name="search" size={16} />
        </div>

        {/* Placeholder label */}
        <span className="relative z-10 hidden sm:inline text-xs font-medium text-white/55 group-hover:text-white/85 truncate flex-1 text-left transition-colors">
          Search songs, artists, albums...
        </span>

        {/* Shortcut badge ⌘K */}
        <kbd className="relative z-10 hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-white/50 group-hover:text-white/80 bg-white/10 group-hover:bg-white/15 border border-white/15 rounded-md backdrop-blur-sm transition-all shadow-sm">
          ⌘K
        </kbd>
      </button>
      {open && (
        <SpotlightSearchOverlay
          onClose={() => {
            setOpen(false);
            btn.current?.focus();
          }}
        />
      )}
    </>
  );
}

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

export function SpotlightSearchOverlay({ onClose }: { onClose: () => void }) {
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
  const navigate = useNavigate();

  useEffect(() => {
    input.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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
          const topType = data.topResult.type || (top.isArtist ? "artist" : top.isAlbum ? "album" : "track");
          mappedTopResult = {
            id: `top-${top.id}`,
            type: topType,
            title: top.title || top.name,
            subtitle: topType === "artist" 
              ? (top.follower_count ? `${top.follower_count.toLocaleString()} Monthly Listeners` : "Artist") 
              : topType === "album" 
                ? [top.artist?.name || "Album", top.year, top.trackCount ? `${top.trackCount} ${top.trackCount === 1 ? 'Song' : 'Songs'}` : ""].filter(Boolean).join(" • ")
                : (top.artist?.name || top.artistName || "Song"),
            coverUrl: topType === "artist" ? (top.imageUrl || top.coverUrl) : (top.coverUrl || getTrackCover(top)),
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
              subtitle: a.trackCount ? `${a.trackCount} ${a.trackCount === 1 ? 'Song' : 'Songs'}` : "Artist",
              coverUrl: a.imageUrl || a.coverUrl,
              raw: a,
            });
          });
        }

        if (Array.isArray(data?.albums)) {
          data.albums.forEach((al: any) => {
            const artistName = al.artist?.name || "Album";
            const year = al.releaseDate ? String(al.releaseDate).slice(0, 4) : "";
            const tracksInfo = al.trackCount ? `${al.trackCount} ${al.trackCount === 1 ? 'Song' : 'Songs'}` : "";
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

  const filteredItems = useMemo(() => {
    if (activeFilter === "track") return resultsData.tracks;
    if (activeFilter === "artist") return resultsData.artists;
    if (activeFilter === "album") return resultsData.albums;

    // "all": unified high-priority matching list without artificial category partitions
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

    // Sort by relevance score descending so exact and closest matches always come first
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
      all: resultsData.tracks.length + resultsData.artists.length + resultsData.albums.length,
      track: resultsData.tracks.length,
      artist: resultsData.artists.length,
      album: resultsData.albums.length,
    }),
    [resultsData]
  );

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
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, filteredItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredItems[sel]) {
        selectItem(filteredItems[sel]);
      }
    }
  };

  return createPortal(
    <div className="sp-scrim" onMouseDown={onClose} role="presentation">
      <div
        className="sp-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Spotlight Search"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <div className="sp-input-row">
          <Icon name="search" size={20} className="text-zinc-400 shrink-0" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search music"
            className="sp-input"
          />
          {loading && (
            <div className="w-4 h-4 rounded-full border-2 border-brand/30 border-t-brand animate-spin shrink-0" />
          )}
        </div>

        {/* Filter Tabs Bar (All, Songs, Artists, Albums) */}
        {dq.trim().length > 0 && (
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/[0.08] bg-white/[0.02] text-xs">
            {FILTER_TABS.map((tab) => {
              const count = tabCounts[tab.id];
              const active = activeFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveFilter(tab.id);
                    setSel(0);
                  }}
                  className={cn(
                    "px-3 py-1 rounded-full font-semibold transition-all flex items-center gap-1.5 cursor-pointer outline-none text-[11px]",
                    active
                      ? "bg-brand text-white shadow-sm ring-1 ring-brand/50"
                      : "text-zinc-400 hover:text-white hover:bg-white/10"
                  )}
                >
                  <span>{tab.label}</span>
                  {count > 0 && (
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.2 rounded-full",
                        active ? "bg-black/30 text-white" : "bg-white/10 text-zinc-400"
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {filteredItems.length > 0 && (
          <ul className="sp-results divide-y divide-white/5">
            {filteredItems.map((it, i) => {
              return (
                <li
                  key={it.id}
                  data-sel={i === sel}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => selectItem(it)}
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer rounded-xl transition-colors duration-100"
                >
                    {/* Round avatar for artists, rounded-xl cover for tracks & albums */}
                    <div
                      className={cn(
                        "overflow-hidden bg-zinc-800 shrink-0 border border-white/10 flex items-center justify-center",
                        it.type === "artist"
                          ? "w-11 h-11 rounded-full ring-2 ring-brand/40 shadow-sm"
                          : "w-11 h-11 rounded-xl"
                      )}
                    >
                      <img
                        src={getMediaUrl(it.coverUrl) || (it.type === "artist" ? "/logo.png" : "/logo.png")}
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
                            "uppercase text-[9px] tracking-wider font-bold mr-1.5 px-1.5 py-0.2 rounded",
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
              );
            })}
          </ul>
        )}

        {dq.trim() && !loading && filteredItems.length === 0 && (
          <div className="p-8 text-center text-zinc-500 text-xs uppercase tracking-wider font-semibold">
            No matching results found in {activeFilter === "all" ? "catalog" : activeFilter + "s"} for "{dq}"
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
