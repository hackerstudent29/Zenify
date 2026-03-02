import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma';
import { MailService } from '../services/mail.service';
import { config } from '../config/env';
import crypto from 'crypto';

/**
 * Verifies the ZenWallet webhook signature.
 * ZenWallet signs the raw payload body with HMAC-SHA256 using your webhook secret.
 * The signature is passed in the x-zenwallet-signature header.
 */
function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
    try {
        const expected = crypto
            .createHmac('sha256', secret)
            .update(rawBody, 'utf8')
            .digest('hex');
        // Use timingSafeEqual to prevent timing attacks
        const a = Buffer.from(`sha256=${expected}`, 'utf8');
        const b = Buffer.from(signature, 'utf8');
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

async function handlePaymentSuccess(referenceId: string, eventType: string) {
    const transaction = await (prisma as any).transaction.findUnique({
        where: { referenceId },
        include: { user: true }
    });

    if (!transaction) {
        console.warn(`[Webhook] No transaction found for referenceId: ${referenceId}`);
        return;
    }

    // Idempotency: skip if already processed
    if (transaction.status === 'COMPLETED') {
        console.log(`[Webhook] Transaction ${referenceId} already completed, skipping.`);
        return;
    }

    await (prisma as any).transaction.update({
        where: { referenceId },
        data: { status: 'COMPLETED' }
    });

    const isAnnual = (transaction.metadata as any)?.isAnnual === true;
    const duration = isAnnual ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + duration);

    if (transaction.type === 'SUBSCRIPTION') {
        const planName = (transaction.metadata as any)?.plan || 'Premium';
        await (prisma as any).subscription.upsert({
            where: { userId: transaction.userId },
            update: { status: 'ACTIVE', referenceId, plan: planName, expiresAt },
            create: { userId: transaction.userId, status: 'ACTIVE', referenceId, plan: planName, expiresAt }
        });

        const itemName = `Zenify ${planName} ${isAnnual ? '(Annual)' : '(Monthly)'}`;
        try {
            await MailService.sendPurchaseConfirmation(
                transaction.user.email,
                itemName,
                transaction.amount,
                transaction.user.username || transaction.user.name || 'User',
                new Date(),
                expiresAt
            );
        } catch (e) {
            console.error('[Webhook] Failed to send subscription confirmation email:', e);
        }
    } else if (transaction.type === 'TRACK_PURCHASE') {
        const trackId = (transaction.metadata as any)?.trackId;
        if (trackId) {
            await (prisma as any).purchase.upsert({
                where: { userId_trackId: { userId: transaction.userId, trackId } },
                update: { referenceId, status: 'COMPLETED' },
                create: { userId: transaction.userId, trackId, price: transaction.amount, referenceId, status: 'COMPLETED' }
            });
        }
        try {
            await MailService.sendPurchaseConfirmation(
                transaction.user.email,
                'Music Track',
                transaction.amount,
                transaction.user.username || transaction.user.name || 'User',
                new Date(),
                expiresAt
            );
        } catch (e) {
            console.error('[Webhook] Failed to send track purchase email:', e);
        }
    }

    console.log(`[Webhook] ✅ ${eventType} processed for referenceId: ${referenceId}`);
}

async function handlePaymentFailed(referenceId: string) {
    const transaction = await (prisma as any).transaction.findUnique({
        where: { referenceId },
        include: { user: true }
    });

    if (!transaction || transaction.status === 'FAILED') return;

    await (prisma as any).transaction.update({
        where: { referenceId },
        data: { status: 'FAILED' }
    });

    console.log(`[Webhook] ❌ payment.failed for referenceId: ${referenceId}`);
}

async function handleRefund(referenceId: string, refundAmount?: number) {
    const transaction = await (prisma as any).transaction.findUnique({
        where: { referenceId },
        include: { user: true }
    });

    if (!transaction) return;

    await (prisma as any).transaction.update({
        where: { referenceId },
        data: { status: 'REFUNDED' }
    });

    // If it was a subscription refund, deactivate it
    if (transaction.type === 'SUBSCRIPTION') {
        await (prisma as any).subscription.updateMany({
            where: { userId: transaction.userId, referenceId },
            data: { status: 'INACTIVE' }
        });
    }

    console.log(`[Webhook] 🔄 refund.processed for referenceId: ${referenceId}, amount: ${refundAmount}`);
}

export async function webhookRoutes(fastify: FastifyInstance) {
    /**
     * POST /api/webhooks/zenwallet
     *
     * Register THIS URL in your ZenWallet dashboard:
     *   https://listenzenify.vercel.app/api/webhooks/zenwallet
     *   (local dev: http://localhost:3000/api/webhooks/zenwallet)
     *
     * Supported events:
     *   - payment.captured
     *   - payment.failed
     *   - order.paid
     *   - refund.processed
     */
    fastify.post('/zenwallet', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const rawBody = JSON.stringify(request.body); // raw payload string
            const signature = request.headers['x-zenwallet-signature'] as string | undefined;
            const webhookSecret = config.ZENWALLET_WEBHOOK_SECRET;

            if (webhookSecret && signature) {
                const expected = crypto
                    .createHmac('sha256', webhookSecret)
                    .update(rawBody, 'utf8')
                    .digest('hex');

                if (signature !== expected) {
                    fastify.log.warn('[Webhook] Invalid ZenWallet signature');
                    return reply.status(401).send({ error: 'Invalid signature' });
                }
            }

            const body = request.body as any;
            const event = body?.event;
            const data = body?.data || body;

            // Extract referenceId (order_id)
            const referenceId: string = data?.order_id || data?.orderId || data?.referenceId;

            if (!referenceId) {
                return reply.status(200).send({ received: true, warning: 'missing referenceId' });
            }

            switch (event) {
                case 'payment.captured':
                case 'order.paid':
                    await handlePaymentSuccess(referenceId, event);
                    break;
                case 'payment.failed':
                    await handlePaymentFailed(referenceId);
                    break;
                case 'refund.processed':
                    await handleRefund(referenceId, data?.amount);
                    break;
            }

            return reply.status(200).send({ received: true });
        } catch (error: any) {
            fastify.log.error({ err: error }, '[Webhook] Processing failed');
            return reply.status(500).send({ error: 'Internal Server Error' });
        }
    });
}
