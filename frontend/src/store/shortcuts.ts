import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ShortcutMapping {
    action: string;
    key: string;
    label: string;
    category: 'Playback' | 'Seeking' | 'Volume' | 'Interface';
}

export const DEFAULT_SHORTCUTS: ShortcutMapping[] = [
    // Playback
    { action: 'play_pause', key: 'Space', label: 'Play / Pause', category: 'Playback' },
    { action: 'next_track', key: 'KeyN', label: 'Next Track', category: 'Playback' },
    { action: 'prev_track', key: 'KeyP', label: 'Previous Track', category: 'Playback' },
    { action: 'toggle_shuffle', key: 'KeyS', label: 'Toggle Shuffle', category: 'Playback' },
    { action: 'toggle_repeat', key: 'KeyR', label: 'Toggle Repeat', category: 'Playback' },

    // Seeking
    { action: 'seek_forward_5', key: 'ArrowRight', label: 'Seek Forward 5s', category: 'Seeking' },
    { action: 'seek_backward_5', key: 'ArrowLeft', label: 'Seek Backward 5s', category: 'Seeking' },
    { action: 'seek_forward_10', key: 'Shift+ArrowRight', label: 'Seek Forward 10s', category: 'Seeking' },
    { action: 'seek_backward_10', key: 'Shift+ArrowLeft', label: 'Seek Backward 10s', category: 'Seeking' },

    // Volume
    { action: 'volume_up', key: 'Alt+ArrowUp', label: 'Volume Up', category: 'Volume' },
    { action: 'volume_down', key: 'Alt+ArrowDown', label: 'Volume Down', category: 'Volume' },
    { action: 'mute_toggle', key: 'KeyM', label: 'Mute Toggle', category: 'Volume' },

    // Interface
    { action: 'open_queue', key: 'KeyD', label: 'Open Queue', category: 'Interface' },
    { action: 'toggle_mini_player', key: 'KeyC', label: 'Toggle Mini Player', category: 'Interface' },
    { action: 'fullscreen_player', key: 'KeyF', label: 'Fullscreen Player', category: 'Interface' },
    { action: 'focus_search', key: 'Slash', label: 'Focus Search', category: 'Interface' },
    { action: 'toggle_audio_fx', key: 'KeyX', label: 'Toggle Studio FX', category: 'Interface' },
    { action: 'show_help', key: 'Shift+Slash', label: 'Show Shortcut Help', category: 'Interface' }, // ? is Shift+/
];

interface ShortcutState {
    shortcuts: ShortcutMapping[];
    setShortcut: (action: string, key: string) => void;
    resetShortcut: (action: string) => void;
    resetAll: () => void;
}

export const useShortcutStore = create<ShortcutState>()(
    persist(
        (set) => ({
            shortcuts: DEFAULT_SHORTCUTS,
            setShortcut: (action, key) => set((state) => ({
                shortcuts: state.shortcuts.map(s => s.action === action ? { ...s, key } : s)
            })),
            resetShortcut: (action) => set((state) => ({
                shortcuts: state.shortcuts.map(s => s.action === action
                    ? { ...s, key: DEFAULT_SHORTCUTS.find(d => d.action === action)?.key || '' }
                    : s)
            })),
            resetAll: () => set({ shortcuts: DEFAULT_SHORTCUTS }),
        }),
        {
            name: 'zenify-shortcuts',
        }
    )
);
