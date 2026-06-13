import { prisma } from '../utils/prisma.js';
import { runWhisperX, isReplicateAvailable } from '../utils/replicate.js';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
    console.log('[ReplicateTest] Checking Replicate configuration...');
    
    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
        console.error('[ReplicateTest] ❌ REPLICATE_API_TOKEN is not set in environment variables!');
        process.exit(1);
    }
    console.log('[ReplicateTest] ✓ REPLICATE_API_TOKEN is configured (starts with:', apiToken.slice(0, 7) + '...)');

    if (!isReplicateAvailable()) {
        console.error('[ReplicateTest] ❌ isReplicateAvailable() returned false. Check your env initialization.');
        process.exit(1);
    }
    console.log('[ReplicateTest] ✓ isReplicateAvailable() returned true.');

    console.log('[ReplicateTest] Fetching a test track from the database...');
    const track = await prisma.track.findFirst({
        where: { 
            audioUrl: { startsWith: 'http' },
            deletedAt: null 
        },
        select: { id: true, title: true, audioUrl: true }
    });

    if (!track) {
        console.warn('[ReplicateTest] No track with a valid audioUrl found in the database. Using fallback audio URL.');
    }

    const testAudioUrl = track?.audioUrl || 'https://replicate.delivery/pbxt/IZi494b7sR450cI0K5Z75c754d9263158c3080/sample.mp3';
    console.log(`[ReplicateTest] Testing WhisperX on audio URL: ${testAudioUrl}`);

    try {
        console.log('[ReplicateTest] Calling Replicate WhisperX API (this may take a few seconds)...');
        const start = Date.now();
        const result = await runWhisperX(testAudioUrl);
        const duration = ((Date.now() - start) / 1000).toFixed(1);
        
        console.log(`[ReplicateTest] ✅ SUCCESS! Replicate is working perfectly (took ${duration}s).`);
        console.log(`[ReplicateTest] Detected Language: ${result.detected_language}`);
        console.log(`[ReplicateTest] Number of segments returned: ${result.segments.length}`);
        if (result.segments.length > 0) {
            console.log('[ReplicateTest] First segment snippet:');
            console.log(`  - [${result.segments[0].start.toFixed(2)}s - ${result.segments[0].end.toFixed(2)}s]: "${result.segments[0].text}"`);
            if (result.segments[0].words && result.segments[0].words.length > 0) {
                console.log(`  - Word-level timestamps successfully verified: found ${result.segments[0].words.length} words in first segment.`);
            } else {
                console.log('  - ⚠ No word-level timestamps in first segment (could be because language does not support alignment, or alignment failed).');
            }
        }
    } catch (err: any) {
        console.error('[ReplicateTest] ❌ ERROR: Replicate API call failed!');
        console.error(`[ReplicateTest] Error message: ${err.message}`);
        if (err.stack) {
            console.error(err.stack);
        }
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(console.error);
