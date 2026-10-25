"use client";
import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import api from "@/lib/api";
import { getMediaUrl, getTrackCover, cn } from "@/lib/utils";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { useNavigate } from "react-router-dom";

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
        className="flex items-center justify-center w-9 h-9 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-white/10 text-brand press cursor-pointer shrink-0"
      >
        <Icon name="search" size={18} className="text-brand" />
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
              subtitle: a.trackCount ? `${a.trackCount} Songs` : "Artist",
              coverUrl: a.imageUrl || a.coverUrl,
              raw: a,
            });
          });
        }

        if (Array.isArray(data?.albums)) {
          data.albums.forEach((al: any) => {
            const artistName = al.artist?.name || "Album";
            const year = al.releaseDate ? String(al.releaseDate).slice(0, 4) : "";
            const tracksInfo = al.trackCount ? `${al.trackCount} Tracks` : "";
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

    // "all": curated overview with artists, top tracks, and albums
    const combined: SearchItem[] = [];
    if (resultsData.artists.length > 0) {
      combined.push(...resultsData.artists.slice(0, 3));
    }
    if (resultsData.albums.length > 0) {
      combined.push(...resultsData.albums.slice(0, 3));
    }
    if (resultsData.tracks.length > 0) {
      combined.push(...resultsData.tracks.slice(0, 8));
    }
    // Append remaining albums/tracks if space permits
    if (resultsData.albums.length > 3) {
      combined.push(...resultsData.albums.slice(3, 8));
    }
    if (resultsData.tracks.length > 8) {
      combined.push(...resultsData.tracks.slice(8, 16));
    }

    return combined;
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
            placeholder="Search songs, artists, albums (ESC to close)"
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
            {filteredItems.map((it, i) => (
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
            ))}
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
