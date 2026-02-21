import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
    const musicDir = path.join(__dirname, '../public/music');

    // Ensure the directory exists
    if (!fs.existsSync(musicDir)) {
        console.error("The music folder does not exist. Please place your 30 songs unzipped inside: backend/public/music/");
        return;
    }

    // Read all files in the directory
    const files = fs.readdirSync(musicDir);
    const audioFiles = files.filter(file => file.endsWith('.mp3') || file.endsWith('.wav') || file.endsWith('.m4a'));

    if (audioFiles.length === 0) {
        console.log("No audio files found in backend/public/music/. Make sure you unzipped your 30 songs there.");
        return;
    }

    console.log(`Found ${audioFiles.length} songs. Starting database insertion...`);

    // Let's create an "Unknown Artist" just to attach them to, or use an existing one
    let defaultArtist = await prisma.artist.findFirst({ where: { name: "System Uploads" } });
    if (!defaultArtist) {
        defaultArtist = await prisma.artist.create({
            data: { name: "System Uploads", bio: "Batch uploaded tracks." }
        });
    }

    let successCount = 0;

    for (const file of audioFiles) {
        try {
            // Basic title extraction from filename (remove extension and replace underscores with space)
            const title = file.replace(/\.[^/.]+$/, "").replace(/_/g, " ");

            // Check if track already exists by file path
            const existingTrack = await prisma.track.findFirst({
                where: { audioUrl: `/music/${file}` }
            });

            if (existingTrack) {
                console.log(`Skipping: ${title} (Already in database)`);
                continue;
            }

            await prisma.track.create({
                data: {
                    title: title,
                    artistId: defaultArtist.id,
                    audioUrl: `/music/${file}`,
                    duration: 180, // We set a default of 3 mins since we can't easily parse duration via basic node JS without extra libs.
                    genre: "Various",
                    coverUrl: null // Uses default cover
                }
            });
            console.log(`Uploaded: ${title}`);
            successCount++;
        } catch (error) {
            console.error(`Error uploading ${file}:`, error);
        }
    }

    console.log(`\nBatch Upload Complete! Successfully added ${successCount} new tracks to the database.`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
