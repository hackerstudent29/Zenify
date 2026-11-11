import crypto from 'crypto';
import {
  normalizeRole,
  normalizeRoomMode,
  normalizeSpeakPolicy,
  ROLE_RANK,
  RoomHttpError,
  RoomPermission,
  RoomRole,
  SpeakPolicy,
} from './room-types';

export interface PermissionRoomContext {
  hostId: string;
  mode: string;
  speakPolicy: string;
  allowListenersAddQueue: boolean;
  allowListenersSkip: boolean;
  queueLocked?: boolean;
  state?: string;
}

export interface PermissionMemberContext {
  userId: string;
  role: string;
  canSpeak?: boolean;
}

export class RoomPermissionService {
  /**
   * Computes whether `member` holds `permission` inside `room`.
   */
  static can(
    room: PermissionRoomContext,
    member: PermissionMemberContext | null | undefined,
    permission: RoomPermission
  ): boolean {
    if (!member) return false;
    const role: RoomRole =
      member.userId === room.hostId ? 'HOST' : normalizeRole(member.role);

    if (role === 'HOST') return true;

    const mode = normalizeRoomMode(room.mode);
    const isCoHost = role === 'CO_HOST';
    const isMod = role === 'MODERATOR';
    const isDj = role === 'DJ';
    const isSpeaker = role === 'SPEAKER';
    const isMember = role === 'MEMBER';

    switch (permission) {
      case 'TRANSFER_HOST':
      case 'CLOSE_ROOM':
        return false; // Host only

      case 'EDIT_CONFIG':
      case 'MANAGE_ROLES':
        return isCoHost;

      case 'KICK_BAN':
      case 'MODERATE_CHAT':
      case 'APPROVE_JOIN':
      case 'REVIEW_REQUESTS':
      case 'PIN_ANNOUNCEMENT':
        return isCoHost || isMod;

      case 'PLAY_PAUSE':
      case 'SEEK':
      case 'REORDER_QUEUE':
      case 'REMOVE_QUEUE':
        if (isCoHost || isDj) return true;
        if (mode === 'collab') {
          return isMod || isSpeaker || isMember || role === 'LISTENER';
        }
        return false;

      case 'ADD_QUEUE':
        if (room.queueLocked && !isCoHost && !isMod && !isDj) return false;
        if (isCoHost || isMod || isDj) return true;
        return mode === 'collab' || room.allowListenersAddQueue;

      case 'SKIP':
        if (isCoHost || isMod || isDj) return true;
        return mode === 'collab' || room.allowListenersSkip;

      case 'SPEAK':
        return this.canSpeak(room, member);

      default:
        return false;
    }
  }

  /**
   * Determines voice publish capability (`canPublish`) from SpeakPolicy, Role, and explicit override.
   */
  static canSpeak(
    room: PermissionRoomContext,
    member: PermissionMemberContext | null | undefined
  ): boolean {
    if (!member) return false;
    const role = member.userId === room.hostId ? 'HOST' : normalizeRole(member.role);
    if (role === 'HOST') return true;

    const policy: SpeakPolicy = normalizeSpeakPolicy(room.speakPolicy);
    switch (policy) {
      case 'ALL':
      case 'EVERYONE':
        return true;
      case 'HOST_ONLY':
        return false;
      case 'HOST_AND_MODS':
        return role === 'CO_HOST' || role === 'MODERATOR';
      case 'HOST_AND_CO_HOSTS':
        return role === 'CO_HOST';
      case 'REQUEST_TO_SPEAK':
        return role === 'CO_HOST' || role === 'MODERATOR' || role === 'SPEAKER' || !!member.canSpeak;
      case 'SELECTED':
        return role === 'CO_HOST' || role === 'SPEAKER' || !!member.canSpeak;
      default:
        return false;
    }
  }

  /**
   * Strict rank guard: nobody may change roles/kick/block someone with equal or higher rank.
   */
  static canActOnTarget(
    room: PermissionRoomContext,
    actor: PermissionMemberContext,
    target: PermissionMemberContext
  ): boolean {
    if (actor.userId === target.userId) return false;
    const actorRole = actor.userId === room.hostId ? 'HOST' : normalizeRole(actor.role);
    const targetRole = target.userId === room.hostId ? 'HOST' : normalizeRole(target.role);
    if (targetRole === 'HOST') return false;
    return ROLE_RANK[actorRole] > ROLE_RANK[targetRole];
  }

  static requirePermission(
    room: PermissionRoomContext,
    member: PermissionMemberContext | null | undefined,
    permission: RoomPermission
  ): void {
    if (!this.can(room, member, permission)) {
      throw new RoomHttpError(
        403,
        'FORBIDDEN',
        `Missing permission: ${permission}`
      );
    }
  }

  /**
   * Sanitizes user-supplied text (names, descriptions, chat, notes, announcements) against control chars/HTML/script tags.
   */
  static sanitizeText(input: string, maxLength: number): string {
    if (typeof input !== 'string') return '';
    return input
      .replace(/<[^>]*>/g, '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .trim()
      .slice(0, maxLength);
  }

  static validateSafeUrl(input?: string | null): string | null {
    if (!input) return null;
    const trimmed = input.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('/')) return trimmed;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return trimmed;
      }
    } catch {
      return null;
    }
    return null;
  }

  static validateHexColor(input?: string | null): string | null {
    if (!input) return null;
    const trimmed = input.trim();
    return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toUpperCase() : null;
  }

  /**
   * Scrypt password hashing + constant-time verification (no native dependency edge cases).
   */
  static async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key)));
    });
    return `scrypt$${salt}$${derived.toString('hex')}`;
  }

  static async verifyPassword(password: string, storedHash?: string | null): Promise<boolean> {
    if (!storedHash || !password) return false;
    const parts = storedHash.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const [, salt, expectedHex] = parts;
    const expected = Buffer.from(expectedHex, 'hex');
    const derived = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(password, salt, expected.length, (err, key) => (err ? reject(err) : resolve(key)));
    });
    return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
  }
}

