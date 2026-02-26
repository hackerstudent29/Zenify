
import { FastifyReply, FastifyRequest } from 'fastify';
import { ExternalMetadataService } from '../services/external-metadata.service';

export class MetadataController {
    fetchMetadata = async (req: FastifyRequest<{ Querystring: { url: string; fetchAudio?: string } }>, reply: FastifyReply) => {
        const { url, fetchAudio } = req.query;
        if (!url) {
            return reply.status(400).send({ message: 'URL is required' });
        }

        const metadata = await ExternalMetadataService.fetchFromUrl(url);

        // Run lyrics + audio fetch in parallel for single tracks
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
                // For direct YouTube links, pass URL directly — avoids slow re-search
                const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
                const directUrl = isYouTube ? url : undefined;

                promises.push(
                    ExternalMetadataService.fetchAudio(metadata.title, metadata.artist, metadata.duration, directUrl)
                        .then(audioResult => {
                            metadata.audioUrl = audioResult.url;
                            if (audioResult.duration) {
                                (metadata as any).duration = audioResult.duration;
                            }
                        })
                        .catch(err => console.warn("Could not auto-fetch audio:", err))
                );
            }

            await Promise.all(promises);
        }

        // For collections, fetch lyrics for each track in the listing
        if (metadata.isCollection && metadata.tracks && metadata.tracks.length > 0) {
            const artist = metadata.artist;
            // Fetch lyrics for first 10 tracks in parallel (avoid overloading)
            const tracksToFetch = metadata.tracks.slice(0, 10);
            const lyricResults = await Promise.allSettled(
                tracksToFetch.map(track =>
                    ExternalMetadataService.fetchLyrics(track.title, track.artist || artist)
                        .catch(() => null)
                )
            );

            // Attach lyrics to each track object
            tracksToFetch.forEach((track, i) => {
                const result = lyricResults[i];
                if (result.status === 'fulfilled' && result.value) {
                    (track as any).lyrics = result.value;
                }
            });
        }

        return reply.send(metadata);
    }
}

