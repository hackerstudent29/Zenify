import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import notify from '@/lib/notify';

export interface VerifiedLanguage {
  id: string;
  name: string;
  nativeName: string;
}

const GUEST_LANG_KEY = 'zenify_guest_languages';

export function useLanguagePreferences() {
  const { user, isAuthenticated, updateUser } = useAuthStore();
  const queryClient = useQueryClient();

  const [languages, setLanguages] = useState<string[]>([]);
  const [verifiedLanguages, setVerifiedLanguages] = useState<VerifiedLanguage[]>([]);
  const [suggestedLanguages, setSuggestedLanguages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load preferences and catalog verified languages
  const fetchLanguages = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get('/preferences/languages');
      const verified: VerifiedLanguage[] = res.data?.verifiedLanguages || [];
      const suggested: string[] = res.data?.suggestedLanguages || ['english'];
      setVerifiedLanguages(verified);
      setSuggestedLanguages(suggested);

      if (isAuthenticated && user?.id) {
        // Authenticated user
        const serverLangs: string[] = res.data?.languages || [];
        // Check if there are guest languages to merge
        let guestLangs: string[] = [];
        try {
          const raw = localStorage.getItem(GUEST_LANG_KEY);
          if (raw) guestLangs = JSON.parse(raw);
        } catch {}

        if (guestLangs.length > 0) {
          try {
            const mergeRes = await api.post('/preferences/languages/merge', { languages: guestLangs });
            localStorage.removeItem(GUEST_LANG_KEY);
            const merged = mergeRes.data?.languages || serverLangs;
            setLanguages(merged);
            updateUser({
              preferences: {
                ...(user.preferences || {}),
                languages: merged
              }
            });
            return;
          } catch {
            // fallback to server langs if merge fails
          }
        }

        if (serverLangs.length > 0) {
          setLanguages(serverLangs);
        } else {
          // Pre-select suggested if user has no languages chosen yet
          setLanguages(suggested.slice(0, 3));
        }
      } else {
        // Guest user
        let storedGuest: string[] = [];
        try {
          const raw = localStorage.getItem(GUEST_LANG_KEY);
          if (raw) storedGuest = JSON.parse(raw);
        } catch {}

        if (storedGuest.length > 0) {
          setLanguages(storedGuest);
        } else {
          // Suggest browser languages for first visit
          setLanguages(suggested.slice(0, 3));
        }
      }
    } catch (err: any) {
      console.error('Failed to load language preferences:', err);
      setError(err?.message || 'Failed to load languages');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    fetchLanguages();
  }, [fetchLanguages]);

  // Save selected languages (1 to 6)
  const saveLanguages = useCallback(async (newLanguages: string[]) => {
    setError(null);

    if (newLanguages.length < 1) {
      const msg = 'Please select at least 1 language.';
      setError(msg);
      notify(msg, 'error');
      return false;
    }

    if (newLanguages.length > 6) {
      const msg = 'Maximum 6 languages allowed. Please deselect a language to choose another.';
      setError(msg);
      notify(msg, 'error');
      return false;
    }

    setIsSaving(true);
    try {
      if (isAuthenticated && user?.id) {
        const res = await api.put('/preferences/languages', { languages: newLanguages });
        const savedLangs = res.data?.languages || newLanguages;
        setLanguages(savedLangs);
        updateUser({
          preferences: {
            ...(user.preferences || {}),
            languages: savedLangs
          }
        });
      } else {
        // Save guest preferences in localStorage
        localStorage.setItem(GUEST_LANG_KEY, JSON.stringify(newLanguages));
        setLanguages(newLanguages);
      }

      // Invalidate home cache so home updates immediately
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['homepage-sections'] }),
        queryClient.invalidateQueries({ queryKey: ['home-sections'] }),
        queryClient.invalidateQueries({ queryKey: ['languages-pref'] }),
        queryClient.invalidateQueries({ queryKey: ['home-trending-now'] }),
        queryClient.invalidateQueries({ queryKey: ['home-new-releases-lang'] }),
        queryClient.invalidateQueries({ queryKey: ['home-made-for-you'] }),
        queryClient.invalidateQueries({ queryKey: ['home-feed'] })
      ]);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('zenify:preferences-updated', { detail: { languages: newLanguages } }));
      }

      notify('Language preferences updated', 'success');
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.error || err?.message || 'Failed to update languages';
      setError(msg);
      notify(msg, 'error');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [isAuthenticated, user, updateUser, queryClient]);

  return {
    languages,
    setLanguages,
    verifiedLanguages,
    suggestedLanguages,
    isLoading,
    isSaving,
    error,
    setError,
    saveLanguages,
    refetch: fetchLanguages
  };
}

