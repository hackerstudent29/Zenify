"use client";

import React, { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Settings, Save, Key, Plus, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function AdminSettingsPage() {
  const [keys, setKeys] = useState<{ 
    RAPIDAPI_KEYS: string[], 
    MUSIXMATCH_API_KEY: string,
    GENIUS_API_KEY: string,
    SPOTIFY_API_KEY: string,
    SOUNDCLOUD_API_KEY: string,
    YOUTUBE_API_KEY: string
  }>({
    RAPIDAPI_KEYS: [],
    MUSIXMATCH_API_KEY: '',
    GENIUS_API_KEY: '',
    SPOTIFY_API_KEY: '',
    SOUNDCLOUD_API_KEY: '',
    YOUTUBE_API_KEY: ''
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await api.get('/settings');
      const fetchedKeys = Array.isArray(res.data.RAPIDAPI_KEYS) ? res.data.RAPIDAPI_KEYS : (res.data.RAPIDAPI_KEY ? [res.data.RAPIDAPI_KEY] : []);
      setKeys({
        RAPIDAPI_KEYS: fetchedKeys.length > 0 ? fetchedKeys : [''],
        MUSIXMATCH_API_KEY: res.data.MUSIXMATCH_API_KEY || '',
        GENIUS_API_KEY: res.data.GENIUS_API_KEY || '',
        SPOTIFY_API_KEY: res.data.SPOTIFY_API_KEY || '',
        SOUNDCLOUD_API_KEY: res.data.SOUNDCLOUD_API_KEY || '',
        YOUTUBE_API_KEY: res.data.YOUTUBE_API_KEY || ''
      });
    } catch (error) {
      console.error("Failed to load settings:", error);
      toast.error("Failed to load API keys.");
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const payload = {
        RAPIDAPI_KEYS: keys.RAPIDAPI_KEYS.filter(k => k.trim() !== ''),
        MUSIXMATCH_API_KEY: keys.MUSIXMATCH_API_KEY.trim(),
        GENIUS_API_KEY: keys.GENIUS_API_KEY.trim(),
        SPOTIFY_API_KEY: keys.SPOTIFY_API_KEY.trim(),
        SOUNDCLOUD_API_KEY: keys.SOUNDCLOUD_API_KEY.trim(),
        YOUTUBE_API_KEY: keys.YOUTUBE_API_KEY.trim()
      };
      await api.put('/settings', payload);
      toast.success("Settings saved successfully!");
      fetchSettings();
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast.error("Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const addRapidApiKey = () => {
    setKeys(prev => ({ ...prev, RAPIDAPI_KEYS: [...prev.RAPIDAPI_KEYS, ''] }));
  };

  const updateRapidApiKey = (index: number, value: string) => {
    const newKeys = [...keys.RAPIDAPI_KEYS];
    newKeys[index] = value;
    setKeys(prev => ({ ...prev, RAPIDAPI_KEYS: newKeys }));
  };

  const removeRapidApiKey = (index: number) => {
    let newKeys = keys.RAPIDAPI_KEYS.filter((_, i) => i !== index);
    if (newKeys.length === 0) newKeys = [''];
    setKeys(prev => ({ ...prev, RAPIDAPI_KEYS: newKeys }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-white/50 w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Settings className="text-accent-brand" />
            System Settings
          </h1>
          <p className="text-white/60 mt-1">Manage API keys and global system configuration</p>
        </div>
        <button
          onClick={saveSettings}
          disabled={isSaving}
          className="bg-accent-brand text-black px-6 py-2.5 rounded-full font-bold flex items-center gap-2 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
        >
          {isSaving ? <Loader2 className="animate-spin w-5 h-5" /> : <Save className="w-5 h-5" />}
          Save Changes
        </button>
      </div>

      <div className="glass-panel p-6 space-y-6">
        <div className="flex items-center gap-2 pb-4 border-b border-white/10">
          <Key className="text-white/60 w-5 h-5" />
          <h2 className="text-xl font-bold">API Configuration</h2>
        </div>

        {/* RapidAPI Keys */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <label className="font-semibold text-white/90">Generic RapidAPI Keys (Fallback)</label>
            <button 
              onClick={addRapidApiKey}
              className="text-xs flex items-center gap-1 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors text-white"
            >
              <Plus size={14} /> Add Key
            </button>
          </div>
          
          <div className="space-y-3">
            {keys.RAPIDAPI_KEYS.map((key, idx) => (
              <div key={idx} className="flex gap-2 relative group">
                <input
                  type="text"
                  value={key}
                  onChange={(e) => updateRapidApiKey(idx, e.target.value)}
                  placeholder="Enter RapidAPI Key"
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-accent-brand/50 font-mono text-sm"
                />
                <button
                  onClick={() => removeRapidApiKey(idx)}
                  className="bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 p-3 rounded-xl transition-colors"
                  title="Remove Key"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            {keys.RAPIDAPI_KEYS.filter(k => k.trim() !== '').length === 0 && (
              <div className="flex items-center gap-2 text-yellow-400/80 bg-yellow-400/10 px-4 py-3 rounded-xl text-sm">
                <AlertCircle size={16} />
                <span>No RapidAPI keys configured. Lyrics fetching and YouTube search will fail.</span>
              </div>
            )}
            <p className="text-xs text-white/50 pl-1">
              If multiple keys are provided, the backend will randomly select one per request to rotate usage and avoid rate limits.
            </p>
          </div>
        </div>
        {/* Specific RapidAPI Keys */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
          <div className="space-y-2">
            <label className="font-semibold text-white/90">Genius API Key</label>
            <input
              type="text"
              value={keys.GENIUS_API_KEY}
              onChange={(e) => setKeys(prev => ({ ...prev, GENIUS_API_KEY: e.target.value }))}
              placeholder="Enter Genius API Key"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-accent-brand/50 font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="font-semibold text-white/90">Spotify API Key</label>
            <input
              type="text"
              value={keys.SPOTIFY_API_KEY}
              onChange={(e) => setKeys(prev => ({ ...prev, SPOTIFY_API_KEY: e.target.value }))}
              placeholder="Enter Spotify API Key"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-accent-brand/50 font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="font-semibold text-white/90">SoundCloud API Key</label>
            <input
              type="text"
              value={keys.SOUNDCLOUD_API_KEY}
              onChange={(e) => setKeys(prev => ({ ...prev, SOUNDCLOUD_API_KEY: e.target.value }))}
              placeholder="Enter SoundCloud API Key"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-accent-brand/50 font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="font-semibold text-white/90">YouTube API Key</label>
            <input
              type="text"
              value={keys.YOUTUBE_API_KEY}
              onChange={(e) => setKeys(prev => ({ ...prev, YOUTUBE_API_KEY: e.target.value }))}
              placeholder="Enter YouTube API Key"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-accent-brand/50 font-mono text-sm"
            />
          </div>
        </div>

        {/* Musixmatch API Key */}
        <div className="space-y-2 pt-6">
          <label className="font-semibold text-white/90">Musixmatch API Key (Optional)</label>
          <input
            type="text"
            value={keys.MUSIXMATCH_API_KEY}
            onChange={(e) => setKeys(prev => ({ ...prev, MUSIXMATCH_API_KEY: e.target.value }))}
            placeholder="Enter Musixmatch API Key"
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-accent-brand/50 font-mono text-sm"
          />
        </div>

      </div>
    </div>
  );
}
