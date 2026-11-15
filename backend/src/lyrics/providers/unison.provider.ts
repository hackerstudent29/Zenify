import { LyricsDoc, LyricsProvider, TrackMetadataQuery } from '../types';
import { TtmlParser } from '../parsers/ttml.parser';
import { EnhancedLrcParser } from '../parsers/enhanced-lrc.parser';
import { MatchingGuard } from '../matching-guard';

export class UnisonProvider implements LyricsProvider {
  id = 'unison';
  tier: 'W' = 'W';

  public static readonly BASE_URL = 'https://unison.betterlyrics.org';
  public static readonly USER_AGENT = 'ZenifyApp/1.0 (https://zenify.app; contact@zenify.app)';

  supports(track: TrackMetadataQuery): boolean {
    return Boolean(track && (track.isrc || (track.title && track.artist)));
  }

  async fetch(query: TrackMetadataQuery, signal?: AbortSignal): Promise<LyricsDoc | null> {
    const headers = {
      'User-Agent': UnisonProvider.USER_AGENT,
      'Accept': 'application/json'
    };

    // 1. Direct ISRC lookup
    if (query.isrc) {
      try {
        const isrcUrl = `${UnisonProvider.BASE_URL}/lyrics?isrc=${encodeURIComponent(query.isrc.trim())}`;
        const res = await fetch(isrcUrl, {
          headers,
          signal: signal || AbortSignal.timeout(3000)
        });

        if (res.ok) {
          const body: any = await res.json();
          const doc = this.parseUnisonPayload(body?.data);
          if (doc) return doc;
        }
      } catch {}
    }

    // 2. Direct VideoId lookup (if query has a YouTube videoId/trackId)
    if (query.trackId && /^[a-zA-Z0-9_-]{11}$/.test(query.trackId)) {
      try {
        const vUrl = `${UnisonProvider.BASE_URL}/lyrics?v=${encodeURIComponent(query.trackId)}`;
        const res = await fetch(vUrl, {
          headers,
          signal: signal || AbortSignal.timeout(3000)
        });

        if (res.ok) {
          const body: any = await res.json();
          const doc = this.parseUnisonPayload(body?.data);
          if (doc) return doc;
        }
      } catch {}
    }

    // 3. Search query lookup
    if (query.title && query.artist) {
      try {
        const cleanTitle = MatchingGuard.normalizeTitle(query.title);
        const cleanArtist = MatchingGuard.normalizeArtist(query.artist);
        const searchUrl = `${UnisonProvider.BASE_URL}/lyrics/search?q=${encodeURIComponent(`${cleanTitle} ${cleanArtist}`)}`;

        const res = await fetch(searchUrl, {
          headers,
          signal: signal || AbortSignal.timeout(3000)
        });

        if (res.ok) {
          const body: any = await res.json();
          const items: any[] = Array.isArray(body?.data) ? body.data : [];

          // Find candidate matching normalized title & artist
          for (const item of items) {
            if (!item?.id) continue;
            const candTitle = MatchingGuard.normalizeTitle(item.song || '');
            const candArtist = MatchingGuard.normalizeArtist(item.artist || '');

            const titleMatch = candTitle.includes(cleanTitle) || cleanTitle.includes(candTitle);
            const artistMatch = candArtist.includes(cleanArtist) || cleanArtist.includes(candArtist);

            if (titleMatch && artistMatch) {
              // If duration available, verify duration drift <= 18s
              if (query.duration && item.duration && Math.abs(query.duration - item.duration) > 18) {
                continue;
              }

              // Fetch detailed lyrics by ID
              const detailUrl = `${UnisonProvider.BASE_URL}/lyrics/${item.id}`;
              const detailRes = await fetch(detailUrl, {
                headers,
                signal: signal || AbortSignal.timeout(3000)
              });

              if (detailRes.ok) {
                const detailBody: any = await detailRes.json();
                const doc = this.parseUnisonPayload(detailBody?.data);
                if (doc) return doc;
              }
            }
          }
        }
      } catch {}
    }

    return null;
  }

  private parseUnisonPayload(data: any): LyricsDoc | null {
    if (!data?.lyrics || typeof data.lyrics !== 'string') return null;

    const lyricsStr = data.lyrics;
    const format = data.format || (lyricsStr.includes('<tt') ? 'ttml' : 'lrc');

    if (format === 'ttml' || lyricsStr.includes('<tt')) {
      const doc = TtmlParser.parse(lyricsStr, this.id, data.id ? `unison:${data.id}` : undefined);
      if (doc) return doc;
    }

    if (format === 'lrc' || (lyricsStr.includes('[') && lyricsStr.includes(']'))) {
      const doc = EnhancedLrcParser.parse(lyricsStr, this.id);
      if (doc) return doc;
    }

    return null;
  }
}
