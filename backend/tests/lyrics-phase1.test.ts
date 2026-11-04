import { TtmlParser } from '../src/lyrics/parsers/ttml.parser';
import { EnhancedLrcParser } from '../src/lyrics/parsers/enhanced-lrc.parser';
import { PlainLrcParser } from '../src/lyrics/parsers/plain-lrc.parser';
import { LyricsfileParser } from '../src/lyrics/parsers/lyricsfile.parser';
import { PlainTextParser } from '../src/lyrics/parsers/plain-text.parser';
import { LyricsValidator } from '../src/lyrics/validator';

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
  console.log('   ZENIFY LYRICS PIPELINE: PHASE 1 PARSER & VALIDATOR TESTS    ');
  console.log('===============================================================\n');

  // Test 1: TTML Parser with word timing, background vocals, and byModel
  const sampleTtml = `<?xml version="1.0" encoding="utf-8"?>
<tt lrc:byModel="true" xmlns="http://www.w3.org/ns/ttml" xmlns:lrc="http://lrc.red/lyric-ttml-internal" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
  <body>
    <div>
      <p begin="00:01.00" end="00:04.00" ttm:agent="Singer1">
        <span begin="00:01.00" end="00:02.00">Cruel</span>
        <span begin="00:02.00" end="00:03.50">Summer</span>
      </p>
      <p begin="00:04.20" end="00:07.00" ttm:role="background">
        <span begin="00:04.20" end="00:05.50">(Yeah</span>
        <span begin="00:05.50" end="00:06.80">yeah)</span>
      </p>
    </div>
  </body>
</tt>`;

  const docTtml = TtmlParser.parse(sampleTtml, 'lrc.red');
  assert(docTtml !== null, 'TTML parsed successfully');
  assert(docTtml?.aiSynced === true, 'TTML byModel detected as aiSynced: true');
  assert(docTtml?.syncLevel === 'ai-word', 'Sync level is ai-word');
  assert(docTtml?.lines.length === 2, '2 lines parsed');
  assert(docTtml?.lines[0].agent === 'Singer1', 'Agent extracted');
  assert(docTtml?.lines[0].words?.length === 2, 'Word spans extracted');
  assert(docTtml?.lines[1].isBackground === true, 'Background role parsed');

  const valTtml = LyricsValidator.validate(docTtml, 180);
  assert(valTtml.valid === true, 'TTML doc passed validator');

  // Test 2: Enhanced LRC with word stamps & offset
  const sampleEnhancedLrc = `[ti:Test Track]
[offset:500]
[00:01.00]<00:01.00>Fever <00:01.50>dream <00:02.00>high
[00:03.00][00:08.00]Chorus line repeated`;

  const docEnhanced = EnhancedLrcParser.parse(sampleEnhancedLrc, 'lrc.red');
  assert(docEnhanced !== null, 'Enhanced LRC parsed successfully');
  assert(docEnhanced?.lines[0].startMs === 1500, 'Offset of 500ms applied (1000 + 500 = 1500ms)');
  assert(docEnhanced?.lines[0].words?.length === 3, 'Words extracted from <mm:ss.xx> tags');
  assert(docEnhanced?.lines.length === 3, 'Repeated timestamp line split into multiple lines');

  const valEnhanced = LyricsValidator.validate(docEnhanced, 60);
  assert(valEnhanced.valid === true, 'Enhanced LRC passed validator');

  // Test 3: Plain LRC
  const samplePlainLrc = `[00:05.20]First line text
[00:10.50]Second line text`;
  const docPlainLrc = PlainLrcParser.parse(samplePlainLrc, 'lrclib');
  assert(docPlainLrc !== null && docPlainLrc.lines.length === 2, 'Plain LRC parsed');
  assert(docPlainLrc?.syncLevel === 'line', 'Plain LRC syncLevel is line');
  assert(LyricsValidator.validate(docPlainLrc, 30).valid === true, 'Plain LRC passed validator');

  // Test 4: LRCLIB YAML lyricsfile
  const sampleYaml = `version: '1.0'
metadata:
  title: Test
  duration_ms: 120000
  instrumental: false
lines:
  - text: Hello world
    start_ms: 1000
    end_ms: 4000
    words:
      - text: Hello
        start_ms: 1000
        end_ms: 2000
      - text: world
        start_ms: 2000
        end_ms: 4000`;

  const docYaml = LyricsfileParser.parse(sampleYaml, 'lrclib');
  assert(docYaml !== null && docYaml.lines.length === 1, 'YAML lyricsfile parsed');
  assert(docYaml?.syncLevel === 'word', 'YAML hasWordSync mapped to word');
  assert(docYaml?.lines[0].words?.length === 2, 'Nested words parsed');
  assert(LyricsValidator.validate(docYaml, 120).valid === true, 'YAML lyricsfile passed validator');

  // Test 5: Plain text with garbage scrubbing
  const sampleJunkText = `Lyrics for Test Song by Artist
Submit Corrections
Hello darkness my old friend
I've come to talk with you again
https://youtube.com/watch?v=12345
Subscribe to our channel!
<!-- comment -->
56Embed`;

  const docPlain = PlainTextParser.parse(sampleJunkText, 'lyrics.ovh');
  assert(docPlain !== null && docPlain.lines.length === 2, 'Plain text garbage stripped down to 2 lines');
  assert(docPlain?.lines[0].text === 'Hello darkness my old friend', 'Clean line text preserved');

  // Test 6: Validator Rejection Checks
  // A. Word before line
  const invalidWordBefore = {
    syncLevel: 'word' as const,
    instrumental: false,
    aiGenerated: false,
    aiSynced: false,
    providerId: 'test',
    lines: [
      {
        startMs: 5000,
        endMs: 8000,
        text: 'Bad timing line',
        words: [
          { startMs: 2000, endMs: 6000, text: 'Bad' }, // 2000 < 5000
          { startMs: 6000, endMs: 7000, text: 'timing' }
        ]
      }
    ]
  };
  assert(LyricsValidator.validate(invalidWordBefore, 30).valid === false, 'Validator rejected word starting before line');

  // B. Out of order lines
  const invalidOutOfOrderLines = {
    syncLevel: 'line' as const,
    instrumental: false,
    aiGenerated: false,
    aiSynced: false,
    providerId: 'test',
    lines: [
      { startMs: 6000, endMs: 8000, text: 'Line 2' },
      { startMs: 4000, endMs: 5000, text: 'Line 1' } // out of order!
    ]
  };
  assert(LyricsValidator.validate(invalidOutOfOrderLines, 30).valid === false, 'Validator rejected out-of-order lines');

  // C. Exceeding track duration + 2s
  const invalidDurationExceeded = {
    syncLevel: 'line' as const,
    instrumental: false,
    aiGenerated: false,
    aiSynced: false,
    providerId: 'test',
    lines: [
      { startMs: 150000, endMs: 154000, text: 'Way past end' }
    ]
  };
  assert(LyricsValidator.validate(invalidDurationExceeded, 100).valid === false, 'Validator rejected lines exceeding duration + 2s');

  console.log(`\n===============================================================`);
  console.log(`   PHASE 1 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`===============================================================`);

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});

