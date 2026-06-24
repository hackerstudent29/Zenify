import { FastifyReply, FastifyRequest } from 'fastify';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { ExternalMetadataService } from '../services/external-metadata.service';
import { LyricsSyncService } from '../services/lyrics-sync.service';
import { AILyricsService } from '../services/ai-lyrics.service';
import { AIAestheticService } from '../services/ai-aesthetic.service';
import { ArtistMappingService } from '../services/artist-mapping.service';
import { WhisperSyncService } from '../services/whisper-sync.service';
import { prisma } from '../utils/prisma';

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
                        preview: true,
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
            if (metadata.title && metadata.artist && !metadata.isCollection) {
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
                        const audioResult = await ExternalMetadataService.fetchAudio(metadata.title, metadata.artist, metadata.duration, directUrl, { 
                            preview: true,
                            bypassCache: nocache === 'true'
                        });
                        metadata.audioUrl = audioResult.watchUrl || directUrl || audioResult.url;
                        metadata.previewUrl = preResolvedPreview || audioResult.url;
                        if (audioResult.duration) {
                            (metadata as any).duration = audioResult.duration;
                        }
                    } catch (err: any) {
                        console.warn("Could not auto-fetch audio:", err);
                        metadata.audioError = err.message || "Unknown audio fetch error";
                        
                        // If we already resolved a direct preview/audio URL during metadata lookup,
                        // keep it as the fallback and clear the error (since we actually have a working preview stream).
                        if (metadata.previewUrl) {
                            metadata.audioUrl = metadata.previewUrl;
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
        if (metadata.previewUrl && !metadata.previewUrl.includes('/stream-youtube') && (metadata.previewUrl.includes('youtube.com') || metadata.previewUrl.includes('youtu.be'))) {
            metadata.previewUrl = `/api/utils/stream-youtube?url=${encodeURIComponent(metadata.previewUrl)}`;
        }

        return reply.send(metadata);
    }
    
    syncLyrics = async (req: FastifyRequest<{ Body: { trackId?: string; title: string; artist: string; audioUrl?: string; rawLyrics?: string; duration?: number } }>, reply: FastifyReply) => {
        const { trackId, title, artist, audioUrl, rawLyrics, duration } = req.body;
        if (!title || !artist) {
            return reply.status(400).send({ message: 'Title and Artist are required' });
        }
        
        try {
            const prisma = (await import('../utils/prisma.js')).prisma;
            
            // 1. Check DB first for pre-existing synced lyrics
            const track = trackId 
                ? await prisma.track.findUnique({
                    where: { id: trackId },
                    select: { id: true, synced_lyrics: true }
                  })
                : await prisma.track.findFirst({
                    where: { 
                        title: { equals: title, mode: 'insensitive' }, 
                        artist: { name: { equals: artist, mode: 'insensitive' } } 
                    },
                    select: { id: true, synced_lyrics: true }
                  });

            if (track && track.synced_lyrics) {
                console.log(`[LyricsSync] Found pre-existing synced lyrics in DB for track: ${track.id}`);
                return reply.send({ syncedTokens: track.synced_lyrics });
            }

            const numDuration = duration;
            const syncedData = await LyricsSyncService.getSyncedLyrics(title, artist, audioUrl, rawLyrics, numDuration);
            
            if (syncedData) {
                // Background: Persist lyrics to DB if we found new ones
                const prisma = (await import('../utils/prisma.js')).prisma;
                
                // Lookup track directly by trackId first (most reliable), or fallback to name search
                const track = trackId 
                    ? await prisma.track.findUnique({
                        where: { id: trackId },
                        select: { id: true, lyrics: true, synced_lyrics: true }
                      })
                    : await prisma.track.findFirst({
                        where: { title, artist: { name: artist } },
                        select: { id: true, lyrics: true, synced_lyrics: true }
                      });

                if (track) {
                    const songLang = await LyricsSyncService.detectSongLanguage(title, artist, rawLyrics || track.lyrics || undefined);
                    const updateData: any = {
                        language: songLang
                    };
                    if (!track.synced_lyrics && syncedData.syncedTokens) {
                        updateData.synced_lyrics = syncedData.syncedTokens;
                        updateData.raw_lrc = syncedData.rawLrc;
                    }
                    // If we found plain lyrics during sync that weren't in DB, save those too
                    if (!track.lyrics && rawLyrics) {
                        updateData.lyrics = rawLyrics;
                    }

                    await prisma.track.update({
                        where: { id: track.id },
                        data: updateData
                    });
                    console.log(`[LyricsSync] Persisted discovered lyrics and language "${songLang}" for track: ${track.id}`);
                }

                return reply.send({ syncedTokens: syncedData.syncedTokens });
            } else {
                return reply.status(404).send({ message: 'No synced lyrics found or alignment failed' });
            }
        } catch (err: any) {
            console.error('Lyrics sync routing error:', err);
            return reply.status(500).send({ message: 'Sync engine crashed' });
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
                return reply.send({ success: true, syncedTokens: synced });
            } else {
                return reply.status(400).send({ message: 'Whisper sync failed' });
            }
        } catch (err: any) {
            console.error('Whisper sync error:', err);
            return reply.status(500).send({ message: 'Whisper sync engine crashed' });
        }
    }

    // Existing translateLyrics method
    translateLyrics = async (req: FastifyRequest<{ Body: { lyrics: string; targetLang?: string } }>, reply: FastifyReply) => {
        const { lyrics, targetLang } = req.body;
        if (!lyrics) return reply.status(400).send({ message: 'Lyrics are required' });

        try {
            const translated = await AILyricsService.translateLyrics(lyrics, targetLang || 'English');
            if (translated) {
                return reply.send({ translated });
            } else {
                return reply.status(500).send({ message: 'Translation failed' });
            }
        } catch (err) {
            return reply.status(500).send({ message: 'AI Translation Error' });
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

    /** Save manually synced lyrics from the Lyric Sync Studio admin tool */
    saveSyncedLyrics = async (req: FastifyRequest<{ 
        Body: { trackId: string; syncedTokens: Array<{ time: number; text: string }>; rawLrc?: string } 
    }>, reply: FastifyReply) => {
        const { trackId, syncedTokens, rawLrc } = req.body;

        if (!trackId) return reply.status(400).send({ message: 'trackId is required' });
        if (!syncedTokens || syncedTokens.length === 0) return reply.status(400).send({ message: 'syncedTokens are required' });

        try {
            const track = await prisma.track.findUnique({ where: { id: trackId }, select: { id: true, title: true } });
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

            await prisma.track.update({
                where: { id: trackId },
                data: {
                    synced_lyrics: syncedTokens as any,
                    raw_lrc: generatedLrc,
                    lyrics: plainLyricsText
                }
            });

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
            if (url && url.startsWith('http')) {
                const trimmedUrl = url.trim();

                // Case A: Genius URL
                if (trimmedUrl.includes('genius.com')) {
                    console.log(`[LyricsImport] Scraping specific Genius URL: ${trimmedUrl}`);
                    const pageRes = await axios.get(trimmedUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        },
                        timeout: 8000
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
}

