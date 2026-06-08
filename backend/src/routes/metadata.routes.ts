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

    server.post('/sync-lyrics', {
        schema: {
            body: z.object({
                trackId: z.string().optional(),
                title: z.string(),
                artist: z.string(),
                audioUrl: z.string().optional(),
                rawLyrics: z.string().optional(),
                duration: z.number().optional()
            })
        },
        handler: controller.syncLyrics.bind(controller)
    });

    server.post('/whisper-sync', {
        schema: {
            body: z.object({
                trackId: z.string()
            })
        },
        handler: controller.whisperSync.bind(controller)
    });

    server.post('/translate-lyrics', {
        schema: {
            body: z.object({
                lyrics: z.string(),
                targetLang: z.string().optional()
            })
        }
    }, controller.translateLyrics);

    server.post('/sync-aesthetic', {
        schema: {
            body: z.object({
                trackId: z.string().optional(),
                albumId: z.string().optional()
            })
        }
    }, controller.syncAesthetic);

    server.post('/lyrics-insight', {
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
                    time: z.number(),
                    text: z.string()
                })),
                rawLrc: z.string().optional()
            })
        },
        handler: controller.saveSyncedLyrics.bind(controller)
    });

    server.post('/import-lyrics', {
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
}
