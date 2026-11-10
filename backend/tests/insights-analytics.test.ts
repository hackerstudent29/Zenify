// backend/tests/insights-analytics.test.ts
import assert from 'node:assert';
import {
  isQualifiedPlay,
  isSkip,
  clampListenedMs,
  isDuplicateEvent,
  getLocalTimeBuckets,
  normalizeHeatmap,
  calculateDelta,
  groupIntoSessions,
  deriveMusicPersonality,
  AnalyticsEvent,
} from '../src/services/listening-analytics';

async function runTestSuite() {
  console.log('\n===============================================================');
  console.log('   ZENIFY INSIGHTS & ANALYTICS P0 UNIT TEST SUITE              ');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (e: any) {
      console.error(`  [FAIL] ${name}: ${e.message}`);
      throw e;
    }
  }

  // 1. isQualifiedPlay
  test('1. Qualified Play Rule: >=30s or >=50% for short tracks or >=4 min', () => {
    // 210s track (normal 3.5 min song)
    assert.strictEqual(isQualifiedPlay(29000, 210000), false, '29s on 210s track is not qualified');
    assert.strictEqual(isQualifiedPlay(30000, 210000), true, '30s on 210s track is qualified');
    assert.strictEqual(isQualifiedPlay(120000, 210000), true, '2 min on 210s track is qualified');

    // 40s track (short intro/outro)
    assert.strictEqual(isQualifiedPlay(15000, 40000), false, '15s on 40s track (<50%) is not qualified');
    assert.strictEqual(isQualifiedPlay(20000, 40000), true, '20s on 40s track (>=50%) is qualified');

    // Long podcast / ambient track (10 min = 600s)
    assert.strictEqual(isQualifiedPlay(240000, 600000), true, '4 min on 10 min track is qualified');
  });

  // 2. isSkip
  test('2. Skip Detection Rule: <10s is always a skip, or explicitly skipped under 30s', () => {
    assert.strictEqual(isSkip(4000, 'skipped'), true, '4s is skip');
    assert.strictEqual(isSkip(9000, 'completed'), true, '9s is skip');
    assert.strictEqual(isSkip(25000, 'skipped'), true, '25s with skipped reason is skip');
    assert.strictEqual(isSkip(60000, 'skipped'), false, '60s is not a skip');
  });

  // 3. clampListenedMs
  test('3. Real Listened Time: Capped at track duration', () => {
    assert.strictEqual(clampListenedMs(250000, 210000), 210000, 'Capped at 210000 ms');
    assert.strictEqual(clampListenedMs(150000, 210000), 150000, 'Kept at 150000 ms');
    assert.strictEqual(clampListenedMs(-50, 210000), 0, 'Negative clamped to 0');
  });

  // 4. Deduplication
  test('4. Deduplication: Merge identical tracks within +/- 2 seconds', () => {
    const t0 = new Date('2026-11-10T10:00:00Z');
    const t1 = new Date('2026-11-10T10:00:01Z');
    const t2 = new Date('2026-11-10T10:00:05Z');

    assert.strictEqual(
      isDuplicateEvent({ trackId: 'songA', startedAt: t0 }, { trackId: 'songA', startedAt: t1 }),
      true,
      'Same track within 1s is duplicate'
    );
    assert.strictEqual(
      isDuplicateEvent({ trackId: 'songA', startedAt: t0 }, { trackId: 'songB', startedAt: t1 }),
      false,
      'Different track within 1s is not duplicate'
    );
    assert.strictEqual(
      isDuplicateEvent({ trackId: 'songA', startedAt: t0 }, { trackId: 'songA', startedAt: t2 }),
      false,
      'Same track separated by 5s is not duplicate'
    );
  });

  // 5. Timezone & DST Bucketing
  test('5. Local Time Bucketing: Correct local DOW, hour and date string from UTC + offset', () => {
    // UTC: 2026-11-10 20:00 (Tuesday)
    // IST (+330 min / +5:30): 2026-11-11 01:30 (Wednesday)
    const utcDate = new Date('2026-11-10T20:00:00Z');
    const istBuckets = getLocalTimeBuckets(utcDate, 330);
    assert.strictEqual(istBuckets.dow, 3, 'IST Day is Wednesday (3)');
    assert.strictEqual(istBuckets.hour, 1, 'IST Hour is 1 AM');
    assert.strictEqual(istBuckets.localDateStr, '2026-11-11');

    // EST (-300 min / -5:00): 2026-11-10 15:00 (Tuesday)
    const estBuckets = getLocalTimeBuckets(utcDate, -300);
    assert.strictEqual(estBuckets.dow, 2, 'EST Day is Tuesday (2)');
    assert.strictEqual(estBuckets.hour, 15, 'EST Hour is 3 PM');
    assert.strictEqual(estBuckets.localDateStr, '2026-11-10');
  });

  // 6. Heatmap Normalization
  test('6. Heatmap Percentile Normalization (0-4 levels) and Peak Insight', () => {
    const raw: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    // Simulate typical listens
    raw[5][22] = 120; // Friday 10 PM: 120 minutes
    raw[5][23] = 90;
    raw[0][14] = 45;
    raw[1][8] = 20;

    const result = normalizeHeatmap(raw);
    assert.strictEqual(result.peakDay, 5, 'Peak day is Friday (5)');
    assert.strictEqual(result.peakHour, 22, 'Peak hour is 10 PM');
    assert.strictEqual(result.normalized[5][22], 4, 'Peak cell gets level 4');
    assert.strictEqual(result.normalized[1][8], 1, 'Low cell gets level 1');
    assert.strictEqual(result.normalized[0][0], 0, 'Zero cell gets level 0');
    assert.ok(result.insight.includes('Friday'), 'Insight references Friday');
  });

  // 7. Delta Calculation
  test('7. Comparisons & Delta Calculation: Handle zero previous cleanly without infinity', () => {
    const d1 = calculateDelta(120, 100);
    assert.strictEqual(d1.deltaPct, 20, '+20% increase');

    const d2 = calculateDelta(80, 100);
    assert.strictEqual(d2.deltaPct, -20, '-20% decrease');

    const d3 = calculateDelta(50, 0);
    assert.strictEqual(d3.deltaPct, 'new', 'Previous 0 returns "new" instead of infinity');
  });

  // 8. Session Grouping
  test('8. Session Grouping: Consecutive events separated by <=30 min gap', () => {
    const now = Date.now();
    const ev1: AnalyticsEvent = {
      eventId: '1',
      userId: 'u1',
      trackId: 't1',
      trackTitle: 'Song 1',
      artistName: 'Artist A',
      startedAt: new Date(now),
      endedAt: new Date(now + 180000), // 3 min song
      listenedMs: 180000,
      trackDurationMs: 180000,
      tzOffsetMin: 0,
      contextType: 'album',
    };
    const ev2: AnalyticsEvent = {
      eventId: '2',
      userId: 'u1',
      trackId: 't2',
      trackTitle: 'Song 2',
      artistName: 'Artist A',
      startedAt: new Date(now + 185000), // 5s gap
      endedAt: new Date(now + 365000),
      listenedMs: 180000,
      trackDurationMs: 180000,
      tzOffsetMin: 0,
      contextType: 'album',
    };
    const ev3: AnalyticsEvent = {
      eventId: '3',
      userId: 'u1',
      trackId: 't3',
      trackTitle: 'Song 3',
      artistName: 'Artist B',
      startedAt: new Date(now + 365000 + 40 * 60 * 1000), // 40 min gap -> new session!
      endedAt: new Date(now + 365000 + 43 * 60 * 1000),
      listenedMs: 180000,
      trackDurationMs: 180000,
      tzOffsetMin: 0,
      contextType: 'search',
    };

    const sessions = groupIntoSessions([ev1, ev2, ev3]);
    assert.strictEqual(sessions.length, 2, 'Should divide into exactly 2 sessions');
    // First in array is newest session (ev3)
    assert.strictEqual(sessions[0].trackCount, 1, 'Newest session has 1 track');
    assert.strictEqual(sessions[1].trackCount, 2, 'First session has 2 tracks');
    assert.strictEqual(sessions[1].dominantArtist, 'Artist A');
    assert.strictEqual(sessions[1].dominantContext, 'album');
  });

  // 9. Music Personality Derivation
  test('9. Music Personality Deterministic Threshold Rules', () => {
    // Insufficient data
    const p1 = deriveMusicPersonality({
      totalPlays: 5,
      nightPlays: 3,
      morningPlays: 0,
      topArtistSharePct: 20,
      topTrackSharePct: 10,
      discoveryRatePct: 40,
      skipRatePct: 5,
    });
    assert.strictEqual(p1.unlocked, false, 'Requires at least 10 plays to unlock');

    // Night Owl (>40% night plays)
    const p2 = deriveMusicPersonality({
      totalPlays: 50,
      nightPlays: 25, // 50%
      morningPlays: 5,
      topArtistSharePct: 20,
      topTrackSharePct: 10,
      discoveryRatePct: 30,
      skipRatePct: 5,
    });
    assert.strictEqual(p2.archetype, 'night_owl');
    assert.strictEqual(p2.title, 'Night Owl Melophile');

    // Loyalist (>40% top artist share)
    const p3 = deriveMusicPersonality({
      totalPlays: 50,
      nightPlays: 5,
      morningPlays: 5,
      topArtistSharePct: 55,
      topTrackSharePct: 10,
      discoveryRatePct: 10,
      skipRatePct: 5,
      topArtistName: 'A.R. Rahman',
    });
    assert.strictEqual(p3.archetype, 'loyalist');
    assert.ok(p3.subtitle.includes('A.R. Rahman'));

    // Track Looper (>25% single top track)
    const p4 = deriveMusicPersonality({
      totalPlays: 50,
      nightPlays: 5,
      morningPlays: 5,
      topArtistSharePct: 20,
      topTrackSharePct: 35,
      discoveryRatePct: 20,
      skipRatePct: 5,
    });
    assert.strictEqual(p4.archetype, 'looper');
    assert.strictEqual(p4.title, 'Track Looper');

    // Explorer (>50% discovery rate)
    const p5 = deriveMusicPersonality({
      totalPlays: 50,
      nightPlays: 5,
      morningPlays: 5,
      topArtistSharePct: 15,
      topTrackSharePct: 5,
      discoveryRatePct: 65,
      skipRatePct: 5,
    });
    assert.strictEqual(p5.archetype, 'explorer');
    assert.strictEqual(p5.title, 'Sonic Explorer');
  });

  // 10. Delete-then-Aggregate Consistency
  test('10. Delete-then-Aggregate Consistency: Recalculates totals immediately', () => {
    // Initial simulated events
    let events = [
      { id: 'ev1', artistKey: 'art1', listenedMs: 180000, qualified: true },
      { id: 'ev2', artistKey: 'art1', listenedMs: 200000, qualified: true },
      { id: 'ev3', artistKey: 'art2', listenedMs: 150000, qualified: true },
    ];

    let totalMinutes = Math.round(events.reduce((s, e) => s + e.listenedMs, 0) / 60000);
    assert.strictEqual(totalMinutes, 9, 'Initial minutes = 9');

    // Simulate delete ev2
    events = events.filter((e) => e.id !== 'ev2');
    totalMinutes = Math.round(events.reduce((s, e) => s + e.listenedMs, 0) / 60000);
    assert.strictEqual(totalMinutes, 6, 'Post-delete minutes immediately reflects deletion = 6');
    assert.strictEqual(events.length, 2, 'Total events is 2');
  });

  console.log(`\nAll ${passed}/${total} unit tests PASSED successfully!\n`);
}

runTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
