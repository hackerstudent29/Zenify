import { FastifyReply, FastifyRequest } from 'fastify';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { ExternalMetadataService } from '../services/external-metadata.service';
import { LyricsSyncService } from '../services/lyrics-sync.service';
import { AILyricsService } from '../services/ai-lyrics.service';
import { AIAestheticService } from '../services/ai-aesthetic.service';
import { ArtistMappingService } from '../services/artist-mapping.service';
import { WhisperSyncService } from '../services/whisper-sync.service';
import { AIAudioAlignerService } from '../services/ai-audio-aligner.service.js';
import { isSafePublicUrl, assertSafePublicUrl } from '../utils/security';

export class MetadataController {
    fetchMetadata = async (req: FastifyRequest<{ Querystring: { url: string; fetchAudio?: string; mode?: string; preview?: string; nocache?: string; duration?: string } }>, reply: FastifyReply) => {
        let { url, fetchAudio, mode, preview, nocache, duration } = req.query;
        if (!url) {
            return reply.status(400).send({ message: 'URL is required' });
        }

        url = url.trim();
        // Extract the actual URL if embedded in text
        const urlMatch = url.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
            url = urlMatch[0];
        }

        let isUrl = url.startsWith('http');
        if (isUrl && !isSafePublicUrl(url)) {
            return reply.status(400).send({ message: 'Invalid or restricted URL target' });
        }

        // Resolve common mobile shorteners (spotify.link, apple.co)
        if (isUrl && (url.includes('spotify.link') || url.includes('apple.co'))) {
            try {
                const res = await axios.get(url, {
                    maxRedirects: 10,
                    timeout: 8000,
                    validateStatus: () => true, // Don't throw on error codes for redirects
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
                });
                // In Node.js, axios follows redirects and standard response.request.res.responseUrl gives final URL
                const resolvedUrl = res.request?.res?.responseUrl || res.request?.responseURL || res.config?.url;
                if (resolvedUrl && resolvedUrl !== url && resolvedUrl.startsWith('http')) {
                    console.log(`[Metadata] Resolved short URL: ${url} -> ${resolvedUrl}`);
                    url = resolvedUrl;
                }
            } catch (err: any) {
                console.warn('[Metadata] Short link resolution failed:', err.message);
            }
        }

        let metadata: any;

        if (mode === 'search' && !isUrl) {
            // Treat non-url as a direct search query if mode is search
            const parts = url.split(' - ');
            metadata = {
                title: parts[1]?.trim() || url,
                artist: parts[0]?.trim() || "Various Artists",
                cover: '/logo.png', // Generic fallback for search-only
                isCollection: false
            };

            // Immediately trigger audio and lyrics if requested for search mode
            const promises: Promise<any>[] = [];
            
            promises.push(
                ExternalMetadataService.fetchLyrics(metadata.title, metadata.artist, duration ? parseInt(duration) : undefined)
                    .then(lyrics => { if (lyrics) metadata.lyrics = lyrics; })
                    .catch(err => console.warn("Search-mode lyrics fetch failed:", err))
            );

            promises.push(
                LyricsSyncService.getSyncedLyrics(metadata.title, metadata.artist, undefined, undefined, duration ? parseInt(duration) : undefined)
                    .then(synced => { 
                        if (synced) {
                            (metadata as any).synced_lyrics = synced.syncedTokens;
                            (metadata as any).raw_lrc = synced.rawLrc;
                        }
                    })
                    .catch(err => console.warn("Search-mode synced lyrics fetch failed:", err))
            );

            if (fetchAudio === 'true') {
                // We ALWAYS fetch the preview-mode streaming URL and return both the preview stream and the permanent watchUrl!
                const targetDuration = duration ? parseInt(duration) : undefined;
                promises.push(
                    ExternalMetadataService.fetchAudio(metadata.title, metadata.artist, targetDuration, undefined, { 
                        preview: false,
                        bypassCache: nocache === 'true'
                    })
                        .then(audioResult => {
                            metadata.audioUrl = audioResult.watchUrl || audioResult.url; // Use watch URL as main audioUrl so it enqueues correctly
                            metadata.previewUrl = audioResult.url; // Playable preview stream link
                            metadata.duration = audioResult.duration || targetDuration;
                        })
                        .catch(err => {
                            console.warn("Search-mode audio fetch failed:", err);
                            metadata.audioError = err.message || "Unknown audio fetch error";
                        })
                );
            }
            
            // Timeout lyrics fetches after 6 seconds to prevent client connection timeouts
            const lyricsTimeout = new Promise((resolve) => setTimeout(resolve, 6000));
            await Promise.race([
                Promise.all(promises),
                lyricsTimeout
            ]);
        } else {
            metadata = await ExternalMetadataService.fetchFromUrl(url);

            // Run lyrics + audio fetch in parallel for single tracks (URL paths)
            if (metadata.title && !metadata.isCollection) {
                const artistToUse = metadata.artist || metadata.title;
                // 1. Fetch audio first if requested, to resolve accurate duration
                if (fetchAudio === 'true') {
                    let directUrl: string | undefined;
                    if (url.includes('youtube.com') || url.includes('youtu.be')) {
                        const videoIdMatch = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
                        directUrl = videoIdMatch
                            ? `https://www.youtube.com/watch?v=${videoIdMatch[1]}`
                            : url;
                        console.log(`[Audio] Using clean YouTube URL: ${directUrl}`);
                    }

                    try {
                        const preResolvedPreview = metadata.previewUrl;
                        const audioResult = await ExternalMetadataService.fetchAudio(metadata.title, artistToUse, metadata.duration, directUrl, { 
                            preview: false,
                            bypassCache: nocache === 'true'
                        });
                        metadata.audioUrl = audioResult.watchUrl || directUrl || audioResult.url;
                        metadata.previewUrl = audioResult.url || preResolvedPreview;
                        if (audioResult.duration) {
                            (metadata as any).duration = audioResult.duration;
                        }
                    } catch (err: any) {
                        console.warn("Could not auto-fetch audio:", err);
                        metadata.audioError = err.message || "Unknown audio fetch error";
                        
                        // If we already resolved a direct preview/audio URL during metadata lookup,
                        // keep it as the fallback and clear the error (since we actually have a working preview stream).
                        const is30sPreview = metadata.previewUrl && (metadata.previewUrl.includes('audio-ssl') || metadata.previewUrl.includes('itunes') || metadata.previewUrl.includes('mzstatic'));
                        if (metadata.previewUrl && !is30sPreview) {
                            metadata.audioUrl = metadata.previewUrl;
                            delete metadata.audioError;
                        } else if (!metadata.audioUrl || is30sPreview) {
                            const cleanTitle = (metadata.title || '').replace(/\(.*?\)/g, '').split('|')[0].trim();
                            const cleanArtist = (metadata.artist || '').split(/[,&/|]/)[0].trim();
                            metadata.audioUrl = `/api/utils/stream-youtube?url=${encodeURIComponent(`${cleanArtist} - ${cleanTitle}`)}`;
                            delete metadata.audioError;
                        }
                    }
                }

                // 2. Run plain and synced lyrics fetches in parallel
                const promises: Promise<any>[] = [];

                promises.push(
                    ExternalMetadataService.fetchLyrics(metadata.title, metadata.artist, (metadata as any).duration)
                        .then(lyrics => { if (lyrics) metadata.lyrics = lyrics; })
                        .catch(err => console.warn("Could not fetch plain lyrics:", err))
                );

                promises.push(
                    LyricsSyncService.getSyncedLyrics(metadata.title, metadata.artist, undefined, undefined, metadata.duration)
                        .then(synced => { 
                            if (synced) {
                                (metadata as any).synced_lyrics = synced.syncedTokens;
                                (metadata as any).raw_lrc = synced.rawLrc;
                            }
                        })
                        .catch(err => console.warn("Could not fetch synced lyrics during import:", err))
                );

                // Timeout lyrics fetches after 6 seconds to prevent client connection timeouts
                const lyricsTimeout = new Promise((resolve) => setTimeout(resolve, 6000));
                await Promise.race([
                    Promise.all(promises),
                    lyricsTimeout
                ]);
            }
        }

        // For collections, perform quick AI-free existence checks and return immediately
        if (metadata.isCollection && metadata.tracks && metadata.tracks.length > 0) {
            const artist = metadata.artist;
            const tracksToFetch = metadata.tracks;
            console.log(`[Metadata] Processing collection: ${metadata.title} (${tracksToFetch.length} tracks). Fast check enabled.`);

            // Use a higher concurrency limit since we are only performing local DB index queries
            const concurrencyLimit = 5;
            for (let i = 0; i < tracksToFetch.length; i += concurrencyLimit) {
                const chunk = tracksToFetch.slice(i, i + concurrencyLimit);
                
                await Promise.all(chunk.map(async (track: any) => {
                    try {
                        const trackArtistName = (track.artist || artist || 'Various Artists').trim();
                        
                        // Fast, AI-free existence check
                        const existing = await prisma.track.findFirst({
                            where: {
                                title: { equals: track.title.trim(), mode: 'insensitive' },
                                artist: { name: { equals: trackArtistName, mode: 'insensitive' } }
                            },
                            select: { id: true, isUnlisted: true, albumId: true }
                        });

                        if (existing) {
                            track.alreadyExists = true;
                            track.existingId = existing.id;
                            track.isUnlisted = existing.isUnlisted;
                            track.alreadyInAlbum = !!existing.albumId;
                        }
                    } catch (trackErr: any) {
                        console.error(`[Metadata] Error checking existence for "${track.title}":`, trackErr.message);
                    }
                }));
            }
            console.log(`[Metadata] Finished processing collection.`);
        } else if (metadata.title && metadata.artist) {
            // AI-Backed Smart Artist Mapping
            const resolvedArtist = await ArtistMappingService.resolveArtist(metadata.artist);
            const artistToMatch = resolvedArtist.id ? { id: resolvedArtist.id } : { name: { equals: resolvedArtist.name, mode: 'insensitive' as const } };

            // Existence Check for single tracks
            const existing = await prisma.track.findFirst({
                where: {
                    title: { equals: metadata.title, mode: 'insensitive' },
                    artist: artistToMatch
                }
            });
            if (existing) {
                metadata.alreadyExists = true;
                metadata.existingId = existing.id;
                metadata.isUnlisted = existing.isUnlisted;
                metadata.artist = resolvedArtist.name; // Use normalized name
            }
        }

        // Map previewUrl to stream proxy if it's a YouTube link and not already mapped
        if (metadata.audioUrl && (!metadata.previewUrl || !metadata.previewUrl.includes('/stream-youtube')) && (metadata.audioUrl.includes('youtube.com') || metadata.audioUrl.includes('youtu.be'))) {
            metadata.previewUrl = `/api/utils/stream-youtube?url=${encodeURIComponent(metadata.audioUrl)}`;
        }

        return reply.send(metadata);
    }
    
    syncLyrics = async (req: FastifyRequest<{ Body: { trackId?: string; title: string; artist: string; audioUrl?: string; rawLyrics?: string; duration?: number; force?: boolean } }>, reply: FastifyReply) => {
        const { trackId, title, artist, audioUrl, rawLyrics, duration, force } = req.body;
        if (!title || !artist) {
            return reply.status(400).send({ message: 'Title and Artist are required' });
        }
        
        try {
            const prisma = (await import('../utils/prisma.js')).prisma;
            
            // 1. Check DB first for pre-existing synced lyrics and track metadata
            const track = trackId 
                ? await prisma.track.findUnique({
                    where: { id: trackId },
                    select: { id: true, title: true, audioUrl: true, duration: true, lyrics: true, synced_lyrics: true, sync_source: true, romanizedLyrics: true, romanizedSyncedLyrics: true, romanizedLang: true }
                  })
                : await prisma.track.findFirst({
                    where: { 
                        title: { equals: title, mode: 'insensitive' }, 
                        artist: { name: { equals: artist, mode: 'insensitive' } } 
                    },
                    select: { id: true, title: true, audioUrl: true, duration: true, lyrics: true, synced_lyrics: true, sync_source: true, romanizedLyrics: true, romanizedSyncedLyrics: true, romanizedLang: true }
                  });

            const targetLang = (track as any)?.language || (
                (title || track?.title || '').toLowerCase().includes('tamil') ? 'tamil' :
                (title || track?.title || '').toLowerCase().includes('telugu') ? 'telugu' :
                (title || track?.title || '').toLowerCase().includes('hindi') ? 'hindi' :
                (title || track?.title || '').toLowerCase().includes('malayalam') ? 'malayalam' :
                (title || track?.title || '').toLowerCase().includes('kannada') ? 'kannada' : undefined
            );

            const { LyricsEnhancementService } = await import('../services/lyrics-enhancement.service.js');
            const hasLangMismatch = Boolean(
                targetLang && track && (
                    (track.lyrics && LyricsEnhancementService.isLyricsLanguageMismatch(track.lyrics, targetLang)) ||
                    (Array.isArray(track.synced_lyrics) && LyricsEnhancementService.isLyricsLanguageMismatch(track.synced_lyrics.map((t: any) => t.text).join(' '), targetLang))
                )
            );

            if (!force && !hasLangMismatch && track && track.synced_lyrics && Array.isArray(track.synced_lyrics) && track.synced_lyrics.length > 0) {
                console.log(`[LyricsSync] Found pre-existing synced lyrics in DB for track: ${track.id}`);
                // If romanization is missing and track contains regional non-Latin text, enqueue background romanization
                if (!track.romanizedLyrics) {
                    const combined = (track.lyrics || '') + ' ' + (track.synced_lyrics as any[]).map(t => t.text || '').join(' ');
                    import('../services/romanization.service.js').then(({ RomanizationService }) => {
                        if (RomanizationService.containsNonLatin(combined)) {
                            import('../queues/romanization.queue.js').then(({ enqueueRomanization }) => {
                                enqueueRomanization({ trackId: track.id }).catch(() => {});
                            });
                        }
                    }).catch(() => {});
                }
                const hasWordGranularity = Array.isArray(track.synced_lyrics) && (track.synced_lyrics as any[]).some(t => t.words && t.words.length > 0);
                return reply.send({ 
                    status: 'available',
                    syncedTokens: track.synced_lyrics, 
                    source: track.sync_source || 'DB',
                    granularity: hasWordGranularity ? 'word' : 'line',
                    autoGenerated: track.sync_source === 'deepgram_auto_generated' || track.sync_source === 'DEEPGRAM_STT',
                    romanizedLyrics: track.romanizedLyrics,
                    romanizedSyncedLyrics: track.romanizedSyncedLyrics,
                    romanizedLang: track.romanizedLang
                });
            }

            const effectiveAudioUrl = audioUrl || track?.audioUrl || undefined;
            const effectiveLyrics = hasLangMismatch ? undefined : (rawLyrics || track?.lyrics || undefined);
            const numDuration = duration || track?.duration || undefined;

            const syncedData = await LyricsSyncService.getSyncedLyrics(title, artist, effectiveAudioUrl, effectiveLyrics, numDuration, undefined, track?.id);
            
            if (syncedData && syncedData.syncedTokens && syncedData.syncedTokens.length > 0) {
                // Background: Persist lyrics to DB if track exists
                if (track) {
                    const songLang = await LyricsSyncService.detectSongLanguage(title, artist, effectiveLyrics || syncedData.plainLyrics || undefined);
                    const updateData: any = {
                        language: songLang,
                        synced_lyrics: syncedData.syncedTokens,
                        raw_lrc: syncedData.rawLrc,
                        sync_source: syncedData.source || 'DEEPGRAM'
                    };

                    const newPlainLyrics = syncedData.plainLyrics || effectiveLyrics;
                    if (newPlainLyrics && (!track.lyrics || track.lyrics.trim().length === 0 || force || syncedData.source === 'INSTRUMENTAL')) {
                        updateData.lyrics = newPlainLyrics;
                    }

                    await prisma.track.update({
                        where: { id: track.id },
                        data: updateData
                    });
                    console.log(`[LyricsSync] Persisted discovered lyrics (${syncedData.source}, granularity: ${syncedData.granularity}) and language "${songLang}" for track: ${track.id}`);

                    // Trigger background romanization
                    const { enqueueRomanization } = await import('../queues/romanization.queue.js');
                    await enqueueRomanization({ trackId: track.id });
                }

                return reply.send({ 
                    status: 'available',
                    syncedTokens: syncedData.syncedTokens, 
                    source: syncedData.source,
                    granularity: syncedData.granularity || (syncedData.syncedTokens.some((t: any) => t.words && t.words.length > 0) ? 'word' : 'line'),
                    autoGenerated: !!syncedData.autoGenerated,
                    romanizedLyrics: track?.romanizedLyrics,
                    romanizedSyncedLyrics: track?.romanizedSyncedLyrics,
                    romanizedLang: track?.romanizedLang
                });
            } else {
                // Synced lyrics not immediately available: inspect enrichment job or enqueue background enrichment
                if (track) {
                    const lyricJob = await prisma.lyricEnrichmentJob.findUnique({ where: { trackId: track.id } });
                    if (lyricJob) {
                        if (['searching_lyrics', 'transcribing', 'aligning'].includes(lyricJob.status)) {
                            return reply.send({
                                status: 'processing',
                                syncedTokens: [],
                                message: 'Lyrics synchronization currently in progress',
                                retryAfter: 3
                            });
                        }
                        if (lyricJob.status === 'no_lyrics_detected') {
                            return reply.send({
                                status: 'not_found',
                                syncedTokens: [{ time: 0, text: '• • •' }],
                                source: 'INSTRUMENTAL',
                                message: 'No vocal lyrics detected for this track'
                            });
                        }
                    }

                    // Enqueue background processing asynchronously if eligible
                    const { LyricEnrichmentService } = await import('../services/lyric-enrichment.service.js');
                    LyricEnrichmentService.processTrack(track.id, { force: true }).catch(err => {
                        console.warn(`[LyricsSync] Background enrichment error for ${track.id}:`, err.message);
                    });

                    return reply.send({
                        status: 'processing',
                        syncedTokens: [],
                        message: 'Searching and synchronizing lyrics...',
                        retryAfter: 3
                    });
                }

                return reply.send({
                    status: 'not_found',
                    syncedTokens: [],
                    message: 'No synced lyrics found for this track'
                });
            }
        } catch (err: any) {
            console.error('Lyrics sync routing error:', err);
            return reply.status(500).send({ 
                status: 'failed',
                message: 'Sync engine error',
                syncedTokens: []
            });
        }
    }

    deepgramSync = async (req: FastifyRequest<{ Body: { trackId: string; tryVocals?: boolean; force?: boolean; plainLyrics?: string; language?: string } }>, reply: FastifyReply) => {
        const { trackId, tryVocals, force, plainLyrics, language } = req.body;
        if (!trackId) {
            return reply.status(400).send({ message: 'trackId is required' });
        }

        try {
            const { DeepgramLyricsService } = await import('../services/deepgram-lyrics.service.js');
            let result = await DeepgramLyricsService.syncTrackLyrics(trackId, {
                tryVocals: tryVocals ?? false,
                force: force ?? true,
                plainLyrics,
                language
            });

            // Resilient Fallback: If Deepgram returned 0 tokens or failed, fallback to AIAudioAlignerService if lyrics exist
            if (!result || !result.syncedTokens || result.syncedTokens.length === 0) {
                console.warn(`[Deepgram] Deepgram returned no tokens. Falling back to High-Precision AI Audio Aligner...`);
                const track = await prisma.track.findUnique({
                    where: { id: trackId },
                    select: { lyrics: true, audioUrl: true, duration: true, title: true }
                });
                const lyricsToAlign = plainLyrics || track?.lyrics;

                if (lyricsToAlign && lyricsToAlign.trim().length > 0) {
                    const { AIAudioAlignerService } = await import('../services/ai-audio-aligner.service.js');
                    const aiResult = await AIAudioAlignerService.alignPlainLyricsToAudio({
                        trackId,
                        audioUrl: track?.audioUrl || undefined,
                        plainLyrics: lyricsToAlign,
                        duration: track?.duration || undefined,
                        title: track?.title || undefined
                    });

                    if (aiResult && aiResult.syncedTokens && aiResult.syncedTokens.length > 0) {
                        await prisma.track.update({
                            where: { id: trackId },
                            data: {
                                lyrics: lyricsToAlign,
                                synced_lyrics: aiResult.syncedTokens as any,
                                raw_lrc: aiResult.rawLrc,
                                sync_source: 'AI_ACOUSTIC_ALIGNMENT'
                            }
                        });

                        const { enqueueRomanization } = await import('../queues/romanization.queue.js');
                        await enqueueRomanization({ trackId });

                        return reply.send({
                            success: true,
                            syncedTokens: aiResult.syncedTokens,
                            plainLyrics: lyricsToAlign,
                            source: 'AI_ACOUSTIC_ALIGNMENT',
                            note: 'Deepgram was unavailable or returned no tokens; successfully matched via AI Acoustic Aligner.'
                        });
                    }
                }
            }

            if (result && result.syncedTokens && result.syncedTokens.length > 0) {
                const { enqueueRomanization } = await import('../queues/romanization.queue.js');
                await enqueueRomanization({ trackId });
                return reply.send({ 
                    success: true, 
                    syncedTokens: result.syncedTokens,
                    plainLyrics: result.plainLyrics,
                    source: result.source,
                    language: (result as any).language || 'English',
                    romanizedLang: (result as any).romanizedLang
                });
            } else {
                return reply.status(422).send({ message: 'Could not generate audio timestamps. Please verify audio stream and plain lyrics.' });
            }
        } catch (err: any) {
            console.error('Deepgram sync error:', err);
            return reply.status(500).send({ message: `Audio sync error: ${err.message}` });
        }
    }

    whisperSync = async (req: FastifyRequest<{ Body: { trackId: string } }>, reply: FastifyReply) => {
        const { trackId } = req.body;
        if (!trackId) {
            return reply.status(400).send({ message: 'trackId is required' });
        }

        try {
            const synced = await WhisperSyncService.syncTrack(trackId);
            if (synced) {
                const { enqueueRomanization } = await import('../queues/romanization.queue.js');
                await enqueueRomanization({ trackId });
                return reply.send({ success: true, syncedTokens: synced });
            } else {
                return reply.status(400).send({ message: 'Whisper sync failed' });
            }
        } catch (err: any) {
            console.error('Whisper sync error:', err);
            return reply.status(500).send({ message: 'Whisper sync engine crashed' });
        }
    }


    syncAesthetic = async (req: FastifyRequest<{ Body: { trackId?: string; albumId?: string } }>, reply: FastifyReply) => {
        const { trackId, albumId } = req.body;
        if (!trackId && !albumId) {
            return reply.status(400).send({ message: 'trackId or albumId is required' });
        }

        try {
            if (trackId) {
                const result = await AIAestheticService.syncTrackAesthetic(trackId);
                return reply.send({ success: !!result, data: result });
            } else if (albumId) {
                const result = await AIAestheticService.syncAlbumAesthetic(albumId!);
                return reply.send({ success: !!result, data: result });
            }
        } catch (err: any) {
            console.error('Aesthetic sync error:', err);
            return reply.status(500).send({ message: 'Aesthetic sync failed' });
        }
    }

    generateLyricsInsight = async (req: FastifyRequest<{ Body: { trackId: string } }>, reply: FastifyReply) => {
        const { trackId } = req.body;
        if (!trackId) return reply.status(400).send({ message: 'trackId is required' });

        try {
            const insight = await AILyricsService.generateLyricsInsight(trackId);
            if (insight) {
                return reply.send({ insight });
            } else {
                return reply.status(404).send({ message: 'Failed to generate insight or lyrics missing' });
            }
        } catch (err) {
            return reply.status(500).send({ message: 'AI Insight Error' });
        }
    }

    /** 100% Free AI Audio-to-Lyrics Timestamp Alignment Engine for plain pasted lyrics */
    alignPlainLyrics = async (req: FastifyRequest<{
        Body: {
            trackId?: string;
            audioUrl?: string;
            plainLyrics: string;
            title?: string;
            artist?: string;
            duration?: number;
        }
    }>, reply: FastifyReply) => {
        const { trackId, audioUrl, plainLyrics, title, artist, duration } = req.body;

        if (!plainLyrics || !plainLyrics.trim()) {
            return reply.status(400).send({ message: 'Plain lyrics text is required' });
        }

        try {
            const result = await AIAudioAlignerService.alignPlainLyricsToAudio({
                trackId,
                audioUrl,
                plainLyrics,
                title,
                artist,
                duration
            });

            return reply.send(result);
        } catch (err: any) {
            console.error('[MetadataController] alignPlainLyrics error:', err);
            return reply.status(500).send({ message: err?.message || 'Failed to align plain lyrics to audio' });
        }
    }

    /** On-demand regional transliteration & Deepgram synchronization */
    romanizeTrack = async (req: FastifyRequest<{ Body: { trackId: string; force?: boolean } }>, reply: FastifyReply) => {
        const { trackId, force } = req.body;
        if (!trackId) {
            return reply.status(400).send({ message: 'trackId is required' });
        }
        try {
            const prisma = (await import('../utils/prisma.js')).prisma;
            const track = await prisma.track.findUnique({
                where: { id: trackId },
                select: { id: true, title: true, lyrics: true, synced_lyrics: true, audioUrl: true, romanizedLyrics: true, romanizedSyncedLyrics: true, romanizedLang: true }
            });
            if (!track) {
                return reply.status(404).send({ message: 'Track not found' });
            }

            const { RomanizationService } = await import('../services/romanization.service.js');
            const hasLyrics = Boolean(track.lyrics?.trim() || (Array.isArray(track.synced_lyrics) && track.synced_lyrics.length > 0));

            if (hasLyrics) {
                const result = await RomanizationService.processTrack(track.id, force ?? true);
                const updated = await prisma.track.findUnique({
                    where: { id: track.id },
                    select: { romanizedLyrics: true, romanizedSyncedLyrics: true, romanizedLang: true }
                });
                return reply.send({
                    success: true,
                    romanizedLyrics: updated?.romanizedLyrics,
                    romanizedSyncedLyrics: updated?.romanizedSyncedLyrics,
                    romanizedLang: updated?.romanizedLang || result.lang
                });
            }

            // If track has NO lyrics, attempt Deepgram STT worker
            if (track.audioUrl) {
                const { DeepgramLyricsService } = await import('../services/deepgram-lyrics.service.js');
                if (DeepgramLyricsService.isAvailable()) {
                    console.log(`[RomanizationController] No lyrics found for "${track.title}". Invoking Deepgram STT worker...`);
                    const dgResult = await DeepgramLyricsService.syncTrackLyrics(track.id, { force: true });
                    if (dgResult && dgResult.syncedTokens && dgResult.syncedTokens.length > 0) {
                        const updated = await prisma.track.findUnique({
                            where: { id: track.id },
                            select: { romanizedLyrics: true, romanizedSyncedLyrics: true, romanizedLang: true, synced_lyrics: true }
                        });
                        return reply.send({
                            success: true,
                            romanizedLyrics: updated?.romanizedLyrics,
                            romanizedSyncedLyrics: updated?.romanizedSyncedLyrics,
                            romanizedLang: updated?.romanizedLang,
                            syncedTokens: updated?.synced_lyrics
                        });
                    }
                }
            }

            return reply.send({
                success: false,
                message: 'No lyrics available to transliterate'
            });
        } catch (err: any) {
            console.error(`[RomanizationController] Error romanizing track ${trackId}:`, err);
            return reply.status(500).send({ success: false, error: err.message });
        }
    };

    /** Save manually synced lyrics from the Lyric Sync Studio admin tool */
    saveSyncedLyrics = async (req: FastifyRequest<{ 
        Body: { trackId: string; syncedTokens: Array<{ time: number; text: string }>; rawLrc?: string; language?: string } 
    }>, reply: FastifyReply) => {
        const { trackId, syncedTokens, rawLrc, language } = req.body;

        if (!trackId) return reply.status(400).send({ message: 'trackId is required' });
        if (!syncedTokens || syncedTokens.length === 0) return reply.status(400).send({ message: 'syncedTokens are required' });

        try {
            const track = await prisma.track.findUnique({ where: { id: trackId }, select: { id: true, title: true, lyric_versions: true } });
            if (!track) return reply.status(404).send({ message: 'Track not found' });

            // Generate raw LRC from tokens if not provided
            const generatedLrc = rawLrc || syncedTokens
                .filter(t => t.time !== null && t.time !== undefined)
                .map(t => {
                    const mins = Math.floor(t.time! / 60);
                    const secs = Math.floor(t.time! % 60);
                    const ms = Math.round((t.time! % 1) * 100);
                    return `[${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}]${t.text}`;
                }).join('\n');

            const plainLyricsText = syncedTokens.map(t => t.text).join('\n');

            let lyricVersions: any[] = Array.isArray(track.lyric_versions) ? track.lyric_versions : [];
            const targetLang = language || 'English';
            
            const newVersion = {
                language: targetLang,
                plainLyrics: plainLyricsText,
                syncedLyrics: syncedTokens,
                rawLrc: generatedLrc
            };

            const existingIndex = lyricVersions.findIndex((v: any) => v.language?.toLowerCase() === targetLang.toLowerCase());
            if (existingIndex !== -1) {
                lyricVersions[existingIndex] = newVersion;
            } else {
                lyricVersions.push(newVersion);
            }

            let updateData: any = { lyric_versions: lyricVersions };
            
            // Keep backwards compatibility for the first/primary version
            if (existingIndex === 0 || lyricVersions.length === 1) {
                updateData.synced_lyrics = syncedTokens as any;
                updateData.raw_lrc = generatedLrc;
                updateData.lyrics = plainLyricsText;
            }

            await prisma.track.update({
                where: { id: trackId },
                data: updateData
            });

            // Trigger background romanization for newly saved synced lyrics
            const { enqueueRomanization } = await import('../queues/romanization.queue.js');
            await enqueueRomanization({ trackId, force: true });

            return reply.send({ 
                success: true, 
                message: `Saved ${syncedTokens.length} synced lyric lines for "${track.title}"`,
                linesCount: syncedTokens.length
            });
        } catch (err: any) {
            console.error('[MetadataController] saveSyncedLyrics error:', err);
            return reply.status(500).send({ message: 'Failed to save synced lyrics' });
        }
    }

    importLyrics = async (req: FastifyRequest<{ 
        Body: { 
            trackId?: string; 
            title?: string; 
            artist?: string; 
            url?: string; 
            duration?: number;
        } 
    }>, reply: FastifyReply) => {
        const { trackId, title, artist, url, duration } = req.body;

        try {
            // Case 1: URL provided
            if (url && typeof url === 'string' && url.startsWith('http')) {
                const trimmedUrl = url.trim();
                let parsedUrl: URL;
                try {
                    parsedUrl = new URL(trimmedUrl);
                } catch {
                    return reply.status(400).send({ message: 'Invalid URL provided' });
                }

                const isSafe = await assertSafePublicUrl(trimmedUrl);
                if (!isSafe) {
                    return reply.status(403).send({ message: 'Restricted, private, or invalid destination address' });
                }

                const hostname = parsedUrl.hostname.toLowerCase();

                // Case A: Genius URL
                if (hostname === 'genius.com' || hostname.endsWith('.genius.com')) {
                    console.log(`[LyricsImport] Scraping specific Genius URL: ${trimmedUrl}`);
                    const pageRes = await axios.get(trimmedUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        },
                        timeout: 8000,
                        maxRedirects: 3
                    });

                    const $ = cheerio.load(pageRes.data);
                    let lyricsText = '';
                    $('[class^="Lyrics__Container"]').each((i, el) => {
                        $(el).find('br').replaceWith('\n');
                        lyricsText += $(el).text() + '\n';
                    });

                    if (!lyricsText.trim()) {
                        lyricsText = $('.lyrics').text();
                    }

                    const plain = lyricsText.trim();
                    if (!plain) {
                        return reply.status(404).send({ message: 'No lyrics found on this Genius page' });
                    }

                    return reply.send({
                        success: true,
                        plainLyrics: plain,
                        source: 'Genius Scraper'
                    });
                }

                // Case B: YouTube URL
                if (trimmedUrl.includes('youtube.com') || trimmedUrl.includes('youtu.be')) {
                    console.log(`[LyricsImport] Fetching subtitles for YouTube video: ${trimmedUrl}`);
                    const songLang = (title && artist) 
                        ? await LyricsSyncService.detectSongLanguage(title, artist)
                        : 'english';

                    const ytSynced = await LyricsSyncService.fetchYouTubeSubtitles(
                        title || 'Unknown Track', 
                        artist || 'Unknown Artist', 
                        trimmedUrl, 
                        duration, 
                        songLang
                    );

                    if (ytSynced && ytSynced.syncedTokens && ytSynced.syncedTokens.length > 0) {
                        return reply.send({
                            success: true,
                            syncedLyrics: ytSynced.syncedTokens,
                            rawLrc: ytSynced.rawLrc,
                            source: 'YouTube Subtitles'
                        });
                    }

                    return reply.status(404).send({ message: 'No subtitles/captions found for this YouTube video' });
                }

                // Default Case: Spotify, Apple Music, or other track URLs
                console.log(`[LyricsImport] Processing metadata URL: ${trimmedUrl}`);
                const metadata = await ExternalMetadataService.fetchFromUrl(trimmedUrl);

                if (metadata && metadata.title && metadata.artist) {
                    const resolvedTitle = metadata.title;
                    const resolvedArtist = metadata.artist;
                    const resolvedDuration = metadata.duration || duration;

                    console.log(`[LyricsImport] Resolved URL metadata: "${resolvedTitle}" by "${resolvedArtist}"`);

                    const songLang = await LyricsSyncService.detectSongLanguage(resolvedTitle, resolvedArtist);
                    
                    const syncedData = await LyricsSyncService.getSyncedLyrics(
                        resolvedTitle, 
                        resolvedArtist, 
                        undefined, 
                        undefined, 
                        resolvedDuration
                    );

                    const plainLyrics = await LyricsSyncService.scrapeGeniusLyrics(resolvedTitle, resolvedArtist, songLang) || undefined;

                    return reply.send({
                        success: true,
                        title: resolvedTitle,
                        artist: resolvedArtist,
                        duration: resolvedDuration,
                        syncedLyrics: syncedData?.syncedTokens,
                        rawLrc: syncedData?.rawLrc,
                        plainLyrics: plainLyrics,
                        language: songLang,
                        source: 'Metadata URL Resolution'
                    });
                }

                return reply.status(400).send({ message: 'Failed to extract track metadata from this URL' });
            }

            // Case 2: No URL, search using title/artist metadata
            const searchTitle = title || '';
            const searchArtist = artist || '';

            if (!searchTitle && !searchArtist && trackId) {
                const track = await prisma.track.findUnique({
                    where: { id: trackId },
                    include: { artist: true }
                });
                if (track) {
                    return reply.send({
                        success: true,
                        title: track.title,
                        artist: track.artist?.name || "Unknown Artist",
                        duration: track.duration,
                        syncedLyrics: track.synced_lyrics,
                        rawLrc: track.raw_lrc,
                        plainLyrics: track.lyrics,
                        source: 'Local Database'
                    });
                }
            }

            if (!searchTitle || !searchArtist) {
                return reply.status(400).send({ message: 'Title and Artist, or a URL, are required to search lyrics' });
            }

            console.log(`[LyricsImport] Online search for lyrics: "${searchTitle}" by "${searchArtist}"`);

            const songLang = await LyricsSyncService.detectSongLanguage(searchTitle, searchArtist);
            
            const syncedData = await LyricsSyncService.getSyncedLyrics(
                searchTitle, 
                searchArtist, 
                undefined, 
                undefined, 
                duration
            );

            const plainLyrics = await LyricsSyncService.scrapeGeniusLyrics(searchTitle, searchArtist, songLang) || undefined;

            return reply.send({
                success: true,
                title: searchTitle,
                artist: searchArtist,
                syncedLyrics: syncedData?.syncedTokens,
                rawLrc: syncedData?.rawLrc,
                plainLyrics: plainLyrics,
                language: songLang,
                source: 'Online Search'
            });

        } catch (err: any) {
            console.error('[MetadataController] importLyrics error:', err);
            return reply.status(500).send({ message: err.message || 'Lyrics import failed' });
        }
    }

    getLyricEnrichmentStats = async (req: FastifyRequest, reply: FastifyReply) => {
        try {
            const { LyricEnrichmentService } = await import('../services/lyric-enrichment.service.js');
            const { ElasticLyricWorker } = await import('../queues/lyric-enrichment.worker.js');
            const stats = await LyricEnrichmentService.getStats();
            const workerMetrics = ElasticLyricWorker.getMetrics();
            return reply.send({
                ...stats,
                worker: workerMetrics
            });
        } catch (err: any) {
            console.error('[MetadataController] getLyricEnrichmentStats error:', err);
            return reply.status(500).send({ message: err.message || 'Failed to get stats' });
        }
    };

    triggerLyricEnrichmentSweep = async (req: FastifyRequest, reply: FastifyReply) => {
        try {
            const { LyricEnrichmentWorker } = await import('../queues/lyric-enrichment.worker.js');
            const result = await LyricEnrichmentWorker.runSweep();
            return reply.send({ success: true, ...result });
        } catch (err: any) {
            console.error('[MetadataController] triggerLyricEnrichmentSweep error:', err);
            return reply.status(500).send({ message: err.message || 'Sweep trigger failed' });
        }
    };

    reprocessTrackLyrics = async (req: FastifyRequest<{ Body: { trackId: string } }>, reply: FastifyReply) => {
        try {
            const { trackId } = req.body;
            if (!trackId) {
                return reply.status(400).send({ message: 'trackId is required' });
            }
            const { ElasticLyricWorker } = await import('../queues/lyric-enrichment.worker.js');
            const result = await ElasticLyricWorker.enqueue(trackId, { force: true, userInitiated: true, priority: 100 });
            return reply.send(result);
        } catch (err: any) {
            console.error('[MetadataController] reprocessTrackLyrics error:', err);
            return reply.status(500).send({ message: err.message || 'Reprocess failed' });
        }
    };

    calibrateLyricsOnset = async (req: FastifyRequest<{ Body: { trackId: string } }>, reply: FastifyReply) => {
        try {
            const { trackId } = req.body;
            if (!trackId) {
                return reply.status(400).send({ message: 'trackId is required' });
            }
            const { LyricEnrichmentService } = await import('../services/lyric-enrichment.service.js');
            const result = await LyricEnrichmentService.verifyTrackLyricsOnset(trackId);
            return reply.send({ success: true, ...result });
        } catch (err: any) {
            console.error('[MetadataController] calibrateLyricsOnset error:', err);
            return reply.status(500).send({ message: err.message || 'Calibration failed' });
        }
    };

    getPlaybackHealthReport = async (req: FastifyRequest, reply: FastifyReply) => {
        try {
            const { SongPlaybackHealthService } = await import('../services/song-playback-health.service.js');
            const report = await SongPlaybackHealthService.getHealthReport();
            return reply.send(report);
        } catch (err: any) {
            console.error('[MetadataController] getPlaybackHealthReport error:', err);
            return reply.status(500).send({ message: err.message || 'Failed to get health report' });
        }
    };

    triggerPlaybackHealthSweep = async (req: FastifyRequest<{ Body?: { batchSize?: number } }>, reply: FastifyReply) => {
        try {
            const batchSize = (req.body as any)?.batchSize || 25;
            const { SongPlaybackHealthService } = await import('../services/song-playback-health.service.js');
            const result = await SongPlaybackHealthService.runAutomatedHealthSweep(batchSize);
            return reply.send({ success: true, ...result });
        } catch (err: any) {
            console.error('[MetadataController] triggerPlaybackHealthSweep error:', err);
            return reply.status(500).send({ message: err.message || 'Health sweep failed' });
        }
    };

    diagnoseAndHealTrack = async (req: FastifyRequest<{ Body: { trackId: string } }>, reply: FastifyReply) => {
        try {
            const { trackId } = req.body;
            if (!trackId) {
                return reply.status(400).send({ message: 'trackId is required' });
            }
            const { SongPlaybackHealthService } = await import('../services/song-playback-health.service.js');
            const analysis = await SongPlaybackHealthService.analyzeTrackPlaybackHealth(trackId);
            let healResult = null;
            if (!analysis.isHealthy) {
                healResult = await SongPlaybackHealthService.healTrackPlayback(trackId, analysis.issue || undefined);
            }
            return reply.send({
                success: true,
                analysis,
                healed: !!healResult?.success,
                healResult
            });
        } catch (err: any) {
            console.error('[MetadataController] diagnoseAndHealTrack error:', err);
            return reply.status(500).send({ message: err.message || 'Track diagnosis failed' });
        }
    };

    getAllWorkersStatus = async (req: FastifyRequest, reply: FastifyReply) => {
        try {
            const { ElasticLyricWorker } = await import('../queues/lyric-enrichment.worker.js');
            const { LyricEnrichmentService } = await import('../services/lyric-enrichment.service.js');
            const { SongPlaybackHealthService } = await import('../services/song-playback-health.service.js');

            const lyricWorkerMetrics = ElasticLyricWorker.getMetrics();
            const lyricStats = await LyricEnrichmentService.getStats();
            const healthReport = await SongPlaybackHealthService.getHealthReport();

            return reply.send({
                timestamp: new Date().toISOString(),
                workers: {
                    lyricsWorker: {
                        status: 'ONLINE',
                        elasticMetrics: lyricWorkerMetrics,
                        databaseStats: lyricStats
                    },
                    playbackHealthChecker: {
                        status: 'ONLINE',
                        latestReport: healthReport
                    },
                    metadataEnrichment: {
                        status: 'ONLINE',
                        intervalMinutes: 30,
                        bootTrigger: true
                    },
                    romanizationQueue: {
                        status: 'ONLINE',
                        intervalMinutes: 15,
                        bootTrigger: true
                    },
                    deduplicationService: {
                        status: 'ONLINE',
                        intervalMinutes: 10,
                        bootTrigger: true
                    }
                }
            });
        } catch (err: any) {
            console.error('[MetadataController] getAllWorkersStatus error:', err);
            return reply.status(500).send({ message: err.message || 'Failed to get workers status' });
        }
    };
}

