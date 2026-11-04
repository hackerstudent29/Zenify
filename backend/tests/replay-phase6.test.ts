import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import assert from 'assert';
import { prisma } from '../src/utils/prisma';
import { ReplayAggregatorService } from '../src/services/replay-aggregator.service';

async function runPhase6Tests() {
  console.log('\n===============================================================');
  console.log('   ZENIFY PHASE 6 REPLAY & LISTENER PERSONA TEST SUITE        ');
  console.log('===============================================================\n');

  const testUserId = `test_user_replay_${Date.now()}`;
  const testTrackId = `test_track_replay_${Date.now()}`;
  const testArtistId = `test_artist_replay_${Date.now()}`;
  const testYear = 2026;

  try {
    // Setup test user
    await prisma.user.create({
      data: {
        id: testUserId,
        email: `${testUserId}@zenify.test`,
        timezone: 'Asia/Kolkata',
        role: 'LISTENER',
        preferences: {
          create: {
            personalizationEnabled: true,
          },
        },
      },
    });

    await prisma.artist.create({
      data: {
        id: testArtistId,
        name: `Replay Maestro ${Date.now()}`,
      },
    });

    await prisma.track.create({
      data: {
        id: testTrackId,
        title: 'Midnight Symphony',
        artistId: testArtistId,
        duration: 300,
        audioUrl: 'https://example.com/audio.mp3',
      },
    });

    // Test 1: Empty state for new user
    console.log('Test 1: Empty replay state for new user');
    const emptyRes = await ReplayAggregatorService.getReplay(testUserId, testYear, true);
    assert.strictEqual(emptyRes.enabled, true);
    assert.ok(emptyRes.replay, 'Replay object must exist');
    assert.strictEqual(emptyRes.replay.totalMinutes, 0);
    assert.strictEqual(emptyRes.replay.longestStreakDays, 0);
    console.log('✅ Passed Test 1: Empty state returns clean fallback schema');

    // Test 2: Add listening events & verify aggregation
    console.log('Test 2: Listen events aggregation & Night Owl persona');
    // Day 1: 2026-06-10 23:00 (10 mins)
    const date1 = new Date(Date.UTC(testYear, 5, 10, 23, 0, 0));
    // Day 2: 2026-06-11 23:30 (15 mins)
    const date2 = new Date(Date.UTC(testYear, 5, 11, 23, 30, 0));

    await prisma.listenEvent.createMany({
      data: [
        {
          userId: testUserId,
          trackId: testTrackId,
          artistIds: [testArtistId],
          msPlayed: 600000, // 10 mins
          durationMs: 300000,
          completed: true,
          hour: 23,
          createdAt: date1,
        },
        {
          userId: testUserId,
          trackId: testTrackId,
          artistIds: [testArtistId],
          msPlayed: 900000, // 15 mins
          durationMs: 300000,
          completed: true,
          hour: 23,
          createdAt: date2,
        },
      ],
    });

    const activeRes = await ReplayAggregatorService.getReplay(testUserId, testYear, true);
    assert.strictEqual(activeRes.enabled, true);
    assert.ok(activeRes.replay);
    assert.strictEqual(activeRes.replay.totalMinutes, 25);
    assert.strictEqual(activeRes.replay.totalCompletedTracks, 2);
    assert.strictEqual(activeRes.replay.longestStreakDays, 2);
    assert.strictEqual(activeRes.replay.topTracks.length, 1);
    assert.strictEqual(activeRes.replay.topTracks[0].title, 'Midnight Symphony');
    assert.strictEqual(activeRes.replay.persona.title, 'Night Owl');
    console.log('✅ Passed Test 2: Aggregated 25 minutes, 2-day streak, and Night Owl persona');

    // Test 3: Snapshot caching
    console.log('Test 3: Verify Replay snapshot caching in database');
    const cachedRow = await prisma.replaySnapshot.findUnique({
      where: {
        userId_year: {
          userId: testUserId,
          year: testYear,
        },
      },
    });
    assert.ok(cachedRow, 'ReplaySnapshot row must be persisted in database');
    const cachedData = cachedRow.data as any;
    assert.strictEqual(cachedData.totalMinutes, 25);
    console.log('✅ Passed Test 3: Replay snapshot properly cached');

    // Test 4: Privacy enforcement when personalization is off
    console.log('Test 4: Privacy check - Personalization disabled');
    await prisma.userPreferences.update({
      where: { userId: testUserId },
      data: { personalizationEnabled: false },
    });

    const disabledRes = await ReplayAggregatorService.getReplay(testUserId, testYear, false);
    assert.strictEqual(disabledRes.enabled, false);
    assert.ok(disabledRes.message?.includes('Personalization is disabled'));
    console.log('✅ Passed Test 4: Privacy guarantee honored when personalization is disabled');

    console.log('\n🎉 ALL PHASE 6 REPLAY & PERSONA TESTS PASSED!\n');
  } finally {
    // Cleanup
    await prisma.replaySnapshot.deleteMany({ where: { userId: testUserId } }).catch(() => {});
    await prisma.listenEvent.deleteMany({ where: { userId: testUserId } }).catch(() => {});
    await prisma.track.deleteMany({ where: { id: testTrackId } }).catch(() => {});
    await prisma.artist.deleteMany({ where: { id: testArtistId } }).catch(() => {});
    await prisma.userPreferences.deleteMany({ where: { userId: testUserId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: testUserId } }).catch(() => {});
    await prisma.$disconnect();
  }
}

runPhase6Tests().catch((err) => {
  console.error('❌ Phase 6 tests failed:', err);
  process.exit(1);
});
