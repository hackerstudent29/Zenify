import axios from 'axios';
import { config } from './src/config/env';
import fs from 'fs';

async function test() {
    try {
        const referenceId = `ZEN_TEST_${Date.now()}`;
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
        fs.writeFileSync('response.json', JSON.stringify(response.data, null, 2));
        console.log("DONE");
    } catch (e: any) {
        console.error("FAIL", e.message);
    }
}
test();
