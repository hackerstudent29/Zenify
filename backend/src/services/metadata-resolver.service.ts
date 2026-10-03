import { prisma } from '../utils/prisma';
import { ArtistMappingService } from './artist-mapping.service';
import axios from 'axios';

export interface MetadataResolutionInput {
    title: string;
    artistName?: string;
    albumTitle?: string;
    duration?: number;
    filename?: string;
    isrc?: string;
    existingCoverUrl?: string;
    existingGenre?: string;
}

export interface MetadataResolutionResult {
    title: string;
    normalizedTitle: string;
    primaryArtistName: string;
    primaryArtistId?: string;
    featuredArtists: string[];
    albumTitle?: string;
    coverUrl?: string;
    genre?: string;
    releaseDate?: Date;
    metadataSource: 'embedded' | 'official_api' | 'verified_search' | 'llm_extracted' | 'user_metadata';
    metadataConfidence: number; // 0.0 to 1.0
    verified: boolean;
}

export class MetadataResolverService {

    /**
     * Clean song titles by stripping bracketed junk (e.g. "[Official Music Video]", "(Lyric Video)", "MP3Juices")
     */
    static cleanTitle(rawTitle: string): string {
        if (!rawTitle) return "Unknown Title";
        return rawTitle
            .replace(/\[\s*(official|lyric|video|hd|4k|audio|remastered|mp3|download|full song)\s*.*?\]/gi, "")
            .replace(/\(\s*(official|lyric|video|hd|4k|audio|remastered|mp3|download|full song)\s*.*?\)/gi, "")
            .replace(/\|.*$/g, "") // Strip text after trailing pipe |
            .replace(/\s+/g, " ")
            .trim();
    }

    /**
     * Primary Resolution Pipeline:
     * 1. Embedded Metadata check
     * 2. Clean & normalize title/artist
     * 3. Artist entity resolution & deduplication (ArtistMappingService)
     * 4. External API verification lookup (iTunes CDN / Spotify)
     * 5. Strict No-Guessing Rule: If confidence < 0.80, preserve existing verified fields untouched.
     */
    static async resolveMetadata(input: MetadataResolutionInput): Promise<MetadataResolutionResult> {
        const rawTitle = input.title || input.filename || "Unknown Track";
        const cleanedTitle = this.cleanTitle(rawTitle);
        const normalizedTitle = cleanedTitle.toLowerCase().trim();

        const rawArtist = input.artistName || "Various Artists";

        // Step 1: Resolve Artist Entity & split primary vs featured artists
        let resolvedArtist = await ArtistMappingService.resolveArtist(rawArtist);

        // Auto-create or fetch Artist DB entity so artist page works
        let dbArtist = await prisma.artist.findFirst({
            where: { name: { equals: resolvedArtist.name, mode: 'insensitive' } }
        });

        if (!dbArtist) {
            dbArtist = await prisma.artist.create({
                data: {
                    name: resolvedArtist.name,
                    verified: false
                }
            });
            console.log(`[MetadataResolver] Created new canonical Artist entity: "${dbArtist.name}" (${dbArtist.id})`);
        }

        // Step 2: Attempt External API verification via iTunes API (Structured & Authoritative)
        let externalMeta: any = null;
        try {
            const query = encodeURIComponent(`${cleanedTitle} ${dbArtist.name}`);
            const res = await axios.get(`https://itunes.apple.com/search?term=${query}&entity=song&limit=1`, { timeout: 4000 });
            if (res.data?.results?.length > 0) {
                const item = res.data.results[0];
                externalMeta = {
                    title: item.trackName,
                    artistName: item.artistName,
                    albumTitle: item.collectionName,
                    coverUrl: item.artworkUrl100?.replace('100x100bb', '600x600bb'),
                    genre: item.primaryGenreName,
                    releaseDate: item.releaseDate ? new Date(item.releaseDate) : undefined
                };
            }
        } catch (err) {
            console.warn(`[MetadataResolver] iTunes API verification lookup failed:`, (err as Error).message);
        }

        // Step 3: Determine Confidence & Source
        let finalTitle = cleanedTitle;
        let coverUrl = input.existingCoverUrl;
        let genre = input.existingGenre;
        let releaseDate: Date | undefined;
        let confidence = 0.85;
        let source: MetadataResolutionResult['metadataSource'] = 'embedded';

        if (externalMeta) {
            // Verify title & artist match reasonably well before overriding
            const titleMatch = externalMeta.title.toLowerCase().includes(cleanedTitle.toLowerCase()) || cleanedTitle.toLowerCase().includes(externalMeta.title.toLowerCase());
            if (titleMatch) {
                finalTitle = externalMeta.title;
                coverUrl = externalMeta.coverUrl || coverUrl;
                genre = externalMeta.genre || genre;
                releaseDate = externalMeta.releaseDate;
                confidence = 0.98;
                source = 'official_api';
                console.log(`[MetadataResolver] Verified against iTunes API: "${finalTitle}" by "${externalMeta.artistName}"`);
            }
        }

        // STRICT NO-GUESSING RULE: If confidence is low, keep existing data intact
        if (confidence < 0.70) {
            console.log(`[MetadataResolver] Low confidence (${confidence}) — maintaining existing metadata untouched.`);
            return {
                title: cleanedTitle,
                normalizedTitle,
                primaryArtistName: dbArtist.name,
                primaryArtistId: dbArtist.id,
                featuredArtists: resolvedArtist.featuredNames || [],
                coverUrl: input.existingCoverUrl,
                genre: input.existingGenre,
                metadataSource: 'user_metadata',
                metadataConfidence: confidence,
                verified: false
            };
        }

        return {
            title: finalTitle,
            normalizedTitle: finalTitle.toLowerCase().trim(),
            primaryArtistName: dbArtist.name,
            primaryArtistId: dbArtist.id,
            featuredArtists: resolvedArtist.featuredNames || [],
            albumTitle: externalMeta?.albumTitle || input.albumTitle,
            coverUrl,
            genre,
            releaseDate,
            metadataSource: source,
            metadataConfidence: confidence,
            verified: confidence >= 0.90
        };
    }
}
