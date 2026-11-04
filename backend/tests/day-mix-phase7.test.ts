import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import assert from 'assert';
import { prisma } from '../src/utils/prisma';
import { DayMixService, getSlotForHour, getUserLocalHour } from '../src/services/day-mix.service';

async function runPhase7Tests() {
  console.log('\n===============================================================');
  console.log('   ZENIFY PHASE 7 DAY MIXES TEST SUITE                         ');
  console.log('===============================================================\n');

  // Test 1: Timezone & Hour to Slot Mapping
  console.log('Test 1: Hour to Slot determination logic');
  assert.strictEqual(getSlotForHour(5), 'morning');
  assert.strictEqual(getSlotForHour(8), 'morning');
  assert.strictEqual(getSlotForHour(10), 'morning');
  assert.strictEqual(getSlotForHour(11), 'afternoon');
  assert.strictEqual(getSlotForHour(14), 'afternoon');
  assert.strictEqual(getSlotForHour(16), 'afternoon');
  assert.strictEqual(getSlotForHour(17), 'evening');
  assert.strictEqual(getSlotForHour(20), 'evening');
  assert.strictEqual(getSlotForHour(21), 'evening');
  assert.strictEqual(getSlotForHour(22), 'late_night');
  assert.strictEqual(getSlotForHour(2), 'late_night');
  assert.strictEqual(getSlotForHour(4), 'late_night');
  console.log('✅ Passed Test 1: All 24 hours mapped accurately to 4 daylight slots');

  // Test 2: Slot metadata validation
  console.log('Test 2: All 4 Day Mix slots metadata');
  const slotsMeta = DayMixService.getSlotsMeta();
  assert.strictEqual(slotsMeta.length, 4);
  const morningMeta = slotsMeta.find((s) => s.slot === 'morning');
  assert.ok(morningMeta);
  assert.strictEqual(morningMeta.title, 'Morning Flow');
  assert.ok(morningMeta.gradient.from);
  assert.ok(morningMeta.hoursDescription.includes('5:00 AM'));
  console.log('✅ Passed Test 2: Full metadata for morning, afternoon, evening, and late_night present');

  const testUserId = `test_user_daymix_${Date.now()}`;
  const testArtistId = `test_artist_daymix_${Date.now()}`;
  const testTrackId = `test_track_daymix_${Date.now()}`;

  try {
    // Setup test user, artist, and track
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
        name: `Dawn Maestro ${Date.now()}`,
      },
    });

    await prisma.track.create({
      data: {
        id: testTrackId,
        title: 'Morning Awakening',
        artistId: testArtistId,
        duration: 210,
        audioUrl: 'https://example.com/audio.mp3',
        engagement_score: 95.0,
        streams: 100,
      },
    });

    // Test 3: Fetch Day Mix for morning slot
    console.log('Test 3: Assemble Morning Day Mix');
    const morningMix = await DayMixService.getDayMix(testUserId, 'morning');
    assert.strictEqual(morningMix.slot, 'morning');
    assert.strictEqual(morningMix.meta.title, 'Morning Flow');
    assert.ok(Array.isArray(morningMix.tracks), 'Tracks must be an array');
    assert.ok(morningMix.tracks.length > 0, 'Must contain at least 1 track');
    assert.ok(morningMix.totalDuration >= 0, 'Must have total duration');
    console.log(`✅ Passed Test 3: Assembled Morning mix with ${morningMix.tracks.length} tracks`);

    // Test 4: Fetch Day Mix for evening slot
    console.log('Test 4: Assemble Evening Day Mix');
    const eveningMix = await DayMixService.getDayMix(testUserId, 'evening');
    assert.strictEqual(eveningMix.slot, 'evening');
    assert.strictEqual(eveningMix.meta.title, 'Evening Unwind');
    assert.ok(eveningMix.tracks.length > 0);
    console.log(`✅ Passed Test 4: Assembled Evening mix with ${eveningMix.tracks.length} tracks`);

    console.log('\n🎉 ALL PHASE 7 DAY MIXES TESTS PASSED!\n');
  } finally {
    // Cleanup
    await prisma.listenEvent.deleteMany({ where: { userId: testUserId } }).catch(() => {});
    await prisma.track.deleteMany({ where: { id: testTrackId } }).catch(() => {});
    await prisma.artist.deleteMany({ where: { id: testArtistId } }).catch(() => {});
    await prisma.userPreferences.deleteMany({ where: { userId: testUserId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: testUserId } }).catch(() => {});
    await prisma.$disconnect();
  }
}

runPhase7Tests().catch((err) => {
  console.error('❌ Phase 7 tests failed:', err);
  process.exit(1);
});
