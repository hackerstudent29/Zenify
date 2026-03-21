import { FastifyInstance } from 'fastify';
import { MetadataController } from '../controllers/metadata.controller';
import { z } from 'zod';

export async function metadataRoutes(server: FastifyInstance) {
    const controller = new MetadataController();

    server.get('/fetch', {
        schema: {
            querystring: z.object({
                url: z.string(),
                fetchAudio: z.string().optional(),
                mode: z.string().optional()
            })
        }
    }, controller.fetchMetadata);

    server.get('/sync-lyrics', {
        schema: {
            querystring: z.object({
                title: z.string(),
                artist: z.string(),
                audioUrl: z.string().optional(),
                rawLyrics: z.string().optional()
            })
        }
    }, controller.syncLyrics);

    server.post('/translate-lyrics', {
        schema: {
            body: z.object({
                lyrics: z.string(),
                targetLang: z.string().optional()
            })
        }
    }, controller.translateLyrics);
}
