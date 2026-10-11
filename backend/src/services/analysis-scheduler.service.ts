import { prisma } from '../utils/prisma';
import { AIProfileService } from './ai-profile.service';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config/env';

export interface AnalysisJobPayload {
  userId: string;
  runDate: string;
  slot: number;
  retryCount?: number;
}

export class AnalysisSchedulerService {
  private static redisConnection: IORedis | null = null;
  private static queue: Queue<AnalysisJobPayload> | null = null;
  private static isInitialized = false;
  private static internalQueue: AnalysisJobPayload[] = [];
  private static isProcessing = false;
  private static lastExecutionTimestamp = 0;
  private static readonly MIN_INTERVAL_MS = 6000; // Cap to 10 requests / minute globally (60s / 10 = 6s)

  /**
   * Get current time details in Asia/Kolkata
   */
  static getKolkataTime(date = new Date()) {
    const tz = 'Asia/Kolkata';
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(date);
    const getVal = (type: string) => parts.find(p => p.type === type)?.value || '00';

    const year = getVal('year');
    const month = getVal('month');
    const day = getVal('day');
    const hour = parseInt(getVal('hour'), 10);
    const minute = parseInt(getVal('minute'), 10);
    const second = parseInt(getVal('second'), 10);

    const runDate = `${year}-${month}-${day}`;
    const secondsFromMidnight = hour * 3600 + minute * 60 + second;
    return { runDate, hour, minute, second, secondsFromMidnight };
  }

  /**
   * Assign a deterministic permanent analysisSlot to a user
   * Reuses freed gaps, lowest integer >= 0, never random, never shifting existing slots.
   */
  static async assignUserSlot(userId: string): Promise<number> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { analysisSlot: true }
    });

    if (user?.analysisSlot !== null && user?.analysisSlot !== undefined) {
      return user.analysisSlot;
    }

    // Get all currently used slots in ascending order
    const usersWithSlots = await prisma.user.findMany({
      where: { analysisSlot: { not: null } },
      select: { analysisSlot: true },
      orderBy: { analysisSlot: 'asc' }
    });

    const usedSlots = new Set<number>();
    usersWithSlots.forEach(u => {
      if (u.analysisSlot !== null) usedSlots.add(u.analysisSlot);
    });

    // Find the lowest free slot (reusing freed gaps)
    let candidateSlot = 0;
    while (usedSlots.has(candidateSlot)) {
      candidateSlot++;
    }

    await prisma.user.update({
      where: { id: userId },
      data: { analysisSlot: candidateSlot }
    });

    return candidateSlot;
  }

  /**
   * Initialize missing slots for existing users deterministically (ordered by createdAt ASC, id ASC)
   */
  static async initializeAllMissingSlots() {
    const unassigned = await prisma.user.findMany({
      where: { analysisSlot: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true }
    });

    if (unassigned.length === 0) return;

    console.log(`[Scheduler] Initializing slots deterministically for ${unassigned.length} users...`);
    for (const u of unassigned) {
      await this.assignUserSlot(u.id);
    }
    console.log('[Scheduler] Slot initialization complete.');
  }

  /**
   * Initialize Queue and rate-limited worker
   */
  static async init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    await this.initializeAllMissingSlots();

    if (config.REDIS_URL) {
      try {
        this.redisConnection = new IORedis(config.REDIS_URL, {
          maxRetriesPerRequest: null,
          enableReadyCheck: false
        });

        this.queue = new Queue<AnalysisJobPayload>('user-ai-analysis', {
          connection: this.redisConnection as any
        });

        new Worker<AnalysisJobPayload>(
          'user-ai-analysis',
          async (job) => {
            await this.processJob(job.data);
          },
          {
            connection: this.redisConnection as any,
            concurrency: 1, // Strict concurrency 1
            limiter: {
              max: 10,
              duration: 60000 // 10 per minute
            }
          }
        );

        console.log('[Scheduler] BullMQ analysis queue initialized.');
      } catch (err: any) {
        console.warn('[Scheduler] Redis connection failed, falling back to in-memory rate-limited runner.');
      }
    }

    // Schedule the 1-minute ticker
    setInterval(() => {
      this.tickMinute().catch(err => console.error('[Scheduler] Minute tick failed:', err));
    }, 60 * 1000);

    // Initial immediate tick
    this.tickMinute().catch(() => {});
  }

  /**
   * Minute tick: Enqueues users whose time window is due right now
   * 12:30 AM Asia/Kolkata + slot * 30 seconds
   * Missed users are caught up gradually, never in a burst!
   */
  static async tickMinute() {
    const { runDate, secondsFromMidnight } = this.getKolkataTime();
    const START_OFFSET_SECONDS = 30 * 60; // 12:30 AM = 1800s

    // Total slots due up to current second
    if (secondsFromMidnight < START_OFFSET_SECONDS) {
      return; // Before 12:30 AM
    }

    const maxDueSlot = Math.floor((secondsFromMidnight - START_OFFSET_SECONDS) / 30);
    if (maxDueSlot < 0) return;

    // Find users with analysisSlot <= maxDueSlot who haven't run today
    const candidates = await prisma.user.findMany({
      where: {
        analysisSlot: {
          lte: maxDueSlot,
          not: null
        },
        analysisRuns: {
          none: { runDate }
        }
      },
      select: { id: true, analysisSlot: true },
      orderBy: { analysisSlot: 'asc' },
      take: 20 // Process in controlled batches to prevent burst
    });

    for (const u of candidates) {
      await this.enqueueAnalysis({
        userId: u.id,
        runDate,
        slot: u.analysisSlot!
      });
    }
  }

  /**
   * Enqueue analysis job
   */
  static async enqueueAnalysis(payload: AnalysisJobPayload) {
    // Check if already ran today
    const existingRun = await prisma.analysisRun.findUnique({
      where: {
        userId_runDate: {
          userId: payload.userId,
          runDate: payload.runDate
        }
      }
    });

    if (existingRun && existingRun.status === 'SUCCESS') {
      return; // Already successfully run today
    }

    if (this.queue && this.redisConnection && this.redisConnection.status === 'ready') {
      await this.queue.add(`user-${payload.userId}-${payload.runDate}`, payload, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60000 }
      });
    } else {
      // In-memory queue
      const alreadyInQueue = this.internalQueue.some(
        j => j.userId === payload.userId && j.runDate === payload.runDate
      );
      if (!alreadyInQueue) {
        this.internalQueue.push(payload);
        this.processInternalQueue();
      }
    }
  }

  /**
   * Process in-memory queue with strict 1-concurrency and rate limiter (10/min -> min 6s apart)
   */
  private static async processInternalQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.internalQueue.length > 0) {
      const now = Date.now();
      const timeSinceLast = now - this.lastExecutionTimestamp;
      if (timeSinceLast < this.MIN_INTERVAL_MS) {
        await new Promise(r => setTimeout(r, this.MIN_INTERVAL_MS - timeSinceLast));
      }

      const job = this.internalQueue.shift();
      if (job) {
        this.lastExecutionTimestamp = Date.now();
        await this.processJob(job);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Single job executor with retry and fallback
   */
  static async processJob(job: AnalysisJobPayload) {
    const { userId, runDate } = job;
    const startTime = Date.now();

    // Verify user still exists and hasn't had a successful run today
    const existing = await prisma.analysisRun.findUnique({
      where: { userId_runDate: { userId, runDate } }
    });
    if (existing && existing.status === 'SUCCESS') {
      return;
    }

    try {
      const result = await AIProfileService.runDailyAnalysis(userId);
      const durationMs = Date.now() - startTime;

      await prisma.analysisRun.upsert({
        where: { userId_runDate: { userId, runDate } },
        update: {
          status: result.status,
          durationMs,
          error: result.error || null
        },
        create: {
          userId,
          runDate,
          status: result.status,
          durationMs,
          error: result.error || null
        }
      });
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const retryCount = (job.retryCount || 0) + 1;

      if (retryCount <= 3) {
        // Retry with backoff: 1 min, 5 min, 15 min
        const delays = [60000, 300000, 900000];
        const delay = delays[retryCount - 1] || 60000;
        console.warn(`[Scheduler] Analysis failed for ${userId}, retrying attempt ${retryCount} in ${delay}ms...`);
        setTimeout(() => {
          this.enqueueAnalysis({ ...job, retryCount });
        }, delay);
      } else {
        // Fallback to code-computed profile, record failed run
        console.error(`[Scheduler] Max retries exceeded for ${userId}. Falling back to rule-based profile:`, err.message);
        await prisma.analysisRun.upsert({
          where: { userId_runDate: { userId, runDate } },
          update: {
            status: 'FAILED',
            durationMs,
            error: err.message
          },
          create: {
            userId,
            runDate,
            status: 'FAILED',
            durationMs,
            error: err.message
          }
        });
      }
    }
  }

  /**
   * Manual analysis trigger (Admin only)
   */
  static async triggerUserAnalysis(userId: string) {
    const { runDate } = this.getKolkataTime();
    const slot = await this.assignUserSlot(userId);
    await this.enqueueAnalysis({ userId, runDate, slot });
    return { message: 'Analysis triggered successfully in rate-limited queue.' };
  }
}
