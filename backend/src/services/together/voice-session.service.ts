import axios from 'axios';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../../utils/prisma';
import { AchievementService } from './achievement.service';
import { roomEventService } from './room-event.service';
import { RoomPermissionService } from './room-permission.service';
import { roomStore } from './room-store';
import { normalizeRole, RoomHttpError } from './room-types';

export class VoiceSessionService {
  private static getConfig() {
    const url = process.env.LIVEKIT_URL?.trim();
    const apiKey = process.env.LIVEKIT_API_KEY?.trim();
    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
    const webhookKey = process.env.LIVEKIT_WEBHOOK_KEY?.trim() || apiKey;
    return {
      url,
      apiKey,
      apiSecret,
      webhookKey,
      configured: Boolean(url && apiKey && apiSecret),
    };
  }

  private static getHttpBase(wsUrl: string): string {
    return wsUrl.replace(/^wss:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://').replace(/\/$/, '');
  }

  private static signLiveKitJwt(
    apiKey: string,
    apiSecret: string,
    subject: string,
    grants: Record<string, any>,
    ttlSeconds = 3600,
    name?: string
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: Record<string, any> = {
      iss: apiKey,
      sub: subject,
      nbf: now - 5,
      exp: now + ttlSeconds,
      ...grants,
    };
    if (name) payload.name = name;
    return jwt.sign(payload, apiSecret, { algorithm: 'HS256' });
  }

  private static async callTwirp(method: string, body: Record<string, any>): Promise<void> {
    const cfg = this.getConfig();
    if (!cfg.configured || !cfg.url || !cfg.apiKey || !cfg.apiSecret) return;

    const adminToken = this.signLiveKitJwt(
      cfg.apiKey,
      cfg.apiSecret,
      'zenify-server',
      { video: { roomAdmin: true, room: body.room } },
      120
    );

    const endpoint = `${this.getHttpBase(cfg.url)}/twirp/livekit.RoomService/${method}`;
    await axios
      .post(endpoint, body, {
        timeout: 4000,
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      })
      .catch((err) => {
        console.warn(`[VoiceSession] Twirp ${method} warning:`, err?.message || err);
      });
  }

  static async mintVoiceToken(roomCode: string, actorId: string) {
    const cfg = this.getConfig();
    if (!cfg.configured || !cfg.url || !cfg.apiKey || !cfg.apiSecret) {
      throw new RoomHttpError(
        503,
        'VOICE_NOT_CONFIGURED',
        'Voice chat server is not configured.'
      );
    }

    const code = roomCode.trim().toUpperCase();
    const [room, member] = await Promise.all([
      prisma.togetherRoom.findUnique({ where: { code } }),
      prisma.togetherRoomMember.findUnique({
        where: { roomCode_userId: { roomCode: code, userId: actorId } },
      }),
    ]);

    if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
    if (!member || member.leftAt !== null) {
      throw new RoomHttpError(403, 'NOT_A_MEMBER', 'Join the room before entering voice.');
    }

    const canPublish =
      RoomPermissionService.canSpeak(room, member) && !member.isMuted;
    const roomName = room.livekitRoomName || `zenify_${code}`;

    const token = this.signLiveKitJwt(
      cfg.apiKey,
      cfg.apiSecret,
      actorId,
      {
        video: {
          roomJoin: true,
          room: roomName,
          canPublish,
          canSubscribe: true,
          canPublishData: true,
        },
      },
      3600,
      member.displayName
    );

    if (canPublish && !member.isGuest) {
      await AchievementService.recordProgress({
        userId: actorId,
        voiceRoomsDelta: 1,
      }).catch(() => undefined);
    }

    return {
      url: cfg.url,
      token,
      roomName,
      canPublish,
    };
  }

  static async grantSpeak(roomCode: string, actorId: string, targetUserId: string) {
    return this.updateSpeakAccess(roomCode, actorId, targetUserId, true);
  }

  static async revokeSpeak(roomCode: string, actorId: string, targetUserId: string) {
    return this.updateSpeakAccess(roomCode, actorId, targetUserId, false);
  }

  private static async updateSpeakAccess(
    roomCode: string,
    actorId: string,
    targetUserId: string,
    grant: boolean
  ) {
    const code = roomCode.trim().toUpperCase();
    return roomStore.withRoomLock(code, async () => {
      const [room, actor, target] = await Promise.all([
        prisma.togetherRoom.findUnique({ where: { code } }),
        prisma.togetherRoomMember.findUnique({
          where: { roomCode_userId: { roomCode: code, userId: actorId } },
        }),
        prisma.togetherRoomMember.findUnique({
          where: { roomCode_userId: { roomCode: code, userId: targetUserId } },
        }),
      ]);
      if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
      if (!actor || actor.leftAt !== null) {
        throw new RoomHttpError(403, 'NOT_A_MEMBER', 'Not an active member.');
      }
      if (!target || target.leftAt !== null) {
        throw new RoomHttpError(404, 'TARGET_NOT_FOUND', 'Member not found.');
      }

      RoomPermissionService.requirePermission(room, actor, 'MANAGE_ROLES');
      if (targetUserId !== actorId && !RoomPermissionService.canActOnTarget(room, actor, target)) {
        throw new RoomHttpError(403, 'FORBIDDEN', 'Insufficient role rank.');
      }

      const currentRole = normalizeRole(target.role);
      const nextRole =
        grant && currentRole === 'LISTENER'
          ? 'SPEAKER'
          : !grant && currentRole === 'SPEAKER'
            ? 'LISTENER'
            : currentRole;

      await prisma.togetherRoomMember.update({
        where: { roomCode_userId: { roomCode: code, userId: targetUserId } },
        data: {
          canSpeak: grant,
          isHandRaised: grant ? false : target.isHandRaised,
          role: nextRole,
        },
      });

      if (room.livekitRoomName) {
        await this.callTwirp('UpdateParticipant', {
          room: room.livekitRoomName,
          identity: targetUserId,
          permission: {
            canPublish: grant && !target.isMuted,
            canSubscribe: true,
            canPublishData: true,
          },
        });
      }

      await roomEventService.emit({
        roomCode: code,
        type: grant ? 'SPEAK_GRANTED' : 'SPEAK_REVOKED',
        actorId,
        payload: { userId: targetUserId, canSpeak: grant, role: nextRole },
        auditAction: grant ? 'SPEAK_GRANTED' : 'SPEAK_REVOKED',
        auditTargetId: targetUserId,
        auditMetadata: { actorName: actor.displayName, targetName: target.displayName },
      });

      return { userId: targetUserId, canSpeak: grant, role: nextRole };
    });
  }

  static async setSpeakers(roomCode: string, actorId: string, speakerIds: string[]) {
    const code = roomCode.trim().toUpperCase();
    return roomStore.withRoomLock(code, async () => {
      const [room, actor, members] = await Promise.all([
        prisma.togetherRoom.findUnique({ where: { code } }),
        prisma.togetherRoomMember.findUnique({
          where: { roomCode_userId: { roomCode: code, userId: actorId } },
        }),
        prisma.togetherRoomMember.findMany({ where: { roomCode: code, leftAt: null } }),
      ]);
      if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
      if (!actor || actor.leftAt !== null) {
        throw new RoomHttpError(403, 'NOT_A_MEMBER', 'Not an active member.');
      }
      RoomPermissionService.requirePermission(room, actor, 'MANAGE_ROLES');

      const speakerSet = new Set(speakerIds);
      for (const m of members) {
        const role = normalizeRole(m.role);
        if (role === 'HOST' || role === 'CO_HOST') continue;
        const canSpeak = speakerSet.has(m.userId);
        const nextRole = canSpeak && role === 'LISTENER' ? 'SPEAKER' : !canSpeak && role === 'SPEAKER' ? 'LISTENER' : role;
        await prisma.togetherRoomMember.update({
          where: { roomCode_userId: { roomCode: code, userId: m.userId } },
          data: { canSpeak, role: nextRole },
        });
        if (room.livekitRoomName) {
          await this.callTwirp('UpdateParticipant', {
            room: room.livekitRoomName,
            identity: m.userId,
            permission: { canPublish: canSpeak && !m.isMuted, canSubscribe: true, canPublishData: true },
          });
        }
      }

      await roomEventService.emit({
        roomCode: code,
        type: 'SPEAKER_CHANGED',
        actorId,
        payload: { speakerUserIds: speakerIds },
      });

      return { speakerUserIds: speakerIds };
    });
  }

  static async muteMember(
    roomCode: string,
    actorId: string,
    targetUserId: string,
    muted: boolean
  ) {
    const code = roomCode.trim().toUpperCase();
    return roomStore.withRoomLock(code, async () => {
      const [room, actor, target] = await Promise.all([
        prisma.togetherRoom.findUnique({ where: { code } }),
        prisma.togetherRoomMember.findUnique({
          where: { roomCode_userId: { roomCode: code, userId: actorId } },
        }),
        prisma.togetherRoomMember.findUnique({
          where: { roomCode_userId: { roomCode: code, userId: targetUserId } },
        }),
      ]);
      if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
      if (!actor || actor.leftAt !== null) {
        throw new RoomHttpError(403, 'NOT_A_MEMBER', 'Not active in room.');
      }
      if (!target || target.leftAt !== null) {
        throw new RoomHttpError(404, 'TARGET_NOT_FOUND', 'Target user not found.');
      }

      if (actorId !== targetUserId) {
        RoomPermissionService.requirePermission(room, actor, 'MODERATE_CHAT');
        if (!RoomPermissionService.canActOnTarget(room, actor, target)) {
          throw new RoomHttpError(403, 'FORBIDDEN', 'Cannot mute equal/higher rank.');
        }
      }

      await prisma.togetherRoomMember.update({
        where: { roomCode_userId: { roomCode: code, userId: targetUserId } },
        data: { isMuted: muted },
      });

      if (room.livekitRoomName) {
        await this.callTwirp('UpdateParticipant', {
          room: room.livekitRoomName,
          identity: targetUserId,
          permission: {
            canPublish: !muted && RoomPermissionService.canSpeak(room, target),
            canSubscribe: true,
            canPublishData: true,
          },
        });
      }

      await roomEventService.emit({
        roomCode: code,
        type: 'VOICE_MUTE_CHANGED',
        actorId,
        payload: { userId: targetUserId, isMuted: muted },
        auditAction: muted ? 'VOICE_MUTE' : 'VOICE_UNMUTE',
        auditTargetId: targetUserId,
        auditMetadata: { actorName: actor.displayName, targetName: target.displayName },
      });

      return { userId: targetUserId, isMuted: muted };
    });
  }

  static verifyWebhook(authHeader: string | undefined, rawBody: string): any | null {
    const cfg = this.getConfig();
    if (!cfg.configured || !cfg.apiSecret || !authHeader) return null;
    try {
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const decoded = jwt.verify(token, cfg.apiSecret, { algorithms: ['HS256'] }) as any;
      if (decoded?.sha256) {
        const digest = crypto.createHash('sha256').update(rawBody).digest('base64');
        if (decoded.sha256 !== digest) return null;
      }
      return JSON.parse(rawBody);
    } catch {
      return null;
    }
  }
}

