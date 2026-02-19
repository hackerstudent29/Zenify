import { create } from 'zustand';

interface UIState {
    isPricingModalOpen: boolean;
    setPricingModalOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
    isPricingModalOpen: false,
    setPricingModalOpen: (open) => set({ isPricingModalOpen: open }),
}));
