import { registerPlugin, Capacitor } from '@capacitor/core';

export interface NativePlayerPlugin {
  showPlayer(options: { title: string; artist: string; cover: string }): Promise<void>;
  updateState(options: { isPlaying: boolean; currentTime: number; duration: number }): Promise<void>;
  addListener(eventName: 'togglePlay', listenerFunc: () => void): Promise<any>;
  addListener(eventName: 'onClose', listenerFunc: () => void): Promise<any>;
}

// Lazy initialization to prevent SSR crashes
let _plugin: NativePlayerPlugin | null = null;
const getPlugin = () => {
  if (typeof window === 'undefined') return null;
  if (!Capacitor.isNativePlatform()) return null;
  if (!_plugin) {
    _plugin = registerPlugin<NativePlayerPlugin>('NativePlayer');
  }
  return _plugin;
};

export const NativePlayerService = {
  async show(title: string, artist: string, cover: string) {
    const p = getPlugin();
    if (!p) return;
    try {
      await p.showPlayer({ title, artist, cover });
    } catch (e) {
      console.warn('NativePlayer not available', e);
    }
  },

  async update(isPlaying: boolean, currentTime: number, duration: number) {
    const p = getPlugin();
    if (!p) return;
    try {
      await p.updateState({ isPlaying, currentTime, duration });
    } catch (e) {
      // Ignore
    }
  },

  onTogglePlay(callback: () => void) {
    const p = getPlugin();
    if (!p) return Promise.resolve({ remove: () => {} });
    return p.addListener('togglePlay', () => callback());
  },

  onClose(callback: () => void) {
    const p = getPlugin();
    if (!p) return Promise.resolve({ remove: () => {} });
    return p.addListener('onClose', () => callback());
  }
};
