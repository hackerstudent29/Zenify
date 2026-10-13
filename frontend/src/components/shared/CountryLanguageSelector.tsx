"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Globe, Check, ChevronDown, X, Sparkles, Search, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface CountryOption {
  code: string;
  name: string;
}

export interface LanguageOption {
  code: string;
  name: string;
  nativeName?: string;
}

interface CountryLanguageSelectorProps {
  className?: string;
  compact?: boolean;
  onSelectionChange?: (selection: { countryCode: string; languageCode: string }) => void;
}

export function CountryLanguageSelector({
  className,
  compact = false,
  onSelectionChange
}: CountryLanguageSelectorProps) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);

  // Reference Metadata Query
  const { data: prefData } = useQuery({
    queryKey: ['discover-preferences-meta'],
    queryFn: async () => {
      const res = await api.get('/discover/preferences');
      return res.data;
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
  });

  const countries: CountryOption[] = useMemo(() => prefData?.countries || [], [prefData]);
  const languages: LanguageOption[] = useMemo(() => prefData?.languages || [], [prefData]);

  // Selected State
  const [selectedCountryCode, setSelectedCountryCode] = useState<string>("");
  const [selectedLanguageCode, setSelectedLanguageCode] = useState<string>("");

  // Search Filters inside modal
  const [countrySearch, setCountrySearch] = useState("");
  const [languageSearch, setLanguageSearch] = useState("");

  // Initialize from localStorage or server response
  useEffect(() => {
    try {
      const localCountry = localStorage.getItem("zenify_selected_country");
      const localLang = localStorage.getItem("zenify_selected_language");

      if (localCountry && localLang) {
        setSelectedCountryCode(localCountry);
        setSelectedLanguageCode(localLang);
      } else if (prefData?.selectedCountry?.code && prefData?.selectedLanguage?.code) {
        setSelectedCountryCode(prefData.selectedCountry.code);
        setSelectedLanguageCode(prefData.selectedLanguage.code);
        localStorage.setItem("zenify_selected_country", prefData.selectedCountry.code);
        localStorage.setItem("zenify_selected_language", prefData.selectedLanguage.code);
      } else {
        // Default to India + Tamil if unconfigured
        setSelectedCountryCode("IN");
        setSelectedLanguageCode("ta");
        localStorage.setItem("zenify_selected_country", "IN");
        localStorage.setItem("zenify_selected_language", "ta");
      }
    } catch {}
  }, [prefData]);

  const activeCountry = useMemo(() => {
    return countries.find(c => c.code.toUpperCase() === selectedCountryCode.toUpperCase()) || 
      (selectedCountryCode === "IN" ? { code: "IN", name: "India" } : null);
  }, [countries, selectedCountryCode]);

  const activeLanguage = useMemo(() => {
    return languages.find(l => l.code.toLowerCase() === selectedLanguageCode.toLowerCase()) || 
      (selectedLanguageCode === "ta" ? { code: "ta", name: "Tamil" } : null);
  }, [languages, selectedLanguageCode]);

  // Mutation to persist preferences
  const saveMutation = useMutation({
    mutationFn: async ({ countryCode, languageCode }: { countryCode: string; languageCode: string }) => {
      return api.put('/discover/preferences', { countryCode, languageCode });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discover-preferences-meta'] });
      queryClient.invalidateQueries({ queryKey: ['discover-sections'] });
      queryClient.invalidateQueries({ queryKey: ['discover-tracks'] });
      queryClient.invalidateQueries({ queryKey: ['home-made-for-you'] });
    }
  });

  const handleApply = (countryCode: string, languageCode: string) => {
    if (!countryCode || !languageCode) return;

    setSelectedCountryCode(countryCode);
    setSelectedLanguageCode(languageCode);

    try {
      localStorage.setItem("zenify_selected_country", countryCode);
      localStorage.setItem("zenify_selected_language", languageCode);
    } catch {}

    saveMutation.mutate({ countryCode, languageCode });

    window.dispatchEvent(
      new CustomEvent("zenify:country-language-changed", {
        detail: { countryCode, languageCode }
      })
    );

    if (onSelectionChange) {
      onSelectionChange({ countryCode, languageCode });
    }

    setIsOpen(false);
  };

  const handleClear = () => {
    setSelectedCountryCode("");
    setSelectedLanguageCode("");
    try {
      localStorage.removeItem("zenify_selected_country");
      localStorage.removeItem("zenify_selected_language");
    } catch {}

    window.dispatchEvent(
      new CustomEvent("zenify:country-language-changed", {
        detail: { countryCode: null, languageCode: null }
      })
    );

    setIsOpen(false);
  };

  // Filtered dropdown options
  const filteredCountries = useMemo(() => {
    const q = countrySearch.toLowerCase().trim();
    if (!q) return countries;
    return countries.filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  }, [countries, countrySearch]);

  const filteredLanguages = useMemo(() => {
    const q = languageSearch.toLowerCase().trim();
    if (!q) return languages;
    return languages.filter(l => 
      l.name.toLowerCase().includes(q) || 
      l.code.toLowerCase().includes(q) || 
      (l.nativeName && l.nativeName.toLowerCase().includes(q))
    );
  }, [languages, languageSearch]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button
          className={cn(
            "h-10 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer shadow-sm group select-none",
            className
          )}
          title="Select Country & Language for Discovery"
        >
          <Globe size={14} className="text-brand transition-transform group-hover:rotate-12" />
          <span className="truncate max-w-[160px] sm:max-w-none">
            {activeCountry && activeLanguage ? (
              `${activeCountry.name} · ${activeLanguage.name}`
            ) : (
              "Discover By Region"
            )}
          </span>
          <ChevronDown size={12} className="text-white/40 group-hover:text-white/80 transition-colors" />
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-xl w-[94vw] bg-[#121214] border border-white/10 rounded-2xl p-6 text-foreground shadow-2xl backdrop-blur-2xl">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2 text-brand text-[10px] font-bold uppercase tracking-widest">
            <Sparkles size={12} />
            <span>Regional Music Discovery</span>
          </div>
          <DialogTitle className="text-xl font-black font-oswald uppercase text-white tracking-wide">
            Select Country & Song Language
          </DialogTitle>
          <p className="text-xs text-white/50 leading-relaxed font-sans">
            Zenify strictly discovers and plays verified songs originating from your selected country and sung in your chosen language.
          </p>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
          {/* Country Column */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-white/70 block">
              1. Country of Origin
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                placeholder="Search country (e.g. India, US)..."
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-zinc-900 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-brand/60"
              />
            </div>
            <div className="max-h-52 overflow-y-auto space-y-1 pr-1 border border-white/5 rounded-lg p-1 bg-black/20">
              {filteredCountries.map((c) => {
                const isSelected = selectedCountryCode.toUpperCase() === c.code.toUpperCase();
                return (
                  <button
                    key={c.code}
                    onClick={() => setSelectedCountryCode(c.code)}
                    className={cn(
                      "w-full flex items-center justify-between p-2 rounded-md text-xs font-medium transition-all text-left",
                      isSelected
                        ? "bg-brand/15 text-brand border border-brand/30"
                        : "hover:bg-white/5 text-white/80 hover:text-white"
                    )}
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="text-[9px] uppercase font-mono tracking-wider opacity-60 ml-2 shrink-0">
                      {c.code}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Language Column */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-white/70 block">
              2. Song Language
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                placeholder="Search language (e.g. Tamil, English)..."
                value={languageSearch}
                onChange={(e) => setLanguageSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-zinc-900 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-brand/60"
              />
            </div>
            <div className="max-h-52 overflow-y-auto space-y-1 pr-1 border border-white/5 rounded-lg p-1 bg-black/20">
              {filteredLanguages.map((l) => {
                const isSelected = selectedLanguageCode.toLowerCase() === l.code.toLowerCase();
                return (
                  <button
                    key={l.code}
                    onClick={() => setSelectedLanguageCode(l.code)}
                    className={cn(
                      "w-full flex items-center justify-between p-2 rounded-md text-xs font-medium transition-all text-left",
                      isSelected
                        ? "bg-brand/15 text-brand border border-brand/30"
                        : "hover:bg-white/5 text-white/80 hover:text-white"
                    )}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{l.name}</span>
                      {l.nativeName && l.nativeName !== l.name && (
                        <span className="text-[10px] text-white/40 font-normal truncate">{l.nativeName}</span>
                      )}
                    </div>
                    {isSelected && <Check size={12} className="text-brand shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-white/5">
          <button
            onClick={handleClear}
            className="text-xs text-white/40 hover:text-white/70 transition-colors flex items-center gap-1.5"
          >
            <RotateCcw size={12} />
            <span>Clear selection</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsOpen(false)}
              className="h-9 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-xs font-medium transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => handleApply(selectedCountryCode, selectedLanguageCode)}
              disabled={!selectedCountryCode || !selectedLanguageCode}
              className="h-10 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 shadow-sm"
            >
              <Sparkles size={12} className="text-brand" />
              <span>Apply & Discover</span>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
