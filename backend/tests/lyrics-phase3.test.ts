import { LyricsOrchestrator } from '../src/lyrics/orchestrator';
import { LyricsDoc, LyricsProvider, TrackMetadataQuery } from '../src/lyrics/types';

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

// Mock providers for precise behavioral verification
class MockProvider implements LyricsProvider {
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
    if (this.shouldFail) {
      throw new Error(`Provider ${this.id} failed`);
    }
    return this.mockResponse;
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('   ZENIFY LYRICS PIPELINE: PHASE 3 ORCHESTRATOR TESTS          ');
  console.log('===============================================================\n');

  // Test 1: Waterfall Tier Progression (Tier W succeeds)
  LyricsOrchestrator.clearProviders();
  const mockW = new MockProvider('mock-w', 'W', {
    syncLevel: 'word',
    instrumental: false,
    aiGenerated: false,
    aiSynced: false,
    providerId: 'mock-w',
    lines: [{ startMs: 1000, endMs: 3000, text: 'Tier W Lyrics' }]
  });
  const mockL = new MockProvider('mock-l', 'L', {
    syncLevel: 'line',
    instrumental: false,
    aiGenerated: false,
    aiSynced: false,
    providerId: 'mock-l',
    lines: [{ startMs: 1000, endMs: 3000, text: 'Tier L Lyrics' }]
  });

  LyricsOrchestrator.registerProvider(mockW);
  LyricsOrchestrator.registerProvider(mockL);

  const res1 = await LyricsOrchestrator.resolveLyrics({ title: 'Song 1', artist: 'Artist 1', duration: 180 });
  assert(res1.doc !== null && res1.doc.syncLevel === 'word', 'Tier W hit returned successfully');
  assert(mockW.callCount === 1, 'Tier W provider called once');
  assert(mockL.callCount === 0, 'Tier L provider NOT called when Tier W succeeded');

  // Test 2: Waterfall Fallback (Tier W fails -> Tier L succeeds)
  mockW.mockResponse = null; // W returns null
  mockL.callCount = 0;
  const res2 = await LyricsOrchestrator.resolveLyrics({ title: 'Song 2', artist: 'Artist 2', duration: 180 });
  assert(res2.doc !== null && res2.doc.syncLevel === 'line', 'Fell back to Tier L and succeeded');
  assert(mockL.callCount === 1, 'Tier L provider called upon Tier W failure');

  // Test 3: Instrumental tracks never go to Deepgram
  const resInst = await LyricsOrchestrator.resolveLyrics({ title: 'Clair de Lune (Instrumental)', artist: 'Debussy', duration: 180 });
  assert(resInst.needsTierA === false, 'Instrumental track flags needsTierA: false (never reaches Deepgram)');

  // Test 4: In-flight deduplication
  LyricsOrchestrator.clearProviders();
  const slowW = new MockProvider('slow-w', 'W', null);
  let providerCalls = 0;
  slowW.fetch = async () => {
    providerCalls++;
    await new Promise(r => setTimeout(r, 100));
    return {
      syncLevel: 'word',
      instrumental: false,
      aiGenerated: false,
      aiSynced: false,
      providerId: 'slow-w',
      lines: [{ startMs: 500, endMs: 2000, text: 'Dedupe text' }]
    };
  };
  LyricsOrchestrator.registerProvider(slowW);

  const queryDedupe = { title: 'Viral Track', artist: 'Pop Star', duration: 120 };
  const parallelLookups = await Promise.all([
    LyricsOrchestrator.resolveLyrics(queryDedupe),
    LyricsOrchestrator.resolveLyrics(queryDedupe),
    LyricsOrchestrator.resolveLyrics(queryDedupe),
    LyricsOrchestrator.resolveLyrics(queryDedupe)
  ]);

  assert(parallelLookups.every(r => r.doc !== null && r.doc.lines.length > 0), 'All concurrent callers received valid doc');
  assert(providerCalls === 1, `In-flight deduplication executed exactly 1 provider call for 4 concurrent callers (got ${providerCalls})`);

  // Test 5: Circuit Breaker Trips After 5 Consecutive Failures
  LyricsOrchestrator.clearProviders();
  const failingProvider = new MockProvider('flaky-p', 'W', null, true);
  LyricsOrchestrator.registerProvider(failingProvider);

  for (let i = 0; i < 5; i++) {
    LyricsOrchestrator.recordFailure('flaky-p');
  }
  assert(LyricsOrchestrator.isCircuitOpen('flaky-p') === true, 'Circuit breaker tripped open after 5 failures');

  // Test 6: Human Sync Preference over AI Sync in same tier
  LyricsOrchestrator.clearProviders();
  const aiProvider = new MockProvider('ai-p', 'W', {
    syncLevel: 'ai-word',
    instrumental: false,
    aiGenerated: false,
    aiSynced: true, // byModel
    providerId: 'ai-p',
    lines: [{ startMs: 1000, endMs: 3000, text: 'AI line' }]
  });
  const humanProvider = new MockProvider('human-p', 'W', {
    syncLevel: 'word',
    instrumental: false,
    aiGenerated: false,
    aiSynced: false, // human
    providerId: 'human-p',
    lines: [{ startMs: 1000, endMs: 3000, text: 'Human line' }]
  });

  LyricsOrchestrator.registerProvider(aiProvider);
  LyricsOrchestrator.registerProvider(humanProvider);

  const resPref = await LyricsOrchestrator.resolveLyrics({ title: 'Taylor Song', artist: 'Taylor Swift', duration: 180 });
  assert(resPref.doc?.providerId === 'human-p' && resPref.doc?.aiSynced === false, 'Orchestrator selected human sync over AI sync in Tier W');

  console.log(`\n===============================================================`);
  console.log(`   PHASE 3 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`===============================================================`);

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
