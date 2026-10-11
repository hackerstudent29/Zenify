import { FastifyRequest, FastifyReply } from 'fastify';
import { BillingService } from '../services/billing.service';
import { prisma } from '../utils/prisma';
import { z } from 'zod';

const PLAN_PRICES_PAISE: Record<string, { monthly: number; annual: number }> = {
    'Premium': { monthly: 9900, annual: 95000 }, // ₹99 / ₹950
    'Cosmic': { monthly: 29900, annual: 288000 }, // ₹299 / ₹2,880
};

export const billingController = {
    async createCheckoutSession(request: FastifyRequest, reply: FastifyReply) {
        const user = (request as any).user;
        const bodySchema = z.object({
            type: z.enum(['SUBSCRIPTION', 'TRACK_PURCHASE']),
            trackId: z.string().optional(),
            amount: z.number().int().positive().optional(),
            metadata: z.any().optional()
        });

        const { type, trackId, metadata } = bodySchema.parse(request.body);

        let validatedAmount: number;

        if (type === 'SUBSCRIPTION') {
            const planName = metadata?.plan || 'Premium';
            const isAnnual = metadata?.isAnnual === true;
            const planTier = PLAN_PRICES_PAISE[planName];
            if (!planTier) {
                return reply.status(400).send({ error: `Invalid subscription plan: ${planName}` });
            }
            validatedAmount = isAnnual ? planTier.annual : planTier.monthly;
        } else {
            if (!trackId) {
                return reply.status(400).send({ error: 'trackId is required for TRACK_PURCHASE' });
            }
            const track = await prisma.track.findUnique({ where: { id: trackId } });
            if (!track) {
                return reply.status(404).send({ error: 'Track not found' });
            }
            validatedAmount = Math.round((track.price || 15) * 100);
        }

        try {
            const orderData = await BillingService.initiatePayment(
                user.id,
                validatedAmount,
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
