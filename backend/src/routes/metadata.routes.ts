import { FastifyInstance } from 'fastify';
import { MetadataController } from '../controllers/metadata.controller';
import { z } from 'zod';

export async function metadataRoutes(server: FastifyInstance) {
    const controller = new MetadataController();

    server.get('/fetch', {
        schema: {
            querystring: z.object({
                url: z.string(),
                fetchAudio: z.string().optional()
            })
        }
    }, controller.fetchMetadata);
}
