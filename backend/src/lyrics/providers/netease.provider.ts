import { LyricsDoc, LyricsProvider, TrackMetadataQuery } from '../types';
import { PlainLrcParser } from '../parsers/plain-lrc.parser';
import { MatchingGuard } from '../matching-guard';

export class NetEaseProvider implements LyricsProvider {
  id = 'netease';
  tier: 'L' = 'L';

  private static readonly BASE_URL = 'https://music.163.com';

  supports(track: TrackMetadataQuery): boolean {
    // Primarily supported for CJK (Chinese, Japanese, Korean) languages
    const lang = (track.language || '').toLowerCase();
    const isCjk = ['ja', 'zh', 'ko', 'japanese', 'chinese', 'korean'].some(l => lang.includes(l));
    return isCjk || /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/.test(track.title);
  }

  async fetch(query: TrackMetadataQuery, signal?: AbortSignal): Promise<LyricsDoc | null> {
    try {
      const cleanTitle = MatchingGuard.normalizeTitle(query.title);
      const cleanArtist = MatchingGuard.normalizeArtist(query.artist);
      const searchUrl = `${NetEaseProvider.BASE_URL}/api/search/get/web?csrf_token=&hlpretag=&hlposttag=&s=${encodeURIComponent(`${cleanTitle} ${cleanArtist}`)}&type=1&offset=0&total=true&limit=1`;

      const searchRes = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://music.163.com/'
        },
        signal: signal || AbortSignal.timeout(3000)
      });

      if (!searchRes.ok) return null;
      const searchData: any = await searchRes.json();
      const songs = searchData?.result?.songs;
      if (!songs || songs.length === 0) return null;

      const songId = songs[0].id;
      const lyricUrl = `${NetEaseProvider.BASE_URL}/api/song/lyric?id=${songId}&lv=1&kv=1&tv=-1`;

      const lyricRes = await fetch(lyricUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://music.163.com/'
        },
        signal: signal || AbortSignal.timeout(3000)
      });

      if (!lyricRes.ok) return null;
      const lyricData: any = await lyricRes.json();
      if (lyricData?.lrc?.lyric) {
        return PlainLrcParser.parse(lyricData.lrc.lyric, this.id, String(songId));
      }
    } catch (err) {}
    return null;
  }
}

