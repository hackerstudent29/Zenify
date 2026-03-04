import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config/env';
import { prisma } from '../utils/prisma';
import { MailService } from './mail.service';

export class BillingService {
    private static apiKey = config.ZENWALLET_API_KEY;
    private static baseUrl = config.ZENWALLET_BASE_URL;

    static async initiatePayment(userId: string, amount: number, type: 'SUBSCRIPTION' | 'TRACK_PURCHASE', metadata?: any) {
        // amount arrives in paise from frontend; ZenPay dashboard/orders takes rupees
        const amountRupees = amount / 100;
        const receipt = `ZENIFY_${Date.now()}`;

        // Use merchant JWT first, fall back to API key Bearer auth
        const authToken = config.ZENWALLET_MERCHANT_JWT || this.apiKey;

        try {
            // 1. Create Order via ZenPay Dashboard API
            const response = await axios.post(`${this.baseUrl}/dashboard/orders`, {
                amount: amountRupees,
                currency: 'INR',
                receipt,
                description: metadata?.plan ? `Zenify ${metadata.plan} Subscription` : 'Zenify Subscription'
            }, {
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json',
                }
            });

            // ZenPay returns { status: 'success', data: { id, amountPaise, status } }
            const orderData = response.data?.data || response.data;
            const orderId = orderData?.id;

            if (!orderId) {
                console.error('ZenPay order creation failed - Response:', response.data);
                throw new Error(response.data?.error || 'No orderId returned from ZenPay');
            }

            // 2. Store pending transaction in Zenify DB
            await prisma.transaction.create({
                data: {
                    userId,
                    amount, // store in paise
                    status: 'PENDING',
                    referenceId: orderId,
                    type,
                    metadata: { ...metadata, receipt }
                }
            });

            return { orderId, amount, currency: 'INR' };

        } catch (error: any) {
            const errorData = error.response?.data || error.message;
            console.error('ZenPay Order Creation Failed:', JSON.stringify(errorData));

            if (config.NODE_ENV === 'development') {
                console.warn('⚠️  ZenPay unreachable – using mock order for dev.');
                const mockOrderId = `mock_order_${Date.now()}`;
                await prisma.transaction.create({
                    data: {
                        userId,
                        amount,
                        status: 'PENDING',
                        referenceId: mockOrderId,
                        type,
                        metadata: { ...metadata, receipt, mock: true }
                    }
                });
                return { orderId: mockOrderId, amount, currency: 'INR' };
            }

            throw new Error(`Failed to initiate payment: ${JSON.stringify(errorData)}`);
        }
    }

    /**
     * Verifies payment by checking ZenPay order status via GET /v1/dashboard/orders/:orderId
     * Falls back to local HMAC if ZenPay is unreachable.
     */
    static async verifySignature(orderId: string, paymentId: string, signature: string) {
        try {
            // Skip verification for mock orders (dev)
            if (orderId.startsWith('mock_order_')) {
                await this.fulfillFromOrderId(orderId, paymentId);
                return true;
            }

            // Verify by checking order status on ZenPay
            const authToken = config.ZENWALLET_MERCHANT_JWT || this.apiKey;
            try {
                const res = await axios.get(`${this.baseUrl}/dashboard/orders/${orderId}`, {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                const status = res.data?.data?.status;
                if (status !== 'PAID' && status !== 'COMPLETED') {
                    console.error(`ZenPay order ${orderId} status is ${status}, not PAID`);
                    return false;
                }
            } catch (e: any) {
                // If ZenPay unreachable in dev, fall through to local HMAC check
                if (config.NODE_ENV !== 'development') throw e;
                console.warn('ZenPay unreachable during verify - falling back to HMAC');
                const expectedSig = crypto.createHmac('sha256', this.apiKey)
                    .update(`${orderId}|${paymentId}`).digest('hex');
                if (signature !== 'WEBHOOK_VERIFIED' && signature !== expectedSig) return false;
            }

            // Find and fulfill transaction
            const transaction = await prisma.transaction.findUnique({
                where: { referenceId: orderId },
                include: { user: true }
            });
            if (!transaction) throw new Error('Transaction not found: ' + orderId);
            if (transaction.status === 'COMPLETED') return true;

            await prisma.transaction.update({
                where: { referenceId: orderId },
                data: { status: 'COMPLETED', metadata: { ...(transaction.metadata as any), paymentId } }
            });

            await this.fulfillPurchase(transaction);
            return true;
        } catch (error: any) {
            console.error('ZenPay verify error:', error.message);
            return false;
        }
    }

    private static async fulfillFromOrderId(orderId: string, paymentId: string) {
        const transaction = await prisma.transaction.findUnique({
            where: { referenceId: orderId },
            include: { user: true }
        });
        if (!transaction || transaction.status === 'COMPLETED') return;
        await prisma.transaction.update({
            where: { referenceId: orderId },
            data: { status: 'COMPLETED', metadata: { ...(transaction.metadata as any), paymentId } }
        });
        await this.fulfillPurchase(transaction);
    }

    private static async fulfillPurchase(transaction: any) {
        const isAnnual = (transaction.metadata as any)?.isAnnual === true;
        const duration = isAnnual ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
        const expiresAt = new Date(Date.now() + duration);

        if (transaction.type === 'SUBSCRIPTION') {
            const planName = (transaction.metadata as any)?.plan || 'Premium';
            await prisma.subscription.upsert({
                where: { userId: transaction.userId },
                update: {
                    status: 'ACTIVE',
                    referenceId: transaction.referenceId,
                    plan: planName,
                    expiresAt
                },
                create: {
                    userId: transaction.userId,
                    status: 'ACTIVE',
                    referenceId: transaction.referenceId,
                    plan: planName,
                    expiresAt
                }
            });
        } else if (transaction.type === 'TRACK_PURCHASE') {
            const trackId = (transaction.metadata as any)?.trackId;
            if (trackId) {
                await prisma.purchase.upsert({
                    where: {
                        userId_trackId: {
                            userId: transaction.userId,
                            trackId
                        }
                    },
                    update: {
                        referenceId: transaction.referenceId,
                        status: 'COMPLETED'
                    },
                    create: {
                        userId: transaction.userId,
                        trackId,
                        price: transaction.amount,
                        referenceId: transaction.referenceId,
                        status: 'COMPLETED'
                    }
                });
            }
        }

        // Send confirmation email
        try {
            const itemName = transaction.type === 'SUBSCRIPTION'
                ? `Zenify ${(transaction.metadata as any)?.plan || 'Premium'} ${isAnnual ? '(Annual)' : '(Monthly)'}`
                : 'Music Track';

            await MailService.sendPurchaseConfirmation(
                transaction.user.email,
                itemName,
                transaction.amount,
                transaction.user.username || transaction.user.name || 'User',
                new Date(),
                expiresAt
            );
        } catch (e) {
            console.error('Failed to send purchase email:', e);
        }
    }

    // Deprecated in favor of verifySignature, but keeping for legacy webhook compatibility if needed
    static async verifyTransaction(referenceId: string) {
        // Implementation might vary if they have a verify endpoint too
        return 'FAILED';
    }

    static async checkSubscriptions() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        const expiringSoon = await prisma.subscription.findMany({
            where: {
                status: 'ACTIVE',
                expiresAt: {
                    lte: tomorrow,
                    gt: new Date()
                }
            },
            include: { user: true }
        });

        for (const sub of expiringSoon) {
            try {
                await MailService.sendSubscriptionExpiryReminder(
                    sub.user.email,
                    sub.user.username || sub.user.name || 'User',
                    sub.expiresAt!
                );
            } catch (e) {
                console.error(`Failed to send expiry reminder to ${sub.user.email}:`, e);
            }
        }
    }
    static async verifyWebhook(payload: any, signature: string) {
        if (!config.ZENWALLET_WEBHOOK_SECRET) {
            console.warn('ZENWALLET_WEBHOOK_SECRET not set. Skipping webhook signature verification.');
            return true;
        }

        const expectedSignature = crypto
            .createHmac('sha256', config.ZENWALLET_WEBHOOK_SECRET)
            .update(JSON.stringify(payload))
            .digest('hex');

        return signature === expectedSignature;
    }
}
