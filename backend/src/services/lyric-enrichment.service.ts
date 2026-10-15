import { prisma } from '../utils/prisma.js';
import { Prisma } from '@prisma/client';
import { LyricsEnhancementService } from './lyrics-enhancement.service.js';
import { DeepgramLyricsService, SyncedLyricLine } from './deepgram-lyrics.service.js';
import crypto from 'crypto';

export interface LyricEnrichmentResult {
    success: boolean;
    trackId: string;
    status: 'synced' | 'no_lyrics_detected' | 'retry_wait' | 'failed' | 'skipped';
    reason?: string;
    enrichmentType?: 'sourced_synced' | 'aligned_plain' | 'transcribed_stt' | 'instrumental' | 'no_vocals';
    source?: string;
    lineCount?: number;
}

export class LyricEnrichmentService {
    // 5-second import grace period (allows audio/metadata write to finish before enrichment)
    public static readonly IMPORT_GRACE_PERIOD_MS = 5 * 1000;
    public static readonly MAX_JOB_ATTEMPTS = 3;
    public static readonly STALE_LOCK_TIMEOUT_MS = 15 * 60 * 1000;

    /**
     * Parse raw LRC string into Zenify's SyncedLyricLine format
     */
    static parseLrcToSyncedTokens(lrcText: string, trackDuration?: number): {
        syncedTokens: SyncedLyricLine[];
        plainLyrics: string;
        rawLrc: string;
    } | null {
        if (!lrcText || !lrcText.trim()) return null;

        const lines = lrcText.split('\n');
        const tokens: SyncedLyricLine[] = [];
        const plainLines: string[] = [];

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;

            // Match LRC timestamp tags like [01:23.45] or [01:23] or [01:23.456]
            const match = line.match(/^\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\](.*)$/);
            if (match) {
                const minutes = parseInt(match[1], 10);
                const seconds = parseFloat(match[2]);
                const time = Math.round((minutes * 60 + seconds) * 100) / 100;
                let text = match[3].trim();

                // Strip inline word timestamp tags like <00:12.34> if present
                text = text.replace(/<\d{2}:\d{2}(?:\.\d{1,3})?>/g, '').trim();

                if (text && !text.startsWith('[ti:') && !text.startsWith('[ar:') && !text.startsWith('[al:')) {
                    tokens.push({ time, text });
                    plainLines.push(text);
                }
            } else if (!line.startsWith('[ti:') && !line.startsWith('[ar:') && !line.startsWith('[al:') && !line.startsWith('[by:')) {
                // Informational or plain line
                if (line.length > 0 && !/^\[.*?\]$/.test(line)) {
                    plainLines.push(line);
                }
            }
        }

        if (tokens.length < 3) {
            return null;
        }

        // Sort strictly chronologically
        tokens.sort((a, b) => a.time - b.time);

        // Calculate line end times
        for (let i = 0; i < tokens.length; i++) {
            const nextTime = i + 1 < tokens.length ? tokens[i + 1].time : (trackDuration || tokens[i].time + 4.0);
            tokens[i].endTime = Math.round(Math.min(tokens[i].time + 8.0, nextTime) * 100) / 100;
        }

        return {
            syncedTokens: tokens,
            plainLyrics: plainLines.join('\n').trim(),
            rawLrc: lrcText.trim()
        };
    }

    /**
     * Compute a stable hash of the track's audio URL / source
     */
    static computeAudioHash(audioUrl: string): string {
        return crypto.createHash('md5').update(audioUrl || '').digest('hex');
    }

    /**
     * Check if a song title or genre denotes an instrumental recording
     */
    static isInstrumentalTrack(title: string, genre?: string | null): boolean {
        const text = `${title || ''} ${genre || ''}`.toLowerCase();
        return /\b(instrumental|karaoke|backing track|minus one|off vocal|no vocals|soundtrack score)\b/i.test(text);
    }

    /**
     * Recover stale or interrupted jobs (older than 15 minutes in processing state)
     */
    static async recoverStaleJobs(): Promise<number> {
        const staleThreshold = new Date(Date.now() - this.STALE_LOCK_TIMEOUT_MS);
        try {
            const res = await prisma.lyricEnrichmentJob.updateMany({
                where: {
                    status: { in: ['searching_lyrics', 'transcribing', 'aligning'] },
                    lastProcessedAt: { lte: staleThreshold }
                },
                data: {
                    status: 'retry_wait',
                    nextRetryAt: new Date(),
                    error: 'Recovered from interrupted worker process'
                }
            });
            if (res.count > 0) {
                console.log(`[LyricEnrichment] Recovered ${res.count} stale/interrupted jobs for retry.`);
            }
            return res.count;
        } catch (err: any) {
            console.error('[LyricEnrichment] Error recovering stale jobs:', err.message);
            return 0;
        }
    }

    /**
     * Step 1 — Discover eligible songs that need lyrics enrichment
     */
    static async discoverEligibleTracks(batchSize = 5): Promise<any[]> {
        const gracePeriodAgo = new Date(Date.now() - this.IMPORT_GRACE_PERIOD_MS);
        const now = new Date();

        // 1. Discover tracks imported beyond grace period without usable lyrics
        const candidates = await prisma.track.findMany({
            where: {
                deletedAt: null,
                createdAt: { lte: gracePeriodAgo },
                OR: [
                    { lyrics: null },
                    { lyrics: '' },
                    { synced_lyrics: { equals: Prisma.JsonNull } },
                    { synced_lyrics: { equals: Prisma.AnyNull } },
                    { synced_lyrics: { equals: [] } }
                ]
            },
            take: batchSize * 4, // Over-fetch to filter locked / retry_wait / terminal jobs
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                title: true,
                audioUrl: true,
                duration: true,
                createdAt: true,
                lyrics: true,
                synced_lyrics: true,
                language: true,
                genre: true,
                artist: { select: { name: true } },
                album: { select: { title: true } },
                lyricJob: true
            }
        });

        const eligible: any[] = [];

        for (const track of candidates) {
            // Already has valid synced lyrics?
            const hasValidSynced = track.synced_lyrics && 
                Array.isArray(track.synced_lyrics) && 
                (track.synced_lyrics as any[]).length > 2;

            const hasValidPlain = track.lyrics && track.lyrics.trim().length > 10;

            // If track already has BOTH valid plain lyrics AND valid synced lyrics, skip!
            if (hasValidSynced && hasValidPlain) {
                continue;
            }

            const currentAudioHash = this.computeAudioHash(track.audioUrl);
            const job = track.lyricJob;

            if (job) {
                // If audio asset has changed since last enrichment, invalidate old result and re-evaluate!
                const audioChanged = job.audioHash && job.audioHash !== currentAudioHash;

                if (!audioChanged) {
                    // Terminal states for unchanged audio: do NOT reprocess
                    if (job.status === 'synced' && hasValidSynced) {
                        continue;
                    }
                    if (job.status === 'no_lyrics_detected') {
                        // Allow re-evaluating after 1 hour in case new lyrics became available
                        const noLyricsThreshold = new Date(now.getTime() - 60 * 60 * 1000);
                        if (job.updatedAt && job.updatedAt > noLyricsThreshold) {
                            continue;
                        }
                    }

                    // If job is in retry_wait and nextRetryAt has not elapsed yet, skip
                    if (job.status === 'retry_wait' && job.nextRetryAt && job.nextRetryAt > now) {
                        continue;
                    }

                    // If failed, allow retry if older than 15 minutes
                    if (job.status === 'failed') {
                        const failedRetryThreshold = new Date(now.getTime() - 15 * 60 * 1000);
                        if (job.updatedAt && job.updatedAt > failedRetryThreshold) {
                            continue;
                        }
                    }

                    // Active lock in-flight (< 15 mins) by another worker
                    const isInProgress = ['searching_lyrics', 'transcribing', 'aligning'].includes(job.status);
                    const isFreshLock = job.lastProcessedAt && (now.getTime() - job.lastProcessedAt.getTime() < this.STALE_LOCK_TIMEOUT_MS);
                    if (isInProgress && isFreshLock) {
                        continue;
                    }
                }
            }

            eligible.push(track);
            if (eligible.length >= batchSize) break;
        }

        return eligible;
    }

    /**
     * Atomically claim a track for processing, ensuring bounded concurrency and no duplicates.
     */
    static async claimTrack(trackId: string, audioUrl: string): Promise<boolean> {
        const audioHash = this.computeAudioHash(audioUrl);
        const now = new Date();

        try {
            await prisma.lyricEnrichmentJob.upsert({
                where: { trackId },
                update: {
                    status: 'searching_lyrics',
                    audioHash,
                    lastProcessedAt: now,
                    updatedAt: now
                },
                create: {
                    trackId,
                    status: 'searching_lyrics',
                    audioHash,
                    attempts: 0,
                    lastProcessedAt: now
                }
            });
            return true;
        } catch (claimErr: any) {
            console.warn(`[LyricEnrichment] Failed to claim track ${trackId}:`, claimErr.message);
            return false;
        }
    }

    /**
     * Main enrichment execution workflow for an individual track.
     * Complies strictly with all Steps:
     * - 5-minute grace period verification
     * - Approved lyrics providers search first (LRCLib)
     * - Deepgram STT / Plain-lyrics alignment on actual audio
     * - Instrumental & no-vocals detection
     * - Atomic persistence and rollback/retry handling
     */
    static async processTrack(trackId: string, options: { force?: boolean; userInitiated?: boolean } = {}): Promise<LyricEnrichmentResult> {
        const track = await prisma.track.findUnique({
            where: { id: trackId },
            include: {
                artist: { select: { name: true } },
                album: { select: { title: true } },
                lyricJob: true
            }
        });

        if (!track) {
            return { success: false, trackId, status: 'failed', reason: 'Track not found' };
        }

        const now = new Date();
        const importAgeMs = now.getTime() - track.createdAt.getTime();

        // 1. Grace Period Check: Only defer if track already has plain lyrics awaiting sync (bypassed on direct user request)
        const skipGracePeriod = options.force || options.userInitiated;
        const hasSomeLyrics = track.lyrics && track.lyrics.trim().length > 10;
        if (!skipGracePeriod && hasSomeLyrics && importAgeMs < this.IMPORT_GRACE_PERIOD_MS) {
            const remainingSecs = Math.ceil((this.IMPORT_GRACE_PERIOD_MS - importAgeMs) / 1000);
            console.log(`[LyricEnrichment] Skipping track "${track.title}" (${track.id}): plain lyrics present, awaiting alignment grace period (${remainingSecs}s remaining).`);
            return {
                success: false,
                trackId,
                status: 'skipped',
                reason: `Within grace period (${remainingSecs}s remaining)`
            };
        }

        // 2. Safe Overwrite Protection: Check if valid lyrics already exist
        const hasValidExistingSynced = track.synced_lyrics && 
            Array.isArray(track.synced_lyrics) && 
            (track.synced_lyrics as any[]).length > 2;

        if (!options.force && hasValidExistingSynced && track.lyrics && track.lyrics.trim().length > 10) {
            const isOnsetVerified = track.sync_source && (track.sync_source.includes('ONSET_VERIFIED') || track.sync_source.includes('ONSET_ALIGNED'));
            if (isOnsetVerified) {
                console.log(`[LyricEnrichment] Track "${track.title}" already has verified synced lyrics with verified onset. Skipping.`);
                await prisma.lyricEnrichmentJob.upsert({
                    where: { trackId: track.id },
                    update: { status: 'synced', updatedAt: now },
                    create: { trackId: track.id, status: 'synced' }
                });
                return {
                    success: true,
                    trackId,
                    status: 'synced',
                    reason: 'Valid lyrics with verified onset already present'
                };
            } else if (track.audioUrl && DeepgramLyricsService.isAvailable()) {
                console.log(`[LyricEnrichment] Track "${track.title}" has synced lyrics but onset has not been verified yet. Running Deepgram onset alignment check...`);
                try {
                    const onsetRes = await DeepgramLyricsService.verifyAndAlignLyricOnset({
                        audioSource: track.audioUrl,
                        syncedLyrics: track.synced_lyrics as any,
                        rawLrc: track.raw_lrc || undefined,
                        language: track.language || undefined,
                        trackId: track.id,
                        title: track.title,
                    });
                    if (onsetRes.verified) {
                        console.log(`[LyricEnrichment] Existing track "${track.title}" onset calibrated: ${onsetRes.message}`);
                        return {
                            success: true,
                            trackId,
                            status: 'synced',
                            enrichmentType: onsetRes.adjusted ? 'aligned_plain' : 'sourced_synced',
                            source: onsetRes.adjusted ? 'deepgram_onset_aligned' : 'deepgram_onset_verified',
                            lineCount: onsetRes.syncedTokens.length
                        };
                    }
                } catch (verifyErr: any) {
                    console.warn(`[LyricEnrichment] Onset check for existing lyrics failed: ${verifyErr.message}`);
                }
            }
        }

        // 3. Claim track atomically
        const claimed = await this.claimTrack(track.id, track.audioUrl || '');
        if (!claimed && !options.force) {
            return { success: false, trackId, status: 'skipped', reason: 'Track claimed by another worker' };
        }

        const currentAttempts = (track.lyricJob?.attempts || 0) + 1;
        const artistName = track.artist?.name || 'Unknown Artist';

        console.log(`[LyricEnrichment] Processing track "${track.title}" by ${artistName} (Attempt ${currentAttempts})...`);

        try {
            // 4. Check for obvious instrumental titles or tags (Step 5)
            if (this.isInstrumentalTrack(track.title, track.genre)) {
                console.log(`[LyricEnrichment] Track "${track.title}" identified as Instrumental by metadata/title.`);
                await prisma.lyricEnrichmentJob.update({
                    where: { trackId: track.id },
                    data: {
                        status: 'no_lyrics_detected',
                        enrichmentType: 'instrumental',
                        source: 'metadata_classifier',
                        confidence: 1.0,
                        updatedAt: new Date()
                    }
                });
                return {
                    success: true,
                    trackId,
                    status: 'no_lyrics_detected',
                    enrichmentType: 'instrumental',
                    reason: 'Instrumental / Backing Track identified'
                };
            }

            let plainLyricsToAlign: string | null = (track.lyrics && track.lyrics.trim().length > 0) ? track.lyrics.trim() : null;

            // 5. Step 2 — Search existing and approved lyrics sources first (Outcome A / B / C)
            console.log(`[LyricEnrichment] Searching approved lyrics sources (LRCLib) for "${track.title}"...`);
            const lrcCandidate = await LyricsEnhancementService.fetchLRCLib(track.title, artistName, track.duration);

            if (lrcCandidate && lrcCandidate.lyrics) {
                // Outcome A: Time-synchronized lyrics are available from trusted source
                if (lrcCandidate.isSynced) {
                    const parsed = this.parseLrcToSyncedTokens(lrcCandidate.lyrics, track.duration);
                    if (parsed && parsed.syncedTokens.length > 2) {
                        console.log(`[LyricEnrichment] Sourced ${parsed.syncedTokens.length} synced lyric lines from LRCLib for "${track.title}". Verifying audio onset with Deepgram...`);

                        let finalTokens = parsed.syncedTokens;
                        let finalRawLrc = parsed.rawLrc;
                        let finalSource = 'LRCLIB_SYNCED';

                        if (track.audioUrl && DeepgramLyricsService.isAvailable()) {
                            try {
                                const onsetRes = await DeepgramLyricsService.verifyAndAlignLyricOnset({
                                    audioSource: track.audioUrl,
                                    syncedLyrics: parsed.syncedTokens,
                                    rawLrc: parsed.rawLrc,
                                    language: track.language || undefined,
                                    trackId: track.id,
                                    title: track.title,
                                });
                                if (onsetRes.verified) {
                                    finalTokens = onsetRes.syncedTokens;
                                    finalRawLrc = onsetRes.rawLrc;
                                    finalSource = onsetRes.adjusted ? 'LRCLIB_ONSET_ALIGNED' : 'LRCLIB_ONSET_VERIFIED';
                                    console.log(`[LyricEnrichment] Deepgram Onset Check for "${track.title}": ${onsetRes.message}`);
                                }
                            } catch (onsetErr: any) {
                                console.warn(`[LyricEnrichment] Deepgram onset verification non-fatal error: ${onsetErr.message}`);
                            }
                        }

                        // Recheck DB immediately before saving (safe overwrite check)
                        const fresh = await prisma.track.findUnique({ where: { id: track.id }, select: { synced_lyrics: true } });
                        if (!options.force && fresh?.synced_lyrics && (fresh.synced_lyrics as any[]).length > 2) {
                            console.log(`[LyricEnrichment] Track "${track.title}" was updated in parallel. Aborting overwrite.`);
                            return { success: true, trackId, status: 'synced' };
                        }

                        await prisma.track.update({
                            where: { id: track.id },
                            data: {
                                lyrics: parsed.plainLyrics,
                                synced_lyrics: finalTokens as any,
                                raw_lrc: finalRawLrc,
                                sync_source: finalSource
                            }
                        });

                        // Trigger romanization sweep if non-Latin
                        try {
                            const { enqueueRomanization } = await import('../queues/romanization.queue.js');
                            await enqueueRomanization({ trackId: track.id }).catch(() => {});
                        } catch {}

                        await prisma.lyricEnrichmentJob.update({
                            where: { trackId: track.id },
                            data: {
                                status: 'synced',
                                source: 'lrclib',
                                enrichmentType: 'sourced_synced',
                                confidence: 1.0,
                                error: null,
                                updatedAt: new Date()
                            }
                        });

                        return {
                            success: true,
                            trackId,
                            status: 'synced',
                            enrichmentType: 'sourced_synced',
                            source: 'lrclib',
                            lineCount: parsed.syncedTokens.length
                        };
                    }
                } else {
                    // Outcome B: Plain lyrics were found, but have no timestamps
                    if (LyricsEnhancementService.isValidSongLyrics(lrcCandidate.lyrics)) {
                        plainLyricsToAlign = lrcCandidate.lyrics;
                        console.log(`[LyricEnrichment] Valid plain lyrics retrieved from LRCLib (${plainLyricsToAlign.length} chars). Proceeding to audio-alignment.`);
                    } else {
                        console.warn(`[LyricEnrichment] Plain text for "${track.title}" rejected: appears to be video credits / description.`);
                        plainLyricsToAlign = undefined;
                    }
                }
            }

            // 6. Verify audio asset availability for audio-based steps (Step 3 & 4)
            if (!track.audioUrl || !track.audioUrl.startsWith('http')) {
                console.warn(`[LyricEnrichment] Track "${track.title}" has no accessible audio asset (${track.audioUrl}). Postponing audio processing.`);
                await prisma.lyricEnrichmentJob.update({
                    where: { trackId: track.id },
                    data: {
                        status: 'retry_wait',
                        attempts: currentAttempts,
                        nextRetryAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min postponement
                        error: 'Audio asset not accessible'
                    }
                });
                return {
                    success: false,
                    trackId,
                    status: 'retry_wait',
                    reason: 'Audio asset not accessible'
                };
            }

            // 7. Case B: Plain lyrics found -> Audio-Alignment using Deepgram word timestamps
            if (plainLyricsToAlign && plainLyricsToAlign.length > 20) {
                console.log(`[LyricEnrichment] Aligning plain lyrics to actual audio for "${track.title}" via Deepgram...`);
                await prisma.lyricEnrichmentJob.update({
                    where: { trackId: track.id },
                    data: { status: 'aligning', updatedAt: new Date() }
                });

                const alignedResult = await DeepgramLyricsService.alignPlainLyricsWithAudio(
                    track.audioUrl,
                    plainLyricsToAlign,
                    {
                        duration: track.duration,
                        songLang: track.language || undefined
                    }
                );

                if (alignedResult && alignedResult.syncedTokens && alignedResult.syncedTokens.length > 2) {
                    console.log(`[LyricEnrichment] Successfully aligned ${alignedResult.syncedTokens.length} lyric lines for "${track.title}". Saving to DB.`);

                    // Pre-save safety check
                    await prisma.track.update({
                        where: { id: track.id },
                        data: {
                            lyrics: alignedResult.plainLyrics || plainLyricsToAlign,
                            synced_lyrics: alignedResult.syncedTokens as any,
                            raw_lrc: alignedResult.rawLrc,
                            sync_source: 'DEEPGRAM_ALIGNMENT'
                        }
                    });

                    // Trigger romanization if regional
                    try {
                        const { enqueueRomanization } = await import('../queues/romanization.queue.js');
                        await enqueueRomanization({ trackId: track.id }).catch(() => {});
                    } catch {}

                    await prisma.lyricEnrichmentJob.update({
                        where: { trackId: track.id },
                        data: {
                            status: 'synced',
                            source: 'deepgram',
                            enrichmentType: 'aligned_plain',
                            confidence: 0.9,
                            error: null,
                            updatedAt: new Date()
                        }
                    });

                    return {
                        success: true,
                        trackId,
                        status: 'synced',
                        enrichmentType: 'aligned_plain',
                        source: 'deepgram',
                        lineCount: alignedResult.syncedTokens.length
                    };
                } else {
                    console.warn(`[LyricEnrichment] Alignment produced no tokens. Falling back to direct STT transcription.`);
                }
            }

            // 8. Case A / Outcome C: Direct Deepgram Audio Transcription
            console.log(`[LyricEnrichment] Transcribing vocals directly from audio for "${track.title}" via Deepgram STT...`);
            await prisma.lyricEnrichmentJob.update({
                where: { trackId: track.id },
                data: { status: 'transcribing', updatedAt: new Date() }
            });

            const sttResult = await DeepgramLyricsService.generateLyricsFromSong(
                track.audioUrl,
                {
                    duration: track.duration,
                    songLang: track.language || undefined
                }
            );

            // 9. Step 5 Validation — Detect instrumental tracks and empty vocal tracks
            if (!sttResult || !sttResult.syncedTokens || sttResult.syncedTokens.length === 0) {
                console.log(`[LyricEnrichment] Deepgram detected NO vocal utterances in "${track.title}". Classifying as no_lyrics_detected.`);
                await prisma.lyricEnrichmentJob.update({
                    where: { trackId: track.id },
                    data: {
                        status: 'no_lyrics_detected',
                        enrichmentType: 'no_vocals',
                        source: 'deepgram_stt',
                        confidence: 0.95,
                        error: null,
                        updatedAt: new Date()
                    }
                });
                return {
                    success: true,
                    trackId,
                    status: 'no_lyrics_detected',
                    enrichmentType: 'no_vocals',
                    reason: 'No detectable vocal content in audio'
                };
            }

            // Validation thresholds (Section 9.5)
            const cleanTokens = sttResult.syncedTokens.filter(t => t.type !== 'instrumental');
            const totalWords = cleanTokens.reduce((acc, t) => acc + (t.words?.length || t.text.split(/\s+/).length), 0);

            if (track.duration > 40 && totalWords < 4) {
                console.warn(`[LyricEnrichment] Transcript suspiciously short (${totalWords} words for ${track.duration}s). Classifying as no_lyrics_detected.`);
                await prisma.lyricEnrichmentJob.update({
                    where: { trackId: track.id },
                    data: {
                        status: 'no_lyrics_detected',
                        enrichmentType: 'no_vocals',
                        source: 'deepgram_stt',
                        confidence: 0.8,
                        error: 'Suspiciously sparse vocals / audio artifacts',
                        updatedAt: new Date()
                    }
                });
                return {
                    success: true,
                    trackId,
                    status: 'no_lyrics_detected',
                    enrichmentType: 'no_vocals',
                    reason: 'Audio contains insufficient vocal signals'
                };
            }

            // Save validated STT synced lyrics to DB
            console.log(`[LyricEnrichment] Successfully transcribed ${sttResult.syncedTokens.length} lines (${totalWords} words) for "${track.title}".`);
            await prisma.track.update({
                where: { id: track.id },
                data: {
                    lyrics: sttResult.plainLyrics,
                    synced_lyrics: sttResult.syncedTokens as any,
                    raw_lrc: sttResult.rawLrc,
                    sync_source: 'DEEPGRAM_STT'
                }
            });

            // Trigger romanization if regional
            try {
                const { enqueueRomanization } = await import('../queues/romanization.queue.js');
                await enqueueRomanization({ trackId: track.id }).catch(() => {});
            } catch {}

            await prisma.lyricEnrichmentJob.update({
                where: { trackId: track.id },
                data: {
                    status: 'synced',
                    source: 'deepgram',
                    enrichmentType: 'transcribed_stt',
                    confidence: 0.88,
                    error: null,
                    updatedAt: new Date()
                }
            });

            return {
                success: true,
                trackId,
                status: 'synced',
                enrichmentType: 'transcribed_stt',
                source: 'deepgram',
                lineCount: sttResult.syncedTokens.length
            };

        } catch (err: any) {
            console.error(`[LyricEnrichment] Exception processing track "${track.title}" (${track.id}):`, err.message);

            // Bounded retry policy with exponential backoff & jitter (Section 9.10)
            const isTerminal = currentAttempts >= this.MAX_JOB_ATTEMPTS;
            const backoffDelayMs = Math.min(
                24 * 60 * 60 * 1000,
                60000 * Math.pow(2, currentAttempts - 1) + Math.floor(Math.random() * 15000)
            );
            const nextRetry = new Date(Date.now() + backoffDelayMs);

            await prisma.lyricEnrichmentJob.update({
                where: { trackId: track.id },
                data: {
                    status: isTerminal ? 'failed' : 'retry_wait',
                    attempts: currentAttempts,
                    nextRetryAt: isTerminal ? null : nextRetry,
                    error: (err.message || 'Unknown processing error').slice(0, 500),
                    updatedAt: new Date()
                }
            }).catch(() => {});

            return {
                success: false,
                trackId,
                status: isTerminal ? 'failed' : 'retry_wait',
                reason: err.message
            };
        }
    }

    /**
     * Get real-time enrichment metrics and monitoring status
     */
    static async getStats() {
        const fiveMinutesAgo = new Date(Date.now() - this.IMPORT_GRACE_PERIOD_MS);

        const [
            totalTracks,
            noLyricsTracks,
            jobsByStatus,
            recentJobs
        ] = await Promise.all([
            prisma.track.count({ where: { deletedAt: null } }),
            prisma.track.count({
                where: {
                    deletedAt: null,
                    OR: [
                        { lyrics: null },
                        { lyrics: '' }
                    ]
                }
            }),
            prisma.lyricEnrichmentJob.groupBy({
                by: ['status'],
                _count: { _all: true }
            }),
            prisma.lyricEnrichmentJob.findMany({
                take: 10,
                orderBy: { updatedAt: 'desc' },
                include: {
                    track: { select: { id: true, title: true, artist: { select: { name: true } } } }
                }
            })
        ]);

        const statusCounts: Record<string, number> = {};
        for (const item of jobsByStatus) {
            statusCounts[item.status] = item._count._all;
        }

        const skippedGracePeriodCount = await prisma.track.count({
            where: {
                deletedAt: null,
                createdAt: { gt: fiveMinutesAgo },
                OR: [
                    { lyrics: null },
                    { lyrics: '' }
                ]
            }
        });

        return {
            totalTracks,
            tracksNeedingLyrics: noLyricsTracks,
            skippedGracePeriodCount,
            jobsByStatus: statusCounts,
            recentJobs
        };
    }

    /**
     * Explicitly check and calibrate lyrics onset with Deepgram for an existing track.
     */
    static async verifyTrackLyricsOnset(trackId: string): Promise<any> {
        const track = await prisma.track.findUnique({
            where: { id: trackId },
            include: { artist: true }
        });
        if (!track || !track.audioUrl) {
            throw new Error(`Track ${trackId} not found or missing audioUrl`);
        }
        if (!track.synced_lyrics || !Array.isArray(track.synced_lyrics) || track.synced_lyrics.length === 0) {
            // Track has no synced lyrics, trigger full enrichment
            return this.processTrack(trackId, { force: true, userInitiated: true });
        }
        return DeepgramLyricsService.verifyAndAlignLyricOnset({
            audioSource: track.audioUrl,
            syncedLyrics: track.synced_lyrics as any,
            rawLrc: track.raw_lrc || undefined,
            language: track.language || undefined,
            trackId: track.id,
            title: track.title,
        });
    }
}
