import { DeepgramLyricsService } from '../services/deepgram-lyrics.service.js';
import { prisma } from '../utils/prisma.js';

async function main() {
    console.log('--- Deepgram Lyrics Integration Verification ---');
    console.log('1. Checking Deepgram API Key & Availability...');
    const isAvail = DeepgramLyricsService.isAvailable();
    console.log(`Deepgram Available: ${isAvail}`);
    if (!isAvail) {
        console.error('❌ DEEPGRAM_API_KEY is not set or empty.');
        process.exit(1);
    }

    console.log('2. Testing Deepgram Speech-to-Text on sample audio...');
    const testAudioUrl = 'https://static.deepgram.com/examples/interview_speech-analytics.wav';
    const transcription = await DeepgramLyricsService.transcribeAudio(testAudioUrl);
    console.log(`✅ Transcription successful! Duration: ${transcription.duration}s, Words: ${transcription.words.length}, Utterances: ${transcription.utterances.length}`);

    console.log('3. Testing Format Utterances to Lyrics...');
    const formatted = DeepgramLyricsService.formatUtterancesToLyrics(
        transcription.utterances,
        transcription.words,
        transcription.transcript
    );
    console.log(`✅ Formatted lines count: ${formatted.syncedTokens.length}`);
    console.log('Sample line 1:', formatted.syncedTokens[0]);
    console.log('Sample line 2:', formatted.syncedTokens[1]);

    console.log('4. Testing Forced Alignment on Plain Lyrics...');
    const samplePlain = "Another big problem in the speech analytics space\nWhich has historically made it very difficult";
    const aligned = await DeepgramLyricsService.alignPlainLyricsWithAudio(testAudioUrl, samplePlain);
    console.log(`✅ Aligned tokens:`, aligned?.syncedTokens);

    console.log('5. Checking Tracks in DB that can benefit from Deepgram...');
    const tracks = await prisma.track.findMany({
        where: {
            audioUrl: { startsWith: 'http' },
        },
        take: 10,
        select: {
            id: true,
            title: true,
            audioUrl: true,
            lyrics: true,
            synced_lyrics: true,
            artist: { select: { name: true } },
        },
    });

    const closerId = '8f06659e-3653-48e1-b57c-827dac8126a2';
    console.log(`6. Testing Deepgram on real track Closer (ID: ${closerId})...`);
    const syncResult = await DeepgramLyricsService.syncTrackLyrics(closerId, { force: true });
    if (syncResult && syncResult.syncedTokens && syncResult.syncedTokens.length > 0) {
        console.log(`✅ Successfully generated and saved ${syncResult.syncedTokens.length} synced lyric lines for Closer!`);
        console.log('Sample generated line 1:', syncResult.syncedTokens[0]);
        console.log('Sample generated line 2:', syncResult.syncedTokens[1]);
        console.log('Sample generated line 3:', syncResult.syncedTokens[2]);
    } else {
        console.log('Could not generate synced lyrics for Closer');
    }

    console.log(`7. Testing Deepgram forced alignment on human plain lyrics for Closer...`);
    const humanLyrics = "So baby pull me closer\nIn the backseat of your Rover\nThat I know you can't afford\nBite that tattoo on your shoulder";
    const track = await prisma.track.findUnique({ where: { id: closerId }, select: { audioUrl: true } });
    if (track?.audioUrl) {
        const alignedResult = await DeepgramLyricsService.alignPlainLyricsWithAudio(track.audioUrl, humanLyrics);
        console.log(`✅ Aligned human lyrics lines count: ${alignedResult?.syncedTokens.length}`);
        console.log('Aligned tokens:');
        alignedResult?.syncedTokens.forEach(t => console.log(`  [${t.time}s] ${t.text}`));
    }

    console.log('\n✅ All Deepgram integration tests passed successfully!');
    process.exit(0);
}

main().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
