import { ArtistMappingService } from '../services/artist-mapping.service';
import { prisma } from '../utils/prisma';

async function main() {
    try {
        console.log("Checking if 'Sai Abhyankkar' exists in database...");
        let artist = await prisma.artist.findFirst({
            where: {
                name: {
                    contains: 'Sai Abhyankkar',
                    mode: 'insensitive'
                }
            }
        });

        if (!artist) {
            console.log("Sai Abhyankkar not found. Creating a placeholder artist profile 'Sai Abhyankkar'...");
            artist = await prisma.artist.create({
                data: {
                    name: "Sai Abhyankkar",
                    bio: "Canonical artist placeholder for tests",
                }
            });
            console.log(`Created: [${artist.id}] ${artist.name}`);
        } else {
            console.log(`Found existing artist: [${artist.id}] ${artist.name}`);
        }

        console.log("\n--- Testing resolveArtist for exact match 'Sai Abhyankkar' ---");
        const resExact = await ArtistMappingService.resolveArtist("Sai Abhyankkar");
        console.log("Resolved exact result:", resExact);

        console.log("\n--- Testing resolveArtist with typo 'Sai Abhyankar' (one 'k') ---");
        const resTypo1 = await ArtistMappingService.resolveArtist("Sai Abhyankar");
        console.log("Resolved typo 1 result:", resTypo1);

        console.log("\n--- Testing resolveArtist with typo 'sai abhyankkkr' (extra k, typo r) ---");
        const resTypo2 = await ArtistMappingService.resolveArtist("sai abhyankkkr");
        console.log("Resolved typo 2 result:", resTypo2);

        console.log("\n--- Testing resolveArtist with non-existing name 'A completely new name xy' ---");
        const resNew = await ArtistMappingService.resolveArtist("A completely new name xy");
        console.log("Resolved new result:", resNew);

        // Verify Levenshtein logic maps typo profiles correctly
        if (resTypo1.id === artist.id) {
            console.log("\n✅ SUCCESS: Typo 'Sai Abhyankar' mapped to existing artist ID!");
        } else {
            console.log("\n❌ FAIL: Typo did not map to existing artist ID.");
        }
    } catch (err: any) {
        console.error("Test execution failed:", err);
    }
}

main().finally(async () => await prisma.$disconnect());
