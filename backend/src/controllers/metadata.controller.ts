import { FastifyReply, FastifyRequest } from 'fastify';
import axios from 'axios';
import { ExternalMetadataService } from '../services/external-metadata.service';
import { LyricsSyncService } from '../services/lyrics-sync.service';
import { AILyricsService } from '../services/ai-lyrics.service';

export class MetadataController {
    fetchMetadata = async (req: FastifyRequest<{ Querystring: { url: string; fetchAudio?: string; mode?: string } }>, reply: FastifyReply) => {
        let { url, fetchAudio, mode } = req.query;
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
                ExternalMetadataService.fetchLyrics(metadata.title, metadata.artist)
                    .then(lyrics => { if (lyrics) metadata.lyrics = lyrics; })
                    .catch(err => console.warn("Search-mode lyrics fetch failed:", err))
            );

            if (fetchAudio === 'true') {
                promises.push(
                    ExternalMetadataService.fetchAudio(metadata.title, metadata.artist)
                        .then(audioResult => {
                            metadata.audioUrl = audioResult.url;
                            metadata.duration = audioResult.duration;
                        })
                        .catch(err => {
                            console.warn("Search-mode audio fetch failed:", err);
                            metadata.audioError = err.message || "Unknown audio fetch error";
                        })
                );
            }
            
            await Promise.all(promises);
        } else {
            metadata = await ExternalMetadataService.fetchFromUrl(url);

            // Run lyrics + audio fetch in parallel for single tracks (URL paths)
            if (metadata.title && metadata.artist && !metadata.isCollection) {
                const promises: Promise<any>[] = [];

                // Lyrics fetch (always attempt)
                promises.push(
                    ExternalMetadataService.fetchLyrics(metadata.title, metadata.artist)
                        .then(lyrics => { if (lyrics) metadata.lyrics = lyrics; })
                        .catch(err => console.warn("Could not fetch lyrics:", err))
                );

                // Audio fetch (if requested)
                if (fetchAudio === 'true') {
                    let directUrl: string | undefined;
                    if (url.includes('youtube.com') || url.includes('youtu.be')) {
                        // Always extract clean video ID — strips playlist params that cause wrong songs
                        // e.g. music.youtube.com/watch?v=VIDEO_ID&list=RDAMVM... → youtube.com/watch?v=VIDEO_ID
                        const videoIdMatch = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
                        directUrl = videoIdMatch
                            ? `https://www.youtube.com/watch?v=${videoIdMatch[1]}`
                            : url;
                        console.log(`[Audio] Using clean YouTube URL: ${directUrl}`);
                    }

                    promises.push(
                        ExternalMetadataService.fetchAudio(metadata.title, metadata.artist, metadata.duration, directUrl)
                            .then(audioResult => {
                                metadata.audioUrl = audioResult.url;
                                if (audioResult.duration) {
                                    (metadata as any).duration = audioResult.duration;
                                }
                            })
                            .catch(err => {
                                console.warn("Could not auto-fetch audio:", err);
                                metadata.audioError = err.message || "Unknown audio fetch error";
                            })
                    );
                }

                await Promise.all(promises);
            }
        }

        // For collections, fetch lyrics, HQ covers, AND audio for each track in the listing
        if (metadata.isCollection && metadata.tracks && metadata.tracks.length > 0) {
            const artist = metadata.artist;
            const fetchAudio = req.query.fetchAudio === 'true';
            
            // Limit to first 12 tracks to keep response time reasonable
            const tracksToFetch = metadata.tracks.slice(0, 12);
            
            const results = await Promise.allSettled(
                tracksToFetch.map(async (track: any) => {
                    const tasks: Promise<any>[] = [];
                    
                    // Task 1: Lyrics
                    const lyricsPromise = ExternalMetadataService.fetchLyrics(track.title, track.artist || artist).catch(() => null);
                    
                    // Task 2: HQ Cover
                    const coverPromise = ExternalMetadataService.getHighQualitySquareCover(track.title, track.artist || artist, metadata.title).catch(() => null);
                    
                    // Task 3: Audio (if requested)
                    let audioPromise = Promise.resolve(null);
                    if (fetchAudio) {
                        audioPromise = ExternalMetadataService.fetchAudio(track.title, track.artist || artist, track.duration).catch(() => null);
                    }

                    const [lyrics, cover, audio] = await Promise.all([lyricsPromise, coverPromise, audioPromise]);
                    return { lyrics, cover, audio };
                })
            );

            // Attach findings to each track object
            tracksToFetch.forEach((track: any, i: number) => {
                const res = results[i];
                if (res.status === 'fulfilled') {
                    if (res.value.lyrics) (track as any).lyrics = res.value.lyrics;
                    if (res.value.cover) (track as any).cover = res.value.cover;
                    if (res.value.audio) {
                        (track as any).audioUrl = res.value.audio.url;
                        if (res.value.audio.duration) (track as any).duration = res.value.audio.duration;
                    }
                }
            });
        }

        return reply.send(metadata);
    }
    
    syncLyrics = async (req: FastifyRequest<{ Body: { title: string; artist: string; audioUrl?: string; rawLyrics?: string; duration?: number } }>, reply: FastifyReply) => {
        const { title, artist, audioUrl, rawLyrics, duration } = req.body;
        if (!title || !artist) {
            return reply.status(400).send({ message: 'Title and Artist are required' });
        }
        
        try {
            const numDuration = duration;
            const syncedData = await LyricsSyncService.getSyncedLyrics(title, artist, audioUrl, rawLyrics, numDuration);
            
            if (syncedData) {
                return reply.send({ syncedTokens: syncedData });
            } else {
                return reply.status(404).send({ message: 'No synced lyrics found or alignment failed' });
            }
        } catch (err: any) {
            console.error('Lyrics sync routing error:', err);
            return reply.status(500).send({ message: 'Sync engine crashed' });
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
}

