import axios from 'axios';
import * as cheerio from 'cheerio';
import { prisma } from '../utils/prisma.js';
import { KeyPoolService } from './key-pool.service.js';
import { cleanArtistNames, isFakeOrNumericArtistName } from '../utils/artist.js';

export interface ArtistVisuals {
    coverUrl: string | null; // Hero banner
    imageUrl: string | null; // Profile picture
    bio?: string | null;
    source: 'apple_music' | 'rapidapi_spotify' | 'jiosaavn' | 'deezer' | 'db';
}

/** Helper to detect any Apple Music circular mask or cropped image URL */
export function isCircularMaskUrl(url?: string | null): boolean {
    if (!url) return false;
    return (
        url.includes('cw.png') ||
        url.includes('cw.jpg') ||
        url.includes('cw.webp') ||
        url.includes('_cropped.png') ||
        url.includes('_cropped.jpg') ||
        url.includes('AMCArtistImages') ||
        url.includes('1920x1080cw') ||
        url.includes('1200x630cw')
    );
}

export class ArtistMetadataService {
    /**
     * Resolves high-resolution artist hero banner and avatar.
     * Strictly BAN any circular Apple Music masks (cw.png, _cropped.png, AMCArtistImages).
     * Priority:
     *   1. JioSaavn CDN (500x500 pristine rectangular unmasked portrait)
     *   2. RapidAPI Spotify (widescreen headerImage / avatarImage)
     *   3. Deezer (1000x1000 uncropped picture_xl)
     *   4. Apple Music ONLY if uncropped square/rectangular bb.jpg (NEVER cw.png or _cropped.png)
     * Automatically persists results into PostgreSQL database.
     */
    static async fetchArtistVisuals(artistId: string, artistName: string, forceRefresh: boolean = true): Promise<ArtistVisuals | null> {
        const cleanName = cleanArtistNames(artistName).trim();
        if (!cleanName || isFakeOrNumericArtistName(cleanName)) return null;

        // Check canonical dictionary first — authentic verified portraits should never be overwritten
        const { getCanonicalArtist } = await import('../utils/artist.js');
        const canon = getCanonicalArtist(artistName) || getCanonicalArtist(cleanName);
        if (canon?.imageUrl && !isCircularMaskUrl(canon.imageUrl)) {
            const cleanCover = (!isCircularMaskUrl(canon.coverUrl) ? canon.coverUrl : null) || canon.imageUrl;
            return {
                coverUrl: cleanCover,
                imageUrl: canon.imageUrl,
                bio: canon.bio || null,
                source: 'jiosaavn'
            };
        }

        // Check if artist already has high-res images in database (only if not forcing fresh fetch and no circle masks)
        const existing = await prisma.artist.findUnique({
            where: { id: artistId },
            select: { id: true, name: true, imageUrl: true, coverUrl: true, bio: true }
        }).catch(() => null);

        const hasValidCover = existing?.coverUrl && 
            !existing.coverUrl.includes('placeholder') && 
            !existing.coverUrl.includes('logo.png') && 
            !existing.coverUrl.includes('ui-avatars.com') &&
            !isCircularMaskUrl(existing.coverUrl);

        const hasValidImage = existing?.imageUrl && 
            !existing.imageUrl.includes('placeholder') && 
            !existing.imageUrl.includes('logo.png') && 
            !existing.imageUrl.includes('ui-avatars.com') &&
            !isCircularMaskUrl(existing.imageUrl);

        if (!forceRefresh && hasValidCover && hasValidImage) {
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
        let source: ArtistVisuals['source'] = 'jiosaavn';

        // ─────────────────────────────────────────────────────────────
        // 1. PRIMARY: JioSaavn CDN (High-resolution 500x500 rectangular full portrait)
        // ─────────────────────────────────────────────────────────────
        try {
            const sRes = await axios.get('https://www.jiosaavn.com/api.php', {
                params: {
                    __call: 'search.getArtistResults',
                    _format: 'json',
                    _marker: '0',
                    api_version: '4',
                    ctx: 'web6dot0',
                    p: 1,
                    n: 3,
                    q: cleanName
                },
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                timeout: 4500
            }).catch(() => null);

            const match = sRes?.data?.results?.find((r: any) => {
                const rName = (r.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                const tName = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
                return rName === tName || rName.includes(tName) || tName.includes(rName);
            }) || sRes?.data?.results?.[0];

            if (match?.id) {
                const aRes = await axios.get('https://www.jiosaavn.com/api.php', {
                    params: {
                        __call: 'artist.getArtistPageDetails',
                        _format: 'json',
                        _marker: '0',
                        api_version: '4',
                        ctx: 'web6dot0',
                        artistId: match.id,
                        n_song: 5,
                        n_album: 5
                    },
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                    timeout: 4500
                }).catch(() => null);

                const data = aRes?.data;
                if (data?.image && !data.image.includes('artist-default')) {
                    const cleanImg = data.image.replace('150x150', '500x500').replace('50x50', '500x500');
                    heroBanner = cleanImg;
                    avatar = cleanImg;
                    source = 'jiosaavn';
                }
                if (!bio && data?.bio) {
                    try {
                        const parsed = typeof data.bio === 'string' ? JSON.parse(data.bio) : data.bio;
                        if (Array.isArray(parsed)) bio = parsed.map((b: any) => b.text || b).join(' ');
                        else if (typeof parsed === 'string') bio = parsed;
                    } catch {
                        if (typeof data.bio === 'string') bio = data.bio;
                    }
                }
            }
        } catch (saavnErr: any) {
            console.warn(`[ArtistMetadata] JioSaavn lookup warn for "${cleanName}": ${saavnErr.message}`);
        }

        // ─────────────────────────────────────────────────────────────
        // 2. FALLBACK 1: RapidAPI Spotify (Official Spotify Widescreen Header & Avatar)
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

                    if ((spAvatar || spHeader) && !isCircularMaskUrl(spHeader) && !isCircularMaskUrl(spAvatar)) {
                        if (!heroBanner) heroBanner = spHeader || spAvatar;
                        if (!avatar) avatar = spAvatar || spHeader;
                        source = 'rapidapi_spotify';
                    }
                });
            } catch (err: any) {
                // Non-fatal, proceed to Deezer
            }
        }

        // ─────────────────────────────────────────────────────────────
        // 3. FALLBACK 2: Deezer (1000x1000 picture_xl unmasked portrait)
        // ─────────────────────────────────────────────────────────────
        if (!heroBanner || !avatar) {
            try {
                const dzRes = await axios.get(`https://api.deezer.com/search/artist?q=${encodeURIComponent(cleanName)}`, {
                    timeout: 4500
                }).catch(() => null);

                const match = dzRes?.data?.data?.[0];
                if (match) {
                    const img = match.picture_xl || match.picture_big;
                    if (img && !img.includes('artist//') && !isCircularMaskUrl(img)) {
                        if (!heroBanner) heroBanner = img;
                        if (!avatar) avatar = img;
                        source = 'deezer';
                    }
                }
            } catch (err: any) {
                console.warn(`[ArtistMetadata] Deezer lookup failed for "${cleanName}": ${err.message}`);
            }
        }

        // ─────────────────────────────────────────────────────────────
        // 4. FALLBACK 3: Apple Music / iTunes (STRICT: Bounding Box bb.jpg ONLY, NEVER cw.png or _cropped.png)
        // ─────────────────────────────────────────────────────────────
        if (!heroBanner || !avatar) {
            try {
                const searchRes = await axios.get(`https://itunes.apple.com/search`, {
                    params: { term: cleanName, media: 'music', entity: 'musicArtist', limit: 1 },
                    timeout: 4000
                }).catch(() => null);

                const match = searchRes?.data?.results?.[0];
                if (match?.artistLinkUrl) {
                    const pageRes = await axios.get(match.artistLinkUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept-Language': 'en-US,en;q=0.9',
                        },
                        timeout: 5000
                    }).catch(() => null);

                    if (pageRes?.data) {
                        const html = pageRes.data;
                        const $ = cheerio.load(html);
                        const ogImage = $('meta[property="og:image"]').attr('content');
                        // Strictly reject any _cropped.png or cw.png
                        if (ogImage && ogImage.includes('mzstatic') && !isCircularMaskUrl(ogImage)) {
                            const bbImage = ogImage.replace(/\/\d+x\d+.*?\.(png|jpg|webp)/, '/600x600bb.jpg');
                            if (!isCircularMaskUrl(bbImage)) {
                                heroBanner = bbImage;
                                avatar = bbImage;
                                source = 'apple_music';
                            }
                        }

                        const bioText = $('p[data-testid="artist-bio-text"], .artist-bio__text, [class*="editorial-notes"]').first().text().trim();
                        if (bioText && bioText.length > 30) bio = bioText;
                    }
                }
            } catch {}
        }

        // If we found any valid images, save them directly to database (only if free from circular masks)
        if (heroBanner || avatar) {
            try {
                const updateData: any = {};
                if (heroBanner && !isCircularMaskUrl(heroBanner)) {
                    updateData.coverUrl = heroBanner;
                }
                if (avatar && !isCircularMaskUrl(avatar)) {
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
                    console.log(`[ArtistMetadata] Successfully persisted clean ${source} visuals to DB for artist "${cleanName}"`);
                }
            } catch (dbErr: any) {
                console.warn(`[ArtistMetadata] Failed to save visuals to DB for "${cleanName}": ${dbErr.message}`);
            }
        }

        return {
            coverUrl: (!isCircularMaskUrl(heroBanner) ? heroBanner : null) || (!isCircularMaskUrl(existing?.coverUrl) ? existing?.coverUrl : null) || null,
            imageUrl: (!isCircularMaskUrl(avatar) ? avatar : null) || (!isCircularMaskUrl(existing?.imageUrl) ? existing?.imageUrl : null) || null,
            bio: bio || existing?.bio || null,
            source
        };
    }
}
