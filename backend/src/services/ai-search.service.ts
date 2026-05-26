import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { prisma } from '../utils/prisma';
import { config } from '../config/env';
import { z } from 'zod';

export class AISearchService {
    private static VERCEL_AI_KEY = config.VERCEL_AI_KEY;

    /**
     * Translates a natural language query into specific database filters (Prisma search).
     * Example: "Energetic Tamil songs for gym" -> { genre: "Tamil", tags: ["energetic", "gym"], limit: 20 }
     */
    static async smartSearch(query: string) {
        if (!this.VERCEL_AI_KEY) {
            console.error('[AISearch] VERCEL_AI_KEY is missing in environment.');
            return null;
        }

        console.log(`[AISearch] Parsing natural query: ${query}`);

        try {
            const customOpenAI = createOpenAI({
                apiKey: this.VERCEL_AI_KEY
            });

            // Using gpt-4o-mini for extremely low cost and reliable JSON output
            const { object: filters } = await generateObject({
                model: customOpenAI('gpt-4o-mini'),
                schema: z.object({
                    title: z.string().nullable(),
                    artist: z.string().nullable(),
                    genre: z.string().nullable(),
                    tags: z.array(z.string()).describe('List of lower-case mood/activity tags'),
                    minDuration: z.number().nullable().describe('Minimum duration in seconds'),
                    limit: z.number().min(1).max(50).default(20)
                }),
                prompt: `Task: Translate a natural language music search query into a structured JSON filter.
                
                Incoming Query: "${query}"
                
                Mandatory Rules:
                1. Identify "title", "artist", "genre", and "mood" or "tags".
                2. If a language is mentioned (e.g., Tamil, English, Hindi), put it in "genre".
                3. If an activity/mood is mentioned (e.g., gym, sleep, morning), put it in "tags".
                4. If a specific year or decade is mentioned, include it in the context of the search.`,
            });

            console.log(`[AISearch] AI Filter generated:`, filters);

            // Execute the Prisma query based on these AI filters
            const where: any = { 
                deletedAt: null,
                OR: [
                    { releaseStatus: 'PUBLISHED' },
                    { releaseStatus: 'SCHEDULED', scheduledAt: { lte: new Date() } }
                ]
            };

            if (filters.title) {
                where.title = { contains: filters.title, mode: 'insensitive' };
            }

            if (filters.artist) {
                where.artist = { name: { contains: filters.artist, mode: 'insensitive' } };
            }

            if (filters.genre) {
                where.genre = { contains: filters.genre, mode: 'insensitive' };
            }

            if (filters.tags && filters.tags.length > 0) {
                where.tags = { hasSome: filters.tags };
            }

            if (filters.minDuration) {
                where.duration = { gte: filters.minDuration };
            }

             const tracks = await prisma.track.findMany({
                where,
                include: { 
                    artist: {
                        select: {
                            id: true,
                            name: true,
                            imageUrl: true,
                            coverUrl: true
                        }
                    }, 
                    album: {
                        select: {
                            id: true,
                            title: true,
                            coverUrl: true
                        }
                    }
                },
                take: filters.limit || 20,
                orderBy: { streams: 'desc' }
            });

            return { 
                results: tracks,
                interpretedQuery: filters
            };

        } catch (err: any) {
            console.error(`[AISearch] Smart query failed:`, err.message);
            return null;
        }
    }
}
