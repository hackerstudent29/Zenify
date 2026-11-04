import { LyricsDoc, LyricsProvider, TrackMetadataQuery } from '../types';
import { TtmlParser } from '../parsers/ttml.parser';
import { EnhancedLrcParser } from '../parsers/enhanced-lrc.parser';
import { MatchingGuard } from '../matching-guard';

export class LrcRedProvider implements LyricsProvider {
  id = 'lrc.red';
  tier: 'W' = 'W';

  private static readonly BASE_URL = 'https://lrc.red';
  private static readonly USER_AGENT = 'ZenifyApp/1.0 (https://zenify.app; contact@zenify.app)';
  private static readonly MAX_BODY_BYTES = 1024 * 1024; // 1 MB max

  supports(track: TrackMetadataQuery): boolean {
    return Boolean(track && (track.isrc || track.title));
  }

  async fetch(query: TrackMetadataQuery, signal?: AbortSignal): Promise<LyricsDoc | null> {
    try {
      let isrc = query.isrc;

      // 1. If no ISRC, search via lrc.red search API
      if (!isrc) {
        const cleanTitle = MatchingGuard.normalizeTitle(query.title);
        const cleanArtist = MatchingGuard.normalizeArtist(query.artist);
        const searchUrl = `${LrcRedProvider.BASE_URL}/search.json?q=${encodeURIComponent(`${cleanTitle} ${cleanArtist}`)}`;

        const searchRes = await fetch(searchUrl, {
          headers: { 'User-Agent': LrcRedProvider.USER_AGENT },
          signal: signal || AbortSignal.timeout(3000)
        });

        if (!searchRes.ok) return null;
        const searchData: any = await searchRes.json();
        const hits = searchData?.hits || [];

        const candidate = MatchingGuard.pickBestCandidate(query, hits.map((h: any) => ({
          title: h.title,
          artist: h.artist,
          album: h.album,
          duration: h.duration,
          isrc: h.isrc,
          byModel: h.byModel,
          raw: h
        })));

        if (!candidate || !candidate.isrc) return null;
        isrc = candidate.isrc;
      }

      // 2. Fetch TTML document
      const ttmlUrl = `${LrcRedProvider.BASE_URL}/s/${encodeURIComponent(isrc)}.ttml`;
      const ttmlRes = await fetch(ttmlUrl, {
        headers: { 'User-Agent': LrcRedProvider.USER_AGENT },
        signal: signal || AbortSignal.timeout(3000)
      });

      if (ttmlRes.ok) {
        const text = await ttmlRes.text();
        if (text && text.length <= LrcRedProvider.MAX_BODY_BYTES) {
          const doc = TtmlParser.parse(text, this.id, isrc);
          if (doc && doc.lines.length > 0) return doc;
        }
      }

      // 3. Fallback to enhanced LRC
      const lrcUrl = `${LrcRedProvider.BASE_URL}/s/${encodeURIComponent(isrc)}.lrc`;
      const lrcRes = await fetch(lrcUrl, {
        headers: { 'User-Agent': LrcRedProvider.USER_AGENT },
        signal: signal || AbortSignal.timeout(3000)
      });

      if (lrcRes.ok) {
        const lrcText = await lrcRes.text();
        if (lrcText && lrcText.length <= LrcRedProvider.MAX_BODY_BYTES) {
          const doc = EnhancedLrcParser.parse(lrcText, this.id, isrc);
          if (doc && doc.lines.length > 0) return doc;
        }
      }
    } catch (err) {
      // Handled by orchestrator circuit breaker / error logger
    }

    return null;
  }
}

