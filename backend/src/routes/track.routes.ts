import { FastifyInstance } from 'fastify';
import { TrackController } from '../controllers/track.controller';
import { createTrackSchema, updateTrackSchema, trackQuerySchema } from '../controllers/track.schemas';

export async function trackRoutes(server: FastifyInstance) {
    const trackController = new TrackController(server);

    server.post('/', {
        schema: { body: createTrackSchema },
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, trackController.create);

    server.post('/upload', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
        // No schema validation for multipart body here, handled by service/controller logic or specific multipart schema
    }, trackController.upload);

    server.post('/import-external', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, trackController.importExternal);

    server.post('/import-instant', {
        config: {
            rateLimit: {
                max: 60,
                timeWindow: '1 minute'
            }
        }
    }, trackController.importInstant);

    server.post('/import-batch', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, trackController.importBatch);

    server.get('/', {
        schema: { querystring: trackQuerySchema }
    }, trackController.getAll);

    server.get('/featured', trackController.getFeatured);
    server.get('/trending', trackController.getTrending);

    server.get('/liked', {
        preHandler: [server.authenticate]
    }, trackController.getLiked);

    server.get('/check-local', trackController.checkLocal);
    server.get('/stream/:id', trackController.streamTrack);
    
    // Contextual recommendations for track (same vibe songs, more from artist)
    server.get('/:id/similar', {
        preHandler: [server.authenticate],
        config: {
            rateLimit: {
                max: 60,
                timeWindow: '1 minute'
            }
        }
    }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const userId = (req.user as any)?.id;
        const { RecommendationsService } = await import('../services/recommendations.service.js');
        const data = await RecommendationsService.getContextRecommendations(userId, { type: 'track', id });
        return reply.send(data);
    });

    server.get('/:id', trackController.getOne);

    server.put('/:id', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, trackController.update);

    server.delete('/:id', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, trackController.delete);

    server.post('/:id/play', { preHandler: [server.optionalAuthenticate] }, trackController.play);
    server.post('/:id/heartbeat', { preHandler: [server.authenticate] }, trackController.heartbeat);
    server.post('/:id/update-duration', { preHandler: [server.authenticate] }, trackController.updateDuration);
    server.post('/:id/lyrics-offset', { preHandler: [server.authenticate, server.authorize(['ADMIN'])] }, trackController.updateLyricsOffset);
    server.post('/:id/download', trackController.download);
    server.get('/:id/process-download', trackController.processDownload);
    server.post('/convert-format', { preHandler: [server.authenticate] }, trackController.convertFormat);

    server.get('/:id/progress', async (req, reply) => {
        const { id } = req.params as { id: string };
        const { trackProgressEmitter } = await import('../queues/import.queue.js');
        const { prisma } = await import('../utils/prisma.js');
        const track = await prisma.track.findUnique({ where: { id }, select: { id: true, audioUrl: true, releaseStatus: true, duration: true } });
        if (!track) return reply.status(404).send({ error: 'Track not found' });
        
        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');

        reply.raw.write(`data: ${JSON.stringify({ trackId: id, stage: track.releaseStatus === 'PUBLISHED' ? 'audio_ready' : 'audio_resolving', audioUrl: track.audioUrl, duration: track.duration })}\n\n`);

        const listener = (event: any) => {
            if (event.trackId === id) {
                reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
                if (event.stage === 'finalized' || event.stage === 'failed') {
                    cleanup();
                }
            }
        };

        const cleanup = () => {
            trackProgressEmitter.off('progress', listener);
            try { reply.raw.end(); } catch {}
        };

        trackProgressEmitter.on('progress', listener);
        req.raw.on('close', cleanup);
    });

        // Manual and Automated Refetch Audio for track
    server.post('/:id/refetch-audio', async (req, reply) => {
        const { id } = req.params as { id: string };
        const { prisma } = await import('../utils/prisma.js');
        const { AudioResolverService } = await import('../services/audio-resolver.service.js');
        const { youtubeStreamCache } = await import('./utils.routes.js');

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        let track = isUuid
            ? await prisma.track.findUnique({ where: { id }, include: { artist: true, album: true } })
            : await prisma.track.findFirst({
                where: { OR: [{ youtubeId: id }, { id }] },
                include: { artist: true, album: true }
              });

        if (!track) {
            const body = (req.body || {}) as any;
            if (body.title) {
                const cleanTitle = body.title.trim();
                const cleanArtist = (body.artistName || body.artist || '').trim();
                track = await prisma.track.findFirst({
                    where: {
                        title: { equals: cleanTitle, mode: 'insensitive' },
                        ...(cleanArtist ? { artist: { name: { equals: cleanArtist, mode: 'insensitive' } } } : {})
                    },
                    include: { artist: true, album: true }
                });
            }
        }

        if (!track) {
            const body = (req.body || {}) as any;
            const titleToUse = (body.title || '').trim();
            const artistToUse = (body.artistName || body.artist || '').trim();

            // 1. Clean CDN 320kbps (JioSaavn) Full Song Priority
            if (titleToUse) {
                try {
                    const { CleanCdnAudioService } = await import('../services/clean-cdn-audio.service.js');
                    const cdnRes = await CleanCdnAudioService.resolveAudio({
                        title: titleToUse,
                        primaryArtist: artistToUse,
                        duration: body.duration
                    });
                    if (cdnRes?.url && !cdnRes.url.includes('audio-ssl') && !cdnRes.url.includes('mzstatic') && !cdnRes.url.includes('itunes.apple.com')) {
                        return reply.send({
                            success: true,
                            audioUrl: cdnRes.url,
                            track: { id, title: titleToUse, artist: { name: artistToUse }, audioUrl: cdnRes.url }
                        });
                    }
                } catch {}
            }

            // 2. Full YouTube / R2 Stream Intake
            if (titleToUse) {
                try {
                    const { ExternalMetadataService } = await import('../services/external-metadata.service.js');
                    const fullResult = await ExternalMetadataService.fetchAudio(titleToUse, artistToUse, undefined, undefined, { preview: false, bypassCache: true });
                    if (fullResult?.url && !fullResult.url.includes('audio-ssl') && !fullResult.url.includes('mzstatic') && !fullResult.url.includes('itunes.apple.com')) {
                        return reply.send({
                            success: true,
                            audioUrl: fullResult.url,
                            track: { id, title: titleToUse, artist: { name: artistToUse }, audioUrl: fullResult.url }
                        });
                    }
                } catch {}
            }

            // 3. Fallback to /stream-youtube proxy
            const fallbackStreamUrl = `/api/utils/stream-youtube?url=${encodeURIComponent(`${artistToUse} - ${titleToUse}`)}&title=${encodeURIComponent(titleToUse)}&artist=${encodeURIComponent(artistToUse)}&trackId=${encodeURIComponent(id)}`;
            return reply.send({
                success: true,
                audioUrl: fallbackStreamUrl,
                track: { id, title: titleToUse, artist: { name: artistToUse }, audioUrl: fallbackStreamUrl }
            });

            // 5. Fallback: stream-youtube URL
            if (titleToUse) {
                const streamUrl = `/api/utils/stream-youtube?url=${encodeURIComponent(`${artistToUse} - ${titleToUse}`)}&title=${encodeURIComponent(titleToUse)}&artist=${encodeURIComponent(artistToUse)}&trackId=${id}`;
                return reply.send({
                    success: true,
                    audioUrl: streamUrl,
                    track: { id, title: titleToUse, artist: { name: artistToUse }, audioUrl: streamUrl }
                });
            }

            return reply.status(404).send({ error: 'Track not found in database' });
        }

        try {
            // 1. Clean CDN 320kbps (JioSaavn) Full Song Priority (Akamai edge direct streaming)
            try {
                const { CleanCdnAudioService } = await import('../services/clean-cdn-audio.service.js');
                const cdnRes = await CleanCdnAudioService.resolveAudio({
                    title: track.title,
                    primaryArtist: track.artist?.name || '',
                    album: track.album?.title,
                    duration: track.duration,
                    language: track.language || undefined
                });
                if (cdnRes?.url && !cdnRes.url.includes('audio-ssl') && !cdnRes.url.includes('mzstatic') && !cdnRes.url.includes('itunes.apple.com')) {
                    await prisma.track.update({
                        where: { id: track.id },
                        data: {
                            audioUrl: cdnRes.url,
                            audioResolutionScore: 100
                        }
                    }).catch(() => {});
                    return reply.send({
                        success: true,
                        audioUrl: cdnRes.url,
                        track: { ...track, audioUrl: cdnRes.url }
                    });
                }
            } catch (cdnErr) {
                console.warn('[RefetchAudio] Clean CDN resolution attempt:', cdnErr);
            }

            // Force re-resolution bypassing cached videoId
            const resolution = await AudioResolverService.resolveBestAudioSource({
                id: track.id,
                title: track.title,
                primaryArtist: track.artist?.name || '',
                album: track.album?.title,
                duration: track.duration,
                language: track.language || undefined
            }, true);

            if (!resolution.watchUrl && !resolution.streamUrl) {
                // Secondary Fallback: Try ExternalMetadataService.fetchAudio directly
                try {
                    const { ExternalMetadataService } = await import('../services/external-metadata.service.js');
                    const fallbackAudio = await ExternalMetadataService.fetchAudio(
                        track.title,
                        track.artist?.name || '',
                        track.duration,
                        undefined,
                        { bypassCache: true }
                    );
                    if (fallbackAudio && (fallbackAudio.watchUrl || fallbackAudio.url)) {
                        resolution.watchUrl = fallbackAudio.watchUrl || fallbackAudio.url;
                        resolution.streamUrl = fallbackAudio.url;
                        resolution.score = 75;
                        resolution.verified = true;
                    }
                } catch (fbErr) {
                    console.warn('[RefetchAudio] Secondary fetchAudio fallback failed:', fbErr);
                }

                // Tertiary Fallback: Generate stream proxy query
                if (!resolution.watchUrl && !resolution.streamUrl) {
                    const cleanT = track.title.replace(/\(.*?\)/g, '').split('|')[0].trim();
                    const cleanA = (track.artist?.name || '').split(/[,&/|]/)[0].trim();
                    const fallbackQuery = `${cleanA} - ${cleanT}`;
                    resolution.watchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(fallbackQuery)}`;
                    resolution.streamUrl = `/api/utils/stream-youtube?url=${encodeURIComponent(fallbackQuery)}&trackId=${track.id}&title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(cleanA)}`;
                    resolution.score = 60;
                    resolution.verified = true;
                }
            }

            // Invalidate cache
            youtubeStreamCache.delete(`track:${track.id}`);
            if (track.audioUrl) youtubeStreamCache.delete(track.audioUrl);

            // Update track in DB atomically without creating duplicate
            const newAudioUrl = resolution.streamUrl || `/api/utils/stream-youtube?url=${encodeURIComponent(resolution.watchUrl!)}&trackId=${track.id}&title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist?.name || '')}`;
            
            const updated = await prisma.track.update({
                where: { id: track.id },
                data: {
                    audioUrl: newAudioUrl,
                    youtubeId: resolution.videoId || track.youtubeId,
                    audioResolutionScore: resolution.score
                },
                include: { artist: true, album: true }
            });

            return reply.send({
                success: true,
                message: 'Audio source successfully refetched and verified',
                track: updated,
                audioUrl: updated.audioUrl,
                score: resolution.score,
                verified: resolution.verified
            });
        } catch (err: any) {
            server.log.error(`[RefetchAudio] Error for track ${id}: ${err.message}`);
            return reply.status(500).send({ error: 'Audio refetch failed', message: err.message });
        }
    });


    // Multi-Provider Manual and Automated Refetch Lyrics Endpoint
    server.post('/:id/refetch-lyrics', async (req, reply) => {
        const { id } = req.params as { id: string };
        const { provider = 'auto', force = true } = (req.body || {}) as { provider?: string; force?: boolean };
        const { prisma } = await import('../utils/prisma.js');
        const { LyricEnrichmentService } = await import('../services/lyric-enrichment.service.js');
        const { DeepgramLyricsService } = await import('../services/deepgram-lyrics.service.js');
        const { LyricsEnhancementService } = await import('../services/lyrics-enhancement.service.js');
        const { LyricsSyncService } = await import('../services/lyrics-sync.service.js');
        const { AIAudioAlignerService } = await import('../services/ai-audio-aligner.service.js');
        const { enqueueRomanization } = await import('../queues/romanization.queue.js');

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        let track = isUuid
            ? await prisma.track.findUnique({ where: { id }, include: { artist: true, album: true } })
            : await prisma.track.findFirst({
                where: { OR: [{ youtubeId: id }, { id }] },
                include: { artist: true, album: true }
              });

        if (!track) {
            const body = (req.body || {}) as any;
            if (body.title) {
                const cleanTitle = body.title.trim();
                const cleanArtist = (body.artistName || body.artist || '').trim();
                track = await prisma.track.findFirst({
                    where: {
                        title: { equals: cleanTitle, mode: 'insensitive' },
                        ...(cleanArtist ? { artist: { name: { equals: cleanArtist, mode: 'insensitive' } } } : {})
                    },
                    include: { artist: true, album: true }
                });
            }
        }

        if (!track) {
            return reply.status(404).send({ error: 'Track not found in database' });
        }

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

        try {
            if (provider === 'deepgram') {
                const dg = await DeepgramLyricsService.syncTrackLyrics(track.id, { force: true, tryVocals: true });
                if (dg?.syncedTokens?.length) {
                    syncedTokens = dg.syncedTokens;
                    plainLyrics = dg.plainLyrics || plainLyrics;
                    chosenSource = 'DEEPGRAM_AI';
                }
            } else if (provider === 'lrclib') {
                const lrc = await LyricsEnhancementService.fetchLRCLib(track.title, artistName, track.duration, targetLanguage);
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
                const sp = await LyricsEnhancementService.fetchSpotifyRapidApiLyrics(track.title, artistName);
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
                const mm = await LyricsEnhancementService.fetchMusixmatchRapidApiLyrics(track.title, artistName, track.duration)
                    || await LyricsEnhancementService.fetchMusixmatchLyrics(track.title, artistName);
                if (mm?.lyrics) {
                    plainLyrics = mm.lyrics;
                    chosenSource = 'MUSIXMATCH';
                }
            } else if (provider === 'genius') {
                const gn = await LyricsEnhancementService.fetchGeniusRapidApiLyrics(track.title, artistName)
                    || await LyricsEnhancementService.fetchGeniusRapidApi5Lyrics(track.title, artistName);
                if (gn?.lyrics) {
                    plainLyrics = gn.lyrics;
                    chosenSource = 'GENIUS';
                }
            } else if (provider === 'azlyrics') {
                const az = await LyricsEnhancementService.fetchAZLyrics(track.title, artistName);
                if (az?.lyrics) {
                    plainLyrics = az.lyrics;
                    chosenSource = 'AZLYRICS';
                }
            } else if (provider === 'youtube') {
                const yt = await LyricsSyncService.fetchYouTubeSubtitles(track.title, artistName, track.audioUrl || undefined, track.duration);
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
                    });
                    if (aligned?.syncedTokens?.length) {
                        syncedTokens = aligned.syncedTokens;
                        rawLrc = aligned.rawLrc;
                        chosenSource = 'AI_AUDIO_ALIGNER';
                    }
                }
            } else {
                // Auto / Best Available Pipeline:
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
                // 4. YouTube Subtitles
                if (!syncedTokens.length && track.audioUrl) {
                    const yt = await LyricsSyncService.fetchYouTubeSubtitles(track.title, artistName, track.audioUrl, track.duration).catch(() => null);
                    if (yt?.syncedTokens?.length) {
                        syncedTokens = yt.syncedTokens;
                        rawLrc = yt.rawLrc;
                        chosenSource = 'YOUTUBE_CAPTIONS';
                    }
                }
                // 5. Genius/AZLyrics + AI Alignment
                if (!syncedTokens.length && !plainLyrics.trim()) {
                    const gn = await LyricsEnhancementService.fetchGeniusRapidApiLyrics(track.title, artistName).catch(() => null)
                        || await LyricsEnhancementService.fetchAZLyrics(track.title, artistName).catch(() => null);
                    if (gn?.lyrics) {
                        plainLyrics = gn.lyrics;
                    }
                }
                if (!syncedTokens.length && plainLyrics.trim()) {
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
            }

            // Clean & structure lyrics
            if (syncedTokens.length > 0) {
                syncedTokens = syncedTokens.map(t => ({
                    ...t,
                    text: LyricEnrichmentService.formatLyricLine(t.text || '')
                }));
            }
            if (plainLyrics) {
                plainLyrics = plainLyrics.split('\n').map(l => LyricEnrichmentService.formatLyricLine(l)).join('\n');
            }

            // Update database
            const updateData: any = {};
            if (plainLyrics) updateData.lyrics = plainLyrics;
            if (syncedTokens.length > 0) {
                updateData.synced_lyrics = syncedTokens;
                updateData.sync_source = chosenSource;
                if (rawLrc) updateData.raw_lrc = rawLrc;
            }
            // Clear previous cross-language romanization so fresh romanization can run
            updateData.romanizedLyrics = null;
            updateData.romanizedSyncedLyrics = null;
            updateData.romanizedLang = null;

            const updated = await prisma.track.update({
                where: { id: track.id },
                data: updateData,
                select: { id: true, title: true, lyrics: true, synced_lyrics: true, raw_lrc: true, sync_source: true, romanizedLyrics: true, romanizedSyncedLyrics: true, romanizedLang: true }
            });

            // Enqueue romanization in background
            await enqueueRomanization({ trackId: track.id, force: true }).catch(() => {});

            return reply.send({
                success: true,
                message: `Lyrics refetched via ${chosenSource}`,
                provider: chosenSource,
                track: updated,
                syncedTokens: updated.synced_lyrics || [],
                plainLyrics: updated.lyrics || '',
                hasSynced: Boolean(updated.synced_lyrics && (updated.synced_lyrics as any[]).length > 0)
            });
        } catch (err: any) {
            server.log.error(`[RefetchLyrics] Error for track ${id}: ${err.message}`);
            return reply.status(500).send({ error: 'Lyrics refetch failed', message: err.message });
        }
    });

    server.post('/:id/like', {
        preHandler: [server.authenticate]
    }, trackController.toggleLike);
}
