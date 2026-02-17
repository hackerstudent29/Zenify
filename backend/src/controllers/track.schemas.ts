import { z } from 'zod';

export const createTrackSchema = z.object({
    title: z.string().min(1),
    artist: z.string().min(1),
    album: z.string().optional(),
    coverUrl: z.string().url().optional(),
    audioUrl: z.string().url(),
    duration: z.number().int().positive(), // in seconds
    genre: z.string().optional(),
    tags: z.array(z.string()).optional(),
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
