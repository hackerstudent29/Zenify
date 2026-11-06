import { LyricsDoc, LyricsProvider, TrackMetadataQuery } from '../types';
import { PlainTextParser } from '../parsers/plain-text.parser';
import { MatchingGuard } from '../matching-guard';

export class JioSaavnLyricsProvider implements LyricsProvider {
  id = 'jiosaavn';
  tier: 'P' = 'P';

  supports(track: TrackMetadataQuery): boolean {
    return Boolean(track && (track.providerId || track.title));
  }

  async fetch(query: TrackMetadataQuery, _signal?: AbortSignal): Promise<LyricsDoc | null> {
    try {
      const { CleanCdnAudioService } = await import('../../services/clean-cdn-audio.service.js');
      let text: string | null = null;
      let refId: string | undefined = undefined;

      if (query.providerId) {
        const cleanId = String(query.providerId).replace(/^saavn-/, '').trim();
        text = await CleanCdnAudioService.getLyrics(cleanId);
        refId = cleanId;

        if (text && query.language && MatchingGuard.isLyricsLanguageMismatch(text, query.language)) {
          text = null;
        }
      }

      if (!text) {
        text = await CleanCdnAudioService.resolveLyrics(query.title, query.artist, query.language, query.album);
      }

      if (text && query.language && MatchingGuard.isLyricsLanguageMismatch(text, query.language)) {
        return null;
      }

      if (text && text.trim().length > 20) {
        const doc = PlainTextParser.parse(text, this.id, refId);
        if (doc) {
          doc.language = query.language;
          return doc;
        }
      }
    } catch {}
    return null;
  }
}
