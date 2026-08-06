import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import prisma from '../lib/prisma.js';

export class SettingsController {
    constructor(private server: FastifyInstance) {}

    getSettings = async (req: FastifyRequest, reply: FastifyReply) => {
        try {
            const settings = await prisma.systemSettings.findUnique({
                where: { id: 'global' }
            });
            return reply.send(settings?.keys || {});
        } catch (error) {
            console.error('[Settings] Error fetching settings:', error);
            return reply.status(500).send({ error: 'Failed to fetch settings' });
        }
    }

    updateSettings = async (req: FastifyRequest<{ Body: Record<string, any> }>, reply: FastifyReply) => {
        try {
            const newKeys = req.body;
            const settings = await prisma.systemSettings.upsert({
                where: { id: 'global' },
                update: { keys: newKeys },
                create: { id: 'global', keys: newKeys }
            });
            return reply.send(settings.keys);
        } catch (error) {
            console.error('[Settings] Error updating settings:', error);
            return reply.status(500).send({ error: 'Failed to update settings' });
        }
    }
}
