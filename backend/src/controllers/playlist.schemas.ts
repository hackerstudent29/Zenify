import { z } from 'zod';

export const createPlaylistSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    isPublic: z.boolean().default(true),
    coverUrl: z.string().url().optional(),
});

export const updatePlaylistSchema = createPlaylistSchema.partial();

export const addTrackSchema = z.object({
    trackId: z.string().uuid(),
});

export type CreatePlaylistInput = z.infer<typeof createPlaylistSchema>;
export type UpdatePlaylistInput = z.infer<typeof updatePlaylistSchema>;
export type AddTrackInput = z.infer<typeof addTrackSchema>;
