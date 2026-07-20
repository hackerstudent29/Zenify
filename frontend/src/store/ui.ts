import { create } from 'zustand';
import React from 'react';

import { Track } from './player';

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
 /** Title to show in the TopBar when the page hero has scrolled out of view */
 stickyPageTitle: string | null;
 setStickyPageTitle: (title: string | null) => void;
 pageCoverUrl: string | null;
 setPageCoverUrl: (url: string | null) => void;
 confirmModal: {
 isOpen: boolean;
 title: string;
 message: React.ReactNode;
 onConfirm: () => void;
 confirmText?: string;
 cancelText?: string;
 type?: 'danger' | 'info';
 };
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
 stickyPageTitle: null,
 setStickyPageTitle: (title) => set({ stickyPageTitle: title }),
 pageCoverUrl: null,
 setPageCoverUrl: (url) => set({ pageCoverUrl: url }),
 confirmModal: {
 isOpen: false,
 title: '',
 message: '',
 onConfirm: () => { },
 },
 setPlayerMinimized: (minimized) => set({ isPlayerMinimized: minimized }),
 setFullScreenPlayerOpen: (open) => set({ isFullScreenPlayerOpen: open }),
 setAudioFxOpen: (open) => set({ isAudioFxOpen: open }),
 setIsQueueOpen: (open) => set({ isQueueOpen: open }),
 setIsLyricsOpen: (open) => set({ isLyricsOpen: open }),
 setPricingModalOpen: (open) => set({ isPricingModalOpen: open }),
 setNativePlayerOpen: (open) => set({ isNativePlayerOpen: open }),
 setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),
 openDownloadModal: (track) => set({ isDownloadModalOpen: true, downloadTrack: track }),
 closeDownloadModal: () => set({ isDownloadModalOpen: false, downloadTrack: null }),
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
