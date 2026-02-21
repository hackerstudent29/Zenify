import { FastifyInstance } from 'fastify';
import { AnalyticsController } from '../controllers/analytics.controller';

export async function analyticsRoutes(server: FastifyInstance) {
    const controller = new AnalyticsController(server);

    server.get('/', {
        preHandler: [server.authenticate],
        handler: controller.getStats.bind(controller)
    });
}
