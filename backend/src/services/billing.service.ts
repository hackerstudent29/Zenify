import axios from 'axios';
import { config } from '../config/env';
import { prisma } from '../utils/prisma';

export class BillingService {
    private static apiKey = config.ZENWALLET_API_KEY;
    private static merchantId = config.ZENWALLET_MERCHANT_ID;
    private static baseUrl = config.ZENWALLET_BASE_URL;

    static async initiatePayment(userId: string, amount: number, type: 'SUBSCRIPTION' | 'TRACK_PURCHASE', metadata?: any) {
        const referenceId = `ZEN_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        try {
            const response = await axios.post(`${this.baseUrl}/external/create-request`, {
                amount,
                merchantId: this.merchantId,
                referenceId,
                callbackUrl: `${config.FRONTEND_URL}/payment/callback`
            }, {
                headers: {
                    'x-api-key': this.apiKey
                }
            });

            console.log('ZenWallet API Request:', { amount, referenceId });
            console.log('ZenWallet API Response:', JSON.stringify(response.data, null, 2));

            // Safer extraction: check for token or paymentUrl
            const receivedData = response.data.data;
            const token = receivedData?.token || receivedData?.paymentUrl?.split('token=')[1];

            if (!response.data.success || !token) {
                console.error('ZenWallet connection error - Data received:', response.data);
                throw new Error(response.data.message || 'Invalid response from ZenWallet - No token received');
            }

            // Create pending transaction in DB
            await (prisma as any).transaction.create({
                data: {
                    userId,
                    amount,
                    status: 'PENDING',
                    referenceId,
                    type,
                    metadata: metadata || {}
                }
            });

            // Always use the production-ready checkout URL as requested by the user
            return `https://payment-via-zenwallet.vercel.app/checkout?token=${token}`;
        } catch (error: any) {
            const errorData = error.response?.data || error.message;
            console.error('ZenWallet Payment Initiation Failed:', {
                status: error.response?.status,
                data: errorData
            });
            throw new Error(`Failed to initiate payment: ${JSON.stringify(errorData)}`);
        }
    }

    static async verifyTransaction(referenceId: string) {
        try {
            const response = await axios.get(`${this.baseUrl}/external/verify-reference`, {
                params: {
                    merchantId: this.merchantId,
                    referenceId
                },
                headers: {
                    'x-api-key': this.apiKey
                }
            });

            console.log('ZenWallet Verification Response:', response.data);

            // Handle different possible response formats
            const isCaptured = response.data.status === 'SUCCESS' || response.data.received === true;
            const status = isCaptured ? 'SUCCESS' : 'FAILED';

            const transaction = await (prisma as any).transaction.findUnique({
                where: { referenceId }
            });

            if (!transaction) {
                throw new Error('Transaction not found');
            }

            // Map ZenWallet status to our DB status
            const dbStatus = status === 'SUCCESS' ? 'COMPLETED' : 'FAILED';

            await (prisma as any).transaction.update({
                where: { referenceId },
                data: { status: dbStatus }
            });

            if (status === 'SUCCESS') {
                if (transaction.type === 'SUBSCRIPTION') {
                    await (prisma as any).subscription.upsert({
                        where: { userId: transaction.userId },
                        update: {
                            status: 'ACTIVE',
                            referenceId,
                            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days extension
                        },
                        create: {
                            userId: transaction.userId,
                            status: 'ACTIVE',
                            referenceId,
                            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
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
                                referenceId,
                                status: 'COMPLETED'
                            },
                            create: {
                                userId: transaction.userId,
                                trackId,
                                price: transaction.amount,
                                referenceId,
                                status: 'COMPLETED'
                            }
                        });
                    }
                }
            }

            return status;
        } catch (error: any) {
            console.error('ZenWallet Verification Failed:', error.response?.data || error.message);
            throw new Error('Failed to verify payment');
        }
    }
}
