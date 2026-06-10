import { FastifyInstance } from 'fastify';
import { HomepageController } from '../controllers/homepage.controller';

export async function homepageRoutes(server: FastifyInstance) {
    const controller = new HomepageController();

    // Main homepage endpoint (legacy monolithic)
    server.get('/', controller.getHomepage);

    // Dedicated real-time endpoints
    server.get('/featured', controller.getFeatured);
    server.get('/continue-listening', controller.getContinueListening);
    server.get('/recently-played', controller.getRecentlyPlayed);
    server.get('/new-arrivals', controller.getNewArrivals);
    server.get('/trending', controller.getTrending);
    server.get('/moods', controller.getMoods);
    server.get('/recommendations', controller.getRecommendations);
    server.get('/top-artists', controller.getTopArtists);
    server.get('/top-albums', controller.getTopAlbums);

    // Admin: manually trigger engagement score refresh
    server.post('/refresh-engagement', controller.refreshEngagement);
}
