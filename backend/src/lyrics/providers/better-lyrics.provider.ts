import { LyricsDoc, LyricsProvider, TrackMetadataQuery } from '../types';
import { TtmlParser } from '../parsers/ttml.parser';
import { EnhancedLrcParser } from '../parsers/enhanced-lrc.parser';
import { MatchingGuard } from '../matching-guard';

export class BetterLyricsProvider implements LyricsProvider {
  id = 'better-lyrics';
  tier: 'W' = 'W';

  public static readonly PRIMARY_URL = 'https://api.betterlyrics.org';
  public static readonly FALLBACK_URL = 'https://lyrics-api.boidu.dev';
  public static readonly USER_AGENT = 'ZenifyApp/1.0 (https://zenify.app; contact@zenify.app)';

  supports(track: TrackMetadataQuery): boolean {
    return Boolean(track && track.title && track.artist);
  }

  async fetch(query: TrackMetadataQuery, signal?: AbortSignal): Promise<LyricsDoc | null> {
    const cleanTitle = MatchingGuard.normalizeTitle(query.title);
    const cleanArtist = MatchingGuard.normalizeArtist(query.artist);
    if (!cleanTitle || !cleanArtist) return null;

    const apiKey = process.env.BETTER_LYRICS_API_KEY;
    const headers: Record<string, string> = {
      'User-Agent': BetterLyricsProvider.USER_AGENT,
      'Accept': 'application/json'
    };
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }

    // 1. Try Primary Base URL (/getLyrics)
    const primaryDoc = await this.queryGetLyrics(
      BetterLyricsProvider.PRIMARY_URL,
      cleanTitle,
      cleanArtist,
      query,
      headers,
      signal
    );
    if (primaryDoc) return primaryDoc;

    // 2. Try Fallback Base URL (/getLyrics)
    const fallbackDoc = await this.queryGetLyrics(
      BetterLyricsProvider.FALLBACK_URL,
      cleanTitle,
      cleanArtist,
      query,
      headers,
      signal
    );
    if (fallbackDoc) return fallbackDoc;

    // 3. Try Provider-Specific TTML endpoint on primary host (/ttml/getLyrics)
    try {
      const ttmlUrl = new URL(`${BetterLyricsProvider.PRIMARY_URL}/ttml/getLyrics`);
      ttmlUrl.searchParams.set('s', cleanTitle);
      ttmlUrl.searchParams.set('a', cleanArtist);
      if (query.album) ttmlUrl.searchParams.set('al', query.album.trim());
      if (query.duration && query.duration > 0) ttmlUrl.searchParams.set('d', String(Math.round(query.duration)));

      const res = await fetch(ttmlUrl.toString(), {
        headers,
        signal: signal || AbortSignal.timeout(3000)
      });

      if (res.ok) {
        const data: any = await res.json();
        const rawContent = data.lyrics || data.ttml;
        if (typeof rawContent === 'string' && rawContent.includes('<tt')) {
          const doc = TtmlParser.parse(rawContent, this.id, data.provider);
          if (doc) return doc;
        }
      }
    } catch {}

    return null;
  }

  private async queryGetLyrics(
    baseUrl: string,
    cleanTitle: string,
    cleanArtist: string,
    query: TrackMetadataQuery,
    headers: Record<string, string>,
    signal?: AbortSignal
  ): Promise<LyricsDoc | null> {
    try {
      const url = new URL(`${baseUrl}/getLyrics`);
      url.searchParams.set('s', cleanTitle);
      url.searchParams.set('a', cleanArtist);

      if (query.album) {
        url.searchParams.set('al', query.album.trim());
      }
      if (query.duration && query.duration > 0) {
        url.searchParams.set('d', String(Math.round(query.duration)));
      }
      if (query.trackId) {
        url.searchParams.set('v', query.trackId);
      }

      const res = await fetch(url.toString(), {
        headers,
        signal: signal || AbortSignal.timeout(3000)
      });

      if (!res.ok) return null;

      const data: any = await res.json();
      if (!data) return null;

      // Handle TTML property (primary Apple Music word-by-word format)
      if (data.ttml) {
        let ttmlString = data.ttml;
        if (typeof ttmlString === 'string') {
          // Check for double-encoded JSON
          if (ttmlString.startsWith('{"ttml"') || ttmlString.startsWith('{\\"ttml\\"')) {
            try {
              const inner = JSON.parse(ttmlString);
              if (inner.ttml) ttmlString = inner.ttml;
            } catch {}
          }

          if (ttmlString.includes('<tt')) {
            const providerRef = data.score !== undefined ? `score:${data.score}` : undefined;
            const doc = TtmlParser.parse(ttmlString, this.id, providerRef);
            if (doc) return doc;
          }
        }
      }

      // Handle generic lyrics property (e.g. from upstream providers)
      if (data.lyrics && typeof data.lyrics === 'string') {
        const raw = data.lyrics;
        if (raw.includes('<tt')) {
          const doc = TtmlParser.parse(raw, this.id, data.provider);
          if (doc) return doc;
        } else if (raw.includes('[') && raw.includes(']')) {
          const doc = EnhancedLrcParser.parse(raw, this.id);
          if (doc) return doc;
        }
      }
    } catch {}

    return null;
  }
}
