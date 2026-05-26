
import { ExternalMetadataService } from './src/services/external-metadata.service';
import * as dotenv from 'dotenv';
dotenv.config();

async function test() {
    const title = "Maari Thara Local";
    const artist = "Dhanush";
    console.log(`Testing smart fetch for: ${artist} - ${title}`);
    try {
        const result = await ExternalMetadataService.fetchAudio(title, artist, 240); // 4 mins approx
        console.log('RESULT:', JSON.stringify(result, null, 2));
    } catch (e) {
        console.error('FETCH FAILED:', e);
    }
}

test();
