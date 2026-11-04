import { LyricsDoc, LyricsProvider, TrackMetadataQuery } from '../types';
import { PlainTextParser } from '../parsers/plain-text.parser';
import { MatchingGuard } from '../matching-guard';

export class LyricsOvhProvider implements LyricsProvider {
  id = 'lyrics.ovh';
  tier: 'P' = 'P';

  private static readonly BASE_URL = 'https://api.lyrics.ovh/v1';
  private static readonly USER_AGENT = 'ZenifyApp/1.0 (https://zenify.app; contact@zenify.app)';

  supports(track: TrackMetadataQuery): boolean {
    return Boolean(track && track.title && track.artist);
  }

  async fetch(query: TrackMetadataQuery, signal?: AbortSignal): Promise<LyricsDoc | null> {
    try {
      const cleanTitle = MatchingGuard.normalizeTitle(query.title);
      const cleanArtist = MatchingGuard.normalizeArtist(query.artist);
      const url = `${LyricsOvhProvider.BASE_URL}/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(cleanTitle)}`;

      const res = await fetch(url, {
        headers: { 'User-Agent': LyricsOvhProvider.USER_AGENT },
        signal: signal || AbortSignal.timeout(3000)
      });

      if (!res.ok) return null;
      const data: any = await res.json();
      if (data?.lyrics) {
        return PlainTextParser.parse(data.lyrics, this.id);
      }
    } catch (err) {}
    return null;
  }
}

