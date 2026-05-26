import { ExternalMetadataService } from './src/services/external-metadata.service';
import { prisma } from './src/utils/prisma';
import { FastifyInstance } from 'fastify';

async function testImport() {
    const url = 'https://music.apple.com/us/album/starboy/1171738151?i=1171738173';
    console.log('Testing metadata fetch for:', url);
    try {
        const metadata = await ExternalMetadataService.fetchFromUrl(url);
        console.log('Metadata result:', JSON.stringify(metadata, null, 2));

        if (metadata.title && metadata.artist) {
            console.log('Testing audio fetch...');
            const audio = await ExternalMetadataService.fetchAudio(metadata.title, metadata.artist, metadata.duration);
            console.log('Audio result:', audio);
        }
    } catch (err) {
        console.error('Test failed:', err);
    }
}

testImport().catch(console.error).finally(() => prisma.$disconnect());
