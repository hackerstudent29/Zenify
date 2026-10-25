import axios from 'axios';
import { prisma } from '../utils/prisma';
import { normalizeArtistName as localNormalize } from '../utils/artist';
import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

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

const KNOWN_HONORIFICS = [
    'thenisai thendral',
    'isaignani',
    'isai puyal',
    'padmashri',
    'padma shri',
    'padma bhushan',
    'padma vibhushan',
    'dr.',
    'dr ',
    'maestro',
    'sir',
    'kalaimamani',
    'mellisae mannar',
    'isai murasu',
    'nadhaswara chakravarthi',
    'isai arasi'
];

export function stripHonorifics(name: string): string {
    let cleaned = name;
    for (const h of KNOWN_HONORIFICS) {
        const reg = new RegExp(`\\b${h.replace('.', '\\.')}\\b`, 'gi');
        cleaned = cleaned.replace(reg, '');
    }
    return cleaned.replace(/\s+/g, ' ').trim();
}

function normalizeKey(str: string): string {
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export class ArtistMappingService {
    private static cache = new Map<string, ArtistMatchResult>();
    private static resolveLocks = new Map<string, Promise<ResolvedArtist>>();
    private static NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

    /**
     * Resolves an artist name using Section D 5-step canonicalization pipeline:
     * 1. Normalize (lowercase, strip diacritics and punctuation).
     * 2. Alias table lookup (artist_aliases).
     * 3. Strip known honorific/epithet list (e.g. "Thenisai Thendral Deva" -> "Deva") and retry.
     * 4. Catalog search (iTunes Search API musicArtist) plus fuzzy match.
     * 5. LLM fallback using Vercel AI SDK generateObject (NVIDIA NIM). Confidence >= 0.85 accepts, else 'needs_review'.
     */
    static async resolveArtist(rawName: string, trackContext?: { album?: string; title?: string }): Promise<ResolvedArtist> {
        let cleaned = rawName
            .replace(/\b(sonymusicsouth|sony music south|sony music|t-series|think music|aditya music|saregama|zee music company|lahari music|speed records|tips official|ypyp|yt music)\b/gi, '')
            .replace(/\s*-\s*Topic\s*$/i, '')
            .replace(/\s*Topic\s*$/i, '')
            .replace(/\bOfficial\b/gi, '')
            .replace(/\bMusic Video\b/gi, '')
            .trim();

        if (!cleaned) cleaned = 'Various Artists';

        const normalizedInput = localNormalize(cleaned);
        const normKey = normalizeKey(normalizedInput);

        if (this.cache.has(normKey)) {
            const cached = this.cache.get(normKey)!;
            return { id: cached.artistId, name: cached.suggestedName, featuredNames: cached.featuredArtists };
        }

        if (this.resolveLocks.has(normKey)) {
            return await this.resolveLocks.get(normKey)!;
        }

        let lockResolver!: (result: ResolvedArtist) => void;
        this.resolveLocks.set(normKey, new Promise((resolve) => (lockResolver = resolve)));

        try {
            const result = await this._pipelineResolve(normalizedInput, normKey, trackContext);
            lockResolver(result);
            return result;
        } catch (err) {
            lockResolver({ name: normalizedInput });
            throw err;
        } finally {
            this.resolveLocks.delete(normKey);
        }
    }

    private static async _pipelineResolve(
        rawName: string,
        normKey: string,
        trackContext?: { album?: string; title?: string }
    ): Promise<ResolvedArtist> {
        // STEP 1 & 2: Normalize and Alias Table Lookup
        try {
            const aliasEntry = await (prisma as any).artistAlias.findUnique({
                where: { aliasNormalized: normKey },
                include: { artist: true },
            });

            if (aliasEntry && aliasEntry.artist && aliasEntry.status === 'ok') {
                this.cache.set(normKey, {
                    match: true,
                    artistId: aliasEntry.artist.id,
                    suggestedName: aliasEntry.artist.name,
                    featuredArtists: [],
                    confidence: aliasEntry.confidence,
                });
                return { id: aliasEntry.artist.id, name: aliasEntry.artist.name };
            }
        } catch (err: any) {
            console.warn('[ArtistMapping] Alias table lookup failed or not yet seeded:', err.message);
        }

        // Exact DB Match Check
        const exactMatch = await prisma.artist.findFirst({
            where: {
                name: { equals: rawName, mode: 'insensitive' },
            },
        });

        if (exactMatch) {
            this.cache.set(normKey, {
                match: true,
                artistId: exactMatch.id,
                suggestedName: exactMatch.name,
                featuredArtists: [],
                confidence: 1.0,
            });
            await this._saveAlias(normKey, exactMatch.id, 'exact_db', 1.0, 'ok');
            return { id: exactMatch.id, name: exactMatch.name };
        }

        // STEP 3: Strip Known Honorific/Epithet List and Retry
        const stripped = stripHonorifics(rawName);
        if (stripped && stripped.toLowerCase() !== rawName.toLowerCase()) {
            const strippedKey = normalizeKey(stripped);

            // Check if stripped matches alias table
            try {
                const strippedAlias = await (prisma as any).artistAlias.findUnique({
                    where: { aliasNormalized: strippedKey },
                    include: { artist: true },
                });
                if (strippedAlias && strippedAlias.artist) {
                    await this._saveAlias(normKey, strippedAlias.artist.id, 'strip_title', 0.95, 'ok');
                    return { id: strippedAlias.artist.id, name: strippedAlias.artist.name };
                }
            } catch {}

            // Check if stripped matches an existing DB artist
            const strippedMatch = await prisma.artist.findFirst({
                where: { name: { equals: stripped, mode: 'insensitive' } },
            });

            if (strippedMatch) {
                console.log(`[ArtistMapping] Honorific stripped: "${rawName}" -> "${strippedMatch.name}"`);
                await this._saveAlias(normKey, strippedMatch.id, 'strip_title', 0.95, 'ok');
                this.cache.set(normKey, {
                    match: true,
                    artistId: strippedMatch.id,
                    suggestedName: strippedMatch.name,
                    featuredArtists: [],
                    confidence: 0.95,
                });
                return { id: strippedMatch.id, name: strippedMatch.name };
            }
        }

        // STEP 4: Catalog Search (iTunes Search API musicArtist) + Token Subset Matching
        const catalogQuery = stripped || rawName;
        try {
            const itunesRes = await axios.get(
                `https://itunes.apple.com/search?term=${encodeURIComponent(catalogQuery)}&entity=musicArtist&limit=5`,
                { timeout: 4000 }
            );
            const candidates = itunesRes.data?.results || [];
            for (const cand of candidates) {
                const candName = cand.artistName;
                if (!candName) continue;

                const candKey = normalizeKey(candName);
                const queryTokens = normKey.split(' ');
                const candTokens = candKey.split(' ');

                // Accept when candidate tokens are a subset of credited name
                const isSubset = candTokens.every((tok) => queryTokens.includes(tok));
                if (isSubset || candKey === stripped.toLowerCase()) {
                    // Check if existing in DB or create/update
                    let artist = await prisma.artist.findFirst({
                        where: { name: { equals: candName, mode: 'insensitive' } },
                    });

                    if (!artist) {
                        artist = await prisma.artist.create({
                            data: {
                                name: candName,
                                bio: `Artist verified via Catalog Search (${cand.primaryGenreName || 'Music'})`,
                            },
                        });
                    }

                    console.log(`[ArtistMapping] Catalog matched: "${rawName}" -> "${artist.name}"`);
                    await this._saveAlias(normKey, artist.id, 'catalog', 0.9, 'ok');
                    this.cache.set(normKey, {
                        match: true,
                        artistId: artist.id,
                        suggestedName: artist.name,
                        featuredArtists: [],
                        confidence: 0.9,
                    });
                    return { id: artist.id, name: artist.name };
                }
            }
        } catch (catErr: any) {
            console.warn('[ArtistMapping] Catalog lookup error:', catErr.message);
        }

        // STEP 5: LLM Fallback (Vercel AI SDK generateObject + NVIDIA NIM)
        if (this.NVIDIA_API_KEY) {
            try {
                const existingArtists = await prisma.artist.findMany({
                    select: { id: true, name: true },
                    take: 50,
                    orderBy: { totalStreams: 'desc' },
                });

                const nim = createOpenAI({
                    baseURL: 'https://integrate.api.nvidia.com/v1',
                    apiKey: this.NVIDIA_API_KEY,
                });

                const ctx = trackContext ? `Track: "${trackContext.title || ''}", Album: "${trackContext.album || ''}"` : '';

                const { object } = await generateObject({
                    model: nim('meta/llama-3.1-70b-instruct'),
                    schema: z.object({
                        artistId: z.string().nullable(),
                        canonicalName: z.string().nullable(),
                        confidence: z.number().min(0).max(1),
                    }),
                    prompt:
                        `Credited name: "${rawName}"\n` +
                        `Song context: ${ctx}\n` +
                        `Candidates: ${JSON.stringify(existingArtists.map((a) => ({ id: a.id, name: a.name })))}\n` +
                        `Credited names may include honorific titles or epithets (e.g. "Thenisai Thendral Deva" is the music director "Deva"). ` +
                        `Pick the candidate that is the same person, or specify their real canonical name. Never guess.`,
                });

                if (object.confidence >= 0.85 && (object.artistId || object.canonicalName)) {
                    let artistId = object.artistId;
                    let canonicalName = object.canonicalName || rawName;

                    if (!artistId && object.canonicalName) {
                        const matched = await prisma.artist.findFirst({
                            where: { name: { equals: object.canonicalName, mode: 'insensitive' } },
                        });
                        if (matched) {
                            artistId = matched.id;
                            canonicalName = matched.name;
                        }
                    }

                    if (artistId) {
                        console.log(`[ArtistMapping] LLM matched with high confidence (${object.confidence}): "${rawName}" -> "${canonicalName}"`);
                        await this._saveAlias(normKey, artistId, 'llm', object.confidence, 'ok');
                        return { id: artistId, name: canonicalName };
                    }
                } else if (object.confidence < 0.85) {
                    console.log(`[ArtistMapping] LLM low confidence (${object.confidence}) for "${rawName}". Flagging for Admin Review.`);
                    await this._saveAlias(normKey, null, 'llm', object.confidence, 'needs_review');
                }
            } catch (llmErr: any) {
                console.warn('[ArtistMapping] LLM fallback error:', llmErr.message);
            }
        }

        // Final Default: Use normalized stripped name or raw name
        const displayName = stripped || rawName;
        return { name: displayName };
    }

    private static async _saveAlias(
        aliasNormalized: string,
        artistId: string | null,
        source: string,
        confidence: number,
        status: 'ok' | 'needs_review'
    ): Promise<void> {
        try {
            await (prisma as any).artistAlias.upsert({
                where: { aliasNormalized },
                update: { artistId, source, confidence, status },
                create: { aliasNormalized, artistId, source, confidence, status },
            });
        } catch (err: any) {
            console.warn(`[ArtistMapping] Could not save alias "${aliasNormalized}":`, err.message);
        }
    }
}
