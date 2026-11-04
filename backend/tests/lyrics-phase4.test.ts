import { DeepgramEngine } from '../src/lyrics/deepgram-engine';

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
  console.log('   ZENIFY LYRICS PIPELINE: PHASE 4 DEEPGRAM TIER A TESTS       ');
  console.log('===============================================================\n');

  // Test 1: Unsupported language returns null (do not guess)
  const langConfigUnknown = DeepgramEngine.getLanguageConfig('unknown-dialect-xyz');
  assert(langConfigUnknown === null, 'Unsupported language returns null');

  const langConfigEnglish = DeepgramEngine.getLanguageConfig('English');
  assert(langConfigEnglish?.code === 'en' && langConfigEnglish?.model === 'nova-3', 'English mapped to Nova-3');

  const langConfigHindi = DeepgramEngine.getLanguageConfig('hindi');
  assert(langConfigHindi?.code === 'hi' && langConfigHindi?.model === 'nova-2', 'Hindi mapped to Nova-2');

  // Test 2: Word grouping by pause (> 0.8s)
  const wordsWithPause = [
    { word: 'Hello', start: 1.0, end: 1.4, confidence: 0.95 },
    { word: 'world', start: 1.5, end: 1.9, confidence: 0.92 },
    // 1.5s pause (> 0.8s)
    { word: 'Second', start: 3.4, end: 3.8, confidence: 0.91 },
    { word: 'line', start: 3.9, end: 4.2, confidence: 0.89 }
  ];

  const linesFromPause = DeepgramEngine.groupWordsIntoLines(wordsWithPause);
  assert(linesFromPause.length === 2, `Pause > 0.8s created 2 lines (got ${linesFromPause.length})`);
  assert(linesFromPause[0].text === 'Hello world', 'First line text matches');
  assert(linesFromPause[1].text === 'Second line', 'Second line text matches');

  // Test 3: Word grouping by sentence punctuation
  const wordsWithPunctuation = [
    { word: 'Is', start: 1.0, end: 1.3, confidence: 0.9 },
    { word: 'this', start: 1.4, end: 1.7, confidence: 0.9 },
    { word: 'real?', start: 1.8, end: 2.1, punctuated_word: 'real?', confidence: 0.95 },
    { word: 'Yes', start: 2.2, end: 2.5, confidence: 0.9 },
    { word: 'it', start: 2.6, end: 2.8, confidence: 0.9 },
    { word: 'is.', start: 2.9, end: 3.1, punctuated_word: 'is.', confidence: 0.9 }
  ];

  const linesFromPunctuation = DeepgramEngine.groupWordsIntoLines(wordsWithPunctuation);
  assert(linesFromPunctuation.length === 2, `Punctuation boundary created 2 lines (got ${linesFromPunctuation.length})`);
  assert(linesFromPunctuation[0].text === 'Is this real?', 'First question line parsed');
  assert(linesFromPunctuation[1].text === 'Yes it is.', 'Second statement line parsed');

  // Test 4: Drop low-confidence words (< 0.40)
  const wordsWithHallucination = [
    { word: 'Real', start: 1.0, end: 1.4, confidence: 0.9 },
    { word: 'gibberish', start: 1.5, end: 1.8, confidence: 0.25 }, // low confidence
    { word: 'lyrics', start: 1.9, end: 2.3, confidence: 0.88 }
  ];

  const linesFiltered = DeepgramEngine.groupWordsIntoLines(wordsWithHallucination);
  assert(linesFiltered[0].text === 'Real lyrics', 'Low confidence word dropped');
  assert(linesFiltered[0].words?.length === 2, 'Words array only contains high-confidence tokens');

  // Test 5: Spend cap estimation
  DeepgramEngine.recordUsage(180); // 3 minutes = $0.0129
  assert(DeepgramEngine.getEstimatedSpend() > 0, `Usage recorded (spend: $${DeepgramEngine.getEstimatedSpend()})`);

  console.log(`\n===============================================================`);
  console.log(`   PHASE 4 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`===============================================================`);

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});

