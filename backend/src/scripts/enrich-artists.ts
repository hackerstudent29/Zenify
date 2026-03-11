
import { prisma } from '../utils/prisma';
import { CANONICAL_ARTISTS } from '../utils/artist';

const ARTIST_PHOTOS: Record<string, string> = {
    "A. R. Rahman": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/A_R_Rahman.jpg/500px-A_R_Rahman.jpg",
    "Anirudh Ravichander": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Anirudh_Ravichander.jpg/500px-Anirudh_Ravichander.jpg",
    "Harris Jayaraj": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Harris_Jayaraj_2016.png/500px-Harris_Jayaraj_2016.png",
    "Yuvan Shankar Raja": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Yuvan_Shankar_Raja_at_the_Big_Fm_Inaugration.jpg/500px-Yuvan_Shankar_Raja_at_the_Big_Fm_Inaugration.jpg",
    "G. V. Prakash Kumar": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/G._V._Prakash_Kumar_at_the_Audio_launch_of_%E2%80%98Sema%E2%80%99.jpg/500px-G._V._Prakash_Kumar_at_the_Audio_launch_of_%E2%80%98Sema%E2%80%99.jpg",
    "Santhosh Narayanan": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Santhosh_Narayanan.jpg/500px-Santhosh_Narayanan.jpg",
    "Ilaiyaraaja": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Ilaiyaraaja_at_the_2022_National_film_awards.jpg/500px-Ilaiyaraaja_at_the_2022_National_film_awards.jpg",
    "Sai Abhyankkar": "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=800&q=80", // Keep Unsplash for extremely niche/new independent artists lacking public wiki photos
    "D. Imman": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/D_Imman_at_Aathrava_Audio_Launch.jpg/500px-D_Imman_at_Aathrava_Audio_Launch.jpg",
    "Sam C. S.": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Sam_cs%28Music_Director%29.jpg/500px-Sam_cs%28Music_Director%29.jpg",
    "Hip Hop Tamizha": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Hiphop_Tamizha.jpg/500px-Hiphop_Tamizha.jpg",
    "Thaman S": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/S._Thaman_in_2022.jpg/500px-S._Thaman_in_2022.jpg",
    "Sean Roldan": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Sean_Roldan_at_the_Power_Paandi_Audio_Launch.jpg/500px-Sean_Roldan_at_the_Power_Paandi_Audio_Launch.jpg",
    "Ghibran": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Ghibran_.jpg/500px-Ghibran_.jpg"
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
