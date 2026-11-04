import { TtmlParser } from '../src/lyrics/parsers/ttml.parser';
import { EnhancedLrcParser } from '../src/lyrics/parsers/enhanced-lrc.parser';
import { PlainLrcParser } from '../src/lyrics/parsers/plain-lrc.parser';
import { LyricsfileParser } from '../src/lyrics/parsers/lyricsfile.parser';
import { PlainTextParser } from '../src/lyrics/parsers/plain-text.parser';
import { LyricsValidator } from '../src/lyrics/validator';
import { MatchingGuard } from '../src/lyrics/matching-guard';
import { LyricsOrchestrator } from '../src/lyrics/orchestrator';
import { DeepgramEngine } from '../src/lyrics/deepgram-engine';
import { LyricsDoc, LyricsProvider, TrackMetadataQuery } from '../src/lyrics/types';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, msg: string) {
  totalTests++;
  if (condition) {
    console.log(`✅ Passed: ${msg}`);
    passedTests++;
  } else {
    console.error(`❌ FAILED: ${msg}`);
    failedTests++;
  }
}

class MockLyricsProvider implements LyricsProvider {
  constructor(
    public id: string,
    public tier: 'W' | 'L' | 'P' | 'A',
    public mockResponse: LyricsDoc | null,
    public shouldFail: boolean = false
  ) {}

  public callCount = 0;

  supports(_track: TrackMetadataQuery): boolean {
    return true;
  }

  async fetch(_query: TrackMetadataQuery, _signal?: AbortSignal): Promise<LyricsDoc | null> {
    this.callCount++;
    if (this.shouldFail) throw new Error(`Provider ${this.id} error`);
    return this.mockResponse;
  }
}

async function runFullSuite() {
  console.log('========================================================================');
  console.log('   ZENIFY MULTI-PROVIDER LYRICS PIPELINE: PHASE 7 FULL TEST SUITE      ');
  console.log('========================================================================\n');

  /* ------------------------------------------------------------------ */
  /*  SUITE 1: PARSER FIXTURES & SECURITY                               */
  /* ------------------------------------------------------------------ */
  console.log('▶ Running Suite 1: Parser Fixtures & Security...');

  // 1.1 TTML with syllables & background vocals
  const ttmlFixture = `<?xml version="1.0" encoding="utf-8"?>
<tt lrc:byModel="true" xmlns="http://www.w3.org/ns/ttml" xmlns:lrc="http://lrc.red/lyric-ttml-internal" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
  <body>
    <div>
      <p begin="00:02.00" end="00:05.00" ttm:agent="Taylor">
        <span begin="00:02.00" end="00:03.00">Cruel</span>
        <span begin="00:03.00" end="00:04.50">Summer</span>
      </p>
      <p begin="00:05.50" end="00:08.00" ttm:role="background">
        <span begin="00:05.50" end="00:07.50">(Yeah)</span>
      </p>
    </div>
  </body>
</tt>`;
  const docTtml = TtmlParser.parse(ttmlFixture, 'lrc.red');
  assert(docTtml !== null, 'TTML fixture parsed');
  assert(docTtml?.lines[0].agent === 'Taylor', 'Agent parsed from TTML');
  assert(docTtml?.lines[1].isBackground === true, 'Background role parsed from TTML');
  assert(docTtml?.aiSynced === true, 'byModel detected in TTML root');

  // 1.2 Malicious XML entity injection (XXE safe)
  const maliciousXml = `<?xml version="1.0"?>
<!DOCTYPE root [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<tt><p begin="00:01.00">&xxe;</p></tt>`;
  const docMalicious = TtmlParser.parse(maliciousXml, 'lrc.red');
  // XML parser must safely ignore/not expand external entities
  assert(docMalicious === null || !docMalicious.lines[0]?.text.includes('root:'), 'XXE external entity injection prevented');

  // 1.3 Enhanced LRC with out-of-order word stamps & offset
  const outOfOrderLrc = `[offset:200]
[00:01.00]<00:02.00>out <00:01.00>of <00:03.00>order`;
  const docOutOfOrder = EnhancedLrcParser.parse(outOfOrderLrc, 'lrc.red');
  assert(docOutOfOrder !== null, 'Enhanced LRC with out-of-order word stamps parsed');
  // Validator checks word order
  const valOutOfOrder = LyricsValidator.validate(docOutOfOrder, 30);
  assert(valOutOfOrder.valid === false, 'Validator caught and rejected out-of-order word timestamps');

  // 1.4 YAML lyricsfile with nested words
  const yamlFixture = `version: '1.0'
metadata:
  title: Kesariya
  duration_ms: 268000
lines:
  - text: Kesariya tera ishq hai
    start_ms: 2000
    end_ms: 5000
    words:
      - text: Kesariya
        start_ms: 2000
        end_ms: 3000
      - text: tera
        start_ms: 3000
        end_ms: 3500`;
  const docYaml = LyricsfileParser.parse(yamlFixture, 'lrclib');
  assert(docYaml !== null && docYaml.lines[0].words?.length === 2, 'Lyricsfile YAML parsed with nested words');

  /* ------------------------------------------------------------------ */
  /*  SUITE 2: MATCHING GUARD TESTS                                     */
  /* ------------------------------------------------------------------ */
  console.log('\n▶ Running Suite 2: Matching Guard (Anti-Collision)...');

  const q = { title: 'Arabic Kuthu', artist: 'Anirudh Ravichander', duration: 279, isrc: 'INA632200101' };

  // 2.1 Direct ISRC match
  assert(MatchingGuard.scoreCandidate(q, { title: 'Arabic Kuthu', artist: 'Anirudh Ravichander', isrc: 'ina632200101' }) === 10000, 'Direct ISRC gives 10,000 score');

  // 2.2 Reject Remix when query is studio original
  assert(MatchingGuard.scoreCandidate(q, { title: 'Arabic Kuthu (Club Remix)', artist: 'Anirudh Ravichander', duration: 279 }) < 0, 'Club Remix rejected for original song query');

  // 2.3 Reject Live version when query is studio original
  assert(MatchingGuard.scoreCandidate(q, { title: 'Arabic Kuthu (Live in London)', artist: 'Anirudh Ravichander', duration: 279 }) < 0, 'Live version rejected for original song query');

  // 2.4 Reject duration drift > 3s
  assert(MatchingGuard.scoreCandidate(q, { title: 'Arabic Kuthu', artist: 'Anirudh Ravichander', duration: 290 }, 3) < 0, '11s duration drift rejected');

  // 2.5 Title normalization strips (From ...) and [Remastered]
  const normT = MatchingGuard.normalizeTitle('Arabic Kuthu (From "Beast") - Remastered 2024');
  assert(normT === 'arabic kuthu', `Title cleanly normalized to "arabic kuthu" (got "${normT}")`);

  /* ------------------------------------------------------------------ */
  /*  SUITE 3: ORCHESTRATOR & WATERFALL                                 */
  /* ------------------------------------------------------------------ */
  console.log('\n▶ Running Suite 3: Orchestrator Waterfall & Resilience...');

  LyricsOrchestrator.clearProviders();

  const mockW1 = new MockLyricsProvider('mock-w1', 'W', null); // W fails
  const mockL1 = new MockLyricsProvider('mock-l1', 'L', {
    syncLevel: 'line',
    instrumental: false,
    aiGenerated: false,
    aiSynced: false,
    providerId: 'mock-l1',
    lines: [{ startMs: 1000, endMs: 4000, text: 'Line sync' }]
  });
  LyricsOrchestrator.registerProvider(mockW1);
  LyricsOrchestrator.registerProvider(mockL1);

  // 3.1 Waterfall W fails -> L succeeds
  const resWaterfall = await LyricsOrchestrator.resolveLyrics({ title: 'Song', artist: 'Artist', duration: 180 });
  assert(resWaterfall.doc?.syncLevel === 'line' && resWaterfall.doc?.providerId === 'mock-l1', 'Waterfall correctly progressed from W failure to L success');

  // 3.2 All W, L, P fail -> Needs Tier A
  LyricsOrchestrator.clearProviders();
  const mockFailW = new MockLyricsProvider('fail-w', 'W', null);
  LyricsOrchestrator.registerProvider(mockFailW);
  const resNeedA = await LyricsOrchestrator.resolveLyrics({ title: 'Obscure Vocal Track', artist: 'Indie Artist', duration: 180 });
  assert(resNeedA.doc === null && resNeedA.needsTierA === true, 'All fail flags needsTierA: true for vocal track');

  // 3.3 Instrumental track never flags Tier A
  const resInst = await LyricsOrchestrator.resolveLyrics({ title: 'Sonata in C Minor (Instrumental)', artist: 'Mozart', duration: 240 });
  assert(resInst.needsTierA === false, 'Instrumental track never flags Tier A');

  // 3.4 In-flight deduplication
  LyricsOrchestrator.clearProviders();
  let calls = 0;
  const dedupProvider = new MockLyricsProvider('dedup-p', 'W', null);
  dedupProvider.fetch = async () => {
    calls++;
    await new Promise(r => setTimeout(r, 60));
    return {
      syncLevel: 'word',
      instrumental: false,
      aiGenerated: false,
      aiSynced: false,
      providerId: 'dedup-p',
      lines: [{ startMs: 1000, endMs: 3000, text: 'Deduped' }]
    };
  };
  LyricsOrchestrator.registerProvider(dedupProvider);

  const dedupeResults = await Promise.all([
    LyricsOrchestrator.resolveLyrics({ title: 'Trending', artist: 'Artist', duration: 180 }),
    LyricsOrchestrator.resolveLyrics({ title: 'Trending', artist: 'Artist', duration: 180 }),
    LyricsOrchestrator.resolveLyrics({ title: 'Trending', artist: 'Artist', duration: 180 })
  ]);
  assert(dedupeResults.every(r => r.doc !== null), 'All concurrent callers received valid response');
  assert(calls === 1, `In-flight deduplication consolidated 3 calls into exactly 1 provider execution (got ${calls})`);

  // 3.5 Circuit breaker
  LyricsOrchestrator.clearProviders();
  for (let i = 0; i < 5; i++) {
    LyricsOrchestrator.recordFailure('broken-api');
  }
  assert(LyricsOrchestrator.isCircuitOpen('broken-api') === true, 'Circuit breaker tripped open after 5 failures');

  // 3.6 Prefer Human Word Sync over AI Word Sync
  LyricsOrchestrator.clearProviders();
  const mockAiWord = new MockLyricsProvider('ai-word-p', 'W', {
    syncLevel: 'ai-word',
    instrumental: false,
    aiGenerated: false,
    aiSynced: true, // byModel
    providerId: 'ai-word-p',
    lines: [{ startMs: 1000, endMs: 3000, text: 'Words' }]
  });
  const mockHumanWord = new MockLyricsProvider('human-word-p', 'W', {
    syncLevel: 'word',
    instrumental: false,
    aiGenerated: false,
    aiSynced: false, // human
    providerId: 'human-word-p',
    lines: [{ startMs: 1000, endMs: 3000, text: 'Words' }]
  });
  LyricsOrchestrator.registerProvider(mockAiWord);
  LyricsOrchestrator.registerProvider(mockHumanWord);

  const resHumanPref = await LyricsOrchestrator.resolveLyrics({ title: 'Hit Song', artist: 'Artist', duration: 180 });
  assert(resHumanPref.doc?.providerId === 'human-word-p' && resHumanPref.doc?.aiSynced === false, 'Orchestrator prefers human word sync over AI word sync');

  /* ------------------------------------------------------------------ */
  /*  SUITE 4: DEEPGRAM TIER A ENGINE                                   */
  /* ------------------------------------------------------------------ */
  console.log('\n▶ Running Suite 4: Deepgram Tier A Engine...');

  // 4.1 Unsupported language returns null
  assert(DeepgramEngine.getLanguageConfig('martian-language') === null, 'Unsupported language returns null (no guessing)');

  // 4.2 Group words by pause > 0.8s
  const wordsSample = [
    { word: 'Line', start: 1.0, end: 1.3, confidence: 0.9 },
    { word: 'one', start: 1.4, end: 1.8, confidence: 0.9 },
    // 1.2s pause (> 0.8s)
    { word: 'Line', start: 3.0, end: 3.3, confidence: 0.9 },
    { word: 'two', start: 3.4, end: 3.7, confidence: 0.9 }
  ];
  const grouped = DeepgramEngine.groupWordsIntoLines(wordsSample);
  assert(grouped.length === 2 && grouped[0].text === 'Line one' && grouped[1].text === 'Line two', 'Speech-to-text pause boundary creates clean separate lines');

  // 4.3 Spend tracking
  DeepgramEngine.recordUsage(240); // 4 minutes
  assert(DeepgramEngine.getEstimatedSpend() > 0, 'Deepgram spend estimated and recorded');

  /* ------------------------------------------------------------------ */
  /*  SUITE 5: SHADOW MODE SIMULATION                                   */
  /* ------------------------------------------------------------------ */
  console.log('\n▶ Running Suite 5: Shadow Mode Simulation (LYRICS_V2)...');

  // Verify real providers initialized
  LyricsOrchestrator.initialize();
  const testTracks = [
    { title: 'Cruel Summer', artist: 'Taylor Swift', duration: 178, isrc: 'USUG11901472', lang: 'en' },
    { title: 'Kesariya', artist: 'Arijit Singh', duration: 268, isrc: 'INA632200547', lang: 'hi' },
    { title: 'Arabic Kuthu', artist: 'Anirudh Ravichander', duration: 279, isrc: 'INA632200101', lang: 'ta' }
  ];

  let shadowHits = 0;
  for (const t of testTracks) {
    const r = await LyricsOrchestrator.resolveLyrics(t);
    if (r.doc) {
      shadowHits++;
      console.log(`  Shadow Mode resolved: "${t.title}" -> ${r.doc.syncLevel.toUpperCase()} [Provider: ${r.doc.providerId}, AI: ${r.doc.aiSynced}]`);
    }
  }
  assert(shadowHits >= 2, `Shadow mode resolved ${shadowHits}/${testTracks.length} tracks across diverse languages`);

  /* ------------------------------------------------------------------ */
  /*  FINAL SUMMARY                                                     */
  /* ------------------------------------------------------------------ */
  console.log('\n========================================================================');
  console.log(`   PHASE 7 FINAL SUMMARY: ${passedTests}/${totalTests} PASSED, ${failedTests} FAILED`);
  console.log('========================================================================\n');

  if (failedTests > 0) process.exit(1);
}

runFullSuite().catch(err => {
  console.error(err);
  process.exit(1);
});
