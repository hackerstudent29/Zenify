import { z } from 'zod';

export const createTrackSchema = z.object({
    title: z.string().min(1),
    artistId: z.string().uuid(),
    albumId: z.string().uuid().optional(),
    coverUrl: z.string().url().optional(),
    audioUrl: z.string().url().optional(), // Made optional for multipart
    duration: z.number().int().positive(),
    genre: z.string().optional(),
    tags: z.array(z.string()).optional(),
    isFeatured: z.boolean().optional(),
    isTrending: z.boolean().optional(),
    lyrics: z.string().optional(),
    description: z.string().optional(),
});

export const updateTrackSchema = createTrackSchema.partial();

export const trackQuerySchema = z.object({
    page: z.coerce.number().default(1),
    limit: z.coerce.number().default(20),
    cursor: z.string().optional(), // For cursor-based pagination
});

export type CreateTrackInput = z.infer<typeof createTrackSchema>;
export type UpdateTrackInput = z.infer<typeof updateTrackSchema>;
export type TrackQuery = z.infer<typeof trackQuerySchema>;
