import dotenv from 'dotenv';
import path from 'path';

// 1. Load Env Vars FIRST
const envResult = dotenv.config({ path: path.join(process.cwd(), '.env') });
if (envResult.error) {
    console.error('❌ Failed to load .env:', envResult.error);
    process.exit(1);
}

import fastify from 'fastify';

async function main() {
    console.log('🚀 Starting System Verification...');

    // FORCE DIRECT CONNECTION for testing to avoid PgBouncer issues with prepared statements
    if (process.env.DIRECT_URL) {
        process.env.DATABASE_URL = process.env.DIRECT_URL;
        console.log('⚠️ Forced DATABASE_URL = DIRECT_URL for testing');
    } else {
        console.log('⚠️ DIRECT_URL not found, using DATABASE_URL');
    }

    // 2. Dynamic Imports (Runs after env is loaded and env var is swapped)
    const { PrismaClient } = await import('@prisma/client');
    const { AuthService } = await import('../src/services/auth.service');
    const { TrackService } = await import('../src/services/track.service');
    const { PlaylistService } = await import('../src/services/playlist.service');

    // Mock server
    const server = fastify({ logger: false });
    if (!server.hasDecorator('httpErrors')) {
        server.decorate('httpErrors', {
            conflict: (msg: string) => new Error(`Conflict: ${msg}`),
            unauthorized: (msg: string) => new Error(`Unauthorized: ${msg}`),
            notFound: (msg: string) => new Error(`NotFound: ${msg}`),
            forbidden: (msg: string) => new Error(`Forbidden: ${msg}`),
        });
    }

    // NOTE: This local prisma instance uses the modified process.env.DATABASE_URL
    const prisma = new PrismaClient();

    // Services (Note: they use the singleton from utils/prisma.ts which ALSO reads process.env.DATABASE_URL)
    // Since we modified process.env.DATABASE_URL *before* importing them, they should pick up the Direct URL!
    const authService = new AuthService(server);
    const trackService = new TrackService(server);
    const playlistService = new PlaylistService(server);

    const email = `test.${Date.now()}@zenify.com`;
    const password = 'Password123!';

    try {
        console.log(`1. Registering user: ${email}...`);
        const { user } = await authService.register({ email, password, role: 'ADMIN' });
        console.log('✅ Registered:', user.id);

        console.log('2. Creating Track...');
        const track = await trackService.create({
            title: 'Zen Mode',
            artist: 'System',
            audioUrl: 'https://example.com/audio.mp3',
            duration: 180,
            tags: ['chill', 'test']
        });
        console.log('✅ Track Created:', track.title);

        console.log('3. Creating Playlist...');
        const playlist = await playlistService.create(user.id, {
            name: 'Verification Vibe',
            isPublic: true
        });
        console.log('✅ Playlist Created:', playlist.name);

        console.log('4. Adding Track to Playlist...');
        await playlistService.addTrack(playlist.id, track.id, user.id);
        console.log('✅ Track added to Playlist');

        console.log('5. Verifying Playlist...');
        const fetchedPlaylist = await playlistService.findOne(playlist.id);
        if (fetchedPlaylist.tracks.length !== 1) throw new Error('Playlist empty');
        console.log('✅ Playlist verified with 1 track');

        console.log('🎉 SYSTEM VERIFICATION SUCCESSFUL');
    } catch (error) {
        console.error('❌ Verification Failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
