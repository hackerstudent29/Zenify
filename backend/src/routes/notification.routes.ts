import { FastifyInstance } from 'fastify';
import { NotificationController } from '../controllers/notification.controller';

export async function notificationRoutes(server: FastifyInstance) {
    server.register(async (protectedRoutes) => {
        protectedRoutes.addHook('preHandler', server.authenticate);

        protectedRoutes.get('/', NotificationController.getNotifications);
        protectedRoutes.patch('/:id/read', NotificationController.markAsRead);
        protectedRoutes.patch('/read-all', NotificationController.markAllAsRead);
        protectedRoutes.get('/stream', NotificationController.streamNotifications);
        protectedRoutes.post('/broadcast', NotificationController.broadcast);
    });
}
