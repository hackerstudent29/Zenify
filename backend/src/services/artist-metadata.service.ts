import axios from 'axios';
import * as cheerio from 'cheerio';
import { prisma } from '../utils/prisma.js';
import { KeyPoolService } from './key-pool.service.js';
import { cleanArtistNames, isFakeOrNumericArtistName } from '../utils/artist.js';

export interface ArtistVisuals {
    coverUrl: string | null; // Hero banner (1920x1080)
    imageUrl: string | null; // Profile picture (600x600)
    bio?: string | null;
    source: 'apple_music' | 'rapidapi_spotify' | 'jiosaavn' | 'deezer' | 'db';
}

export class ArtistMetadataService {
    /**
     * Resolves high-resolution artist hero banner (1920x1080) and avatar from Apple Music,
     * with fallbacks to RapidAPI Spotify, JioSaavn, and Deezer.
     * Automatically persists results into PostgreSQL database.
     */
    static async fetchArtistVisuals(artistId: string, artistName: string): Promise<ArtistVisuals | null> {
        const cleanName = cleanArtistNames(artistName).trim();
        if (!cleanName || isFakeOrNumericArtistName(cleanName)) return null;

        // Check if artist already has high-res images in database
        const existing = await prisma.artist.findUnique({
            where: { id: artistId },
            select: { id: true, name: true, imageUrl: true, coverUrl: true, bio: true }
        }).catch(() => null);

        const hasValidCover = existing?.coverUrl && 
            !existing.coverUrl.includes('placeholder') && 
            !existing.coverUrl.includes('logo.png') && 
            !existing.coverUrl.includes('ui-avatars.com');

        const hasValidImage = existing?.imageUrl && 
            !existing.imageUrl.includes('placeholder') && 
            !existing.imageUrl.includes('logo.png') && 
            !existing.imageUrl.includes('ui-avatars.com');

        if (hasValidCover && hasValidImage) {
            return {
                coverUrl: existing.coverUrl,
                imageUrl: existing.imageUrl,
                bio: existing.bio,
                source: 'db'
            };
        }

        let heroBanner: string | null = null;
        let avatar: string | null = null;
        let bio: string | null = existing?.bio || null;
        let source: ArtistVisuals['source'] = 'apple_music';

        // ─────────────────────────────────────────────────────────────
        // 1. PRIMARY: Apple Music / iTunes Web Scraper (Official 1920x1080)
        // ─────────────────────────────────────────────────────────────
        try {
            const searchRes = await axios.get(`https://itunes.apple.com/search`, {
                params: {
                    term: cleanName,
                    media: 'music',
                    entity: 'musicArtist',
                    limit: 1
                },
                timeout: 5000
            }).catch(() => null);

            const match = searchRes?.data?.results?.[0];
            if (match?.artistLinkUrl) {
                const pageRes = await axios.get(match.artistLinkUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept-Language': 'en-US,en;q=0.9',
                    },
                    timeout: 7000
                }).catch(() => null);

                if (pageRes?.data) {
                    const $ = cheerio.load(pageRes.data);
                    const ogImage = $('meta[property="og:image"]').attr('content');
                    if (ogImage && ogImage.includes('mzstatic')) {
                        heroBanner = ogImage.replace(/\/\d+x\d+.*?\.(png|jpg|webp)/, '/1920x1080bb.$1');
                        avatar = ogImage.replace(/\/\d+x\d+.*?\.(png|jpg|webp)/, '/600x600bb.$1');
                        source = 'apple_music';
                    }

                    // Also extract editorial bio if present
                    const bioText = $('p[data-testid="artist-bio-text"], .artist-bio__text, [class*="editorial-notes"]').first().text().trim();
                    if (bioText && bioText.length > 30) {
                        bio = bioText;
                    }
                }
            }
        } catch (e: any) {
            console.warn(`[ArtistMetadata] Apple Music lookup failed for "${cleanName}": ${e.message}`);
        }

        // ─────────────────────────────────────────────────────────────
        // 2. FALLBACK 1: RapidAPI Spotify (using key pool failover)
        // ─────────────────────────────────────────────────────────────
        if (!heroBanner || !avatar) {
            try {
                await KeyPoolService.executeWithFailover('rapidapi', async (apiKey) => {
                    const spRes = await axios.get('https://spotify23.p.rapidapi.com/search/', {
                        params: { q: cleanName, type: 'artists', limit: 1 },
                        headers: {
                            'x-rapidapi-key': apiKey,
                            'x-rapidapi-host': 'spotify23.p.rapidapi.com'
                        },
                        timeout: 5000
                    });

                    const item = spRes.data?.artists?.items?.[0]?.data;
                    const spAvatar = item?.visuals?.avatarImage?.sources?.[0]?.url;
                    const spHeader = item?.visuals?.headerImage?.sources?.[0]?.url;

                    if (spAvatar || spHeader) {
                        if (!heroBanner) heroBanner = spHeader || spAvatar;
                        if (!avatar) avatar = spAvatar || spHeader;
                        source = 'rapidapi_spotify';
                    }
                });
            } catch (err: any) {
                // Non-fatal, proceed to JioSaavn
            }
        }

        // ─────────────────────────────────────────────────────────────
        // 3. FALLBACK 2: JioSaavn (500x500 high-resolution regional/global)
        // ─────────────────────────────────────────────────────────────
        if (!heroBanner || !avatar) {
            try {
                const saavnRes = await axios.get('https://www.jiosaavn.com/api.php', {
                    params: {
                        __call: 'artist.getArtistPageDetails',
                        artist_name: cleanName,
                        _format: 'json',
                        _marker: '0',
                        api_version: '4',
                        ctx: 'web6dot0'
                    },
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                    timeout: 5000
                }).catch(() => null);

                const data = saavnRes?.data;
                if (data?.image) {
                    const img = data.image.replace('150x150', '500x500').replace('50x50', '500x500');
                    if (!heroBanner) heroBanner = img;
                    if (!avatar) avatar = img;
                    if (!bio && data.bio) bio = data.bio;
                    source = 'jiosaavn';
                }
            } catch (err: any) {
                console.warn(`[ArtistMetadata] JioSaavn lookup failed for "${cleanName}": ${err.message}`);
            }
        }

        // ─────────────────────────────────────────────────────────────
        // 4. FALLBACK 3: Deezer (1000x1000 picture_xl)
        // ─────────────────────────────────────────────────────────────
        if (!heroBanner || !avatar) {
            try {
                const dzRes = await axios.get(`https://api.deezer.com/search/artist?q=${encodeURIComponent(cleanName)}`, {
                    timeout: 4500
                }).catch(() => null);

                const match = dzRes?.data?.data?.[0];
                if (match) {
                    const img = match.picture_xl || match.picture_big;
                    if (img && !img.includes('artist//')) {
                        if (!heroBanner) heroBanner = img;
                        if (!avatar) avatar = img;
                        source = 'deezer';
                    }
                }
            } catch (err: any) {
                console.warn(`[ArtistMetadata] Deezer lookup failed for "${cleanName}": ${err.message}`);
            }
        }

        // If we found any valid images, save them directly to database
        if (heroBanner || avatar) {
            try {
                const updateData: any = {};
                if (heroBanner && (!existing?.coverUrl || existing.coverUrl.includes('placeholder') || existing.coverUrl.includes('logo.png'))) {
                    updateData.coverUrl = heroBanner;
                }
                if (avatar && (!existing?.imageUrl || existing.imageUrl.includes('placeholder') || existing.imageUrl.includes('ui-avatars.com'))) {
                    updateData.imageUrl = avatar;
                }
                if (bio && (!existing?.bio || existing.bio.length < 30)) {
                    updateData.bio = bio;
                }

                if (Object.keys(updateData).length > 0) {
                    await prisma.artist.update({
                        where: { id: artistId },
                        data: updateData
                    });
                    console.log(`[ArtistMetadata] Successfully persisted ${source} visuals to DB for artist "${cleanName}"`);
                }
            } catch (dbErr: any) {
                console.warn(`[ArtistMetadata] Failed to save visuals to DB for "${cleanName}": ${dbErr.message}`);
            }
        }

        return {
            coverUrl: heroBanner || existing?.coverUrl || null,
            imageUrl: avatar || existing?.imageUrl || null,
            bio: bio || existing?.bio || null,
            source
        };
    }
}
