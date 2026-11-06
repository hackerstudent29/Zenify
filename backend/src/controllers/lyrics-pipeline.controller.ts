import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma';
import { LyricsOrchestrator } from '../lyrics/orchestrator';
import { DeepgramEngine } from '../lyrics/deepgram-engine';
import { LyricsDoc } from '../lyrics/types';

export class LyricsPipelineController {
  private static pendingTrackJobs: Set<string> = new Set();

  /**
   * Public endpoint to fetch lyrics for a track:
   * GET /api/lyrics/:trackId
   */
  static async getLyrics(req: FastifyRequest<{ Params: { trackId: string } }>, reply: FastifyReply) {
    const { trackId } = req.params;
    if (!trackId) {
      return reply.code(400).send({ error: 'Missing trackId' });
    }

    reply.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');

    // 1. Check database cache (lyrics table)
    const cached = await prisma.lyrics.findUnique({
      where: { trackId }
    });

    if (cached) {
      const isExpired = cached.expiresAt && cached.expiresAt.getTime() < Date.now();
      if (!isExpired) {
        const doc: LyricsDoc = {
          syncLevel: cached.syncLevel as any,
          providerId: cached.provider,
          providerRef: cached.providerRef || undefined,
          language: cached.language || undefined,
          script: cached.script || undefined,
          instrumental: cached.instrumental,
          aiGenerated: cached.aiGenerated,
          aiSynced: cached.aiSynced,
          lines: (cached.contentJson as any)?.lines || []
        };
        return reply.send({ status: 'ready', doc });
      }
    }

    // 2. Resolve track metadata from DB
    const track = await prisma.track.findUnique({
      where: { id: trackId },
      include: { artist: true, album: true }
    });

    // 2b. Check if track in DB already has synced_lyrics or plain lyrics cached
    if (track && track.synced_lyrics && Array.isArray(track.synced_lyrics) && track.synced_lyrics.length > 0) {
      const lines = (track.synced_lyrics as any[]).map(l => ({
        startMs: Math.round((l.time || 0) * 1000),
        endMs: Math.round((l.endTime || (l.time + 3)) * 1000),
        text: l.text || '',
        words: Array.isArray(l.words) ? l.words.map((w: any) => ({
          text: w.word || w.text || '',
          startMs: Math.round((w.time || 0) * 1000),
          endMs: Math.round((w.endTime || (w.time + 0.3)) * 1000)
        })) : undefined
      }));
      const hasWordGranularity = lines.some(l => l.words && l.words.length > 0);
      const doc: LyricsDoc = {
        syncLevel: hasWordGranularity ? 'word' : 'line',
        providerId: track.sync_source || 'DATABASE_CACHE',
        language: track.language || undefined,
        instrumental: false,
        aiGenerated: track.sync_source === 'DEEPGRAM_AI',
        aiSynced: false,
        lines
      };
      return reply.send({ status: 'ready', doc });
    }

    // 3. Check if Tier A job is actively pending
    if (this.pendingTrackJobs.has(trackId)) {
      return reply.send({ status: 'pending' });
    }

    const query = track ? {
      trackId: track.id,
      title: track.title,
      artist: track.artist?.name || track.primaryArtists || 'Unknown',
      album: track.album?.title,
      duration: track.duration,
      isrc: track.isrc || undefined,
      language: track.language || undefined
    } : {
      trackId,
      title: trackId,
      artist: 'Unknown'
    };

    const startTime = Date.now();
    const { doc, needsTierA } = await LyricsOrchestrator.resolveLyrics(query);
    const elapsedMs = Date.now() - startTime;

    // Record attempt
    if (doc) {
      await prisma.lyricsAttempt.create({
        data: {
          trackId,
          provider: doc.providerId,
          outcome: 'success',
          ms: elapsedMs
        }
      }).catch(() => {});

      // Cache document for 7 days
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const recheckAt = doc.syncLevel === 'word' ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await prisma.lyrics.upsert({
        where: { trackId },
        create: {
          trackId,
          syncLevel: doc.syncLevel,
          provider: doc.providerId,
          providerRef: doc.providerRef,
          language: doc.language || query.language,
          script: doc.script,
          instrumental: doc.instrumental,
          aiGenerated: doc.aiGenerated,
          aiSynced: doc.aiSynced,
          contentJson: { lines: doc.lines } as any,
          expiresAt,
          recheckAt
        },
        update: {
          syncLevel: doc.syncLevel,
          provider: doc.providerId,
          providerRef: doc.providerRef,
          language: doc.language || query.language,
          script: doc.script,
          instrumental: doc.instrumental,
          aiGenerated: doc.aiGenerated,
          aiSynced: doc.aiSynced,
          contentJson: { lines: doc.lines } as any,
          fetchedAt: new Date(),
          expiresAt,
          recheckAt
        }
      }).catch(() => {});

      if (track) {
        const syncedTokens = doc.lines.map(l => ({
          time: l.startMs / 1000,
          endTime: l.endMs / 1000,
          text: l.text,
          words: l.words?.map(w => ({
            word: w.text,
            time: w.startMs / 1000,
            endTime: w.endMs / 1000
          }))
        }));
        prisma.track.update({
          where: { id: track.id },
          data: {
            synced_lyrics: syncedTokens,
            lyrics: doc.lines.map(l => l.text).join('\n'),
            sync_source: doc.providerId
          }
        }).catch(() => {});
      }

      return reply.send({ status: 'ready', doc });
    }

    // 4. If all W, L, P fail and needsTierA, trigger async Deepgram worker
    if (needsTierA && track?.audioUrl) {
      this.pendingTrackJobs.add(trackId);

      // Fire and forget background transcription
      (async () => {
        try {
          const dgDoc = await DeepgramEngine.transcribeTrack(track.audioUrl, query);
          if (dgDoc) {
            await prisma.lyrics.upsert({
              where: { trackId },
              create: {
                trackId,
                syncLevel: dgDoc.syncLevel,
                provider: dgDoc.providerId,
                providerRef: dgDoc.providerRef,
                language: dgDoc.language || query.language,
                instrumental: false,
                aiGenerated: true,
                aiSynced: true,
                contentJson: { lines: dgDoc.lines } as any,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
              },
              update: {
                syncLevel: dgDoc.syncLevel,
                provider: dgDoc.providerId,
                contentJson: { lines: dgDoc.lines } as any,
                aiGenerated: true,
                aiSynced: true
              }
            }).catch(() => {});

            if (track) {
              const dgTokens = dgDoc.lines.map(l => ({
                time: l.startMs / 1000,
                endTime: l.endMs / 1000,
                text: l.text,
                words: l.words?.map(w => ({
                  word: w.text,
                  time: w.startMs / 1000,
                  endTime: w.endMs / 1000
                }))
              }));
              prisma.track.update({
                where: { id: track.id },
                data: {
                  synced_lyrics: dgTokens,
                  lyrics: dgDoc.lines.map(l => l.text).join('\n'),
                  sync_source: dgDoc.providerId
                }
              }).catch(() => {});
            }
          }
        } finally {
          LyricsPipelineController.pendingTrackJobs.delete(trackId);
        }
      })().catch(() => {});

      return reply.send({ status: 'pending' });
    }

    // Record failure attempt
    await prisma.lyricsAttempt.create({
      data: {
        trackId,
        provider: 'orchestrator',
        outcome: 'not_found',
        ms: elapsedMs
      }
    }).catch(() => {});

    return reply.send({ status: 'none' });
  }

  /**
   * Admin Health Telemetry:
   * GET /api/admin/lyrics/health
   */
  static async getHealth(req: FastifyRequest, reply: FastifyReply) {
    // Auth check: return 404 for non-admins (hide existence)
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      return reply.code(404).send({ error: 'Not found' });
    }

    const [totalDocs, tierCounts, recentAttempts] = await Promise.all([
      prisma.lyrics.count(),
      prisma.lyrics.groupBy({
        by: ['syncLevel'],
        _count: { syncLevel: true }
      }),
      prisma.lyricsAttempt.findMany({
        take: 200,
        orderBy: { createdAt: 'desc' }
      })
    ]);

    const totalAttempts = recentAttempts.length;
    const successfulAttempts = recentAttempts.filter(a => a.outcome === 'success').length;
    const successRate = totalAttempts > 0 ? (successfulAttempts / totalAttempts) * 100 : 100;

    const latencies = recentAttempts.map(a => a.ms).sort((a, b) => a - b);
    const p50Latency = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0;
    const p95Latency = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;

    const tierDistribution: Record<string, number> = {};
    for (const tc of tierCounts) {
      tierDistribution[tc.syncLevel] = tc._count.syncLevel;
    }

    return reply.send({
      totalCachedDocuments: totalDocs,
      successRate: Math.round(successRate * 10) / 10,
      latency: {
        p50Ms: p50Latency,
        p95Ms: p95Latency
      },
      tierDistribution,
      deepgramEstimatedSpendUsd: DeepgramEngine.getEstimatedSpend()
    });
  }

  /**
   * Admin Purge (Takedown):
   * POST /api/admin/lyrics/purge/:trackId
   */
  static async purgeTrack(req: FastifyRequest<{ Params: { trackId: string } }>, reply: FastifyReply) {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      return reply.code(404).send({ error: 'Not found' });
    }

    const { trackId } = req.params;
    await prisma.lyrics.deleteMany({
      where: { trackId }
    });

    return reply.send({ success: true, message: `Lyrics purged for track ${trackId}` });
  }

  /**
   * Admin Purge by Provider:
   * POST /api/admin/lyrics/purge/provider/:providerId
   */
  static async purgeProvider(req: FastifyRequest<{ Params: { providerId: string } }>, reply: FastifyReply) {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      return reply.code(404).send({ error: 'Not found' });
    }

    const { providerId } = req.params;
    const deleted = await prisma.lyrics.deleteMany({
      where: { provider: providerId }
    });

    return reply.send({ success: true, count: deleted.count, message: `Purged ${deleted.count} documents from ${providerId}` });
  }
}
