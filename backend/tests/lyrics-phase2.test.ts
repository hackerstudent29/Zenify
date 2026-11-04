import { MatchingGuard } from '../src/lyrics/matching-guard';
import { LyricsDoc } from '../src/lyrics/types';

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
  console.log('   ZENIFY LYRICS PIPELINE: PHASE 2 MATCHING GUARD TESTS        ');
  console.log('===============================================================\n');

  // Test 1: Title & Artist Normalization
  const rawTitle = 'Kesariya (From "Brahmastra") - Remastered 2022 (feat. Pritam)';
  const normTitle = MatchingGuard.normalizeTitle(rawTitle);
  assert(normTitle === 'kesariya', `Title normalized to "kesariya" (got "${normTitle}")`);

  const rawArtist = 'Arijit Singh, Pritam & Amitabh Bhattacharya';
  const normArtist = MatchingGuard.normalizeArtist(rawArtist);
  assert(normArtist === 'arijit singh', `Artist normalized to primary "arijit singh" (got "${normArtist}")`);

  // Test 2: Direct ISRC Matching
  const query = {
    title: 'Cruel Summer',
    artist: 'Taylor Swift',
    duration: 178,
    isrc: 'USUG11901472'
  };
  const candIsrcMatch = {
    title: 'Cruel Summer',
    artist: 'Taylor Swift',
    duration: 178,
    isrc: 'usug11901472' // case-insensitive check
  };
  const scoreIsrc = MatchingGuard.scoreCandidate(query, candIsrcMatch);
  assert(scoreIsrc === 10000, `Direct ISRC match achieved score 10000 (got ${scoreIsrc})`);

  // Test 3: Version mismatch rejection (Remix / Acoustic / Live)
  const candRemix = {
    title: 'Cruel Summer (LP Giobbi Remix)',
    artist: 'Taylor Swift',
    duration: 178
  };
  const scoreRemix = MatchingGuard.scoreCandidate(query, candRemix);
  assert(scoreRemix < 0, `Remix candidate rejected when query is original (score: ${scoreRemix})`);

  const candLive = {
    title: 'Cruel Summer (Live from The Eras Tour)',
    artist: 'Taylor Swift',
    duration: 178
  };
  const scoreLive = MatchingGuard.scoreCandidate(query, candLive);
  assert(scoreLive < 0, `Live candidate rejected when query is original (score: ${scoreLive})`);

  // Test 4: Duration drift rejection (> 3s)
  const candDurationDrift = {
    title: 'Cruel Summer',
    artist: 'Taylor Swift',
    duration: 195 // 17s drift > 3s limit
  };
  const scoreDrift = MatchingGuard.scoreCandidate(query, candDurationDrift, 3);
  assert(scoreDrift < 0, `Candidate rejected for 17s duration drift (score: ${scoreDrift})`);

  // Test 5: Pick best candidate from multiple candidates
  const candidates = [
    { title: 'Cruel Summer (Instrumental)', artist: 'Taylor Swift', duration: 178 }, // rejected (instrumental)
    { title: 'Cruel Summer', artist: 'Taylor Swift', duration: 184 }, // rejected (> 3s diff)
    { title: 'Cruel Summer (Slowed)', artist: 'Taylor Swift', duration: 178, byModel: true }, // rejected (slowed)
    { title: 'Cruel Summer', artist: 'Taylor Swift', album: 'Lover', duration: 178, byModel: false } // PERFECT MATCH
  ];
  const best = MatchingGuard.pickBestCandidate(query, candidates, 3);
  assert(best !== null, 'Candidate selected');
  assert(best?.byModel === false && best?.album === 'Lover', 'Best exact candidate chosen');

  // Test 6: Human Word Sync vs AI Word Sync Preference
  const aiDoc: LyricsDoc = {
    syncLevel: 'ai-word',
    instrumental: false,
    aiGenerated: false,
    aiSynced: true, // byModel
    providerId: 'lrc.red',
    lines: [{ startMs: 0, endMs: 3000, text: 'Hello' }]
  };
  const humanDoc: LyricsDoc = {
    syncLevel: 'word',
    instrumental: false,
    aiGenerated: false,
    aiSynced: false, // human sync
    providerId: 'lrclib',
    lines: [{ startMs: 0, endMs: 3000, text: 'Hello' }]
  };

  const chosen = MatchingGuard.resolveSyncPreference(aiDoc, humanDoc);
  assert(chosen.providerId === 'lrclib' && chosen.aiSynced === false, 'Prefer human word sync over AI word sync');

  console.log(`\n===============================================================`);
  console.log(`   PHASE 2 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`===============================================================`);

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});

