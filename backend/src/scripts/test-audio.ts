import dotenv from 'dotenv';
dotenv.config();
import { ExternalMetadataService } from '../services/external-metadata.service';

async function main() {
    // A standard YouTube video URL
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    console.log(`Testing fetchYoutubeAudioViaPublicAPI for URL: ${url}`);
    try {
        const streamUrl = await ExternalMetadataService.fetchYoutubeAudioViaPublicAPI(url);
        console.log(`SUCCESS! Stream URL obtained:`, streamUrl);
    } catch (err: any) {
        console.error(`FAILED with error:`, err);
    }
}

main();
