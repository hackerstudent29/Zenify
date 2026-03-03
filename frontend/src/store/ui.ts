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
    isQueueOpen: boolean;
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
    setIsQueueOpen: (open: boolean) => void;
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
    isSidebarCollapsed: false,
    isDownloadModalOpen: false,
    downloadTrack: null,
    isPlayerMinimized: false,
    isFullScreenPlayerOpen: false,
    isAudioFxOpen: false,
    isQueueOpen: false,
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
