import { create } from 'zustand';

import { Track } from './player';

interface UIState {
    isPricingModalOpen: boolean;
    isSidebarCollapsed: boolean;
    isDownloadModalOpen: boolean;
    downloadTrack: Track | null;
    isPlayerMinimized: boolean;
    isFullScreenPlayerOpen: boolean;
    isAudioFxOpen: boolean;
    confirmModal: {
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        confirmText?: string;
        cancelText?: string;
        type?: 'danger' | 'info';
    };
    setPlayerMinimized: (minimized: boolean) => void;
    setFullScreenPlayerOpen: (open: boolean) => void;
    setAudioFxOpen: (open: boolean) => void;
    setPricingModalOpen: (open: boolean) => void;
    setSidebarCollapsed: (collapsed: boolean) => void;
    openDownloadModal: (track: Track) => void;
    closeDownloadModal: () => void;
    openConfirmModal: (config: {
        title: string;
        message: string;
        onConfirm: () => void;
        confirmText?: string;
        cancelText?: string;
        type?: 'danger' | 'info';
    }) => void;
    closeConfirmModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
    isPricingModalOpen: false,
    isSidebarCollapsed: true,
    isDownloadModalOpen: false,
    downloadTrack: null,
    isPlayerMinimized: true,
    isFullScreenPlayerOpen: false,
    isAudioFxOpen: false,
    confirmModal: {
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { },
    },
    setPlayerMinimized: (minimized) => set({ isPlayerMinimized: minimized }),
    setFullScreenPlayerOpen: (open) => set({ isFullScreenPlayerOpen: open }),
    setAudioFxOpen: (open) => set({ isAudioFxOpen: open }),
    setPricingModalOpen: (open) => set({ isPricingModalOpen: open }),
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
