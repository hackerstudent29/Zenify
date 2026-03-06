
import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Cloudinary config (matches your .env)
cloudinary.config({
    cloud_name: "dzqcuxchc",
    api_key: "863945965552634",
    api_secret: "-S6zQvVew79Pv4OloxMzwhbaa4s",
    secure: true
});

async function migrate() {
    console.log("🚀 Starting migration of local files to Cloudinary...");

    const tracks = await prisma.track.findMany({
        where: {
            OR: [
                { audioUrl: { startsWith: '/public' } },
                { coverUrl: { startsWith: '/public' } }
            ]
        }
    });

    console.log(`Found ${tracks.length} tracks with local paths.`);

    for (const track of tracks) {
        console.log(`\nProcessing Track: "${track.title}" (ID: ${track.id})`);
        const updates: any = {};

        // 1. Migrate Audio
        if (track.audioUrl && track.audioUrl.startsWith('/public')) {
            const localPath = path.join(__dirname, '..', '..', track.audioUrl);
            if (fs.existsSync(localPath)) {
                try {
                    console.log(`Uploading audio: ${localPath}`);
                    const result = await cloudinary.uploader.upload(localPath, {
                        resource_type: 'video',
                        folder: 'zenify/tracks',
                        public_id: `migrated-audio-${track.id}`
                    });
                    updates.audioUrl = result.secure_url;
                    console.log(`✅ Audio migrated: ${result.secure_url}`);
                } catch (err) {
                    console.error(`❌ Audio upload failed for ${track.id}:`, err.message);
                }
            } else {
                console.warn(`⚠️ Local audio file not found: ${localPath}`);
            }
        }

        // 2. Migrate Cover
        if (track.coverUrl && track.coverUrl.startsWith('/public')) {
            const localPath = path.join(__dirname, '..', '..', track.coverUrl);
            if (fs.existsSync(localPath)) {
                try {
                    console.log(`Uploading cover: ${localPath}`);
                    const result = await cloudinary.uploader.upload(localPath, {
                        resource_type: 'image',
                        folder: 'zenify/covers',
                        public_id: `migrated-cover-${track.id}`
                    });
                    updates.coverUrl = result.secure_url;
                    console.log(`✅ Cover migrated: ${result.secure_url}`);
                } catch (err) {
                    console.error(`❌ Cover upload failed for ${track.id}:`, err.message);
                }
            } else {
                console.warn(`⚠️ Local cover file not found: ${localPath}`);
            }
        }

        if (Object.keys(updates).length > 0) {
            await prisma.track.update({
                where: { id: track.id },
                data: updates
            });
            console.log(`✨ DB updated for track ${track.id}`);
        }
    }

    console.log("\n✅ Migration complete!");
    process.exit(0);
}

migrate().catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
});
