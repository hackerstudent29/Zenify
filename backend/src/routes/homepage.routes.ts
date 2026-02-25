import { FastifyInstance } from 'fastify';
import { HomepageController } from '../controllers/homepage.controller';

export async function homepageRoutes(server: FastifyInstance) {
    const controller = new HomepageController();

    // Main homepage endpoint — works for both logged-in and anonymous users
    server.get('/', controller.getHomepage);

    // Admin: manually trigger engagement score refresh
    server.post('/refresh-engagement', controller.refreshEngagement);
}
