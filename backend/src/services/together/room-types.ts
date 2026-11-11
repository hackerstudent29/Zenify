export type RoomRole = 'HOST' | 'CO_HOST' | 'MODERATOR' | 'DJ' | 'SPEAKER' | 'MEMBER' | 'LISTENER';

export type InviteMode = 'OPEN' | 'ANYONE' | 'APPROVAL' | 'INVITE_ONLY';

export type SpeakPolicy =
  | 'ALL'
  | 'EVERYONE'
  | 'HOST_AND_MODS'
  | 'HOST_AND_CO_HOSTS'
  | 'HOST_ONLY'
  | 'REQUEST_TO_SPEAK'
  | 'SELECTED';

export type RequestMode = 'ANYONE' | 'APPROVAL' | 'LIMITED' | 'AUTO' | 'HOST_ONLY';

export type RoomState = 'ACTIVE' | 'PAUSED' | 'EMPTY' | 'EXPIRED' | 'CLOSED';

export type RoomMode = 'dj' | 'collab';

export type RoomPermission =
  | 'PLAY_PAUSE'
  | 'SEEK'
  | 'ADD_QUEUE'
  | 'REMOVE_QUEUE'
  | 'REORDER_QUEUE'
  | 'SKIP'
  | 'MANAGE_ROLES'
  | 'KICK_BAN'
  | 'EDIT_CONFIG'
  | 'MODERATE_CHAT'
  | 'SPEAK'
  | 'TRANSFER_HOST'
  | 'CLOSE_ROOM'
  | 'APPROVE_JOIN'
  | 'REVIEW_REQUESTS'
  | 'PIN_ANNOUNCEMENT';

export interface TogetherTrackDTO {
  id: string;
  title: string;
  artist: string;
  album?: string | null;
  coverUrl?: string | null;
  artworkUrl?: string | null;
  durationSeconds?: number;
  duration?: number;
  streamUrl?: string | null;
  audioUrl?: string | null;
  youtubeId?: string | null;
  source?: string | null;
  [key: string]: any;
}

export interface TogetherQueueItemDTO {
  id: string;
  trackId: string;
  track: TogetherTrackDTO;
  addedByUserId: string;
  addedByName: string;
  addedAt: number;
}

export interface TogetherMemberDTO {
  userId: string;
  username: string;
  displayName?: string;
  avatar?: string | null;
  avatarUrl?: string | null;
  role: string;
  canSpeak: boolean;
  isMuted: boolean;
  isHandRaised: boolean;
  isGuest: boolean;
  joinedAt: number;
  lastPing: number;
  isPlaying: boolean;
  bufferReady: boolean;
  offsetMs: number;
  online: boolean;
}

export interface RoomConfigDTO {
  name: string;
  description: string;
  coverUrl: string | null;
  mode: RoomMode;
  isPrivate: boolean;
  hasPassword: boolean;
  maxMembers: number;
  durationMinutes: number;
  expiresAtMs: number | null;
  inviteMode: InviteMode;
  speakPolicy: SpeakPolicy;
  allowListenersAddQueue: boolean;
  allowListenersSkip: boolean;
  state: RoomState;
}

export interface RoomThemeDTO {
  presetId: string;
  accentHex: string | null;
  useArtwork: boolean;
  animateBackground: boolean;
  bgUrl: string | null;
}

export interface DjSettingsDTO {
  requestMode: RequestMode;
  requestMaxPerUser: number;
  queueLocked: boolean;
  playbackRate: number;
  announceText: string | null;
  announceUntilMs: number | null;
}

export interface RoomWsEnvelope<T = Record<string, any>> {
  eventId: string;
  schemaVersion: 1;
  roomId: string;
  type: string;
  seq: number;
  revision: number;
  serverTimestampMs: number;
  actorId: string | null;
  payload: T;
  // Backward-compatible legacy fields also attached at top-level by broadcaster when applicable
  [key: string]: any;
}

export class RoomHttpError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly extra?: Record<string, any>;

  constructor(
    status: number,
    code: string,
    message: string,
    extra?: Record<string, any>
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const ROLE_RANK: Record<RoomRole, number> = {
  LISTENER: 0,
  MEMBER: 1,
  SPEAKER: 1,
  DJ: 2,
  MODERATOR: 2,
  CO_HOST: 3,
  HOST: 4,
};

export function normalizeRole(raw?: string | null): RoomRole {
  const upper = (raw || '').trim().toUpperCase().replace(/-/g, '_');
  if (upper === 'HOST' || upper === 'OWNER') return 'HOST';
  if (upper === 'CO_HOST' || upper === 'COHOST') return 'CO_HOST';
  if (upper === 'DJ') return 'DJ';
  if (upper === 'MODERATOR' || upper === 'MOD') return 'MODERATOR';
  if (upper === 'SPEAKER') return 'SPEAKER';
  if (upper === 'MEMBER') return 'MEMBER';
  return 'LISTENER';
}

export function normalizeInviteMode(raw?: string | null): InviteMode {
  const u = (raw || '').trim().toUpperCase();
  if (u === 'APPROVAL' || u === 'ASK_TO_JOIN') return 'APPROVAL';
  if (u === 'INVITE_ONLY' || u === 'INVITE') return 'INVITE_ONLY';
  if (u === 'OPEN') return 'OPEN';
  return 'ANYONE';
}

export function normalizeSpeakPolicy(raw?: string | null): SpeakPolicy {
  const u = (raw || '').trim().toUpperCase();
  if (u === 'HOST_ONLY') return 'HOST_ONLY';
  if (u === 'HOST_AND_CO_HOSTS') return 'HOST_AND_CO_HOSTS';
  if (u === 'HOST_AND_MODS' || u === 'MODS') return 'HOST_AND_MODS';
  if (u === 'REQUEST_TO_SPEAK' || u === 'REQUEST') return 'REQUEST_TO_SPEAK';
  if (u === 'SELECTED') return 'SELECTED';
  if (u === 'EVERYONE') return 'EVERYONE';
  return 'ALL';
}

export function normalizeRequestMode(raw?: string | null): RequestMode {
  const u = (raw || '').trim().toUpperCase();
  if (u === 'APPROVAL') return 'APPROVAL';
  if (u === 'LIMITED') return 'LIMITED';
  if (u === 'AUTO') return 'AUTO';
  if (u === 'HOST_ONLY') return 'HOST_ONLY';
  return 'ANYONE';
}

export function normalizeRoomMode(raw?: string | null): RoomMode {
  return (raw || '').trim().toLowerCase() === 'dj' ? 'dj' : 'collab';
}

