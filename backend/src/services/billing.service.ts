import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config/env';
import { prisma } from '../utils/prisma';
import { MailService } from './mail.service';

export class BillingService {
    private static apiKey = config.ZENWALLET_API_KEY;
    private static baseUrl = config.ZENWALLET_BASE_URL;

    static async initiatePayment(userId: string, amount: number, type: 'SUBSCRIPTION' | 'TRACK_PURCHASE', metadata?: any) {
        // ZenPay /orders API expects amount in the smallest currency unit (PAISE)
        // Previous assumption of rupees caused ₹0.00 to show up in the modal
        const receipt = `ZENIFY_${Date.now()}`;
        const authToken = config.ZENWALLET_MERCHANT_JWT || this.apiKey;

        try {
            console.log(`[Billing] Creating ZenPay order: Amount=${amount} paise, User=${userId}`);

            // 1. Create Order via ZenPay API (Step B)
            const response = await axios.post(`${this.baseUrl}/orders`, {
                amount: Math.floor(amount), // Ensure integer paise
                currency: 'INR',
                receipt,
                description: metadata?.plan ? `Zenify ${metadata.plan} Subscription` : 'Zenify Subscription',
                notes: {
                    plan: metadata?.plan || 'Standard',
                    userId: userId,
                    type: type
                }
            }, {
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json',
                    'Idempotency-Key': receipt
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
            // 1. Mandatory HMAC Signature Verification (Step 2 Security)
            // This ensures the payment response hasn't been tampered with.
            if (!orderId.startsWith('mock_order_')) {
                const expectedSig = crypto.createHmac('sha256', this.apiKey)
                    .update(`${orderId}|${paymentId}`).digest('hex');

                if (signature !== 'WEBHOOK_VERIFIED' && signature !== expectedSig) {
                    console.error(`[Security Alert] Invalid HMAC Signature for order: ${orderId}. Expected ${expectedSig}, got ${signature}`);
                    return false;
                }
                console.log(`[Security] HMAC Signature verified for order: ${orderId}`);
            }

            // Skip API check for mock orders (dev)
            if (orderId.startsWith('mock_order_')) {
                await this.fulfillFromOrderId(orderId, paymentId);
                return true;
            }

            // 2. Double-Check Status with ZenPay Production API
            const authToken = config.ZENWALLET_MERCHANT_JWT || this.apiKey;
            try {
                const res = await axios.get(`${this.baseUrl}/orders/${orderId}`, {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                const orderData = res.data?.data || res.data;
                const status = orderData?.status;
                if (status !== 'PAID' && status !== 'COMPLETED') {
                    console.error(`ZenPay order ${orderId} status is ${status}, not PAID`);
                    return false;
                }
            } catch (e: any) {
                // If ZenPay API is temporarily unreachable, we rely on the HMAC verified above
                console.warn('[Security] ZenPay API unreachable, relying on valid HMAC signature for fulfillment.');
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
