import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';

const prisma = new PrismaClient();

// Global EventEmitter for SSE
export const notificationEmitter = new EventEmitter();

export class NotificationService {
    static async createNotification(userId: string, type: string, title: string, message: string, metadata?: any) {
        const notif = await prisma.notification.create({
            data: { userId, type, title, message, metadata }
        });
        
        // Emit event for SSE
        notificationEmitter.emit(`notification:${userId}`, notif);
        return notif;
    }

    static async getNotifications(userId: string, limit = 50) {
        return prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: limit
        });
    }

    static async markAsRead(id: string, userId: string) {
        return prisma.notification.update({
            where: { id, userId },
            data: { read: true }
        });
    }
    
    static async markAllAsRead(userId: string) {
        return prisma.notification.updateMany({
            where: { userId, read: false },
            data: { read: true }
        });
    }
}
