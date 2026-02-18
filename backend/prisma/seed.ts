import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('Start seeding production-level data...');

    // 1. Cleanup
    await prisma.history.deleteMany();
    await prisma.playlistTrack.deleteMany();
    await prisma.like.deleteMany();
    await prisma.rating.deleteMany();
    await prisma.userTrackStat.deleteMany();
    await prisma.track.deleteMany();
    await prisma.album.deleteMany();
    await prisma.playlist.deleteMany();
    await prisma.artist.deleteMany();
    // Keep users to avoid logout issues during dev, unless specified
    // await prisma.user.deleteMany();

    // 2. Create Artists
    const artists = [
        { name: "Lofi Girl", bio: "Beats to relax/study to.", imageUrl: "https://yt3.googleusercontent.com/ytc/AIdro_lv6oX_n_n_n_n_n_n_n_n_n_n_n_n_n_n=s176-c-k-c0x00ffffff-no-rj" },
        { name: "DivKid", bio: "Modular synth explorer.", imageUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400" },
        { name: "City Lights", bio: "Electronic tunes for urban nights.", imageUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400" },
        { name: "Nature Sounds", bio: "The sound of the earth.", imageUrl: "https://images.unsplash.com/photo-1534067783941-51c9c23ecefd?w=400" },
        { name: "Synthwave Boy", bio: "Living in the 80s.", imageUrl: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=400" },
        { name: "Brain Waves", bio: "Deep focus frequencies.", imageUrl: "https://images.unsplash.com/photo-1506157786151-b8491531f063?w=400" },
    ];

    const createdArtists = [];
    for (const artist of artists) {
        const a = await prisma.artist.create({ data: artist });
        createdArtists.push(a);
    }

    // 3. Create Albums
    const albumsData = [
        { title: "Midnight Study", artistId: createdArtists[0].id, coverUrl: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=500" },
        { title: "Modular Dreams", artistId: createdArtists[1].id, coverUrl: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=500" },
        { title: "Urban Pulse", artistId: createdArtists[2].id, coverUrl: "https://images.unsplash.com/photo-1446064448874-883a25adead3?w=500" },
        { title: "Forest Breath", artistId: createdArtists[3].id, coverUrl: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=500" },
        { title: "Neon Horizon", artistId: createdArtists[4].id, coverUrl: "https://images.unsplash.com/photo-1535478044878-3ed83003c563?w=500" },
    ];

    const createdAlbums = [];
    for (const album of albumsData) {
        const alb = await prisma.album.create({ data: album });
        createdAlbums.push(alb);
    }

    // 4. Create Tracks (Lots of them)
    const genres = ["Chill", "Electronic", "Ambient", "Synthwave", "Lo-Fi", "Jazz", "Focus"];
    const words = ["Sunset", "Vibes", "Echoes", "Pulse", "City", "Ocean", "Rain", "Neon", "Cyber", "Deep", "Pure", "Eternal", "Static", "Memory", "Flight"];

    for (let i = 0; i < 30; i++) {
        const artist = createdArtists[Math.floor(Math.random() * createdArtists.length)];
        const album = Math.random() > 0.3 ? createdAlbums.find(a => a.artistId === artist.id) : null;
        const genre = genres[Math.floor(Math.random() * genres.length)];
        const title = `${words[Math.floor(Math.random() * words.length)]} ${words[Math.floor(Math.random() * words.length)]}`;

        await prisma.track.create({
            data: {
                title,
                artistId: artist.id,
                albumId: album?.id,
                genre,
                duration: 180 + Math.floor(Math.random() * 200),
                coverUrl: album?.coverUrl || `https://picsum.photos/seed/${i}/500/500`,
                audioUrl: `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3`, // Placeholder
                isFeatured: Math.random() > 0.8,
                isTrending: Math.random() > 0.7,
                tags: [genre.toLowerCase(), "featured", "relax"],
                lyrics: i === 0 ? "[00:10.00] This is a sample lyric line\n[00:15.00] Syncing with the music\n[00:20.00] In the hall of the mountain king" : null
            }
        });
    }

    // 5. Create Official Playlists
    const officialPlaylists = [
        { name: "Zenify Focus", description: "Deep work sessions.", coverUrl: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=500" },
        { name: "Night Drive", description: "Synthwave and neon lights.", coverUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500" },
        { name: "Lo-Fi Lounge", description: "Stay chill, stay zen.", coverUrl: "https://images.unsplash.com/photo-1459749411177-042180ce673c?w=500" },
    ];

    // Get an admin user
    let admin = await prisma.user.findFirst({ where: { role: Role.ADMIN } });

    // Create specific user ramzendrum@gmail.com
    const specificUserEmail = 'ramzendrum@gmail.com';
    let specificUser = await prisma.user.findUnique({ where: { email: specificUserEmail } });

    if (!specificUser) {
        // We'll use a placeholder hash for now, real app should import bcrypt properly
        // For dev, if we know the hash for 'RAMA2007@' we can use it.
        // Assuming bcrypt rounds 10.
        // $2b$10$YourHashHere... 
        // For simplicity in seed, let's just make sure we can login. 
        // Or actually, let's just use the auth service logic if possible, but we can't easily.
        // Let's rely on the frontend registering or updating if needed.
        // BUT the user asked to "give access". So we MUST create it with the password.

        // Dynamic import to avoid top-level await issues if environment doesn't support it, but seed is script.
        // bcrypt imported at top
        const hashedPassword = await bcrypt.hash('RAMA2007@', 10);

        specificUser = await prisma.user.create({
            data: {
                email: specificUserEmail,
                role: Role.ADMIN,
                password: hashedPassword
            }
        });
        console.log(`Created user ${specificUserEmail}`);
    } else {
        // Update role if exists
        await prisma.user.update({
            where: { id: specificUser.id },
            data: { role: Role.ADMIN }
        });
        console.log(`Updated role for ${specificUserEmail}`);
    }

    if (!admin) {
        admin = await prisma.user.create({
            data: {
                email: 'admin@zenify.com',
                role: Role.ADMIN,
                password: 'hashed_password_here' // In real seed use a proper hash
            }
        });
    }

    for (const p of officialPlaylists) {
        const playlist = await prisma.playlist.create({
            data: {
                ...p,
                userId: admin.id,
                isPublic: true
            }
        });

        // Add random tracks
        const tracks = await prisma.track.findMany({ take: 10 });
        for (const track of tracks) {
            await prisma.playlistTrack.create({
                data: {
                    playlistId: playlist.id,
                    trackId: track.id
                }
            });
        }
    }

    // 6. Add specific tracks for ramzendrum
    // Re-fetch specific user to be sure
    const targetUser = await prisma.user.findUnique({ where: { email: 'ramzendrum@gmail.com' } });
    if (targetUser) {
        const ramzenArtist = await prisma.artist.upsert({
            where: { name: "Ramzen Uploads" },
            update: {},
            create: { name: "Ramzen Uploads", bio: "Personal stash.", imageUrl: "https://ui-avatars.com/api/?name=Ramzen+Uploads" }
        });

        const specificTracks = [
            { title: "Udhungada Sangu (Breakup Version)", fileName: "Udhungada_Sangu.wav" },
            { title: "Maari Prelude of Love", fileName: "Maari_Prelude.mp3" },
            { title: "Powerhouse", fileName: "Powerhouse.mp3" }
        ];

        const ramzenPlaylist = await prisma.playlist.create({
            data: {
                name: "My Special Uploads",
                description: "Tracks uploaded directly.",
                userId: targetUser.id,
                isPublic: true,
                coverUrl: "https://images.unsplash.com/photo-1514525253440-b393452e3383?w=500"
            }
        });

        for (const t of specificTracks) {
            const newTrack = await prisma.track.create({
                data: {
                    title: t.title,
                    artistId: ramzenArtist.id,
                    duration: 180,
                    audioUrl: `/public/music/${t.fileName}`,
                    coverUrl: ramzenPlaylist.coverUrl,
                    genre: "Custom",
                    isFeatured: true
                }
            });

            await prisma.playlistTrack.create({
                data: {
                    playlistId: ramzenPlaylist.id,
                    trackId: newTrack.id
                }
            });
        }
        console.log("Added specific tracks for ramzendrum.");
    }

    console.log('Seeding finished successfully.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
