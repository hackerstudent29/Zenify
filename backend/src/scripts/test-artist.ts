import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        console.log("Querying first artist from DB...");
        const artist = await prisma.artist.findFirst({
            include: {
                albums: {
                    take: 10,
                    orderBy: { releaseDate: 'desc' }
                }
            }
        });

        if (!artist) {
            console.log("No artists found in DB.");
            return;
        }

        console.log(`Found artist: [${artist.id}] ${artist.name}`);

        const id = artist.id;
        const topTracks = await prisma.track.findMany({
            where: { 
                OR: [
                    { artistId: id },
                    { featuredArtists: { contains: artist.name, mode: 'insensitive' } }
                ],
                deletedAt: null 
            },
            include: { artist: true, album: true },
            orderBy: { streams: 'desc' },
            take: 50
        });

        const [trackCount, streamAgg] = await Promise.all([
            prisma.track.count({ 
                where: { 
                    OR: [
                        { artistId: id },
                        { featuredArtists: { contains: artist.name, mode: 'insensitive' } }
                    ],
                    deletedAt: null 
                } 
            }),
            prisma.track.aggregate({
                where: { 
                    OR: [
                        { artistId: id },
                        { featuredArtists: { contains: artist.name, mode: 'insensitive' } }
                    ],
                    deletedAt: null 
                },
                _sum: { streams: true }
            })
        ]);

        console.log("Staging response serialization...");
        const response = JSON.parse(JSON.stringify({ 
            ...artist, 
            topTracks, 
            trackCount, 
            totalStreams: Number(streamAgg._sum.streams || 0),
            follower_count: artist.follower_count || 0,
            monthlyListeners: artist.monthlyListeners || 0
        },
            (key, value) => typeof value === 'bigint' ? value.toString() : value
        ));

        console.log("SUCCESS! Serialized response contains keys:", Object.keys(response));
        console.log("Sample topTracks count:", response.topTracks?.length);
    } catch (err: any) {
        console.error("CRASH DETECTED:", err);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
