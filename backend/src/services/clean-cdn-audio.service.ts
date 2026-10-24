import axios from 'axios';
import { isSafePublicUrl } from '../utils/security';
const des = require('des.js');

export interface CleanAudioResult {
    url: string;
    duration: number;
    title: string;
    artist: string;
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
    public static decryptSaavnMediaUrl(encBase64: string): string | null {
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

            if (url.endsWith('.mp4') || url.endsWith('.m4a')) {
                url = url.replace(/_[0-9]+(\.mp4|\.m4a)$/, '_320.mp4');
            } else {
                url = url.replace(/_[0-9]+$/, '_320.mp4');
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
            if (typeof queryOrOpts === 'string') {
                if (!queryOrOpts || typeof queryOrOpts !== 'string') return null;
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

            const langSuffix = opts.language && !cleanT.includes(opts.language.toLowerCase()) ? ` ${opts.language}` : '';
            const searchQuery = (cleanA ? `${cleanA} ${cleanT}${langSuffix}` : `${cleanT}${langSuffix}`).slice(0, 120).trim();
            console.log(`[CleanCdnAudio] Searching CDN candidate for: "${searchQuery}" (Req Lang: ${opts.language || 'any'}, Artist: ${cleanA || 'any'})`);

            // 1. Fetch Candidates via Search API and Autocomplete
            const [searchRes, autoRes] = await Promise.all([
                axios.get('https://www.jiosaavn.com/api.php', {
                    params: {
                        __call: 'search.getResults',
                        q: searchQuery,
                        _format: 'json',
                        _marker: '0',
                        ctx: 'web6dot0',
                        p: '1',
                        n: '10'
                    },
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0' },
                    timeout: 3500
                }).catch(() => null),
                axios.get('https://www.jiosaavn.com/api.php', {
                    params: {
                        __call: 'autocomplete.get',
                        query: searchQuery,
                        _format: 'json',
                        _marker: '0',
                        ctx: 'web6dot0'
                    },
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0' },
                    timeout: 3000
                }).catch(() => null)
            ]);

            const candidates: any[] = [];
            const seenIds = new Set<string>();

            if (searchRes?.data?.results && Array.isArray(searchRes.data.results)) {
                for (const r of searchRes.data.results) {
                    if (r && (r.id || r.perma_url) && !seenIds.has(r.id || r.perma_url)) {
                        seenIds.add(r.id || r.perma_url);
                        candidates.push(r);
                    }
                }
            }

            if (autoRes?.data?.songs?.data && Array.isArray(autoRes.data.songs.data)) {
                for (const s of autoRes.data.songs.data) {
                    if (s && s.id && !seenIds.has(s.id)) {
                        seenIds.add(s.id);
                        candidates.push(s);
                    }
                }
            }

            if (candidates.length === 0) {
                console.log(`[CleanCdnAudio] Zero CDN candidates found for: "${searchQuery}"`);
                return null;
            }

            // 2. Filter & Score Candidates Against Strict Protocols
            for (const cand of candidates) {
                const candTitle = (cand.song || cand.title || '').trim();
                const candTitleLower = candTitle.toLowerCase();
                const candAlbum = (cand.album || '').toLowerCase();
                const candDesc = (cand.description || '').toLowerCase();
                const candArtists = (cand.primary_artists || cand.singers || cand.more_info?.primary_artists || cand.more_info?.singers || '').toLowerCase();
                const candLang = (cand.language || cand.more_info?.language || '').toLowerCase().trim();
                const candDur = parseInt(cand.duration || cand.more_info?.duration, 10) || 0;

                // Protocol Check 1: Hard Reject Terms (instrumentals, covers, guitar, piano, karaoke, etc.)
                let hasRejectTerm = false;
                for (const term of CDN_HARD_REJECT_TERMS) {
                    if (candTitleLower.includes(term) || candAlbum.includes(term) || candDesc.includes(term)) {
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
                    if (candLang && candLang !== reqLang && candLang !== 'unknown') {
                        continue; // Skip conflicting language
                    }
                }

                // Protocol Check 3: Artist Matching
                if (cleanA && cleanA.length > 2) {
                    const artistMatch = candArtists.includes(cleanA) || 
                                        cleanA.includes(candArtists) || 
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

                // Protocol Check 6: DRM Protection on Western Labels
                // Western DRM tracks on JioSaavn often only have karaoke backing or truncated snippets
                if (cand.is_drm === 1 || cand.is_drm === '1') {
                    if (candLang === 'english' || (!candLang && !/[^\x00-\x7F]/.test(candTitle))) {
                        continue; // Bypassed: Western DRM tracks route to verified YouTube official audio
                    }
                }

                // Candidate PASSED ALL PROTOCOLS! Resolve full song details
                let songData = cand;
                let encUrl = cand.encrypted_media_url || cand.more_info?.encrypted_media_url;

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

                const directCdnUrl = this.decryptSaavnMediaUrl(encUrl);
                if (!directCdnUrl || !isSafePublicUrl(directCdnUrl)) continue;

                console.log(`[CleanCdnAudio] Verified official CDN match: "${candTitle}" by "${candArtists || cleanA}" (${directCdnUrl.slice(0, 60)}...)`);
                return {
                    url: directCdnUrl,
                    duration: candDur || parseInt(songData.duration, 10) || 0,
                    title: candTitle,
                    artist: candArtists || opts.primaryArtist || '',
                    bitrate: '320kbps',
                    source: 'saavn_direct_cdn'
                };
            }

            console.log(`[CleanCdnAudio] All ${candidates.length} candidates failed strict protocol validation. Falling back to master AudioResolver.`);
            return null;
        } catch (err: any) {
            console.warn(`[CleanCdnAudio] Resolution error: ${err.message}`);
            return null;
        }
    }
}
