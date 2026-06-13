import { prisma } from '../utils/prisma.js';
import { extractObject, FAST_MODEL } from '../utils/ai.js';
import { z } from 'zod';

export class AISearchService {
    private static VERCEL_AI_KEY = process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL_API_KEY;

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
            const schema = z.object({
                title: z.string().nullable(),
                artist: z.string().nullable(),
                genre: z.string().nullable(),
                tags: z.array(z.string()).describe('List of lower-case mood/activity tags'),
                minDuration: z.number().nullable().describe('Minimum duration in seconds'),
                limit: z.number().min(1).max(50).default(20)
            });

            const prompt = `Task: Translate a natural language music search query into a structured JSON filter.
            
            Incoming Query: "${query}"
            
            Mandatory Rules:
            1. Identify "title", "artist", "genre", and "mood" or "tags".
            2. If a language is mentioned (e.g., Tamil, English, Hindi), put it in "genre".
            3. If an activity/mood is mentioned (e.g., gym, sleep, morning), put it in "tags".
            4. If a specific year or decade is mentioned, include it in the context of the search.`;

            // Using FAST_MODEL for low cost and reliable JSON output
            const filters = await extractObject<any>(prompt, schema, FAST_MODEL);

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

            if (!tracks || tracks.length === 0) {
                return null;
            }

            // Step 2: Use AI to structure the tracks conversationally
            const conversationalSchema = z.object({
                message: z.string().describe("A highly empathetic, conversational greeting based on the user's query mood. Be personal and expressive."),
                sections: z.array(z.object({
                    title: z.string().describe("Section title, e.g. 'Motivation', 'Sad Songs', 'High Energy'"),
                    tracks: z.array(z.object({
                        trackId: z.string().describe("The ID of the track from the provided context list"),
                        summary: z.string().describe("A personalized 1-sentence summary of why this song fits")
                    }))
                }))
            });

            const contextTracks = tracks.map(t => ({
                id: t.id,
                title: t.title,
                artist: t.artist?.name,
                genre: t.genre,
                tags: t.tags
            }));

            const chatPrompt = `The user searched for: "${query}".
            Act as a friendly, expert music recommender.
            Pick the best tracks from this JSON list and group them into 1-3 thematic sections.
            For each track, provide its trackId and a short summary explaining why you picked it.
            
            Tracks available:
            ${JSON.stringify(contextTracks)}
            `;

            console.log(`[AISearch] Requesting conversational RAG...`);
            const aiResponse = await extractObject<any>(chatPrompt, conversationalSchema, FAST_MODEL);

            // Hydrate the tracks back into the response
            const finalSections = aiResponse.sections.map((section: any) => ({
                title: section.title,
                tracks: section.tracks.map((st: any) => {
                    const fullTrack = tracks.find((t: any) => t.id === st.trackId);
                    return fullTrack ? {
                        ...fullTrack,
                        aiSummary: st.summary
                    } : null;
                }).filter((t: any) => t !== null) // Remove hallucinations
            })).filter((section: any) => section.tracks.length > 0);

            return {
                message: aiResponse.message,
                sections: finalSections,
                interpretedQuery: filters
            };

        } catch (err: any) {
            console.error(`[AISearch] Smart query failed:`, err);
            return null;
        }
    }
}
