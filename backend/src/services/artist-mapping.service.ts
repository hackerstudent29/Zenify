import axios from 'axios';
import { prisma } from '../utils/prisma';
import { normalizeArtistName as localNormalize } from '../utils/artist';

interface ArtistMatchResult {
    match: boolean;
    artistId?: string;
    suggestedName: string;
    featuredArtists: string[];
    confidence: number;
}

export interface ResolvedArtist {
    id?: string;
    name: string;
    featuredNames?: string[];
}

export class ArtistMappingService {
    private static cache = new Map<string, ArtistMatchResult>();
    private static resolveLocks = new Map<string, Promise<ResolvedArtist>>();
    private static NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

    /**
     * Resolves an artist name to an existing Artist ID or provides a normalized new name.
     */
    static async resolveArtist(rawName: string): Promise<ResolvedArtist> {
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
            return { id: cached.artistId, name: cached.suggestedName, featuredNames: cached.featuredArtists };
        }

        // Apply mutex lock for concurrent requests resolving the exact same artist spelling
        if (this.resolveLocks.has(cacheKey)) {
            console.log(`[ArtistMapping] Waiting for active lock to resolve: ${cacheKey}`);
            return await this.resolveLocks.get(cacheKey)!;
        }

        let lockResolver!: (result: ResolvedArtist) => void;
        this.resolveLocks.set(cacheKey, new Promise(resolve => lockResolver = resolve));

        try {
            const result = await this._resolveArtistInternal(normalizedInput, cacheKey);
            lockResolver(result);
            return result;
        } catch (err) {
            lockResolver({ name: normalizedInput });
            throw err;
        } finally {
            this.resolveLocks.delete(cacheKey);
        }
    }

    private static getLevenshteinDistance(a: string, b: string): number {
        const matrix: number[][] = [];

        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,     // insertion
                        matrix[i - 1][j] + 1      // deletion
                    );
                }
            }
        }

        return matrix[b.length][a.length];
    }

    private static async _resolveArtistInternal(normalizedInput: string, cacheKey: string): Promise<ResolvedArtist> {

        console.log(`[ArtistMapping] Resolving "${normalizedInput}" using AI...`);

        // 1. Check exact match first (Case-Insensitive)
        const exactMatch = await prisma.artist.findFirst({
            where: {
                name: {
                    equals: normalizedInput,
                    mode: 'insensitive' // Prevents "gengee" vs "GenGee" creating duplicates
                }
            }
        });

        if (exactMatch) {
            console.log(`[ArtistMapping] Exact/Case-Insensitive match found in DB for "${normalizedInput}"`);
            this.cache.set(cacheKey, { match: true, artistId: exactMatch.id, suggestedName: exactMatch.name, featuredArtists: [], confidence: 1 });
            return { id: exactMatch.id, name: exactMatch.name };
        }

        // Fetch up to 2000 existing artists to perform Levenshtein and substring checks locally
        const existingArtists = await prisma.artist.findMany({
            select: { id: true, name: true },
            take: 2000,
            orderBy: { totalStreams: 'desc' }
        });

        // 1.5. Levenshtein check to resolve spelling typos (e.g. "Sai Abhyankkar" vs "Sai Abhyankar")
        let bestFuzzyMatch: { id: string; name: string } | null = null;
        let minDistance = Infinity;

        const cleanString = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanInput = cleanString(normalizedInput);

        for (const existing of existingArtists) {
            const cleanExisting = cleanString(existing.name);
            if (cleanExisting === cleanInput) {
                // Alphanumeric case-insensitive match (e.g., periods/spaces stripped)
                bestFuzzyMatch = existing;
                minDistance = 0;
                break;
            }

            const distance = this.getLevenshteinDistance(cleanInput, cleanExisting);
            const maxLength = Math.max(cleanInput.length, cleanExisting.length);
            const maxAllowedDistance = maxLength <= 5 ? 1 : 2;

            if (distance <= maxAllowedDistance && distance < minDistance) {
                minDistance = distance;
                bestFuzzyMatch = existing;
            }
        }

        if (bestFuzzyMatch && minDistance <= 2) {
            console.log(`[ArtistMapping] Levenshtein similarity match found: "${normalizedInput}" mapped to existing "${bestFuzzyMatch.name}" (distance: ${minDistance})`);
            this.cache.set(cacheKey, {
                match: true,
                artistId: bestFuzzyMatch.id,
                suggestedName: bestFuzzyMatch.name,
                featuredArtists: [],
                confidence: 0.95 - (minDistance * 0.05)
            });
            return { id: bestFuzzyMatch.id, name: bestFuzzyMatch.name };
        }

        // 2. Fuzzy/Substring Fallback Match (Before AI)
        // If the new name is a substring of an existing name, or vice versa (e.g. "Anirudh" and "Anirudh Ravichander")
        for (const existing of existingArtists) {
            const existingNameLower = existing.name.toLowerCase();
            const newNameLower = normalizedInput.toLowerCase();
            
            // If one is a direct substring of the other (with a reasonable length to avoid false positives)
            if (
                (existingNameLower.includes(newNameLower) && newNameLower.length >= 4) ||
                (newNameLower.includes(existingNameLower) && existingNameLower.length >= 4)
            ) {
                console.log(`[ArtistMapping] Substring match found: "${normalizedInput}" matched with existing "${existing.name}"`);
                // Use the longer, more descriptive name for the DB if we matched
                const bestName = existing.name.length >= normalizedInput.length ? existing.name : normalizedInput;
                this.cache.set(cacheKey, { match: true, artistId: existing.id, suggestedName: bestName, featuredArtists: [], confidence: 0.9 });
                return { id: existing.id, name: bestName };
            }
        }

        const artistListStr = existingArtists.map(a => `${a.name} (id:${a.id})`).join(', ');

        try {
            const matchResult = await this.queryNvidiaAI(normalizedInput, artistListStr);
            
            // If AI tries to return a slightly differently cased existing name, enforce case-matching
            if (!matchResult.artistId) {
                const aiCaseMatch = await prisma.artist.findFirst({
                    where: { name: { equals: matchResult.suggestedName, mode: 'insensitive' } }
                });
                if (aiCaseMatch) {
                    matchResult.artistId = aiCaseMatch.id;
                    matchResult.suggestedName = aiCaseMatch.name;
                    matchResult.match = true;
                }
            }

            this.cache.set(cacheKey, matchResult);

            if (matchResult.match && matchResult.artistId) {
                console.log(`[ArtistMapping] AI matched "${normalizedInput}" -> Existing: "${matchResult.suggestedName}" (${matchResult.confidence * 100}%)`);
                return { id: matchResult.artistId, name: matchResult.suggestedName, featuredNames: matchResult.featuredArtists };
            } else {
                console.log(`[ArtistMapping] AI suggested new artist: "${matchResult.suggestedName}"`);
                return { name: matchResult.suggestedName, featuredNames: matchResult.featuredArtists };
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
        Task: Intelligent Artist Name Mapping and Deduplication.
        Incoming Name: "${newName}"
        
        Existing Artists: [${existingList}]
        
        Instructions:
        1. Compare the Incoming Name against the Existing Artists.
        2. MANDATORY DEDUPLICATION: Treat variations of the same name as the EXACT SAME artist. For example:
           - "Anirudh" and "Anirudh Ravichander" are the same artist.
           - "The Weeknd" and "Weeknd" are the same artist.
           - "A.R. Rahman" and "AR Rahman" are the same artist.
           If the incoming name is a variation of an existing artist, you MUST return that existing artist's ID and name!
        3. MANDATORY: If the incoming name contains multiple distinct artists (e.g., "A & B", "A, B & C", "A feat. B"), identify the PRIMARY artist and list all OTHER distinct artists as "featuredArtists".
        4. PRIMARY ARTIST is usually the first name mentioned.
        5. Clean names of junk like " - Topic", "YouTube", "Official", etc.
        6. Respond ONLY in JSON:
        {
          "match": boolean, // true if primary artist matches an existing artist
          "artistId": string | null, // The ID of the existing artist, if found
          "suggestedName": "Primary Artist Name Only",
          "featuredArtists": ["Featured Artist 1", "Featured Artist 2"],
          "confidence": number // 0.0 to 1.0
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
                featuredArtists: content.featuredArtists || [],
                confidence: content.confidence || 0
            };
        } catch (err) {
            throw new Error("Failed to parse AI response as JSON");
        }
    }
}
