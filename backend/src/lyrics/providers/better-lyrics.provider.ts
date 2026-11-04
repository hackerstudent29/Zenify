import { LyricsDoc, LyricsProvider, TrackMetadataQuery } from '../types';
import { TtmlParser } from '../parsers/ttml.parser';
import { MatchingGuard } from '../matching-guard';

export class BetterLyricsProvider implements LyricsProvider {
  id = 'better-lyrics';
  tier: 'W' = 'W';

  private static readonly BASE_URL = 'https://lyrics-api.boidu.dev';
  private static readonly USER_AGENT = 'ZenifyApp/1.0 (https://zenify.app; contact@zenify.app)';

  supports(track: TrackMetadataQuery): boolean {
    return Boolean(track && track.title && track.artist);
  }

  async fetch(query: TrackMetadataQuery, signal?: AbortSignal): Promise<LyricsDoc | null> {
    try {
      const cleanTitle = MatchingGuard.normalizeTitle(query.title);
      const cleanArtist = MatchingGuard.normalizeArtist(query.artist);
      const url = `${BetterLyricsProvider.BASE_URL}/ttml?title=${encodeURIComponent(cleanTitle)}&artist=${encodeURIComponent(cleanArtist)}`;

      const res = await fetch(url, {
        headers: { 'User-Agent': BetterLyricsProvider.USER_AGENT },
        signal: signal || AbortSignal.timeout(3000)
      });

      if (!res.ok) return null;
      const ttml = await res.text();
      if (ttml && ttml.includes('<tt')) {
        return TtmlParser.parse(ttml, this.id);
      }
    } catch (err) {}
    return null;
  }
}

