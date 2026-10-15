import { prisma } from '../utils/prisma';
import axios from 'axios';
import { AudioResolverService } from './audio-resolver.service';
import { CleanCdnAudioService } from './clean-cdn-audio.service';
import { ExternalMetadataService } from './external-metadata.service';

export type PlaybackIssueType = 
    | 'EMPTY_AUDIO_URL'
    | 'ITUNES_30S_PREVIEW'
    | 'EXPIRED_GOOGLEVIDEO_LINK'
    | 'HTTP_UNAVAILABLE'
    | 'YOUTUBE_UNPLAYABLE'
    | 'DURATION_ANOMALY';

export interface HealthCheckResult {
    isHealthy: boolean;
    issue: PlaybackIssueType | null;
    details?: string;
    statusCode?: number;
}

export interface HealResult {
    success: boolean;
    trackId: string;
    title: string;
    issue: PlaybackIssueType | null;
    resolvedUrl?: string;
    source?: string;
    error?: string;
    durationMs?: number;
}

export interface PlaybackHealthSweepReport {
    timestamp: string;
    totalScanned: number;
    healthyCount: number;
    issuesDiagnosed: number;
    successfullyHealed: number;
    issuesBreakdown: Record<PlaybackIssueType, number>;
    healLog: Array<{
        trackId: string;
        title: string;
        artist: string;
        issue: PlaybackIssueType;
        resolvedUrl: string;
        source: string;
    }>;
}

export class SongPlaybackHealthService {
    private static isSweepRunning = false;
    private static lastSweepReport: PlaybackHealthSweepReport | null = null;
    private static totalDiagnosedLifetime = 0;
    private static totalHealedLifetime = 0;

    /**
     * Diagnose a single track: analyzes why a song is playing or not playing
     */
    static async analyzeTrackPlaybackHealth(trackOrId: string | {
        id: string;
        title: string;
        audioUrl?: string | null;
        youtubeId?: string | null;
        duration?: number | null;
        artist?: { name?: string | null } | null;
    }): Promise<HealthCheckResult> {
        let track: {
            id: string;
            title: string;
            audioUrl?: string | null;
            youtubeId?: string | null;
            duration?: number | null;
            artist?: { name?: string | null } | null;
        };

        if (typeof trackOrId === 'string') {
            const fetched = await prisma.track.findUnique({
                where: { id: trackOrId },
                include: { artist: { select: { name: true } } }
            });
            if (!fetched) {
                return {
                    isHealthy: false,
                    issue: 'EMPTY_AUDIO_URL',
                    details: 'Track not found in database'
                };
            }
            track = fetched;
        } else {
            track = trackOrId;
        }

        const url = (track.audioUrl || '').trim();

        // 1. Missing or empty audio URL
        if (!url || url.length < 5) {
            return {
                isHealthy: false,
                issue: 'EMPTY_AUDIO_URL',
                details: 'audioUrl is empty or missing'
            };
        }

        // 2. iTunes 30-Second Preview Snippet
        const isSnippet = url.includes('audio-ssl') || 
                          url.includes('mzstatic') || 
                          url.includes('itunes.apple.com') || 
                          url.includes('preview-ssl');
        if (isSnippet) {
            return {
                isHealthy: false,
                issue: 'ITUNES_30S_PREVIEW',
                details: 'Track is using a 30-second iTunes preview snippet instead of full stream'
            };
        }

        // 3. Expired direct googlevideo URL
        if (url.includes('googlevideo.com')) {
            const expireMatch = url.match(/[?&]expire=([0-9]+)/);
            if (expireMatch) {
                const expireTimestamp = parseInt(expireMatch[1], 10) * 1000;
                if (Date.now() > expireTimestamp) {
                    return {
                        isHealthy: false,
                        issue: 'EXPIRED_GOOGLEVIDEO_LINK',
                        details: `Direct googlevideo CDN stream token expired at ${new Date(expireTimestamp).toISOString()}`
                    };
                }
            }
        }

        // 4. Abnormal duration check
        const isIntroOrSkit = /\b(intro|outro|interlude|skit|trailer|teaser)\b/i.test(track.title);
        if (track.duration && track.duration > 0 && track.duration < 35 && !isIntroOrSkit) {
            return {
                isHealthy: false,
                issue: 'DURATION_ANOMALY',
                details: `Duration is abnormally short (${track.duration}s) for a regular song`
            };
        }

        // 5. Direct Remote Link Verification (S3, R2, Cloudinary, Saavn CDN)
        if (url.startsWith('http://') || url.startsWith('https://')) {
            // Exclude dynamic internal proxies and streaming endpoints from external ping
            if (!url.includes('/stream-youtube') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
                try {
                    const probeRes = await axios.head(url, {
                        timeout: 4000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Range': 'bytes=0-1'
                        },
                        validateStatus: (status) => status < 500
                    });

                    if (probeRes.status === 404 || probeRes.status === 410) {
                        return {
                            isHealthy: false,
                            issue: 'HTTP_UNAVAILABLE',
                            statusCode: probeRes.status,
                            details: `Remote audio file returned HTTP ${probeRes.status} (Resource Gone or Not Found)`
                        };
                    }
                    if (probeRes.status === 403 && !url.includes('googlevideo.com')) {
                        return {
                            isHealthy: false,
                            issue: 'HTTP_UNAVAILABLE',
                            statusCode: 403,
                            details: 'Remote audio file returned HTTP 403 Forbidden (Token Expired or Access Denied)'
                        };
                    }
                } catch (probeErr: any) {
                    if (probeErr.response?.status === 404 || probeErr.response?.status === 410) {
                        return {
                            isHealthy: false,
                            issue: 'HTTP_UNAVAILABLE',
                            statusCode: probeErr.response.status,
                            details: `Remote audio host returned HTTP ${probeErr.response.status}`
                        };
                    }
                    // Network timeout or host unreachable
                    if (probeErr.code === 'ECONNREFUSED' || probeErr.code === 'ENOTFOUND') {
                        return {
                            isHealthy: false,
                            issue: 'HTTP_UNAVAILABLE',
                            details: `Remote host unreachable: ${probeErr.code}`
                        };
                    }
                }
            }
        }

        // 6. YouTube stream availability check
        if (url.includes('/stream-youtube') || url.includes('youtube.com') || url.includes('youtu.be') || track.youtubeId) {
            const videoIdMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) || 
                                 url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/) ||
                                 (track.youtubeId ? [null, track.youtubeId] : null);

            if (videoIdMatch && videoIdMatch[1]) {
                const vid = videoIdMatch[1];
                try {
                    const oembed = await axios.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vid}&format=json`, {
                        timeout: 3000
                    }).catch((err) => err.response);

                    if (oembed && (oembed.status === 404 || oembed.status === 401 || oembed.status === 403)) {
                        return {
                            isHealthy: false,
                            issue: 'YOUTUBE_UNPLAYABLE',
                            statusCode: oembed.status,
                            details: `YouTube video ${vid} is deleted, private, or blocked (HTTP ${oembed.status})`
                        };
                    }
                } catch {}
            }
        }

        return {
            isHealthy: true,
            issue: null,
            details: 'Song stream is healthy and playable'
        };
    }

    /**
     * Self-healing resolver: when a song is diagnosed as not playing,
     * this automatically resolves and heals the audio source from high-speed canonical engines.
     */
    static async healTrackPlayback(
        trackId: string, 
        diagnosedIssue?: PlaybackIssueType
    ): Promise<HealResult> {
        const startTime = Date.now();

        const track = await prisma.track.findUnique({
            where: { id: trackId },
            include: {
                artist: { select: { id: true, name: true } },
                album: { select: { id: true, title: true } }
            }
        });

        if (!track) {
            return {
                success: false,
                trackId,
                title: 'Unknown',
                issue: diagnosedIssue || null,
                error: 'Track not found in database'
            };
        }

        const artistName = track.artist?.name || '';
        let issue = diagnosedIssue;

        // If issue was not pre-diagnosed, run diagnosis now
        if (!issue) {
            const analysis = await this.analyzeTrackPlaybackHealth(track);
            if (analysis.isHealthy) {
                return {
                    success: true,
                    trackId,
                    title: track.title,
                    issue: null,
                    resolvedUrl: track.audioUrl,
                    source: 'already_healthy'
                };
            }
            issue = analysis.issue || 'EMPTY_AUDIO_URL';
        }

        console.log(`[SongHealthWorker] 🩺 Healing track "${track.title}" by "${artistName}" (Diagnosed issue: [${issue}])...`);

        let newAudioUrl: string | null = null;
        let newYoutubeId: string | null = null;
        let newScore = 80;
        let resolutionSource = 'unknown';
        let newDuration = track.duration || 180;

        // =========================================================================
        // TIER 1: Pristine Direct 320kbps CDN Resolution (Saavn Clean Engine)
        // =========================================================================
        try {
            const cleanCdn = await CleanCdnAudioService.resolveAudio({
                title: track.title,
                primaryArtist: artistName,
                album: track.album?.title,
                duration: track.duration,
                language: track.language || undefined
            });

            if (cleanCdn && cleanCdn.url && cleanCdn.url.startsWith('http')) {
                newAudioUrl = cleanCdn.url;
                newScore = 100;
                resolutionSource = 'clean_320kbps_cdn';
                if (cleanCdn.duration && cleanCdn.duration > 30) {
                    newDuration = cleanCdn.duration;
                }
                console.log(`[SongHealthWorker] ⚡ Tier 1 Clean CDN matched for "${track.title}": ${newAudioUrl.slice(0, 80)}...`);
            }
        } catch (cdnErr: any) {
            console.warn(`[SongHealthWorker] Tier 1 Clean CDN notice for "${track.title}":`, cdnErr.message);
        }

        // =========================================================================
        // TIER 2: Canonical Multi-Candidate YouTube Stream Resolver
        // =========================================================================
        if (!newAudioUrl) {
            try {
                const resolution = await AudioResolverService.resolveBestAudioSource({
                    id: track.id,
                    title: track.title,
                    primaryArtist: artistName,
                    album: track.album?.title,
                    duration: track.duration,
                    language: track.language || undefined
                }, true); // forceRefresh = true

                if (resolution && resolution.watchUrl) {
                    newYoutubeId = resolution.videoId;
                    newScore = resolution.score;
                    resolutionSource = `youtube_verified_${resolution.source}`;
                    newAudioUrl = `/api/utils/stream-youtube?url=${encodeURIComponent(resolution.watchUrl)}&trackId=${track.id}&title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(artistName)}`;
                    console.log(`[SongHealthWorker] 🎯 Tier 2 YouTube Resolver matched for "${track.title}" (Score: ${resolution.score}): ${resolution.watchUrl}`);
                }
            } catch (ytErr: any) {
                console.warn(`[SongHealthWorker] Tier 2 YouTube Resolver notice for "${track.title}":`, ytErr.message);
            }
        }

        // =========================================================================
        // TIER 3: Resilient Stream Intake / Apify Spotify Fallback
        // =========================================================================
        if (!newAudioUrl) {
            try {
                const searchTarget = `${artistName} - ${track.title}`;
                const fullTrack = await ExternalMetadataService.fetchAudio(
                    track.title, 
                    artistName, 
                    undefined, 
                    undefined, 
                    { preview: false, bypassCache: true }
                );

                if (fullTrack?.url && !fullTrack.url.includes('audio-ssl') && !fullTrack.url.includes('mzstatic')) {
                    newAudioUrl = fullTrack.url;
                    resolutionSource = 'external_metadata_fallback';
                    newScore = 75;
                }
            } catch (extErr: any) {
                console.warn(`[SongHealthWorker] Tier 3 External Fallback notice for "${track.title}":`, extErr.message);
            }
        }

        // If resolution succeeded, persist the self-healed track to DB
        if (newAudioUrl) {
            await prisma.track.update({
                where: { id: track.id },
                data: {
                    audioUrl: newAudioUrl,
                    youtubeId: newYoutubeId || undefined,
                    audioResolutionScore: newScore,
                    duration: newDuration,
                    releaseStatus: 'PUBLISHED',
                    updatedAt: new Date()
                }
            });

            this.totalHealedLifetime++;
            const durationMs = Date.now() - startTime;
            console.log(`[SongHealthWorker] ✅ Healed track "${track.title}" successfully in ${durationMs}ms [${resolutionSource}].`);

            return {
                success: true,
                trackId: track.id,
                title: track.title,
                issue,
                resolvedUrl: newAudioUrl,
                source: resolutionSource,
                durationMs
            };
        }

        return {
            success: false,
            trackId: track.id,
            title: track.title,
            issue,
            error: 'Could not automatically resolve a healthy audio stream from any tier'
        };
    }

    /**
     * Automated Background Sweep:
     * Discovers unplayable or broken tracks, diagnoses what problem they suffer from,
     * and automatically self-heals them.
     */
    static async runAutomatedHealthSweep(batchSize = 25): Promise<PlaybackHealthSweepReport> {
        if (this.isSweepRunning) {
            console.log('[SongHealthWorker] Previous sweep is already running. Skipping concurrent cycle.');
            return this.lastSweepReport || {
                timestamp: new Date().toISOString(),
                totalScanned: 0,
                healthyCount: 0,
                issuesDiagnosed: 0,
                successfullyHealed: 0,
                issuesBreakdown: {
                    EMPTY_AUDIO_URL: 0,
                    ITUNES_30S_PREVIEW: 0,
                    EXPIRED_GOOGLEVIDEO_LINK: 0,
                    HTTP_UNAVAILABLE: 0,
                    YOUTUBE_UNPLAYABLE: 0,
                    DURATION_ANOMALY: 0
                },
                healLog: []
            };
        }

        this.isSweepRunning = true;
        console.log(`[SongHealthWorker] 🚀 Starting automated song playback health sweep (Batch: ${batchSize})...`);

        const issuesBreakdown: Record<PlaybackIssueType, number> = {
            EMPTY_AUDIO_URL: 0,
            ITUNES_30S_PREVIEW: 0,
            EXPIRED_GOOGLEVIDEO_LINK: 0,
            HTTP_UNAVAILABLE: 0,
            YOUTUBE_UNPLAYABLE: 0,
            DURATION_ANOMALY: 0
        };

        const healLog: PlaybackHealthSweepReport['healLog'] = [];
        let healthyCount = 0;
        let issuesDiagnosed = 0;
        let successfullyHealed = 0;

        try {
            // Find candidates prioritizing tracks with known vulnerability markers:
            // 1. Snippets (audio-ssl / itunes)
            // 2. Empty or missing audioUrl
            // 3. Expired googlevideo links
            // 4. Low resolution score or unverified
            const tracks = await prisma.track.findMany({
                where: {
                    deletedAt: null,
                    OR: [
                        { audioUrl: '' },
                        { audioUrl: { contains: 'audio-ssl' } },
                        { audioUrl: { contains: 'mzstatic' } },
                        { audioUrl: { contains: 'googlevideo.com' } },
                        { audioResolutionScore: { lt: 70 } },
                        { audioResolutionScore: null }
                    ]
                },
                include: {
                    artist: { select: { id: true, name: true } },
                    album: { select: { id: true, title: true } }
                },
                take: batchSize,
                orderBy: { updatedAt: 'asc' } // Oldest verified first
            });

            // If no vulnerable tracks found, scan routine tracks to maintain health across the catalog
            let candidates = tracks;
            if (candidates.length === 0) {
                candidates = await prisma.track.findMany({
                    where: { deletedAt: null },
                    include: {
                        artist: { select: { id: true, name: true } },
                        album: { select: { id: true, title: true } }
                    },
                    take: Math.min(10, batchSize),
                    orderBy: { updatedAt: 'asc' }
                });
            }

            for (const track of candidates) {
                const analysis = await this.analyzeTrackPlaybackHealth(track);

                if (analysis.isHealthy) {
                    healthyCount++;
                } else if (analysis.issue) {
                    issuesDiagnosed++;
                    this.totalDiagnosedLifetime++;
                    issuesBreakdown[analysis.issue] = (issuesBreakdown[analysis.issue] || 0) + 1;

                    console.log(`[SongHealthWorker] ⚠️ Issue diagnosed for "${track.title}": [${analysis.issue}] -> ${analysis.details}`);

                    // Attempt automated resolution
                    const healed = await this.healTrackPlayback(track.id, analysis.issue);
                    if (healed.success && healed.resolvedUrl) {
                        successfullyHealed++;
                        healLog.push({
                            trackId: track.id,
                            title: track.title,
                            artist: track.artist?.name || 'Unknown',
                            issue: analysis.issue,
                            resolvedUrl: healed.resolvedUrl,
                            source: healed.source || 'automated_resolver'
                        });
                    }
                }
            }

            const report: PlaybackHealthSweepReport = {
                timestamp: new Date().toISOString(),
                totalScanned: candidates.length,
                healthyCount,
                issuesDiagnosed,
                successfullyHealed,
                issuesBreakdown,
                healLog
            };

            this.lastSweepReport = report;
            console.log(`[SongHealthWorker] ✅ Health sweep complete: Scanned ${candidates.length} tracks. Healthy: ${healthyCount}, Issues Diagnosed: ${issuesDiagnosed}, Healed: ${successfullyHealed}.`);
            return report;
        } catch (err: any) {
            console.error('[SongHealthWorker] Health sweep encountered an error:', err.message);
            return {
                timestamp: new Date().toISOString(),
                totalScanned: 0,
                healthyCount: 0,
                issuesDiagnosed: 0,
                successfullyHealed: 0,
                issuesBreakdown,
                healLog
            };
        } finally {
            this.isSweepRunning = false;
        }
    }

    /**
     * Get real-time health worker status and metrics
     */
    static async getHealthReport() {
        const unplayableCount = await prisma.track.count({
            where: {
                deletedAt: null,
                OR: [
                    { audioUrl: '' },
                    { audioUrl: { contains: 'audio-ssl' } },
                    { audioUrl: { contains: 'mzstatic' } },
                    { audioUrl: { contains: 'preview-ssl' } },
                    { audioResolutionScore: { lt: 0.5 } }
                ]
            }
        });

        const verifiedCount = await prisma.track.count({
            where: {
                deletedAt: null,
                audioResolutionScore: { gte: 0.85 }
            }
        });

        return {
            metrics: this.getMetrics(),
            unplayableCount,
            verifiedCount,
            lastSweepReport: this.lastSweepReport
        };
    }

    static getMetrics() {
        return {
            isSweepRunning: this.isSweepRunning,
            totalDiagnosedLifetime: this.totalDiagnosedLifetime,
            totalHealedLifetime: this.totalHealedLifetime,
            lastSweepReport: this.lastSweepReport
        };
    }
}

export const SongHealthWorker = SongPlaybackHealthService;
