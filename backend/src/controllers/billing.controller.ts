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
            const orderData = await BillingService.initiatePayment(
                user.id,
                amount,
                type,
                { ...metadata, ...(trackId ? { trackId } : {}) }
            );

            // Return order details (id, amount, currency) for frontend modal
            return reply.send(orderData);
        } catch (error: any) {
            return reply.status(500).send({ error: error.message });
        }
    },

    async verifyPayment(request: FastifyRequest, reply: FastifyReply) {
        const bodySchema = z.object({
            orderId: z.string(),
            paymentId: z.string(),
            signature: z.string()
        });

        const { orderId, paymentId, signature } = bodySchema.parse(request.body);

        try {
            const isValid = await BillingService.verifySignature(orderId, paymentId, signature);
            if (!isValid) {
                return reply.status(400).send({ error: 'Invalid signature' });
            }
            return reply.send({ status: 'SUCCESS' });
        } catch (error: any) {
            return reply.status(500).send({ error: error.message });
        }
    },

    async handleWebhook(request: FastifyRequest, reply: FastifyReply) {
        const signature = request.headers['x-zenwallet-signature'] as string;

        try {
            const payload = request.body as any;
            const isValid = await BillingService.verifyWebhook(payload, signature);

            if (!isValid) {
                return reply.status(400).send({ error: 'Invalid webhook signature' });
            }

            // Process based on event type
            if (payload.event === 'order.paid') {
                const { order_id, payment_id } = payload.payload.order.entity;
                // Signature is already verified via verifyWebhook for the whole payload,
                // so we can directly fulfill.
                const transaction = await (prisma as any).transaction.findUnique({
                    where: { referenceId: order_id }
                });

                if (transaction && transaction.status !== 'COMPLETED') {
                    // Update and fulfill
                    await (BillingService as any).verifySignature(order_id, payment_id, 'WEBHOOK_VERIFIED');
                }
            }

            return reply.send({ status: 'ACCEPTED' });
        } catch (error: any) {
            console.error('Webhook Error:', error.message);
            return reply.status(500).send({ error: error.message });
        }
    }
};
