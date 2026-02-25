import { create } from 'zustand';

import { Track } from './player';

interface UIState {
    isPricingModalOpen: boolean;
    isSidebarCollapsed: boolean;
    isDownloadModalOpen: boolean;
    downloadTrack: Track | null;
    isPlayerMinimized: boolean;
    isFullScreenPlayerOpen: boolean;
    setPlayerMinimized: (minimized: boolean) => void;
    setFullScreenPlayerOpen: (open: boolean) => void;
    setPricingModalOpen: (open: boolean) => void;
    setSidebarCollapsed: (collapsed: boolean) => void;
    openDownloadModal: (track: Track) => void;
    closeDownloadModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
    isPricingModalOpen: false,
    isSidebarCollapsed: true,
    isDownloadModalOpen: false,
    downloadTrack: null,
    isPlayerMinimized: true,
    isFullScreenPlayerOpen: false,
    setPlayerMinimized: (minimized) => set({ isPlayerMinimized: minimized }),
    setFullScreenPlayerOpen: (open) => set({ isFullScreenPlayerOpen: open }),
    setPricingModalOpen: (open) => set({ isPricingModalOpen: open }),
    setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),
    openDownloadModal: (track) => set({ isDownloadModalOpen: true, downloadTrack: track }),
    closeDownloadModal: () => set({ isDownloadModalOpen: false, downloadTrack: null }),
}));
