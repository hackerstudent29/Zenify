
import { prisma } from '../utils/prisma';
import { CANONICAL_ARTISTS } from '../utils/artist';

const ARTIST_PHOTOS: Record<string, string> = {
    "A. R. Rahman": "https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=800&q=80",
    "Anirudh Ravichander": "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=800&q=80",
    "Harris Jayaraj": "https://images.unsplash.com/photo-1514525253361-bee8718a74a2?w=800&q=80",
    "Yuvan Shankar Raja": "https://images.unsplash.com/photo-1470225620353-fb4b183b523e?w=800&q=80",
    "G. V. Prakash Kumar": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&q=80",
    "Santhosh Narayanan": "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=800&q=80",
    "Ilaiyaraaja": "https://images.unsplash.com/photo-1520529611477-d49729d3637e?w=800&q=80",
    "Sai Abhyankkar": "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=800&q=80",
};

export async function seedRichArtistMetadata() {
    console.log('Seed: Starting artist metadata enrichment for Zenify...');

    for (const key in CANONICAL_ARTISTS) {
        const canonical = CANONICAL_ARTISTS[key];

        try {
            const artist = await prisma.artist.findUnique({
                where: { name: canonical.name }
            });

            const photo = ARTIST_PHOTOS[canonical.name] || `https://images.unsplash.com/photo-1514525253361-bee8718a74a2?w=800&q=80`;

            if (artist) {
                console.log(`Seed: Synchronizing metadata for ${canonical.name}...`);
                await prisma.artist.update({
                    where: { id: artist.id },
                    data: {
                        bio: canonical.bio,
                        // @ts-ignore
                        birthDate: canonical.birthDate ? new Date(canonical.birthDate) : null,
                        imageUrl: artist.imageUrl?.includes('ui-avatars') ? photo : artist.imageUrl,
                        verified: true
                    }
                });
            } else {
                console.log(`Seed: Creating canonical profile for ${canonical.name}...`);
                await prisma.artist.create({
                    data: {
                        name: canonical.name,
                        bio: canonical.bio,
                        // @ts-ignore
                        birthDate: canonical.birthDate ? new Date(canonical.birthDate) : null,
                        imageUrl: photo,
                        verified: true
                    }
                });
            }
        } catch (err) {
            console.error(`Seed: Failed to process artist ${canonical.name}:`, err);
        }
    }

    console.log('Seed: All canonical artists have been synchronized with rich metadata.');
}
