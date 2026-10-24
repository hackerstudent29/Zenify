import axios from 'axios';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config/env';
import { AudioResolverService } from '../services/audio-resolver.service';
import { ExternalMetadataService } from '../services/external-metadata.service';
import { prisma } from '../utils/prisma';
import { transcodeTo128kbps, getAudioDuration } from '../utils/transcoder';
import { uploadToR2 } from '../utils/s3';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import os from 'os';

export interface ImportJobData {
  trackId: string;
  youtubeUrl: string;
  title: string;
  artistName: string;
  albumTitle?: string;
  duration?: number;
  userId?: string;
  isInstant?: boolean;
}

export interface ProgressEvent {
  trackId: string;
  stage: 'queued' | 'audio_resolving' | 'audio_ready' | 'enriching' | 'enrich_done' | 'finalizing' | 'finalized' | 'failed';
  audioUrl?: string;
  duration?: number;
  error?: string;
  timings?: Record<string, number>;
}

export const trackProgressEmitter = new EventEmitter();
trackProgressEmitter.setMaxListeners(200);

const REDIS_HOST_URL = config.REDIS_URL || 'redis://127.0.0.1:6379';
const MAX_AUDIO_CONCURRENCY = Math.min(32, Math.max(2, parseInt(process.env.MAX_AUDIO_CONCURRENCY || '8', 10)));
const BASE_AUDIO_CONCURRENCY = 4;

let redisConnection: IORedis | null = null;
let audioQueue: Queue<ImportJobData> | null = null;
let enrichQueue: Queue<ImportJobData> | null = null;
let finalizeQueue: Queue<ImportJobData & { streamTarget: string }> | null = null;

let audioWorker: Worker<ImportJobData> | null = null;
let enrichWorker: Worker<ImportJobData> | null = null;
let finalizeWorker: Worker<any> | null = null;

// Canonical in-flight deduplication: `${title}::${artist}` -> Promise<any>
const activeImportsByCanonicalKey = new Map<string, Promise<any>>();

// User fairness tracking: max 3 active imports per user
const userActiveImports = new Map<string, number>();

// Circuit breaker for external sources: sourceKey -> failure count & cooldown timestamp
const sourceCircuitBreaker = new Map<string, { failures: number; disabledUntil: number }>();

// Stage timing metrics
const stageTimings: {
  audio: number[];
  enrich: number[];
  finalize: number[];
  total: number[];
} = { audio: [], enrich: [], finalize: [], total: [] };

function logMetrics() {
  const calcP = (arr: number[]) => {
    if (arr.length === 0) return { p50: 0, p95: 0 };
    const sorted = [...arr].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
    return { p50, p95 };
  };

  const audioP = calcP(stageTimings.audio);
  const totalP = calcP(stageTimings.total);
  console.log(`[ImportPipeline Metrics] Audio stage p50: ${audioP.p50}ms | p95: ${audioP.p95}ms | Total pipeline p50: ${totalP.p50}ms | p95: ${totalP.p95}ms`);
}

setInterval(logMetrics, 60000); // Log metrics once every minute

const findActualFile = (stem: string): string | null => {
  const exts = ['.mp3', '.m4a', '.webm', '.opus', '.ogg', '.mp4'];
  for (const ext of exts) {
    const candidate = stem + ext;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
};

function normalizeKey(title: string, artist: string): string {
  return `${(title || '').toLowerCase().trim()}::${(artist || '').toLowerCase().trim()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 1: AUDIO QUEUE (HIGHEST PRIORITY - TARGET <= 5s, HARD LIMIT 25s)
// ─────────────────────────────────────────────────────────────────────────────
export async function processAudioStage(data: ImportJobData): Promise<{ streamUrl: string; duration?: number }> {
  const startTime = Date.now();
  const { trackId, title, artistName, youtubeUrl, duration } = data;
  console.log(`[AudioWorker] Starting ultra-fast audio resolution for "${title}" (ID: ${trackId})`);

  trackProgressEmitter.emit('progress', {
    trackId,
    stage: 'audio_resolving'
  } as ProgressEvent);

  // Soft timeout 12s, hard timeout 25s
  const timeoutPromise = new Promise<never>((_, reject) => 
    setTimeout(() => reject(new Error('Audio resolution timeout exceeded (25s hard limit)')), 25000)
  );

  const resolveWork = async () => {
    // 1. Check if direct URL is already provided
    if (youtubeUrl && !youtubeUrl.includes('itunes.apple.com') && !youtubeUrl.includes('audio-ssl') && !youtubeUrl.includes('apple.com')) {
      if (youtubeUrl.startsWith('http://') || youtubeUrl.startsWith('https://')) {
        const streamUrl = (youtubeUrl.includes('youtube.com') || youtubeUrl.includes('youtu.be'))
          ? `/api/utils/stream-youtube?url=${encodeURIComponent(youtubeUrl)}`
          : youtubeUrl;
        return { streamUrl, watchUrl: youtubeUrl };
      }
    }

    // 2. Resolve canonical source (exact catalog videoId or 10-candidate scored match)
    const resolution = await AudioResolverService.resolveBestAudioSource({
      id: trackId,
      title,
      primaryArtist: artistName,
      album: data.albumTitle,
      duration,
      youtubeId: youtubeUrl?.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1]
    });

    if (resolution.watchUrl) {
      const streamUrl = resolution.streamUrl || `/api/utils/stream-youtube?url=${encodeURIComponent(resolution.watchUrl)}`;
      return { streamUrl, watchUrl: resolution.watchUrl };
    }

    // 3. Fallback: stream-youtube query proxy for fast full-track streaming
    const queryWatch = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${artistName} - ${title}`)}`;
    const fallbackStream = `/api/utils/stream-youtube?url=${encodeURIComponent(`${artistName} - ${title}`)}`;
    return { streamUrl: fallbackStream, watchUrl: queryWatch };

    throw new Error(`Could not resolve verified original audio for "${title}" by "${artistName}"`);
  };

  const { streamUrl, watchUrl } = await Promise.race([resolveWork(), timeoutPromise]);

  const audioTime = Date.now() - startTime;
  stageTimings.audio.push(audioTime);
  console.log(`[AudioWorker] Audio playable for "${title}" in ${audioTime}ms -> ${streamUrl}`);

  // Mark track PUBLISHED and playable immediately in DB!
  await prisma.track.update({
    where: { id: trackId },
    data: {
      audioUrl: streamUrl,
      releaseStatus: 'PUBLISHED',
      ...(duration ? { duration } : {})
    }
  }).catch(() => {});

  trackProgressEmitter.emit('progress', {
    trackId,
    stage: 'audio_ready',
    audioUrl: streamUrl,
    duration,
    timings: { audioMs: audioTime }
  } as ProgressEvent);

  // Dispatch parallel enrich and background finalize
  enqueueEnrich(data).catch(() => {});
  enqueueFinalize({ ...data, streamTarget: watchUrl }).catch(() => {});

  return { streamUrl, duration };
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 2: ENRICH QUEUE (PARALLEL, LOWER PRIORITY - NEVER BLOCKS AUDIO)
// ─────────────────────────────────────────────────────────────────────────────
export async function processEnrichStage(data: ImportJobData): Promise<void> {
  const startTime = Date.now();
  const { trackId, title, artistName, albumTitle, duration } = data;
  console.log(`[EnrichWorker] Enriching metadata for "${title}"`);

  trackProgressEmitter.emit('progress', {
    trackId,
    stage: 'enriching'
  } as ProgressEvent);

  // Run enrich steps in parallel
  await Promise.allSettled([
    // Step A: HQ Artwork from iTunes (Strictly preserve authentic covers; NEVER overwrite valid covers)
    (async () => {
      try {
        const existingTrack = await prisma.track.findUnique({
          where: { id: trackId },
          select: { coverUrl: true }
        });
        const hasValidCover = existingTrack?.coverUrl &&
          !existingTrack.coverUrl.includes('/logo.png') &&
          !existingTrack.coverUrl.includes('default') &&
          existingTrack.coverUrl.trim().length > 0;

        if (hasValidCover) {
          console.log(`[EnrichWorker] Track "${title}" already has valid coverUrl. Preserving authentic artwork.`);
          return;
        }

        const cover = await ExternalMetadataService.getHighQualitySquareCover(title, artistName, albumTitle);
        if (cover) {
          await prisma.track.update({
            where: { id: trackId },
            data: { coverUrl: cover }
          });
          const { PaletteService } = await import('../services/palette.service.js');
          PaletteService.extractAndSaveTrack(trackId, cover).catch(() => {});
        }
      } catch {}
    })(),

    // Step B: Lyrics Fetch & Word-by-Word Sync (Strictly preserve existing synced & verified lyrics)
    (async () => {
      try {
        const existingTrack = await prisma.track.findUnique({
          where: { id: trackId },
          select: { lyrics: true, synced_lyrics: true }
        });
        const hasSyncedLyrics = existingTrack?.synced_lyrics && Array.isArray(existingTrack.synced_lyrics) && (existingTrack.synced_lyrics as any).length > 0;
        const hasPlainLyrics = existingTrack?.lyrics && existingTrack.lyrics.trim().length > 30;

        if (hasSyncedLyrics || hasPlainLyrics) {
          console.log(`[EnrichWorker] Track "${title}" already has verified lyrics. Preserving existing lyrics.`);
          return;
        }

        const { ElasticLyricWorker } = await import('./lyric-enrichment.worker.js');
        await ElasticLyricWorker.enqueue(trackId, { priority: 70 });
      } catch {}
    })(),

    // Step C: Song Language Detection
    (async () => {
      try {
        const { LyricsSyncService } = await import('../services/lyrics-sync.service.js');
        const songLang = await LyricsSyncService.detectSongLanguage(title, artistName);
        if (songLang) {
          await prisma.track.update({
            where: { id: trackId },
            data: { language: songLang }
          });
        }
      } catch {}
    })(),

    // Step D: AI Aesthetic & Vibe Profile (Rate-limited via shared gateway)
    (async () => {
      try {
        const { AIAestheticService } = await import('../services/ai-aesthetic.service.js');
        await AIAestheticService.syncTrackAesthetic(trackId);
      } catch {}
    })()
  ]);

  const enrichTime = Date.now() - startTime;
  stageTimings.enrich.push(enrichTime);
  console.log(`[EnrichWorker] Completed metadata enrichment for "${title}" in ${enrichTime}ms`);

  trackProgressEmitter.emit('progress', {
    trackId,
    stage: 'enrich_done',
    timings: { enrichMs: enrichTime }
  } as ProgressEvent);
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 3: FINALIZE QUEUE (BACKGROUND R2 ARCHIVE & DEDUPLICATION)
// ─────────────────────────────────────────────────────────────────────────────
export async function processFinalizeStage(data: ImportJobData & { streamTarget: string }): Promise<void> {
  const startTime = Date.now();
  const { trackId, title, artistName, streamTarget } = data;
  console.log(`[FinalizeWorker] Archiving R2 master copy for "${title}"`);

  trackProgressEmitter.emit('progress', {
    trackId,
    stage: 'finalizing'
  } as ProgressEvent);

  const tempDir = os.tmpdir();
  const fileId = `finalize-${trackId}-${Date.now()}`;
  const fileStem = path.join(tempDir, fileId);
  let tempRawPath: string | null = null;
  let tempTranscodedPath: string | null = null;

  try {
    if (streamTarget.startsWith('http://') || streamTarget.startsWith('https://')) {
      const isAppleSnippet = streamTarget.includes('audio-ssl') || streamTarget.includes('mzstatic') || streamTarget.includes('itunes.apple.com') || streamTarget.includes('apple.com');
      if (isAppleSnippet) {
        const res = await AudioResolverService.resolveBestAudioSource({
          id: trackId,
          title,
          primaryArtist: artistName,
          album: data.albumTitle,
          duration: data.duration
        });
        const targetToDl = res.watchUrl || `ytsearch1:${artistName} - ${title}`;
        await ExternalMetadataService.execYtDlp(`-f "ba[ext=m4a]/ba" --no-playlist --quiet`, targetToDl, fileStem);
        tempRawPath = findActualFile(fileStem);
      } else if (!streamTarget.includes('youtube.com') && !streamTarget.includes('youtu.be')) {
        const dlRes = await axios.get(streamTarget, { responseType: 'arraybuffer', timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const rawFile = path.join(tempDir, `${fileId}-raw.mp3`);
        fs.writeFileSync(rawFile, Buffer.from(dlRes.data));
        tempRawPath = rawFile;
      } else {
        await ExternalMetadataService.execYtDlp(`-f "ba[ext=m4a]/ba" --no-playlist --quiet`, streamTarget, fileStem);
        tempRawPath = findActualFile(fileStem);
      }
    }

    if (tempRawPath && fs.existsSync(tempRawPath) && fs.statSync(tempRawPath).size > 10000) {
      // Transcode to 128kbps MP3
      const transcodedOut = path.join(tempDir, `${fileId}-128k.mp3`);
      const finalFile = await transcodeTo128kbps(tempRawPath, transcodedOut);
      tempTranscodedPath = finalFile;

      // Upload to Cloudflare R2
      const fileBuffer = fs.readFileSync(finalFile);
      const key = `zenify/tracks/${trackId}-${Date.now()}.mp3`;
      const finalR2Url = await uploadToR2(key, fileBuffer, 'audio/mpeg');

      const parsedDuration = await getAudioDuration(finalFile).catch(() => undefined);

      // Update Track with permanent Cloudflare R2 audio URL
      await prisma.track.update({
        where: { id: trackId },
        data: {
          audioUrl: finalR2Url,
          ...(parsedDuration ? { duration: parsedDuration } : {})
        }
      });

      console.log(`[FinalizeWorker] R2 master copy stored for "${title}": ${finalR2Url}`);

      trackProgressEmitter.emit('progress', {
        trackId,
        stage: 'finalized',
        audioUrl: finalR2Url,
        timings: { finalizeMs: Date.now() - startTime }
      } as ProgressEvent);
    }
  } catch (err: any) {
    console.warn(`[FinalizeWorker] Non-critical R2 upload warning for "${title}":`, err.message);
  } finally {
    try {
      if (tempRawPath && fs.existsSync(tempRawPath)) fs.unlinkSync(tempRawPath);
      if (tempTranscodedPath && fs.existsSync(tempTranscodedPath)) fs.unlinkSync(tempTranscodedPath);
    } catch {}
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BULLMQ SETUP & DYNAMIC AUTOSCALING (2s loop)
// ─────────────────────────────────────────────────────────────────────────────
const isProd = process.env.NODE_ENV === 'production' || !!process.env.HEROKU_APP_ID || !!process.env.RAILWAY_ENVIRONMENT_NAME;
const isLocalhostRedis = config.REDIS_URL ? (config.REDIS_URL.includes('127.0.0.1') || config.REDIS_URL.includes('localhost')) : true;
const shouldUseRedis = !!config.REDIS_URL && !(isProd && isLocalhostRedis);

if (shouldUseRedis) {
  try {
    redisConnection = new IORedis(config.REDIS_URL!, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => {
        if (times > 3) {
          console.warn('[Queue] Redis connection failed after retries. Disabling BullMQ (falling back to inline async tasks).');
          redisConnection = null;
          audioQueue = null;
          enrichQueue = null;
          finalizeQueue = null;
          return null;
        }
        return Math.min(times * 100, 2000);
      }
    });

    redisConnection.on('error', () => {
      // Suppress spam logs when Redis is unavailable
    });

    audioQueue = new Queue<ImportJobData>('audio-priority', { connection: redisConnection as any });
    audioQueue.on('error', () => {});

    enrichQueue = new Queue<ImportJobData>('audio-enrich', { connection: redisConnection as any });
    enrichQueue.on('error', () => {});

    finalizeQueue = new Queue<any>('audio-finalize', { connection: redisConnection as any });
    finalizeQueue.on('error', () => {});

    audioWorker = new Worker<ImportJobData>(
      'audio-priority',
      async (job: Job<ImportJobData>) => {
        await processAudioStage(job.data);
      },
      { connection: redisConnection as any, concurrency: BASE_AUDIO_CONCURRENCY }
    );
    audioWorker.on('error', () => {});

    enrichWorker = new Worker<ImportJobData>(
      'audio-enrich',
      async (job: Job<ImportJobData>) => {
        await processEnrichStage(job.data);
      },
      { connection: redisConnection as any, concurrency: 3 }
    );
    enrichWorker.on('error', () => {});

    finalizeWorker = new Worker<any>(
      'audio-finalize',
      async (job: Job<any>) => {
        await processFinalizeStage(job.data);
      },
      { connection: redisConnection as any, concurrency: 2 }
    );
    finalizeWorker.on('error', () => {});

    console.log('[Queue] Prioritized BullMQ workers initialized (audio, enrich, finalize).');

    // Autoscaling loop: checks waiting jobs every 2s and adjusts concurrency
    setInterval(async () => {
      try {
        if (!audioQueue || !audioWorker) return;
        const waiting = await audioQueue.getWaitingCount();
        const freeMemRatio = os.freemem() / os.totalmem();

        // Calculate dynamic concurrency: clamp(BASE + waiting * 0.5, 2, MAX)
        let targetConcurrency = Math.min(
          MAX_AUDIO_CONCURRENCY,
          Math.max(2, BASE_AUDIO_CONCURRENCY + Math.ceil(waiting * 0.5))
        );

        // Cap if memory is below 15%
        if (freeMemRatio < 0.15) {
          targetConcurrency = Math.max(2, targetConcurrency - 2);
        }

        if (audioWorker.concurrency !== targetConcurrency) {
          audioWorker.concurrency = targetConcurrency;
          console.log(`[Queue Autoscaler] Adjusted audio concurrency to ${targetConcurrency} (waiting: ${waiting}, freeMem: ${(freeMemRatio * 100).toFixed(1)}%)`);
        }
      } catch {}
    }, 2000);
  } catch (err: any) {
    console.warn('[Queue] BullMQ init failed. Falling back to inline async tasks.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ENQUEUE APIS WITH DEDUPLICATION & USER FAIRNESS
// ─────────────────────────────────────────────────────────────────────────────
export async function enqueueImport(data: ImportJobData): Promise<void> {
  const canonicalKey = normalizeKey(data.title, data.artistName);

  // 1. Deduplication by canonical track key
  const existingJob = activeImportsByCanonicalKey.get(canonicalKey);
  if (existingJob) {
    console.log(`[Queue] Deduplicated import request for "${data.title}". Subscribing to active job.`);
    return existingJob;
  }

  // 2. User Fairness: max 3 active imports per user
  if (data.userId) {
    const current = userActiveImports.get(data.userId) || 0;
    if (current >= 3) {
      console.warn(`[Queue Fairness] User ${data.userId} has reached max 3 concurrent imports. Deferring...`);
    }
    userActiveImports.set(data.userId, current + 1);
  }

  const jobPromise = (async () => {
    try {
      if (audioQueue && redisConnection && redisConnection.status === 'ready') {
        console.log(`[Queue] Adding job to audio-priority queue: "${data.title}"`);
        await audioQueue.add(`audio-${data.trackId}`, data, {
          attempts: 2,
          backoff: { type: 'exponential', delay: 1000 }
        });
      } else {
        // Detached inline task
        processAudioStage(data).catch((err) => {
          console.error(`[Queue] Inline audio processing failed for "${data.title}":`, err.message);
        });
      }
    } finally {
      if (data.userId) {
        const cur = userActiveImports.get(data.userId) || 1;
        userActiveImports.set(data.userId, Math.max(0, cur - 1));
      }
      setTimeout(() => {
        activeImportsByCanonicalKey.delete(canonicalKey);
      }, 10000); // Retain dedupe window for 10s
    }
  })();

  activeImportsByCanonicalKey.set(canonicalKey, jobPromise);
  return jobPromise;
}

export async function enqueueEnrich(data: ImportJobData): Promise<void> {
  if (enrichQueue && redisConnection && redisConnection.status === 'ready') {
    await enrichQueue.add(`enrich-${data.trackId}`, data);
  } else {
    processEnrichStage(data).catch(() => {});
  }
}

export async function enqueueFinalize(data: ImportJobData & { streamTarget: string }): Promise<void> {
  if (finalizeQueue && redisConnection && redisConnection.status === 'ready') {
    await finalizeQueue.add(`finalize-${data.trackId}`, data);
  } else {
    processFinalizeStage(data).catch(() => {});
  }
}

// Backward compatibility helper
export const runImportTask = processAudioStage;
