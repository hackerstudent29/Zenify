import { FastifyInstance } from 'fastify';
import { MetadataController } from '../controllers/metadata.controller';
import { z } from 'zod';

export async function metadataRoutes(server: FastifyInstance) {
    const controller = new MetadataController();

    server.get('/fetch', {
        preHandler: [server.authenticate],
        schema: {
            querystring: z.object({
                url: z.string(),
                fetchAudio: z.string().optional(),
                mode: z.string().optional()
            })
        }
    }, controller.fetchMetadata);

    server.post('/romanize-track', {
        config: {
            rateLimit: {
                max: 30,
                timeWindow: '1 minute'
            }
        },
        schema: {
            body: z.object({
                trackId: z.string(),
                force: z.boolean().optional()
            })
        },
        handler: controller.romanizeTrack.bind(controller)
    });

    server.post('/sync-lyrics', {
        config: {
            rateLimit: {
                max: 30,
                timeWindow: '1 minute'
            }
        },
        schema: {
            body: z.object({
                trackId: z.string().optional(),
                title: z.string(),
                artist: z.string(),
                audioUrl: z.string().optional(),
                rawLyrics: z.string().optional(),
                duration: z.number().optional(),
                force: z.boolean().optional(),
                language: z.string().optional(),
                album: z.string().optional()
            })
        },
        handler: controller.syncLyrics.bind(controller)
    });

    server.post('/refetch-lyrics', async (req, reply) => {
        const body = (req.body || {}) as any;
        const trackId = body.trackId || body.id;
        if (!trackId) {
            return reply.status(400).send({ message: 'trackId is required' });
        }
        // Redirect/call internal handler
        const { prisma } = await import('../utils/prisma.js');
        const track = await prisma.track.findUnique({ where: { id: trackId }, include: { artist: true, album: true } });
        if (!track) return reply.status(404).send({ message: 'Track not found' });
        
        // Call refetch-lyrics logic
        const { LyricEnrichmentService } = await import('../services/lyric-enrichment.service.js');
        const { DeepgramLyricsService } = await import('../services/deepgram-lyrics.service.js');
        const { LyricsEnhancementService } = await import('../services/lyrics-enhancement.service.js');
        const { LyricsSyncService } = await import('../services/lyrics-sync.service.js');
        const { AIAudioAlignerService } = await import('../services/ai-audio-aligner.service.js');
        const { enqueueRomanization } = await import('../queues/romanization.queue.js');

        const provider = body.provider || 'auto';
        const artistName = track.artist?.name || '';
        const targetLanguage = track.language || (
            track.title.toLowerCase().includes('tamil') ? 'tamil' :
            track.title.toLowerCase().includes('telugu') ? 'telugu' :
            track.title.toLowerCase().includes('hindi') ? 'hindi' :
            track.title.toLowerCase().includes('malayalam') ? 'malayalam' :
            track.title.toLowerCase().includes('kannada') ? 'kannada' : undefined
        );

        let syncedTokens: any[] = [];
        let plainLyrics = '';
        if (track.lyrics && (!targetLanguage || !LyricsEnhancementService.isLyricsLanguageMismatch(track.lyrics, targetLanguage))) {
            plainLyrics = track.lyrics;
        }
        let rawLrc: string | undefined;
        let chosenSource = provider;

        if (provider === 'deepgram') {
            const dg = await DeepgramLyricsService.syncTrackLyrics(track.id, { force: true, tryVocals: true }).catch(() => null);
            if (dg?.syncedTokens?.length) {
                syncedTokens = dg.syncedTokens;
                plainLyrics = dg.plainLyrics || plainLyrics;
                chosenSource = 'DEEPGRAM_AI';
            }
        } else if (provider === 'lrclib') {
            const lrc = await LyricsEnhancementService.fetchLRCLib(track.title, artistName, track.duration, targetLanguage).catch(() => null);
            if (lrc?.lyrics) {
                if (lrc.isSynced) {
                    const parsed = LyricsSyncService.parseLRC(lrc.lyrics);
                    syncedTokens = parsed;
                    rawLrc = lrc.lyrics;
                    plainLyrics = parsed.map((p: any) => p.text).filter(Boolean).join('\n');
                } else {
                    plainLyrics = lrc.lyrics;
                }
                chosenSource = 'LRCLIB';
            }
        } else if (provider === 'spotify') {
            const sp = await LyricsEnhancementService.fetchSpotifyRapidApiLyrics(track.title, artistName).catch(() => null);
            if (sp?.lyrics) {
                if (sp.isSynced) {
                    const parsed = LyricsSyncService.parseLRC(sp.lyrics);
                    syncedTokens = parsed;
                    rawLrc = sp.lyrics;
                }
                plainLyrics = sp.lyrics;
                chosenSource = 'SPOTIFY_LRC';
            }
        } else if (provider === 'musixmatch') {
            const mm = await LyricsEnhancementService.fetchMusixmatchRapidApiLyrics(track.title, artistName, track.duration).catch(() => null)
                || await LyricsEnhancementService.fetchMusixmatchLyrics(track.title, artistName).catch(() => null);
            if (mm?.lyrics) {
                plainLyrics = mm.lyrics;
                chosenSource = 'MUSIXMATCH';
            }
        } else if (provider === 'genius') {
            const gn = await LyricsEnhancementService.fetchGeniusRapidApiLyrics(track.title, artistName).catch(() => null)
                || await LyricsEnhancementService.fetchGeniusRapidApi5Lyrics(track.title, artistName).catch(() => null);
            if (gn?.lyrics) {
                plainLyrics = gn.lyrics;
                chosenSource = 'GENIUS';
            }
        } else if (provider === 'azlyrics') {
            const az = await LyricsEnhancementService.fetchAZLyrics(track.title, artistName).catch(() => null);
            if (az?.lyrics) {
                plainLyrics = az.lyrics;
                chosenSource = 'AZLYRICS';
            }
        } else if (provider === 'youtube') {
            const yt = await LyricsSyncService.fetchYouTubeSubtitles(track.title, artistName, track.audioUrl || undefined, track.duration).catch(() => null);
            if (yt?.syncedTokens?.length) {
                syncedTokens = yt.syncedTokens;
                rawLrc = yt.rawLrc;
                chosenSource = 'YOUTUBE_CAPTIONS';
            }
        } else if (provider === 'ai_align') {
            if (plainLyrics.trim()) {
                const aligned = await AIAudioAlignerService.alignPlainLyricsToAudio({
                    trackId: track.id,
                    audioUrl: track.audioUrl || undefined,
                    plainLyrics,
                    title: track.title,
                    artist: artistName,
                    duration: track.duration
                }).catch(() => null);
                if (aligned?.syncedTokens?.length) {
                    syncedTokens = aligned.syncedTokens;
                    rawLrc = aligned.rawLrc;
                    chosenSource = 'AI_AUDIO_ALIGNER';
                }
            }
        } else {
            // Auto / Best Available Pipeline:
            // 0. Primary JioSaavn authentic lyrics
            const saavn = await LyricsEnhancementService.fetchJioSaavnLyrics(track.title, artistName, (track as any).sourceId || track.id).catch(() => null);
            if (saavn?.lyrics) {
                plainLyrics = saavn.lyrics;
                chosenSource = 'JIOSAAVN';
            }
            // 1. LRCLIB with language verification
            const lrc = await LyricsEnhancementService.fetchLRCLib(track.title, artistName, track.duration, targetLanguage).catch(() => null);
            if (lrc?.lyrics) {
                if (lrc.isSynced) {
                    const parsed = LyricsSyncService.parseLRC(lrc.lyrics);
                    syncedTokens = parsed;
                    rawLrc = lrc.lyrics;
                    plainLyrics = parsed.map((p: any) => p.text).filter(Boolean).join('\n');
                    chosenSource = 'LRCLIB';
                } else {
                    plainLyrics = lrc.lyrics;
                }
            }
            // 2. Deepgram if audioUrl is present and still not synced
            if (!syncedTokens.length && track.audioUrl && DeepgramLyricsService.isAvailable()) {
                const dg = await DeepgramLyricsService.syncTrackLyrics(track.id, { force: true }).catch(() => null);
                if (dg?.syncedTokens?.length) {
                    syncedTokens = dg.syncedTokens;
                    plainLyrics = dg.plainLyrics || plainLyrics;
                    chosenSource = 'DEEPGRAM_AI';
                }
            }
            // 3. Spotify
            if (!syncedTokens.length) {
                const sp = await LyricsEnhancementService.fetchSpotifyRapidApiLyrics(track.title, artistName).catch(() => null);
                if (sp?.lyrics) {
                    if (sp.isSynced) {
                        const parsed = LyricsSyncService.parseLRC(sp.lyrics);
                        syncedTokens = parsed;
                        rawLrc = sp.lyrics;
                        chosenSource = 'SPOTIFY_LRC';
                    }
                    plainLyrics = sp.lyrics;
                }
            }
        }

        if (syncedTokens.length > 0) {
            syncedTokens = syncedTokens.map(t => ({
                ...t,
                text: LyricEnrichmentService.formatLyricLine(t.text || '')
            }));
        }
        if (plainLyrics) {
            plainLyrics = plainLyrics.split('\n').map(l => LyricEnrichmentService.formatLyricLine(l)).join('\n');
        }

        const updateData: any = {};
        if (plainLyrics) updateData.lyrics = plainLyrics;
        if (syncedTokens.length > 0) {
            updateData.synced_lyrics = syncedTokens;
            updateData.sync_source = chosenSource;
            if (rawLrc) updateData.raw_lrc = rawLrc;
        }
        // Purge previous conflicting language romanizations
        updateData.romanizedLyrics = null;
        updateData.romanizedSyncedLyrics = null;
        updateData.romanizedLang = null;

        const updated = await prisma.track.update({
            where: { id: track.id },
            data: updateData,
            select: { id: true, title: true, lyrics: true, synced_lyrics: true, raw_lrc: true, sync_source: true, romanizedLyrics: true, romanizedSyncedLyrics: true, romanizedLang: true }
        });

        await enqueueRomanization({ trackId: track.id, force: true }).catch(() => {});

        return reply.send({
            success: true,
            provider: chosenSource,
            track: updated,
            syncedTokens: updated.synced_lyrics || [],
            plainLyrics: updated.lyrics || '',
            hasSynced: Boolean(updated.synced_lyrics && (updated.synced_lyrics as any[]).length > 0)
        });
    });

    server.post('/whisper-sync', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])],
        schema: {
            body: z.object({
                trackId: z.string()
            })
        },
        handler: controller.whisperSync.bind(controller)
    });

    server.post('/deepgram-sync', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])],
        schema: {
            body: z.object({
                trackId: z.string(),
                tryVocals: z.boolean().optional(),
                force: z.boolean().optional(),
                plainLyrics: z.string().optional(),
                language: z.string().optional()
            })
        },
        handler: controller.deepgramSync.bind(controller)
    });

    server.post('/align-plain-lyrics', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])],
        schema: {
            body: z.object({
                trackId: z.string().optional(),
                audioUrl: z.string().optional(),
                plainLyrics: z.string(),
                title: z.string().optional(),
                artist: z.string().optional(),
                duration: z.number().optional()
            })
        },
        handler: controller.alignPlainLyrics.bind(controller)
    });

    server.post('/sync-aesthetic', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])],
        schema: {
            body: z.object({
                trackId: z.string().optional(),
                albumId: z.string().optional()
            })
        }
    }, controller.syncAesthetic);

    server.post('/lyrics-insight', {
        preHandler: [server.authenticate],
        config: {
            rateLimit: {
                max: 15,
                timeWindow: '1 minute'
            }
        },
        schema: {
            body: z.object({
                trackId: z.string()
            })
        },
        handler: controller.generateLyricsInsight.bind(controller)
    });

    /** Save manually-crafted synced lyrics (from Lyric Sync Studio) */
    server.patch('/save-synced-lyrics', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])],
        schema: {
            body: z.object({
                trackId: z.string(),
                syncedTokens: z.array(z.object({
                    time: z.number().nullable(),
                    endTime: z.number().optional(),
                    text: z.string(),
                    synced: z.boolean().optional(),
                    words: z.array(z.object({
                        time: z.number(),
                        endTime: z.number().optional(),
                        word: z.string()
                    })).optional()
                })),
                rawLrc: z.string().optional(),
                language: z.string().optional()
            })
        },
        handler: controller.saveSyncedLyrics.bind(controller)
    });

    server.post('/clean-title', {
        schema: {
            body: z.object({
                title: z.string(),
                artist: z.string().optional()
            })
        },
        handler: async (request, reply) => {
            const { title, artist } = request.body as { title: string; artist?: string };
            const { AIArtistService } = await import('../services/ai-artist.service.js');
            const result = await AIArtistService.cleanMetadataWithAI(title, artist);
            return reply.send(result);
        }
    });

    server.post('/import-lyrics', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])],
        schema: {
            body: z.object({
                trackId: z.string().optional(),
                title: z.string().optional(),
                artist: z.string().optional(),
                url: z.string().optional(),
                duration: z.number().optional()
            })
        },
        handler: controller.importLyrics.bind(controller)
    });

    server.get('/lyrics-enrichment/stats', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])],
        handler: controller.getLyricEnrichmentStats.bind(controller)
    });

    server.post('/lyrics-enrichment/sweep', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])],
        handler: controller.triggerLyricEnrichmentSweep.bind(controller)
    });

    server.post('/lyrics-enrichment/reprocess', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])],
        schema: {
            body: z.object({
                trackId: z.string()
            })
        },
        handler: controller.reprocessTrackLyrics.bind(controller)
    });

    server.post('/lyrics-enrichment/calibrate-onset', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])],
        schema: {
            body: z.object({
                trackId: z.string()
            })
        },
        handler: controller.calibrateLyricsOnset.bind(controller)
    });

    // Automated Song Playback Health & Self-Healing Endpoints
    server.get('/playback-health/report', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])],
        handler: controller.getPlaybackHealthReport.bind(controller)
    });

    server.post('/playback-health/sweep', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])],
        schema: {
            body: z.object({
                batchSize: z.number().optional()
            }).optional()
        },
        handler: controller.triggerPlaybackHealthSweep.bind(controller)
    });

    server.post('/playback-health/check-track', {
        preHandler: [server.authenticate],
        schema: {
            body: z.object({
                trackId: z.string()
            })
        },
        handler: controller.diagnoseAndHealTrack.bind(controller)
    });

    // Real-Time System Workers Health Status
    server.get('/workers/status', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])],
        handler: controller.getAllWorkersStatus.bind(controller)
    });
}
