import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config/env';
import { ExternalMetadataService } from '../services/external-metadata.service';
import { prisma } from '../utils/prisma';
import { transcodeTo128kbps, getAudioDuration } from '../utils/transcoder';
import { uploadToR2 } from '../utils/s3';
import path from 'path';
import fs from 'fs';
import os from 'os';

export interface ImportJobData {
  trackId: string;
  youtubeUrl: string;
  title: string;
  artistName: string;
  duration?: number;
  userId?: string;
}

const REDIS_HOST_URL = config.REDIS_URL || 'redis://127.0.0.1:6379';

let redisConnection: IORedis | null = null;
let importQueue: Queue<ImportJobData> | null = null;
let importWorker: Worker<ImportJobData> | null = null;

const findActualFile = (stem: string): string | null => {
  const exts = ['.mp3', '.m4a', '.webm', '.opus', '.ogg', '.mp4'];
  for (const ext of exts) {
    const candidate = stem + ext;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
};

// Background task executor (shared by Queue and fallback)
export async function runImportTask(data: ImportJobData) {
  const { trackId, youtubeUrl, title, artistName, userId } = data;
  console.log(`[ImportWorker] Starting background import for track: ${title} (ID: ${trackId})`);

  let tempRawPath: string | null = null;
  let tempTranscodedPath: string | null = null;

  try {
    // 1. Update status to PROCESSING
    await prisma.track.update({
      where: { id: trackId },
      data: { releaseStatus: 'PROCESSING' }
    });

    const tempDir = os.tmpdir();
    const fileId = `import-${trackId}-${Date.now()}`;
    const fileStem = path.join(tempDir, fileId);

    // 2. Download raw audio from YouTube using yt-dlp
    console.log(`[ImportWorker] Downloading raw stream for ${title} from ${youtubeUrl}`);
    await ExternalMetadataService.execYtDlp(`-f "ba[ext=m4a]/ba" --no-playlist --quiet`, youtubeUrl, fileStem);

    const actualFile = findActualFile(fileStem);
    if (!actualFile) {
      throw new Error(`yt-dlp failed to download stream. No file generated for stem: ${fileStem}`);
    }
    const stats = fs.statSync(actualFile);
    if (stats.size < 50000) { // 50KB minimum
      throw new Error(`Downloaded audio file is too small (${stats.size} bytes). Stream likely corrupted or blocked.`);
    }
    tempRawPath = actualFile;

    // 3. Transcode raw stream using local FFmpeg
    console.log(`[ImportWorker] Transcoding raw audio for ${title}`);
    const transcodedOut = path.join(tempDir, `${fileId}-128k.mp3`);
    const finalFile = await transcodeTo128kbps(tempRawPath, transcodedOut);
    
    if (finalFile !== tempRawPath) {
      tempTranscodedPath = finalFile;
    }

    // 4. Upload to Cloudflare R2
    console.log(`[ImportWorker] Uploading processed file to R2: ${finalFile}`);
    const fileBuffer = fs.readFileSync(finalFile);
    const key = `zenify/tracks/${trackId}-${Date.now()}${path.extname(finalFile)}`;
    const mimeType = finalFile.endsWith('.mp3') ? 'audio/mpeg' : 'audio/mp4';
    const finalAudioUrl = await uploadToR2(key, fileBuffer, mimeType);

    // 5. Update DB Track to PUBLISHED
    let durationSecs: number | undefined;
    try {
      const parsedDuration = await getAudioDuration(finalFile);
      if (parsedDuration && parsedDuration > 0) {
        durationSecs = parsedDuration;
        console.log(`[ImportWorker] Probed audio duration: ${durationSecs}s`);
      }
    } catch (durErr: any) {
      console.warn(`[ImportWorker] Could not get audio duration:`, durErr.message);
    }

    const updatedTrack = await prisma.track.update({
      where: { id: trackId },
      data: {
        audioUrl: finalAudioUrl,
        releaseStatus: 'PUBLISHED',
        ...(durationSecs ? { duration: durationSecs } : {})
      }
    });

    console.log(`[ImportWorker] Successfully published track: ${title} (URL: ${finalAudioUrl})`);

    try {
      const { LyricsSyncService } = await import('../services/lyrics-sync.service.js');
      const { isReplicateAvailable } = await import('../utils/replicate.js');
      
      const songLang = await LyricsSyncService.detectSongLanguage(title, artistName, updatedTrack.lyrics || undefined);
      console.log(`[ImportWorker] Detected language "${songLang}" for track: ${title}`);
      
      // Update database language immediately
      await prisma.track.update({
        where: { id: trackId },
        data: { language: songLang }
      });
      
      const synced = await LyricsSyncService.getSyncedLyrics(title, artistName, finalAudioUrl, updatedTrack.lyrics || undefined, updatedTrack.duration, youtubeUrl);
      if (synced && synced.syncedTokens && synced.syncedTokens.length > 0) {
        await prisma.track.update({
          where: { id: trackId },
          data: {
            synced_lyrics: synced.syncedTokens as any,
            raw_lrc: synced.rawLrc || null,
          }
        });
        console.log(`[ImportWorker] Synced lyrics found and saved for: ${title}`);
      } else if (isReplicateAvailable()) {
        console.log(`[ImportWorker] Synced lyrics missed. Triggering Whisper+Demucs pipeline for: ${title}`);
        const { WhisperSyncService } = await import('../services/whisper-sync.service.js');
        await WhisperSyncService.syncTrack(trackId);
      }
    } catch (lyricsErr: any) {
      console.warn(`[ImportWorker] Post-import lyrics sync failed for "${title}":`, lyricsErr.message);
    }
    
    // 6. Post-import: Trigger Python Audio Analysis for Visual Choreography
    console.log(`[ImportWorker] Post-import: Triggering Audio Analysis for "${title}"...`);
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execPromise = promisify(exec);
      
      const analyzerPath = path.join(__dirname, '../../analyzer.py');
      // Pass the local mp3 file for analysis
      const { stdout } = await execPromise(`python "${analyzerPath}" "${finalFile}"`);
      
      const analysisData = JSON.parse(stdout);
      if (analysisData && !analysisData.error) {
          await prisma.track.update({
              where: { id: trackId },
              data: { analysisData: analysisData }
          });
          console.log(`[ImportWorker] Successfully saved audio analysis timeline for: ${title}`);
      } else {
          console.warn(`[ImportWorker] Analyzer returned error:`, analysisData.error);
      }
    } catch (analysisErr: any) {
      console.warn(`[ImportWorker] Audio analysis failed for "${title}":`, analysisErr.message);
    }

    // 7. Create success notification
    if (userId) {
      await prisma.notification.create({
        data: {
          userId,
          type: 'upload_success',
          title: 'Import Successful',
          message: `Your imported track "${title}" is ready to stream.`,
        }
      }).catch(err => console.warn('[ImportWorker] Failed to create success notification:', err.message));
    }
  } catch (err: any) {
    console.error(`[ImportWorker] Background import failed for ${title}:`, err.message);

    // 1. Update Track to FAILED
    await prisma.track.update({
      where: { id: trackId },
      data: { releaseStatus: 'FAILED' }
    }).catch(dbErr => console.error('[ImportWorker] Failed to mark track as FAILED:', dbErr.message));

    // 2. Create failure notification
    if (userId) {
      await prisma.notification.create({
        data: {
          userId,
          type: 'upload_failed',
          title: 'Import Failed',
          message: `Failed to import track "${title}". Reason: ${err.message || 'Unknown error'}`,
        }
      }).catch(notifErr => console.warn('[ImportWorker] Failed to create failure notification:', notifErr.message));
    }
  } finally {
    // Cleanup temporary files
    try {
      if (tempRawPath && fs.existsSync(tempRawPath)) {
        fs.unlinkSync(tempRawPath);
      }
      if (tempTranscodedPath && fs.existsSync(tempTranscodedPath)) {
        fs.unlinkSync(tempTranscodedPath);
      }
    } catch (cleanErr: any) {
      console.warn('[ImportWorker] Error cleaning up temporary files:', cleanErr.message);
    }
  }
}

// Initialize BullMQ if Redis connection succeeds
if (config.REDIS_URL) {
  // Initialize BullMQ if Redis URL is explicitly provided
  try {
    redisConnection = new IORedis(REDIS_HOST_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => {
        // Limit retries so it doesn't print error logs infinitely if local Redis is down
        if (times > 3) {
          console.warn('[Queue] Redis connection failed after multiple retries. Disabling BullMQ (falling back to inline async tasks).');
          redisConnection = null;
          return null;
        }
        return Math.min(times * 100, 2000);
      }
    });

    redisConnection.on('error', (err) => {
      // Suppress logs if Redis is down
    });

    importQueue = new Queue<ImportJobData>('audio-import', { connection: redisConnection as any });

    importWorker = new Worker<ImportJobData>(
      'audio-import',
      async (job: Job<ImportJobData>) => {
        await runImportTask(job.data);
      },
      { connection: redisConnection as any, concurrency: 1 }
    );

    console.log('[Queue] BullMQ initialized successfully.');
  } catch (e: any) {
    console.warn('[Queue] BullMQ initialization skipped (Redis unavailable). Falling back to inline async execution.');
  }
} else {
  console.log('[Queue] No REDIS_URL provided. BullMQ skipped, using inline async execution.');
}

/**
 * Enqueues an import job to the BullMQ queue, or runs it in a detached promise if Redis is down.
 * @param data Job payload matching ImportJobData
 */
export async function enqueueImport(data: ImportJobData): Promise<void> {
  if (importQueue && redisConnection && redisConnection.status === 'ready') {
    console.log(`[Queue] Enqueuing import job for track: ${data.title}`);
    await importQueue.add(`import-${data.trackId}`, data);
  } else {
    console.log(`[Queue] Redis down/unavailable. Running import task in inline background promise.`);
    // Detached promise execution to keep Fastify request from blocking
    runImportTask(data).catch((err) => {
      console.error('[Queue] Detached import task failed:', err.message);
    });
  }
}
