import { prisma } from '../src/utils/prisma';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`✅ Passed: ${msg}`);
    passed++;
  } else {
    console.error(`❌ FAILED: ${msg}`);
    failed++;
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('   ZENIFY LYRICS PIPELINE: PHASE 5 DATA & API TESTS            ');
  console.log('===============================================================\n');

  const testTrackId = 'test-track-' + Date.now();

  // Test 1: Additive Prisma Models (Lyrics & LyricsAttempt)
  const attempt = await prisma.lyricsAttempt.create({
    data: {
      trackId: testTrackId,
      provider: 'lrc.red',
      outcome: 'success',
      ms: 650
    }
  });
  assert(attempt.id !== null, 'LyricsAttempt created in PostgreSQL database');

  // Test 2: Create cached Lyrics document
  const sampleLines = [
    { startMs: 1000, endMs: 3000, text: 'First line', words: [{ startMs: 1000, endMs: 2000, text: 'First' }, { startMs: 2000, endMs: 3000, text: 'line' }] },
    { startMs: 3500, endMs: 6000, text: 'Second line' }
  ];

  const lyricsDoc = await prisma.lyrics.create({
    data: {
      trackId: testTrackId,
      syncLevel: 'word',
      provider: 'lrc.red',
      providerRef: 'USUG11901472',
      language: 'en',
      instrumental: false,
      aiGenerated: false,
      aiSynced: false,
      contentJson: { lines: sampleLines } as any,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  });

  assert(lyricsDoc.id !== null, 'Lyrics document saved with word sync and provider metadata');
  assert(lyricsDoc.syncLevel === 'word', 'Sync level correctly stored');

  // Test 3: Retrieve cached document
  const retrieved = await prisma.lyrics.findUnique({
    where: { trackId: testTrackId }
  });
  assert(retrieved !== null && (retrieved.contentJson as any)?.lines.length === 2, 'Retrieved cached lyrics document with 2 lines');

  // Test 4: Upsert updates existing cache cleanly
  const updated = await prisma.lyrics.upsert({
    where: { trackId: testTrackId },
    create: {
      trackId: testTrackId,
      syncLevel: 'word',
      provider: 'lrclib',
      contentJson: { lines: sampleLines } as any
    },
    update: {
      provider: 'lrclib'
    }
  });
  assert(updated.provider === 'lrclib', 'Upsert updated provider to lrclib');

  // Test 5: Purge track (takedown)
  const deleted = await prisma.lyrics.deleteMany({
    where: { trackId: testTrackId }
  });
  assert(deleted.count === 1, 'Lyrics record purged via takedown call');

  const afterPurge = await prisma.lyrics.findUnique({
    where: { trackId: testTrackId }
  });
  assert(afterPurge === null, 'Track confirmed removed from cache after purge');

  // Clean up attempt
  await prisma.lyricsAttempt.deleteMany({
    where: { trackId: testTrackId }
  });

  console.log(`\n===============================================================`);
  console.log(`   PHASE 5 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`===============================================================`);

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});

