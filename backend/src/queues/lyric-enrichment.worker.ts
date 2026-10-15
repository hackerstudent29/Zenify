import { LyricEnrichmentService, LyricEnrichmentResult } from '../services/lyric-enrichment.service.js';

interface QueueJob {
    trackId: string;
    priority: number; // 100 = active listener, 50 = import, 10 = background sweep
    force?: boolean;
    userInitiated?: boolean;
    resolve: (res: LyricEnrichmentResult) => void;
    reject: (err: any) => void;
    enqueuedAt: number;
}

/**
 * ELASTIC AUTO-SCALING CONCURRENT LYRIC WORKER POOL
 * Dynamically scales concurrency from 1 to 128+ concurrent worker threads
 * based in real time on incoming listening requests and batch load.
 *
 * Concurrency Scale Table:
 * - 1 active request   -> 1 worker
 * - 2 active requests  -> 2 workers
 * - 5 active requests  -> 5 workers
 * - 10 active requests -> 10 workers
 * - 20 active requests -> 20 workers
 * - 50 active requests -> 50 workers
 * - 100+ requests      -> 100+ workers
 *
 * Automatically scales down to 0 idle workers when queue drains.
 * Provides in-flight single-flight deduplication so multiple users listening
 * to the same track simultaneously share the single active resolution promise.
 */
export class ElasticLyricWorker {
    private static readonly POLL_INTERVAL_MS = 15 * 1000; // 15 seconds 24/7 background sweep // 30 seconds background sweep
    private static readonly MAX_ALLOWED_CONCURRENCY = 128; // Dynamic scaling ceiling
    private static readonly SWEEP_DISCOVERY_BATCH = 50; // Batch discovery size for sweeps

    private static queue: QueueJob[] = [];
    private static activeWorkers = 0;
    private static inFlightJobs = new Map<string, Promise<LyricEnrichmentResult>>();
    private static sweepIntervalTimer: NodeJS.Timeout | null = null;
    private static isSweepRunning = false;

    // Real-time runtime metrics
    private static totalProcessed = 0;
    private static totalSucceeded = 0;
    private static totalAdjusted = 0;
    private static peakConcurrency = 0;

    /**
     * Enqueue a track for elastic asynchronous lyrics enrichment & onset alignment.
     * Deduplicates in-flight requests for the same track.
     */
    static enqueue(
        trackId: string,
        options: {
            priority?: number;
            force?: boolean;
            userInitiated?: boolean;
        } = {}
    ): Promise<LyricEnrichmentResult> {
        // 1. In-flight single-flight deduplication: collapse simultaneous user requests
        if (this.inFlightJobs.has(trackId)) {
            console.log(`[ElasticLyricWorker] In-flight single-flight match for track "${trackId}". Attaching to active resolution promise.`);
            return this.inFlightJobs.get(trackId)!;
        }

        const priority = options.priority ?? (options.userInitiated ? 100 : 50);

        let resolveJob!: (res: LyricEnrichmentResult) => void;
        let rejectJob!: (err: any) => void;

        const jobPromise = new Promise<LyricEnrichmentResult>((resolve, reject) => {
            resolveJob = resolve;
            rejectJob = reject;
        });

        this.inFlightJobs.set(trackId, jobPromise);

        // 2. Insert into priority queue
        const newJob: QueueJob = {
            trackId,
            priority,
            force: options.force,
            userInitiated: options.userInitiated,
            resolve: resolveJob,
            reject: rejectJob,
            enqueuedAt: Date.now()
        };

        // Maintain priority queue sorted descending by priority
        const insertIdx = this.queue.findIndex(j => j.priority < priority);
        if (insertIdx === -1) {
            this.queue.push(newJob);
        } else {
            this.queue.splice(insertIdx, 0, newJob);
        }

        // 3. Elastic Auto-Scaling Concurrency Allocation
        this.scaleWorkers();

        return jobPromise;
    }

    /**
     * Dynamically calculates load and spawns worker loops to reach the required concurrency.
     */
    private static scaleWorkers() {
        const demand = this.queue.length + this.activeWorkers;
        const targetConcurrency = Math.min(this.MAX_ALLOWED_CONCURRENCY, Math.max(1, demand));

        if (targetConcurrency > this.peakConcurrency) {
            this.peakConcurrency = targetConcurrency;
        }

        // Spawn new concurrent worker threads as long as we haven't reached target concurrency
        while (this.activeWorkers < targetConcurrency && this.queue.length > 0) {
            this.spawnWorker();
        }
    }

    /**
     * Spawns an individual asynchronous worker thread that consumes jobs from the priority queue.
     * When the queue is drained, the thread gracefully terminates and decrements activeWorkers.
     */
    private static spawnWorker() {
        this.activeWorkers++;
        const currentActive = this.activeWorkers;
        console.log(`[ElasticLyricWorker] Scaled UP concurrency -> ${currentActive} active workers (Queue depth: ${this.queue.length})`);

        (async () => {
            try {
                while (this.queue.length > 0) {
                    const job = this.queue.shift();
                    if (!job) break;

                    await this.executeJob(job);
                }
            } finally {
                this.activeWorkers--;
                console.log(`[ElasticLyricWorker] Worker thread finished. Scaled DOWN concurrency -> ${this.activeWorkers} active workers (Queue depth: ${this.queue.length})`);
            }
        })();
    }

    /**
     * Executes an individual job with tracking and promise resolution.
     */
    private static async executeJob(job: QueueJob): Promise<void> {
        try {
            const result = await LyricEnrichmentService.processTrack(job.trackId, {
                force: job.force,
                userInitiated: job.userInitiated
            });

            this.totalProcessed++;
            if (result.success) {
                this.totalSucceeded++;
            }
            if (result.source?.toLowerCase().includes('onset_aligned') || result.enrichmentType === 'aligned_plain') {
                this.totalAdjusted++;
            }

            job.resolve(result);
        } catch (err: any) {
            console.error(`[ElasticLyricWorker] Job execution error for track "${job.trackId}":`, err.message);
            this.totalProcessed++;
            job.reject(err);
        } finally {
            this.inFlightJobs.delete(job.trackId);
        }
    }

    /**
     * Start the 24/7 background database sweeper with elastic concurrency.
     */
    static start() {
        console.log('[ElasticLyricWorker] Initializing elastic auto-scaling lyric enrichment engine...');

        // 1. Immediate startup recovery of any interrupted/crashed jobs
        LyricEnrichmentService.recoverStaleJobs().catch((err: any) => {
            console.error('[ElasticLyricWorker] Error during startup stale job recovery:', err.message);
        });

        // 2. Initial sweep 3 seconds after server launch
        setTimeout(() => {
            ElasticLyricWorker.runSweep().catch((err: any) => {
                console.error('[ElasticLyricWorker] Initial sweep error:', err.message);
            });
        }, 3000);

        // 3. Continuous scheduled interval every 60 seconds
        if (!this.sweepIntervalTimer) {
            this.sweepIntervalTimer = setInterval(() => {
                ElasticLyricWorker.runSweep().catch((err: any) => {
                    console.error('[ElasticLyricWorker] Scheduled sweep error:', err.message);
                });
            }, this.POLL_INTERVAL_MS);
        }

        console.log(`[ElasticLyricWorker] Engine running (Max Concurrency: ${this.MAX_ALLOWED_CONCURRENCY}, Poll: ${this.POLL_INTERVAL_MS / 1000}s).`);
    }

    /**
     * Stop the worker interval gracefully
     */
    static stop() {
        if (this.sweepIntervalTimer) {
            clearInterval(this.sweepIntervalTimer);
            this.sweepIntervalTimer = null;
            console.log('[ElasticLyricWorker] Worker stopped.');
        }
    }

    /**
     * Discover eligible tracks needing lyrics from DB and feed them to the elastic pool.
     * Automatically scales concurrency to match the discovered batch size.
     */
    static async runSweep(): Promise<{ scanned: number; queued: number; activeWorkers: number }> {
        if (this.isSweepRunning) {
            console.log('[ElasticLyricWorker] Previous sweep is still discovering tracks. Skipping cycle.');
            return { scanned: 0, queued: 0, activeWorkers: this.activeWorkers };
        }

        this.isSweepRunning = true;

        try {
            const eligibleTracks = await LyricEnrichmentService.discoverEligibleTracks(this.SWEEP_DISCOVERY_BATCH);

            if (eligibleTracks.length === 0) {
                return { scanned: 0, queued: 0, activeWorkers: this.activeWorkers };
            }

            console.log(`[ElasticLyricWorker] Sweep discovered ${eligibleTracks.length} eligible tracks. Enqueueing into elastic pool...`);

            let queuedCount = 0;
            for (const track of eligibleTracks) {
                if (!this.inFlightJobs.has(track.id)) {
                    this.enqueue(track.id, { priority: 10, force: false });
                    queuedCount++;
                }
            }

            return {
                scanned: eligibleTracks.length,
                queued: queuedCount,
                activeWorkers: this.activeWorkers
            };
        } catch (err: any) {
            console.error('[ElasticLyricWorker] Sweep encountered an error:', err.message);
            return { scanned: 0, queued: 0, activeWorkers: this.activeWorkers };
        } finally {
            this.isSweepRunning = false;
        }
    }

    /**
     * Returns real-time metrics of the elastic worker pool.
     */
    static getMetrics() {
        return {
            activeWorkers: this.activeWorkers,
            queueDepth: this.queue.length,
            currentConcurrency: this.activeWorkers,
            peakConcurrency: this.peakConcurrency,
            maxAllowedConcurrency: this.MAX_ALLOWED_CONCURRENCY,
            inFlightCount: this.inFlightJobs.size,
            totalProcessed: this.totalProcessed,
            totalSucceeded: this.totalSucceeded,
            totalAdjusted: this.totalAdjusted
        };
    }
}

// Backward-compatible alias for existing imports
export const LyricEnrichmentWorker = ElasticLyricWorker;
