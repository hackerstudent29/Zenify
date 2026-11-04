import { LyricsDoc, LyricsProvider, TrackMetadataQuery } from '../types';
import { TtmlParser } from '../parsers/ttml.parser';
import { EnhancedLrcParser } from '../parsers/enhanced-lrc.parser';
import { MatchingGuard } from '../matching-guard';

export class UnisonProvider implements LyricsProvider {
  id = 'unison';
  tier: 'W' = 'W';

  private static readonly BASE_URL = 'https://unison.boidu.dev';
  private static readonly USER_AGENT = 'ZenifyApp/1.0 (https://zenify.app; contact@zenify.app)';

  supports(track: TrackMetadataQuery): boolean {
    return Boolean(track && (track.isrc || track.title));
  }

  async fetch(query: TrackMetadataQuery, signal?: AbortSignal): Promise<LyricsDoc | null> {
    try {
      let url = `${UnisonProvider.BASE_URL}/lyrics?`;
      if (query.isrc) {
        url += `isrc=${encodeURIComponent(query.isrc)}`;
      } else {
        const cleanTitle = MatchingGuard.normalizeTitle(query.title);
        const cleanArtist = MatchingGuard.normalizeArtist(query.artist);
        url += `song=${encodeURIComponent(cleanTitle)}&artist=${encodeURIComponent(cleanArtist)}`;
      }

      const res = await fetch(url, {
        headers: { 'User-Agent': UnisonProvider.USER_AGENT },
        signal: signal || AbortSignal.timeout(3000)
      });

      if (!res.ok) return null;
      const data: any = await res.json();

      if (data?.ttml) {
        const doc = TtmlParser.parse(data.ttml, this.id);
        if (doc) return doc;
      }
      if (data?.lrc) {
        const doc = EnhancedLrcParser.parse(data.lrc, this.id);
        if (doc) return doc;
      }
    } catch (err) {}
    return null;
  }
}

