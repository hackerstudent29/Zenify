import { FastifyInstance } from 'fastify';
import { HomepageController } from '../controllers/homepage.controller';

export async function homepageRoutes(server: FastifyInstance) {
    const controller = new HomepageController();

    // Main homepage endpoint (monolithic)
    server.get('/', { preHandler: [server.optionalAuthenticate] }, controller.getHomepage);

    // Dedicated real-time sections (Parallel fetchable & cached)
    server.get('/made-for-you', { preHandler: [server.optionalAuthenticate] }, controller.getMadeForYou);
    server.get('/top-country', { preHandler: [server.optionalAuthenticate] }, controller.getTopCountry);
    server.get('/new-releases-lang', { preHandler: [server.optionalAuthenticate] }, controller.getNewReleasesInLanguages);
    server.get('/trending-now', controller.getTrendingNow);
    server.get('/because-you-like', { preHandler: [server.optionalAuthenticate] }, controller.getBecauseYouLike);
    server.get('/popular-artists-lang', { preHandler: [server.optionalAuthenticate] }, controller.getPopularArtistsInLanguages);
    server.get('/genre-playlists', { preHandler: [server.optionalAuthenticate] }, controller.getTopGenrePlaylists);
    server.get('/recently-played', { preHandler: [server.optionalAuthenticate] }, controller.getRecentlyPlayed);

    // Legacy section endpoints
    server.get('/featured', controller.getFeatured);
    server.get('/continue-listening', { preHandler: [server.optionalAuthenticate] }, controller.getContinueListening);
    server.get('/new-arrivals', controller.getNewArrivals);
    server.get('/new', controller.getNewArrivals);
    server.get('/trending', controller.getTrending);
    server.get('/moods', controller.getMoods);
    server.get('/recommendations', { preHandler: [server.optionalAuthenticate] }, controller.getRecommendations);
    server.get('/personalized', { preHandler: [server.optionalAuthenticate] }, controller.getRecommendations);
    server.get('/top-artists', controller.getTopArtists);
    server.get('/top-albums', controller.getTopAlbums);

    // Admin: manually trigger engagement score refresh
    server.post('/refresh-engagement', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, controller.refreshEngagement);
}
