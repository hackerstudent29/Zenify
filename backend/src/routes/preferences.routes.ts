import { FastifyInstance } from 'fastify';
import { PreferencesController } from '../controllers/preferences.controller';

export async function preferencesRoutes(server: FastifyInstance) {
  const controller = new PreferencesController();

  // 1. User's own preferences (handles both / and empty path with ignoreTrailingSlash: true)
  server.get('/', {
    preHandler: [server.authenticate],
    handler: controller.getPreferences.bind(controller)
  });

  server.put('/', {
    preHandler: [server.authenticate],
    handler: controller.updatePreferences.bind(controller)
  });

  server.post('/', {
    preHandler: [server.authenticate],
    handler: controller.updatePreferences.bind(controller)
  });

  // 2. Metadata (languages with native names, ISO 3166 countries, genres)
  server.get('/metadata', {
    handler: controller.getMetadata.bind(controller)
  });

  // 3. Artist search (authenticated & rate-limited)
  server.get('/artists/search', {
    preHandler: [server.authenticate],
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute'
      }
    },
    handler: controller.searchArtists.bind(controller)
  });

  // 4. Suggested artists (authenticated & rate-limited)
  server.get('/artists/suggested', {
    preHandler: [server.authenticate],
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute'
      }
    },
    handler: controller.getSuggestedArtists.bind(controller)
  });
}
