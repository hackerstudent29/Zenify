import { prisma } from '../utils/prisma';
import { FeaturedService } from './featured.service';
import { TrendingService } from './trending.service';

// ---------------- Redis Caching Helpers ----------------
import { getCacheVal, setCacheVal } from '../utils/cache';

async function getCached(key: string): Promise<any | null> {
    return await getCacheVal(key);
}

async function setCache(key: string, data: any, ttlMs: number) {
    // TTL is passed in milliseconds to setCache, converted to seconds for Redis
    await setCacheVal(key, data, Math.round(ttlMs / 1000));
}

// ---------------- Slim Track Select ----------------
const SLIM_SELECT = {
    id: true,
    title: true,
    coverUrl: true,
    audioUrl: true,
    duration: true,
    genre: true,
    streams: true,
    createdAt: true,
    engagement_score: true,
    bpm: true,
    language: true,
    like_count: true,
    aura_color: true,
    aura_vibe: true,
    palette: true,
    artist: {
        select: { id: true, name: true, imageUrl: true }
    },
    album: {
        select: { id: true, title: true, coverUrl: true, palette: true }
    }
};

// Format tracks for API response to match exactly what the frontend PlayerStore expects
function formatTrack(t: any) {
    return {
        id: t.id,
        title: t.title,
        coverUrl: t.coverUrl,
        audioUrl: t.audioUrl,
        duration: t.duration,
        genre: t.genre,
        aura_color: t.aura_color,
        aura_vibe: t.aura_vibe,
        artistId: t.artist?.id,
        palette: t.palette,
        artist: {
            id: t.artist?.id || '',
            name: t.artist?.name || 'Unknown Artist',
            imageUrl: t.artist?.imageUrl,
        },
        album: t.album ? {
            id: t.album.id,
            title: t.album.title,
            coverUrl: t.album.coverUrl,
            palette: t.album.palette,
        } : undefined,
    };
}

export class HomepageService {

    // ========================================================
    // PUBLIC: Real-Time Section Fetchers
    // ========================================================

    async getFeaturedSection(userId?: string, countryParam?: string, langParam?: string) {
        const items = await this.getFeaturedRow(userId, countryParam, langParam);
        return { items, title: 'Featured Now', subtitle: 'TOP PICKS FROM THE EDITORIAL TEAM', type: 'featured' };
    }

    async getContinueListeningSection(userId?: string, limit: number = 10) {
        if (!userId) return { items: [], title: 'Continue Listening', subtitle: 'JUMP BACK IN', type: 'continue_listening' };
        
        try {
            const fetchLimit = Math.max(limit * 3, 30);
            const [historyEntries, userStats] = await Promise.all([
                prisma.history.findMany({
                    where: { userId, track: { deletedAt: null } },
                    orderBy: { playedAt: 'desc' },
                    take: fetchLimit,
                    include: { track: { select: SLIM_SELECT } }
                }),
                prisma.userTrackStat.findMany({
                    where: { userId, track: { deletedAt: null } },
                    orderBy: { lastStreamedAt: 'desc' },
                    take: fetchLimit,
                    include: { track: { select: SLIM_SELECT } }
                })
            ]);

            const trackMap = new Map<string, { track: any; lastTime: number; resumeProgress?: number }>();

            for (const h of historyEntries) {
                if (!h.track || !h.trackId) continue;
                const time = h.playedAt ? new Date(h.playedAt).getTime() : 0;
                trackMap.set(h.trackId, {
                    track: h.track,
                    lastTime: time
                });
            }

            for (const s of userStats) {
                if (!s.track || !s.trackId) continue;
                const time = s.lastStreamedAt ? new Date(s.lastStreamedAt).getTime() : 0;
                const existing = trackMap.get(s.trackId);
                if (existing) {
                    if (time > existing.lastTime) {
                        existing.lastTime = time;
                    }
                    if (s.resumeProgress && s.resumeProgress > 0) {
                        existing.resumeProgress = s.resumeProgress;
                    }
                } else {
                    trackMap.set(s.trackId, {
                        track: s.track,
                        lastTime: time,
                        resumeProgress: s.resumeProgress && s.resumeProgress > 0 ? s.resumeProgress : undefined
                    });
                }
            }

            // Sort by most recent interaction descending and take up to `limit` (default 10)
            const sorted = Array.from(trackMap.values())
                .sort((a, b) => b.lastTime - a.lastTime)
                .slice(0, limit);

            const items = sorted.map(s => {
                const formatted = formatTrack(s.track);
                return { ...formatted, resumeProgress: s.resumeProgress };
            });

            return { items, title: 'Continue Listening', subtitle: 'JUMP BACK IN', type: 'continue_listening' };
        } catch (err) {
            console.error('Continue listening failed:', err);
            return { items: [], title: 'Continue Listening', subtitle: 'JUMP BACK IN', type: 'continue_listening' };
        }
    }

    async getRecentlyPlayedSection(userId?: string) {
        const items = userId ? await this.getRecentlyPlayedRow(userId) : [];
        return { items, title: 'Recently Played', subtitle: 'PICK UP WHERE YOU LEFT OFF', type: 'recently_played' };
    }

    async getNewArrivalsSection() {
        const items = await this.getNewReleasesRow();
        return { items, title: 'New Arrivals', subtitle: 'FRESHLY PRESSED FROM THE STUDIO', type: 'new' };
    }

    async getTrendingSection() {
        const items = await this.getTrendingRow(); // the trending row is already implemented to do 48h
        return { items, title: 'Trending & Charts', subtitle: 'THE PULSE OF THE COMMUNITY', type: 'trending' };
    }

    async getMoodsSection() {
        const items = await this.getMoodsRow();
        return { items, title: 'Browse By Mood', subtitle: 'EXPLORE DIFFERENT FREQUENCIES', type: 'moods' };
    }

    async getRecommendationsSection(userId?: string) {
        const items = userId ? await this.getPersonalizedRow(userId) : [];
        return { items, title: 'Made For You', subtitle: 'BASED ON YOUR SONIC PREFERENCES', type: 'personalized' };
    }

    async getTopArtistsSection() {
        const items = await this.getTopArtistsRow();
        return { items, title: 'Top Artists', subtitle: 'THE MOST STREAMED VOICES', type: 'top_artists' };
    }

    async getTopAlbumsSection() {
        const items = await this.getTopAlbumsRow();
        return { items, title: 'Top Albums', subtitle: 'MASTERPIECES FROM THE ARCHIVE', type: 'top_albums' };
    }

    // ========================================================
    // PUBLIC: Get all homepage sections for a user (Legacy)
    // ========================================================
    async getHomepage(userId?: string, currentTrackId?: string) {
        const sections: any[] = [];

        // Run queries in parallel
        const [
            recentlyPlayed,
            newReleases,
            personalized,
            trending,
            mostPlayed,
            topPlaylists,
            moods,
            topArtists,
            topAlbums,
            featured
        ] = await Promise.all([
            userId ? this.getRecentlyPlayedRow(userId) : Promise.resolve([]),
            this.getNewReleasesRow(),
            userId ? this.getPersonalizedRow(userId) : Promise.resolve([]),
            this.getTrendingRow(),
            this.getMostPlayedRow(),
            this.getTopPlaylistsRow(),
            this.getMoodsRow(),
            this.getTopArtistsRow(),
            this.getTopAlbumsRow(),
            this.getFeaturedRow(),
        ]);

        // 1. Featured Now
        sections.push({
            title: 'Featured Now',
            subtitle: 'TOP PICKS FROM THE EDITORIAL TEAM',
            type: 'featured',
            items: featured,
        });

        // 2. Recently Played
        if (recentlyPlayed && recentlyPlayed.length > 0) {
            sections.push({
                title: 'Recently Played',
                subtitle: 'PICK UP WHERE YOU LEFT OFF',
                type: 'recently_played',
                items: recentlyPlayed,
            });
        }

        // 3. New Arrivals
        sections.push({
            title: 'New Arrivals',
            subtitle: 'FRESHLY PRESSED FROM THE STUDIO',
            type: 'new',
            items: newReleases,
        });

        // 4. Recommended For You
        if (personalized && personalized.length > 0) {
            sections.push({
                title: 'Made For You',
                subtitle: 'BASED ON YOUR SONIC PREFERENCES',
                type: 'personalized',
                items: personalized,
            });
        }

        // 5. Trending / Charts
        const charts = trending.length > 0 ? trending : mostPlayed;
        sections.push({
            title: 'Trending & Charts',
            subtitle: 'THE PULSE OF THE COMMUNITY',
            type: 'trending',
            items: charts,
        });

        // 6. Top Playlists
        if (topPlaylists && topPlaylists.length > 0) {
            sections.push({
                title: 'Top Playlists',
                subtitle: 'CURATED MOODS & COLLECTIONS',
                type: 'playlists',
                items: topPlaylists,
            });
        }

        // 7. Browse By Mood or Genre
        if (moods && moods.length > 0) {
            sections.push({
                title: 'Browse By Mood',
                subtitle: 'EXPLORE DIFFERENT FREQUENCIES',
                type: 'moods',
                items: moods,
            });
        }

        // 8. Top Artists
        if (topArtists && topArtists.length > 0) {
            sections.push({
                title: 'Top Artists',
                subtitle: 'THE MOST STREAMED VOICES',
                type: 'top_artists',
                items: topArtists,
            });
        }

        // 9. Top Albums
        if (topAlbums && topAlbums.length > 0) {
            sections.push({
                title: 'Top Albums',
                subtitle: 'MASTERPIECES FROM THE ARCHIVE',
                type: 'top_albums',
                items: topAlbums,
            });
        }

        return { sections };
    }

    // ========================================================
    // ROW: Featured Now (Editorial Picks & Regional Hits)
    // ========================================================
    private async getFeaturedRow(userId?: string, countryParam?: string, langParam?: string) {
        let country = countryParam;
        let language = langParam;

        if ((!country || !language) && userId) {
            try {
                const [u, prefs] = await Promise.all([
                    prisma.user.findUnique({ where: { id: userId }, select: { country: true } }),
                    prisma.userPreferences.findUnique({ where: { userId }, select: { languages: true, selectedCountryCode: true, selectedLanguageCode: true } })
                ]);
                country = country || prefs?.selectedCountryCode || u?.country || undefined;
                language = language || prefs?.selectedLanguageCode || prefs?.languages?.[0] || undefined;
            } catch {}
        }

        const { CountryLanguageService } = await import('./country-language.service.js');
        const normCountry = CountryLanguageService.normalizeCountry(country);
        const normLang = CountryLanguageService.normalizeLanguage(language);

        // If a territory or language is resolved (e.g. CN / zh, JP / ja, KR / ko, etc.)
        if (normCountry || normLang) {
            const countryCode = normCountry?.code || 'IN';
            const langCode = normLang?.code || 'en';
            const virtualHits = await CountryLanguageService.discoverVirtualForCountryLanguage(countryCode, langCode, 'popular', 15);
            if (virtualHits && virtualHits.length > 0) {
                return virtualHits;
            }
        }

        const featured = await FeaturedService.getActiveFeatured(15);
        if (featured && featured.length >= 10) {
            return featured;
        }

        const defaultHits = await CountryLanguageService.discoverVirtualForCountryLanguage('IN', 'ta', 'popular', 15);
        return defaultHits.length > 0 ? defaultHits : featured;
    }

    // ========================================================
    // ROW 1: Personalized For User (High-Precision Multi-Stage Engine)
    // ========================================================
    private async getPersonalizedRow(userId: string) {
        try {
            const { RecommendationEngineService } = await import('./recommendation-engine.service.js');
            const recommendations = await RecommendationEngineService.getPersonalizedDiscovery(userId, { limit: 12 });

            // Zero generic fallbacks: Return only verified candidates that passed the quality gate
            if (!recommendations || recommendations.length === 0) {
                return [];
            }

            return recommendations.map(rec => ({
                id: rec.id,
                title: rec.title,
                coverUrl: rec.coverUrl,
                audioUrl: rec.audioUrl,
                duration: rec.duration,
                genre: rec.genre,
                artistId: rec.artistId,
                artist: {
                    id: rec.artistId || '',
                    name: rec.artistName || 'Unknown Artist',
                    imageUrl: undefined
                },
                album: rec.albumId ? {
                    id: rec.albumId,
                    title: rec.albumTitle || '',
                    coverUrl: rec.coverUrl
                } : undefined,
                recommendationReason: rec.recommendationReason,
                provenance: rec.provenance
            }));
        } catch (err) {
            console.error('Personalized row failed:', err);
            // Non-negotiable: return empty list on failure rather than unrelated fallback
            return [];
        }
    }

    // Most Played Row (Global Top 20)
    private async getMostPlayedRow() {
        const cached = await getCached('most_played_row');
        if (cached && Array.isArray(cached)) return cached;
        else if (typeof cached === 'string') {
            try { const parsed = JSON.parse(cached); if (Array.isArray(parsed)) return parsed; } catch {}
        }

        const tracks = await prisma.track.findMany({
            where: { deletedAt: null, releaseStatus: 'PUBLISHED', isUnlisted: false },
            select: SLIM_SELECT,
            orderBy: { streams: 'desc' },
            take: 20,
        });

        const result = tracks.map(formatTrack);
        await setCache('most_played_row', result, 1 * 60 * 1000); // 1 min cache
        return result;
    }

    // Fallback when no user or no history
    private async getFallbackPopular() {
        return this.getMostPlayedRow();
    }

    // ========================================================
    // ROW 2: Trending Now
    // ========================================================
    private async getTrendingRow() {
        return await TrendingService.getTrendingTracks(20);
    }

    // ========================================================
    // ROW 3: New & Quality Releases
    // ========================================================
    private async getNewReleasesRow() {
        const cached = await getCached('new_releases_row');
        if (cached && Array.isArray(cached)) return cached;
        else if (typeof cached === 'string') {
            try { const parsed = JSON.parse(cached); if (Array.isArray(parsed)) return parsed; } catch {}
        }

        try {
            const tracks = await prisma.track.findMany({
                where: {
                    deletedAt: null,
                    OR: [
                        { releaseStatus: 'PUBLISHED' },
                        { releaseStatus: 'SCHEDULED', scheduledAt: { lte: new Date() } }
                    ],
                    isUnlisted: false,
                },
                select: SLIM_SELECT,
                orderBy: { createdAt: 'desc' },
                take: 12,
            });

            const result: any[] = tracks.map(formatTrack);

            if (result.length < 10) {
                try {
                    const { ExternalMetadataService } = await import('./external-metadata.service.js');
                    const ytmNew = await ExternalMetadataService.searchYoutubeMusicInnertube('New Songs 2026');
                    const existingTitles = new Set(result.map(t => t.title.toLowerCase().trim()));
                    for (const yt of ytmNew) {
                        const cleanTitle = (yt.title || '').trim();
                        if (cleanTitle && !existingTitles.has(cleanTitle.toLowerCase())) {
                            existingTitles.add(cleanTitle.toLowerCase());
                            result.push({
                                id: `yt-${yt.videoId}`,
                                title: cleanTitle,
                                coverUrl: yt.thumbnail,
                                audioUrl: yt.audioUrl || `https://www.youtube.com/watch?v=${yt.videoId}`,
                                duration: yt.duration || 210,
                                artist: { id: '', name: yt.artist || 'New Release' },
                                album: { id: `yt-album-${yt.videoId}`, title: cleanTitle, coverUrl: yt.thumbnail },
                                isVirtual: true,
                                isYoutube: true,
                                youtubeId: yt.videoId
                            });
                            if (result.length >= 15) break;
                        }
                    }
                } catch {}
            }

            // Lowered cache to 1 minute so newly imported tracks show up almost immediately
            await setCache('new_releases_row', result, 1 * 60 * 1000);
            return result;
        } catch (err) {
            console.error('New releases row failed:', err);
            return [];
        }
    }

    // ========================================================
    // ROW 4: Similar to Currently Playing
    // ========================================================
    private async getSimilarRow(trackId: string) {
        const cacheKey = `similar_${trackId}`;
        const cached = await getCached(cacheKey);
        if (cached) return cached;

        try {
            const currentTrack = await prisma.track.findUnique({
                where: { id: trackId },
                select: { genre: true, language: true, bpm: true, artistId: true }
            });

            if (!currentTrack) return [];

            const bpmRange = currentTrack.bpm ? { gte: currentTrack.bpm - 15, lte: currentTrack.bpm + 15 } : undefined;

            const candidates = await prisma.track.findMany({
                where: {
                    id: { not: trackId },
                    deletedAt: null,
                    releaseStatus: 'PUBLISHED',
                    isUnlisted: false,
                    OR: [
                        { genre: currentTrack.genre },
                        { language: currentTrack.language },
                        { artistId: currentTrack.artistId },
                        ...(bpmRange ? [{ bpm: bpmRange }] : []),
                    ]
                },
                select: SLIM_SELECT,
                take: 30,
            });

            // Simple similarity scoring (cosine-like vector approach)
            const scored = candidates.map(track => {
                let similarity = 0;
                if (track.genre === currentTrack.genre) similarity += 0.4;
                if (track.language === currentTrack.language) similarity += 0.15;
                if ((track as any).artistId === currentTrack.artistId) similarity += 0.25;
                if (currentTrack.bpm && track.bpm) {
                    const bpmDiff = Math.abs(track.bpm - currentTrack.bpm);
                    similarity += Math.max(0, 0.2 - (bpmDiff / 150)); // closer BPM = higher score
                }
                return { track, score: similarity };
            });

            scored.sort((a, b) => b.score - a.score);
            const result = scored.slice(0, 10).map(s => formatTrack(s.track));
            await setCache(cacheKey, result, 5 * 60 * 1000);
            return result;
        } catch (err) {
            console.error('Similar row failed:', err);
            return [];
        }
    }

    // ========================================================
    // ENGAGEMENT SCORE UPDATER (call periodically)
    // ========================================================
    static async updateEngagementScores() {
        console.log('[Engagement] Starting score update...');
        const startTime = Date.now();

        try {
            // Get all tracks with their aggregate stats
            const tracks = await prisma.track.findMany({
                where: { deletedAt: null },
                select: {
                    id: true,
                    streams: true,
                    like_count: true,
                    engagement_score: true,
                    userStats: {
                        select: {
                            streamCount: true,
                            skipCount: true,
                            completionRateAvg: true,
                        }
                    }
                }
            });

            let updated = 0;
            // Process sequentially to avoid Prisma connection pool timeouts
            for (const track of tracks) {
                const totalPlays = track.streams || 0;
                const likeCount = track.like_count || 0;

                // Aggregate across all user stats for this track
                let avgCompletion = 0;
                let skipRate = 0;
                if (track.userStats.length > 0) {
                    const totalUserPlays = track.userStats.reduce((s, u: any) => s + (u.streamCount || 0), 0);
                    const totalSkips = track.userStats.reduce((s, u: any) => s + u.skipCount, 0);
                    avgCompletion = track.userStats.reduce((s, u) => s + (u.completionRateAvg || 0), 0) / track.userStats.length;
                    skipRate = totalUserPlays > 0 ? totalSkips / totalUserPlays : 0;
                }

                // EngagementScore = plays*0.4 + completion*0.3 - skipRate*0.2 + likes*0.1
                const score =
                    Math.min(totalPlays / 100, 1) * 40 +     // normalize plays (cap at 100)
                    avgCompletion * 30 +                       // 0-1 range
                    (1 - skipRate) * 20 +                      // lower skip = better
                    Math.min(likeCount / 50, 1) * 10;         // normalize likes (cap at 50)

                const newScore = Math.round(score * 100) / 100;
                // Only execute DB write over pooler if score actually shifted
                if (Math.abs((track.engagement_score || 0) - newScore) > 0.02) {
                    await prisma.track.update({
                        where: { id: track.id },
                        data: { engagement_score: newScore }
                    });
                    updated++;
                }
            }

            const elapsed = Date.now() - startTime;
            console.log(`[Engagement] Updated ${updated} tracks in ${elapsed}ms.`);
        } catch (err) {
            console.error('[Engagement] Score update failed:', err);
        }
    }

    // ========================================================
    // ROW: Recently Played
    // ========================================================
    private async getRecentlyPlayedRow(userId: string) {
        try {
            const history = await prisma.history.findMany({
                where: { userId },
                orderBy: { playedAt: 'desc' },
                take: 15,
                include: {
                    track: {
                        select: SLIM_SELECT
                    }
                }
            });

            // De-duplicate tracks
            const seen = new Set<string>();
            const uniqueTracks = [];
            for (const h of history) {
                if (!seen.has(h.trackId)) {
                    seen.add(h.trackId);
                    uniqueTracks.push(formatTrack(h.track));
                }
            }
            return uniqueTracks.slice(0, 10);
        } catch (err) {
            console.error('Recently played row failed:', err);
            return [];
        }
    }

    // ========================================================
    // ROW: Top Playlists
    // ========================================================
    private async getTopPlaylistsRow() {
        const cacheKey = 'hp:top_playlists';
        const cached = await getCached(cacheKey);
        if (cached && Array.isArray(cached)) return cached;
        else if (typeof cached === 'string') {
            try { const parsed = JSON.parse(cached); if (Array.isArray(parsed)) return parsed; } catch {}
        }

        const playlists = await prisma.playlist.findMany({
            where: { isPublic: true },
            orderBy: { popularity_score: 'desc' },
            take: 10,
            include: { 
                user: true,
                tracks: {
                    where: {
                        track: { deletedAt: null }
                    },
                    include: {
                        track: {
                            select: { coverUrl: true }
                        }
                    },
                    orderBy: { addedAt: 'asc' },
                    take: 4
                }
            }
        });

        const formatted = playlists.map(p => {
            const covers = p.tracks.map((t: any) => t.track.coverUrl).filter(Boolean);
            return {
                id: p.id,
                title: p.name,
                artist: { name: p.user.username || p.user.name || 'Zenify' },
                coverUrl: p.coverUrl || '',
                covers: covers.length > 0 ? covers : undefined,
                isPlaylist: true,
                href: `/playlist/${p.id}`
            };
        });

        await setCache(cacheKey, formatted, 1 * 60 * 1000); // 1 min
        return formatted;
    }

    // ========================================================
    // ROW: Moods / Genres
    // ========================================================
    private async getMoodsRow() {
        // Static list of curated moods/genres for the UI
        // Using Unsplash curated images that match each vibe
        const moods = [
            {
                id: 'tamil-folk',
                title: 'Tamil Folk',
                coverUrl: '/public/moods/tamil-folk.png',
                aura_color: '#F43F5E',
                href: '/explore/genre/tamil-folk'
            },
            {
                id: 'hip-hop',
                title: 'Hip-Hop',
                coverUrl: '/public/moods/hip-hop.png',
                aura_color: '#8B5CF6',
                href: '/explore/genre/hip-hop'
            },
            {
                id: 'melody',
                title: 'Melody',
                coverUrl: '/public/moods/melody.png',
                aura_color: '#3B82F6',
                href: '/explore/genre/melody'
            },
            {
                id: 'mass',
                title: 'Mass',
                coverUrl: '/public/moods/mass.png',
                aura_color: '#F59E0B',
                href: '/explore/genre/mass'
            },
            {
                id: 'chill',
                title: 'Chill',
                coverUrl: '/public/moods/chill.png',
                aura_color: '#10B981',
                href: '/explore/genre/chill'
            },
            {
                id: 'phonk',
                title: 'Phonk',
                coverUrl: '/public/moods/phonk.png',
                aura_color: '#A855F7',
                href: '/explore/genre/phonk'
            },
            {
                id: 'love',
                title: 'Love Songs',
                coverUrl: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=400&q=80&fit=crop',
                aura_color: '#EC4899',
                href: '/explore/genre/love'
            },
            {
                id: 'workout',
                title: 'Workout',
                coverUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&q=80&fit=crop',
                aura_color: '#EF4444',
                href: '/explore/genre/workout'
            },
        ];

        return moods.map(m => ({
            ...m,
            isMood: true,
            artist: { name: 'Curated' }
        }));
    }

    // ========================================================
    // ========================================================
    // ROW: Top Artists
    // ========================================================
    private async getTopArtistsRow() {
        const cacheKey = 'hp:top_artists';
        const cached = await getCached(cacheKey);
        if (cached) return cached;

        const artists = await prisma.artist.findMany({
            orderBy: { totalStreams: 'desc' },
            take: 12,
            where: {
                imageUrl: { not: null },
            },
            select: { id: true, name: true, imageUrl: true }
        });

        // Map them to look similar to tracks for generic components to parse if needed, but explicitly they are artists
        const formatted: any[] = artists.map(a => ({
            id: a.id,
            title: a.name,
            artist: { name: 'Artist' },
            coverUrl: a.imageUrl,
            isArtist: true,
            href: `/artist/${a.id}`
        }));

        if (formatted.length < 10) {
            try {
                const { ExternalMetadataService } = await import('./external-metadata.service.js');
                const ytmArtists = await ExternalMetadataService.fetchYoutubeMusicChartsTopArtists();
                const existingNames = new Set(formatted.map(a => a.title.toLowerCase().trim()));
                for (const a of ytmArtists) {
                    if (!existingNames.has(a.title.toLowerCase().trim())) {
                        existingNames.add(a.title.toLowerCase().trim());
                        formatted.push(a);
                        if (formatted.length >= 24) break;
                    }
                }
            } catch (err: any) {
                console.warn('[HomepageService] Failed to load YT Music top artists:', err.message);
            }
        }

        if (formatted.length < 6) {
            const { CANONICAL_ARTISTS } = await import('../utils/artist.js');
            const existingNames = new Set(formatted.map(a => a.title.toLowerCase().trim()));
            for (const [key, can] of Object.entries(CANONICAL_ARTISTS)) {
                if (!existingNames.has(can.name.toLowerCase().trim())) {
                    existingNames.add(can.name.toLowerCase().trim());
                    formatted.push({
                        id: `canonical-${key}`,
                        title: can.name,
                        artist: { name: 'Artist' },
                        coverUrl: can.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(can.name)}&background=random&color=fff&size=512`,
                        isArtist: true,
                        href: `/artist/${encodeURIComponent(can.name)}`
                    });
                    if (formatted.length >= 12) break;
                }
            }
        }

        await setCache(cacheKey, formatted, 1 * 60 * 1000); // 1 min
        return formatted;
    }

    // ========================================================
    // ROW: Top Albums
    // ========================================================
    private async getTopAlbumsRow() {
        const cacheKey = 'hp:top_albums';
        const cached = await getCached(cacheKey);
        if (cached) return cached;

        // Fetch albums ordered by latest/top
        const albums = await prisma.album.findMany({
            orderBy: [
                { popularity_score: 'desc' },
                { createdAt: 'desc' }
            ],
            take: 10,
            where: {
                coverUrl: { not: null },
            },
            include: { 
                artist: true,
                tracks: {
                    select: { duration: true }
                }
            }
        });

        const formatted: any[] = albums.map(a => {
            const totalDuration = a.tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
            return {
                id: a.id,
                title: a.title,
                artist: { name: a.artist.name },
                coverUrl: a.coverUrl,
                duration: totalDuration,
                isAlbum: true,
                href: `/album/${a.id}`
            };
        });

        if (formatted.length < 10) {
            try {
                const { ExternalMetadataService } = await import('./external-metadata.service.js');
                const ytmAlbums = await ExternalMetadataService.fetchYoutubeMusicExploreAlbums();
                const existingTitles = new Set(formatted.map(a => a.title.toLowerCase().trim()));
                for (const alb of ytmAlbums) {
                    if (!existingTitles.has(alb.title.toLowerCase().trim())) {
                        existingTitles.add(alb.title.toLowerCase().trim());
                        formatted.push(alb);
                        if (formatted.length >= 20) break;
                    }
                }
            } catch (err: any) {
                console.warn('[HomepageService] Failed to load YT Music top albums:', err.message);
            }
        }

        await setCache(cacheKey, formatted, 1000 * 60 * 15);
        return formatted;

        await setCache(cacheKey, formatted, 1000 * 60 * 15);
        return formatted;
    }
}
