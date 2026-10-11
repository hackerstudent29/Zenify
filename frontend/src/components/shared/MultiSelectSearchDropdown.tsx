"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Search,
  X,
  Check,
  ChevronDown,
  Loader2,
  AlertCircle,
  Music2,
  Globe,
  User,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface DropdownItem {
  id: string;
  name: string;
  nativeName?: string;
  image?: string;
  subtext?: string;
}

export interface MultiSelectSearchDropdownProps {
  type: "artist" | "genre" | "language";
  title: string;
  placeholder?: string;
  items: DropdownItem[];
  selectedIds: string[];
  selectedItems?: DropdownItem[]; // Full objects for compact strip display (needed for avatars)
  onToggle: (item: DropdownItem) => void;
  onRemove: (id: string) => void;
  minCount: number;
  maxCount: number;
  onSearch?: (query: string, signal: AbortSignal) => Promise<DropdownItem[]>;
  isLoading?: boolean;
  className?: string;
  idPrefix?: string;
}

export function MultiSelectSearchDropdown({
  type,
  title,
  placeholder,
  items,
  selectedIds,
  selectedItems,
  onToggle,
  onRemove,
  minCount,
  maxCount,
  onSearch,
  isLoading: isInitialLoading = false,
  className,
  idPrefix = "msd",
}: MultiSelectSearchDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DropdownItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Check mobile viewport (< 640px)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Handle click outside to close desktop overlay
  useEffect(() => {
    if (!isOpen || isMobile) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, isMobile]);

  // Debounced search for live API searches
  useEffect(() => {
    if (!onSearch) return;

    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsSearching(true);
    setSearchError(null);
    setHighlightedIndex(-1);

    const timer = setTimeout(async () => {
      try {
        const results = await onSearch(query.trim(), controller.signal);
        setSearchResults(results || []);
      } catch (err: any) {
        if (err?.name === "AbortError" || err?.name === "CanceledError") return;
        setSearchError("Failed to search. Please retry.");
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, onSearch]);

  // Filtered items when using static items list
  const displayItems = useMemo(() => {
    if (onSearch) {
      return query.trim() ? searchResults : items;
    }
    if (!query.trim()) return items;
    const q = query.toLowerCase().trim();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.nativeName && item.nativeName.toLowerCase().includes(q))
    );
  }, [items, searchResults, query, onSearch]);

  const isMaxReached = selectedIds.length >= maxCount;

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === "Escape") {
      setIsOpen(false);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < displayItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : displayItems.length - 1));
    } else if (e.key === "Enter" && highlightedIndex >= 0 && highlightedIndex < displayItems.length) {
      e.preventDefault();
      const item = displayItems[highlightedIndex];
      const isSelected = selectedIds.includes(item.id);
      if (isSelected || !isMaxReached) {
        onToggle(item);
      }
    }
  };

  // Full item objects for compact strip
  const compactDisplayList: DropdownItem[] = useMemo(() => {
    if (selectedItems && selectedItems.length > 0) {
      return selectedItems;
    }
    return selectedIds.map((id) => {
      const match = items.find((i) => i.id === id);
      return match || { id, name: id };
    });
  }, [selectedItems, selectedIds, items]);

  const typeIcon =
    type === "artist" ? (
      <User className="w-4 h-4 text-brand" />
    ) : type === "language" ? (
      <Globe className="w-4 h-4 text-brand" />
    ) : (
      <Music2 className="w-4 h-4 text-brand" />
    );

  const defaultPlaceholder =
    placeholder ||
    (type === "artist"
      ? "Search artists (e.g. A.R. Rahman, The Weeknd)..."
      : type === "language"
      ? "Search languages..."
      : "Search genres...");

  return (
    <div ref={containerRef} className={cn("space-y-3 w-full", className)} id={`${idPrefix}-wrapper`}>
      {/* Header with Title and Limits Counter */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold font-oswald uppercase tracking-wider text-zinc-300 flex items-center gap-2">
          {typeIcon}
          <span>{title}</span>
        </label>
        <div className="flex items-center gap-2">
          <span className="text-xs font-libre font-semibold text-zinc-400">
            Selected: <strong className="text-brand font-bold">{selectedIds.length}</strong> / {maxCount}{" "}
            <span className="text-[10px] text-zinc-500">(Min {minCount})</span>
          </span>
          {isMaxReached && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 font-semibold font-libre">
              Max {maxCount}
            </span>
          )}
        </div>
      </div>

      {/* 1.7 Compact Selected-Item Display: Single-line Horizontally Scrollable Strip */}
      {compactDisplayList.length > 0 && (
        <div
          className="w-full flex items-center gap-2 overflow-x-auto py-1 px-1 scrollbar-none snap-x"
          role="region"
          aria-label={`Selected ${title}`}
        >
          {compactDisplayList.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-full bg-zinc-800/90 hover:bg-zinc-800 border border-white/10 text-white text-xs shrink-0 snap-start transition-all"
            >
              {type === "artist" && (
                <img
                  src={
                    item.image ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=18181b&color=e11d48`
                  }
                  alt={item.name}
                  className="w-5 h-5 rounded-full object-cover shrink-0 border border-white/20"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=18181b&color=e11d48`;
                  }}
                />
              )}
              <span className="font-libre font-medium text-xs truncate max-w-[110px] sm:max-w-[140px]">
                {item.name}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(item.id);
                }}
                className="text-zinc-400 hover:text-brand transition-colors p-0.5 rounded-full cursor-pointer"
                title={`Remove ${item.name}`}
                aria-label={`Remove ${item.name}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Trigger Button & Search Bar */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen) {
              setTimeout(() => searchInputRef.current?.focus(), 100);
            }
          }}
          className={cn(
            "w-full h-11 px-4 bg-zinc-900 border rounded-xl text-left text-xs sm:text-sm flex items-center justify-between transition-all cursor-pointer",
            isOpen
              ? "border-brand shadow-[0_0_15px_rgba(225,29,72,0.2)] text-white"
              : "border-white/10 hover:border-white/20 text-zinc-300"
          )}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <div className="flex items-center gap-2.5 truncate">
            <Search className="w-4 h-4 text-zinc-500 shrink-0" />
            <span className="truncate text-zinc-400">
              {selectedIds.length > 0
                ? `${selectedIds.length} ${title.toLowerCase()} chosen — Click to modify`
                : defaultPlaceholder}
            </span>
          </div>
          <ChevronDown
            className={cn(
              "w-4 h-4 text-zinc-400 transition-transform shrink-0",
              isOpen && "rotate-180 text-brand"
            )}
          />
        </button>

        {/* ── DESKTOP & TABLET OVERLAY PANEL (>= 640px) ── */}
        {isOpen && !isMobile && (
          <div
            className="absolute z-50 left-0 right-0 mt-2 bg-[#18181B] border border-white/15 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] max-h-[min(50dvh,360px)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            role="listbox"
            tabIndex={-1}
            onKeyDown={handleKeyDown}
          >
            {/* Search Input in Overlay */}
            <div className="p-3 border-b border-white/10 shrink-0 bg-[#18181B]/95 backdrop-blur-sm">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-3.5 h-3.5" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={defaultPlaceholder}
                  className="w-full h-9 pl-9 pr-8 bg-zinc-900 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand transition-colors"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-brand w-3.5 h-3.5 animate-spin" />
                )}
                {query && !isSearching && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Max Limit Warning in Overlay */}
            {isMaxReached && (
              <div className="px-3.5 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-[11px] text-amber-300 font-libre flex items-center justify-between shrink-0">
                <span>Maximum limit of {maxCount} reached. Deselect an item to add another.</span>
              </div>
            )}

            {/* Scrollable Results List */}
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-white/5 overscroll-contain">
              {searchError && (
                <div className="p-4 text-xs text-rose-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{searchError}</span>
                </div>
              )}

              {isInitialLoading && (
                <div className="py-8 flex flex-col items-center justify-center gap-2 text-zinc-500 text-xs font-libre">
                  <Loader2 className="w-5 h-5 text-brand animate-spin" />
                  <span>Loading catalog...</span>
                </div>
              )}

              {!isInitialLoading && !searchError && displayItems.length === 0 && (
                <div className="py-8 text-center text-xs text-zinc-500 font-libre px-4">
                  {query
                    ? `No matching ${title.toLowerCase()} found for "${query}".`
                    : `No ${title.toLowerCase()} available.`}
                </div>
              )}

              {displayItems.map((item, idx) => {
                const isSelected = selectedIds.includes(item.id);
                const isDisabled = !isSelected && isMaxReached;
                const isHighlighted = idx === highlightedIndex;

                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => onToggle(item)}
                    className={cn(
                      "w-full px-4 py-2.5 flex items-center justify-between text-left transition-colors cursor-pointer",
                      isHighlighted && "bg-white/10",
                      isSelected ? "bg-brand/10 text-white" : "hover:bg-white/5 text-zinc-300",
                      isDisabled && "opacity-40 cursor-not-allowed hover:bg-transparent"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-3">
                      {type === "artist" && (
                        <img
                          src={
                            item.image ||
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=18181b&color=e11d48`
                          }
                          alt={item.name}
                          className="w-8 h-8 rounded-full object-cover shrink-0 border border-white/15"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=18181b&color=e11d48`;
                          }}
                        />
                      )}
                      <div className="min-w-0">
                        <p className={cn("text-xs font-bold truncate", isSelected ? "text-white" : "text-zinc-200")}>
                          {item.name}
                        </p>
                        {item.nativeName && (
                          <p className="text-[10px] text-zinc-500 font-libre truncate">{item.nativeName}</p>
                        )}
                        {item.subtext && (
                          <p className="text-[10px] text-zinc-500 uppercase tracking-widest truncate">{item.subtext}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Checkbox box indicator */}
                      <div
                        className={cn(
                          "w-4 h-4 rounded-md border flex items-center justify-center transition-all",
                          isSelected
                            ? "bg-brand border-brand text-white shadow-[0_0_8px_rgba(225,29,72,0.4)]"
                            : "border-white/20 bg-zinc-900/60"
                        )}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── MOBILE BOTTOM SHEET (< 640px) ── */}
        {isOpen && isMobile && (
          <div className="fixed inset-0 z-[1200] flex flex-col justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            {/* Tap outside backdrop */}
            <div className="flex-1" onClick={() => setIsOpen(false)} />

            {/* Bottom Sheet Box */}
            <div className="w-full max-h-[60dvh] bg-[#18181B] border-t border-white/10 rounded-t-3xl flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-250">
              {/* Sheet Header: Title, Counter, and Prominent Done Button */}
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0 bg-[#18181B]">
                <div className="flex items-center gap-2">
                  {typeIcon}
                  <span className="text-sm font-bold font-oswald uppercase tracking-wider text-white">
                    {title}
                  </span>
                  <span className="text-[11px] font-mono text-brand font-bold">
                    ({selectedIds.length}/{maxCount})
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="h-8 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center cursor-pointer"
                >
                  Done
                </button>
              </div>

              {/* Sheet Search Bar */}
              <div className="p-3 border-b border-white/10 shrink-0 bg-zinc-900/60">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-3.5 h-3.5" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={defaultPlaceholder}
                    className="w-full h-10 pl-9 pr-8 bg-zinc-900 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand"
                  />
                  {isSearching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-brand w-3.5 h-3.5 animate-spin" />
                  )}
                  {query && !isSearching && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Max Warning in Mobile Sheet */}
              {isMaxReached && (
                <div className="px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-[11px] text-amber-300 font-libre shrink-0">
                  Maximum {maxCount} reached. Deselect an item to add another.
                </div>
              )}

              {/* Scrollable Items in Bottom Sheet */}
              <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-white/5 overscroll-contain pb-6">
                {searchError && (
                  <div className="p-4 text-xs text-rose-400 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{searchError}</span>
                  </div>
                )}

                {displayItems.length === 0 && !isSearching && (
                  <div className="py-10 text-center text-xs text-zinc-500 font-libre px-4">
                    {query
                      ? `No matching ${title.toLowerCase()} found for "${query}".`
                      : `No ${title.toLowerCase()} available.`}
                  </div>
                )}

                {displayItems.map((item) => {
                  const isSelected = selectedIds.includes(item.id);
                  const isDisabled = !isSelected && isMaxReached;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => onToggle(item)}
                      className={cn(
                        "w-full px-4 py-3 flex items-center justify-between text-left transition-colors cursor-pointer",
                        isSelected ? "bg-brand/10 text-white" : "active:bg-white/5 text-zinc-300",
                        isDisabled && "opacity-40 cursor-not-allowed active:bg-transparent"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-3">
                        {type === "artist" && (
                          <img
                            src={
                              item.image ||
                              `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=18181b&color=e11d48`
                            }
                            alt={item.name}
                            className="w-9 h-9 rounded-full object-cover shrink-0 border border-white/15"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=18181b&color=e11d48`;
                            }}
                          />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{item.name}</p>
                          {item.nativeName && (
                            <p className="text-[10px] text-zinc-400 font-libre truncate">{item.nativeName}</p>
                          )}
                          {item.subtext && (
                            <p className="text-[10px] text-zinc-500 uppercase tracking-widest truncate">{item.subtext}</p>
                          )}
                        </div>
                      </div>

                      <div
                        className={cn(
                          "w-5 h-5 rounded-md border flex items-center justify-center transition-all shrink-0",
                          isSelected
                            ? "bg-brand border-brand text-white shadow-[0_0_8px_rgba(225,29,72,0.4)]"
                            : "border-white/20 bg-zinc-900/60"
                        )}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
