import axios from 'axios';
import { isSafePublicUrl } from '../utils/security';
// @ts-ignore
import des from 'des.js';

export interface CleanAudioResult {
    url: string;
    duration: number;
    title: string;
    artist: string;
    album?: string;
    albumId?: string;
    coverUrl?: string;
    playCount?: number;
    trackId?: string;
    bitrate: string;
    source: 'saavn_direct_cdn';
}

export interface CleanAudioOptions {
    title: string;
    primaryArtist?: string;
    album?: string;
    duration?: number;
    language?: string;
}

const SAAVN_RANK_NOISE = /\b(cover|karaoke|tribute|instrumental|remix|live|acoustic|slowed|reverb|sped up|nightcore|lofi|8d|piano version|originally performed|unplugged|mashup)\b/i;

const normSaavn = (s = '') =>
  s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
   .replace(/\(.*?\)|\[.*?\]/g, ' ')
   .replace(/[^a-z0-9\u0900-\u0D7F\s]/g, ' ')
   .replace(/\s+/g, ' ').trim();

const cdnQueryCache = new Map<string, { result: CleanAudioResult | null; expiresAt: number }>();

const CDN_HARD_REJECT_TERMS = [
    'cover', 'covers', 'cover version', 'acoustic cover', 'guitar cover', 'piano cover', 
    'drum cover', 'fingerstyle', 'fan made', 'tribute', 'parody', 'reaction',
    'instrumental', 'instrumentals', 'instrumental version', 'backing track', 'minus one', 
    'karaoke', 'karaoke version', 'sing along', 'sing-along',
    'guitar', 'piano', 'violin', 'flute', 'sax', 'saxophone', 'harp', 'cello', 'drums', 'accordion', 'tabla', 'sitar',
    'in the style of', 'originally performed', 'originally by', 'soundalike',
    'slowed', 'reverb', 'sped up', 'speed up', 'nightcore', '8d', 'lofi', 'lo-fi', 'chillhop',
    'dialogue', 'scene', 'trailer', 'teaser', 'sound effect', 'ringtone', 'bgm clip',
    'ai cover', 'ai covers', 'ai version', 'ai generated', 'ai song', 'ai vocals', 'ai voice', 'ai music',
    'suno', 'suno ai', 'suno.ai', 'udio', 'udio ai', 'voicify', 'rvc model', 'diff-svc', 'synthetic voice'
];

export class CleanCdnAudioService {
    public static decryptSaavnMediaUrl(encBase64: string, quality: '96' | '160' | '320' = '160'): string | null {
        try {
            if (!encBase64 || typeof encBase64 !== 'string') return null;
            const key = Buffer.from('38346591');
            const cipher = des.DES.create({ type: 'decrypt', key: key });
            const raw = Buffer.from(encBase64.trim(), 'base64');
            if (raw.length === 0 || raw.length % 8 !== 0) return null;

            const out: number[] = [];
            for (let i = 0; i < raw.length; i += 8) {
                const chunk = raw.slice(i, i + 8);
                const dec = cipher.update(Array.from(chunk));
                out.push(...dec);
            }
            const pad = out[out.length - 1];
            const clean = (pad > 0 && pad <= 8) ? out.slice(0, out.length - pad) : out;
            let url = Buffer.from(clean).toString('utf8');
            if (!url.startsWith('http://') && !url.startsWith('https://')) return null;

            const targetQuality = `_${quality}.mp4`;
            if (url.endsWith('.mp4') || url.endsWith('.m4a')) {
                url = url.replace(/_[0-9]+(\.mp4|\.m4a)$/, targetQuality);
            } else {
                url = url.replace(/_[0-9]+$/, targetQuality);
            }
            return url;
        } catch {
            return null;
        }
    }

    /**
     * Resolves a song to a high-speed direct 320kbps CDN stream strictly adhering to Zenify verification protocols.
     * Rejects covers, instrumentals, guitar/piano solo versions, karaoke, language mismatches, and artist mismatches.
     */
    static async resolveAudio(queryOrOpts: string | CleanAudioOptions): Promise<CleanAudioResult | null> {
        try {
            let detectedLang: string | undefined = undefined;
            const rawQueryStr = (typeof queryOrOpts === 'string' ? queryOrOpts : (queryOrOpts.title || '')).toLowerCase();
            if (rawQueryStr.includes('tamil') || rawQueryStr.includes('(ta)')) detectedLang = 'tamil';
            else if (rawQueryStr.includes('telugu') || rawQueryStr.includes('(te)')) detectedLang = 'telugu';
            else if (rawQueryStr.includes('hindi') || rawQueryStr.includes('(hi)')) detectedLang = 'hindi';
            else if (rawQueryStr.includes('kannada') || rawQueryStr.includes('(kn)')) detectedLang = 'kannada';
            else if (rawQueryStr.includes('malayalam') || rawQueryStr.includes('(ml)')) detectedLang = 'malayalam';
            else if (rawQueryStr.includes('punjabi') || rawQueryStr.includes('(pa)')) detectedLang = 'punjabi';

            let opts: CleanAudioOptions;
            let rawQueryInput = '';
            if (typeof queryOrOpts === 'string') {
                if (!queryOrOpts || typeof queryOrOpts !== 'string') return null;
                rawQueryInput = queryOrOpts;
                const cleanInput = queryOrOpts
                    .replace(/^ytsearch[0-9]*:/, '')
                    .replace(/https?:\/\/[^\s]+/g, '')
                    .replace(/\(Official Audio\)/i, '')
                    .replace(/\(Official Video\)/i, '')
                    .replace(/\(Lyric Video\)/i, '')
                    .replace(/\(.*?\)/g, '')
                    .replace(/\[.*?\]/g, '')
                    .split('|')[0]
                    .trim();

                if (cleanInput.includes(' - ')) {
                    const parts = cleanInput.split(' - ');
                    opts = { primaryArtist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
                } else {
                    opts = { title: cleanInput };
                }
            } else {
                opts = queryOrOpts;
                rawQueryInput = `${opts.title || ''} ${opts.album || ''}`;
            }
            if (!opts.language && detectedLang) {
                opts.language = detectedLang;
            }

            const rawTitle = (opts.title || '').trim();
            if (!rawTitle) return null;

            const cleanT = rawTitle
                .toLowerCase()
                .replace(/\(.*?\)/g, '')
                .replace(/\[.*?\]/g, '')
                .replace(/[^\p{L}\p{N}\s]/gu, '')
                .replace(/\s+/g, ' ')
                .trim();

            const cleanA = (opts.primaryArtist || '')
                .toLowerCase()
                .split(/[,&/|]/)[0]
                .replace(/\s*feat\.?.*/i, '')
                .replace(/\s*ft\.?.*/i, '')
                .replace(/[^\p{L}\p{N}\s]/gu, '')
                .replace(/\s+/g, ' ')
                .trim();

            const cdnHeaders = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.jiosaavn.com/'
            };

            // Search with natural title + artist first (appending language artificially breaks searches for instrumentals/English titles)
            const searchQuery = (cleanA ? `${cleanA} ${cleanT}` : cleanT).slice(0, 120).trim();
            const cacheKey = `${cleanT}:::${cleanA}:::${opts.language || ''}`.toLowerCase();
            const cached = cdnQueryCache.get(cacheKey);
            if (cached && cached.expiresAt > Date.now()) {
                return cached.result;
            }

            console.log(`[CleanCdnAudio] Searching CDN candidate for: "${searchQuery}" (Req Lang: ${opts.language || 'any'}, Artist: ${cleanA || 'any'})`);

            // 1. Fetch 3 pages in parallel so the original isn't hidden past page 0/1
            const [p1, p2, p3, autoRes] = await Promise.all([
                axios.get('https://www.jiosaavn.com/api.php', {
                    params: { __call: 'search.getResults', q: searchQuery, _format: 'json', ctx: 'web6dot0', p: '1', n: '40' },
                    headers: cdnHeaders,
                    timeout: 4000
                }).then(r => r.data?.results || []).catch(() => []),
                axios.get('https://www.jiosaavn.com/api.php', {
                    params: { __call: 'search.getResults', q: searchQuery, _format: 'json', ctx: 'web6dot0', p: '2', n: '40' },
                    headers: cdnHeaders,
                    timeout: 4000
                }).then(r => r.data?.results || []).catch(() => []),
                axios.get('https://www.jiosaavn.com/api.php', {
                    params: { __call: 'search.getResults', q: searchQuery, _format: 'json', ctx: 'web6dot0', p: '3', n: '40' },
                    headers: cdnHeaders,
                    timeout: 4000
                }).then(r => r.data?.results || []).catch(() => []),
                axios.get('https://www.jiosaavn.com/api.php', {
                    params: { __call: 'autocomplete.get', query: searchQuery, _format: 'json', ctx: 'web6dot0' },
                    headers: cdnHeaders,
                    timeout: 3000
                }).then(r => r.data?.songs?.data || []).catch(() => [])
            ]);

            const seenIds = new Set<string>();
            const candidatesRaw: any[] = [];
            for (const r of [...p1, ...p2, ...p3, ...autoRes]) {
                const sid = r?.id || r?.perma_url;
                if (sid && !seenIds.has(sid)) {
                    seenIds.add(sid);
                    candidatesRaw.push(r);
                }
            }

            // Fallback search with language suffix only if zero candidates were found
            if (candidatesRaw.length === 0 && opts.language && !cleanT.includes(opts.language.toLowerCase())) {
                const langQuery = `${searchQuery} ${opts.language}`.slice(0, 120).trim();
                const langRes = await axios.get('https://www.jiosaavn.com/api.php', {
                    params: {
                        __call: 'search.getResults',
                        q: langQuery,
                        _format: 'json',
                        _marker: '0',
                        ctx: 'web6dot0',
                        p: '1',
                        n: '20'
                    },
                    headers: cdnHeaders,
                    timeout: 3500
                }).catch(() => null);
                if (langRes?.data?.results && Array.isArray(langRes.data.results)) {
                    for (const r of langRes.data.results) {
                        const sid = r?.id || r?.perma_url;
                        if (sid && !seenIds.has(sid)) {
                            seenIds.add(sid);
                            candidatesRaw.push(r);
                        }
                    }
                }
            }

            if (candidatesRaw.length === 0) {
                console.log(`[CleanCdnAudio] Zero CDN candidates found for: "${searchQuery}"`);
                cdnQueryCache.set(cacheKey, { result: null, expiresAt: Date.now() + 60 * 1000 });
                return null;
            }

            // 2. Rank Candidates: Exact title match first, covers/noise down, most-played (original) first
            const qNorm = normSaavn(cleanT);
            const noisyQuery = SAAVN_RANK_NOISE.test(rawTitle);

            const tierOf = (s: any) => {
                const t = normSaavn(s.song || s.title || '');
                if (t === qNorm) return 0;
                if (t.startsWith(qNorm + ' ')) return 1;
                if (t.includes(qNorm)) return 2;
                return 3;
            };

            const candidates = candidatesRaw.map(s => {
                const titleStr = s.song || s.title || '';
                const albumStr = s.album || s.more_info?.album || '';
                return {
                    s,
                    tier: tierOf(s),
                    noisy: !noisyQuery && SAAVN_RANK_NOISE.test(`${titleStr} ${albumStr}`) ? 1 : 0,
                    plays: Number(s.play_count || s.more_info?.play_count || 0)
                };
            }).sort((a, b) =>
                a.tier - b.tier ||
                a.noisy - b.noisy ||
                b.plays - a.plays
            ).map(x => x.s);

            // 3. Filter & Resolve Candidates Against Strict Protocols
            for (const cand of candidates) {
                const candTitle = (cand.song || cand.title || '').trim();
                const candTitleLower = candTitle.toLowerCase();
                const candAlbum = (cand.album || cand.more_info?.album || 'Single').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').trim();
                const candDesc = (cand.description || '').toLowerCase();
                const rawArtists = cand.primary_artists || cand.singers || cand.more_info?.primary_artists || cand.more_info?.singers || cand.more_info?.artist_map?.primary_artists?.[0]?.name || cand.music || '';
                const candArtists = rawArtists.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').trim();
                const candArtistsLower = candArtists.toLowerCase();
                const candLang = (cand.language || cand.more_info?.language || '').toLowerCase().trim();
                const candDur = parseInt(cand.duration || cand.more_info?.duration, 10) || 0;

                // Protocol Check 1: Hard Reject Terms (instrumentals, covers, guitar, piano, karaoke, etc.)
                let hasRejectTerm = false;
                for (const term of CDN_HARD_REJECT_TERMS) {
                    const isTargetRequestingTerm = rawTitle.toLowerCase().includes(term) || 
                                                  (opts.album && opts.album.toLowerCase().includes(term)) ||
                                                  rawQueryInput.toLowerCase().includes(term);
                    if (!isTargetRequestingTerm && (candTitleLower.includes(term) || candAlbum.toLowerCase().includes(term) || candDesc.includes(term))) {
                        hasRejectTerm = true;
                        break;
                    }
                }
                if (hasRejectTerm) {
                    continue; // Skip cover/instrumental/karaoke/guitar/remix
                }

                // Protocol Check 2: Language Matching
                if (opts.language) {
                    const reqLang = opts.language.toLowerCase().trim();
                    const isInst = candTitleLower.includes('instrumental') || rawTitle.toLowerCase().includes('instrumental') || rawQueryInput.toLowerCase().includes('instrumental');
                    if (candLang && candLang !== reqLang && candLang !== 'unknown' && candLang !== '' && !isInst) {
                        continue; // Skip conflicting language
                    }
                }

                // Protocol Check 3: Artist Matching (only if caller specified a non-empty primary artist)
                if (cleanA && cleanA.length > 2) {
                    const artistMatch = candArtistsLower.includes(cleanA) || 
                                        cleanA.includes(candArtistsLower) || 
                                        candDesc.includes(cleanA) ||
                                        candTitleLower.includes(cleanA);
                    if (!artistMatch) {
                        continue; // Skip wrong artist
                    }
                }

                // Protocol Check 4: Duration Matching (drift <= 15s or 8%)
                if (opts.duration && opts.duration > 0 && candDur > 0) {
                    const diff = Math.abs(candDur - opts.duration);
                    if (diff > 15 && (diff / opts.duration) > 0.08) {
                        continue; // Skip wrong track duration
                    }
                }

                // Protocol Check 5: Title Matching
                const candCleanT = candTitleLower.replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
                const isTitleMatch = candCleanT === cleanT || 
                                     candCleanT.startsWith(cleanT) || 
                                     candCleanT.includes(cleanT) || 
                                     cleanT.includes(candCleanT);
                if (!isTitleMatch) {
                    continue; // Skip title mismatch
                }

                // Candidate PASSED ALL PROTOCOLS! Resolve full song details
                let songData = cand;
                let encUrl = cand.encrypted_media_url || cand.more_info?.encrypted_media_url;

                if (!encUrl && cand.id) {
                    try {
                        const detRes = await axios.get('https://www.jiosaavn.com/api.php', {
                            params: {
                                __call: 'song.getDetails',
                                pids: cand.id,
                                _format: 'json',
                                _marker: '0',
                                api_version: '4',
                                ctx: 'web6dot0'
                            },
                            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0' },
                            timeout: 3000
                        }).catch(() => null);

                        songData = detRes?.data?.songs?.[0] || detRes?.data?.[cand.id] || cand;
                        encUrl = songData?.encrypted_media_url || songData?.more_info?.encrypted_media_url;
                    } catch {}
                }

                if (!encUrl && (cand.url || cand.perma_url)) {
                    const songUrl = cand.url || cand.perma_url;
                    const token = songUrl.split('/').pop();
                    if (token) {
                        const detRes = await axios.get('https://www.jiosaavn.com/api.php', {
                            params: {
                                __call: 'webapi.get',
                                token: token,
                                type: 'song',
                                _format: 'json',
                                _marker: '0',
                                ctx: 'web6dot0'
                            },
                            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0' },
                            timeout: 3000
                        }).catch(() => null);

                        songData = detRes?.data?.songs?.[0] || detRes?.data || cand;
                        encUrl = songData?.encrypted_media_url || songData?.more_info?.encrypted_media_url;
                    }
                }

                if (!encUrl) continue;

                const directCdnUrl = this.decryptSaavnMediaUrl(encUrl, '320') || this.decryptSaavnMediaUrl(encUrl, '160');
                if (!directCdnUrl || !isSafePublicUrl(directCdnUrl)) continue;

                const finalArtist = candArtists || opts.primaryArtist || 'Unknown Artist';
                const finalAlbum = candAlbum || opts.album || 'Single';
                const finalCover = (cand.image || cand.more_info?.image || songData.image || '').replace('150x150', '500x500').replace('50x50', '500x500');
                const finalPlays = parseInt(cand.play_count || cand.more_info?.play_count || songData.play_count || '0', 10);

                console.log(`[CleanCdnAudio] Verified official CDN match (320k): "${candTitle}" by "${finalArtist}" (Album: "${finalAlbum}", Plays: ${finalPlays})`);
                const result: CleanAudioResult = {
                    url: directCdnUrl,
                    duration: candDur || parseInt(songData.duration, 10) || 0,
                    title: candTitle,
                    artist: finalArtist,
                    album: finalAlbum,
                    albumId: cand.albumid || cand.album_id || cand.more_info?.album_id,
                    coverUrl: finalCover,
                    playCount: finalPlays,
                    trackId: cand.id,
                    bitrate: '320kbps',
                    source: 'saavn_direct_cdn'
                };
                cdnQueryCache.set(cacheKey, { result, expiresAt: Date.now() + 5 * 60 * 1000 });
                return result;
            }

            console.log(`[CleanCdnAudio] All ${candidates.length} candidates failed strict protocol validation.`);
            cdnQueryCache.set(cacheKey, { result: null, expiresAt: Date.now() + 60 * 1000 });
            return null;
        } catch (err: any) {
            console.warn(`[CleanCdnAudio] Resolution error: ${err.message}`);
            return null;
        }
    }

    /**
     * Retrieves official lyrics from JioSaavn by lyrics_id or song_id.
     */
    public static async getLyrics(songIdOrLyricsId: string): Promise<string | null> {
        try {
            if (!songIdOrLyricsId) return null;
            const res = await axios.get('https://www.jiosaavn.com/api.php', {
                params: {
                    __call: 'lyrics.getLyrics',
                    lyrics_id: songIdOrLyricsId,
                    _format: 'json',
                    _marker: '0',
                    api_version: '4',
                    ctx: 'web6dot0'
                },
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0' },
                timeout: 3500
            }).catch(() => null);

            const rawLyrics = res?.data?.lyrics;
            if (rawLyrics && typeof rawLyrics === 'string') {
                return rawLyrics
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/&quot;/g, '"')
                    .replace(/&#039;/g, "'")
                    .replace(/&amp;/g, '&')
                    .trim();
            }
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Resolves official lyrics for a track by searching JioSaavn.
     */
    public static async resolveLyrics(title: string, artist?: string): Promise<string | null> {
        try {
            const cleanT = (title || '').replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
            const cleanA = (artist || '').split(/[,&/|]/)[0].trim();
            const q = cleanA ? `${cleanA} ${cleanT}` : cleanT;
            if (!q) return null;

            const searchRes = await axios.get('https://www.jiosaavn.com/api.php', {
                params: {
                    __call: 'search.getResults',
                    q,
                    p: 1,
                    n: 3,
                    _format: 'json',
                    _marker: '0',
                    api_version: '4',
                    ctx: 'web6dot0'
                },
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0' },
                timeout: 3500
            }).catch(() => null);

            const results = searchRes?.data?.results || [];
            for (const r of results) {
                if (r?.has_lyrics === 'true' || r?.has_lyrics === true || r?.id) {
                    const lyrics = await this.getLyrics(r.id);
                    if (lyrics && lyrics.length > 20) {
                        return lyrics;
                    }
                }
            }
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Fetches detailed song metadata and decrypted 320kbps URL by song ID.
     */
    public static async getSongDetails(songId: string): Promise<any | null> {
        try {
            if (!songId) return null;
            const res = await axios.get('https://www.jiosaavn.com/api.php', {
                params: {
                    __call: 'song.getDetails',
                    pids: songId,
                    _format: 'json',
                    _marker: '0',
                    api_version: '4',
                    ctx: 'web6dot0'
                },
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0' },
                timeout: 4000
            }).catch(() => null);

            const song = res?.data?.songs?.[0] || res?.data?.[songId];
            if (!song) return null;

            const enc = song.encrypted_media_url || song.more_info?.encrypted_media_url;
            const audioUrl = enc ? this.decryptSaavnMediaUrl(enc) : null;

            return {
                ...song,
                audioUrl
            };
        } catch {
            return null;
        }
    }
}

