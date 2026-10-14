import { prisma } from '../utils/prisma';
import { runYtDlp } from './external-metadata.service.js';
import axios from 'axios';

export interface CanonicalTrackInput {
  id?: string;
  title: string;
  primaryArtist: string;
  album?: string;
  duration?: number;
  language?: string;
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
  'unplugged', 'acoustic',
  'dialogue', 'dialogues', 'punch dialogue', 'scene', 'scenes', 'climax',
  'trailer', 'teaser', 'official trailer', 'official teaser', 'glimpse', 'promo',
  'sound effect', 'sound effects', 'sfx', 'making of', 'behind the scenes',
  'status', 'whatsapp status', 'short', 'shorts', 'ringtone', 'bgm clip',
  'full movie', 'comedy scene', 'short film', 'visualizer'
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

    // 0. Strict Language Detection & Normalization
    const titleAndAlbum = `${rawTitle} ${canonical.album || ''}`.toLowerCase();
    const knownLanguages = ['tamil', 'telugu', 'hindi', 'malayalam', 'kannada', 'punjabi', 'bengali', 'marathi', 'gujarati', 'spanish', 'korean', 'japanese', 'french'];
    let resolvedLanguage = canonical.language?.toLowerCase().trim();

    // Check explicit language tag in title or album first
    for (const l of knownLanguages) {
      const pat = new RegExp(`([\\[\\(\\-\\–\\|]\\s*${l}\\s*[\\]\\)\\-\\–\\|]|\\b${l}\\s*(version|audio|song|track)?\\b)`, 'i');
      if (pat.test(titleAndAlbum)) {
        resolvedLanguage = l;
        break;
      }
    }

    // Fallback: If language is missing or default english, resolve mother tongue / native language
    if (!resolvedLanguage || resolvedLanguage === 'english') {
      try {
        const { AILyricsService } = await import('./ai-lyrics.service.js');
        const detected = await AILyricsService.detectSongLanguageDetails({
          title: rawTitle,
          artist: rawArtist,
          album: canonical.album
        });
        if (detected && detected.language && !detected.isEnglish) {
          resolvedLanguage = detected.language.toLowerCase();
        }
      } catch (err) {}
    }

    canonical.language = resolvedLanguage || canonical.language || 'english';

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

    // 2. No direct ID: Fetch Candidates prioritizing Official Audio & Lyric Videos
    const candidates = await this.fetchCandidates(rawTitle, rawArtist, canonical.language);
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

      // STRICT RULE 1: Never fetch cinematic video songs (contain movie dialogues, sound effects, intros)
      const isLyricKeyword = candTitleLower.includes('lyric') || candTitleLower.includes('lyrics') || candTitleLower.includes('lyrical');
      const isAudioKeyword = candTitleLower.includes('audio') || candTitleLower.includes('official audio') || uploaderLower.includes('- topic') || uploaderLower.endsWith('topic');
      const isCinematicVideoSong = (
        candTitleLower.includes('video song') || 
        candTitleLower.includes('music video') || 
        candTitleLower.includes('full video') ||
        candTitleLower.includes('official video') ||
        candTitleLower.includes('movie scene') ||
        candTitleLower.includes('climax scene') ||
        candTitleLower.includes('visualizer')
      ) && !isAudioKeyword && !isLyricKeyword;

      if (isCinematicVideoSong) {
        reasons.push('Hard reject: Cinematic video song strictly excluded');
        otherVersions.push({
          id: cand.id,
          title: cand.title,
          uploader: cand.uploader || cand.channel,
          versionType: 'music_video'
        });
        scored.push({
          candidate: cand,
          score: -999,
          reasons,
          isHardRejected: true,
          versionType: 'music_video'
        });
        continue;
      }

      // STRICT RULE 2: Exact Language Match (Reject candidates in another language)
      if (canonical.language) {
        const reqLang = canonical.language.toLowerCase().trim();
        const candCombined = `${candTitleLower} ${uploaderLower} ${descLower}`;
        const knownLanguages = ['tamil', 'telugu', 'hindi', 'malayalam', 'kannada', 'punjabi', 'bengali', 'marathi', 'gujarati', 'english', 'spanish', 'korean'];
        const conflictingLangs = knownLanguages.filter(l => l !== reqLang && candCombined.includes(l));

        if (conflictingLangs.length > 0 && !candCombined.includes(reqLang)) {
          const conf = conflictingLangs.join(', ');
          reasons.push(`Hard reject: Language mismatch (contains ${conf}, requested ${reqLang})`);
          otherVersions.push({
            id: cand.id,
            title: cand.title,
            uploader: cand.uploader || cand.channel,
            versionType: `lang_${conf}`
          });
          scored.push({
            candidate: cand,
            score: -999,
            reasons,
            isHardRejected: true,
            versionType: `lang_${conf}`
          });
          continue;
        }

        if (candCombined.includes(reqLang)) {
          score += 35;
          reasons.push(`+35 Confirmed requested language: ${reqLang}`);
        }
      }

      // STRICT RULE 3: Duration Validation (Reject drift >12s caused by dialogue/intros/outros)
      if (canonicalDur && cand.duration && cand.duration > 0) {
        const diff = Math.abs(cand.duration - canonicalDur);
        const diffPct = (diff / canonicalDur) * 100;

        if (diff > 12 && diffPct > 6) {
          reasons.push(`Hard reject: Duration mismatch of ${diff}s (>12s drift)`);
          otherVersions.push({
            id: cand.id,
            title: cand.title,
            uploader: cand.uploader || cand.channel,
            versionType: 'duration_mismatch'
          });
          scored.push({
            candidate: cand,
            score: -999,
            reasons,
            isHardRejected: true,
            versionType: 'duration_mismatch'
          });
          continue;
        }

        if (diff <= 3 || diffPct <= 3) {
          score += 30;
          reasons.push(`+30 Duration within ±3s/3% (diff ${diff}s)`);
        } else if (diff <= 7 || diffPct <= 6) {
          score += 18;
          reasons.push(`+18 Duration within ±7s (diff ${diff}s)`);
        } else {
          score += 5;
          reasons.push(`+5 Duration within ±12s (diff ${diff}s)`);
        }
      }

      // 4. Normalized Title Match (with transliteration vowel tolerance e.g. aa vs a)
      const simplifyVowels = (s: string) => s.replace(/aa+/g, 'a').replace(/ee+/g, 'e').replace(/ii+/g, 'i').replace(/oo+/g, 'o').replace(/uu+/g, 'u').replace(/(.)\1+/g, '$1');
      const candSimple = simplifyVowels(candCleanTitle);
      const targetSimple = simplifyVowels(targetCleanTitle);

      if (candCleanTitle === targetCleanTitle || candSimple === targetSimple) {
        score += 45;
        reasons.push('+45 Exact title match');
      } else if (candCleanTitle.startsWith(targetCleanTitle) || candSimple.startsWith(targetSimple) || targetCleanCleanContains(candCleanTitle, targetCleanTitle) || targetCleanCleanContains(candSimple, targetSimple)) {
        score += 30;
        reasons.push('+30 Substring title match');
      } else {
        const titleWords = targetSimple.split(' ').filter(w => w.length > 2);
        const matchCount = titleWords.filter(w => candSimple.includes(w)).length;
        if (titleWords.length > 0 && matchCount / titleWords.length >= 0.7) {
          score += 20;
          reasons.push(`+20 Fuzzy title match (${matchCount}/${titleWords.length} words)`);
        } else {
          score -= 30;
          reasons.push('-30 Weak title match');
        }
      }

      // 5. Strict 2-Tier Priority: 1. Official Audio, 2. Official Lyric Video
      const isTopicChannel = uploaderLower.includes('- topic') || uploaderLower.endsWith('topic');
      const isOfficialArtist = uploaderLower.includes(targetCleanArtist) || 
                               uploaderLower.includes('vevo') || 
                               uploaderLower.includes('official') ||
                               uploaderLower.includes('records') ||
                               uploaderLower.includes('music') ||
                               uploaderLower.includes('t-series') ||
                               uploaderLower.includes('sony music') ||
                               uploaderLower.includes('zee music') ||
                               uploaderLower.includes('think music') ||
                               uploaderLower.includes('aditya music') ||
                               uploaderLower.includes('sun tv') || 
                               uploaderLower.includes('sun pictures') || 
                               uploaderLower.includes('saregama') || 
                               uploaderLower.includes('tips') || 
                               uploaderLower.includes('speed audio') || 
                               uploaderLower.includes('divo') || 
                               uploaderLower.includes('orchard') || 
                               uploaderLower.includes('trendmusic') || 
                               uploaderLower.includes('anand audio') || 
                               uploaderLower.includes('lahari');

      const isOfficialAudioRelease = isTopicChannel || 
                                     candTitleLower.includes('official audio') || 
                                     candTitleLower.includes('audio') ||
                                     descLower.includes('provided to youtube by') ||
                                     descLower.includes('released on');
      const isOfficialLyricVideo = candTitleLower.includes('lyric video') || 
                                   candTitleLower.includes('lyrics video') ||
                                   candTitleLower.includes('official lyrics') ||
                                   candTitleLower.includes('lyrical video') ||
                                   candTitleLower.includes('lyrical') ||
                                   candTitleLower.includes('lyric') ||
                                   candTitleLower.includes('lyrics');

      if (isOfficialAudioRelease) {
        score += 60;
        reasons.push('+60 Priority 1: Official Audio release / Topic Channel');
      } else if (isOfficialLyricVideo) {
        score += 45;
        reasons.push('+45 Priority 2: Official Lyric Video');
      } else if (isOfficialArtist) {
        score += 20;
        reasons.push('+20 Official Artist / Label Channel');
      } else {
        score -= 30;
        reasons.push('-30 Channel does not match artist or official label');
      }

      scored.push({
        candidate: cand,
        score,
        reasons,
        isHardRejected: false,
        versionType: isOfficialAudioRelease ? 'official_audio' : (isOfficialLyricVideo ? 'lyric_video' : 'other')
      });
    }

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    const SCORE_THRESHOLD = 50;

    let decisionLog = `[AudioResolver] Query: "${rawTitle}" - "${rawArtist}" (${canonical.language || 'unspecified lang'})\n`;
    scored.slice(0, 5).forEach((s, idx) => {
      decisionLog += `  #${idx + 1} [Score: ${s.score}] "${s.candidate.title}" (${s.candidate.id}) - ${s.candidate.uploader || 'Unknown uploader'} [${s.versionType}] | Reasons: ${s.reasons.join(', ')}\n`;
    });

    console.log(decisionLog);

    // Accept ONLY candidates meeting the threshold that are verified clean official audio or official lyric video
    if (best && best.score >= SCORE_THRESHOLD && !best.isHardRejected && (best.versionType === 'official_audio' || best.versionType === 'lyric_video')) {
      const bestVideoId = best.candidate.id;
      const watchUrl = `https://www.youtube.com/watch?v=${bestVideoId}`;
      const streamUrl = `/api/utils/stream-youtube?url=${encodeURIComponent(watchUrl)}`;

      // Persist chosen videoId, score, and other versions to database
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

    // Candidate failed verified official source threshold: report unverified but provide best candidate watchUrl fallback!
    const unverifiedLog = `[AudioResolver] UNVERIFIED: No verified clean official audio or official lyric video meeting threshold ${SCORE_THRESHOLD} (Best score ${best?.score || 0}). Falling back to best candidate stream.`;
    console.warn(unverifiedLog);

    const fallbackId = best?.candidate?.id || null;
    return {
      videoId: fallbackId,
      watchUrl: fallbackId ? `https://www.youtube.com/watch?v=${fallbackId}` : null,
      streamUrl: fallbackId ? `/api/utils/stream-youtube?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${fallbackId}`)}` : null,
      score: best?.score || 0,
      verified: false,
      source: 'unverified_fallback',
      otherVersions: otherVersions.slice(0, 5),
      decisionLog: `${decisionLog}\n${unverifiedLog}`
    };
  }

  /**
   * Fetch Candidates using parallel scrapers/APIs prioritizing Official Audio and Lyric releases
   */
  private static async fetchCandidates(title: string, artist: string, language?: string): Promise<CandidateAudio[]> {
    const primaryArtist = cleanArtist(artist);
    const langTag = language && language.trim().length > 1 ? `${language.trim()} ` : '';
    const candidateMap = new Map<string, CandidateAudio>();

    const cleanT = cleanTitle(title);
    const queries = [
      `${primaryArtist} ${cleanT} ${langTag}official audio`.trim(),
      `${primaryArtist} ${title} ${langTag}official audio`.trim(),
      `${primaryArtist} ${cleanT} ${langTag}- topic`.trim(),
      `${primaryArtist} ${cleanT} ${langTag}official lyric video`.trim(),
      `${primaryArtist} ${cleanT} ${langTag}audio`.trim()
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

    // Priority 2: yt-dlp flat-playlist candidates using clean direct query
    if (candidateMap.size < 8) {
      try {
        const directSearchQuery = `${primaryArtist} ${cleanT}`.trim();
        const { stdout } = await runYtDlp([
          '--socket-timeout', '12',
          '--no-check-certificates',
          '--dump-json',
          '--flat-playlist',
          '--no-warnings',
          `ytsearch10:${directSearchQuery}`
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

    // Priority 3: Fallback scrapers with clean song query
    if (candidateMap.size < 5) {
      try {
        const { ExternalMetadataService } = await import('./external-metadata.service.js');
        const fallbackResults = await ExternalMetadataService.searchYoutubeDirect(`${primaryArtist} ${cleanT}`).catch(() => []);
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
