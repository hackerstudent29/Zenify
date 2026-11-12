import crypto from 'crypto';
import { prisma } from '../../utils/prisma';
import { uploadToR2 } from '../../utils/s3';
import { RoomAnalyticsService } from './room-analytics.service';
import { roomEventService } from './room-event.service';
import { RoomPermissionService } from './room-permission.service';
import { roomStore } from './room-store';
import {
  normalizeInviteMode,
  normalizeRequestMode,
  normalizeRole,
  normalizeRoomMode,
  RoomHttpError,
  RoomState,
  TogetherQueueItemDTO,
  TogetherTrackDTO,
} from './room-types';

const CROCKFORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCrockfordCode(length = 6): string {
  let result = '';
  const alphabetLen = CROCKFORD_ALPHABET.length;
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

export function sanitizeTrackDTO(raw: any): TogetherTrackDTO {
  if (!raw || typeof raw !== 'object') {
    throw new RoomHttpError(400, 'INVALID_TRACK', 'Track payload is required.');
  }
  const id = String(raw.id || raw.trackId || '').trim();
  const title = RoomPermissionService.sanitizeText(String(raw.title || 'Unknown Track'), 200);
  const artist = RoomPermissionService.sanitizeText(String(raw.artist || 'Unknown Artist'), 200);
  if (!id || !title) {
    throw new RoomHttpError(400, 'INVALID_TRACK', 'Track id and title are required.');
  }

  const stripPreview = (u?: string | null) => {
    if (!u) return null;
    const low = u.toLowerCase();
    if (low.includes('mzstatic') || low.includes('audio-ssl') || low.includes('apple.com/preview')) {
      return null;
    }
    return u;
  };

  const durationSeconds = Math.max(
    0,
    Math.min(7200, Number(raw.durationSeconds ?? raw.duration ?? 0) || 0)
  );

  return {
    ...raw,
    id,
    title,
    artist,
    album: raw.album ? RoomPermissionService.sanitizeText(String(raw.album), 200) : null,
    coverUrl: RoomPermissionService.validateSafeUrl(raw.coverUrl || raw.artworkUrl),
    durationSeconds,
    streamUrl: stripPreview(raw.streamUrl),
    audioUrl: stripPreview(raw.audioUrl),
    previewUrl: undefined,
    preview_url: undefined,
  };
}

export interface ActorIdentity {
  userId: string;
  username: string;
  avatarUrl?: string | null;
  isGuest: boolean;
  ip?: string;
}

export interface CreateRoomInput {
  mode?: string;
  name?: string;
  description?: string;
  coverUrl?: string | null;
  isPrivate?: boolean;
  visibility?: string;
  password?: string | null;
  maxMembers?: number;
  maxParticipants?: number;
  durationMinutes?: number | null;
  inviteMode?: string;
  allowListenersAddQueue?: boolean;
  allowListenersSkip?: boolean;
  enabledRoles?: string[];
  permissions?: Record<string, string>;
}

export interface JoinRoomInput {
  code: string;
  password?: string | null;
  inviteToken?: string | null;
}

export class RoomSessionService {
  static async generateUniqueCode(): Promise<string> {
    for (let i = 0; i < 12; i++) {
      const code = generateCrockfordCode(6);
      const existing = await prisma.togetherRoom.findUnique({
        where: { code },
        select: { code: true },
      });
      if (!existing) return code;
    }
    return generateCrockfordCode(7);
  }

  static computeLivePositionMs(room: {
    playbackState: string;
    playbackPositionMs: bigint;
    startedAtServerMs: bigint | null;
    playbackRate?: number;
  }): number {
    const baseMs = Number(room.playbackPositionMs || 0);
    if (room.playbackState === 'playing' && room.startedAtServerMs != null) {
      const rate = room.playbackRate && room.playbackRate > 0 ? room.playbackRate : 1.0;
      const elapsed = Math.max(0, Date.now() - Number(room.startedAtServerMs));
      return Math.max(0, Math.round(baseMs + elapsed * rate));
    }
    return Math.max(0, baseMs);
  }

  static async createRoom(actor: ActorIdentity, input: CreateRoomInput) {
    const code = await this.generateUniqueCode();
    const mode = normalizeRoomMode(input.mode);
    const name = RoomPermissionService.sanitizeText(input.name || 'Listening Room', 100) || 'Listening Room';
    const description = RoomPermissionService.sanitizeText(input.description || '', 500);
    const coverUrl = RoomPermissionService.validateSafeUrl(input.coverUrl);
    const maxMembers = Math.max(
      2,
      Math.min(100, Number(input.maxMembers ?? input.maxParticipants ?? 25) || 25)
    );
    const durationMinutes =
      input.durationMinutes === 0 || input.durationMinutes === null
        ? 0
        : Math.max(15, Math.min(1440, Number(input.durationMinutes ?? 240) || 240));
    const expiresAt =
      durationMinutes > 0 ? new Date(Date.now() + durationMinutes * 60_000) : null;
    const isPrivate =
      input.isPrivate !== undefined
        ? Boolean(input.isPrivate)
        : input.visibility
          ? input.visibility.toUpperCase() !== 'PUBLIC'
          : false;
    const passwordRaw = input.password?.trim() || null;
    if (passwordRaw && passwordRaw.length < 4) {
      throw new RoomHttpError(400, 'INVALID_PASSWORD', 'Room password must be at least 4 characters.');
    }
    const passwordHash = passwordRaw ? await RoomPermissionService.hashPassword(passwordRaw) : null;
    const inviteMode = normalizeInviteMode(input.inviteMode);
    const qEditRole = String(input.permissions?.QUEUE_EDIT || '').toUpperCase();
    const playbackRole = String(input.permissions?.PLAYBACK || '').toUpperCase();
    const allowListenersAddQueue =
      input.allowListenersAddQueue !== undefined
        ? Boolean(input.allowListenersAddQueue)
        : qEditRole
          ? qEditRole === 'MEMBER' || qEditRole === 'LISTENER'
          : mode === 'collab';
    const allowListenersSkip =
      input.allowListenersSkip !== undefined
        ? Boolean(input.allowListenersSkip)
        : playbackRole
          ? playbackRole === 'MEMBER' || playbackRole === 'LISTENER'
          : false;

    if (input.enabledRoles || input.permissions) {
      await roomStore.setJson(
        `room_acl:${code}`,
        {
          enabledRoles: input.enabledRoles,
          permissions: input.permissions,
        },
        86400 * 7
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.togetherRoom.create({
        data: {
          code,
          hostId: actor.userId,
          name,
          description,
          coverUrl,
          mode,
          isPrivate,
          passwordHash,
          maxMembers,
          durationMinutes,
          expiresAt,
          inviteMode,
          allowListenersAddQueue,
          allowListenersSkip,
          state: 'ACTIVE',
          queue: [],
          queueRevision: 1,
          playbackState: 'paused',
          playbackPositionMs: BigInt(0),
          seq: BigInt(1),
        },
      });

      await tx.togetherRoomMember.create({
        data: {
          roomCode: code,
          userId: actor.userId,
          displayName: RoomPermissionService.sanitizeText(actor.username || 'Host', 64) || 'Host',
          avatarUrl: RoomPermissionService.validateSafeUrl(actor.avatarUrl),
          isGuest: actor.isGuest,
          role: 'HOST',
          canSpeak: false,
        },
      });

      await tx.togetherRoomAudit.create({
        data: {
          roomCode: code,
          actorId: actor.userId,
          action: 'ROOM_CREATED',
          metadata: { actorName: actor.username, mode, name },
        },
      });
    });

    roomStore.updatePresence(code, actor.userId, { lastSeenMs: Date.now(), isPlaying: true, bufferReady: true });
    await RoomAnalyticsService.ensureSessionStarted(code, actor.userId, actor.isGuest).catch(() => undefined);

    const snapshot = await this.getRoomSnapshot(code, actor.userId);
    const ticket = this.mintTicket(code, actor, 'HOST');

    return {
      status: 'JOINED',
      roomCode: code,
      ticket,
      userId: actor.userId,
      role: 'HOST',
      room: snapshot,
      snapshot,
    };
  }

  static async joinRoom(actor: ActorIdentity, input: JoinRoomInput) {
    const code = input.code.trim().toUpperCase();

    return roomStore.withRoomLock(code, async () => {
      const room = await prisma.togetherRoom.findUnique({ where: { code } });
      if (!room) {
        throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'No room found with this code.');
      }
      if (room.state === 'CLOSED' || room.state === 'EXPIRED') {
        throw new RoomHttpError(410, 'ROOM_CLOSED', 'This listening room has ended.');
      }

      // 1. Block check
      const blocked = await prisma.togetherRoomBlock.findUnique({
        where: { roomCode_userId: { roomCode: code, userId: actor.userId } },
      });
      if (blocked) {
        throw new RoomHttpError(403, 'USER_BLOCKED', 'You have been removed from this room.');
      }

      const existingMember = await prisma.togetherRoomMember.findUnique({
        where: { roomCode_userId: { roomCode: code, userId: actor.userId } },
      });
      const alreadyActive = existingMember && existingMember.leftAt === null;

      // 2. Invite token check
      let validInviteId: string | null = null;
      if (input.inviteToken) {
        const tokenHash = crypto
          .createHash('sha256')
          .update(input.inviteToken.trim())
          .digest('hex');
        const invite = await prisma.togetherInvite.findUnique({ where: { tokenHash } });
        if (
          !invite ||
          invite.roomCode !== code ||
          invite.revokedAt != null ||
          (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) ||
          (invite.maxUses != null && invite.usesCount >= invite.maxUses)
        ) {
          throw new RoomHttpError(403, 'INVITE_INVALID', 'Invite link is invalid or has expired.');
        }
        validInviteId = invite.id;
      }

      // 3. Access gate (InviteOnly / Password / Approval) for new joins
      if (!alreadyActive && actor.userId !== room.hostId) {
        const inviteMode = normalizeInviteMode(room.inviteMode);
        if (inviteMode === 'INVITE_ONLY' && !validInviteId) {
          throw new RoomHttpError(403, 'INVITE_REQUIRED', 'This room is invite-only.');
        }

        if (room.passwordHash && !validInviteId) {
          const failKey = `pwd_fail:${actor.ip || actor.userId}:${code}`;
          const currentFails = await roomStore.getJson<{ count: number }>(failKey);
          if (currentFails && currentFails.count >= 5) {
            throw new RoomHttpError(
              429,
              'TOO_MANY_ATTEMPTS',
              'Too many incorrect password attempts. Try again later.'
            );
          }
          if (!input.password) {
            throw new RoomHttpError(403, 'PASSWORD_REQUIRED', 'Enter the room password to join.');
          }
          const ok = await RoomPermissionService.verifyPassword(input.password, room.passwordHash);
          if (!ok) {
            const count = await roomStore.incrementWithTtl(failKey, 900);
            await roomStore.setJson(failKey, { count }, 900);
            throw new RoomHttpError(403, 'WRONG_PASSWORD', 'Incorrect room password.');
          }
          await roomStore.del(failKey);
        }

        if (inviteMode === 'APPROVAL' && !validInviteId && !existingMember) {
          const reqRow = await prisma.$transaction(async (tx) => {
            const pending = await tx.togetherJoinRequest.findFirst({
              where: { roomCode: code, userId: actor.userId, status: 'PENDING' },
            });
            if (pending) return pending;
            return tx.togetherJoinRequest.create({
              data: {
                roomCode: code,
                userId: actor.userId,
                displayName:
                  RoomPermissionService.sanitizeText(actor.username || 'Listener', 64) || 'Listener',
                avatarUrl: RoomPermissionService.validateSafeUrl(actor.avatarUrl),
                status: 'PENDING',
                expiresAt: new Date(Date.now() + 10 * 60_000),
              },
            });
          });

          await roomEventService.emit({
            roomCode: code,
            type: 'JOIN_REQUEST_CREATED',
            actorId: actor.userId,
            payload: {
              request: {
                id: reqRow.id,
                roomCode: code,
                userId: actor.userId,
                displayName: reqRow.displayName,
                avatarUrl: reqRow.avatarUrl,
                status: 'PENDING',
                createdAtMs: reqRow.createdAt.getTime(),
              },
            },
          });

          return {
            status: 'WAITING_APPROVAL',
            requestId: reqRow.id,
            roomCode: code,
            userId: actor.userId,
          };
        }
      }

      // 4. Transactional capacity check + member upsert + invite increment
      const assignedRole =
        actor.userId === room.hostId
          ? 'HOST'
          : existingMember
            ? normalizeRole(existingMember.role)
            : 'LISTENER';

      await prisma.$transaction(async (tx) => {
        // Row lock on the room row for atomic capacity check
        await tx.$queryRawUnsafe('SELECT code FROM rooms WHERE code = $1 FOR UPDATE', code);

        if (!alreadyActive) {
          const activeCount = await tx.togetherRoomMember.count({
            where: { roomCode: code, leftAt: null },
          });
          if (activeCount >= room.maxMembers) {
            throw new RoomHttpError(409, 'ROOM_FULL', 'This room is currently full.');
          }
        }

        await tx.togetherRoomMember.upsert({
          where: { roomCode_userId: { roomCode: code, userId: actor.userId } },
          create: {
            roomCode: code,
            userId: actor.userId,
            displayName:
              RoomPermissionService.sanitizeText(actor.username || 'Listener', 64) || 'Listener',
            avatarUrl: RoomPermissionService.validateSafeUrl(actor.avatarUrl),
            isGuest: actor.isGuest,
            role: assignedRole,
            canSpeak: false,
          },
          update: {
            displayName:
              RoomPermissionService.sanitizeText(actor.username || 'Listener', 64) || 'Listener',
            avatarUrl: RoomPermissionService.validateSafeUrl(actor.avatarUrl),
            leftAt: null,
            lastSeenAt: new Date(),
            role: assignedRole,
            canSpeak: false,
          },
        });

        if (validInviteId) {
          await tx.togetherInvite.update({
            where: { id: validInviteId },
            data: { usesCount: { increment: 1 } },
          });
        }
      });

      roomStore.updatePresence(code, actor.userId, {
        lastSeenMs: Date.now(),
        isPlaying: room.playbackState === 'playing',
        bufferReady: true,
      });

      await RoomAnalyticsService.ensureSessionStarted(code, actor.userId, actor.isGuest).catch(
        () => undefined
      );

      const snapshot = await this.getRoomSnapshot(code, actor.userId);
      const memberDto = snapshot.members.find((m: any) => m.userId === actor.userId);

      if (!alreadyActive) {
        await roomEventService.emit({
          roomCode: code,
          type: 'USER_JOINED',
          actorId: actor.userId,
          payload: {
            user: memberDto,
            memberCount: snapshot.members.length,
          },
          auditAction: 'MEMBER_JOINED',
          auditMetadata: { actorName: actor.username },
          legacyFlat: { user: memberDto, members: snapshot.members },
        });
      }

      const ticket = this.mintTicket(code, actor, assignedRole);
      return {
        status: 'JOINED',
        roomCode: code,
        ticket,
        userId: actor.userId,
        role: assignedRole,
        room: snapshot,
        snapshot,
      };
    });
  }

  static async leaveRoom(roomCode: string, userId: string): Promise<void> {
    const code = roomCode.trim().toUpperCase();
    await roomStore.withRoomLock(code, async () => {
      const room = await prisma.togetherRoom.findUnique({ where: { code } });
      if (!room) return;
      const member = await prisma.togetherRoomMember.findUnique({
        where: { roomCode_userId: { roomCode: code, userId } },
      });
      if (!member || member.leftAt !== null) return;

      await prisma.togetherRoomMember.update({
        where: { roomCode_userId: { roomCode: code, userId } },
        data: { leftAt: new Date() },
      });

      roomStore.removePresence(code, userId);
      await RoomAnalyticsService.closeSession(code, userId).catch(() => undefined);

      // If host left voluntarily and other active members exist, promote next highest role
      if (userId === room.hostId && room.state === 'ACTIVE') {
        const remaining = await prisma.togetherRoomMember.findMany({
          where: { roomCode: code, leftAt: null, userId: { not: userId } },
          orderBy: { joinedAt: 'asc' },
        });
        if (remaining.length > 0) {
          const priority = { CO_HOST: 4, MODERATOR: 3, DJ: 3, MEMBER: 2, LISTENER: 1 } as Record<string, number>;
          remaining.sort(
            (a, b) =>
              (priority[normalizeRole(b.role)] || 0) - (priority[normalizeRole(a.role)] || 0) ||
              a.joinedAt.getTime() - b.joinedAt.getTime()
          );
          const nextHost = remaining[0];
          await prisma.$transaction([
            prisma.togetherRoom.update({
              where: { code },
              data: { hostId: nextHost.userId },
            }),
            prisma.togetherRoomMember.update({
              where: { roomCode_userId: { roomCode: code, userId: nextHost.userId } },
              data: { role: 'HOST' },
            }),
          ]);

          await roomEventService.emit({
            roomCode: code,
            type: 'HOST_TRANSFERRED',
            actorId: userId,
            payload: {
              fromUserId: userId,
              toUserId: nextHost.userId,
              newHostName: nextHost.displayName,
            },
            auditAction: 'HOST_TRANSFER',
            auditTargetId: nextHost.userId,
            auditMetadata: { actorName: member.displayName, targetName: nextHost.displayName },
          });
        }
      }

      const activeMembers = await prisma.togetherRoomMember.findMany({
        where: { roomCode: code, leftAt: null },
      });

      await roomEventService.emit({
        roomCode: code,
        type: 'USER_LEFT',
        actorId: userId,
        payload: {
          userId,
          displayName: member.displayName,
          memberCount: activeMembers.length,
        },
        auditAction: 'MEMBER_LEFT',
        auditMetadata: { actorName: member.displayName },
        legacyFlat: { userId, members: activeMembers },
      });
    });
  }

  static async closeRoom(
    roomCode: string,
    actorId: string | 'system',
    reason: 'HOST_ENDED' | 'EXPIRED' | 'EMPTY' = 'HOST_ENDED'
  ) {
    const code = roomCode.trim().toUpperCase();
    return roomStore.withRoomLock(code, async () => {
      const room = await prisma.togetherRoom.findUnique({ where: { code } });
      if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');

      if (actorId !== 'system' && actorId !== room.hostId) {
        throw new RoomHttpError(403, 'FORBIDDEN', 'Only the host can close the room.');
      }
      if (room.state === 'CLOSED' || room.state === 'EXPIRED') {
        const recap = await RoomAnalyticsService.getRecap(code).catch(() => null);
        return { closed: true, reason: room.endedReason || reason, recap };
      }

      const nextState: RoomState = reason === 'EXPIRED' ? 'EXPIRED' : 'CLOSED';
      const now = new Date();

      await prisma.$transaction([
        prisma.togetherRoom.update({
          where: { code },
          data: {
            state: nextState,
            endedReason: reason,
            endedAt: now,
            playbackState: 'paused',
          },
        }),
        prisma.togetherRoomMember.updateMany({
          where: { roomCode: code, leftAt: null },
          data: { leftAt: now },
        }),
        prisma.togetherUserSession.updateMany({
          where: { roomCode: code, leftAt: null },
          data: { leftAt: now },
        }),
        prisma.togetherInvite.updateMany({
          where: { roomCode: code, revokedAt: null },
          data: { revokedAt: now },
        }),
      ]);

      roomStore.clearRoomPresence(code);

      const recap = await RoomAnalyticsService.generateAndStoreRecap(code).catch(() => null);

      await roomEventService.emit({
        roomCode: code,
        type: 'ROOM_CLOSED',
        actorId,
        payload: {
          reason,
          recapReady: recap != null,
          roomCode: code,
        },
        auditAction: 'ROOM_CLOSED',
        auditMetadata: { actorName: actorId === 'system' ? 'System' : 'Host', reason },
        legacyFlat: { reason, recapReady: recap != null },
      });

      return { closed: true, reason, recapReady: recap != null, recap };
    });
  }

  static async updateConfig(
    roomCode: string,
    actorId: string,
    patch: Partial<{
      name: string;
      description: string;
      coverUrl: string | null;
      mode: string;
      isPrivate: boolean;
      password: string | null;
      maxMembers: number;
      maxParticipants: number;
      visibility: string;
      durationMinutes: number | null;
      inviteMode: string;
      allowListenersAddQueue: boolean;
      allowListenersSkip: boolean;
      enabledRoles: string[];
      permissions: Record<string, string>;
    }>
  ) {
    const code = roomCode.trim().toUpperCase();
    return roomStore.withRoomLock(code, async () => {
      const [room, actor] = await Promise.all([
        prisma.togetherRoom.findUnique({ where: { code } }),
        prisma.togetherRoomMember.findUnique({
          where: { roomCode_userId: { roomCode: code, userId: actorId } },
        }),
      ]);
      if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
      if (!actor || actor.leftAt !== null) {
        throw new RoomHttpError(403, 'NOT_A_MEMBER', 'You must be an active member.');
      }
      RoomPermissionService.requirePermission(room, actor, 'EDIT_CONFIG');

      const data: Record<string, any> = {};
      if (patch.name !== undefined) {
        data.name = RoomPermissionService.sanitizeText(patch.name, 100) || room.name;
      }
      if (patch.description !== undefined) {
        data.description = RoomPermissionService.sanitizeText(patch.description, 500);
      }
      if (patch.coverUrl !== undefined) {
        data.coverUrl = RoomPermissionService.validateSafeUrl(patch.coverUrl);
      }
      if (patch.mode !== undefined) {
        data.mode = normalizeRoomMode(patch.mode);
      }
      if (patch.isPrivate !== undefined) {
        data.isPrivate = Boolean(patch.isPrivate);
      }
      if (patch.password !== undefined) {
        if (patch.password === null || patch.password === '') {
          data.passwordHash = null;
        } else {
          if (patch.password.trim().length < 4) {
            throw new RoomHttpError(400, 'INVALID_PASSWORD', 'Password must be >= 4 chars.');
          }
          data.passwordHash = await RoomPermissionService.hashPassword(patch.password.trim());
          data.isPrivate = true;
        }
      }
      if (patch.maxMembers !== undefined || (patch as any).maxParticipants !== undefined) {
        const rawMax = patch.maxMembers ?? (patch as any).maxParticipants;
        data.maxMembers = Math.max(2, Math.min(100, Number(rawMax) || room.maxMembers));
      }
      if ((patch as any).visibility !== undefined) {
        data.isPrivate = String((patch as any).visibility).toUpperCase() !== 'PUBLIC';
      }
      if (patch.durationMinutes !== undefined) {
        const mins =
          patch.durationMinutes === 0 || patch.durationMinutes === null
            ? 0
            : Math.max(15, Math.min(1440, Number(patch.durationMinutes) || 240));
        data.durationMinutes = mins;
        data.expiresAt = mins === 0 ? null : new Date(Date.now() + mins * 60_000);
      }
      if (patch.inviteMode !== undefined) {
        data.inviteMode = normalizeInviteMode(patch.inviteMode);
      }
      if (patch.allowListenersAddQueue !== undefined) {
        data.allowListenersAddQueue = Boolean(patch.allowListenersAddQueue);
      } else if ((patch as any).permissions?.QUEUE_EDIT !== undefined) {
        const qe = String((patch as any).permissions.QUEUE_EDIT).toUpperCase();
        data.allowListenersAddQueue = qe === 'MEMBER' || qe === 'LISTENER';
      }
      if (patch.allowListenersSkip !== undefined) {
        data.allowListenersSkip = Boolean(patch.allowListenersSkip);
      }
      if ((patch as any).enabledRoles !== undefined || (patch as any).permissions !== undefined) {
        const existingAcl = (await roomStore.getJson<any>(`room_acl:${code}`)) || {};
        await roomStore.setJson(
          `room_acl:${code}`,
          {
            enabledRoles: (patch as any).enabledRoles ?? existingAcl.enabledRoles,
            permissions: (patch as any).permissions ?? existingAcl.permissions,
          },
          86400 * 7
        );
      }

      const updated = await prisma.togetherRoom.update({
        where: { code },
        data,
      });

      const snapshot = await this.getRoomSnapshot(code);
      await roomEventService.emit({
        roomCode: code,
        type: 'ROOM_CONFIG_UPDATED',
        actorId,
        payload: { config: snapshot.config },
        auditAction: 'CONFIG_UPDATED',
        auditMetadata: { actorName: actor.displayName, keys: Object.keys(data) },
      });

      return snapshot.config;
    });
  }

  static async uploadCover(
    roomCode: string,
    actorId: string,
    fileBuffer: Buffer
  ): Promise<string> {
    const code = roomCode.trim().toUpperCase();
    const [room, actor] = await Promise.all([
      prisma.togetherRoom.findUnique({ where: { code } }),
      prisma.togetherRoomMember.findUnique({
        where: { roomCode_userId: { roomCode: code, userId: actorId } },
      }),
    ]);
    if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
    if (!actor || actor.leftAt !== null) {
      throw new RoomHttpError(403, 'NOT_A_MEMBER', 'Not an active room member.');
    }
    RoomPermissionService.requirePermission(room, actor, 'EDIT_CONFIG');

    if (fileBuffer.length > 5 * 1024 * 1024) {
      throw new RoomHttpError(413, 'FILE_TOO_LARGE', 'Cover image must be 5 MB or less.');
    }

    // Magic-byte validation (JPEG / PNG / WEBP)
    let ext = '';
    let contentType = '';
    if (fileBuffer.length >= 3 && fileBuffer[0] === 0xff && fileBuffer[1] === 0xd8 && fileBuffer[2] === 0xff) {
      ext = 'jpg';
      contentType = 'image/jpeg';
    } else if (
      fileBuffer.length >= 8 &&
      fileBuffer[0] === 0x89 &&
      fileBuffer[1] === 0x50 &&
      fileBuffer[2] === 0x4e &&
      fileBuffer[3] === 0x47
    ) {
      ext = 'png';
      contentType = 'image/png';
    } else if (
      fileBuffer.length >= 12 &&
      fileBuffer.slice(0, 4).toString('ascii') === 'RIFF' &&
      fileBuffer.slice(8, 12).toString('ascii') === 'WEBP'
    ) {
      ext = 'webp';
      contentType = 'image/webp';
    } else {
      throw new RoomHttpError(400, 'INVALID_IMAGE', 'Only JPEG, PNG, and WEBP images are supported.');
    }

    const key = `together/covers/${code}-${Date.now()}.${ext}`;
    const coverUrl = await uploadToR2(key, fileBuffer, contentType);

    await prisma.togetherRoom.update({
      where: { code },
      data: { coverUrl },
    });

    const snapshot = await this.getRoomSnapshot(code);
    await roomEventService.emit({
      roomCode: code,
      type: 'ROOM_CONFIG_UPDATED',
      actorId,
      payload: { config: snapshot.config },
      auditAction: 'COVER_UPDATED',
      auditMetadata: { actorName: actor.displayName },
    });

    return coverUrl;
  }

  static async getRoomSnapshot(roomCode: string, forUserId?: string) {
    const code = roomCode.trim().toUpperCase();
    const [room, members, chatRows, bookmarkRows, reqRows] = await Promise.all([
      prisma.togetherRoom.findUnique({ where: { code } }),
      prisma.togetherRoomMember.findMany({
        where: { roomCode: code, leftAt: null },
        orderBy: { joinedAt: 'asc' },
      }),
      prisma.togetherChatMessage.findMany({
        where: { roomCode: code, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 60,
      }),
      prisma.togetherBookmark.findMany({
        where: { roomCode: code },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.togetherSongRequest.findMany({
        where: { roomCode: code },
        orderBy: { createdAt: 'desc' },
        take: 60,
      }),
    ]);

    if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');

    const presenceMap = roomStore.getRoomPresenceMap(code);
    const livePosMs = this.computeLivePositionMs(room);
    const queue = (Array.isArray(room.queue) ? room.queue : []) as unknown as TogetherQueueItemDTO[];
    const skipVotes = (Array.isArray(room.skipVotes) ? room.skipVotes : []) as string[];
    const reactions =
      room.reactionCounts && typeof room.reactionCounts === 'object'
        ? (room.reactionCounts as Record<string, number>)
        : {};

    const memberDTOs = members.map((m) => {
      const pres = presenceMap.get(m.userId);
      const online = pres ? Date.now() - pres.lastSeenMs < 45_000 : Date.now() - m.lastSeenAt.getTime() < 90_000;
      return {
        userId: m.userId,
        username: m.displayName,
        displayName: m.displayName,
        avatar: m.avatarUrl,
        avatarUrl: m.avatarUrl,
        role: m.userId === room.hostId ? 'HOST' : normalizeRole(m.role),
        isGuest: m.isGuest,
        joinedAt: m.joinedAt.getTime(),
        lastPing: pres?.lastSeenMs ?? m.lastSeenAt.getTime(),
        isPlaying: pres?.isPlaying ?? room.playbackState === 'playing',
        bufferReady: pres?.bufferReady ?? true,
        offsetMs: pres?.offsetMs ?? 0,
        online,
      };
    });

    const acl = (await roomStore.getJson<any>(`room_acl:${code}`)) || {};
    const djExtra = (await roomStore.getJson<any>(`dj_extra:${code}`)) || {};
    const modeNormalized = normalizeRoomMode(room.mode);
    const defaultPermissions = {
      PLAYBACK: modeNormalized === 'collab' ? 'MEMBER' : 'DJ',
      QUEUE_EDIT: room.allowListenersAddQueue ? 'MEMBER' : 'DJ',
      QUEUE_MANAGE: 'CO_HOST',
      INVITE: 'MEMBER',
      MODERATE_CHAT: 'CO_HOST',
      MANAGE_ROLES: 'OWNER',
    };

    return {
      roomCode: room.code,
      hostId: room.hostId,
      mode: modeNormalized,
      state: room.state,
      seq: Number(room.seq),
      revision: room.queueRevision,
      queueRevision: room.queueRevision,
      serverTimestampMs: Date.now(),
      settings: {
        requiresApproval: normalizeInviteMode(room.inviteMode) === 'APPROVAL',
        guestCanQueue: room.allowListenersAddQueue,
        guestCanChat: true,
      },
      config: {
        name: room.name,
        description: room.description,
        coverUrl: room.coverUrl,
        mode: modeNormalized,
        isPrivate: room.isPrivate,
        visibility: room.isPrivate ? 'PRIVATE' : 'PUBLIC',
        hasPassword: Boolean(room.passwordHash),
        maxMembers: room.maxMembers,
        maxParticipants: room.maxMembers,
        durationMinutes: room.expiresAt ? room.durationMinutes : null,
        expiresAtMs: room.expiresAt ? room.expiresAt.getTime() : null,
        endsAtMs: room.expiresAt ? room.expiresAt.getTime() : null,
        inviteMode: normalizeInviteMode(room.inviteMode),
        allowListenersAddQueue: room.allowListenersAddQueue,
        allowListenersSkip: room.allowListenersSkip,
        enabledRoles: acl.enabledRoles || ['OWNER', 'CO_HOST', 'DJ', 'MEMBER', 'LISTENER'],
        permissions: { ...defaultPermissions, ...(acl.permissions || {}) },
        state: room.state,
      },
      theme: {
        presetId: room.themePreset || 'MIDNIGHT',
        accentHex: room.themeAccentHex,
        useArtwork: !room.themePreset || room.themePreset === 'ARTWORK',
        animateBackground: true,
        bgUrl: room.themeBgUrl,
      },
      djSettings: {
        requestMode: normalizeRequestMode(room.requestMode),
        requestLimit: room.requestMaxPerUser,
        requestMaxPerUser: room.requestMaxPerUser,
        queueLocked: room.queueLocked,
        playbackRate: room.playbackRate || 1.0,
        gapless: djExtra.gapless ?? true,
        crossfade: djExtra.crossfade ?? false,
        transitionSeconds: djExtra.transitionSeconds ?? 4,
        preloadNext: djExtra.preloadNext ?? true,
        announceText:
          room.announceUntilMs && Number(room.announceUntilMs) < Date.now()
            ? null
            : room.announceText,
        announceUntilMs: room.announceUntilMs ? Number(room.announceUntilMs) : null,
      },
      members: memberDTOs,
      queue,
      player: {
        trackId: room.currentTrackId,
        track: room.currentTrack ?? null,
        state: room.playbackState,
        positionSec: Math.round((livePosMs / 1000) * 1000) / 1000,
        positionMs: livePosMs,
        playbackRate: room.playbackRate || 1.0,
        startedAtServerMs: room.startedAtServerMs ? Number(room.startedAtServerMs) : Date.now(),
      },
      chat: chatRows.reverse().map((c) => ({
        id: c.id,
        userId: c.userId,
        username: c.displayName,
        avatar: c.avatarUrl,
        text: c.text,
        replyToId: c.replyToId,
        replyToText: c.replyToText,
        editedAtMs: c.editedAt ? c.editedAt.getTime() : null,
        timestamp: c.createdAt.getTime(),
      })),
      bookmarks: bookmarkRows.map((b) => ({
        id: b.id,
        trackId: b.trackId,
        trackTitle: b.trackTitle,
        trackArtist: b.trackArtist,
        trackCover: b.trackCover,
        positionMs: b.positionMs,
        note: b.note,
        userId: b.userId,
        createdAtMs: b.createdAt.getTime(),
      })),
      requests: reqRows.map((r) => ({
        id: r.id,
        roomCode: r.roomCode,
        userId: r.requesterId,
        username: r.requesterName,
        trackId: r.trackId,
        track: r.trackJson,
        status: r.status,
        createdAtMs: r.createdAt.getTime(),
      })),
      skipVotes,
      reactions,
      myUserId: forUserId ?? null,
      createdAt: room.createdAt.getTime(),
    };
  }

  private static getTicketSecret(): string {
    return process.env.JWT_SECRET || 'zenify-together-ticket-fallback-secret';
  }

  static mintTicket(roomCode: string, actor: ActorIdentity, role: string): string {
    const payload = Buffer.from(
      JSON.stringify({
        roomCode: roomCode.toUpperCase(),
        userId: actor.userId,
        username: actor.username,
        avatarUrl: actor.avatarUrl ?? null,
        isGuest: actor.isGuest,
        role,
        exp: Date.now() + 24 * 3600_000,
      })
    ).toString('base64url');
    const sig = crypto
      .createHmac('sha256', this.getTicketSecret())
      .update(payload)
      .digest('base64url');
    return `${payload}.${sig}`;
  }

  static verifyTicket(token: string): {
    roomCode: string;
    userId: string;
    username: string;
    avatarUrl?: string | null;
    isGuest: boolean;
    role: string;
  } | null {
    try {
      const [payloadB64, sigB64] = token.split('.');
      if (!payloadB64 || !sigB64) return null;
      const expectedSig = crypto
        .createHmac('sha256', this.getTicketSecret())
        .update(payloadB64)
        .digest('base64url');
      if (sigB64.length !== expectedSig.length) return null;
      if (!crypto.timingSafeEqual(Buffer.from(sigB64), Buffer.from(expectedSig))) {
        return null;
      }
      const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      if (!parsed.exp || parsed.exp < Date.now()) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}
