import crypto from 'crypto';
import { LyricsOrchestrator } from '../../lyrics/orchestrator';
import { prisma } from '../../utils/prisma';
import { ExternalMetadataService } from '../external-metadata.service';
import { RecommendationsService } from '../recommendations.service';
import { AchievementService } from './achievement.service';
import { QueueManagementService } from './queue-management.service';
import { RoomAnalyticsService } from './room-analytics.service';
import { roomEventService } from './room-event.service';
import { RoomPermissionService } from './room-permission.service';
import { ActorIdentity, RoomSessionService, sanitizeTrackDTO } from './room-session.service';
import { roomStore } from './room-store';
import {
  normalizeInviteMode,
  normalizeRequestMode,
  RoomHttpError,
  TogetherQueueItemDTO,
} from './room-types';

const ALLOWED_EMOJIS = new Set(['❤️', '🔥', '👏', '😭', '💃', '🎧', '✨', '🎵', '💯', '🙌', '🥳', '😍']);

export class RoomPhase2Service {
  // --------------------------------------------------------------------------
  // LYRICS (Uses existing LyricsOrchestrator + Prisma lyrics cache; NO mocks)
  // --------------------------------------------------------------------------
  static async getLyrics(query: {
    trackId?: string;
    title: string;
    artist: string;
    album?: string;
    durationSec?: number;
  }) {
    const title = (query.title || '').trim();
    const artist = (query.artist || '').trim();
    if (!title) {
      throw new RoomHttpError(400, 'INVALID_QUERY', 'Song title is required.');
    }

    const cacheKey = `room_lyrics:${title.toLowerCase()}::${artist.toLowerCase()}`;
    const cached = await roomStore.getJson<any>(cacheKey);
    if (cached) return cached;

    try {
      const { doc } = await LyricsOrchestrator.resolveLyrics({
        trackId: query.trackId,
        title,
        artist,
        album: query.album,
        duration: query.durationSec && query.durationSec > 0 ? query.durationSec : undefined,
      });

      if (!doc || !doc.lines || doc.lines.length === 0) {
        return {
          available: false,
          instrumental: doc?.instrumental ?? false,
          provider: doc?.providerId ?? null,
          lines: [],
        };
      }

      const structured = {
        available: true,
        format: 'structured',
        syncLevel: doc.syncLevel,
        provider: doc.providerId,
        instrumental: doc.instrumental,
        lines: doc.lines.map((l) => ({
          startMs: Math.max(0, Math.round(l.startMs || 0)),
          endMs: Math.max(0, Math.round(l.endMs || (l.startMs || 0) + 4000)),
          text: l.text,
          translation: null,
          romanization: null,
          words: Array.isArray(l.words)
            ? l.words.map((w) => ({
                startMs: Math.max(0, Math.round(w.startMs || 0)),
                endMs: Math.max(0, Math.round(w.endMs || 0)),
                text: w.text,
              }))
            : null,
        })),
      };

      await roomStore.setJson(cacheKey, structured, 86400);
      return structured;
    } catch {
      return { available: false, instrumental: false, lines: [] };
    }
  }

  // --------------------------------------------------------------------------
  // BOOKMARKS
  // --------------------------------------------------------------------------
  static async createBookmark(
    roomCode: string,
    actorId: string,
    input: {
      trackId?: string;
      trackTitle?: string;
      trackArtist?: string | null;
      trackCover?: string | null;
      positionMs?: number;
      note?: string | null;
      comment?: string | null;
    }
  ) {
    const code = roomCode.trim().toUpperCase();
    const [room, member] = await Promise.all([
      prisma.togetherRoom.findUnique({ where: { code } }),
      prisma.togetherRoomMember.findUnique({
        where: { roomCode_userId: { roomCode: code, userId: actorId } },
      }),
    ]);
    if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
    if (!member || member.leftAt !== null) {
      throw new RoomHttpError(403, 'NOT_A_MEMBER', 'Join room first.');
    }

    const curTrack = (room.currentTrack as any) || {};
    const trackId = String(input.trackId || curTrack.id || room.currentTrackId || 'unknown').slice(0, 128);
    const trackTitle =
      RoomPermissionService.sanitizeText(input.trackTitle || curTrack.title || 'Track', 256) || 'Track';
    const trackArtist = input.trackArtist ?? curTrack.artist ?? null;
    const trackCover = input.trackCover ?? curTrack.coverUrl ?? null;
    const posMs =
      input.positionMs !== undefined
        ? Math.max(0, Math.round(input.positionMs))
        : RoomSessionService.computeLivePositionMs(room);
    const rawNote = input.note ?? input.comment ?? null;

    const row = await prisma.togetherBookmark.create({
      data: {
        roomCode: code,
        userId: actorId,
        trackId,
        trackTitle,
        trackArtist: trackArtist ? RoomPermissionService.sanitizeText(trackArtist, 256) : null,
        trackCover: RoomPermissionService.validateSafeUrl(trackCover),
        positionMs: posMs,
        note: rawNote ? RoomPermissionService.sanitizeText(rawNote, 200) : null,
      },
    });

    if (!member.isGuest) {
      await AchievementService.recordProgress({
        userId: actorId,
        bookmarksDelta: 1,
      }).catch(() => undefined);
    }

    const dto = {
      id: row.id,
      roomCode: code,
      userId: row.userId,
      trackId: row.trackId,
      trackTitle: row.trackTitle,
      trackArtist: row.trackArtist,
      trackCover: row.trackCover,
      positionMs: row.positionMs,
      note: row.note,
      createdAtMs: row.createdAt.getTime(),
    };

    await roomEventService.emit({
      roomCode: code,
      type: 'BOOKMARK_CREATED',
      actorId,
      payload: { bookmark: dto },
      auditAction: 'BOOKMARK_ADDED',
      auditMetadata: { actorName: member.displayName, trackTitle: row.trackTitle },
    });

    return dto;
  }

  static async listBookmarks(roomCode: string) {
    const code = roomCode.trim().toUpperCase();
    const rows = await prisma.togetherBookmark.findMany({
      where: { roomCode: code },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      roomCode: row.roomCode,
      userId: row.userId,
      trackId: row.trackId,
      trackTitle: row.trackTitle,
      trackArtist: row.trackArtist,
      trackCover: row.trackCover,
      positionMs: row.positionMs,
      note: row.note,
      createdAtMs: row.createdAt.getTime(),
    }));
  }

  static async deleteBookmark(roomCode: string, actorId: string, bookmarkId: string) {
    const code = roomCode.trim().toUpperCase();
    const [room, member, bm] = await Promise.all([
      prisma.togetherRoom.findUnique({ where: { code } }),
      prisma.togetherRoomMember.findUnique({
        where: { roomCode_userId: { roomCode: code, userId: actorId } },
      }),
      prisma.togetherBookmark.findUnique({ where: { id: bookmarkId } }),
    ]);
    if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
    if (!bm || bm.roomCode !== code) {
      throw new RoomHttpError(404, 'NOT_FOUND', 'Bookmark not found.');
    }
    if (bm.userId !== actorId) {
      RoomPermissionService.requirePermission(room, member, 'MODERATE_CHAT');
    }

    await prisma.togetherBookmark.delete({ where: { id: bookmarkId } });
    await roomEventService.emit({
      roomCode: code,
      type: 'BOOKMARK_DELETED',
      actorId,
      payload: { id: bookmarkId },
    });
    return { deleted: true, id: bookmarkId };
  }

  // --------------------------------------------------------------------------
  // REACTIONS TIMELINE
  // --------------------------------------------------------------------------
  static async sendReaction(
    roomCode: string,
    actorId: string,
    emoji: string,
    positionMs?: number,
    trackId?: string
  ) {
    const code = roomCode.trim().toUpperCase();
    const cleanEmoji = (emoji || '🔥').trim().slice(0, 12);
    const safeEmoji = ALLOWED_EMOJIS.has(cleanEmoji) ? cleanEmoji : cleanEmoji || '🔥';

    const [room, member] = await Promise.all([
      prisma.togetherRoom.findUnique({ where: { code } }),
      prisma.togetherRoomMember.findUnique({
        where: { roomCode_userId: { roomCode: code, userId: actorId } },
      }),
    ]);
    if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
    if (!member || member.leftAt !== null) {
      throw new RoomHttpError(403, 'NOT_A_MEMBER', 'Not active in room.');
    }

    const activeTrackId = trackId || room.currentTrackId || 'none';
    const pos =
      positionMs !== undefined
        ? Math.max(0, Math.round(positionMs))
        : RoomSessionService.computeLivePositionMs(room);

    const existingCounts =
      room.reactionCounts && typeof room.reactionCounts === 'object'
        ? { ...(room.reactionCounts as Record<string, number>) }
        : {};
    existingCounts[safeEmoji] = (existingCounts[safeEmoji] || 0) + 1;

    await Promise.all([
      prisma.togetherRoom.update({
        where: { code },
        data: { reactionCounts: existingCounts as any },
      }),
      prisma.togetherReaction.create({
        data: {
          roomCode: code,
          userId: actorId,
          trackId: activeTrackId.slice(0, 128),
          positionMs: pos,
          emoji: safeEmoji,
        },
      }),
      RoomAnalyticsService.incrementCounter(code, actorId, 'reactionsSent', 1).catch(
        () => undefined
      ),
    ]);

    // Reward person who queued the currently playing track
    const queue = (Array.isArray(room.queue) ? room.queue : []) as unknown as TogetherQueueItemDTO[];
    const curQ = queue.find((q) => q.trackId === activeTrackId);
    if (curQ && curQ.addedByUserId && curQ.addedByUserId !== actorId) {
      await AchievementService.recordProgress({
        userId: curQ.addedByUserId,
        crowdPleaserDelta: 1,
      }).catch(() => undefined);
    }

    await roomEventService.emit({
      roomCode: code,
      type: 'REACTION_BURST',
      actorId,
      skipPersist: true,
      payload: {
        emoji: safeEmoji,
        userId: actorId,
        username: member.displayName,
        trackId: activeTrackId,
        positionMs: pos,
        reactions: existingCounts,
      },
      legacyFlat: {
        emoji: safeEmoji,
        userId: actorId,
        username: member.displayName,
        reactions: existingCounts,
      },
    });

    return { emoji: safeEmoji, positionMs: pos, reactions: existingCounts };
  }

  static async getReactionTimeline(roomCode: string, trackId?: string) {
    const code = roomCode.trim().toUpperCase();
    const room = await prisma.togetherRoom.findUnique({ where: { code } });
    if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
    const targetTrack = trackId || room.currentTrackId;
    if (!targetTrack) return { trackId: null, moments: [], total: 0 };

    const rows = await prisma.togetherReaction.findMany({
      where: { roomCode: code, trackId: targetTrack },
      orderBy: { positionMs: 'asc' },
      take: 1000,
    });

    const buckets = new Map<number, { count: number; counts: Record<string, number> }>();
    for (const r of rows) {
      const bucketMs = Math.floor(r.positionMs / 2000) * 2000;
      const b = buckets.get(bucketMs) ?? { count: 0, counts: {} };
      b.count++;
      b.counts[r.emoji] = (b.counts[r.emoji] || 0) + 1;
      buckets.set(bucketMs, b);
    }

    const moments = Array.from(buckets.entries()).map(([positionMs, b]) => {
      const topEmoji =
        Object.entries(b.counts).sort((x, y) => y[1] - x[1])[0]?.[0] ?? '🔥';
      return { positionMs, count: b.count, topEmoji, counts: b.counts };
    });

    return { trackId: targetTrack, moments, total: rows.length };
  }

  // --------------------------------------------------------------------------
  // INVITE TOKENS (AES-256-GCM encrypted token + SHA-256 lookup hash)
  // --------------------------------------------------------------------------
  private static getInviteKey(): Buffer {
    return crypto
      .createHash('sha256')
      .update(process.env.JWT_SECRET || 'zenify-together-invite-key')
      .digest();
  }

  private static encryptToken(raw: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.getInviteKey(), iv);
    const enc = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
  }

  private static decryptToken(payload: string): string | null {
    try {
      const [ivHex, tagHex, encHex] = payload.split(':');
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.getInviteKey(),
        Buffer.from(ivHex, 'hex')
      );
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      const dec = Buffer.concat([
        decipher.update(Buffer.from(encHex, 'hex')),
        decipher.final(),
      ]);
      return dec.toString('utf8');
    } catch {
      return null;
    }
  }

  static async createInvite(
    roomCode: string,
    actorId: string,
    opts?: { maxUses?: number | null; expiresInHours?: number | null; expiresInSeconds?: number | null }
  ) {
    const code = roomCode.trim().toUpperCase();
    const [room, member] = await Promise.all([
      prisma.togetherRoom.findUnique({ where: { code } }),
      prisma.togetherRoomMember.findUnique({
        where: { roomCode_userId: { roomCode: code, userId: actorId } },
      }),
    ]);
    if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
    if (!member || member.leftAt !== null) {
      throw new RoomHttpError(403, 'NOT_A_MEMBER', 'Not an active member.');
    }

    if (normalizeInviteMode(room.inviteMode) === 'INVITE_ONLY') {
      RoomPermissionService.requirePermission(room, member, 'APPROVE_JOIN');
    }

    const rawToken = crypto.randomBytes(18).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const tokenEncrypted = this.encryptToken(rawToken);
    const maxUses =
      opts?.maxUses && opts.maxUses > 0 ? Math.min(500, opts.maxUses) : null;
    const ttlMs =
      opts?.expiresInSeconds && opts.expiresInSeconds > 0
        ? Math.min(720 * 3600_000, opts.expiresInSeconds * 1000)
        : opts?.expiresInHours && opts.expiresInHours > 0
          ? Math.min(720, opts.expiresInHours) * 3600_000
          : 24 * 3600_000;
    const expiresAt = new Date(Date.now() + ttlMs);

    const row = await prisma.togetherInvite.create({
      data: {
        roomCode: code,
        createdBy: actorId,
        tokenHash,
        tokenEncrypted,
        maxUses,
        expiresAt,
      },
    });

    const shareUrl = `https://zenify.app/room/${code}?invite=${rawToken}`;

    return {
      id: row.id,
      roomCode: code,
      token: rawToken,
      shareUrl,
      deepLink: `zenify://room/${code}?invite=${rawToken}`,
      maxUses: row.maxUses,
      usesCount: row.usesCount,
      expiresAtMs: row.expiresAt?.getTime() ?? null,
      revokedAtMs: null,
      createdAtMs: row.createdAt.getTime(),
    };
  }

  static async listInvites(roomCode: string, actorId: string) {
    const code = roomCode.trim().toUpperCase();
    const [room, member] = await Promise.all([
      prisma.togetherRoom.findUnique({ where: { code } }),
      prisma.togetherRoomMember.findUnique({
        where: { roomCode_userId: { roomCode: code, userId: actorId } },
      }),
    ]);
    if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
    if (!member || member.leftAt !== null) {
      throw new RoomHttpError(403, 'NOT_A_MEMBER', 'Not an active member.');
    }

    const rows = await prisma.togetherInvite.findMany({
      where: { roomCode: code, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    return rows.map((r) => {
      const rawToken = this.decryptToken(r.tokenEncrypted) || '';
      return {
        id: r.id,
        roomCode: code,
        shareUrl: rawToken
          ? `https://zenify.app/room/${code}?invite=${rawToken}`
          : `https://zenify.app/room/${code}`,
        maxUses: r.maxUses,
        usesCount: r.usesCount,
        expiresAtMs: r.expiresAt?.getTime() ?? null,
        revokedAtMs: r.revokedAt?.getTime() ?? null,
        createdAtMs: r.createdAt.getTime(),
      };
    });
  }

  static async revokeInvite(roomCode: string, actorId: string, inviteId: string) {
    const code = roomCode.trim().toUpperCase();
    const [room, member, inv] = await Promise.all([
      prisma.togetherRoom.findUnique({ where: { code } }),
      prisma.togetherRoomMember.findUnique({
        where: { roomCode_userId: { roomCode: code, userId: actorId } },
      }),
      prisma.togetherInvite.findUnique({ where: { id: inviteId } }),
    ]);
    if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
    if (!inv || inv.roomCode !== code) {
      throw new RoomHttpError(404, 'NOT_FOUND', 'Invite not found.');
    }
    if (inv.createdBy !== actorId) {
      RoomPermissionService.requirePermission(room, member, 'APPROVE_JOIN');
    }
    await prisma.togetherInvite.update({
      where: { id: inviteId },
      data: { revokedAt: new Date() },
    });
    return { revoked: true, id: inviteId };
  }

  static async joinByInviteToken(token: string, actor: ActorIdentity) {
    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const invite = await prisma.togetherInvite.findUnique({ where: { tokenHash } });
    if (
      !invite ||
      invite.revokedAt != null ||
      (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) ||
      (invite.maxUses != null && invite.usesCount >= invite.maxUses)
    ) {
      throw new RoomHttpError(403, 'INVITE_INVALID', 'Invite link is invalid or expired.');
    }
    return RoomSessionService.joinRoom(actor, {
      code: invite.roomCode,
      inviteToken: token.trim(),
    });
  }

  // --------------------------------------------------------------------------
  // CHAT (Reply / Edit <= 15m / Soft Delete / History)
  // --------------------------------------------------------------------------
  static async sendChat(
    roomCode: string,
    actorId: string,
    text: string,
    replyToId?: string | null,
    replyToText?: string | null
  ) {
    const code = roomCode.trim().toUpperCase();
    const clean = RoomPermissionService.sanitizeText(text, 500);
    if (!clean) throw new RoomHttpError(400, 'EMPTY_MESSAGE', 'Message cannot be empty.');

    const [room, member] = await Promise.all([
      prisma.togetherRoom.findUnique({ where: { code } }),
      prisma.togetherRoomMember.findUnique({
        where: { roomCode_userId: { roomCode: code, userId: actorId } },
      }),
    ]);
    if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
    if (!member || member.leftAt !== null) {
      throw new RoomHttpError(403, 'NOT_A_MEMBER', 'Not an active member.');
    }

    let resolvedReplyText = replyToText
      ? RoomPermissionService.sanitizeText(replyToText, 140)
      : null;
    if (replyToId && !resolvedReplyText) {
      const parent = await prisma.togetherChatMessage.findUnique({ where: { id: replyToId } });
      if (parent && parent.roomCode === code && !parent.deletedAt) {
        resolvedReplyText = parent.text.slice(0, 140);
      }
    }

    const row = await prisma.togetherChatMessage.create({
      data: {
        roomCode: code,
        userId: actorId,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
        text: clean,
        replyToId: replyToId || null,
        replyToText: resolvedReplyText,
      },
    });

    await RoomAnalyticsService.incrementCounter(code, actorId, 'chatMessagesSent', 1).catch(
      () => undefined
    );

    const msgDto = {
      id: row.id,
      userId: row.userId,
      username: row.displayName,
      avatar: row.avatarUrl,
      text: row.text,
      replyToId: row.replyToId,
      replyToText: row.replyToText,
      editedAtMs: null,
      timestamp: row.createdAt.getTime(),
    };

    await roomEventService.emit({
      roomCode: code,
      type: 'CHAT_MESSAGE',
      actorId,
      skipPersist: true,
      payload: { message: msgDto },
      legacyFlat: { message: msgDto },
    });

    return msgDto;
  }

  static async editChat(roomCode: string, actorId: string, msgId: string, newText: string) {
    const code = roomCode.trim().toUpperCase();
    const clean = RoomPermissionService.sanitizeText(newText, 500);
    if (!clean) throw new RoomHttpError(400, 'EMPTY_MESSAGE', 'Message cannot be empty.');

    const msg = await prisma.togetherChatMessage.findUnique({ where: { id: msgId } });
    if (!msg || msg.roomCode !== code || msg.deletedAt) {
      throw new RoomHttpError(404, 'MESSAGE_NOT_FOUND', 'Message not found.');
    }
    if (msg.userId !== actorId) {
      throw new RoomHttpError(403, 'FORBIDDEN', 'You can only edit your own messages.');
    }
    if (Date.now() - msg.createdAt.getTime() > 15 * 60_000) {
      throw new RoomHttpError(403, 'EDIT_WINDOW_EXPIRED', 'Messages can only be edited within 15 minutes.');
    }

    const now = new Date();
    const updated = await prisma.togetherChatMessage.update({
      where: { id: msgId },
      data: { text: clean, editedAt: now },
    });

    await roomEventService.emit({
      roomCode: code,
      type: 'CHAT_MESSAGE_EDITED',
      actorId,
      payload: {
        id: msgId,
        text: updated.text,
        editedAtMs: now.getTime(),
      },
    });

    return { id: msgId, text: updated.text, editedAtMs: now.getTime() };
  }

  static async deleteChat(roomCode: string, actorId: string, msgId: string) {
    const code = roomCode.trim().toUpperCase();
    const [room, member, msg] = await Promise.all([
      prisma.togetherRoom.findUnique({ where: { code } }),
      prisma.togetherRoomMember.findUnique({
        where: { roomCode_userId: { roomCode: code, userId: actorId } },
      }),
      prisma.togetherChatMessage.findUnique({ where: { id: msgId } }),
    ]);
    if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
    if (!msg || msg.roomCode !== code || msg.deletedAt) {
      throw new RoomHttpError(404, 'MESSAGE_NOT_FOUND', 'Message not found.');
    }
    if (msg.userId !== actorId) {
      RoomPermissionService.requirePermission(room, member, 'MODERATE_CHAT');
    }

    await prisma.togetherChatMessage.update({
      where: { id: msgId },
      data: { deletedAt: new Date(), deletedBy: actorId },
    });

    await roomEventService.emit({
      roomCode: code,
      type: 'CHAT_MESSAGE_DELETED',
      actorId,
      payload: { id: msgId },
    });

    return { id: msgId, deleted: true };
  }

  // --------------------------------------------------------------------------
  // THEME & DJ SETTINGS & ANNOUNCEMENTS
  // --------------------------------------------------------------------------
  static async updateTheme(
    roomCode: string,
    actorId: string,
    patch: {
      presetId?: string;
      accentHex?: string | null;
      useArtwork?: boolean;
      animateBackground?: boolean;
      bgUrl?: string | null;
    }
  ) {
    const code = roomCode.trim().toUpperCase();
    const [room, actor] = await Promise.all([
      prisma.togetherRoom.findUnique({ where: { code } }),
      prisma.togetherRoomMember.findUnique({
        where: { roomCode_userId: { roomCode: code, userId: actorId } },
      }),
    ]);
    if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
    RoomPermissionService.requirePermission(room, actor, 'EDIT_CONFIG');

    const presetId = patch.useArtwork
      ? 'ARTWORK'
      : RoomPermissionService.sanitizeText(patch.presetId || room.themePreset || 'MIDNIGHT', 32).toUpperCase();
    const accentHex =
      patch.accentHex !== undefined
        ? RoomPermissionService.validateHexColor(patch.accentHex)
        : room.themeAccentHex;
    const bgUrl =
      patch.bgUrl !== undefined ? RoomPermissionService.validateSafeUrl(patch.bgUrl) : room.themeBgUrl;

    await prisma.togetherRoom.update({
      where: { code },
      data: {
        themePreset: presetId,
        themeAccentHex: accentHex,
        themeBgUrl: bgUrl,
      },
    });

    const theme = {
      presetId,
      accentHex,
      useArtwork: presetId === 'ARTWORK',
      animateBackground: patch.animateBackground ?? true,
      bgUrl,
    };

    await roomEventService.emit({
      roomCode: code,
      type: 'THEME_CHANGED',
      actorId,
      payload: { theme },
      auditAction: 'THEME_CHANGED',
      auditMetadata: { actorName: actor?.displayName, presetId },
    });

    return theme;
  }

  static async updateDjSettings(
    roomCode: string,
    actorId: string,
    patch: {
      requestMode?: string;
      requestLimit?: number;
      requestMaxPerUser?: number;
      queueLocked?: boolean;
      playbackRate?: number;
      gapless?: boolean;
      crossfade?: boolean;
      transitionSeconds?: number;
      preloadNext?: boolean;
    }
  ) {
    const code = roomCode.trim().toUpperCase();
    const [room, actor] = await Promise.all([
      prisma.togetherRoom.findUnique({ where: { code } }),
      prisma.togetherRoomMember.findUnique({
        where: { roomCode_userId: { roomCode: code, userId: actorId } },
      }),
    ]);
    if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
    RoomPermissionService.requirePermission(room, actor, 'EDIT_CONFIG');

    const requestMode =
      patch.requestMode !== undefined
        ? normalizeRequestMode(patch.requestMode)
        : normalizeRequestMode(room.requestMode);
    const rawLimit = patch.requestLimit ?? patch.requestMaxPerUser;
    const requestMaxPerUser =
      rawLimit !== undefined
        ? Math.max(1, Math.min(20, Number(rawLimit) || 3))
        : room.requestMaxPerUser;
    const queueLocked =
      patch.queueLocked !== undefined ? Boolean(patch.queueLocked) : room.queueLocked;
    const playbackRate =
      patch.playbackRate !== undefined
        ? Math.max(0.5, Math.min(2.0, Number(patch.playbackRate) || 1.0))
        : room.playbackRate;

    const existingExtra = (await roomStore.getJson<any>(`dj_extra:${code}`)) || {};
    const extra = {
      gapless: patch.gapless !== undefined ? Boolean(patch.gapless) : (existingExtra.gapless ?? true),
      crossfade: patch.crossfade !== undefined ? Boolean(patch.crossfade) : (existingExtra.crossfade ?? false),
      transitionSeconds:
        patch.transitionSeconds !== undefined
          ? Math.max(1, Math.min(12, Number(patch.transitionSeconds) || 4))
          : (existingExtra.transitionSeconds ?? 4),
      preloadNext: patch.preloadNext !== undefined ? Boolean(patch.preloadNext) : (existingExtra.preloadNext ?? true),
    };
    await roomStore.setJson(`dj_extra:${code}`, extra, 86400 * 7);

    await prisma.togetherRoom.update({
      where: { code },
      data: { requestMode, requestMaxPerUser, queueLocked, playbackRate },
    });

    const djSettings = {
      requestMode,
      requestLimit: requestMaxPerUser,
      requestMaxPerUser,
      queueLocked,
      playbackRate,
      ...extra,
      announceText: room.announceText,
      announceUntilMs: room.announceUntilMs ? Number(room.announceUntilMs) : null,
    };

    await roomEventService.emit({
      roomCode: code,
      type: 'DJ_SETTINGS_CHANGED',
      actorId,
      payload: { djSettings },
    });

    return djSettings;
  }

  static async postAnnouncement(
    roomCode: string,
    actorId: string,
    text: string,
    durationMinutes = 30
  ) {
    const code = roomCode.trim().toUpperCase();
    const [room, actor] = await Promise.all([
      prisma.togetherRoom.findUnique({ where: { code } }),
      prisma.togetherRoomMember.findUnique({
        where: { roomCode_userId: { roomCode: code, userId: actorId } },
      }),
    ]);
    if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
    RoomPermissionService.requirePermission(room, actor, 'PIN_ANNOUNCEMENT');

    const clean = RoomPermissionService.sanitizeText(text || '', 240);
    const untilMs = clean
      ? BigInt(Date.now() + Math.max(1, Math.min(1440, durationMinutes || 30)) * 60_000)
      : null;

    await prisma.togetherRoom.update({
      where: { code },
      data: { announceText: clean || null, announceUntilMs: untilMs },
    });

    await roomEventService.emit({
      roomCode: code,
      type: 'ANNOUNCEMENT_POSTED',
      actorId,
      payload: {
        text: clean || null,
        untilMs: untilMs ? Number(untilMs) : null,
      },
      auditAction: clean ? 'ANNOUNCE' : undefined,
      auditMetadata: clean ? { actorName: actor?.displayName } : undefined,
    });

    return { text: clean || null, untilMs: untilMs ? Number(untilMs) : null };
  }

  // --------------------------------------------------------------------------
  // RECOMMENDATIONS (InnerTube + Existing Catalog; NO Fake Data, NO 30s Previews)
  // --------------------------------------------------------------------------
  static async getRecommendations(
    roomCode: string,
    userId: string,
    seedOverride?: { trackId?: string; title?: string; artist?: string }
  ) {
    const code = roomCode.trim().toUpperCase();
    const room = await prisma.togetherRoom.findUnique({ where: { code } });
    if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');

    const queue = (Array.isArray(room.queue) ? room.queue : []) as unknown as TogetherQueueItemDTO[];
    const cur = (room.currentTrack as any) || queue[0]?.track || null;
    const seedTitle = (seedOverride?.title || cur?.title || '').trim();
    const seedArtist = (seedOverride?.artist || cur?.artist || '').trim();
    const seedTrackId = (seedOverride?.trackId || room.currentTrackId || cur?.id || '').trim();

    const cacheKey = `room_recs:${code}:${seedTrackId}:${userId}`;
    const cached = await roomStore.getJson<any>(cacheKey);
    if (cached) return cached;

    const excludeTrackIds = new Set<string>();
    if (room.currentTrackId) excludeTrackIds.add(room.currentTrackId);
    for (const q of queue) {
      if (q.trackId) excludeTrackIds.add(q.trackId);
    }

    // Respect user's negative feedback
    const dislikes = userId.startsWith('guest_')
      ? []
      : await prisma.togetherRecFeedback.findMany({
          where: { userId, action: 'dislike' },
          select: { recTrackId: true },
          take: 100,
        });
    for (const d of dislikes) excludeTrackIds.add(d.recTrackId);

    const registerItem = async (rawTrack: any, reason: string) => {
      const sanitized = sanitizeTrackDTO({
        id: String(rawTrack.id || rawTrack.videoId || `yt-${crypto.randomBytes(5).toString('hex')}`),
        title: rawTrack.title || rawTrack.name,
        artist: rawTrack.artist?.name || rawTrack.artistName || rawTrack.artist || 'Unknown Artist',
        album: rawTrack.album?.title || rawTrack.collectionName || rawTrack.album || null,
        coverUrl:
          rawTrack.coverUrl ||
          rawTrack.artworkUrl ||
          rawTrack.artwork ||
          rawTrack.thumbnail ||
          null,
        durationSeconds:
          Number(rawTrack.durationSeconds ?? rawTrack.duration ?? 0) ||
          (rawTrack.duration_ms ? Math.round(rawTrack.duration_ms / 1000) : 180),
        youtubeId: rawTrack.youtubeId || rawTrack.videoId || undefined,
        streamUrl: rawTrack.audioUrl || rawTrack.streamUrl || null,
        source: rawTrack.source || 'youtube',
      });

      const recId = `rec_${crypto.randomBytes(6).toString('hex')}`;
      await roomStore.setJson(`rec_item:${recId}`, { track: sanitized, seedTrackId }, 3600);

      return {
        id: recId,
        trackId: sanitized.id,
        title: sanitized.title,
        artist: sanitized.artist,
        coverUrl: sanitized.coverUrl ?? '',
        durationSeconds: sanitized.durationSeconds ?? 180,
        reason,
        track: sanitized,
      };
    };

    const filterAndDedupe = (items: any[]) => {
      const seen = new Set<string>();
      const out: any[] = [];
      for (const it of items) {
        const id = String(it?.id || it?.videoId || '');
        const title = String(it?.title || it?.name || '').trim();
        if (!id || !title) continue;
        if (excludeTrackIds.has(id)) continue;
        const key = `${title.toLowerCase()}::${String(it.artist?.name || it.artistName || it.artist || '').toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(it);
      }
      return out;
    };

    // 1. Vibe / Radio recommendations (existing RecommendationsService + InnerTube)
    const [vibeCandidates, artistInnertube, trendingYt] = await Promise.all([
      seedTrackId
        ? RecommendationsService.buildRadioQueue(
            userId.startsWith('guest_') ? undefined : userId,
            { type: 'track', id: seedTrackId },
            12,
            { title: seedTitle, artist: seedArtist, excludeIds: excludeTrackIds }
          ).catch(() => [])
        : Promise.resolve([]),
      seedArtist
        ? ExternalMetadataService.searchYoutubeMusicInnertube(`${seedArtist} songs`).catch(() => [])
        : seedTitle
          ? ExternalMetadataService.searchYoutubeMusicInnertube(seedTitle).catch(() => [])
          : Promise.resolve([]),
      ExternalMetadataService.fetchYoutubeMusicExploreTrending().catch(() => []),
    ]);

    const section1Raw = filterAndDedupe(vibeCandidates).slice(0, 8);
    const section2Raw = filterAndDedupe(artistInnertube).slice(0, 8);
    const section3Raw = filterAndDedupe(trendingYt).slice(0, 8);

    const sections: Array<{ id: string; title: string; items: any[] }> = [];

    if (section1Raw.length > 0) {
      sections.push({
        id: 'similar_vibe',
        title: seedTitle ? `Because of ${seedTitle}` : 'Similar Vibe',
        items: await Promise.all(
          section1Raw.map((t) => registerItem(t, 'Matches the room vibe'))
        ),
      });
    }

    if (section2Raw.length > 0) {
      sections.push({
        id: 'artist_innertube',
        title: seedArtist ? `More from ${seedArtist}` : 'In This Style',
        items: await Promise.all(
          section2Raw.map((t) => registerItem(t, seedArtist ? `By ${seedArtist}` : 'Related song'))
        ),
      });
    }

    if (section3Raw.length > 0) {
      sections.push({
        id: 'trending_now',
        title: 'Trending Right Now',
        items: await Promise.all(section3Raw.map((t) => registerItem(t, 'Popular on Zenify'))),
      });
    }

    const payload = { seedTrackId, seedTitle, seedArtist, sections };
    if (sections.length > 0) {
      await roomStore.setJson(cacheKey, payload, 120);
    }
    return payload;
  }

  static async addRecommendationToRoom(roomCode: string, actorId: string, recId: string) {
    const cached = await roomStore.getJson<{ track: any; seedTrackId?: string }>(
      `rec_item:${recId}`
    );
    if (!cached?.track) {
      throw new RoomHttpError(
        404,
        'REC_EXPIRED',
        'Recommendation expired. Refresh suggestions and try again.'
      );
    }

    await prisma.togetherRecFeedback
      .create({
        data: {
          userId: actorId,
          roomCode: roomCode.trim().toUpperCase(),
          seedTrackId: cached.seedTrackId || 'none',
          recTrackId: cached.track.id,
          action: 'add',
        },
      })
      .catch(() => undefined);

    return QueueManagementService.addTrack(roomCode, actorId, cached.track);
  }

  static async submitRecFeedback(
    roomCode: string,
    actorId: string,
    recIdOrTrackId: string,
    action: 'like' | 'dislike' | 'skip'
  ) {
    const cached = await roomStore.getJson<{ track: any; seedTrackId?: string }>(
      `rec_item:${recIdOrTrackId}`
    );
    const recTrackId = cached?.track?.id || recIdOrTrackId;
    const seedTrackId = cached?.seedTrackId || 'room';

    await prisma.togetherRecFeedback.create({
      data: {
        userId: actorId,
        roomCode: roomCode.trim().toUpperCase(),
        seedTrackId,
        recTrackId,
        action,
      },
    });

    return { ok: true, action };
  }
}
