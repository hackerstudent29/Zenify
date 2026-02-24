
import { FastifyReply, FastifyRequest } from 'fastify';
import { ExternalMetadataService } from '../services/external-metadata.service';

export class MetadataController {
    fetchMetadata = async (req: FastifyRequest<{ Querystring: { url: string; fetchAudio?: string } }>, reply: FastifyReply) => {
        const { url, fetchAudio } = req.query;
        if (!url) {
            return reply.status(400).send({ message: 'URL is required' });
        }

        const metadata = await ExternalMetadataService.fetchFromUrl(url);

        if (fetchAudio === 'true' && metadata.title && metadata.artist) {
            try {
                const audioResult = await ExternalMetadataService.fetchAudio(metadata.title, metadata.artist);
                metadata.audioUrl = audioResult.url;
                if (audioResult.duration) {
                    (metadata as any).duration = audioResult.duration;
                }
            } catch (err) {
                console.warn("Could not auto-fetch audio:", err);
            }
        }

        return reply.send(metadata);
    }
}
