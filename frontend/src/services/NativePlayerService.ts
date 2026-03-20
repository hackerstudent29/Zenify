import { registerPlugin } from '@capacitor/core';

export interface NativePlayerPlugin {
  showPlayer(options: { title: string; artist: string; cover: string }): Promise<void>;
  updateState(options: { isPlaying: boolean; currentTime: number; duration: number }): Promise<void>;
  addListener(eventName: 'togglePlay', listenerFunc: () => void): Promise<any>;
  addListener(eventName: 'onClose', listenerFunc: () => void): Promise<any>;
}

const NativePlayerByJS = registerPlugin<NativePlayerPlugin>('NativePlayer');

export const NativePlayerService = {
  async show(title: string, artist: string, cover: string) {
    try {
      await NativePlayerByJS.showPlayer({ title, artist, cover });
    } catch (e) {
      console.warn('NativePlayer not available', e);
    }
  },

  async update(isPlaying: boolean, currentTime: number, duration: number) {
    try {
      await NativePlayerByJS.updateState({ isPlaying, currentTime, duration });
    } catch (e) {
      // Ignore
    }
  },

  onTogglePlay(callback: () => void) {
    return NativePlayerByJS.addListener('togglePlay', () => callback());
  },

  onClose(callback: () => void) {
    return NativePlayerByJS.addListener('onClose', () => callback());
  }
};
