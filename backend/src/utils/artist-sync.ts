import { prisma } from './prisma';
import { uploadUrlToCloudinary } from './cloudinary';


export const ARTIST_PHOTOS: Record<string, { profile: string; banner: string }> = {};

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
