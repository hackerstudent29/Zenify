import { prisma } from '../../utils/prisma';
import { roomEventService } from './room-event.service';
import { RoomPermissionService } from './room-permission.service';
import { RoomSessionService } from './room-session.service';
import { roomStore } from './room-store';
import { normalizeRole, RoomHttpError, RoomRole } from './room-types';

export class RoomMembershipService {
  static async setMemberRole(
    roomCode: string,
    actorId: string,
    targetUserId: string,
    rawRole: string
  ) {
    const code = roomCode.trim().toUpperCase();
    const newRole: RoomRole = normalizeRole(rawRole);
    if (newRole === 'HOST') {
      throw new RoomHttpError(400, 'USE_TRANSFER', 'Use /transfer-host to assign HOST.');
    }

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
        throw new RoomHttpError(403, 'NOT_A_MEMBER', 'Actor is not an active member.');
      }
      if (!target || target.leftAt !== null) {
        throw new RoomHttpError(404, 'TARGET_NOT_FOUND', 'Target user is not in this room.');
      }

      RoomPermissionService.requirePermission(room, actor, 'MANAGE_ROLES');
      if (!RoomPermissionService.canActOnTarget(room, actor, target)) {
        throw new RoomHttpError(403, 'FORBIDDEN', 'Cannot change role of equal/higher member.');
      }

      await prisma.togetherRoomMember.update({
        where: { roomCode_userId: { roomCode: code, userId: targetUserId } },
        data: { role: newRole, canSpeak: false },
      });

      await roomEventService.emit({
        roomCode: code,
        type: 'MEMBER_ROLE_CHANGED',
        actorId,
        payload: { userId: targetUserId, role: newRole },
        auditAction: 'ROLE_CHANGE',
        auditTargetId: targetUserId,
        auditMetadata: {
          actorName: actor.displayName,
          targetName: target.displayName,
          newRole,
        },
      });

      return { userId: targetUserId, role: newRole };
    });
  }

  static async transferHost(roomCode: string, actorId: string, toUserId: string) {
    const code = roomCode.trim().toUpperCase();
    return roomStore.withRoomLock(code, async () => {
      const [room, actor, target] = await Promise.all([
        prisma.togetherRoom.findUnique({ where: { code } }),
        prisma.togetherRoomMember.findUnique({
          where: { roomCode_userId: { roomCode: code, userId: actorId } },
        }),
        prisma.togetherRoomMember.findUnique({
          where: { roomCode_userId: { roomCode: code, userId: toUserId } },
        }),
      ]);
      if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
      if (actorId !== room.hostId) {
        throw new RoomHttpError(403, 'FORBIDDEN', 'Only the current host can transfer ownership.');
      }
      if (!target || target.leftAt !== null) {
        throw new RoomHttpError(404, 'TARGET_NOT_FOUND', 'Target user must be active in room.');
      }
      if (toUserId === actorId) {
        throw new RoomHttpError(400, 'INVALID_TARGET', 'You are already the host.');
      }

      await prisma.$transaction([
        prisma.togetherRoom.update({ where: { code }, data: { hostId: toUserId } }),
        prisma.togetherRoomMember.update({
          where: { roomCode_userId: { roomCode: code, userId: actorId } },
          data: { role: 'CO_HOST', canSpeak: true },
        }),
        prisma.togetherRoomMember.update({
          where: { roomCode_userId: { roomCode: code, userId: toUserId } },
          data: { role: 'HOST', canSpeak: true },
        }),
      ]);

      await roomEventService.emit({
        roomCode: code,
        type: 'HOST_TRANSFERRED',
        actorId,
        payload: {
          fromUserId: actorId,
          toUserId,
          newHostName: target.displayName,
        },
        auditAction: 'HOST_TRANSFER',
        auditTargetId: toUserId,
        auditMetadata: {
          actorName: actor?.displayName ?? 'Host',
          targetName: target.displayName,
        },
      });

      return { fromUserId: actorId, toUserId };
    });
  }

  static async kickOrBlockMember(
    roomCode: string,
    actorId: string,
    targetUserId: string,
    block: boolean,
    reason?: string
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
        throw new RoomHttpError(403, 'NOT_A_MEMBER', 'Actor is not active.');
      }
      RoomPermissionService.requirePermission(room, actor, 'KICK_BAN');

      if (target && !RoomPermissionService.canActOnTarget(room, actor, target)) {
        throw new RoomHttpError(403, 'FORBIDDEN', 'Cannot kick or block an equal/higher member.');
      }

      const cleanReason = reason ? RoomPermissionService.sanitizeText(reason, 200) : null;

      await prisma.$transaction(async (tx) => {
        await tx.togetherRoomMember.updateMany({
          where: { roomCode: code, userId: targetUserId, leftAt: null },
          data: { leftAt: new Date() },
        });
        if (block) {
          await tx.togetherRoomBlock.upsert({
            where: { roomCode_userId: { roomCode: code, userId: targetUserId } },
            create: {
              roomCode: code,
              userId: targetUserId,
              blockedBy: actorId,
              reason: cleanReason,
            },
            update: { blockedBy: actorId, reason: cleanReason },
          });
        }
      });

      roomStore.removePresence(code, targetUserId);

      await roomEventService.emit({
        roomCode: code,
        type: block ? 'MEMBER_BLOCKED' : 'MEMBER_KICKED',
        actorId,
        payload: {
          userId: targetUserId,
          blocked: block,
          reason: cleanReason,
        },
        auditAction: block ? 'MEMBER_BLOCKED' : 'MEMBER_KICKED',
        auditTargetId: targetUserId,
        auditMetadata: {
          actorName: actor.displayName,
          targetName: target?.displayName ?? targetUserId,
          reason: cleanReason,
        },
      });

      return { ok: true, userId: targetUserId, blocked: block };
    });
  }

  static async unblockMember(roomCode: string, actorId: string, targetUserId: string) {
    const code = roomCode.trim().toUpperCase();
    const [room, actor] = await Promise.all([
      prisma.togetherRoom.findUnique({ where: { code } }),
      prisma.togetherRoomMember.findUnique({
        where: { roomCode_userId: { roomCode: code, userId: actorId } },
      }),
    ]);
    if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
    RoomPermissionService.requirePermission(room, actor, 'KICK_BAN');
    await prisma.togetherRoomBlock.deleteMany({
      where: { roomCode: code, userId: targetUserId },
    });
    return { ok: true };
  }

  static async listBlocked(roomCode: string, actorId: string) {
    const code = roomCode.trim().toUpperCase();
    const [room, actor] = await Promise.all([
      prisma.togetherRoom.findUnique({ where: { code } }),
      prisma.togetherRoomMember.findUnique({
        where: { roomCode_userId: { roomCode: code, userId: actorId } },
      }),
    ]);
    if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
    RoomPermissionService.requirePermission(room, actor, 'KICK_BAN');
    const blocks = await prisma.togetherRoomBlock.findMany({ where: { roomCode: code } });
    return blocks.map((b) => ({
      userId: b.userId,
      blockedBy: b.blockedBy,
      reason: b.reason,
      createdAtMs: b.createdAt.getTime(),
    }));
  }

  static async listJoinRequests(roomCode: string, actorId: string) {
    const code = roomCode.trim().toUpperCase();
    const [room, actor] = await Promise.all([
      prisma.togetherRoom.findUnique({ where: { code } }),
      prisma.togetherRoomMember.findUnique({
        where: { roomCode_userId: { roomCode: code, userId: actorId } },
      }),
    ]);
    if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
    RoomPermissionService.requirePermission(room, actor, 'APPROVE_JOIN');

    const rows = await prisma.togetherJoinRequest.findMany({
      where: { roomCode: code, status: 'PENDING', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map((r) => ({
      id: r.id,
      roomCode: r.roomCode,
      userId: r.userId,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      status: r.status,
      createdAtMs: r.createdAt.getTime(),
    }));
  }

  static async resolveJoinRequest(
    roomCode: string,
    actorId: string,
    requestId: string,
    decision: 'APPROVE' | 'REJECT'
  ) {
    const code = roomCode.trim().toUpperCase();
    return roomStore.withRoomLock(code, async () => {
      const [room, actor, reqRow] = await Promise.all([
        prisma.togetherRoom.findUnique({ where: { code } }),
        prisma.togetherRoomMember.findUnique({
          where: { roomCode_userId: { roomCode: code, userId: actorId } },
        }),
        prisma.togetherJoinRequest.findUnique({ where: { id: requestId } }),
      ]);
      if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
      RoomPermissionService.requirePermission(room, actor, 'APPROVE_JOIN');
      if (!reqRow || reqRow.roomCode !== code) {
        throw new RoomHttpError(404, 'REQUEST_NOT_FOUND', 'Join request not found.');
      }

      const status = decision === 'APPROVE' ? 'APPROVED' : 'DENIED';
      await prisma.togetherJoinRequest.update({
        where: { id: requestId },
        data: { status, resolvedBy: actorId },
      });

      if (decision === 'APPROVE') {
        await prisma.togetherRoomMember.upsert({
          where: { roomCode_userId: { roomCode: code, userId: reqRow.userId } },
          create: {
            roomCode: code,
            userId: reqRow.userId,
            displayName: reqRow.displayName,
            avatarUrl: reqRow.avatarUrl,
            isGuest: reqRow.userId.startsWith('guest_'),
            role: 'LISTENER',
            canSpeak: false,
          },
          update: {
            leftAt: null,
            lastSeenAt: new Date(),
            role: 'LISTENER',
            canSpeak: false,
          },
        });

        const snapshot = await RoomSessionService.getRoomSnapshot(code);
        const joinedUser = snapshot.members.find((m: any) => m.userId === reqRow.userId);
        await roomEventService.emit({
          roomCode: code,
          type: 'USER_JOINED',
          actorId: reqRow.userId,
          payload: { user: joinedUser, memberCount: snapshot.members.length },
          auditAction: 'JOIN_APPROVED',
          auditTargetId: reqRow.userId,
          auditMetadata: { actorName: actor?.displayName, targetName: reqRow.displayName },
        });
      }

      await roomEventService.emit({
        roomCode: code,
        type: 'JOIN_REQUEST_RESOLVED',
        actorId,
        payload: {
          requestId,
          userId: reqRow.userId,
          status,
          approved: decision === 'APPROVE',
        },
      });

      return { id: requestId, status, userId: reqRow.userId };
    });
  }
}

