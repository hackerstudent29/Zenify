import axios from 'axios';
import { prisma } from '../utils/prisma';
import { normalizeArtistName as localNormalize } from '../utils/artist';

interface ArtistMatchResult {
    match: boolean;
    artistId?: string;
    suggestedName: string;
    confidence: number;
}

export class ArtistMappingService {
    private static cache = new Map<string, ArtistMatchResult>();
    private static NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

    /**
     * Resolves an artist name to an existing Artist ID or provides a normalized new name.
     */
    static async resolveArtist(rawName: string): Promise<{ id?: string; name: string }> {
        // Pre-clean: Remove common junk before normalization
        let cleaned = rawName
            .replace(/\s*-\s*Topic\s*$/i, "")
            .replace(/\s*Topic\s*$/i, "")
            .replace(/\bOfficial\b/gi, "")
            .replace(/\bMusic Video\b/gi, "")
            .trim();

        const normalizedInput = localNormalize(cleaned);
        const cacheKey = normalizedInput.toLowerCase().trim();


        if (this.cache.has(cacheKey)) {
            console.log(`[ArtistMapping] Cache hit for "${normalizedInput}"`);
            const cached = this.cache.get(cacheKey)!;
            return { id: cached.artistId, name: cached.suggestedName };
        }

        console.log(`[ArtistMapping] Resolving "${normalizedInput}" using AI...`);

        // 1. Check exact match first
        const exactMatch = await prisma.artist.findUnique({
            where: { name: normalizedInput }
        });

        if (exactMatch) {
            console.log(`[ArtistMapping] Exact match found in DB for "${normalizedInput}"`);
            return { id: exactMatch.id, name: exactMatch.name };
        }

        // 2. Fuzzy/AI Match
        // Fetch a list of existing artists to compare against (limited to top/recent 500 for context window safety)
        const existingArtists = await prisma.artist.findMany({
            select: { id: true, name: true },
            take: 500,
            orderBy: { totalStreams: 'desc' }
        });

        const artistListStr = existingArtists.map(a => `${a.name} (id:${a.id})`).join(', ');

        try {
            const matchResult = await this.queryNvidiaAI(normalizedInput, artistListStr);
            
            this.cache.set(cacheKey, matchResult);

            if (matchResult.match && matchResult.artistId) {
                console.log(`[ArtistMapping] AI matched "${normalizedInput}" -> Existing: "${matchResult.suggestedName}" (${matchResult.confidence * 100}%)`);
                return { id: matchResult.artistId, name: matchResult.suggestedName };
            } else {
                console.log(`[ArtistMapping] AI suggested new artist: "${matchResult.suggestedName}"`);
                return { name: matchResult.suggestedName };
            }
        } catch (err: any) {
            console.error(`[ArtistMapping] AI resolving failed:`, err.message);
            // Fallback to local normalization
            return { name: normalizedInput };
        }
    }

    /**
     * Use NVIDIA AI to match artist names.
     */
    private static async queryNvidiaAI(newName: string, existingList: string): Promise<ArtistMatchResult> {
        if (!this.NVIDIA_API_KEY) {
            throw new Error("NVIDIA_API_KEY not configured");
        }

        const prompt = `
        Task: Intelligent Artist Name Mapping.
        Incoming Name: "${newName}"
        
        Existing Artists: [${existingList}]
        
        Instructions:
        1. Compare the Incoming Name against the Existing Artists.
        2. MANDATORY: Remove unwanted suffix/terms like " - Topic", "Topic", "Official", "Music Video", "Records", or specific YouTube channel tags.
        3. If there are 3-4 artists in the string, identify ONLY the primary/main artist name.
        4. Account for spelling mistakes, variations (A.R. vs AR), and formatting.
        5. If a confident match (>85% similarity) exists, return the matching artist's exact Name and ID.
        6. If NO confident match exists, provide a cleaned, properly capitalized, and standardized version of the Incoming Name (Artist Name ONLY).
        7. Respond ONLY in JSON format:
        {
          "match": boolean,
          "artistId": string | null,
          "suggestedName": string,
          "confidence": number (0 to 1)
        }
        `;


        const res = await axios.post(
            'https://integrate.api.nvidia.com/v1/chat/completions',
            {
                model: "meta/llama-3.1-405b-instruct",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.1,
                max_tokens: 200,
                response_format: { type: "json_object" }
            },
            {
                headers: {
                    'Authorization': `Bearer ${this.NVIDIA_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        try {
            const content = JSON.parse(res.data.choices[0].message.content);
            return {
                match: !!content.match,
                artistId: content.artistId || undefined,
                suggestedName: content.suggestedName || newName,
                confidence: content.confidence || 0
            };
        } catch (err) {
            throw new Error("Failed to parse AI response as JSON");
        }
    }
}
