import { LyricsDoc, LyricsProvider, TrackMetadataQuery } from '../types';
import { PlainLrcParser } from '../parsers/plain-lrc.parser';
import { MatchingGuard } from '../matching-guard';

export class SimpMusicProvider implements LyricsProvider {
  id = 'simpmusic';
  tier: 'L' = 'L';

  private static readonly BASE_URL = 'https://api-lyrics.simpmusic.org';
  private static readonly USER_AGENT = 'ZenifyApp/1.0 (https://zenify.app; contact@zenify.app)';

  supports(track: TrackMetadataQuery): boolean {
    return Boolean(track && track.title && track.artist);
  }

  async fetch(query: TrackMetadataQuery, signal?: AbortSignal): Promise<LyricsDoc | null> {
    try {
      const cleanTitle = MatchingGuard.normalizeTitle(query.title);
      const cleanArtist = MatchingGuard.normalizeArtist(query.artist);
      const url = `${SimpMusicProvider.BASE_URL}/lyrics?title=${encodeURIComponent(cleanTitle)}&artist=${encodeURIComponent(cleanArtist)}`;

      const res = await fetch(url, {
        headers: { 'User-Agent': SimpMusicProvider.USER_AGENT },
        signal: signal || AbortSignal.timeout(3000)
      });

      if (!res.ok) return null;
      const data: any = await res.json();
      if (data?.lrc) {
        return PlainLrcParser.parse(data.lrc, this.id);
      }
    } catch (err) {}
    return null;
  }
}

