import { FastifyReply, FastifyRequest } from 'fastify';
import { AnalyticsService } from '../services/analytics.service';

export class AnalyticsController {
    private analyticsService: AnalyticsService;

    constructor(server: any) {
        this.analyticsService = new AnalyticsService(server);
    }

    getStats = async (request: FastifyRequest, reply: FastifyReply) => {
        // @ts-ignore
        const userId = request.user.id;

        try {
            const overview = await this.analyticsService.getOverallMetrics(userId);
            const topTracks = await this.analyticsService.getTopTracks(userId);
            const trends = await this.analyticsService.getActivityTrends(userId);
            const feedback = await this.analyticsService.getRecentFeedback(userId);
            const demographics = await this.analyticsService.getListenerDemographics(userId);

            return reply.send({
                overview,
                topTracks,
                trends,
                feedback,
                demographics
            });
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to fetch analytics data' });
        }
    }

    getLibraryOverview = async (request: FastifyRequest, reply: FastifyReply) => {
        // @ts-ignore
        const userId = request.user.id;

        try {
            const overview = await this.analyticsService.getLibraryOverview(userId);
            return reply.send(overview);
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to fetch library overview' });
        }
    }
}
