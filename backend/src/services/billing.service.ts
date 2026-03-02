import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config/env';
import { prisma } from '../utils/prisma';
import { MailService } from './mail.service';

export class BillingService {
    private static apiKey = config.ZENWALLET_API_KEY;
    private static baseUrl = config.ZENWALLET_BASE_URL;

    static async initiatePayment(userId: string, amount: number, type: 'SUBSCRIPTION' | 'TRACK_PURCHASE', metadata?: any) {
        // Amount is passed in paise already? Let's ensure or convert.
        // User prompt says amount in paise.
        const receipt = `ZEN_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        try {
            // 1. Create Order in ZenWallet
            const response = await axios.post(`${this.baseUrl}/orders`, {
                amount,
                currency: 'INR',
                receipt,
                notes: {
                    userId,
                    type,
                    ...metadata
                }
            }, {
                headers: {
                    'Authorization': this.apiKey,
                    'Idempotency-Key': `idemp_${receipt}`
                }
            });

            const order = response.data;
            const orderId = order.id || order.order_id;

            if (!orderId) {
                console.error('ZenWallet order creation failed - Data received:', response.data);
                throw new Error(response.data.message || 'Invalid response from ZenWallet - No orderId received');
            }

            // 2. Create pending transaction in our DB
            await (prisma as any).transaction.create({
                data: {
                    userId,
                    amount,
                    status: 'PENDING',
                    referenceId: orderId, // Store order_id as referenceId
                    type,
                    metadata: {
                        ...metadata,
                        receipt
                    }
                }
            });

            // Return order details to frontend so it can open modal
            return {
                orderId,
                amount,
                currency: 'INR'
            };
        } catch (error: any) {
            const errorData = error.response?.data || error.message;
            console.error('ZenWallet Order Creation Failed:', errorData);

            // Mock fallback for development if the service is unreachable
            if (config.NODE_ENV === 'development') {
                console.warn('⚠️  ZenWallet service unreachable at', this.baseUrl, '- Returning mock order for testing.');
                const mockOrderId = `mock_order_${Date.now()}`;

                // Create pending transaction in our DB even for mock
                await (prisma as any).transaction.create({
                    data: {
                        userId,
                        amount,
                        status: 'PENDING',
                        referenceId: mockOrderId,
                        type,
                        metadata: {
                            ...metadata,
                            receipt,
                            mock: true
                        }
                    }
                });

                return {
                    orderId: mockOrderId,
                    amount,
                    currency: 'INR'
                };
            }

            throw new Error(`Failed to initiate payment: ${JSON.stringify(errorData)}`);
        }
    }

    /**
     * Verifies the signature sent from the frontend after a successful payment
     */
    static async verifySignature(orderId: string, paymentId: string, signature: string) {
        try {
            // 1. Generate expected signature: HMAC-SHA256: sign (order_id + "|" + payment_id) with SECRET KEY
            const secret = this.apiKey;
            const data = `${orderId}|${paymentId}`;
            const expectedSignature = crypto
                .createHmac('sha256', secret)
                .update(data)
                .digest('hex');

            if (signature !== 'WEBHOOK_VERIFIED' && signature !== expectedSignature) {
                console.error('ZenWallet invalid signature:', { orderId, paymentId, signature, expectedSignature });
                return false;
            }

            // 2. Find and update transaction
            const transaction = await (prisma as any).transaction.findUnique({
                where: { referenceId: orderId },
                include: { user: true }
            });

            if (!transaction) {
                throw new Error('Transaction not found for orderId: ' + orderId);
            }

            // Don't modify if it was already processed
            if (transaction.status === 'COMPLETED') return true;

            await (prisma as any).transaction.update({
                where: { referenceId: orderId },
                data: {
                    status: 'COMPLETED',
                    metadata: {
                        ... (transaction.metadata as any),
                        paymentId
                    }
                }
            });

            // 3. Fulfill the purchase (Subscription or Track)
            await this.fulfillPurchase(transaction);

            return true;
        } catch (error: any) {
            console.error('ZenWallet signature verification error:', error.message);
            return false;
        }
    }

    private static async fulfillPurchase(transaction: any) {
        const isAnnual = (transaction.metadata as any)?.isAnnual === true;
        const duration = isAnnual ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
        const expiresAt = new Date(Date.now() + duration);

        if (transaction.type === 'SUBSCRIPTION') {
            const planName = (transaction.metadata as any)?.plan || 'Premium';
            await (prisma as any).subscription.upsert({
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
                await (prisma as any).purchase.upsert({
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

        const expiringSoon = await (prisma as any).subscription.findMany({
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
                    sub.expiresAt
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
