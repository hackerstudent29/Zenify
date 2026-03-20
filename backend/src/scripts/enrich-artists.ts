
import { prisma } from '../utils/prisma';
import { CANONICAL_ARTISTS } from '../utils/artist';

const ARTIST_PHOTOS: Record<string, { profile: string; banner: string }> = {
    "A. R. Rahman": {
        profile: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&q=80",
        banner: "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=1600&q=80"
    },
    "Anirudh Ravichander": {
        profile: "https://images.unsplash.com/photo-1514525253361-bee8718a74a2?w=800&q=80",
        banner: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1600&q=80"
    },
    "Harris Jayaraj": {
        profile: "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=800&q=80",
        banner: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=1600&q=80"
    },
    "Yuvan Shankar Raja": {
        profile: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&q=80",
        banner: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1600&q=80"
    },
    "G. V. Prakash Kumar": {
        profile: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=800&q=80",
        banner: "https://images.unsplash.com/photo-1514525253361-bee8718a74a2?w=1600&q=80"
    },
    "Santhosh Narayanan": {
        profile: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&q=80",
        banner: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=1600&q=80"
    },
    "Ilaiyaraaja": {
        profile: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=800&q=80",
        banner: "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=1600&q=80"
    },
    "Sai Abhyankkar": {
        profile: "https://images.unsplash.com/photo-1460723237483-7a6dc9d0b212?w=800&q=80",
        banner: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=1600&q=80"
    }
};

export async function seedRichArtistMetadata() {
    console.log('Seed: Starting artist metadata enrichment for Zenify...');

    for (const key in CANONICAL_ARTISTS) {
        const canonical = CANONICAL_ARTISTS[key];

        try {
            const artist = await prisma.artist.findUnique({
                where: { name: canonical.name }
            });

            const photoData = ARTIST_PHOTOS[canonical.name] || { 
                profile: `https://images.unsplash.com/photo-1514525253361-bee8718a74a2?w=800&q=80`,
                banner: `https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1600&q=80`
            };

            if (artist) {
                console.log(`Seed: Synchronizing metadata for ${canonical.name}...`);
                await prisma.artist.update({
                    where: { id: artist.id },
                    data: {
                        bio: canonical.bio,
                        // @ts-ignore
                        birthDate: canonical.birthDate ? new Date(canonical.birthDate) : null,
                        imageUrl: (artist.imageUrl?.includes('ui-avatars') || artist.imageUrl?.includes('wikimedia') || !artist.imageUrl) ? photoData.profile : artist.imageUrl,
                        coverUrl: (artist.coverUrl?.includes('wikimedia') || !artist.coverUrl) ? photoData.banner : artist.coverUrl,
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
                        imageUrl: photoData.profile,
                        coverUrl: photoData.banner,
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
