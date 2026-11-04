import crypto from 'crypto';
import { prisma } from '../utils/prisma';

export interface BlendedTrackItem {
  id: string;
  title: string;
  artist: string;
  coverUrl?: string;
  audioUrl?: string;
  duration?: number;
  genre?: string;
  album?: string;
  addedBy: 'userA' | 'userB' | 'shared';
}

const SLIM_TRACK_SELECT = {
  id: true,
  title: true,
  coverUrl: true,
  audioUrl: true,
  duration: true,
  genre: true,
  artist: {
    select: { id: true, name: true, imageUrl: true },
  },
  album: {
    select: { id: true, title: true, coverUrl: true },
  },
};

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim().toLowerCase()).digest('hex');
}

export class BlendEngineService {
  /**
   * Create a new pending blend session with a secure 128-bit invite token
   */
  static async createInvite(userId: string) {
    const rawToken = crypto.randomBytes(16).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const session = await prisma.blendSession.create({
      data: {
        userAId: userId,
        inviteTokenHash: tokenHash,
        status: 'PENDING',
        expiresAt,
      },
    });

    return {
      sessionId: session.id,
      token: rawToken,
      expiresAt: session.expiresAt,
    };
  }

  /**
   * Join an existing blend session using the invite token
   */
  static async joinInvite(userId: string, rawToken: string) {
    const tokenHash = hashToken(rawToken);

    const session = await prisma.blendSession.findUnique({
      where: { inviteTokenHash: tokenHash },
    });

    if (!session) {
      throw new Error('Invalid invite link or token.');
    }

    if (session.status !== 'PENDING') {
      throw new Error('This Blend invite has already been used.');
    }

    if (new Date() > new Date(session.expiresAt)) {
      throw new Error('This Blend invite has expired.');
    }

    if (session.userAId === userId) {
      throw new Error('You cannot blend with yourself.');
    }

    // Activate session
    const updated = await prisma.blendSession.update({
      where: { id: session.id },
      data: {
        userBId: userId,
        status: 'ACTIVE',
      },
    });

    // Compute initial blend playlist
    const snapshot = await this.computeBlend(updated.id);

    return {
      sessionId: updated.id,
      status: updated.status,
      snapshot,
    };
  }

  /**
   * Compute/recompute taste match score and 50-track interleaved playlist
   */
  static async computeBlend(sessionId: string) {
    const session = await prisma.blendSession.findUnique({
      where: { id: sessionId },
      include: {
        userA: {
          select: { id: true, name: true, username: true, avatarUrl: true },
        },
        userB: {
          select: { id: true, name: true, username: true, avatarUrl: true },
        },
      },
    });

    if (!session || !session.userBId) {
      throw new Error('Blend session not found or inactive.');
    }

    const userAId = session.userAId;
    const userBId = session.userBId;

    // 1. Fetch artist affinities for both users
    const [affinitiesA, affinitiesB] = await Promise.all([
      prisma.userAffinity.findMany({
        where: { userId: userAId, kind: 'artist' },
      }),
      prisma.userAffinity.findMany({
        where: { userId: userBId, kind: 'artist' },
      }),
    ]);

    const mapA = new Map<string, number>();
    const mapB = new Map<string, number>();
    for (const a of affinitiesA) mapA.set(a.key.toLowerCase(), a.score);
    for (const b of affinitiesB) mapB.set(b.key.toLowerCase(), b.score);

    // 2. Cosine similarity calculation
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (const [k, v] of mapA.entries()) {
      normA += v * v;
      if (mapB.has(k)) {
        dot += v * (mapB.get(k) || 0);
      }
    }
    for (const [, v] of mapB.entries()) {
      normB += v * v;
    }

    let matchScore = 72.0; // Warm fallback default
    if (normA > 0 && normB > 0) {
      const cosine = dot / (Math.sqrt(normA) * Math.sqrt(normB));
      matchScore = Math.min(98, Math.max(45, Math.round(cosine * 100)));
    }

    // Shared artists list (intersection)
    const sharedArtists: string[] = [];
    for (const k of mapA.keys()) {
      if (mapB.has(k)) {
        sharedArtists.push(k);
      }
    }

    // 3. Collect track pools
    const [listensA, listensB, likesA, likesB] = await Promise.all([
      prisma.listenEvent.findMany({
        where: { userId: userAId, completed: true },
        select: { trackId: true },
        distinct: ['trackId'],
        take: 30,
      }),
      prisma.listenEvent.findMany({
        where: { userId: userBId, completed: true },
        select: { trackId: true },
        distinct: ['trackId'],
        take: 30,
      }),
      prisma.like.findMany({
        where: { userId: userAId },
        select: { trackId: true },
        take: 30,
      }),
      prisma.like.findMany({
        where: { userId: userBId },
        select: { trackId: true },
        take: 30,
      }),
    ]);

    const trackPoolA = Array.from(new Set([...listensA.map((l) => l.trackId), ...likesA.map((l) => l.trackId)]));
    const trackPoolB = Array.from(new Set([...listensB.map((l) => l.trackId), ...likesB.map((l) => l.trackId)]));

    // Mutual favorite track IDs
    const setB = new Set(trackPoolB);
    const mutualIds = trackPoolA.filter((id) => setB.has(id));
    const uniqueAIds = trackPoolA.filter((id) => !setB.has(id));
    const uniqueBIds = trackPoolB.filter((id) => !new Set(trackPoolA).has(id));

    // Fetch track records
    const allIds = Array.from(new Set([...mutualIds, ...uniqueAIds, ...uniqueBIds]));
    const fetchedTracks = await prisma.track.findMany({
      where: {
        id: { in: allIds },
        deletedAt: null,
        audioUrl: { not: '' },
      },
      select: SLIM_TRACK_SELECT,
    });

    const trackMap = new Map<string, any>();
    for (const t of fetchedTracks) trackMap.set(t.id, t);

    // Build 50-track interleaved playlist
    const blended: BlendedTrackItem[] = [];
    const usedIds = new Set<string>();

    const pushTrack = (t: any, addedBy: 'userA' | 'userB' | 'shared') => {
      if (!t || usedIds.has(t.id) || blended.length >= 50) return;
      usedIds.add(t.id);
      blended.push({
        id: t.id,
        title: t.title,
        artist: t.artist?.name || 'Unknown Artist',
        coverUrl: t.coverUrl || t.album?.coverUrl || undefined,
        audioUrl: t.audioUrl || undefined,
        duration: t.duration || undefined,
        genre: t.genre || undefined,
        album: t.album?.title || undefined,
        addedBy,
      });
    };

    // Interleave: 1 shared, 1 User A, 1 User B
    const maxLen = Math.max(mutualIds.length, uniqueAIds.length, uniqueBIds.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < mutualIds.length) pushTrack(trackMap.get(mutualIds[i]), 'shared');
      if (i < uniqueAIds.length) pushTrack(trackMap.get(uniqueAIds[i]), 'userA');
      if (i < uniqueBIds.length) pushTrack(trackMap.get(uniqueBIds[i]), 'userB');
    }

    // Pad if < 50 tracks
    if (blended.length < 50) {
      const needed = 50 - blended.length;
      const catalogPad = await prisma.track.findMany({
        where: {
          deletedAt: null,
          audioUrl: { not: '' },
          id: { notIn: Array.from(usedIds) },
        },
        orderBy: [{ engagement_score: 'desc' }, { streams: 'desc' }],
        select: SLIM_TRACK_SELECT,
        take: needed,
      });

      for (const t of catalogPad) {
        pushTrack(t, 'shared');
      }
    }

    // Upsert snapshot
    const snapshot = await prisma.blendSnapshot.upsert({
      where: { sessionId },
      update: {
        tracks: blended as any,
        matchScore,
        sharedArtists: sharedArtists as any,
        generatedAt: new Date(),
      },
      create: {
        sessionId,
        tracks: blended as any,
        matchScore,
        sharedArtists: sharedArtists as any,
        generatedAt: new Date(),
      },
    });

    return {
      sessionId,
      matchScore,
      sharedArtists,
      tracks: blended,
      generatedAt: snapshot.generatedAt,
    };
  }

  /**
   * Get all active blend sessions for a user
   */
  static async getUserBlends(userId: string) {
    const sessions = await prisma.blendSession.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
        status: 'ACTIVE',
      },
      include: {
        userA: {
          select: { id: true, name: true, username: true, avatarUrl: true },
        },
        userB: {
          select: { id: true, name: true, username: true, avatarUrl: true },
        },
        snapshot: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return sessions.map((s) => {
      const isUserA = s.userAId === userId;
      const partner = isUserA ? s.userB : s.userA;
      return {
        id: s.id,
        status: s.status,
        partner: partner || { name: 'Friend', username: 'friend' },
        matchScore: s.snapshot?.matchScore || 70,
        trackCount: Array.isArray(s.snapshot?.tracks) ? (s.snapshot.tracks as any[]).length : 0,
        updatedAt: s.updatedAt,
      };
    });
  }

  /**
   * Get specific blend session details and tracks
   */
  static async getBlendDetails(userId: string, sessionId: string) {
    const session = await prisma.blendSession.findUnique({
      where: { id: sessionId },
      include: {
        userA: {
          select: { id: true, name: true, username: true, avatarUrl: true },
        },
        userB: {
          select: { id: true, name: true, username: true, avatarUrl: true },
        },
        snapshot: true,
      },
    });

    if (!session) {
      throw new Error('Blend not found.');
    }

    if (session.userAId !== userId && session.userBId !== userId) {
      throw new Error('Unauthorized to view this Blend.');
    }

    const isUserA = session.userAId === userId;
    const partner = isUserA ? session.userB : session.userA;
    const currentUser = isUserA ? session.userA : session.userB;

    let snapshot = session.snapshot;
    if (!snapshot) {
      const computed = await this.computeBlend(sessionId);
      snapshot = computed as any;
    }

    return {
      id: session.id,
      status: session.status,
      currentUser,
      partner: partner || { name: 'Friend' },
      matchScore: snapshot?.matchScore || 70,
      sharedArtists: snapshot?.sharedArtists || [],
      tracks: snapshot?.tracks || [],
      updatedAt: session.updatedAt,
    };
  }

  /**
   * Leave / delete a blend session
   */
  static async leaveBlend(userId: string, sessionId: string) {
    const session = await prisma.blendSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) return { success: true };

    if (session.userAId !== userId && session.userBId !== userId) {
      throw new Error('Unauthorized to leave this Blend.');
    }

    await prisma.blendSession.delete({
      where: { id: sessionId },
    });

    return { success: true };
  }
}

