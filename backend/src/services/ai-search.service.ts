import axios from 'axios';
import { prisma } from '../utils/prisma';

export class AISearchService {
    private static NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

    /**
     * Translates a natural language query into specific database filters (Prisma search).
     * Example: "Energetic Tamil songs for gym" -> { genre: "Tamil", tags: ["energetic", "gym"], limit: 20 }
     */
    static async smartSearch(query: string) {
        if (!this.NVIDIA_API_KEY) return null;

        console.log(`[AISearch] Parsing natural query: ${query}`);

        const prompt = `
        Task: Translate a natural language music search query into a structured JSON filter.
        
        Incoming Query: "${query}"
        
        Mandatory Rules:
        1. Identify "title", "artist", "genre", and "mood" or "tags".
        2. If a language is mentioned (e.g., Tamil, English, Hindi), put it in "genre".
        3. If an activity/mood is mentioned (e.g., gym, sleep, morning), put it in "tags".
        4. If a specific year or decade is mentioned, put it in "year" (integer).
        5. Return ONLY a JSON object.
        6. Use this format:
        {
          "title": string | null,
          "artist": string | null,
          "genre": string | null,
          "tags": string[] (list of lower-case mood/activity tags),
          "minDuration": number (in seconds) | null,
          "limit": number (default 20, max 50)
        }
        `;

        try {
            const res = await axios.post(
                'https://integrate.api.nvidia.com/v1/chat/completions',
                {
                    model: "meta/llama-3.1-405b-instruct",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.1,
                    max_tokens: 300,
                    response_format: { type: "json_object" }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.NVIDIA_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const filters = JSON.parse(res.data.choices[0]?.message?.content);
            console.log(`[AISearch] AI Filter generated:`, filters);

            // Execute the Prisma query based on these AI filters
            const where: any = { deletedAt: null };

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
                include: { artist: true, album: true },
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
