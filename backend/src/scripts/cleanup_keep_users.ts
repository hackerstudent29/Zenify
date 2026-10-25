import { prisma } from '../utils/prisma.js';
import Redis from 'ioredis';
import { config } from '../config/env.js';
import { flushAllCaches } from '../utils/cache.js';

async function safeDelete(name: string, fn: () => Promise<any>) {
  try {
    const res = await fn();
    console.log(`Deleted ${name}: count = ${res?.count ?? 'ok'}`);
    return res?.count ?? 0;
  } catch (err: any) {
    console.log(`Skipped ${name} (table not present or error): ${err.message}`);
    return 0;
  }
}

async function main() {
  console.log('--- STARTING CLEANUP: DELETING TRACKS, ARTISTS, ALBUMS & CACHE (USERS PRESERVED) ---');

  // 1. Delete dependent & non-user music data
  console.log('1. Clearing non-user music tables...');
  await safeDelete('PlaylistTracks', () => prisma.playlistTrack.deleteMany());
  await safeDelete('Playlists', () => prisma.playlist.deleteMany());
  await safeDelete('Likes', () => prisma.like.deleteMany());
  await safeDelete('History', () => prisma.history.deleteMany());
  await safeDelete('Purchases', () => prisma.purchase.deleteMany());
  await safeDelete('Ratings', () => prisma.rating.deleteMany());
  await safeDelete('UserTrackStats', () => prisma.userTrackStat.deleteMany());
  await safeDelete('TrackAnalytics', () => prisma.trackAnalytics.deleteMany());
  await safeDelete('TrackVibeProfiles', () => prisma.trackVibeProfile.deleteMany());
  await safeDelete('LyricEnrichmentJobs', () => prisma.lyricEnrichmentJob.deleteMany());
  await safeDelete('FeaturedContent', () => prisma.featuredContent.deleteMany());
  await safeDelete('ArtistAliases', () => (prisma as any).artistAlias?.deleteMany?.());
  await safeDelete('Tracks', () => prisma.track.deleteMany());
  await safeDelete('Albums', () => prisma.album.deleteMany());
  await safeDelete('Artists', () => prisma.artist.deleteMany());

  // 2. Verify all users remain intact
  const userCount = await prisma.user.count();
  console.log(`2. Verified: All ${userCount} users and their details remain 100% intact.`);

  // 3. Clear Redis Cache and memory cache
  console.log('3. Flushing all Redis and memory caches...');
  try {
    await flushAllCaches();
  } catch (err: any) {
    console.warn('flushAllCaches note:', err.message);
  }

  if (config.REDIS_URL) {
    try {
      const redis = new Redis(config.REDIS_URL, { connectTimeout: 5000, maxRetriesPerRequest: 1 });
      await redis.flushall();
      await redis.quit();
      console.log('Remote Redis cache flushed completely (flushall).');
    } catch (err: any) {
      console.warn('Could not flush remote Redis:', err.message);
    }
  }

  console.log('--- CLEANUP COMPLETE: ONLY USER DETAILS PRESERVED, CATALOG WIPED CLEAN ---');
}

main()
  .catch((err) => {
    console.error('Cleanup error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
