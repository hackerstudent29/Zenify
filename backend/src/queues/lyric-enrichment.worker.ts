import { LyricEnrichmentService } from '../services/lyric-enrichment.service.js';

let isSweepRunning = false;
let sweepIntervalTimer: NodeJS.Timeout | null = null;

export class LyricEnrichmentWorker {
    private static readonly POLL_INTERVAL_MS = 60 * 1000; // 60 seconds
    private static readonly MAX_CONCURRENT_PER_SWEEP = 2; // Bounded concurrency limit
    private static readonly BATCH_SIZE = 4; // Bounded batch size per minute

    /**
     * Start the 24/7 background lyrics enrichment worker.
     * Durable, independent of browser sessions, survives restarts.
     */
    static start() {
        console.log('[LyricEnrichmentWorker] Initializing 24/7 background lyrics enrichment worker...');

        // 1. Immediate startup recovery of any interrupted/crashed jobs
        LyricEnrichmentService.recoverStaleJobs().catch((err: any) => {
            console.error('[LyricEnrichmentWorker] Error during startup stale job recovery:', err.message);
        });

        // 2. Initial sweep 10 seconds after server launch
        setTimeout(() => {
            LyricEnrichmentWorker.runSweep().catch((err: any) => {
                console.error('[LyricEnrichmentWorker] Initial sweep error:', err.message);
            });
        }, 10000);

        // 3. Continuous interval every 60 seconds
        if (!sweepIntervalTimer) {
            sweepIntervalTimer = setInterval(() => {
                LyricEnrichmentWorker.runSweep().catch((err: any) => {
                    console.error('[LyricEnrichmentWorker] Scheduled sweep error:', err.message);
                });
            }, LyricEnrichmentWorker.POLL_INTERVAL_MS);
        }

        console.log('[LyricEnrichmentWorker] Worker started successfully (Interval: 60s, Concurrency: 2).');
    }

    /**
     * Stop the worker interval gracefully
     */
    static stop() {
        if (sweepIntervalTimer) {
            clearInterval(sweepIntervalTimer);
            sweepIntervalTimer = null;
            console.log('[LyricEnrichmentWorker] Worker stopped.');
        }
    }

    /**
     * Run a single sweep over eligible tracks in controlled batches with bounded concurrency.
     */
    static async runSweep(): Promise<{ scanned: number; processed: number; succeeded: number }> {
        if (isSweepRunning) {
            console.log('[LyricEnrichmentWorker] Previous sweep is still in progress. Skipping cycle.');
            return { scanned: 0, processed: 0, succeeded: 0 };
        }

        isSweepRunning = true;
        const startTime = Date.now();

        try {
            // Step 1: Discover eligible songs (strict 5-minute grace period applied)
            const eligibleTracks = await LyricEnrichmentService.discoverEligibleTracks(this.BATCH_SIZE);

            if (eligibleTracks.length === 0) {
                return { scanned: 0, processed: 0, succeeded: 0 };
            }

            console.log(`[LyricEnrichmentWorker] Discovered ${eligibleTracks.length} eligible tracks without synced lyrics. Processing with concurrency ${this.MAX_CONCURRENT_PER_SWEEP}...`);

            let processedCount = 0;
            let successCount = 0;

            // Process with bounded concurrency (chunks of MAX_CONCURRENT_PER_SWEEP)
            for (let i = 0; i < eligibleTracks.length; i += this.MAX_CONCURRENT_PER_SWEEP) {
                const chunk = eligibleTracks.slice(i, i + this.MAX_CONCURRENT_PER_SWEEP);

                const results = await Promise.allSettled(
                    chunk.map(track => LyricEnrichmentService.processTrack(track.id))
                );

                for (const res of results) {
                    processedCount++;
                    if (res.status === 'fulfilled' && res.value.success) {
                        successCount++;
                    }
                }
            }

            const durationMs = Date.now() - startTime;
            console.log(`[LyricEnrichmentWorker] Sweep completed in ${durationMs}ms: ${processedCount} processed, ${successCount} successfully enriched.`);

            return { scanned: eligibleTracks.length, processed: processedCount, succeeded: successCount };
        } catch (err: any) {
            console.error('[LyricEnrichmentWorker] Sweep encountered an error:', err.message);
            return { scanned: 0, processed: 0, succeeded: 0 };
        } finally {
            isSweepRunning = false;
        }
    }
}
