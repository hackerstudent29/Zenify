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

        reply.hijack();

        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
        reply.raw.setHeader('Connection', 'keep-alive');
        reply.raw.setHeader('X-Accel-Buffering', 'no');
        // allow CORS specifically for SSE just in case
        reply.raw.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
        reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
        reply.raw.flushHeaders();

        // Send initial connection success message
        try {
            if (reply.raw.writable && !reply.raw.writableEnded) {
                reply.raw.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
            }
        } catch (err) {
            console.error('[SSE] Failed to write initial message:', err);
        }

        const onNotification = (data: any) => {
            try {
                if (reply.raw.writable && !reply.raw.writableEnded) {
                    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
                }
            } catch (err) {
                console.error('[SSE] Failed to write notification:', err);
            }
        };

        notificationEmitter.on(`notification:${userId}`, onNotification);

        // Keep-alive heartbeat interval every 15 seconds
        const heartbeatInterval = setInterval(() => {
            try {
                if (reply.raw.writable && !reply.raw.writableEnded) {
                    reply.raw.write(`:\n\n`);
                } else {
                    clearInterval(heartbeatInterval);
                }
            } catch (err) {
                clearInterval(heartbeatInterval);
            }
        }, 15000);

        req.raw.on('close', () => {
            clearInterval(heartbeatInterval);
            notificationEmitter.off(`notification:${userId}`, onNotification);
        });
    },

    async broadcast(req: FastifyRequest<{ Body: { type: string; title: string; message: string; metadata?: any } }>, reply: FastifyReply) {
        // Admin only check
        if (req.user.role !== 'ADMIN') {
            return reply.status(403).send({ error: "Only admins can broadcast notifications" });
        }

        const { type, title, message, metadata } = req.body;
        
        // Use Prisma to create for all users or broadcast system notification
        const { prisma } = require('../utils/prisma');
        const users = await prisma.user.findMany({ select: { id: true } });
        
        const notifications = users.map((u: any) => ({
            userId: u.id,
            type,
            title,
            message,
            metadata: metadata || {}
        }));

        await prisma.notification.createMany({ data: notifications });
        
        // Emit SSE to all currently connected users
        for (const user of users) {
            notificationEmitter.emit(`notification:${user.id}`, { type, title, message, metadata });
        }
        
        return reply.send({ success: true, count: users.length });
    }
};
