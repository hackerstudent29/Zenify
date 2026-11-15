import { BetterLyricsProvider } from '../src/lyrics/providers/better-lyrics.provider';
import { UnisonProvider } from '../src/lyrics/providers/unison.provider';
import { LyricsEnhancementService } from '../src/services/lyrics-enhancement.service';
import { LyricEnrichmentService } from '../src/services/lyric-enrichment.service';
import { LyricsOrchestrator } from '../src/lyrics/orchestrator';
import { LyricsValidator } from '../src/lyrics/validator';

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

async function runTests() {
  console.log('========================================================================');
  console.log('   ZENIFY BETTER-LYRICS & UNISON BACKEND INTEGRATION TEST SUITE        ');
  console.log('========================================================================\n');

  /* ------------------------------------------------------------------ */
  /*  SUITE 1: BetterLyricsProvider Real Query & Parsing               */
  /* ------------------------------------------------------------------ */
  console.log('▶ Running Suite 1: BetterLyricsProvider Integration...');

  const blProvider = new BetterLyricsProvider();
  assert(blProvider.supports({ title: 'Blinding Lights', artist: 'The Weeknd' }), 'BetterLyricsProvider supports valid query');
  assert(!blProvider.supports({ title: '', artist: '' }), 'BetterLyricsProvider rejects empty query');

  // Test live fetch for a known cached song on Better Lyrics API
  const blDoc = await blProvider.fetch({
    title: 'Shape of You',
    artist: 'Ed Sheeran',
    duration: 233
  });

  assert(blDoc !== null, 'BetterLyricsProvider resolved lyrics for "Shape of You"');
  if (blDoc) {
    assert(blDoc.providerId === 'better-lyrics', `Provider ID is "better-lyrics" (got "${blDoc.providerId}")`);
    assert(blDoc.syncLevel === 'word', `Sync level is word-by-word precision (got "${blDoc.syncLevel}")`);
    assert(blDoc.lines.length > 20, `Parsed sufficient line count (got ${blDoc.lines.length})`);
    
    const linesWithWords = blDoc.lines.filter(l => l.words && l.words.length > 0);
    assert(linesWithWords.length > 10, `Lines contain granular word-level timestamps (got ${linesWithWords.length} lines with words)`);

    const validation = LyricsValidator.validate(blDoc, 233, 'english');
    assert(validation.valid === true, 'LyricsValidator confirmed document validity');
  }

  /* ------------------------------------------------------------------ */
  /*  SUITE 2: UnisonProvider Integration                              */
  /* ------------------------------------------------------------------ */
  console.log('\n▶ Running Suite 2: UnisonProvider Integration...');

  const unisonProvider = new UnisonProvider();
  assert(unisonProvider.supports({ title: 'Tu Mil Jaaye', artist: 'Ed Sheeran' }), 'UnisonProvider supports search query');
  assert(unisonProvider.supports({ title: '', artist: '', isrc: 'INS182604270' }), 'UnisonProvider supports ISRC query');

  // Direct ISRC query on Unison
  const unisonIsrcDoc = await unisonProvider.fetch({
    title: 'Tu Mil Jaaye',
    artist: 'Ed Sheeran',
    isrc: 'INS182604270'
  });

  assert(unisonIsrcDoc !== null, 'Unison resolved lyrics via ISRC "INS182604270"');
  if (unisonIsrcDoc) {
    assert(unisonIsrcDoc.providerId === 'unison', `Provider ID is "unison" (got "${unisonIsrcDoc.providerId}")`);
    assert(unisonIsrcDoc.lines.length > 10, `Unison parsed valid line count (got ${unisonIsrcDoc.lines.length})`);
  }

  /* ------------------------------------------------------------------ */
  /*  SUITE 3: LyricsEnhancementService Integration                    */
  /* ------------------------------------------------------------------ */
  console.log('\n▶ Running Suite 3: LyricsEnhancementService Integration...');

  const enhancedBl = await LyricsEnhancementService.fetchBetterLyrics(
    'Blinding Lights',
    'The Weeknd',
    200
  );
  assert(enhancedBl !== null, 'LyricsEnhancementService.fetchBetterLyrics returned result');
  assert(enhancedBl?.isSynced === true, 'Result is synced');
  assert(enhancedBl?.quality === 6, 'Quality score is 6 (Word-by-word top tier)');
  assert(enhancedBl?.source.includes('Better Lyrics') === true, `Source includes Better Lyrics (got "${enhancedBl?.source}")`);

  /* ------------------------------------------------------------------ */
  /*  SUITE 4: Universal Parser in LyricEnrichmentService              */
  /* ------------------------------------------------------------------ */
  console.log('\n▶ Running Suite 4: Universal Parser in LyricEnrichmentService...');

  if (enhancedBl?.lyrics) {
    const parsed = LyricEnrichmentService.parseLrcToSyncedTokens(enhancedBl.lyrics, 200);
    assert(parsed !== null, 'parseLrcToSyncedTokens successfully parsed structured LyricsDoc JSON');
    if (parsed) {
      assert(parsed.syncedTokens.length > 10, `syncedTokens has valid lines (got ${parsed.syncedTokens.length})`);
      assert(Boolean(parsed.plainLyrics && parsed.plainLyrics.length > 50), 'plainLyrics extracted');
      assert(Boolean(parsed.rawLrc && parsed.rawLrc.includes('[00:')), 'rawLrc generated with standard timestamps');

      const hasWords = parsed.syncedTokens.some(t => t.words && t.words.length > 0);
      assert(hasWords, 'syncedTokens preserved nested word timestamps for Apple Music karaoke UI');
    }
  }

  /* ------------------------------------------------------------------ */
  /*  SUITE 5: Orchestrator Integration & Priority Check               */
  /* ------------------------------------------------------------------ */
  console.log('\n▶ Running Suite 5: Orchestrator Integration & Priority...');

  LyricsOrchestrator.initialize();
  const registeredBl = LyricsOrchestrator.getProvider('better-lyrics');
  assert(registeredBl !== undefined, 'BetterLyricsProvider registered in LyricsOrchestrator');
  assert(registeredBl?.tier === 'W', 'BetterLyricsProvider is in Tier W (Word-level)');

  const registeredUnison = LyricsOrchestrator.getProvider('unison');
  assert(registeredUnison !== undefined, 'UnisonProvider registered in LyricsOrchestrator');
  assert(registeredUnison?.tier === 'W', 'UnisonProvider is in Tier W (Word-level)');

  assert(LyricsOrchestrator.isProviderEnabled('better-lyrics'), 'better-lyrics is enabled by default');
  assert(LyricsOrchestrator.isProviderEnabled('unison'), 'unison is enabled by default');

  const { doc } = await LyricsOrchestrator.resolveLyrics({
    title: 'Stay',
    artist: 'The Kid LAROI',
    duration: 141
  });

  assert(doc !== null, 'Orchestrator resolved lyrics for "Stay"');
  if (doc) {
    assert(doc.syncLevel === 'word' || doc.syncLevel === 'line', `Resolved with syncLevel: ${doc.syncLevel}`);
    console.log(`  Orchestrator selected Provider: ${doc.providerId} (${doc.syncLevel})`);
  }

  console.log('\n========================================================================');
  console.log(`   TEST SUMMARY: ${passedTests}/${totalTests} PASSED, ${failedTests} FAILED`);
  console.log('========================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
