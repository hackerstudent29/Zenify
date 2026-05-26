import { prisma } from './prisma';
import { uploadUrlToCloudinary } from './cloudinary';


export const ARTIST_PHOTOS: Record<string, { profile: string; banner: string }> = {
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
    },
    "Deva": {
        profile: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=800&q=80",
        banner: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1600&q=80"
    },
    "Devi Sri Prasad": {
        profile: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=800&q=80",
        banner: "https://images.unsplash.com/photo-1514525253361-bee8718a74a2?w=1600&q=80"
    }
};

export async function syncArtistMetadata(artist: any) {
    const photoData = ARTIST_PHOTOS[artist.name];
    if (!photoData) return artist;

    const needsFix = 
        !artist.imageUrl || 
        artist.imageUrl.includes('ui-avatars') || 
        artist.imageUrl.includes('wikimedia') ||
        !artist.coverUrl ||
        artist.coverUrl.includes('wikimedia');

    if (needsFix) {
        console.log(`Auto-Sync: Updating metadata for ${artist.name}`);
        const profileToUpload = (artist.imageUrl?.includes('wikimedia') || !artist.imageUrl || artist.imageUrl.includes('ui-avatars')) ? photoData.profile : null;
        const bannerToUpload = (artist.coverUrl?.includes('wikimedia') || !artist.coverUrl) ? photoData.banner : null;

        const imageUrl = profileToUpload ? await uploadUrlToCloudinary(profileToUpload, 'zenify/artists/profile') : artist.imageUrl;
        const coverUrl = bannerToUpload ? await uploadUrlToCloudinary(bannerToUpload, 'zenify/artists/banner') : artist.coverUrl;

        return await prisma.artist.update({
            where: { id: artist.id },
            data: {
                imageUrl,
                coverUrl,
                verified: true
            },
             include: {
                    _count: { select: { tracks: true, albums: true } }
                }
        });
    }
    return artist;
}
