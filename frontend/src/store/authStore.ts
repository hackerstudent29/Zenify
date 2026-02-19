import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
    id: string;
    email: string;
    name?: string;
    avatarUrl?: string;
    role: string;
    createdAt?: string; // Add createdAt
    preferences?: {
        audioQuality?: string;
        crossfade?: boolean;
        autoplay?: boolean;
        normalizeVolume?: boolean;
        explicitFilter?: boolean;
        theme?: string;
        accentColor?: string;
        compactMode?: boolean;
        emailNotifications?: boolean;
        newReleaseAlerts?: boolean;
        playlistUpdates?: boolean;
        privateSession?: boolean;
        listeningActivity?: boolean;
    };
}

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    accessToken: string | null;
    login: (user: User, accessToken: string) => void; // Update setAuth to login to match usage
    logout: () => void;
    updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            isAuthenticated: false,
            accessToken: null,
            login: (user, accessToken) => set({ user, isAuthenticated: true, accessToken }),
            logout: () => set({ user: null, isAuthenticated: false, accessToken: null }),
            updateUser: (userData) => set((state) => ({
                user: state.user ? { ...state.user, ...userData } : null
            })),
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated, accessToken: state.accessToken }),
        }
    )
);
