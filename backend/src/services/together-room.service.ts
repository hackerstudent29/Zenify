import crypto from 'crypto';
import { getCacheVal, setCacheVal } from '../utils/cache';

const CROCKFORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface TogetherMember {
  userId: string;
  username: string;
  avatar?: string;
  role: 'host' | 'listener';
  joinedAt: number;
  lastPing: number;
  isPlaying: boolean;
  bufferReady: boolean;
  offsetMs: number;
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

export interface TogetherTicket {
  ticket: string;
  userId: string;
  username: string;
  avatar?: string;
  role: 'host' | 'listener';
  roomCode: string;
  expiresAt: number;
}

// In-memory fallback / mirror for low latency WebSocket operations
const activeRooms = new Map<string, TogetherRoomState>();
const activeTickets = new Map<string, TogetherTicket>();

function generateCrockfordCode(length = 6): string {
  let result = '';
  const alphabetLen = CROCKFORD_ALPHABET.length;
  // Use rejection sampling to eliminate modulo bias
  const limit = Math.floor(256 / alphabetLen) * alphabetLen;
  while (result.length < length) {
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < bytes.length && result.length < length; i++) {
      if (bytes[i] < limit) {
        result += CROCKFORD_ALPHABET[bytes[i] % alphabetLen];
      }
    }
  }
  return result;
}

export class TogetherRoomService {
  /**
   * Generates a 6-character Crockford code that is currently unique
   */
  static async generateUniqueCode(): Promise<string> {
    for (let attempts = 0; attempts < 10; attempts++) {
      const code = generateCrockfordCode(6);
      const existing = await this.getRoom(code);
      if (!existing) return code;
    }
    return generateCrockfordCode(7);
  }

  /**
   * Creates a single-use ticket for WebSocket authentication (valid for 60s)
   */
  static async mintTicket(
    roomCode: string,
    user: { id: string; name?: string; image?: string },
    role: 'host' | 'listener'
  ): Promise<string> {
    const ticketId = crypto.randomUUID();
    const ticketData: TogetherTicket = {
      ticket: ticketId,
      userId: user.id,
      username: user.name || 'Listener',
      avatar: user.image,
      role,
      roomCode,
      expiresAt: Date.now() + 60_000,
    };

    activeTickets.set(ticketId, ticketData);
    await setCacheVal(`together:ticket:${ticketId}`, ticketData, 60);
    return ticketId;
  }

  /**
   * Consumes a single-use ticket
   */
  static async verifyAndConsumeTicket(ticketId: string): Promise<TogetherTicket | null> {
    // Check in-memory first
    let ticket = activeTickets.get(ticketId);
    if (!ticket) {
      ticket = await getCacheVal(`together:ticket:${ticketId}`);
    }

    if (!ticket) return null;

    // Delete single-use ticket from memory and cache
    activeTickets.delete(ticketId);
    await setCacheVal(`together:ticket:${ticketId}`, null, 1);

    if (Date.now() > ticket.expiresAt) {
      return null;
    }

    return ticket;
  }

  /**
   * Create a new Listen Together room
   */
  static async createRoom(
    user: { id: string; name?: string; image?: string },
    options: {
      mode?: 'dj' | 'collab';
      requiresApproval?: boolean;
      guestCanQueue?: boolean;
      guestCanChat?: boolean;
    } = {}
  ): Promise<{ room: TogetherRoomState; ticket: string }> {
    const roomCode = await this.generateUniqueCode();

    const roomState: TogetherRoomState = {
      roomCode,
      hostId: user.id,
      mode: options.mode || 'dj',
      settings: {
        requiresApproval: options.requiresApproval ?? false,
        guestCanQueue: options.guestCanQueue ?? true,
        guestCanChat: options.guestCanChat ?? true,
      },
      members: [
        {
          userId: user.id,
          username: user.name || 'Host',
          avatar: user.image,
          role: 'host',
          joinedAt: Date.now(),
          lastPing: Date.now(),
          isPlaying: false,
          bufferReady: false,
          offsetMs: 0,
        },
      ],
      queue: [],
      player: {
        trackId: null,
        track: null,
        state: 'idle',
        positionSec: 0,
        startedAtServerMs: 0,
      },
      chat: [],
      createdAt: Date.now(),
    };

    activeRooms.set(roomCode, roomState);
    await setCacheVal(`together:room:${roomCode}`, roomState, 43200); // 12 hours TTL

    const ticket = await this.mintTicket(roomCode, user, 'host');
    return { room: roomState, ticket };
  }

  /**
   * Get room state by room code
   */
  static async getRoom(code: string): Promise<TogetherRoomState | null> {
    const normalized = code.trim().toUpperCase();
    let room = activeRooms.get(normalized);
    if (!room) {
      room = await getCacheVal(`together:room:${normalized}`);
      if (room) {
        activeRooms.set(normalized, room);
      }
    }
    return room || null;
  }

  /**
   * Persist room state
   */
  static async saveRoom(room: TogetherRoomState): Promise<void> {
    activeRooms.set(room.roomCode, room);
    await setCacheVal(`together:room:${room.roomCode}`, room, 43200);
  }

  /**
   * Join an existing room
   */
  static async joinRoom(
    code: string,
    user: { id: string; name?: string; image?: string }
  ): Promise<{ room: TogetherRoomState; ticket: string }> {
    const room = await this.getRoom(code);
    if (!room) {
      throw new Error('Room not found or session has expired');
    }

    const isHost = room.hostId === user.id;
    const role: 'host' | 'listener' = isHost ? 'host' : 'listener';

    // Check if member already in list
    const existingIdx = room.members.findIndex((m) => m.userId === user.id);
    if (existingIdx >= 0) {
      room.members[existingIdx].lastPing = Date.now();
      room.members[existingIdx].username = user.name || room.members[existingIdx].username;
      room.members[existingIdx].avatar = user.image || room.members[existingIdx].avatar;
    } else {
      room.members.push({
        userId: user.id,
        username: user.name || `Listener-${room.members.length + 1}`,
        avatar: user.image,
        role,
        joinedAt: Date.now(),
        lastPing: Date.now(),
        isPlaying: false,
        bufferReady: false,
        offsetMs: 0,
      });
    }

    await this.saveRoom(room);
    const ticket = await this.mintTicket(room.roomCode, user, role);
    return { room, ticket };
  }

  /**
   * Remove member from room
   */
  static async removeMember(code: string, userId: string): Promise<TogetherRoomState | null> {
    const room = await this.getRoom(code);
    if (!room) return null;

    room.members = room.members.filter((m) => m.userId !== userId);

    // If host left and there are other members, promote the earliest joined listener
    if (room.hostId === userId && room.members.length > 0) {
      room.hostId = room.members[0].userId;
      room.members[0].role = 'host';
    }

    await this.saveRoom(room);
    return room;
  }

  /**
   * Update room settings (host only)
   */
  static async updateSettings(
    code: string,
    userId: string,
    settings: Partial<TogetherRoomSettings> & { mode?: 'dj' | 'collab' }
  ): Promise<TogetherRoomState> {
    const room = await this.getRoom(code);
    if (!room) throw new Error('Room not found');
    if (room.hostId !== userId) throw new Error('Only the session host can update settings');

    if (settings.mode) room.mode = settings.mode;
    if (settings.requiresApproval !== undefined) room.settings.requiresApproval = settings.requiresApproval;
    if (settings.guestCanQueue !== undefined) room.settings.guestCanQueue = settings.guestCanQueue;
    if (settings.guestCanChat !== undefined) room.settings.guestCanChat = settings.guestCanChat;

    await this.saveRoom(room);
    return room;
  }

  /**
   * Transfer host role
   */
  static async transferHost(code: string, currentHostId: string, newHostId: string): Promise<TogetherRoomState> {
    const room = await this.getRoom(code);
    if (!room) throw new Error('Room not found');
    if (room.hostId !== currentHostId) throw new Error('Only the host can transfer control');

    const target = room.members.find((m) => m.userId === newHostId);
    if (!target) throw new Error('Target user is not in the room');

    room.hostId = newHostId;
    target.role = 'host';
    const oldHost = room.members.find((m) => m.userId === currentHostId);
    if (oldHost) oldHost.role = 'listener';

    await this.saveRoom(room);
    return room;
  }

  /**
   * Add a track to room queue
   */
  static async addQueueItem(
    code: string,
    track: any,
    addedByUser: { id: string; name: string }
  ): Promise<{ room: TogetherRoomState; item: TogetherQueueItem }> {
    const room = await this.getRoom(code);
    if (!room) throw new Error('Room not found');

    const item: TogetherQueueItem = {
      id: crypto.randomUUID(),
      trackId: track.id,
      track,
      addedByUserId: addedByUser.id,
      addedByName: addedByUser.name,
      addedAt: Date.now(),
    };

    room.queue.push(item);
    await this.saveRoom(room);
    return { room, item };
  }

  /**
   * Remove a track from room queue
   */
  static async removeQueueItem(code: string, itemId: string): Promise<TogetherRoomState> {
    const room = await this.getRoom(code);
    if (!room) throw new Error('Room not found');

    room.queue = room.queue.filter((q) => q.id !== itemId);
    await this.saveRoom(room);
    return room;
  }

  /**
   * Reorder room queue
   */
  static async reorderQueue(code: string, startIndex: number, endIndex: number): Promise<TogetherRoomState> {
    const room = await this.getRoom(code);
    if (!room) throw new Error('Room not found');

    const [moved] = room.queue.splice(startIndex, 1);
    if (moved) {
      room.queue.splice(endIndex, 0, moved);
    }

    await this.saveRoom(room);
    return room;
  }

  /**
   * Add chat message (retains last 50)
   */
  static async addChatMessage(
    code: string,
    message: { userId: string; username: string; avatar?: string; text: string }
  ): Promise<{ room: TogetherRoomState; chatItem: TogetherChatMessage }> {
    const room = await this.getRoom(code);
    if (!room) throw new Error('Room not found');

    const chatItem: TogetherChatMessage = {
      id: crypto.randomUUID(),
      userId: message.userId,
      username: message.username,
      avatar: message.avatar,
      text: message.text.slice(0, 300), // sanitize length
      timestamp: Date.now(),
    };

    room.chat.push(chatItem);
    if (room.chat.length > 50) {
      room.chat = room.chat.slice(-50);
    }

    await this.saveRoom(room);
    return { room, chatItem };
  }

  /**
   * Close a room completely
   */
  static async closeRoom(code: string, hostId: string): Promise<boolean> {
    const room = await this.getRoom(code);
    if (!room) return true;
    if (room.hostId !== hostId) throw new Error('Only the host can close the session');

    activeRooms.delete(code);
    await setCacheVal(`together:room:${code}`, null, 1);
    return true;
  }
}

