import { create } from 'zustand';

export interface TogetherMember {
  userId: string;
  username: string;
  avatar?: string;
  role: 'host' | 'listener';
  joinedAt: number;
  lastPing: number;
  isPlaying?: boolean;
  bufferReady?: boolean;
  offsetMs?: number;
}

export interface TogetherQueueItem {
  id: string;
  trackId: string;
  track: any;
  addedByUserId: string;
  addedByName: string;
  addedAt: number;
}

export interface TogetherPlayerState {
  trackId: string | null;
  track: any | null;
  state: 'idle' | 'playing' | 'paused' | 'buffering';
  positionSec: number;
  startedAtServerMs: number;
}

export interface TogetherChatMessage {
  id: string;
  userId: string;
  username: string;
  avatar?: string;
  text: string;
  timestamp: number;
}

export interface TogetherRoomSettings {
  requiresApproval: boolean;
  guestCanQueue: boolean;
  guestCanChat: boolean;
}

export interface TogetherRoomState {
  roomCode: string;
  hostId: string;
  mode: 'dj' | 'collab';
  settings: TogetherRoomSettings;
  members: TogetherMember[];
  queue: TogetherQueueItem[];
  player: TogetherPlayerState;
  chat: TogetherChatMessage[];
  createdAt: number;
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  username: string;
  xPercent: number;
  timestamp: number;
}

interface TogetherStore {
  isConnected: boolean;
  room: TogetherRoomState | null;
  selfRole: 'host' | 'listener' | null;
  clockOffsetMs: number;
  driftMs: number;
  latencyMs: number;
  reactions: FloatingReaction[];
  needsTapToPlay: boolean;
  isSyncing: boolean;

  setConnected: (connected: boolean) => void;
  setRoom: (room: TogetherRoomState | null) => void;
  updateRoom: (partial: Partial<TogetherRoomState>) => void;
  setSelfRole: (role: 'host' | 'listener' | null) => void;
  setClockOffset: (offset: number) => void;
  setDrift: (drift: number) => void;
  setLatency: (latency: number) => void;
  addReaction: (emoji: string, username: string) => void;
  removeReaction: (id: string) => void;
  addChatMessage: (msg: TogetherChatMessage) => void;
  setNeedsTapToPlay: (needs: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  leaveRoom: () => void;
}

export const useTogetherStore = create<TogetherStore>((set) => ({
  isConnected: false,
  room: null,
  selfRole: null,
  clockOffsetMs: 0,
  driftMs: 0,
  latencyMs: 0,
  reactions: [],
  needsTapToPlay: false,
  isSyncing: false,

  setConnected: (connected) => set({ isConnected: connected }),
  setRoom: (room) => set({ room }),
  updateRoom: (partial) =>
    set((state) => ({
      room: state.room ? { ...state.room, ...partial } : null,
    })),
  setSelfRole: (role) => set({ selfRole: role }),
  setClockOffset: (offset) => set({ clockOffsetMs: offset }),
  setDrift: (drift) => set({ driftMs: drift }),
  setLatency: (latency) => set({ latencyMs: latency }),
  addReaction: (emoji, username) =>
    set((state) => {
      const id = `${Date.now()}-${Math.random()}`;
      const xPercent = 20 + Math.random() * 60; // 20% to 80% horizontal spread
      const newReaction: FloatingReaction = { id, emoji, username, xPercent, timestamp: Date.now() };
      return { reactions: [...state.reactions.slice(-15), newReaction] };
    }),
  removeReaction: (id) =>
    set((state) => ({
      reactions: state.reactions.filter((r) => r.id !== id),
    })),
  addChatMessage: (msg) =>
    set((state) => {
      if (!state.room) return state;
      const nextChat = [...state.room.chat, msg].slice(-50);
      return { room: { ...state.room, chat: nextChat } };
    }),
  setNeedsTapToPlay: (needs) => set({ needsTapToPlay: needs }),
  setSyncing: (syncing) => set({ isSyncing: syncing }),
  leaveRoom: () =>
    set({
      isConnected: false,
      room: null,
      selfRole: null,
      clockOffsetMs: 0,
      driftMs: 0,
      latencyMs: 0,
      reactions: [],
      needsTapToPlay: false,
      isSyncing: false,
    }),
}));

