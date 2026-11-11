import { prisma } from '../../utils/prisma';
import { AchievementService } from './achievement.service';
import { roomEventService } from './room-event.service';
import { RoomHttpError, TogetherQueueItemDTO } from './room-types';

function sanitizeTimezone(tz?: string | null): string {
  if (!tz) return 'UTC';
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

export class RoomAnalyticsService {
  static async ensureSessionStarted(
    roomCode: string,
    userId: string,
    isGuest: boolean
  ): Promise<void> {
    const code = roomCode.toUpperCase();
    const active = await prisma.togetherUserSession.findFirst({
      where: { roomCode: code, userId, leftAt: null },
    });
    if (active) return;

    await prisma.togetherUserSession.create({
      data: { roomCode: code, userId, isGuest },
    });

    if (!isGuest) {
      await AchievementService.recordProgress({ userId, isGuest, roomsDelta: 1 }).catch(
        () => undefined
      );
    }
  }

  static async closeSession(roomCode: string, userId: string): Promise<void> {
    const code = roomCode.toUpperCase();
    await prisma.togetherUserSession.updateMany({
      where: { roomCode: code, userId, leftAt: null },
      data: { leftAt: new Date() },
    });
  }

  static async incrementCounter(
    roomCode: string,
    userId: string,
    field:
      | 'songsAdded'
      | 'reactionsSent'
      | 'chatMessagesSent'
      | 'skipsTriggered'
      | 'tracksPlayed',
    delta = 1
  ): Promise<void> {
    const code = roomCode.toUpperCase();
    const session = await prisma.togetherUserSession.findFirst({
      where: { roomCode: code, userId },
      orderBy: { joinedAt: 'desc' },
    });
    if (session) {
      await prisma.togetherUserSession.update({
        where: { id: session.id },
        data: { [field]: { increment: delta } },
      });
    }
  }

  static async recordTrackPlay(
    roomCode: string,
    track: { id: string; title: string; artist: string; coverUrl?: string | null },
    activeMemberIds: Array<{ userId: string; isGuest: boolean }>,
    addedByUserId?: string
  ): Promise<void> {
    const code = roomCode.toUpperCase();
    const nonGuests = activeMemberIds.filter(
      (m) => !m.isGuest && !m.userId.startsWith('guest_')
    );
    if (nonGuests.length === 0) return;

    const privRows = await prisma.userRoomPrivacy.findMany({
      where: { userId: { in: nonGuests.map((m) => m.userId) } },
    });
    const privMap = new Map(privRows.map((p) => [p.userId, p]));

    for (const m of nonGuests) {
      const priv = privMap.get(m.userId);
      if (priv && !priv.showInRoomHistory) continue;

      await prisma.togetherUserTrack.create({
        data: {
          userId: m.userId,
          roomCode: code,
          trackId: track.id,
          title: track.title.slice(0, 255),
          artist: track.artist.slice(0, 255),
          coverUrl: track.coverUrl ?? null,
        },
      });

      await this.incrementCounter(code, m.userId, 'tracksPlayed', 1);
      await AchievementService.recordProgress({
        userId: m.userId,
        tracksPlayedDelta: 1,
      }).catch(() => undefined);
    }

    if (addedByUserId && !addedByUserId.startsWith('guest_')) {
      await AchievementService.recordProgress({
        userId: addedByUserId,
        tastemakerDelta: 1,
      }).catch(() => undefined);
    }
  }

  /**
   * Called periodically (e.g. every 15s) by scheduler for active rooms that are playing.
   */
  static async tickActiveRoomSeconds(
    roomCode: string,
    hostId: string,
    isPlaying: boolean,
    activeMembers: Array<{ userId: string; role: string; isGuest: boolean }>,
    secondsElapsed: number
  ): Promise<void> {
    const code = roomCode.toUpperCase();
    const hourUtc = new Date().getUTCHours();
    const isNightHour = hourUtc >= 0 && hourUtc < 5;

    for (const m of activeMembers) {
      await prisma.togetherRoleTime.upsert({
        where: { userId_roomCode_role: { userId: m.userId, roomCode: code, role: m.role } },
        create: {
          userId: m.userId,
          roomCode: code,
          role: m.role,
          seconds: secondsElapsed,
        },
        update: { seconds: { increment: secondsElapsed } },
      });

      if (isPlaying) {
        const sess = await prisma.togetherUserSession.findFirst({
          where: { roomCode: code, userId: m.userId, leftAt: null },
        });
        if (sess) {
          await prisma.togetherUserSession.update({
            where: { id: sess.id },
            data: {
              listeningSeconds: { increment: secondsElapsed },
              hostMinutes:
                m.userId === hostId && activeMembers.length >= 3
                  ? { increment: Math.max(0, Math.round(secondsElapsed / 60)) }
                  : undefined,
            },
          });
        }

        if (!m.isGuest && !m.userId.startsWith('guest_')) {
          await AchievementService.recordProgress({
            userId: m.userId,
            listeningSecondsDelta: secondsElapsed,
            nightListeningSecondsDelta: isNightHour ? secondsElapsed : 0,
          }).catch(() => undefined);
        }
      }
    }

    if (isPlaying) {
      await prisma.togetherRoom.update({
        where: { code },
        data: { totalDurationPlayedMs: { increment: BigInt(secondsElapsed * 1000) } },
      }).catch(() => undefined);
    }
  }

  static async getPrivacy(userId: string) {
    const row = await prisma.userRoomPrivacy.findUnique({ where: { userId } });
    return {
      shareListeningStats: row?.shareListeningStats ?? true,
      showInRoomHistory: row?.showInRoomHistory ?? true,
    };
  }

  static async updatePrivacy(
    userId: string,
    patch: { shareListeningStats?: boolean; showInRoomHistory?: boolean }
  ) {
    const updated = await prisma.userRoomPrivacy.upsert({
      where: { userId },
      create: {
        userId,
        shareListeningStats: patch.shareListeningStats ?? true,
        showInRoomHistory: patch.showInRoomHistory ?? true,
      },
      update: {
        ...(patch.shareListeningStats !== undefined
          ? { shareListeningStats: patch.shareListeningStats }
          : {}),
        ...(patch.showInRoomHistory !== undefined
          ? { showInRoomHistory: patch.showInRoomHistory }
          : {}),
      },
    });
    return {
      shareListeningStats: updated.shareListeningStats,
      showInRoomHistory: updated.showInRoomHistory,
    };
  }

  static async deleteUserHistory(userId: string): Promise<void> {
    await prisma.$transaction([
      prisma.togetherUserTrack.deleteMany({ where: { userId } }),
      prisma.togetherUserSession.deleteMany({ where: { userId } }),
      prisma.togetherRoleTime.deleteMany({ where: { userId } }),
      prisma.togetherBookmark.deleteMany({ where: { userId } }),
    ]);
  }

  static async getInsights(userId: string, range: string, timezone?: string | null) {
    if (!userId || userId.startsWith('guest_')) {
      throw new RoomHttpError(401, 'AUTH_REQUIRED', 'Sign in to view listening insights.');
    }

    const tz = sanitizeTimezone(timezone);
    const now = Date.now();
    const since =
      range === 'week'
        ? new Date(now - 7 * 86400_000)
        : range === 'month'
          ? new Date(now - 30 * 86400_000)
          : new Date(0);

    const [sessions, roleTimes, tracks, privacy, bookmarksCount] = await Promise.all([
      prisma.togetherUserSession.findMany({
        where: { userId, joinedAt: { gte: since } },
        orderBy: { joinedAt: 'desc' },
        take: 200,
      }),
      prisma.togetherRoleTime.findMany({ where: { userId } }),
      prisma.togetherUserTrack.findMany({
        where: { userId, playedAt: { gte: since } },
        orderBy: { playedAt: 'desc' },
        take: 500,
      }),
      this.getPrivacy(userId),
      prisma.togetherBookmark.count({ where: { userId, createdAt: { gte: since } } }),
    ]);

    const totalSec = sessions.reduce((a, s) => a + s.listeningSeconds, 0);
    const tracksPlayed = tracks.length || sessions.reduce((a, s) => a + s.tracksPlayed, 0);
    const distinctRooms = new Set(sessions.map((s) => s.roomCode));
    const reactionsSent = sessions.reduce((a, s) => a + s.reactionsSent, 0);
    const songsAdded = sessions.reduce((a, s) => a + s.songsAdded, 0);

    // Role breakdown
    const roleTotals: Record<string, number> = {};
    for (const r of roleTimes) {
      roleTotals[r.role] = (roleTotals[r.role] || 0) + r.seconds;
    }
    const topRoleEntry = Object.entries(roleTotals).sort((a, b) => b[1] - a[1])[0];

    // Daily listening trend in user's timezone
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const hourFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    });
    const dayBuckets: Record<string, number> = {};
    const hourCounts: Record<number, number> = {};
    for (const s of sessions) {
      const d = fmt.format(s.joinedAt);
      dayBuckets[d] = (dayBuckets[d] || 0) + Math.round(s.listeningSeconds / 60);
      const h = parseInt(hourFmt.format(s.joinedAt), 10) % 24;
      hourCounts[h] = (hourCounts[h] || 0) + s.listeningSeconds;
    }
    const peakHourEntry = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];

    // Top tracks & artists
    const trackCounts = new Map<
      string,
      { trackId: string; title: string; artist: string; coverUrl: string | null; count: number }
    >();
    const artistCounts = new Map<string, number>();
    for (const t of tracks) {
      const existing = trackCounts.get(t.trackId);
      if (existing) {
        existing.count++;
      } else {
        trackCounts.set(t.trackId, {
          trackId: t.trackId,
          title: t.title,
          artist: t.artist,
          coverUrl: t.coverUrl,
          count: 1,
        });
      }
      artistCounts.set(t.artist, (artistCounts.get(t.artist) || 0) + 1);
    }

    const topTracks = Array.from(trackCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    const topArtists = Array.from(artistCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, plays]) => ({ name, plays }));

    // Recent rooms lookup
    const recentCodes = Array.from(distinctRooms).slice(0, 15);
    const [rooms, recaps] = recentCodes.length
      ? await Promise.all([
          prisma.togetherRoom.findMany({
            where: { code: { in: recentCodes } },
            select: {
              code: true,
              name: true,
              coverUrl: true,
              mode: true,
              state: true,
              createdAt: true,
            },
          }),
          prisma.togetherRoomRecap.findMany({
            where: { roomCode: { in: recentCodes } },
            select: { roomCode: true },
          }),
        ])
      : [[], []];
    const roomMap = new Map(rooms.map((r) => [r.code, r]));
    const recapSet = new Set(recaps.map((r) => r.roomCode));

    const recentRooms = recentCodes.map((code) => {
      const r = roomMap.get(code);
      const roomSessions = sessions.filter((s) => s.roomCode === code);
      const mins = Math.round(
        roomSessions.reduce((a, s) => a + s.listeningSeconds, 0) / 60
      );
      return {
        roomCode: code,
        roomRef: code,
        name: r?.name ?? `Room ${code}`,
        coverUrl: r?.coverUrl ?? null,
        mode: r?.mode ?? 'collab',
        state: r?.state ?? 'CLOSED',
        minutes: mins,
        hasRecap: recapSet.has(code),
        joinedAtMs: roomSessions[0]?.joinedAt.getTime() ?? Date.now(),
      };
    });

    return {
      range,
      timezone: tz,
      summary: {
        totalMinutes: Math.round(totalSec / 60),
        roomsJoined: distinctRooms.size,
        tracksPlayed,
        songsAdded,
        reactionsSent,
        bookmarksSaved: bookmarksCount,
        topRole: topRoleEntry?.[0] ?? 'LISTENER',
        peakHour: peakHourEntry ? Number(peakHourEntry[0]) : null,
      },
      roleBreakdownSeconds: roleTotals,
      dailyMinutes: Object.entries(dayBuckets)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, minutes]) => ({ date, minutes })),
      topTracks,
      topArtists,
      recentRooms,
      privacy,
    };
  }

  /**
   * Computes live / post-session room stats matching `RoomStats` (`room_stats_sheet.dart`).
   */
  static async getRoomStats(roomCode: string) {
    const code = roomCode.trim().toUpperCase();
    const [room, members, sessions, tracks, reactionCount] = await Promise.all([
      prisma.togetherRoom.findUnique({ where: { code } }),
      prisma.togetherRoomMember.findMany({ where: { roomCode: code } }),
      prisma.togetherUserSession.findMany({ where: { roomCode: code } }),
      prisma.togetherUserTrack.findMany({ where: { roomCode: code } }),
      prisma.togetherReaction.count({ where: { roomCode: code } }),
    ]);
    if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');

    const nameMap = new Map(members.map((m) => [m.userId, m.displayName]));
    const totalAdded = sessions.reduce((a, s) => a + s.songsAdded, 0);
    const totalChats = sessions.reduce((a, s) => a + s.chatMessagesSent, 0);
    const totalReactions = Math.max(
      reactionCount,
      sessions.reduce((a, s) => a + s.reactionsSent, 0)
    );
    const uniqueTracks = new Set(tracks.map((t) => t.trackId)).size;
    const durationMin = Math.max(
      1,
      Math.round(
        ((room.endedAt?.getTime() ?? Date.now()) - room.createdAt.getTime()) / 60000
      )
    );

    const topAdded = [...sessions].sort((a, b) => b.songsAdded - a.songsAdded)[0];
    const topChatter = [...sessions].sort(
      (a, b) => b.chatMessagesSent + b.reactionsSent - (a.chatMessagesSent + a.reactionsSent)
    )[0];

    const values: Record<string, string> = {
      'Session length': durationMin < 60 ? `${durationMin} min` : `${(durationMin / 60).toFixed(1)} h`,
      'Songs played': String(uniqueTracks),
      'Participants': String(members.length),
      'Tracks queued': String(totalAdded),
      'Reactions': String(totalReactions),
      'Chat messages': String(totalChats),
    };

    const awards: Array<{ title: string; value: string; label: string; winner: string }> = [];
    if (topAdded && topAdded.songsAdded > 0) {
      const winner = nameMap.get(topAdded.userId) ?? 'Host';
      awards.push({
        title: 'Top Curator',
        value: `${winner} (${topAdded.songsAdded})`,
        label: 'Top Curator',
        winner,
      });
    }
    if (topChatter && topChatter.chatMessagesSent + topChatter.reactionsSent > 0) {
      const winner = nameMap.get(topChatter.userId) ?? 'Member';
      awards.push({
        title: 'Most Active',
        value: winner,
        label: 'Most Active',
        winner,
      });
    }

    return { values, awards };
  }

  /**
   * Generates & stores shareable room recap JSON matching `RoomRecap` (`room_recap_screen.dart`).
   */
  static async generateAndStoreRecap(roomCode: string) {
    const code = roomCode.trim().toUpperCase();
    const [room, members, sessions, tracks, reactions, requests] = await Promise.all([
      prisma.togetherRoom.findUnique({ where: { code } }),
      prisma.togetherRoomMember.findMany({ where: { roomCode: code } }),
      prisma.togetherUserSession.findMany({ where: { roomCode: code } }),
      prisma.togetherUserTrack.findMany({ where: { roomCode: code } }),
      prisma.togetherReaction.findMany({ where: { roomCode: code } }),
      prisma.togetherSongRequest.findMany({ where: { roomCode: code } }),
    ]);

    if (!room) throw new RoomHttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');

    const nameMap = new Map(members.map((m) => [m.userId, m.displayName]));
    const trackCounts = new Map<string, { title: string; artist: string; count: number }>();
    const artistCounts = new Map<string, number>();

    for (const t of tracks) {
      const ex = trackCounts.get(t.trackId);
      if (ex) ex.count++;
      else trackCounts.set(t.trackId, { title: t.title, artist: t.artist, count: 1 });
      artistCounts.set(t.artist, (artistCounts.get(t.artist) || 0) + 1);
    }

    // Also include current queue tracks if user tracks were sparse (e.g. short guest sessions)
    const queueItems = (Array.isArray(room.queue) ? room.queue : []) as unknown as TogetherQueueItemDTO[];
    const totalSongs = Math.max(trackCounts.size, queueItems.length, room.currentTrackId ? 1 : 0);

    const reactByTrack = new Map<string, number>();
    for (const r of reactions) {
      reactByTrack.set(r.trackId, (reactByTrack.get(r.trackId) || 0) + 1);
    }
    const mostReactedEntry = Array.from(reactByTrack.entries()).sort((a, b) => b[1] - a[1])[0];
    const mostReactedTrackObj = mostReactedEntry
      ? trackCounts.get(mostReactedEntry[0]) ||
        queueItems.find((q) => q.trackId === mostReactedEntry[0])?.track
      : null;

    const reqArtistCounts = new Map<string, number>();
    for (const rq of requests) {
      const a = (rq.trackJson as any)?.artist;
      if (a) reqArtistCounts.set(a, (reqArtistCounts.get(a) || 0) + 1);
    }

    const topTrack = Array.from(trackCounts.values()).sort((a, b) => b.count - a.count)[0];
    const topArtist = Array.from(artistCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    const mostReqArtist = Array.from(reqArtistCounts.entries()).sort((a, b) => b[1] - a[1])[0];

    const topDjSess = [...sessions].sort((a, b) => b.songsAdded - a.songsAdded)[0];
    const topActiveSess = [...sessions].sort(
      (a, b) =>
        b.chatMessagesSent + b.reactionsSent + b.songsAdded -
        (a.chatMessagesSent + a.reactionsSent + a.songsAdded)
    )[0];

    const totalReacts = Math.max(
      reactions.length,
      sessions.reduce((a, s) => a + s.reactionsSent, 0)
    );
    const endedAtMs = room.endedAt?.getTime() ?? Date.now();
    const durationMinutes = Math.max(1, (endedAtMs - room.createdAt.getTime()) / 60000);

    const highlights: string[] = [];
    if (members.length >= 2) {
      highlights.push(`${members.length} listeners tuned in together`);
    }
    if (totalReacts > 0) {
      highlights.push(`${totalReacts} live reactions shared`);
    }
    if (topTrack) {
      highlights.push(`Favorite track: ${topTrack.title}`);
    }

    const summary = {
      roomCode: code,
      roomName: room.name,
      coverUrl: room.coverUrl ?? (room.currentTrack as any)?.coverUrl ?? '',
      durationMinutes: Number(durationMinutes.toFixed(1)),
      songs: totalSongs,
      participants: Math.max(1, members.length),
      reactions: totalReacts,
      topTrack: topTrack ? `${topTrack.title} · ${topTrack.artist}` : null,
      topArtist: topArtist?.[0] ?? null,
      mostReactedTrack: mostReactedTrackObj
        ? `${mostReactedTrackObj.title} · ${mostReactedTrackObj.artist}`
        : null,
      topDj: topDjSess ? (nameMap.get(topDjSess.userId) ?? nameMap.get(room.hostId) ?? 'Host') : null,
      mostActive: topActiveSess ? (nameMap.get(topActiveSess.userId) ?? null) : null,
      mostRequestedArtist: mostReqArtist?.[0] ?? null,
      highlights,
      generatedAtMs: Date.now(),
    };

    await prisma.togetherRoomRecap.upsert({
      where: { roomCode: code },
      create: { roomCode: code, summary: summary as any },
      update: { summary: summary as any },
    });

    await roomEventService
      .emit({
        roomCode: code,
        type: 'ROOM_RECAP_READY',
        actorId: 'system',
        payload: { roomCode: code, summary },
      })
      .catch(() => undefined);

    return summary;
  }

  static async getRecap(roomCode: string) {
    const code = roomCode.trim().toUpperCase();
    const existing = await prisma.togetherRoomRecap.findUnique({ where: { roomCode: code } });
    if (existing) return existing.summary;
    const room = await prisma.togetherRoom.findUnique({ where: { code } });
    if (!room) throw new RoomHttpError(404, 'RECAP_NOT_FOUND', 'Recap not found.');
    return this.generateAndStoreRecap(code);
  }

  /**
   * Data retention cleanup: prunes raw events older than 14 days and closed sessions/tracks > 90 days.
   */
  static async cleanupRetention(): Promise<void> {
    const now = Date.now();
    const cutoffEvents = new Date(now - 14 * 86400_000);
    const cutoffAnalytics = new Date(now - 90 * 86400_000);

    await Promise.all([
      prisma.togetherRoomEvent.deleteMany({ where: { createdAt: { lt: cutoffEvents } } }),
      prisma.togetherUserTrack.deleteMany({ where: { playedAt: { lt: cutoffAnalytics } } }),
      prisma.togetherReaction.deleteMany({ where: { createdAt: { lt: cutoffAnalytics } } }),
    ]).catch(() => undefined);
  }
}
