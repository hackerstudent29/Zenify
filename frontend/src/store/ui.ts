import { create } from 'zustand';
import React from 'react';

import { Track } from './player';

export interface ToastNotification {
  id: string;
  msg: string;
  type?: 'success' | 'error' | 'info';
}

interface UIState {
  isPricingModalOpen: boolean;
  isSidebarCollapsed: boolean;
  isDownloadModalOpen: boolean;
  downloadTrack: Track | null;
  isPlayerMinimized: boolean;
  isFullScreenPlayerOpen: boolean;
  isAudioFxOpen: boolean;
  isQueueOpen: boolean;
  isLyricsOpen: boolean;
  isNativePlayerOpen: boolean;
  isSettingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  openSettings: () => void;
  closeSettings: () => void;
  toggleSettings: () => void;
  reducedMotion: boolean;
  setReducedMotion: (reduced: boolean) => void;
  toast: ToastNotification | null;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  hideToast: () => void;
  /** Title to show in the TopBar when the page hero has scrolled out of view */
  stickyPageTitle: string | null;
  setStickyPageTitle: (title: string | null) => void;
  pageCoverUrl: string | null;
  setPageCoverUrl: (url: string | null) => void;
  pageCovers: string[] | null;
  setPageCovers: (covers: string[] | null) => void;
  confirmModal: {
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'info';
  };
  showLoginSplash: boolean;
  setShowLoginSplash: (show: boolean) => void;
  setPlayerMinimized: (minimized: boolean) => void;
  setFullScreenPlayerOpen: (open: boolean) => void;
  setAudioFxOpen: (open: boolean) => void;
  setIsQueueOpen: (open: boolean) => void;
  setIsLyricsOpen: (open: boolean) => void;
  setPricingModalOpen: (open: boolean) => void;
  setNativePlayerOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  openDownloadModal: (track: Track) => void;
  closeDownloadModal: () => void;
  addToPlaylistTrack: any | null;
  openAddToPlaylistModal: (track: any) => void;
  closeAddToPlaylistModal: () => void;
  openConfirmModal: (config: {
    title: string;
    message: React.ReactNode;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'info';
  }) => void;
  closeConfirmModal: () => void;
}

const getInitialReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  const saved = localStorage.getItem('zenify_reduced_motion');
  const isReduced = saved !== null ? saved === 'true' : false;
  if (isReduced && typeof document !== 'undefined') {
    document.documentElement.classList.add('reduce-motion');
  }
  return isReduced;
};

export const useUIStore = create<UIState>((set) => ({
  isPricingModalOpen: false,
  isSidebarCollapsed: false,
  isDownloadModalOpen: false,
  downloadTrack: null,
  isPlayerMinimized: false,
  isFullScreenPlayerOpen: false,
  isAudioFxOpen: false,
  isQueueOpen: false,
  isLyricsOpen: false,
  isNativePlayerOpen: false,
  isSettingsOpen: false,
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),
  toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
  reducedMotion: getInitialReducedMotion(),
  setReducedMotion: (reduced: boolean) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('zenify_reduced_motion', String(reduced));
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('reduce-motion', reduced);
      }
    }
    set({ reducedMotion: reduced });
  },
  toast: null,
  showToast: (msg, type = 'success') => {
    const id = Math.random().toString();
    set({ toast: { id, msg, type } });
    setTimeout(() => {
      set((state) => (state.toast?.id === id ? { toast: null } : state));
    }, 3000);
  },
  hideToast: () => set({ toast: null }),
  stickyPageTitle: null,
  setStickyPageTitle: (title) => set({ stickyPageTitle: title }),
  pageCoverUrl: null,
  setPageCoverUrl: (url) => set((state) => state.pageCoverUrl === url ? state : { pageCoverUrl: url }),
  pageCovers: null,
  setPageCovers: (covers) => set((state) => {
    if (!covers && !state.pageCovers) return state;
    if (covers && state.pageCovers && covers.length === state.pageCovers.length && covers.every((c, i) => c === state.pageCovers![i])) {
      return state;
    }
    return { pageCovers: covers };
  }),
  confirmModal: {
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
  },
  showLoginSplash: false,
  setShowLoginSplash: (show) => set({ showLoginSplash: show }),
  setPlayerMinimized: (minimized) => set({ isPlayerMinimized: minimized }),
  setFullScreenPlayerOpen: (open) => set({ isFullScreenPlayerOpen: open }),
  setAudioFxOpen: (open) => set({ isAudioFxOpen: open }),
  setIsQueueOpen: (open) => set((state) => ({ isQueueOpen: open, ...(open ? { isLyricsOpen: false } : {}) })),
  setIsLyricsOpen: (open) => set((state) => ({ isLyricsOpen: open, ...(open ? { isQueueOpen: false } : {}) })),
  setPricingModalOpen: (open) => set({ isPricingModalOpen: open }),
  setNativePlayerOpen: (open) => set({ isNativePlayerOpen: open }),
  setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),
  openDownloadModal: (track) => set({ isDownloadModalOpen: true, downloadTrack: track }),
  closeDownloadModal: () => set({ isDownloadModalOpen: false, downloadTrack: null }),
  addToPlaylistTrack: null,
  openAddToPlaylistModal: (track) => set({ addToPlaylistTrack: track }),
  closeAddToPlaylistModal: () => set({ addToPlaylistTrack: null }),
  openConfirmModal: (config) => set({
    confirmModal: {
      ...config,
      isOpen: true
    }
  }),
  closeConfirmModal: () => set((state) => ({
    confirmModal: {
      ...state.confirmModal,
      isOpen: false
    }
  })),
}));
