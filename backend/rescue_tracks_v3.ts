
import { PrismaClient } from '@prisma/client';
import { ExternalMetadataService } from './src/services/external-metadata.service';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function rescue() {
    console.log("🚀 Starting Track Rescue Mission: Moving missing local files to Cloudinary...");

    const tracks = await prisma.track.findMany({
        where: {
            OR: [
                { audioUrl: { contains: 'localhost' } },
                { audioUrl: { startsWith: '/public/' } },
                { audioUrl: { equals: '' } },
                { audioUrl: { equals: null } }
            ]
        },
        include: { user: true }
    });

    console.log(`Found ${tracks.length} tracks needing audio rescue.`);

    let successCount = 0;
    let failCount = 0;

    for (const track of tracks) {
        // Track might belong to a user acting as an artist
        const artistName = track.user?.name || track.user?.username || 'Unknown Artist';
        console.log(`\n🔍 Rescuing: "${track.title}" by "${artistName}"`);
        try {
            const result = await ExternalMetadataService.fetchAudio(track.title, artistName, track.duration);

            if (result?.url) {
                await prisma.track.update({
                    where: { id: track.id },
                    data: {
                        audioUrl: result.url,
                        duration: result.duration || track.duration
                    }
                });
                console.log(`✅ Success! Audio archived to Cloudinary: ${result.url}`);
                successCount++;
            } else {
                throw new Error("No audio URL returned from fetcher");
            }
        } catch (err: any) {
            console.error(`❌ Failed to rescue "${track.title}": ${err.message}`);
            failCount++;
        }
    }

    // Now fix Covers if they are local
    const brokenCovers = await prisma.track.findMany({
        where: {
            OR: [
                { coverUrl: { contains: 'localhost' } },
                { coverUrl: { startsWith: '/public/' } }
            ]
        }
    });

    console.log(`\nFound ${brokenCovers.length} tracks needing cover rescue.`);
    const PLACEHOLDERS = [
        "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=800",
        "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=800",
        "https://images.unsplash.com/photo-1470225620353-fb4b183b523e?q=80&w=800"
    ];

    for (let i = 0; i < brokenCovers.length; i++) {
        const track = brokenCovers[i];
        const newCover = PLACEHOLDERS[i % PLACEHOLDERS.length];
        await prisma.track.update({
            where: { id: track.id },
            data: { coverUrl: newCover }
        });
        console.log(`📸 Replaced local cover for "${track.title}" with Unsplash placeholder.`);
    }

    console.log(`\n✨ Rescue Mission Finished!`);
    console.log(`Successfully fixed: ${successCount} audio files, ${brokenCovers.length} covers.`);
    console.log(`Failed (needs manual link): ${failCount}`);

    await prisma.$disconnect();
}

rescue().catch(err => {
    console.error("Fatal Error during rescue:", err);
    process.exit(1);
});
