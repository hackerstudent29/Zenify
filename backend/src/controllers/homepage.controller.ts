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

    // Manual trigger for engagement score recalculation (admin only)
    refreshEngagement = async (_req: FastifyRequest, reply: FastifyReply) => {
        HomepageService.updateEngagementScores();
        return reply.send({ message: 'Engagement score refresh triggered.' });
    }
}
