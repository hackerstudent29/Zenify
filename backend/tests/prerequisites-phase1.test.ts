import assert from 'node:assert';
import { prisma } from '../src/utils/prisma.js';
import { AffinityDecayService } from '../src/services/affinity-decay.service.js';
import { PersonalizationEngineService } from '../src/services/personalization-engine.service.js';

async function runPhase1TestSuite() {
  console.log('\n===============================================================');
  console.log('   ZENIFY PHASE 1 PREREQUISITES & DATA IDENTITY TEST SUITE     ');
  console.log('===============================================================\n');

  let passed = 0;
  const total = 6;

  // Test IDs (random UUIDs for isolation)
  const testUserId1 = `test_user_phase1_${Date.now()}_1`;
  const testUserId2 = `test_user_phase1_${Date.now()}_2`;
  const testArtistId = `test_artist_phase1_${Date.now()}`;
  const testTrackId = `test_track_${Date.now()}`;

  try {
    // Setup test users, artist & track
    await prisma.user.createMany({
      data: [
        {
          id: testUserId1,
          email: `${testUserId1}@zenify.test`,
          timezone: 'Asia/Kolkata',
          role: 'LISTENER',
        },
        {
          id: testUserId2,
          email: `${testUserId2}@zenify.test`,
          timezone: 'America/New_York',
          role: 'LISTENER',
        },
      ],
    });

    await prisma.artist.create({
      data: {
        id: testArtistId,
        name: `Test Maestro ${Date.now()}`,
      },
    });

    await prisma.track.create({
      data: {
        id: testTrackId,
        title: 'Phase 1 Test Symphony',
        audioUrl: 'https://example.com/audio.mp3',
        duration: 210,
        language: 'tamil',
        artistId: testArtistId,
      },
    });

    // --------------------------------------------------------------------------
    // TEST 1: ListenEvent Ingestion & Deduplication by clientEventId
    // --------------------------------------------------------------------------
    console.log('Testing: ListenEvent Ingestion & clientEventId Deduplication...');
    const clientEvtId = `evt_dedup_${Date.now()}`;
    const event1 = await PersonalizationEngineService.recordListenEvent({
      clientEventId: clientEvtId,
      userId: testUserId1,
      trackId: testTrackId,
      artistIds: [testArtistId],
      language: 'tamil',
      msPlayed: 45000,
      durationMs: 210000,
      completed: false,
      skipped: false,
      hour: 14,
    });

    assert(event1 !== null, 'Listen event 1 should be recorded');
    assert.strictEqual(event1.clientEventId, clientEvtId);
    assert.strictEqual(event1.hour, 14);

    // Duplicate submission with same clientEventId
    const event2 = await PersonalizationEngineService.recordListenEvent({
      clientEventId: clientEvtId,
      userId: testUserId1,
      trackId: testTrackId,
      msPlayed: 45000,
      durationMs: 210000,
      completed: false,
    });

    assert(event2 !== null, 'Duplicate call should return existing event');
    assert.strictEqual(event2.id, event1.id, 'Duplicate clientEventId must return exact same event ID without creating duplicate row');

    const countInDb = await prisma.listenEvent.count({
      where: { clientEventId: clientEvtId },
    });
    assert.strictEqual(countInDb, 1, 'Only 1 row must exist for clientEventId');

    console.log('✅ Test 1 Passed: ListenEvent ingested with clientEventId and duplicate submissions safely deduplicated.');
    passed++;

    // --------------------------------------------------------------------------
    // TEST 2: Exponential Decay Mathematics & Half-Life Verification
    // --------------------------------------------------------------------------
    console.log('\nTesting: Exponential Decay Mathematical Half-Life Formula...');
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const initialScore = 10.0;

    const decayedScore30d = AffinityDecayService.calculateDecayedScore(initialScore, thirtyDaysAgo, now);
    // After exactly 30 days with a 30-day half-life, score must be initialScore * 0.5 = 5.0
    const diff = Math.abs(decayedScore30d - 5.0);
    assert(diff < 0.01, `Decayed score after 30 days should be ~5.0, got ${decayedScore30d}`);

    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const decayedScore60d = AffinityDecayService.calculateDecayedScore(initialScore, sixtyDaysAgo, now);
    // After 60 days (2 half-lives), score must be 10.0 * 0.25 = 2.5
    assert(Math.abs(decayedScore60d - 2.5) < 0.01, `Decayed score after 60 days should be ~2.5, got ${decayedScore60d}`);

    console.log(`✅ Test 2 Passed: Exponential decay precisely adheres to 30-day half-life ($S(30d) = ${decayedScore30d}, $S(60d) = ${decayedScore60d}).`);
    passed++;

    // --------------------------------------------------------------------------
    // TEST 3: UserAffinity Table Incremental Upsert
    // --------------------------------------------------------------------------
    console.log('\nTesting: UserAffinity Table Incremental Score Tracking...');
    // Clear user1 affinities before testing incremental accumulation
    await AffinityDecayService.clearAffinities(testUserId1);

    const freshArtistId = `artist_harris_${Date.now()}`;
    // Completed song: +1.0
    await AffinityDecayService.recordAffinityDelta(testUserId1, 'artist', freshArtistId, 1.0, now);
    let topAff = await AffinityDecayService.getTopAffinities(testUserId1, 'artist');
    assert.strictEqual(topAff.length, 1);
    assert.strictEqual(topAff[0].key, freshArtistId);
    assert.strictEqual(topAff[0].score, 1.0);

    // Repeated listen / Like: +3.0
    await AffinityDecayService.recordAffinityDelta(testUserId1, 'artist', freshArtistId, 3.0, now);
    topAff = await AffinityDecayService.getTopAffinities(testUserId1, 'artist');
    assert.strictEqual(topAff[0].score, 4.0, 'Score should accumulate to 4.0');

    // Language affinity
    await AffinityDecayService.recordAffinityDelta(testUserId1, 'language', 'tamil', 1.0, now);
    const topLang = await AffinityDecayService.getTopAffinities(testUserId1, 'language');
    assert.strictEqual(topLang[0].key, 'tamil');
    assert.strictEqual(topLang[0].score, 1.0);

    console.log('✅ Test 3 Passed: UserAffinity incremental updates, category separation, and retrieval work as expected.');
    passed++;

    // --------------------------------------------------------------------------
    // TEST 4: User Profile Timezone Storage
    // --------------------------------------------------------------------------
    console.log('\nTesting: User Profile Timezone Storage...');
    const user1 = await prisma.user.findUnique({
      where: { id: testUserId1 },
      select: { timezone: true },
    });
    assert.strictEqual(user1?.timezone, 'Asia/Kolkata');

    // Update timezone
    await prisma.user.update({
      where: { id: testUserId1 },
      data: { timezone: 'Europe/London' },
    });
    const updatedUser1 = await prisma.user.findUnique({
      where: { id: testUserId1 },
      select: { timezone: true },
    });
    assert.strictEqual(updatedUser1?.timezone, 'Europe/London');

    console.log('✅ Test 4 Passed: User IANA timezone correctly persisted and updated on profile.');
    passed++;

    // --------------------------------------------------------------------------
    // TEST 5: Privacy Control - Clear Listening History & Affinity Purge
    // --------------------------------------------------------------------------
    console.log('\nTesting: Privacy Control - Clear Listening History...');
    // Seed user2 with data
    await AffinityDecayService.recordAffinityDelta(testUserId2, 'artist', 'artist_user2_test', 5.0, now);
    await prisma.listenEvent.create({
      data: {
        userId: testUserId2,
        trackId: testTrackId,
        msPlayed: 120000,
        durationMs: 210000,
      },
    });

    // Clear history for user1 only
    const clearResult = await PersonalizationEngineService.clearListeningHistory(testUserId1);
    assert.strictEqual(clearResult.success, true);

    const user1Events = await prisma.listenEvent.count({ where: { userId: testUserId1 } });
    const user1Affinities = await prisma.userAffinity.count({ where: { userId: testUserId1 } });
    assert.strictEqual(user1Events, 0, 'User 1 listen events must be completely deleted');
    assert.strictEqual(user1Affinities, 0, 'User 1 affinities must be completely deleted');

    // Verify User 2 data remains untouched (strict tenant isolation)
    const user2Events = await prisma.listenEvent.count({ where: { userId: testUserId2 } });
    const user2Affinities = await prisma.userAffinity.count({ where: { userId: testUserId2 } });
    assert.strictEqual(user2Events, 1, 'User 2 listen events must remain untouched');
    assert.strictEqual(user2Affinities, 1, 'User 2 affinities must remain untouched');

    console.log('✅ Test 5 Passed: Clear listening history permanently wipes listen events and affinities with strict user isolation.');
    passed++;

    // --------------------------------------------------------------------------
    // TEST 6: Privacy Control - Turn Off Personalization
    // --------------------------------------------------------------------------
    console.log('\nTesting: Privacy Control - Turn Off Personalization...');
    await PersonalizationEngineService.setPersonalizationEnabled(testUserId2, false);

    const prefs = await prisma.userPreferences.findUnique({
      where: { userId: testUserId2 },
      select: { personalizationEnabled: true },
    });
    assert.strictEqual(prefs?.personalizationEnabled, false, 'Personalization should be turned off in preferences');

    // Attempting to apply affinities when personalization is turned off must be a no-op
    const user2AffBefore = await AffinityDecayService.getTopAffinities(testUserId2, 'artist');
    await AffinityDecayService.applyListenEventAffinities({
      userId: testUserId2,
      artistIds: ['artist_forbidden'],
      completed: true,
    });
    const user2AffAfter = await AffinityDecayService.getTopAffinities(testUserId2, 'artist');
    assert.strictEqual(user2AffBefore.length, user2AffAfter.length, 'No new affinity should be learned when personalization is disabled');

    console.log('✅ Test 6 Passed: Personalization toggle completely halts affinity learning.');
    passed++;

  } finally {
    // Cleanup test fixtures
    await prisma.listenEvent.deleteMany({
      where: { userId: { in: [testUserId1, testUserId2] } },
    }).catch(() => {});
    await prisma.userAffinity.deleteMany({
      where: { userId: { in: [testUserId1, testUserId2] } },
    }).catch(() => {});
    await prisma.history.deleteMany({
      where: { userId: { in: [testUserId1, testUserId2] } },
    }).catch(() => {});
    await prisma.userPreferences.deleteMany({
      where: { userId: { in: [testUserId1, testUserId2] } },
    }).catch(() => {});
    await prisma.track.deleteMany({
      where: { id: testTrackId },
    }).catch(() => {});
    await prisma.artist.deleteMany({
      where: { id: testArtistId },
    }).catch(() => {});
    await prisma.user.deleteMany({
      where: { id: { in: [testUserId1, testUserId2] } },
    }).catch(() => {});
  }

  console.log('\n===============================================================');
  console.log(`   TEST RESULTS: ${passed}/${total} TESTS PASSED               `);
  console.log('===============================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runPhase1TestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
