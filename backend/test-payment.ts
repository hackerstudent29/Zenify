import { BillingService } from './src/services/billing.service';
import { prisma } from './src/utils/prisma';
import axios from 'axios';
import { config } from './src/config/env';

async function test() {
    try {
        const userId = "9446acd0-4349-4fae-b178-24dcad81ac5d";
        const referenceId = `ZEN_TEST_${Date.now()}`;

        console.log("Testing ZenWallet POST...");
        const response = await axios.post(`${config.ZENWALLET_BASE_URL}/external/create-request`, {
            amount: 1000,
            merchantId: config.ZENWALLET_MERCHANT_ID,
            referenceId,
            callbackUrl: `${config.FRONTEND_URL}/payment/callback`
        }, {
            headers: {
                'x-api-key': config.ZENWALLET_API_KEY
            }
        });

        console.log("RESPONSE KEYS:", Object.keys(response.data));
        console.log("RESPONSE BODY:", JSON.stringify(response.data, null, 2));

    } catch (e: any) {
        console.error("TEST FAILED");
        if (e.response) {
            console.error("Response Error Data:", e.response.data);
        } else {
            console.error(e.message);
        }
    } finally {
        await prisma.$disconnect();
    }
}

test();
