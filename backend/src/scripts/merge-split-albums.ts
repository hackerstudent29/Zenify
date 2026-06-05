import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function mergeSplitAlbums() {
    console.log("Starting Album Merge Scan...");

    // Find all albums
    const albums = await prisma.album.findMany({
        include: {
            artist: true,
            tracks: true
        }
    });

    // Group albums by title (case-insensitive)
    const albumGroups = new Map<string, typeof albums>();

    for (const album of albums) {
        const titleKey = album.title.toLowerCase().trim();
        if (!albumGroups.has(titleKey)) {
            albumGroups.set(titleKey, []);
        }
        albumGroups.get(titleKey)!.push(album);
    }

    let mergedCount = 0;

    for (const [titleKey, group] of albumGroups.entries()) {
        if (group.length > 1) {
            console.log(`Found duplicate albums for "${titleKey}": ${group.length} versions.`);
            
            // We should pick the first one as the master album
            const masterAlbum = group[0];
            const duplicateAlbums = group.slice(1);

            console.log(`  Master Album ID: ${masterAlbum.id} (Artist: ${masterAlbum.artist.name})`);

            for (const dup of duplicateAlbums) {
                console.log(`    Merging Duplicate ID: ${dup.id} (Artist: ${dup.artist.name}, Tracks: ${dup.tracks.length})`);
                
                // Move all tracks from dup to masterAlbum
                if (dup.tracks.length > 0) {
                    await prisma.track.updateMany({
                        where: { albumId: dup.id },
                        data: { albumId: masterAlbum.id }
                    });
                }
                
                // Delete the duplicate album
                await prisma.album.delete({
                    where: { id: dup.id }
                });

                mergedCount++;
            }
        }
    }

    console.log(`Done! Merged and deleted ${mergedCount} duplicate albums.`);
}

mergeSplitAlbums()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
