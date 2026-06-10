import { FastifyReply, FastifyRequest } from 'fastify';
import { HomepageService } from '../services/homepage.service';

export class HomepageController {
    private homepageService = new HomepageService();

    getHomepage = async (req: FastifyRequest<{ Querystring: { currentTrackId?: string } }>, reply: FastifyReply) => {
        const userId = req.user?.id;
        const currentTrackId = req.query.currentTrackId;

        const result = await this.homepageService.getHomepage(userId, currentTrackId);
        return reply.send(result);
    }

    getFeatured = async (_req: FastifyRequest, reply: FastifyReply) => {
        const result = await this.homepageService.getFeaturedSection();
        return reply.send(result);
    }

    getContinueListening = async (req: FastifyRequest, reply: FastifyReply) => {
        const userId = req.user?.id;
        const result = await this.homepageService.getContinueListeningSection(userId);
        return reply.send(result);
    }

    getRecentlyPlayed = async (req: FastifyRequest, reply: FastifyReply) => {
        const userId = req.user?.id;
        const result = await this.homepageService.getRecentlyPlayedSection(userId);
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

    // Manual trigger for engagement score recalculation (admin only)
    refreshEngagement = async (_req: FastifyRequest, reply: FastifyReply) => {
        HomepageService.updateEngagementScores();
        return reply.send({ message: 'Engagement score refresh triggered.' });
    }
}
