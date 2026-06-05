import { PrismaClient } from '@prisma/client';
import { AIArtistService } from '../services/ai-artist.service';

const prisma = new PrismaClient();

const ARTISTS_TO_FIX = [
    "A. R. Rahman",
    "Anirudh Ravichander",
    "Harris Jayaraj",
    "Yuvan Shankar Raja",
    "G. V. Prakash Kumar",
    "Santhosh Narayanan",
    "Ilaiyaraaja",
    "Sai Abhyankkar",
    "Deva",
    "Devi Sri Prasad"
];

async function main() {
    console.log('Starting artist picture fix...');

    for (const artistName of ARTISTS_TO_FIX) {
        console.log(`Processing ${artistName}...`);
        try {
            const enriched = await AIArtistService.enrichArtistProfile(artistName);
            
            await prisma.artist.updateMany({
                where: { name: artistName },
                data: {
                    imageUrl: enriched.imageUrl,
                    coverUrl: enriched.coverUrl,
                }
            });
            console.log(`✅ Updated ${artistName} with genuine pictures.`);
        } catch (error) {
            console.error(`❌ Failed to process ${artistName}:`, error);
        }
    }

    console.log('Finished fixing artists.');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
