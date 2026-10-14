import axios from 'axios';
const des = require('des.js');

export interface CleanAudioResult {
    url: string;
    duration: number;
    title: string;
    artist: string;
    bitrate: string;
    source: 'saavn_direct_cdn';
}

export class CleanCdnAudioService {
    private static decryptSaavnMediaUrl(encBase64: string): string {
        const key = Buffer.from('38346591');
        const cipher = des.DES.create({ type: 'decrypt', key: key });
        const raw = Buffer.from(encBase64, 'base64');
        const out: number[] = [];
        for (let i = 0; i < raw.length; i += 8) {
            const chunk = raw.slice(i, i + 8);
            const dec = cipher.update(Array.from(chunk));
            out.push(...dec);
        }
        const pad = out[out.length - 1];
        const clean = (pad > 0 && pad <= 8) ? out.slice(0, out.length - pad) : out;
        let url = Buffer.from(clean).toString('utf8');
        if (url.endsWith('.mp4') || url.endsWith('.m4a')) {
            url = url.replace(/_[0-9]+(\.mp4|\.m4a)$/, '_320.mp4');
        } else {
            url = url.replace(/_[0-9]+$/, '_320.mp4');
        }
        return url;
    }

    /**
     * Resolves a song query (e.g. "Ed Sheeran - Shape of You") to a high-speed, direct 320kbps CDN stream.
     * Zero yt-dlp, zero YouTube bot blocks, instant 200ms resolution.
     */
    static async resolveAudio(query: string): Promise<CleanAudioResult | null> {
        try {
            const cleanQuery = query
                .replace(/^ytsearch[0-9]*:/, '')
                .replace(/https?:\/\/[^\s]+/g, '')
                .replace(/\(Official Audio\)/i, '')
                .replace(/\(Official Video\)/i, '')
                .replace(/\(Lyric Video\)/i, '')
                .replace(/\(.*?\)/g, '')
                .replace(/\[.*?\]/g, '')
                .split('|')[0]
                .trim();

            if (!cleanQuery) return null;

            console.log(`[CleanCdnAudio] Resolving 320kbps audio for: "${cleanQuery}"`);
            const autoRes = await axios.get('https://www.jiosaavn.com/api.php', {
                params: {
                    __call: 'autocomplete.get',
                    query: cleanQuery,
                    _format: 'json',
                    _marker: '0',
                    ctx: 'web6dot0'
                },
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0' },
                timeout: 3500
            });

            const songItem = autoRes.data?.songs?.data?.[0];
            if (!songItem || !songItem.url) {
                console.log(`[CleanCdnAudio] No match found for: "${cleanQuery}"`);
                return null;
            }

            const token = songItem.url.split('/').pop();
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
                timeout: 3500
            });

            const songData = detRes.data?.songs?.[0] || detRes.data;
            const encUrl = songData?.encrypted_media_url || songData?.more_info?.encrypted_media_url;
            if (!encUrl) {
                return null;
            }

            const directCdnUrl = this.decryptSaavnMediaUrl(encUrl);
            const duration = parseInt(songData.duration, 10) || 0;

            console.log(`[CleanCdnAudio] Successfully resolved 320kbps CDN stream: "${songItem.title}" (${directCdnUrl.slice(0, 60)}...)`);
            return {
                url: directCdnUrl,
                duration,
                title: songItem.title,
                artist: songItem.more_info?.primary_artists || songItem.description || '',
                bitrate: '320kbps',
                source: 'saavn_direct_cdn'
            };
        } catch (err: any) {
            console.warn(`[CleanCdnAudio] Lookup failed for "${query}":`, err.message);
            return null;
        }
    }
}
