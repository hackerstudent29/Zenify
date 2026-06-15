import { prisma } from '../utils/prisma';

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

    async getFeaturedSection() {
        const items = await this.getFeaturedRow();
        return { items, title: 'Featured Now', subtitle: 'TOP PICKS FROM THE EDITORIAL TEAM', type: 'featured' };
    }

    async getContinueListeningSection(userId?: string) {
        if (!userId) return { items: [], title: 'Continue Listening', subtitle: 'JUMP BACK IN', type: 'continue_listening' };
        
        try {
            const stats = await prisma.userTrackStat.findMany({
                where: { 
                    userId, 
                    resumeProgress: { gt: 0 } 
                },
                orderBy: { lastStreamedAt: 'desc' },
                take: 15,
                include: { track: { select: SLIM_SELECT } }
            });

            // Filter out tracks where they finished > 90%
            const valid = stats.filter(s => {
                const trackDuration = s.track.duration || 1;
                const progressPct = (s.resumeProgress || 0) / trackDuration;
                return progressPct < 0.9;
            });

            const items = valid.map(s => {
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
    // ROW: Featured Now (Editorial Picks)
    // ========================================================
    private async getFeaturedRow() {
        const cached = await getCached('featured_row');
        if (cached) return cached;

        try {
            const tracks = await prisma.track.findMany({
                where: {
                    isFeatured: true,
                    deletedAt: null,
                    releaseStatus: 'PUBLISHED',
                    isUnlisted: false
                },
                select: SLIM_SELECT,
                orderBy: [
                    { engagement_score: 'desc' },
                    { streams: 'desc' }
                ],
                take: 12,
            });

            // Fallback if no featured tracks are configured
            if (tracks.length === 0) {
                const fallback = await prisma.track.findMany({
                    where: { deletedAt: null, releaseStatus: 'PUBLISHED', isUnlisted: false },
                    select: SLIM_SELECT,
                    orderBy: { engagement_score: 'desc' },
                    take: 10,
                });
                const result = fallback.map(formatTrack);
                await setCache('featured_row', result, 10 * 60 * 1000);
                return result;
            }

            const result = tracks.map(formatTrack);
            await setCache('featured_row', result, 1 * 60 * 1000); // 1 min cache
            return result;
        } catch (err) {
            console.error('Featured row failed:', err);
            return [];
        }
    }

    // ========================================================
    // ROW 1: Personalized For User
    // ========================================================
    private async getPersonalizedRow(userId: string) {
        try {
            // 1. Get user's listening history with genre/artist stats
            const userStats = await prisma.userTrackStat.findMany({
                where: { userId },
                orderBy: { streamCount: 'desc' },
                take: 50,
                include: {
                    track: {
                        select: { genre: true, artistId: true, id: true }
                    }
                }
            });

            if (userStats.length === 0) return this.getFallbackPopular();

            // 2. Identify top 3 genres
            const genreCounts: Record<string, number> = {};
            const artistCounts: Record<string, number> = {};
            const playedTrackIds = new Set<string>();

            for (const stat of userStats) {
                const genre = stat.track.genre || 'unknown';
                const artistId = stat.track.artistId;
                genreCounts[genre] = (genreCounts[genre] || 0) + stat.streamCount;
                artistCounts[artistId] = (artistCounts[artistId] || 0) + stat.streamCount;
                if (stat.streamCount > 5) playedTrackIds.add(stat.track.id); // Exclude heavily played
            }

            const topGenres = Object.entries(genreCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([genre]) => genre);

            const topArtistIds = Object.entries(artistCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([id]) => id);

            // 3. Fetch candidate tracks matching genre or artist, excluding heavily played
            const candidates = await prisma.track.findMany({
                where: {
                    deletedAt: null,
                    releaseStatus: 'PUBLISHED',
                    isUnlisted: false,
                    id: { notIn: Array.from(playedTrackIds) },
                    OR: [
                        { genre: { in: topGenres } },
                        { artistId: { in: topArtistIds } },
                    ]
                },
                select: SLIM_SELECT,
                take: 40,
            });

            // 4. Score each candidate
            const now = Date.now();
            const scored = candidates.map(track => {
                const genreMatch = topGenres.includes(track.genre || '') ? 1 : 0;
                const artistMatch = topArtistIds.includes((track as any).artistId) ? 1 : 0;
                const engagement = track.engagement_score || 0;
                const ageMs = now - new Date(track.createdAt).getTime();
                const freshnessScore = Math.max(0, 1 - ageMs / (90 * 24 * 60 * 60 * 1000)); // decay over 90 days

                const personalScore =
                    genreMatch * 0.4 +
                    artistMatch * 0.3 +
                    Math.min(engagement / 100, 1) * 0.2 +
                    freshnessScore * 0.1;

                return { track, score: personalScore };
            });

            scored.sort((a, b) => b.score - a.score);
            return scored.slice(0, 10).map(s => formatTrack(s.track));
        } catch (err) {
            console.error('Personalized row failed:', err);
            return this.getFallbackPopular();
        }
    }

    // Most Played Row (Global Top 20)
    private async getMostPlayedRow() {
        const cached = await getCached('most_played_row');
        if (cached) return cached;

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
        const cached = await getCached('trending_row');
        if (cached) return cached;

        try {
            const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

            // Get play counts in last 48 hours from history
            const recentPlays = await prisma.history.groupBy({
                by: ['trackId'],
                where: { playedAt: { gte: twoDaysAgo } },
                _count: { trackId: true },
                orderBy: { _count: { trackId: 'desc' } },
                take: 30,
            });

            if (recentPlays.length === 0) {
                // Fallback: use tracks marked as isTrending OR with highest engagement scores
                // This is better than just 'plays desc' which is already used in Most Played
                const tracks = await prisma.track.findMany({
                    where: { 
                        deletedAt: null, 
                        OR: [
                            { releaseStatus: 'PUBLISHED' },
                            { releaseStatus: 'SCHEDULED', scheduledAt: { lte: new Date() } }
                        ],
                        isUnlisted: false 
                    },
                    select: SLIM_SELECT,
                    orderBy: [
                        { isTrending: 'desc' },
                        { engagement_score: 'desc' },
                        { streams: 'desc' }
                    ],
                    take: 12,
                });
                // Randomize slightly to keep it fresh
                const shuffled = tracks.sort(() => 0.5 - Math.random()).slice(0, 10);
                const result = shuffled.map(formatTrack);
                await setCache('trending_row', result, 10 * 60 * 1000);
                return result;
            }

            const trackIds = recentPlays.map(r => r.trackId);
            const playCountMap = new Map(recentPlays.map(r => [r.trackId, r._count.trackId]));

            // Get play counts from 7 days ago for growth rate calculation
            const weekPlays = await prisma.history.groupBy({
                by: ['trackId'],
                where: {
                    trackId: { in: trackIds },
                    playedAt: { gte: sevenDaysAgo, lt: twoDaysAgo }
                },
                _count: { trackId: true },
            });
            const weekPlayMap = new Map(weekPlays.map(r => [r.trackId, r._count.trackId]));

            // Fetch track details
            const tracks = await prisma.track.findMany({
                where: { 
                    id: { in: trackIds }, 
                    deletedAt: null, 
                    OR: [
                        { releaseStatus: 'PUBLISHED' },
                        { releaseStatus: 'SCHEDULED', scheduledAt: { lte: new Date() } }
                    ],
                    isUnlisted: false 
                },
                select: SLIM_SELECT,
            });

            // Score purely based on recent plays (last 48 hours) descending
            const scored = tracks.map(track => {
                const recent = playCountMap.get(track.id) || 0;
                return { track, score: recent };
            });

            scored.sort((a, b) => b.score - a.score);
            const result = scored.slice(0, 10).map(s => formatTrack(s.track));
            await setCache('trending_row', result, 1 * 60 * 1000); // 1 min cache
            return result;
        } catch (err) {
            console.error('Trending row failed:', err);
            return [];
        }
    }

    // ========================================================
    // ROW 3: New & Quality Releases
    // ========================================================
    private async getNewReleasesRow() {
        const cached = await getCached('new_releases_row');
        if (cached) return cached;

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

            const result = tracks.map(formatTrack);
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

                await prisma.track.update({
                    where: { id: track.id },
                    data: { engagement_score: Math.round(score * 100) / 100 }
                });
                updated++;
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
        if (cached) return cached;

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
                coverUrl: '/moods/tamil-folk.png',
                aura_color: '#F43F5E',
                href: '/explore/genre/tamil-folk'
            },
            {
                id: 'hip-hop',
                title: 'Hip-Hop',
                coverUrl: '/moods/hip-hop.png',
                aura_color: '#8B5CF6',
                href: '/explore/genre/hip-hop'
            },
            {
                id: 'melody',
                title: 'Melody',
                coverUrl: '/moods/melody.png',
                aura_color: '#3B82F6',
                href: '/explore/genre/melody'
            },
            {
                id: 'mass',
                title: 'Mass',
                coverUrl: '/moods/mass.png',
                aura_color: '#F59E0B',
                href: '/explore/genre/mass'
            },
            {
                id: 'chill',
                title: 'Chill',
                coverUrl: '/moods/chill.png',
                aura_color: '#10B981',
                href: '/explore/genre/chill'
            },
            {
                id: 'phonk',
                title: 'Phonk',
                coverUrl: '/moods/phonk.png',
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
    // ROW: Top Artists
    // ========================================================
    private async getTopArtistsRow() {
        const cacheKey = 'hp:top_artists';
        const cached = await getCached(cacheKey);
        if (cached) return cached;

        const artists = await prisma.artist.findMany({
            orderBy: { totalStreams: 'desc' },
            take: 10,
            where: {
                imageUrl: { not: null },
            },
            select: { id: true, name: true, imageUrl: true }
        });

        // Map them to look similar to tracks for generic components to parse if needed, but explicitly they are artists
        const formatted = artists.map(a => ({
            id: a.id,
            title: a.name,
            artist: { name: 'Artist' },
            coverUrl: a.imageUrl,
            isArtist: true,
            href: `/artist/${a.id}`
        }));

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

        const formatted = albums.map(a => {
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

        await setCache(cacheKey, formatted, 1000 * 60 * 15);
        return formatted;
    }
}
