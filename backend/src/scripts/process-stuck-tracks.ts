import { PrismaClient } from '@prisma/client';
import { runImportTask } from '../queues/import.queue';

const prisma = new PrismaClient();

async function main() {
    console.log("Checking database for stuck or pending tracks...");
    
    const stuckTracks = await prisma.track.findMany({
        where: {
            releaseStatus: { in: ['PROCESSING', 'PENDING'] }
        },
        include: {
            artist: true
        }
    });

    console.log(`Found ${stuckTracks.length} stuck/pending tracks.`);
    
    for (const track of stuckTracks) {
        console.log(`\n--- Processing Track: ${track.title} (ID: ${track.id}) by ${track.artist?.name} ---`);
        console.log(`Created at: ${track.createdAt}`);
        console.log(`Original audioUrl: ${track.audioUrl}`);
        
        // Find the actual YouTube URL or original URL to import from.
        // Wait, enqueued import needs:
        // trackId, youtubeUrl, title, artistName, userId
        
        // If the track is stuck in PROCESSING, it might have had its audioUrl cleared in the DB (since it's an external source).
        // Let's see if we can find where it is enqueued, or if we can find the youtubeUrl from notifications or if we need to search for it.
        // Let's check if the audioUrl in track is empty.
        let youtubeUrl = track.audioUrl;
        
        // If audioUrl is empty, it means it was enqueued. Let's search the user's notifications or history for the youtube URL,
        // or check if there's a way to find it.
        // Wait! In the notifications for this user, was there any import URL? No.
        // Wait, is there a way to get the youtubeUrl?
        // Let's search for "Thaniye" on YouTube since we can just use the search term or resolve it.
        // Let's see: how did the user import it?
        // In the database model, does Track store the original YouTube URL?
        // Let's check if we can query the Track table or if there's another table that stores the job, or we can search YouTube for "Thaniye" by "Anirudh Ravichander".
        if (!youtubeUrl) {
            console.log(`Audio URL is empty. Searching YouTube for "${track.title}" by "${track.artist?.name}"...`);
            // We can search for the video on YouTube.
            // Let's import ExternalMetadataService
            const { ExternalMetadataService } = require('../services/external-metadata.service');
            try {
                const searchResult = await ExternalMetadataService.fetchAudio(
                    track.title,
                    track.artist?.name || 'Unknown Artist',
                    track.duration,
                    undefined,
                    { preview: true }
                );
                if (searchResult && searchResult.watchUrl) {
                    youtubeUrl = searchResult.watchUrl;
                    console.log(`Resolved YouTube URL: ${youtubeUrl}`);
                }
            } catch (err: any) {
                console.error(`Failed to search YouTube:`, err.message);
            }
        }
        
        if (youtubeUrl) {
            console.log(`Starting runImportTask for enqueued job...`);
            try {
                await runImportTask({
                    trackId: track.id,
                    youtubeUrl: youtubeUrl,
                    title: track.title,
                    artistName: track.artist?.name || 'Unknown Artist',
                    userId: track.userId || undefined
                });
                console.log(`Finished processing for ${track.title}.`);
            } catch (err: any) {
                console.error(`Error processing track ${track.title}:`, err.message);
            }
        } else {
            console.log(`Could not find a valid YouTube URL for track ${track.title}. Skipping.`);
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
