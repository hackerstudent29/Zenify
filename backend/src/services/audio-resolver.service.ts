import { prisma } from '../utils/prisma';
import { runYtDlp } from './external-metadata.service.js';
import axios from 'axios';

export interface CanonicalTrackInput {
  id?: string;
  title: string;
  primaryArtist: string;
  album?: string;
  duration?: number;
  isrc?: string;
  videoId?: string;
  youtubeId?: string;
}

export interface CandidateAudio {
  id: string;
  title: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  description?: string;
  url?: string;
}

export interface AudioResolutionResult {
  videoId: string | null;
  watchUrl: string | null;
  streamUrl: string | null;
  score: number;
  verified: boolean;
  source: 'exact_catalog_id' | 'candidate_matched' | 'unverified_fallback' | 'preview_fallback';
  otherVersions?: Array<{ id: string; title: string; uploader?: string; versionType: string }>;
  decisionLog: string;
}

const HARD_REJECT_TERMS = [
  'cover', 'karaoke', 'instrumental', 'remix', 'reprise', 
  'slowed', 'reverb', 'sped up', 'speed up', 'nightcore', 
  '8d', 'live', 'reaction', 'tribute', 'parody', 'fan made', 'acoustic cover',
  'dialogue', 'dialogues', 'punch dialogue', 'scene', 'scenes',
  'trailer', 'teaser', 'official trailer', 'official teaser', 'glimpse', 'promo',
  'sound effect', 'sound effects', 'sfx', 'making of', 'behind the scenes',
  'status', 'whatsapp status', 'short', 'shorts', 'ringtone', 'bgm clip'
];

function cleanTitle(str: string): string {
  return (str || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\{.*?\}/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanArtist(str: string): string {
  return (str || '')
    .toLowerCase()
    .split(/[,&/|]/)[0]
    .replace(/\s*feat\.?\s*.*/i, '')
    .replace(/\s*ft\.?\s*.*/i, '')
    .trim();
}

export class AudioResolverService {
  /**
   * Main Canonical Audio Resolver
   * Never picks a random cover. Validates via strict scoring.
   */
  static async resolveBestAudioSource(canonical: CanonicalTrackInput): Promise<AudioResolutionResult> {
    const rawTitle = canonical.title || '';
    const rawArtist = canonical.primaryArtist || '';
    const canonicalDur = canonical.duration && canonical.duration > 0 ? canonical.duration : undefined;

    // 1. Resolve by exact catalog ID first
    let directVideoId: string | null = null;
    if (canonical.youtubeId && /^[a-zA-Z0-9_-]{11}$/.test(canonical.youtubeId)) {
      directVideoId = canonical.youtubeId;
    } else if (canonical.videoId && /^[a-zA-Z0-9_-]{11}$/.test(canonical.videoId)) {
      directVideoId = canonical.videoId;
    } else if (canonical.id && canonical.id.startsWith('yt-')) {
      const parsed = canonical.id.replace('yt-', '').trim();
      if (/^[a-zA-Z0-9_-]{11}$/.test(parsed)) directVideoId = parsed;
    }

    if (directVideoId) {
      const watchUrl = `https://www.youtube.com/watch?v=${directVideoId}`;
      const streamUrl = `/api/utils/stream-youtube?url=${encodeURIComponent(watchUrl)}`;
      const log = `[AudioResolver] EXACT ID matched from catalog: ${directVideoId} for "${rawTitle}" by "${rawArtist}"`;
      console.log(log);

      // Persist if canonical track has a DB id
      if (canonical.id && !canonical.id.startsWith('yt-') && !canonical.id.startsWith('itunes-') && !canonical.id.startsWith('sp-')) {
        prisma.track.update({
          where: { id: canonical.id },
          data: {
            youtubeId: directVideoId,
            audioResolutionScore: 100,
          }
        }).catch(() => {});
      }

      return {
        videoId: directVideoId,
        watchUrl,
        streamUrl,
        score: 100,
        verified: true,
        source: 'exact_catalog_id',
        decisionLog: log
      };
    }

    // 2. No direct ID: Fetch 10 Candidates across parallel channels
    const candidates = await this.fetchCandidates(rawTitle, rawArtist);
    if (!candidates || candidates.length === 0) {
      const log = `[AudioResolver] Zero audio candidates retrieved for "${rawTitle}" by "${rawArtist}"`;
      console.warn(log);
      return {
        videoId: null,
        watchUrl: null,
        streamUrl: null,
        score: 0,
        verified: false,
        source: 'unverified_fallback',
        decisionLog: log
      };
    }

    // 3. Score Each Candidate
    const targetCleanTitle = cleanTitle(rawTitle);
    const targetCleanArtist = cleanArtist(rawArtist);

    // Identify allowed terms in original title (e.g. if the original song IS a remix or reprise)
    const allowedRejectTerms = HARD_REJECT_TERMS.filter(term => 
      rawTitle.toLowerCase().includes(term)
    );

    const scored: Array<{
      candidate: CandidateAudio;
      score: number;
      reasons: string[];
      isHardRejected: boolean;
      versionType: string;
    }> = [];

    const otherVersions: Array<{ id: string; title: string; uploader?: string; versionType: string }> = [];

    for (const cand of candidates) {
      let score = 0;
      const reasons: string[] = [];
      const candTitleLower = (cand.title || '').toLowerCase();
      const candCleanTitle = cleanTitle(cand.title || '');
      const uploaderLower = (cand.uploader || cand.channel || '').toLowerCase();
      const descLower = (cand.description || '').toLowerCase();

      // Check hard rejects
      let isHardRejected = false;
      let rejectedTerm = '';
      for (const term of HARD_REJECT_TERMS) {
        if (!allowedRejectTerms.includes(term) && (candTitleLower.includes(term) || uploaderLower.includes(term))) {
          isHardRejected = true;
          rejectedTerm = term;
          break;
        }
      }

      if (isHardRejected) {
        reasons.push(`Hard reject: contains "${rejectedTerm}"`);
        otherVersions.push({
          id: cand.id,
          title: cand.title,
          uploader: cand.uploader || cand.channel,
          versionType: rejectedTerm
        });
        scored.push({
          candidate: cand,
          score: -999,
          reasons,
          isHardRejected: true,
          versionType: rejectedTerm
        });
        continue;
      }

      // 1. Normalized Title Match
      if (candCleanTitle === targetCleanTitle) {
        score += 45;
        reasons.push('+45 Exact title match');
      } else if (candCleanTitle.startsWith(targetCleanTitle) || targetCleanCleanContains(candCleanTitle, targetCleanTitle)) {
        score += 30;
        reasons.push('+30 Substring title match');
      } else {
        const titleWords = targetCleanTitle.split(' ').filter(w => w.length > 2);
        const matchCount = titleWords.filter(w => candCleanTitle.includes(w)).length;
        if (titleWords.length > 0 && matchCount / titleWords.length >= 0.7) {
          score += 20;
          reasons.push(`+20 Fuzzy title match (${matchCount}/${titleWords.length} words)`);
        } else {
          score -= 30;
          reasons.push('-30 Weak title match');
        }
      }

      // 2. Strict 3-Tier Official Source Priority
      const isTopicChannel = uploaderLower.includes('- topic') || uploaderLower.endsWith('topic');
      const isOfficialArtist = uploaderLower.includes(targetCleanArtist) || 
                               uploaderLower.includes('vevo') || 
                               uploaderLower.includes('official') ||
                               uploaderLower.includes('records') ||
                               uploaderLower.includes('music') ||
                               uploaderLower.includes('t-series') ||
                               uploaderLower.includes('sony music') ||
                               uploaderLower.includes('zee music') ||
                               uploaderLower.includes('think music');

      const isOfficialAudioRelease = isTopicChannel || 
                                     candTitleLower.includes('official audio') || 
                                     descLower.includes('provided to youtube by') ||
                                     descLower.includes('released on');
      const isOfficialLyricVideo = candTitleLower.includes('lyric video') || 
                                   candTitleLower.includes('lyrics video') ||
                                   candTitleLower.includes('official lyrics');
      const isOfficialMusicVideo = candTitleLower.includes('official video') || 
                                   candTitleLower.includes('official music video') || 
                                   candTitleLower.includes('video song') ||
                                   candTitleLower.includes('music video');

      if (isOfficialAudioRelease) {
        // Priority 1: Official audio releases from verified artist channels, official labels, or release catalogs
        score += 50;
        reasons.push('+50 Priority 1: Official Audio release / Topic Channel');
      } else if (isOfficialLyricVideo) {
        // Priority 2: Official lyric videos
        score += 35;
        reasons.push('+35 Priority 2: Official Lyric Video');
      } else if (isOfficialMusicVideo) {
        // Priority 3: Official video-song tracks only as a last resort
        score += 20;
        reasons.push('+20 Priority 3: Official Video Song');
      } else if (isOfficialArtist) {
        score += 15;
        reasons.push('+15 Official / Label Channel');
      } else if (uploaderLower.includes(targetCleanArtist)) {
        score += 10;
        reasons.push('+10 Channel contains artist name');
      } else {
        score -= 25;
        reasons.push('-25 Channel does not match artist or official label');
      }

      // 3. Duration match (±3s or ±3%)
      if (canonicalDur && cand.duration && cand.duration > 0) {
        const diff = Math.abs(cand.duration - canonicalDur);
        const diffPct = (diff / canonicalDur) * 100;

        if (diff <= 3 || diffPct <= 3) {
          score += 25;
          reasons.push(`+25 Duration within ±3s/3% (diff ${diff}s)`);
        } else if (diff <= 7 || diffPct <= 6) {
          score += 15;
          reasons.push(`+15 Duration within ±7s (diff ${diff}s)`);
        } else if (diff > 25 || diffPct > 20) {
          score -= 40;
          reasons.push(`-40 Duration mismatch (diff ${diff}s)`);
        }
      }

      scored.push({
        candidate: cand,
        score,
        reasons,
        isHardRejected: false,
        versionType: isOfficialAudioRelease ? 'official_audio' : (isOfficialLyricVideo ? 'lyric_video' : (isOfficialMusicVideo ? 'music_video' : 'original'))
      });
    }

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    const SCORE_THRESHOLD = 50;

    let decisionLog = `[AudioResolver] Query: "${rawTitle}" - "${rawArtist}"\n`;
    scored.slice(0, 5).forEach((s, idx) => {
      decisionLog += `  #${idx + 1} [Score: ${s.score}] "${s.candidate.title}" (${s.candidate.id}) - ${s.candidate.uploader || 'Unknown uploader'} | Reasons: ${s.reasons.join(', ')}\n`;
    });

    console.log(decisionLog);

    if (best && best.score >= SCORE_THRESHOLD && !best.isHardRejected) {
      const bestVideoId = best.candidate.id;
      const watchUrl = `https://www.youtube.com/watch?v=${bestVideoId}`;
      const streamUrl = `/api/utils/stream-youtube?url=${encodeURIComponent(watchUrl)}`;

      // Persist chosen videoId, score, and other versions to database so it is never re-resolved!
      if (canonical.id && !canonical.id.startsWith('yt-') && !canonical.id.startsWith('itunes-') && !canonical.id.startsWith('sp-')) {
        prisma.track.update({
          where: { id: canonical.id },
          data: {
            youtubeId: bestVideoId,
            audioResolutionScore: best.score,
            otherVersions: otherVersions.slice(0, 5) as any
          }
        }).catch(() => {});
      }

      return {
        videoId: bestVideoId,
        watchUrl,
        streamUrl,
        score: best.score,
        verified: true,
        source: 'candidate_matched',
        otherVersions: otherVersions.slice(0, 5),
        decisionLog
      };
    }

    // Candidate failed minimum track-identity threshold: report source UNAVAILABLE instead of playing wrong song!
    const unverifiedLog = `[AudioResolver] Rejection: No candidate met verified threshold (${SCORE_THRESHOLD}). Best score: ${best?.score || 0}. Source reported unavailable.`;
    console.warn(unverifiedLog);

    return {
      videoId: null,
      watchUrl: null,
      streamUrl: null,
      score: best?.score || 0,
      verified: false,
      source: 'unverified_fallback',
      otherVersions: otherVersions.slice(0, 5),
      decisionLog: `${decisionLog}\n${unverifiedLog}`
    };
  }

  /**
   * Fetch 10 Candidates using parallel scrapers/APIs
   */
  private static async fetchCandidates(title: string, artist: string): Promise<CandidateAudio[]> {
    const primaryArtist = cleanArtist(artist);
    const queryTerm = `${primaryArtist} ${title}`.trim();
    const candidateMap = new Map<string, CandidateAudio>();

    const queries = [
      `${primaryArtist} ${title} official audio`,
      `${primaryArtist} ${title} topic`,
      `${primaryArtist} ${title}`
    ];

    // Priority 1: RapidAPI YouTube Music / play-dl
    try {
      const { ExternalMetadataService } = await import('./external-metadata.service.js');
      const rapidResults = await ExternalMetadataService.searchYoutubeRapidAPI(queries[0]).catch(() => []);
      if (rapidResults && rapidResults.length > 0) {
        for (const r of rapidResults) {
          if (r.id && !candidateMap.has(r.id)) {
            candidateMap.set(r.id, {
              id: r.id,
              title: r.title,
              uploader: r.uploader || r.channel,
              duration: r.duration
            });
          }
        }
      }
    } catch {}

    // Priority 2: yt-dlp flat-playlist 10 candidates
    if (candidateMap.size < 8) {
      try {
        const { stdout } = await runYtDlp([
          '--socket-timeout', '15',
          '--no-check-certificates',
          '--dump-json',
          '--flat-playlist',
          '--no-warnings',
          `ytsearch10:${queries[0]}`
        ]);

        const lines = stdout.trim().split('\n').filter(l => l.trim());
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.id && !candidateMap.has(parsed.id)) {
              candidateMap.set(parsed.id, {
                id: parsed.id,
                title: parsed.title,
                uploader: parsed.uploader || parsed.channel,
                duration: parsed.duration,
                description: parsed.description
              });
            }
          } catch {}
        }
      } catch (ytErr: any) {
        console.warn(`[AudioResolver] yt-dlp candidate search: ${ytErr.message?.slice(0, 80)}`);
      }
    }

    // Priority 3: Fallback scrapers
    if (candidateMap.size < 5) {
      try {
        const { ExternalMetadataService } = await import('./external-metadata.service.js');
        const fallbackResults = await ExternalMetadataService.searchYoutubeDirect(queries[1]).catch(() => []);
        for (const fb of fallbackResults) {
          if (fb.id && !candidateMap.has(fb.id)) {
            candidateMap.set(fb.id, {
              id: fb.id,
              title: fb.title,
              uploader: fb.uploader || fb.channel,
              duration: fb.duration
            });
          }
        }
      } catch {}
    }

    return Array.from(candidateMap.values()).slice(0, 10);
  }
}

function targetCleanCleanContains(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  return haystack.includes(needle);
}
