import { FastifyReply, FastifyRequest } from 'fastify';
import { HomepageService } from '../services/homepage.service';
import { HomeSectionsService } from '../services/home-sections.service';

export class HomepageController {
    private homepageService = new HomepageService();

    getHomepage = async (req: FastifyRequest<{ Querystring: { currentTrackId?: string } }>, reply: FastifyReply) => {
        const userId = req.user?.id;
        const currentTrackId = req.query.currentTrackId;

        const result = await this.homepageService.getHomepage(userId, currentTrackId);
        return reply.send(result);
    }

    // ── Dedicated Real-Time Section Handlers ──

    getMadeForYou = async (req: FastifyRequest, reply: FastifyReply) => {
        const userId = req.user?.id;
        if (userId) reply.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        const result = await HomeSectionsService.getMadeForYou(userId);
        return reply.send(result);
    }

    getTopCountry = async (req: FastifyRequest<{ Querystring: { country?: string } }>, reply: FastifyReply) => {
        const userId = req.user?.id;
        const requestedCountry = req.query.country;
        if (userId) reply.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        const result = await HomeSectionsService.getTopSongsInCountry(userId, requestedCountry);
        return reply.send(result);
    }

    getNewReleasesInLanguages = async (req: FastifyRequest, reply: FastifyReply) => {
        const userId = req.user?.id;
        if (userId) reply.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        const result = await HomeSectionsService.getNewReleasesInLanguages(userId);
        return reply.send(result);
    }

    getTrendingNow = async (_req: FastifyRequest, reply: FastifyReply) => {
        const result = await HomeSectionsService.getTrendingNow();
        return reply.send(result);
    }

    getBecauseYouLike = async (req: FastifyRequest, reply: FastifyReply) => {
        const userId = req.user?.id;
        if (!userId) {
            return reply.send({ title: '', subtitle: '', type: 'because_you_like', items: [] });
        }
        reply.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        const result = await HomeSectionsService.getBecauseYouLike(userId);
        return reply.send(result);
    }

    getPopularArtistsInLanguages = async (req: FastifyRequest, reply: FastifyReply) => {
        const userId = req.user?.id;
        if (userId) reply.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        const result = await HomeSectionsService.getPopularArtistsInLanguages(userId);
        return reply.send(result);
    }

    getTopGenrePlaylists = async (req: FastifyRequest, reply: FastifyReply) => {
        const userId = req.user?.id;
        if (userId) reply.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        const result = await HomeSectionsService.getTopGenrePlaylists(userId);
        return reply.send(result);
    }

    getRecentlyPlayed = async (req: FastifyRequest, reply: FastifyReply) => {
        const userId = req.user?.id;
        if (!userId) {
            return reply.send({ title: '', subtitle: '', type: 'recently_played', items: [] });
        }
        reply.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        const result = await HomeSectionsService.getRecentlyPlayed(userId);
        return reply.send(result);
    }

    // Legacy and standard endpoints
    getFeatured = async (_req: FastifyRequest, reply: FastifyReply) => {
        const result = await this.homepageService.getFeaturedSection();
        return reply.send(result);
    }

    getContinueListening = async (req: FastifyRequest, reply: FastifyReply) => {
        const userId = req.user?.id;
        const result = await this.homepageService.getContinueListeningSection(userId);
        return reply.send(result);
    }

    getNewArrivals = async (_req: FastifyRequest, reply: FastifyReply) => {
        const result = await this.homepageService.getNewArrivalsSection();
        return reply.send(result);
    }

    getTrending = async (_req: FastifyRequest, reply: FastifyReply) => {
        const result = await this.homepageService.getTrendingSection();
        return reply.send(result);
    }

    getMoods = async (_req: FastifyRequest, reply: FastifyReply) => {
        const result = await this.homepageService.getMoodsSection();
        return reply.send(result);
    }

    getRecommendations = async (req: FastifyRequest, reply: FastifyReply) => {
        const userId = req.user?.id;
        const result = await this.homepageService.getRecommendationsSection(userId);
        return reply.send(result);
    }

    getTopArtists = async (_req: FastifyRequest, reply: FastifyReply) => {
        const result = await this.homepageService.getTopArtistsSection();
        return reply.send(result);
    }

    getTopAlbums = async (_req: FastifyRequest, reply: FastifyReply) => {
        const result = await this.homepageService.getTopAlbumsSection();
        return reply.send(result);
    }

    refreshEngagement = async (_req: FastifyRequest, reply: FastifyReply) => {
        HomepageService.updateEngagementScores();
        return reply.send({ message: 'Engagement score refresh triggered.' });
    }
}
