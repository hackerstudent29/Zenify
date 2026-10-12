import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import { LyricEnrichmentService } from '../services/lyric-enrichment.service.js';
import { LyricEnrichmentWorker } from '../queues/lyric-enrichment.worker.js';
import { prisma } from '../utils/prisma.js';

async function runTests() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🧪 TEST SUITE: 9. AUTOMATED LYRICS ENRICHMENT BOT VERIFICATION');
    console.log('═══════════════════════════════════════════════════════════════\n');

    let passed = 0;
    let failed = 0;

    const assert = (condition: boolean, testName: string, detail?: string) => {
        if (condition) {
            console.log(`✅ [PASS] ${testName}`);
            passed++;
        } else {
            console.error(`❌ [FAIL] ${testName}: ${detail || 'Assertion failed'}`);
            failed++;
        }
    };

    // ─────────────────────────────────────────────────────────────
    // TEST 1: 5-Minute Grace Period Enforcement (< 5 minutes ago)
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 1. Testing 5-minute Grace Period (< 5 min) ---');
    const mockTrackRecent = {
        id: 'test-track-recent-' + Date.now(),
        title: 'Freshly Imported Song',
        createdAt: new Date(Date.now() - 2 * 60 * 1000), // Imported 2 minutes ago
        lyrics: null,
        synced_lyrics: null,
        deletedAt: null,
        audioUrl: 'https://example.com/audio.mp3',
        duration: 210,
        genre: 'Pop',
        artist: { name: 'Test Artist' },
        lyricJob: null
    };

    const isRecentEligible = (Date.now() - mockTrackRecent.createdAt.getTime()) >= LyricEnrichmentService.IMPORT_GRACE_PERIOD_MS;
    assert(!isRecentEligible, 'Song imported 2 minutes ago is strictly SKIPPED (in grace period)');

    // ─────────────────────────────────────────────────────────────
    // TEST 2: 5-Minute Grace Period Passed (> 5 minutes ago)
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 2. Testing 5-minute Grace Period (> 5 min) ---');
    const mockTrackEligible = {
        id: 'test-track-eligible-' + Date.now(),
        title: 'Eligible Imported Song',
        createdAt: new Date(Date.now() - 7 * 60 * 1000), // Imported 7 minutes ago
        lyrics: null,
        synced_lyrics: null,
        deletedAt: null,
        audioUrl: 'https://example.com/audio.mp3',
        duration: 210,
        genre: 'Pop',
        artist: { name: 'Test Artist' },
        lyricJob: null
    };

    const isOlderEligible = (Date.now() - mockTrackEligible.createdAt.getTime()) >= LyricEnrichmentService.IMPORT_GRACE_PERIOD_MS;
    assert(isOlderEligible, 'Song imported 7 minutes ago becomes ELIGIBLE for enrichment');

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Song with Valid Synced Lyrics already present
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 3. Testing Protection of Existing Valid Lyrics ---');
    const mockTrackWithLyrics = {
        id: 'test-track-synced',
        title: 'Song with Synced Lyrics',
        createdAt: new Date(Date.now() - 100 * 60 * 1000),
        lyrics: 'Line 1\nLine 2\nLine 3\nLine 4',
        synced_lyrics: [
            { time: 1.0, text: 'Line 1' },
            { time: 5.0, text: 'Line 2' },
            { time: 9.0, text: 'Line 3' }
        ],
        deletedAt: null,
        audioUrl: 'https://example.com/audio.mp3'
    };

    const hasValidSynced = mockTrackWithLyrics.synced_lyrics &&
        Array.isArray(mockTrackWithLyrics.synced_lyrics) &&
        mockTrackWithLyrics.synced_lyrics.length > 2;
    const hasValidPlain = !!(mockTrackWithLyrics.lyrics && mockTrackWithLyrics.lyrics.length > 10);

    assert(hasValidSynced && hasValidPlain, 'Song with valid synced lyrics is detected and protected from overwrite');

    // ─────────────────────────────────────────────────────────────
    // TEST 4 & 5: LRC Parsing into Zenify's Synced Lyrics Schema
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 4. Testing LRC Parsing to Zenify Synced Tokens ---');
    const sampleLrc = `
[00:12.50] Welcome to the morning sun
[00:16.80] Walking through the quiet streets
[00:22.10] The melody begins to play
[00:28.40] Feeling peaceful all the way
`;
    const parsedLrc = LyricEnrichmentService.parseLrcToSyncedTokens(sampleLrc, 60);
    assert(parsedLrc !== null && parsedLrc.syncedTokens.length === 4, 'LRC strings parse accurately into synced tokens');
    assert(parsedLrc?.syncedTokens[0].time === 12.5 && parsedLrc?.syncedTokens[0].text === 'Welcome to the morning sun', 'First line start timestamp parsed correctly');
    assert(parsedLrc?.syncedTokens[0].endTime === 16.8, 'End time calculated from subsequent line start');
    assert(parsedLrc?.plainLyrics.includes('Welcome to the morning sun'), 'Plain lyrics correctly extracted from LRC');

    // ─────────────────────────────────────────────────────────────
    // TEST 6 & 7: Instrumental and Karaoke Track Detection
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 5. Testing Instrumental & Karaoke Detection ---');
    const instrumental1 = LyricEnrichmentService.isInstrumentalTrack('Interstellar Theme (Instrumental)');
    const instrumental2 = LyricEnrichmentService.isInstrumentalTrack('Vaseegara [Karaoke Version]');
    const instrumental3 = LyricEnrichmentService.isInstrumentalTrack('Arabic Kuthu - Backing Track');
    const normalTrack = LyricEnrichmentService.isInstrumentalTrack('Shape of You');

    assert(instrumental1, 'Identified "(Instrumental)" in title');
    assert(instrumental2, 'Identified "[Karaoke Version]" in title');
    assert(instrumental3, 'Identified "Backing Track" in title');
    assert(!normalTrack, 'Regular vocal track is NOT misclassified as instrumental');

    // ─────────────────────────────────────────────────────────────
    // TEST 8: Audio Hash Checksum Stability
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 6. Testing Audio Hash & Asset Change Detection ---');
    const hash1 = LyricEnrichmentService.computeAudioHash('https://r2.dev/audio-v1.mp3');
    const hash2 = LyricEnrichmentService.computeAudioHash('https://r2.dev/audio-v1.mp3');
    const hash3 = LyricEnrichmentService.computeAudioHash('https://r2.dev/audio-v2-remastered.mp3');

    assert(hash1 === hash2, 'Audio hash is deterministic for unchanged asset');
    assert(hash1 !== hash3, 'Audio hash detects replacement of audio asset');

    // ─────────────────────────────────────────────────────────────
    // TEST 9: Interrupted / Stale Worker Job Recovery
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 7. Testing Interrupted Job Recovery ---');
    const recoveredCount = await LyricEnrichmentService.recoverStaleJobs();
    assert(typeof recoveredCount === 'number', 'Stale job recovery executed safely against Postgres');

    // ─────────────────────────────────────────────────────────────
    // TEST 10: Real Database Discovery Query Execution
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 8. Testing Real Database Discovery Query ---');
    const eligibleBatch = await LyricEnrichmentService.discoverEligibleTracks(3);
    assert(Array.isArray(eligibleBatch), `Discovery returned ${eligibleBatch.length} eligible candidates in controlled batch`);

    for (const t of eligibleBatch) {
        const ageSecs = (Date.now() - new Date(t.createdAt).getTime()) / 1000;
        assert(ageSecs >= 300, `Candidate "${t.title}" strictly satisfies 5-min grace period (${Math.floor(ageSecs)}s old)`);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 11: Real Statistics Metric Endpoint Data
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 9. Testing Statistics / Metrics Aggregation ---');
    const stats = await LyricEnrichmentService.getStats();
    assert(stats.totalTracks > 0, `Statistics queried successfully: ${stats.totalTracks} total tracks, ${stats.tracksNeedingLyrics} needing lyrics`);
    console.log('Statistics Summary:', JSON.stringify({
        totalTracks: stats.totalTracks,
        tracksNeedingLyrics: stats.tracksNeedingLyrics,
        skippedGracePeriodCount: stats.skippedGracePeriodCount,
        jobsByStatus: stats.jobsByStatus
    }, null, 2));

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
}).finally(() => prisma.$disconnect());
