"use client";
import React, { useDeferredValue, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import api from "@/lib/api";
import { getMediaUrl, getTrackCover } from "@/lib/utils";
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

export function SpotlightSearchOverlay({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const [items, setItems] = useState<SearchItem[]>([]);
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
      setItems([]);
      setLoading(false);
      return;
    }
    const ctl = new AbortController();
    setLoading(true);

    const id = setTimeout(async () => {
      try {
        const res = await api.get("search", {
          params: { q: dq.trim(), limit: 12 },
          signal: ctl.signal,
        });
        const data = res.data;
        const mapped: SearchItem[] = [];

        if (Array.isArray(data?.tracks)) {
          data.tracks.slice(0, 6).forEach((t: any) => {
            mapped.push({
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
          data.artists.slice(0, 3).forEach((a: any) => {
            mapped.push({
              id: `artist-${a.id}`,
              type: "artist",
              title: a.name,
              subtitle: "Artist",
              coverUrl: a.imageUrl || a.coverUrl,
              raw: a,
            });
          });
        }
        if (Array.isArray(data?.albums)) {
          data.albums.slice(0, 3).forEach((al: any) => {
            mapped.push({
              id: `album-${al.id}`,
              type: "album",
              title: al.title,
              subtitle: al.artist?.name || "Album",
              coverUrl: al.coverUrl,
              raw: al,
            });
          });
        }

        setItems(mapped);
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
      setSel((s) => Math.min(s + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[sel]) {
        selectItem(items[sel]);
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

        {items.length > 0 && (
          <ul className="sp-results divide-y divide-white/5">
            {items.map((it, i) => (
              <li
                key={it.id}
                data-sel={i === sel}
                onMouseEnter={() => setSel(i)}
                onClick={() => selectItem(it)}
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer rounded-xl transition-colors duration-100"
              >
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-800 shrink-0 border border-white/5">
                  <img
                    src={getMediaUrl(it.coverUrl) || "/logo.png"}
                    alt={it.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white/95 truncate">
                    {it.title}
                  </p>
                  <p className="text-xs text-white/50 truncate">
                    <span className="uppercase text-[10px] tracking-wider text-brand font-bold mr-1.5">
                      {it.type}
                    </span>
                    {it.subtitle}
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

        {dq.trim() && !loading && items.length === 0 && (
          <div className="p-8 text-center text-zinc-500 text-xs uppercase tracking-wider font-semibold">
            No matching results found for "{dq}"
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
