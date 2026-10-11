import { FastifyInstance } from 'fastify';
import { HomepageController } from '../controllers/homepage.controller';

export async function homepageRoutes(server: FastifyInstance) {
    const controller = new HomepageController();

    // Main homepage endpoint (monolithic)
    server.get('/', controller.getHomepage);

    // Dedicated real-time sections (Parallel fetchable & cached)
    server.get('/made-for-you', controller.getMadeForYou);
    server.get('/top-country', controller.getTopCountry);
    server.get('/new-releases-lang', controller.getNewReleasesInLanguages);
    server.get('/trending-now', controller.getTrendingNow);
    server.get('/because-you-like', controller.getBecauseYouLike);
    server.get('/popular-artists-lang', controller.getPopularArtistsInLanguages);
    server.get('/genre-playlists', controller.getTopGenrePlaylists);
    server.get('/recently-played', controller.getRecentlyPlayed);

    // Legacy section endpoints
    server.get('/featured', controller.getFeatured);
    server.get('/continue-listening', controller.getContinueListening);
    server.get('/new-arrivals', controller.getNewArrivals);
    server.get('/new', controller.getNewArrivals);
    server.get('/trending', controller.getTrending);
    server.get('/moods', controller.getMoods);
    server.get('/recommendations', controller.getRecommendations);
    server.get('/personalized', controller.getRecommendations);
    server.get('/top-artists', controller.getTopArtists);
    server.get('/top-albums', controller.getTopAlbums);

    // Admin: manually trigger engagement score refresh
    server.post('/refresh-engagement', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, controller.refreshEngagement);
}
