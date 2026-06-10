let rmsHistory: number[] = Array(60).fill(0);
let historyIndex = 0;
let currentSection: 'fast' | 'vocal' | 'instrumental' | 'quiet' | 'slow' = 'quiet';
let lastSectionChange = 0;

self.onmessage = (e: MessageEvent) => {
    const d = new Uint8Array(e.data); // e.data is ArrayBuffer
    
    // Group into bands
    let sumBass = 0, sumMids = 0, sumTreble = 0, sumAll = 0;
    for (let i = 0; i <= 3; i++) sumBass += d[i];
    for (let i = 4; i <= 25; i++) sumMids += d[i];
    for (let i = 26; i <= 100; i++) sumTreble += d[i];
    for (let i = 0; i < 100; i++) sumAll += d[i] * d[i];

    const bass = (sumBass / (4 * 255));
    const mids = (sumMids / (22 * 255));
    const treble = (sumTreble / (75 * 255));
    const rms = Math.sqrt(sumAll / 100) / 255; // 0 to 1

    rmsHistory[historyIndex] = rms;
    historyIndex = (historyIndex + 1) % rmsHistory.length;
    const avgRms = rmsHistory.reduce((a, b) => a + b) / rmsHistory.length;

    const now = performance.now();
    const timeSinceChange = now - lastSectionChange;

    if (timeSinceChange > 2000) {
        let nextSection = currentSection;

        if (rms < 0.15 && bass < 0.1) {
            nextSection = 'quiet';
        } else if (bass < 0.25 && rms < 0.35) {
            nextSection = 'slow';
        } else if (rms > 0.55 && rms > avgRms * 1.3 && bass > 0.6) {
            nextSection = 'fast';
        } else if (mids > 0.45 && (mids > bass * 1.2 || mids > treble * 1.5)) {
            nextSection = 'vocal';
        } else {
            nextSection = 'instrumental';
        }

        if (nextSection !== currentSection) {
            currentSection = nextSection;
            lastSectionChange = now;
        }
    }

    // Transfer back without serializing big objects (just primitive objects are cheap, but we can do it directly)
    self.postMessage({
        section: currentSection,
        bass,
        mids,
        treble,
        rms
    });
};
