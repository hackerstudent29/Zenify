import { RomanizationService } from '../services/romanization.service.js';

async function testSamples() {
    console.log('=====================================================');
    console.log('   Testing Tamil and Hindi Romanization Engines      ');
    console.log('=====================================================');

    // 1. TAMIL SAMPLE (Tanglish)
    const tamilPlain = `நீ இல்லாம என்ன ஆச்சு
காதல் நெஞ்சில் பாட்டாய் ஆச்சு
[Chorus]
உன்னைத்தானே நினைச்சேன்
உயிரில் உன்னை கலந்தேன்`;

    const tamilSynced = [
        { time: 12.5, text: "நீ இல்லாம என்ன ஆச்சு" },
        { time: 16.2, text: "காதல் நெஞ்சில் பாட்டாய் ஆச்சு" },
        { time: 20.0, text: "[Chorus]" },
        { time: 24.8, text: "உன்னைத்தானே நினைச்சேன்" },
        { time: 28.3, text: "உயிரில் உன்னை கலந்தேன்" }
    ];

    console.log('\n--- 1. Testing Tamil Script Detection & Transliteration ---');
    const tamilDetect = RomanizationService.detectScript(tamilPlain);
    console.log('Detection:', tamilDetect);

    const tamilResult = await RomanizationService.romanizeLyricsText(tamilPlain, tamilDetect.primaryLanguage);
    console.log('\nTamil Plain Transliteration Result:');
    console.log(tamilResult.romanized);

    const tamilSyncedResult = await RomanizationService.romanizeSyncedTokens(tamilSynced, tamilDetect.primaryLanguage);
    console.log('\nTamil Synced Transliteration Result (Timestamps Preserved):');
    tamilSyncedResult.forEach(t => console.log(`[${t.time}s] ${t.text}`));

    // Assertions for Tamil
    if (tamilSyncedResult.length !== tamilSynced.length) {
        throw new Error(`Tamil synced count mismatch: expected ${tamilSynced.length}, got ${tamilSyncedResult.length}`);
    }
    for (let i = 0; i < tamilSynced.length; i++) {
        if (tamilSyncedResult[i].time !== tamilSynced[i].time) {
            throw new Error(`Tamil timestamp mismatch at index ${i}`);
        }
    }
    console.log('✔ Tamil Synced Lyrics & Timestamps Verified Intact!\n');

    // 2. HINDI SAMPLE (Hinglish)
    const hindiPlain = `तुम बिन जिया जाए कैसे
तेरे बिना दर्द सहा जाए कैसे
[Chorus]
यादों में तेरी खो गया हूँ
तेरे प्यार में मदहोश हो गया हूँ`;

    const hindiSynced = [
        { time: 10.0, text: "तुम बिन जिया जाए कैसे" },
        { time: 15.5, text: "तेरे बिना दर्द सहा जाए कैसे" },
        { time: 21.0, text: "[Chorus]" },
        { time: 25.3, text: "यादों में तेरी खो गया हूँ" },
        { time: 30.1, text: "तेरे प्यार में मदहोश हो गया हूँ" }
    ];

    console.log('--- 2. Testing Hindi Script Detection & Transliteration ---');
    const hindiDetect = RomanizationService.detectScript(hindiPlain);
    console.log('Detection:', hindiDetect);

    const hindiResult = await RomanizationService.romanizeLyricsText(hindiPlain, hindiDetect.primaryLanguage);
    console.log('\nHindi Plain Transliteration Result:');
    console.log(hindiResult.romanized);

    const hindiSyncedResult = await RomanizationService.romanizeSyncedTokens(hindiSynced, hindiDetect.primaryLanguage);
    console.log('\nHindi Synced Transliteration Result (Timestamps Preserved):');
    hindiSyncedResult.forEach(t => console.log(`[${t.time}s] ${t.text}`));

    // Assertions for Hindi
    if (hindiSyncedResult.length !== hindiSynced.length) {
        throw new Error(`Hindi synced count mismatch: expected ${hindiSynced.length}, got ${hindiSyncedResult.length}`);
    }
    for (let i = 0; i < hindiSynced.length; i++) {
        if (hindiSyncedResult[i].time !== hindiSynced[i].time) {
            throw new Error(`Hindi timestamp mismatch at index ${i}`);
        }
    }
    console.log('✔ Hindi Synced Lyrics & Timestamps Verified Intact!\n');

    console.log('=====================================================');
    console.log('  ALL REGIONAL SCRIPT TESTS PASSED SUCCESSFULLY!    ');
    console.log('=====================================================');
}

testSamples()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Test failed:', err);
        process.exit(1);
    });
