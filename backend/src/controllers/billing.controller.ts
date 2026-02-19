import { FastifyRequest, FastifyReply } from 'fastify';
import { BillingService } from '../services/billing.service';
import { z } from 'zod';

export const billingController = {
    async createCheckoutSession(request: FastifyRequest, reply: FastifyReply) {
        const user = (request as any).user;
        const bodySchema = z.object({
            type: z.enum(['SUBSCRIPTION', 'TRACK_PURCHASE']),
            trackId: z.string().optional(),
            amount: z.number().int().positive(),
            metadata: z.any().optional()
        });

        const { type, trackId, amount, metadata } = bodySchema.parse(request.body);

        try {
            const paymentUrl = await BillingService.initiatePayment(
                user.id,
                amount,
                type,
                { ...metadata, ...(trackId ? { trackId } : {}) }
            );

            return reply.send({ paymentUrl });
        } catch (error: any) {
            return reply.status(500).send({ error: error.message });
        }
    },

    async verifyPayment(request: FastifyRequest, reply: FastifyReply) {
        const querySchema = z.object({
            referenceId: z.string()
        });

        const { referenceId } = querySchema.parse(request.query);

        try {
            const status = await BillingService.verifyTransaction(referenceId);
            return reply.send({ status });
        } catch (error: any) {
            return reply.status(500).send({ error: error.message });
        }
    }
};
