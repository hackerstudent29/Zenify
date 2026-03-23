"use client";

import { useRef } from 'react';
import { useMotionValue, useAnimationFrame } from 'framer-motion';
import { audioEngine } from '@/lib/audio-engine';

/**
 * High-precision Audio Hook (512 FFT)
 * Optimized for snappy physical reactions and smooth fluidity.
 */
export function useAudioAnalyzer() {
    const lowEnd = useMotionValue(0);    // Bass/Kick (60-150Hz)
    const midRange = useMotionValue(0);  // Visual Energy/Mids
    const highEnd = useMotionValue(0);   // Visual Transients/Highs
    
    const dataArrayRef = useRef<any>(null);
    const lastValues = useRef({ low: 0, mid: 0, high: 0 });
    const smoothing = 0.15; // Slightly faster smoothing for quicker reactions

    useAnimationFrame(() => {
        const analyser = audioEngine.getAnalyser();
        if (!analyser) return;

        if (!dataArrayRef.current) {
            dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
        }

        const data = dataArrayRef.current;
        analyser.getByteFrequencyData(data);

        // 1. Precise Low End (Bins 1-3: Sub & Mid Bass @ ~86Hz/bin)
        // Focus on the "Meat" of the kick drum
        let lSum = 0;
        for (let i = 1; i <= 3; i++) lSum += data[i];
        const lTarget = (lSum / 3) / 255;

        // 2. Mid Range (Bins 4-25: ~350Hz to 2.1kHz)
        // This is the instrument & vocal intensity
        let mSum = 0;
        for (let i = 4; i <= 25; i++) mSum += data[i];
        const mTarget = (mSum / 22) / 255;

        // 3. High End (Bins 26-100: Above 2.2kHz)
        // Transients and cymbals
        let hSum = 0;
        for (let i = 26; i <= 100; i++) hSum += data[i];
        const hTarget = (hSum / 75) / 255;

        // Final smoothing for buttery looks
        lastValues.current.low += (lTarget - lastValues.current.low) * 0.25; // Snappy bass
        lastValues.current.mid += (mTarget - lastValues.current.mid) * smoothing;
        lastValues.current.high += (hTarget - lastValues.current.high) * smoothing;

        lowEnd.set(Math.pow(lastValues.current.low, 1.2)); // Power curve for punchier feeling
        midRange.set(lastValues.current.mid);
        highEnd.set(lastValues.current.high);
    });

    return { lowEnd, midRange, highEnd };
}
