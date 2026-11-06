import { LyricsDoc, LyricsProvider, TrackMetadataQuery } from '../types';
import { LyricsfileParser } from '../parsers/lyricsfile.parser';
import { PlainLrcParser } from '../parsers/plain-lrc.parser';
import { PlainTextParser } from '../parsers/plain-text.parser';
import { MatchingGuard } from '../matching-guard';

export class LrcLibBase {
  protected static readonly BASE_URL = 'https://lrclib.net';
  protected static readonly USER_AGENT = 'ZenifyApp/1.0 (https://zenify.app; contact@zenify.app)';
  protected static readonly MAX_BODY_BYTES = 1024 * 1024;

  protected static async fetchLrcLibData(query: TrackMetadataQuery, signal?: AbortSignal): Promise<any | null> {
    try {
      const cleanTitle = MatchingGuard.normalizeTitle(query.title);
      const cleanArtist = MatchingGuard.normalizeArtist(query.artist);

      // Strategy 1: Direct /api/get with duration (only accept if no language conflict)
      let getUrl = `${LrcLibBase.BASE_URL}/api/get?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(cleanTitle)}`;
      if (query.duration && query.duration > 0) {
        getUrl += `&duration=${Math.round(query.duration)}`;
      }

      const res = await fetch(getUrl, {
        headers: { 'User-Agent': LrcLibBase.USER_AGENT },
        signal: signal || AbortSignal.timeout(3000)
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        const candLyrics = data?.syncedLyrics || data?.plainLyrics || '';
        const candAlbum = (data?.albumName || '').toLowerCase();
        const candTitle = (data?.trackName || '').toLowerCase();

        const hasConflict = query.language && (
          MatchingGuard.isLanguageConflicted(candAlbum, query.language) ||
          MatchingGuard.isLanguageConflicted(candTitle, query.language) ||
          MatchingGuard.isLyricsLanguageMismatch(candLyrics, query.language)
        );

        if (!hasConflict) {
          return data;
        }
        console.log(`[LRCLib] Strategy 1 direct match rejected due to language conflict with "${query.language}". Searching candidates...`);
      }

      // Strategy 2: Multi-query Search with Language Scoring
      const searchUrls: string[] = [];
      if (query.language && query.language !== 'english' && query.language !== 'other') {
        searchUrls.push(`${LrcLibBase.BASE_URL}/api/search?q=${encodeURIComponent(`${cleanTitle} ${query.language}`)}`);
      }
      searchUrls.push(`${LrcLibBase.BASE_URL}/api/search?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(cleanTitle)}`);
      searchUrls.push(`${LrcLibBase.BASE_URL}/api/search?q=${encodeURIComponent(`${cleanTitle} ${cleanArtist}`)}`);

      const candidateMap = new Map<number | string, any>();

      await Promise.allSettled(searchUrls.map(async (url) => {
        try {
          const sRes = await fetch(url, {
            headers: { 'User-Agent': LrcLibBase.USER_AGENT },
            signal: signal || AbortSignal.timeout(3000)
          });
          if (sRes.ok) {
            const list = (await sRes.json()) as any[];
            if (Array.isArray(list)) {
              for (const item of list) {
                if (item?.id && !candidateMap.has(item.id)) {
                  candidateMap.set(item.id, item);
                }
              }
            }
          }
        } catch {}
      }));

      if (candidateMap.size > 0) {
        const candidates = Array.from(candidateMap.values()).map(item => ({
          title: item.trackName || item.name,
          artist: item.artistName,
          album: item.albumName,
          duration: item.duration,
          isrc: item.isrc,
          raw: item
        }));
        const best = MatchingGuard.pickBestCandidate(query, candidates);
        if (best && best.raw) {
          return best.raw;
        }
      }
    } catch (err) {}
    return null;
  }
}

/** Tier W: LRCLIB Word-Level Sync (lyricsfile YAML) */
export class LrcLibWordProvider extends LrcLibBase implements LyricsProvider {
  id = 'lrclib-word';
  tier: 'W' = 'W';

  supports(track: TrackMetadataQuery): boolean {
    return Boolean(track && track.title && track.artist);
  }

  async fetch(query: TrackMetadataQuery, signal?: AbortSignal): Promise<LyricsDoc | null> {
    const data = await LrcLibBase.fetchLrcLibData(query, signal);
    if (!data) return null;

    if (data.instrumental === true) {
      return {
        syncLevel: 'plain',
        instrumental: true,
        aiGenerated: false,
        aiSynced: false,
        providerId: this.id,
        providerRef: String(data.id),
        lines: []
      };
    }

    if (data.hasWordSync === true && data.lyricsfile) {
      const doc = LyricsfileParser.parse(data.lyricsfile, this.id, String(data.id));
      if (doc && doc.syncLevel === 'word') {
        return doc;
      }
    }
    return null;
  }
}

/** Tier L: LRCLIB Line-Level Sync (syncedLyrics) */
export class LrcLibLineProvider extends LrcLibBase implements LyricsProvider {
  id = 'lrclib-line';
  tier: 'L' = 'L';

  supports(track: TrackMetadataQuery): boolean {
    return Boolean(track && track.title && track.artist);
  }

  async fetch(query: TrackMetadataQuery, signal?: AbortSignal): Promise<LyricsDoc | null> {
    const data = await LrcLibBase.fetchLrcLibData(query, signal);
    if (!data) return null;

    if (data.instrumental === true) {
      return {
        syncLevel: 'line',
        instrumental: true,
        aiGenerated: false,
        aiSynced: false,
        providerId: this.id,
        providerRef: String(data.id),
        lines: []
      };
    }

    if (data.syncedLyrics) {
      const doc = PlainLrcParser.parse(data.syncedLyrics, this.id, String(data.id));
      if (doc && doc.lines.length > 0) {
        return doc;
      }
    }
    return null;
  }
}

/** Tier P: LRCLIB Plain Text Lyrics (plainLyrics) */
export class LrcLibPlainProvider extends LrcLibBase implements LyricsProvider {
  id = 'lrclib-plain';
  tier: 'P' = 'P';

  supports(track: TrackMetadataQuery): boolean {
    return Boolean(track && track.title && track.artist);
  }

  async fetch(query: TrackMetadataQuery, signal?: AbortSignal): Promise<LyricsDoc | null> {
    const data = await LrcLibBase.fetchLrcLibData(query, signal);
    if (!data) return null;

    if (data.plainLyrics) {
      const doc = PlainTextParser.parse(data.plainLyrics, this.id, String(data.id));
      if (doc && doc.lines.length > 0) {
        return doc;
      }
    }
    return null;
  }
}

