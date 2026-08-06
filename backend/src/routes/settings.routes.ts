import { FastifyInstance } from 'fastify';
import { SettingsController } from '../controllers/settings.controller.js';

export async function settingsRoutes(server: FastifyInstance) {
    const settingsController = new SettingsController(server);

    server.get('/', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, settingsController.getSettings);

    server.put('/', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, settingsController.updateSettings);
}
