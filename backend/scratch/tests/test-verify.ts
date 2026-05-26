import axios from 'axios';
import { config } from './src/config/env';
import fs from 'fs';

async function test() {
    try {
        // Use the reference ID from the previous successful test if possible,
        // but verify-reference usually checks if it exists.
        const referenceId = "ZEN_TEST_1771520345291";
        const response = await axios.get(`${config.ZENWALLET_BASE_URL}/external/verify-reference`, {
            params: {
                merchantId: config.ZENWALLET_MERCHANT_ID,
                referenceId
            },
            headers: {
                'x-api-key': config.ZENWALLET_API_KEY
            }
        });
        fs.writeFileSync('verify-response.json', JSON.stringify(response.data, null, 2));
        console.log("DONE");
    } catch (e: any) {
        console.error("FAIL", e.response?.data || e.message);
    }
}
test();
