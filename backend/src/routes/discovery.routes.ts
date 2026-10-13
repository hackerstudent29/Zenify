import { FastifyInstance } from 'fastify';
import { DiscoveryController } from '../controllers/discovery.controller';

export async function discoveryRoutes(server: FastifyInstance) {
  const controller = new DiscoveryController();

  // Strict country and language discovery (public or authenticated)
  server.get('/tracks', controller.discoverTracks.bind(controller));

  // Homepage country and language discovery shelves
  server.get('/sections', controller.getDiscoverSections.bind(controller));

  // Reference metadata & current user's country & language preferences
  server.get('/preferences', controller.getPreferences.bind(controller));

  // Save preferred country & language (authenticated)
  server.put('/preferences', {
    preHandler: [server.authenticate]
  }, controller.updatePreferences.bind(controller));
}
