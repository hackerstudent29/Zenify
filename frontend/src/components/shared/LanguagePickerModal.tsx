"use client";

import React, { useState, useEffect } from 'react';
import { useLanguagePreferences } from '@/hooks/useLanguagePreferences';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Globe, Check, AlertCircle, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LanguagePickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LanguagePickerModal({ open, onOpenChange }: LanguagePickerModalProps) {
  const {
    languages,
    verifiedLanguages,
    suggestedLanguages,
    isLoading,
    isSaving,
    error,
    setError,
    saveLanguages
  } = useLanguagePreferences();

  const [selected, setSelected] = useState<string[]>([]);
  const [warning, setWarning] = useState<string | null>(null);

  // Sync state whenever modal opens or languages change
  useEffect(() => {
    if (open) {
      setSelected(languages);
      setWarning(null);
      setError(null);
    }
  }, [open, languages, setError]);

  const toggleLanguage = (langId: string) => {
    setWarning(null);
    setError(null);

    const isSelected = selected.includes(langId);

    if (isSelected) {
      if (selected.length <= 1) {
        setWarning('Minimum 1 language required.');
        return;
      }
      setSelected(selected.filter(id => id !== langId));
    } else {
      if (selected.length >= 6) {
        setWarning('Maximum 6 languages allowed. Please deselect a language to choose another.');
        return;
      }
      setSelected([...selected, langId]);
    }
  };

  const handleSave = async () => {
    setWarning(null);
    if (selected.length < 1) {
      setWarning('Please select at least 1 language.');
      return;
    }
    if (selected.length > 6) {
      setWarning('Maximum 6 languages allowed. Please deselect a language to choose another.');
      return;
    }

    const success = await saveLanguages(selected);
    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-[#121214] border border-white/10 text-white p-6 sm:p-8 rounded-2xl shadow-2xl overflow-hidden">
        <DialogHeader className="space-y-2 text-left">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
                <Globe className="w-4 h-4" />
              </div>
              <DialogTitle className="text-xl sm:text-2xl font-black font-oswald uppercase tracking-wide text-white">
                Music Languages
              </DialogTitle>
            </div>
            <div className="px-3 py-1 rounded-full text-[11px] font-bold font-libre tracking-wide border border-white/10 bg-zinc-900/80 text-zinc-300">
              <span className={cn(
                selected.length === 6 ? "text-amber-400 font-black" : "text-brand font-black"
              )}>
                {selected.length}
              </span>
              {' / 6 selected'}
            </div>
          </div>
          <DialogDescription className="text-xs sm:text-sm text-zinc-400 font-libre font-normal leading-relaxed">
            Select 1 to 6 languages to customize your homepage trending, new releases, and recommendations.
          </DialogDescription>
        </DialogHeader>

        {/* Warning or Error Notification */}
        {(warning || error) && (
          <div className="mt-3 p-3 rounded-xl bg-brand/15 border border-brand/30 flex items-start gap-2.5 animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 text-brand shrink-0 mt-0.5" />
            <p className="text-xs font-libre font-medium text-brand">
              {warning || error}
            </p>
          </div>
        )}

        {/* Suggested Banner */}
        {suggestedLanguages.length > 0 && selected.length === 0 && (
          <div className="mt-2 p-2.5 rounded-xl bg-zinc-900 border border-white/5 flex items-center gap-2 text-xs text-zinc-400 font-libre">
            <Sparkles className="w-3.5 h-3.5 text-brand shrink-0" />
            <span>Suggested based on your browser locale: <strong className="text-zinc-200 uppercase">{suggestedLanguages.join(', ')}</strong></span>
          </div>
        )}

        {/* Languages Grid */}
        <div className="mt-5 max-h-[340px] overflow-y-auto pr-1 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-zinc-500 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-brand" />
              <span className="text-xs font-libre">Loading verified languages...</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {verifiedLanguages.map((lang) => {
                const isSelected = selected.includes(lang.id);
                return (
                  <button
                    key={lang.id}
                    type="button"
                    onClick={() => toggleLanguage(lang.id)}
                    className={cn(
                      "group relative flex flex-col items-start p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer select-none",
                      isSelected
                        ? "bg-brand/10 border-brand text-white shadow-[0_0_15px_rgba(225,29,72,0.15)] ring-1 ring-brand/50"
                        : "bg-zinc-900/60 hover:bg-zinc-900 border-white/5 hover:border-white/15 text-zinc-400 hover:text-zinc-200"
                    )}
                  >
                    <div className="w-full flex items-center justify-between gap-1 mb-1">
                      <span className={cn(
                        "text-xs sm:text-sm font-bold font-oswald uppercase tracking-wider",
                        isSelected ? "text-white" : "text-zinc-300"
                      )}>
                        {lang.name}
                      </span>
                      {isSelected && (
                        <div className="w-4 h-4 rounded-full bg-brand flex items-center justify-center shrink-0">
                          <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] font-libre text-zinc-400 truncate max-w-full">
                      {lang.nativeName}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-xl text-xs font-libre font-semibold text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || selected.length < 1 || selected.length > 6}
            className="h-10 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Save Preferences</span>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

