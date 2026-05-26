import { FastifyRequest, FastifyReply } from 'fastify';
import { NotificationService, notificationEmitter } from '../services/notification.service';

export const NotificationController = {
    async getNotifications(req: FastifyRequest, reply: FastifyReply) {
        const userId = req.user.id;
        const notifications = await NotificationService.getNotifications(userId);
        return reply.send(notifications);
    },

    async markAsRead(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
        const userId = req.user.id;
        const { id } = req.params;
        const notif = await NotificationService.markAsRead(id, userId);
        return reply.send(notif);
    },

    async markAllAsRead(req: FastifyRequest, reply: FastifyReply) {
        const userId = req.user.id;
        await NotificationService.markAllAsRead(userId);
        return reply.send({ success: true });
    },

    async streamNotifications(req: FastifyRequest, reply: FastifyReply) {
        const userId = req.user.id;

        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');
        // allow CORS specifically for SSE just in case
        reply.raw.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
        reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
        reply.raw.flushHeaders();

        // Send initial connection success message
        reply.raw.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

        const onNotification = (data: any) => {
            reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        notificationEmitter.on(`notification:${userId}`, onNotification);

        req.raw.on('close', () => {
            notificationEmitter.off(`notification:${userId}`, onNotification);
        });
    }
};
