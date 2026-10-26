import { FastifyInstance } from 'fastify';
import axios from 'axios';
import https from 'https';
import http from 'http';
import { config } from '../config/env';
import cloudinary from '../utils/cloudinary.js';

import { getCacheVal, setCacheVal, invalidateCache } from '../utils/cache.js';

// Module-level caches & concurrency management for YouTube streaming
let cachedYtBin: string | null = null;
export const youtubeStreamCache = new Map<string, { directUrl: string; expiresAt: number }>();

/**
 * Async Semaphore to limit simultaneous yt-dlp child processes.
 * Prevents YouTube from rate-limiting/429 banning the server IP and protects CPU under concurrent user bursts.
 */
class AsyncSemaphore {
    private permits: number;
    private queue: (() => void)[] = [];

    constructor(permits: number) {
        this.permits = permits;
    }

    async acquire(): Promise<() => void> {
        if (this.permits > 0) {
            this.permits--;
            let released = false;
            return () => {
                if (released) return;
                released = true;
                this.release();
            };
        }
        return new Promise<() => void>((resolve) => {
            this.queue.push(() => {
                let released = false;
                resolve(() => {
                    if (released) return;
                    released = true;
                    this.release();
                });
            });
        });
    }

    private release(): void {
        this.permits++;
        if (this.queue.length > 0 && this.permits > 0) {
            this.permits--;
            const next = this.queue.shift();
            if (next) next();
        }
    }
}

// Persistent connection pooling agents for ultra-fast audio streaming (up to 2,048 simultaneous sockets)
const httpsStreamingAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 60000,
    maxSockets: 2048,
    maxFreeSockets: 256,
    timeout: 30000,
});
const httpStreamingAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 60000,
    maxSockets: 2048,
    maxFreeSockets: 256,
    timeout: 30000,
});

// Circuit breaker to immediately route to Infinity Gates if host IP is rate-limited by YouTube
let localYtBlockCooldownUntil = 0;

// Concurrency semaphore: allows up to 10 parallel extractions for 1000+ simultaneous users
const ytdlpSemaphore = new AsyncSemaphore(10);

// In-flight single-flight map: collapses simultaneous user requests for the same track into a single extraction
const inFlightStreamResolutions = new Map<string, Promise<string | null>>();

/**
 * Resolves the available yt-dlp binary path and caches the result
 */
function getYtBin(): string {
    if (cachedYtBin) return cachedYtBin;
    const path = require('path');
    const fs = require('fs');
    const { execSync } = require('child_process');
    const localCandidates = [
        path.resolve(process.cwd(), 'yt-dlp.exe'),
        path.resolve(process.cwd(), 'backend', 'yt-dlp.exe'),
        path.resolve(__dirname, '..', '..', 'yt-dlp.exe'),
        path.resolve(__dirname, '..', '..', 'backend', 'yt-dlp.exe'),
        'D:\\.gemini\\Zenify\\backend\\yt-dlp.exe',
        'D:\\.gemini\\Zenify\\yt-dlp.exe'
    ];
    const candidates = [
        ...localCandidates.filter((p: string) => fs.existsSync(p)),
        'yt-dlp',
        'python -m yt_dlp',
        'python3 -m yt_dlp',
        '/usr/local/bin/yt-dlp',
        '/usr/bin/yt-dlp'
    ];
    for (const candidate of candidates) {
        try { 
            execSync(`${candidate} --version`, { stdio: 'ignore', timeout: 3000 }); 
            cachedYtBin = candidate; 
            return candidate; 
        } catch {}
    }
    cachedYtBin = localCandidates.find((p: string) => fs.existsSync(p)) || 'yt-dlp';
    return cachedYtBin;
}

/**
 * Retrieves proxy arguments from environment or rotating proxies.txt file
 */
function getProxyArgs(): string[] {
    if (process.env.YOUTUBE_PROXY) {
        return ['--proxy', process.env.YOUTUBE_PROXY];
    }
    if (process.env.PROXY_URL) {
        return ['--proxy', process.env.PROXY_URL];
    }
    const path = require('path');
    const fs = require('fs');
    const proxyFilePaths = [
        path.resolve(process.cwd(), 'proxies.txt'),
        path.resolve(process.cwd(), 'backend', 'proxies.txt'),
    ];
    for (const pFile of proxyFilePaths) {
        if (fs.existsSync(pFile)) {
            const lines = fs.readFileSync(pFile, 'utf-8')
                .split('\n')
                .map((l: string) => l.trim())
                .filter((l: string) => l && !l.startsWith('#'));
            if (lines.length > 0) {
                const randomProxy = lines[Math.floor(Math.random() * lines.length)];
                return ['--proxy', randomProxy];
            }
        }
    }
    return [];
}

/**
 * Retrieves cookies arguments from temp directory or project root if present
 */
function getCookieArgs(): string[] {
    const path = require('path');
    const os = require('os');
    const fs = require('fs');
    const possibleCookiePaths = [
        path.join(os.tmpdir(), 'yt-cookies.txt'),
        path.resolve(process.cwd(), 'cookies.txt'),
        path.resolve(process.cwd(), 'backend', 'cookies.txt'),
        path.resolve(process.cwd(), 'yt-cookies.txt'),
        path.resolve(process.cwd(), 'backend', 'yt-cookies.txt'),
    ];
    for (const cPath of possibleCookiePaths) {
        if (fs.existsSync(cPath)) {
            return ['--cookies', cPath];
        }
    }
    return [];
}

/**
 * Resolves direct media URL using yt-dlp -g with client variations,
 * immediately falling back to distributed Infinity Gates (RapidAPI, Piped, Invidious, Cobalt)
 * when local IP is throttled or challenged by YouTube bot protection.
 */
async function resolveDirectStreamUrl(url: string, server: FastifyInstance, queryHint?: string): Promise<string | null> {
    const videoIdMatch = url.match(/(?:v=|youtu\.be\/|embed\/|\/v\/)([a-zA-Z0-9_-]{11})/);
    let videoId = videoIdMatch ? videoIdMatch[1] : null;

    const ytBin = getYtBin();
    const cookiesArgs = getCookieArgs();
    const proxyArgs = getProxyArgs();

    // 0. Clean 320kbps CDN Resolver (Pristine Akamai CDN full song - Priority 1 per AGENTS.md Rule 1)
    let effectiveHint = queryHint;
    if (!effectiveHint && url && !url.includes('youtube.com/watch') && !url.includes('youtu.be/')) {
        const rawClean = url.replace(/^ytsearch[0-9]*:/, '').trim();
        if (rawClean.length > 2) effectiveHint = rawClean;
    }
    if (effectiveHint) {
        try {
            const { CleanCdnAudioService } = await import('../services/clean-cdn-audio.service.js');
            const cdnResult = await CleanCdnAudioService.resolveAudio(effectiveHint);
            if (cdnResult?.url) {
                server.log.info(`[stream-youtube] Direct media URL resolved via Clean CDN (320kbps): ${cdnResult.url.slice(0, 80)}...`);
                return cdnResult.url;
            }
        } catch (cdnErr: any) {
            server.log.warn(`[stream-youtube] Clean CDN resolution skipped in Step 0: ${cdnErr.message}`);
        }
    }

    // 1. Direct extraction via yt-dlp -g (bypassed if local IP is under active circuit breaker cooldown)
    const isLocalBlocked = Date.now() < localYtBlockCooldownUntil;
    if (ytBin && !isLocalBlocked) {
        // Priority: android_music, tv_embedded bypass datacenter IP bot challenges
        const gClients: (string | null)[] = ['android_music', 'tv_embedded'];
        let allThrottled = false;
        let detectedBotBlock = false;
        for (const client of gClients) {
            try {
                const { safeExecFile } = await import('../utils/security.js');
                const [binExecutable, ...binPrefix] = ytBin.split(' ');
                const gArgs = [
                    ...binPrefix,
                    '--js-runtimes', 'node',
                    ...cookiesArgs,
                    ...proxyArgs,
                    '-g',
                    '--force-ipv4',
                    '--no-warnings',
                    '--no-check-certificates',
                    ...(client ? ['--extractor-args', `youtube:player_client=${client}`] : []),
                    '-f', 'ba/18/b/best',
                    '--no-playlist',
                    '--socket-timeout', '8',
                    url
                ];
                const { stdout } = await safeExecFile(binExecutable, gArgs, { timeout: 9500 });
                const urls = stdout.split(/\r?\n/).map(l => l.trim()).filter(l => l.startsWith('http'));
                const directMediaUrl = urls.find(u => u.includes('mime=audio') || u.includes('audio')) || urls[0];
                if (directMediaUrl && directMediaUrl.startsWith('http')) {
                    server.log.info(`[stream-youtube] Direct media URL resolved via -g (${client || 'default-node'}): ${directMediaUrl.slice(0, 80)}...`);
                    return directMediaUrl;
                }
            } catch (gErr: any) {
                server.log.warn(`[stream-youtube] Direct URL lookup -g (${client || 'default-node'}) failed: ${gErr.message}`);
                if (gErr.message?.includes('Sign in to confirm') || gErr.message?.includes('bot') || gErr.message?.includes('429')) {
                    detectedBotBlock = true;
                }
            }
        }
        if (detectedBotBlock) {
            server.log.warn(`[stream-youtube] YouTube IP block/bot challenge detected. Engaging 30-second circuit breaker.`);
            localYtBlockCooldownUntil = Date.now() + 30 * 1000;
        }
    } else if (isLocalBlocked) {
        server.log.info(`[stream-youtube] Host IP in active circuit breaker cooldown. Routing directly to Infinity Gates network.`);
    }

    // 2. Infinity Gates fallback: If local yt-dlp was blocked or 429'd
    server.log.warn('[stream-youtube] Engaging Infinity Gates distributed resolver pool (RapidAPI MP3, Piped, Invidious, Cobalt)...');

    // Gate 0: Clean CDN Direct 320kbps Stream (JioSaavn full fidelity)
    if (queryHint) {
        try {
            const { CleanCdnAudioService } = await import('../services/clean-cdn-audio.service.js');
            const cdnResult = await CleanCdnAudioService.resolveAudio(queryHint);
            if (cdnResult?.url) {
                server.log.info(`[stream-youtube] Infinity Gate 0 (Clean CDN 320kbps) resolved: ${cdnResult.url.slice(0, 80)}...`);
                return cdnResult.url;
            }
        } catch (cdnErr: any) {
            server.log.warn(`[stream-youtube] Clean CDN resolution attempt: ${cdnErr.message}`);
        }
    }

    // Gate 1: RapidAPI Spotify / Music Downloader (Priority 3 per AGENTS.md)
    try {
        const { SystemSettingsService } = await import('../services/system-settings.service.js');
        const rapidApiKey = await SystemSettingsService.getRapidApiKey();
        if (rapidApiKey) {
            const targetQuery = queryHint || (url.startsWith('ytsearch') ? url.replace(/^ytsearch[0-9]*:/, '').trim() : url);
            // 1a. Try Spotify81 full track downloader
            const s81Res = await axios.get('https://spotify81.p.rapidapi.com/download_track', {
                params: { q: targetQuery, onlyLinks: 'true' },
                headers: { 'x-rapidapi-key': rapidApiKey, 'x-rapidapi-host': 'spotify81.p.rapidapi.com' },
                timeout: 8000
            }).catch(() => null);

            if (s81Res?.data?.url && !s81Res.data.url.includes('audio-ssl') && !s81Res.data.url.includes('mzstatic')) {
                server.log.info(`[stream-youtube] Infinity Gate 1 (RapidAPI Spotify81) successfully resolved full audio stream!`);
                return s81Res.data.url;
            }

            // 1b. Fallback to YT MP3 downloader
            const mp3Res = await axios.get('https://yt-search-and-download-mp3.p.rapidapi.com/mp3', {
                params: { url },
                headers: { 'x-rapidapi-key': rapidApiKey, 'x-rapidapi-host': 'yt-search-and-download-mp3.p.rapidapi.com' },
                timeout: 5000
            }).catch(() => null);

            if (mp3Res?.data?.success && mp3Res?.data?.download) {
                server.log.info(`[stream-youtube] Infinity Gate 1 (RapidAPI MP3) successfully resolved full audio stream!`);
                return mp3Res.data.download;
            }
        }
    } catch (rapErr: any) {
        server.log.warn(`[stream-youtube] RapidAPI MP3 Gateway error: ${rapErr.message}`);
    }

    // Resolve videoId if missing (e.g. url is a search query) so Infinity Gates can engage
    if (!videoId && (url.startsWith('ytsearch') || !url.startsWith('http'))) {
        try {
            const { ExternalMetadataService } = await import('../services/external-metadata.service.js');
            const cleanQuery = url.replace(/^ytsearch[0-9]*:/, '').trim();
            const candidates = await ExternalMetadataService.searchYoutubeDirect(cleanQuery).catch(() => []);
            if (candidates && candidates.length > 0 && candidates[0].id) {
                videoId = candidates[0].id;
                server.log.info(`[stream-youtube] Fast-resolved videoId: ${videoId} for query: "${cleanQuery}"`);
            }
        } catch {}
    }

    // Gate 2: Distributed Piped API instances in parallel race
    if (videoId) {
        const pipedEndpoints = [
            `https://pipedapi.kavin.rocks/streams/${videoId}`,
            `https://piped-api.lunar.icu/streams/${videoId}`,
            `https://api.piped.projectsegfau.lt/streams/${videoId}`,
            `https://pipedapi.drgns.space/streams/${videoId}`,
            `https://pipedapi.leptons.xyz/streams/${videoId}`
        ];

        const fetchPiped = async (endpoint: string): Promise<string> => {
            const res = await axios.get(endpoint, { timeout: 3500 });
            const audioStreams = res.data?.audioStreams;
            if (Array.isArray(audioStreams) && audioStreams.length > 0) {
                const best = audioStreams.find((s: any) => s.mimeType?.includes('audio/mp4') || s.mimeType?.includes('audio/m4a')) || audioStreams[0];
                if (best?.url) return best.url;
            }
            throw new Error(`No stream at ${endpoint}`);
        };

        try {
            const directUrl = await Promise.any(pipedEndpoints.map(fetchPiped));
            if (directUrl) {
                server.log.info(`[stream-youtube] Infinity Gate 2 (Piped) parallel race successfully resolved stream!`);
                return directUrl;
            }
        } catch {}
    }

    // Gate 3: Distributed Invidious Instances in parallel race
    if (videoId) {
        const invidiousEndpoints = [
            `https://inv.nadeko.net/api/v1/videos/${videoId}`,
            `https://invidious.nerdvpn.de/api/v1/videos/${videoId}`,
            `https://inv.tux.pizza/api/v1/videos/${videoId}`,
            `https://invidious.no-valat.net/api/v1/videos/${videoId}`,
            `https://invidious.projectsegfau.lt/api/v1/videos/${videoId}`,
            `https://yt.artemislena.eu/api/v1/videos/${videoId}`
        ];

        const fetchInvidious = async (endpoint: string): Promise<string> => {
            const res = await axios.get(endpoint, { timeout: 3500 });
            const formats = res.data?.adaptiveFormats;
            if (Array.isArray(formats) && formats.length > 0) {
                const audio = formats.find((f: any) => f.type?.includes('audio/mp4') || f.type?.includes('audio/webm'));
                if (audio?.url) return audio.url;
            }
            throw new Error(`No audio format at ${endpoint}`);
        };

        try {
            const directUrl = await Promise.any(invidiousEndpoints.map(fetchInvidious));
            if (directUrl) {
                server.log.info(`[stream-youtube] Infinity Gate 3 (Invidious) parallel race successfully resolved stream!`);
                return directUrl;
            }
        } catch {}
    }

    // Gate 4: Cobalt Engine in parallel race
    if (videoId) {
        const cobaltEndpoints = [
            'https://api.cobalt.tools',
            'https://co.wuk.sh/api/json'
        ];
        const fetchCobalt = async (endpoint: string): Promise<string> => {
            const cobRes = await axios.post(endpoint, {
                url: `https://www.youtube.com/watch?v=${videoId}`,
                downloadMode: 'audio'
            }, {
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                timeout: 4000
            });
            if (cobRes.data?.url) return cobRes.data.url;
            throw new Error(`No URL at ${endpoint}`);
        };

        try {
            const directUrl = await Promise.any(cobaltEndpoints.map(fetchCobalt));
            if (directUrl) {
                server.log.info(`[stream-youtube] Infinity Gate 4 (Cobalt) resolved stream!`);
                return directUrl;
            }
        } catch {}
    }

    // Gate 5: Resilient Apify Spotify MP3 Full Audio Resolver
    try {
        const { ExternalMetadataService } = await import('../services/external-metadata.service.js');
        const searchTarget = queryHint || (url.includes('spotify.com') ? url : (videoId ? `https://www.youtube.com/watch?v=${videoId}` : url));
        server.log.info(`[stream-youtube] Engaging Infinity Gate 5 (Apify Spotify) for: "${searchTarget}"`);
        const apifyUrl = await ExternalMetadataService.fetchAudioViaApifySpotify(searchTarget);
        if (apifyUrl) {
            server.log.info(`[stream-youtube] Infinity Gate 5 (Apify Spotify) successfully resolved full audio stream!`);
            return apifyUrl;
        }
    } catch (apifyErr: any) {
        server.log.warn(`[stream-youtube] Apify Spotify resolver error: ${apifyErr.message}`);
    }

    return null;
}





import { isSafePublicUrl, assertSafePublicUrl } from '../utils/security';

/** Fetch a URL server-side and return { statusCode, contentType, body } */
function serverFetch(
    rawUrl: string,
    asBuffer = false,
): Promise<{ statusCode: number; contentType: string; body: Buffer; finalUrl: string }> {
    return new Promise((resolve, reject) => {
        if (!isSafePublicUrl(rawUrl)) {
            return reject(new Error('Access to private or local network addresses is prohibited'));
        }

        let targetUrl: URL;
        try { targetUrl = new URL(rawUrl); } catch { return reject(new Error('Invalid URL')); }

        const client = targetUrl.protocol === 'https:' ? https : http;
        const options = {
            hostname: targetUrl.hostname,
            port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
            path: targetUrl.pathname + targetUrl.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': targetUrl.origin + '/',
            },
            timeout: 12000,
        };

        const req = client.request(options, (res) => {
            // Follow redirects (up to 5)
            if ([301, 302, 307, 308].includes(res.statusCode!) && res.headers.location) {
                const loc = res.headers.location;
                const nextUrl = loc.startsWith('http') ? loc : targetUrl.origin + loc;
                serverFetch(nextUrl, asBuffer).then(resolve).catch(reject);
                res.resume(); // drain
                return;
            }

            const chunks: Buffer[] = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve({
                statusCode: res.statusCode ?? 200,
                contentType: res.headers['content-type'] ?? '',
                body: Buffer.concat(chunks),
                finalUrl: rawUrl,
            }));
            res.on('error', reject);
        });

        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.on('error', reject);
        req.end();
    });
}

/** Extract the best image URL from an HTML string */
function extractImageFromHtml(html: string, baseUrl: string): string | null {
    // Priority order: og:image → twitter:image → first large <img>
    const ogMatch =
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch?.[1]) return ogMatch[1];

    const twMatch =
        html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    if (twMatch?.[1]) return twMatch[1];

    // Generic schema.org image
    const schemaMatch = html.match(/<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+itemprop=["']image["']/i);
    if (schemaMatch?.[1]) return schemaMatch[1];

    // Fallback: first <img src> that looks like a real image, or Google Image Search specific classes
    const imgMatch = html.match(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp|gif)[^"']*)["']/i) ||
                     html.match(/<img[^>]+src=["'](https:\/\/[^"']+)["'][^>]*class=["'][^"']*rg_i[^"']*["']/i) ||
                     html.match(/<img[^>]*class=["'][^"']*rg_i[^"']*["'][^>]+src=["'](https:\/\/[^"']+)["']/i);

    if (imgMatch?.[1] || imgMatch?.[2]) {
        const src = imgMatch[1] || imgMatch[2];
        if (src.startsWith('http')) return src;
        try { return new URL(src, baseUrl).toString(); } catch { return null; }
    }
    return null;
}

/** Try to pull the real image URL out of common sources */
function resolveImageUrl(rawUrl: string): string {
    try {
        const u = new URL(rawUrl);

        // Spotify: Convert thumbnails to high-res (640x640)
        // Patterns: ab67616d00001e02 (300) -> ab67616d0000b273 (640)
        if (u.hostname.includes('scdn.co') && u.pathname.includes('ab67616d')) {
            return rawUrl
                .replace('00001e02', '0000b273') // 300 -> 640
                .replace('00004851', '0000b273'); // 64 -> 640
        }

        // YouTube: Convert thumbnails to maxresdefault
        if (u.hostname.includes('ytimg.com')) {
            if (u.pathname.includes('default.jpg') || u.pathname.includes('hqdefault.jpg') || u.pathname.includes('mqdefault.jpg') || u.pathname.includes('sddefault.jpg')) {
                return rawUrl.replace(/\/(?:default|hqdefault|mqdefault|sddefault)\.jpg/, '/maxresdefault.jpg');
            }
        }

        // Apple Music: {w}x{h} -> 2000x2000bb
        if (u.hostname.includes('mzstatic.com')) {
            return rawUrl.replace(/\/\d+x\d+bb\.jpg$/, '/2000x2000bb.jpg');
        }

        // Bing Images: mediaurl param contains the real image
        if (u.hostname.includes('bing.com') && u.searchParams.has('mediaurl')) {
            return decodeURIComponent(u.searchParams.get('mediaurl')!);
        }

        // Google Images (imgurl param)
        if (u.hostname.includes('google.com') && u.searchParams.has('imgurl')) {
            return decodeURIComponent(u.searchParams.get('imgurl')!);
        }

        // Google Redirects (Right click > Copy link address on Google Images usually gives this)
        if (u.hostname.includes('google.com') && u.pathname.includes('/url') && u.searchParams.has('url')) {
            return decodeURIComponent(u.searchParams.get('url')!);
        }

        // Pinterest — try to upsample pin image URL
        if (u.hostname.includes('pinimg.com')) {
            // Convert thumbnail sizes to originals
            return rawUrl.replace(/\/\d+x\//, '/originals/');
        }
    } catch { /* fall through */ }
    return rawUrl;
}

const paletteAICache = new Map<string, string[]>();

// ── Route ──────────────────────────────────────────────────────────────────

export async function utilsRoutes(server: FastifyInstance) {
    /**
     * POST /api/utils/upload-image
     * 
     * Generic endpoint to upload an image and return the Cloudinary URL.
     */
    server.post('/upload-image', {
        preHandler: [server.authenticate]
    }, async (request, reply) => {
        const parts = request.parts();
        let uploadedUrl = "";
        try {
            for await (const p of parts) {
                const part = p as any;
                if (part.file && part.fieldname === 'image') {
                    const uploadPromise = new Promise((resolve, reject) => {
                        const uploadStream = cloudinary.uploader.upload_stream(
                            {
                                resource_type: 'image',
                                folder: 'zenify/uploads',
                            },
                            (error: any, result: any) => {
                                if (error) reject(error);
                                else resolve(result);
                            }
                        );
                        part.file.on('error', (err: any) => reject(err));
                        part.file.pipe(uploadStream);
                    });
                    const result: any = await uploadPromise;
                    uploadedUrl = result.secure_url;
                }
            }
            if (!uploadedUrl) return reply.status(400).send({ error: 'No image provided' });
            return reply.send({ url: uploadedUrl });
        } catch (err: any) {
            server.log.error(`[upload-image] ${err?.message}`);
            return reply.status(500).send({ error: 'Failed to upload image' });
        }
    });
    /**
     * GET /api/utils/extract-palette?url=<encoded-image-url>
     *
     * Fetches the image server-side, extracts the 4 most dominant colors using node-vibrant.
     * Returns an array of HEX colors.
     */
    server.get('/extract-palette', async (request, reply) => {
        const { url } = request.query as { url?: string };
        if (!url) return reply.status(400).send({ error: 'Missing url parameter' });
        if (!isSafePublicUrl(url)) return reply.status(400).send({ error: 'Invalid or restricted URL' });

        try {
            const { PaletteService } = await import('../services/palette.service.js');
            const colors = await PaletteService.extractColors(url);
            if (!colors) {
                return reply.status(422).send({ error: 'Color extraction failed' });
            }

            const rgbToHex = (r: number, g: number, b: number) => 
                '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();

            const hexPalette = colors.map((c: any) => rgbToHex(c.r, c.g, c.b));
            return reply.send({ palette: hexPalette });
        } catch (err: any) {
            server.log.error(`[extract-palette] ${err?.message}`);
            return reply.status(500).send({ error: 'Internal error during palette extraction' });
        }
    });

    /**
     * POST /api/utils/backfill-palettes
     *
     * Admin only. Backfills palettes for all existing tracks/albums missing them.
     */
    server.post('/backfill-palettes', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, async (request, reply) => {
        try {
            const { PaletteService } = await import('../services/palette.service.js');
            const result = await PaletteService.backfillAll(100);
            return reply.send({ message: 'Backfill completed successfully', result });
        } catch (err: any) {
            server.log.error(`[backfill-palettes] ${err?.message}`);
            return reply.status(500).send({ error: 'Failed to run backfill' });
        }
    });

    /**
     * GET /api/utils/resolve-image?url=<encoded-url>
     * 
     * Resolve a complex page URL (Bing, Google, Wiki) to a DIRECT image URL.
     * Returns JSON { url: string }
     */
    server.get('/resolve-image', async (request, reply) => {
        const { url } = request.query as { url?: string };
        if (!url) return reply.status(400).send({ error: 'Missing url parameter' });
        if (!isSafePublicUrl(url)) return reply.status(400).send({ error: 'Invalid or restricted URL' });

        try {
            const resolved = resolveImageUrl(url);
            
            // Try fetching to see if it's HTML and extract
            const result = await serverFetch(resolved);
            if (result.contentType.includes('text/html')) {
                const extracted = extractImageFromHtml(result.body.toString('utf-8'), resolved);
                if (extracted) return { url: extracted };
            }
            
            // If it's already an image or we can't extract, return the resolved wrapper
            return { url: resolved };
        } catch (err) {
            return { url }; // Fallback to original
        }
    });

    /**
     * GET /api/utils/proxy-image?url=<encoded-url>
     *
     * Smart image proxy:
     *   1. Checks for known URL patterns (Bing, Google Images) and extracts real image URL
     *   2. If the fetched content is HTML, parses og:image / twitter:image from the page
     *   3. Streams the final image back with permissive CORS headers
     */
    server.get('/proxy-image', async (request, reply) => {
        const { url: queryUrl } = request.query as { url?: string };
        if (!queryUrl) return reply.status(400).send({ error: 'Missing url parameter' });
        if (!isSafePublicUrl(queryUrl)) return reply.status(400).send({ error: 'Invalid or restricted URL' });
        let url: string = queryUrl;

        try {
            // Smart extraction for media links (Apple Music, YouTube, Spotify)
            const isMediaUrl = url.includes('youtube.com') || url.includes('youtu.be') || url.includes('music.youtube.com') || url.includes('music.apple.com') || url.includes('spotify.com') || url.includes('instagram.com');
            if (isMediaUrl) {
                try {
                    const { ExternalMetadataService } = await import('../services/external-metadata.service.js');
                    const isYoutube = url.includes('youtube.com') || url.includes('youtu.be') || url.includes('music.youtube.com');
                    
                    let gotCover = false;
                    if (!isYoutube) {
                        // Eagerly try fetchFromUrl first to use iTunes/Spotify official APIs
                        const meta = await ExternalMetadataService.fetchFromUrl(url);
                        if (meta && meta.cover) {
                            url = meta.cover;
                            gotCover = true;
                        }
                    }
                    
                    if (!gotCover) {
                        const infoRes = await ExternalMetadataService.execYtDlp('--dump-json --no-playlist --no-warnings', url);
                        const info = JSON.parse(infoRes);
                        if (info.thumbnail) {
                            url = info.thumbnail;
                        } else if (info.thumbnails && info.thumbnails.length > 0) {
                            url = info.thumbnails[info.thumbnails.length - 1].url;
                        }
                    }
                } catch (e: any) {
                    server.log.warn(`[ProxyImage] Failed to resolve media thumbnail for ${url}: ${e.message}`);
                }
            }

            // Step 1: resolve common "wrapper" URLs to real image URLs
            const resolvedUrl = resolveImageUrl(url);

            // Step 2: fetch the resolved URL with 600x600bb fallback retry
            let result: any;
            try {
                result = await serverFetch(resolvedUrl);
            } catch (fetchErr: any) {
                if (resolvedUrl.includes('600x600bb')) {
                    const fallbackUrl = resolvedUrl.replace('600x600bb', '100x100bb');
                    server.log.warn(`[ProxyImage] 600x600bb fetch failed (${fetchErr.message}), falling back to 100x100bb: ${fallbackUrl}`);
                    try {
                        result = await serverFetch(fallbackUrl);
                    } catch (fbErr: any) {
                        return reply.redirect('/logo.png');
                    }
                } else {
                    return reply.redirect('/logo.png');
                }
            }

            // Step 3: if it came back as HTML, extract the best image URL from the page
            let imageUrl = resolvedUrl;
            if (result.contentType.includes('text/html')) {
                const html = result.body.toString('utf-8');
                const extracted = extractImageFromHtml(html, resolvedUrl);
                if (!extracted) {
                    return reply.redirect('/logo.png');
                }
                imageUrl = extracted;

                // Fetch the actual image now
                try {
                    const imgResult = await serverFetch(imageUrl);
                    if (!imgResult.contentType.startsWith('image/')) {
                        return reply.redirect('/logo.png');
                    }

                    reply.raw.writeHead(200, {
                        'Content-Type': imgResult.contentType,
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'public, max-age=31536000, immutable',
                        'Content-Length': String(imgResult.body.length),
                    });
                    reply.raw.end(imgResult.body);
                    return;
                } catch {
                    return reply.redirect('/logo.png');
                }
            }

            // Step 4: direct image — check content type
            let isImage = result.contentType.startsWith('image/') || result.contentType.includes('octet-stream');
            
            // Fallback: check URL extension or common image domains if content-type is weird
            if (!isImage) {
                const lowerUrl = resolvedUrl.toLowerCase();
                if (lowerUrl.match(/\.(jpg|jpeg|png|webp|gif|avif)(\?.*)?$/) || lowerUrl.includes('ytimg.com')) {
                    isImage = true;
                    // Force a valid content type
                    result.contentType = lowerUrl.includes('.webp') ? 'image/webp' : 'image/jpeg';
                }
            }

            if (!isImage) {
                return reply.redirect('/logo.png');
            }

            reply.raw.writeHead(200, {
                'Content-Type': result.contentType.includes('octet-stream') ? 'image/jpeg' : result.contentType,
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=31536000, immutable',
                'Content-Length': String(result.body.length),
            });
            reply.raw.end(result.body);

        } catch (err: any) {
            server.log.warn(`Image proxy error for ${queryUrl}: ${err?.message}. Falling back to /logo.png`);
            return reply.redirect('/logo.png');
        }
    });

    /**
     * Shared helper to proxy direct HTTPS audio stream URLs with Range request and 206 Partial Content support
     */
    function streamProxyUrl(rawUrl: string, request: any, reply: any, depth = 0): Promise<void> {
        return new Promise((resolve, reject) => {
            if (depth > 5) return reject(new Error('Too many redirects'));
            if (!isSafePublicUrl(rawUrl)) return reject(new Error('Access to private or local network addresses is prohibited'));

            let u: URL;
            try { u = new URL(rawUrl); } catch { return reject(new Error('Invalid redirect URL')); }

            const rangeHeader = (request.headers as any)['range'] as string | undefined;
            const client = u.protocol === 'https:' ? https : http;
            const isYtCdn = u.hostname.includes('googlevideo.com') || u.hostname.includes('youtube.com');
            const options = {
                hostname: u.hostname,
                port: u.port || (u.protocol === 'https:' ? 443 : 80),
                path: u.pathname + u.search,
                method: 'GET',
                family: 4,
                agent: u.protocol === 'https:' ? httpsStreamingAgent : httpStreamingAgent,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept': 'audio/*,*/*;q=0.8',
                    'Accept-Encoding': 'identity',
                    ...(isYtCdn ? {
                        'Referer': 'https://www.youtube.com/',
                        'Origin': 'https://www.youtube.com/',
                    } : {}),
                    ...(rangeHeader ? { 'Range': rangeHeader } : {}),
                },
                timeout: 30000,
            };

            const req = client.request(options, (res) => {
                if ([301, 302, 307, 308].includes(res.statusCode!) && res.headers.location) {
                    const loc = res.headers.location;
                    const nextUrl = loc.startsWith('http') ? loc : u.origin + loc;
                    if (!isSafePublicUrl(nextUrl)) {
                        res.resume();
                        return reject(new Error('Redirected to prohibited private network address'));
                    }
                    res.resume();
                    streamProxyUrl(nextUrl, request, reply, depth + 1).then(resolve).catch(reject);
                    return;
                }

                let statusCode = res.statusCode === 206 ? 206 : 200;
                if (res.statusCode && res.statusCode >= 400) {
                    if (res.statusCode === 403 || res.statusCode === 401) {
                        res.resume(); // consume response data to free up memory
                        return reject(new Error(`Upstream returned ${res.statusCode}`));
                    }
                    statusCode = res.statusCode;
                }
                const responseHeaders: Record<string, string> = {
                    'Content-Type': res.headers['content-type'] || 'audio/mp4',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, max-age=31536000, immutable',
                    'Accept-Ranges': 'bytes',
                };
                if (res.headers['content-length']) responseHeaders['Content-Length'] = res.headers['content-length'];
                if (res.headers['content-range']) responseHeaders['Content-Range'] = res.headers['content-range'] as string;

                reply.raw.writeHead(statusCode, responseHeaders);
                res.pipe(reply.raw);
                res.on('end', resolve);
                res.on('error', reject);
            });

            // If the client aborts or skips the track, kill upstream request immediately to free sockets
            request.raw.on('close', () => {
                req.destroy();
            });

            req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
            req.on('error', reject);
            req.end();
        });
    }

    /**
     * GET /api/utils/proxy-audio?url=<encoded-url>
     *
     * Proxy audio streams from external CDNs (like YouTube googlevideo, saavn, etc.)
     * to avoid CORS blockages when downloading/trimming audio in the browser.
     * Supports Range requests for browser seeking and streams to avoid buffering large files.
     */
    server.get('/proxy-audio', async (request, reply) => {
        const { url } = request.query as { url?: string };
        if (!url) return reply.status(400).send({ error: 'Missing url parameter' });
        if (!isSafePublicUrl(url)) return reply.status(400).send({ error: 'Invalid or restricted URL' });

        let targetUrl: URL;
        try { targetUrl = new URL(url); } catch {
            return reply.status(400).send({ error: 'Invalid URL' });
        }

        const rangeHeader = (request.headers as any)['range'] as string | undefined;

        const makeRequest = (rawUrl: string, depth = 0): Promise<void> => new Promise((resolve, reject) => {
            if (depth > 5) return reject(new Error('Too many redirects'));
            if (!isSafePublicUrl(rawUrl)) return reject(new Error('Access to private or local network addresses is prohibited'));

            let u: URL;
            try { u = new URL(rawUrl); } catch { return reject(new Error('Invalid redirect URL')); }

            const client = u.protocol === 'https:' ? https : http;
            const options = {
                hostname: u.hostname,
                port: u.port || (u.protocol === 'https:' ? 443 : 80),
                path: u.pathname + u.search,
                method: 'GET',
                family: 4,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'audio/*,*/*;q=0.8',
                    'Accept-Encoding': 'identity',
                    ...(rangeHeader ? { 'Range': rangeHeader } : {}),
                },
                timeout: 30000,
            };

            const req = client.request(options, (res) => {
                // Follow redirects
                if ([301, 302, 307, 308].includes(res.statusCode!) && res.headers.location) {
                    const loc = res.headers.location;
                    const nextUrl = loc.startsWith('http') ? loc : u.origin + loc;
                    res.resume();
                    makeRequest(nextUrl, depth + 1).then(resolve).catch(reject);
                    return;
                }

                let statusCode = res.statusCode === 206 ? 206 : 200;
                if (res.statusCode && res.statusCode >= 400) statusCode = res.statusCode;
                
                let contentType = res.headers['content-type'] || 'audio/mpeg';
                if (contentType === 'audio/x-m4p' || contentType === 'audio/m4p') {
                    contentType = 'audio/mp4'; // Rewrite Apple's fake DRM type to standard MP4 container
                }

                const responseHeaders: Record<string, string> = {
                    'Content-Type': contentType,
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, max-age=31536000, immutable',
                    'Accept-Ranges': 'bytes',
                };
                if (res.headers['content-length']) responseHeaders['Content-Length'] = res.headers['content-length'];
                if (res.headers['content-range']) responseHeaders['Content-Range'] = res.headers['content-range'] as string;

                reply.raw.writeHead(statusCode, responseHeaders);
                res.pipe(reply.raw);
                res.on('end', resolve);
                res.on('error', reject);
            });

            // Immediately destroy upstream connection if client disconnects
            const onClientAbort = () => {
                req.destroy();
                reject(new Error('Client aborted'));
            };
            request.raw.on('close', onClientAbort);
            req.on('close', () => {
                request.raw.off('close', onClientAbort);
            });

            req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
            req.on('error', reject);
            req.end();
        });

        try {
            await makeRequest(url);
        } catch (err: any) {
            console.error('[proxy-audio] EXCEPTION DETECTED:', err);
            server.log.error({ err }, 'Audio proxy error');
            if (!reply.raw.headersSent) {
                return reply.status(502).send({ error: 'Could not reach audio source' });
            }
        }
    });

    server.get('/stream-youtube', async (request, reply) => {
        let { url, title, artist, album, trackId, preview, mode, language, previewUrl } = request.query as {
            url?: string;
            title?: string;
            artist?: string;
            album?: string;
            trackId?: string;
            preview?: string;
            mode?: string;
            language?: string;
            previewUrl?: string;
        };
        const isPreviewRequested = preview === 'true' || mode === 'preview';

        if (!url && !trackId && !title) {
            return reply.status(400).send({ error: 'URL or search query is required' });
        }

        if (url && (url.startsWith('http://') || url.startsWith('https://')) && !isSafePublicUrl(url)) {
            return reply.status(400).send({ error: 'Invalid or restricted URL' });
        }

        if (!url && title) {
            url = artist ? `${artist} - ${title}` : title;
        }

        const { ExternalMetadataService } = await import('../services/external-metadata.service.js');
        const { prisma } = await import('../utils/prisma.js');
        let targetUrl = (url || '').trim();

        // ── IMMEDIATE STREAM CACHE PRE-CHECK (<0.1ms) ──────────
        const initialKeys = [
            trackId ? `track:${trackId}` : null,
            targetUrl || null
        ].filter(Boolean) as string[];

        for (const k of initialKeys) {
            const memCached = youtubeStreamCache.get(k);
            if (memCached && memCached.expiresAt > Date.now()) {
                const isCachedPreview = memCached.directUrl.includes('audio-ssl') || memCached.directUrl.includes('mzstatic') || memCached.directUrl.includes('itunes.apple.com');
                if (!isPreviewRequested && isCachedPreview) {
                    youtubeStreamCache.delete(k);
                    continue;
                }
                server.log.info(`[stream-youtube] Ultra-fast immediate stream cache hit for key "${k}"`);
                try {
                    return await streamProxyUrl(memCached.directUrl, request, reply);
                } catch (proxyErr) {
                    youtubeStreamCache.delete(k);
                }
            }
        }

        // Parse title/artist candidates and videoId for ultra-fast local DB check
        let candId = trackId ? trackId.replace(/^(itunes-)+/, 'itunes-') : trackId;
        let candTitle = (title || '').trim();
        let candArtist = (artist || '').trim();
        let candAlbum = (album || '').trim();

        const videoIdMatch = targetUrl.match(/(?:v=|youtu\.be\/|embed\/|\/v\/)([a-zA-Z0-9_-]{11})/);
        const currentVideoId = videoIdMatch ? videoIdMatch[1] : null;

        if (!candId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUrl)) {
            candId = targetUrl;
        }

        if (!candTitle && !targetUrl.startsWith('http://') && !targetUrl.startsWith('https://') && !targetUrl.startsWith('itunes:') && !targetUrl.startsWith('spotify:')) {
            if (targetUrl.includes(' - ')) {
                const parts = targetUrl.split(' - ');
                candArtist = parts[0].trim();
                candTitle = parts.slice(1).join(' - ').trim();
            } else {
                candTitle = targetUrl;
            }
        }

        let cleanCandTitle = candTitle ? candTitle.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').split('|')[0].trim() : '';
        let cleanCandArtist = candArtist ? candArtist.replace(/\(.*?\)/g, '').split(/[,&/|]/)[0].trim() : '';

        // ── 0. ULTRA-FAST LOCAL DB PRE-LOOKUP (<5-10ms) ──────────
        // If the track is already in the database (by id, by youtubeId, or by title/artist), use it directly!
        let localTrack: any = null;
        try {
            const startDb = Date.now();
            if (candId || cleanCandTitle || currentVideoId) {
                localTrack = await prisma.track.findFirst({
                    where: {
                        deletedAt: null,
                        ...(candId ? { id: candId } : {}),
                        ...(currentVideoId && !candId ? {
                            OR: [
                                { youtubeId: currentVideoId },
                                { audioUrl: { contains: currentVideoId } }
                            ]
                        } : {}),
                        ...(cleanCandTitle && !candId && !currentVideoId ? {
                            title: { equals: cleanCandTitle, mode: 'insensitive' },
                            ...(cleanCandArtist ? {
                                OR: [
                                    { artist: { name: { contains: cleanCandArtist, mode: 'insensitive' } } },
                                    { featuredArtists: { contains: cleanCandArtist, mode: 'insensitive' } }
                                ]
                            } : {})
                        } : {}),
                        audioUrl: { not: '' }
                    },
                    select: { id: true, title: true, audioUrl: true, youtubeId: true, audioResolutionScore: true, duration: true, language: true, artist: { select: { name: true } } }
                });

                if (localTrack) {
                    server.log.info(`[stream-youtube] Ultra-fast Local DB match in ${Date.now() - startDb}ms: "${localTrack.title}" (${localTrack.id})`);

                    if (!candTitle) candTitle = localTrack.title;
                    if (!candArtist && localTrack.artist?.name) candArtist = localTrack.artist.name;
                    if (!candId) candId = localTrack.id;
                    cleanCandTitle = candTitle ? candTitle.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').split('|')[0].trim() : '';
                    cleanCandArtist = candArtist ? candArtist.replace(/\(.*?\)/g, '').split(/[,&/|]/)[0].trim() : '';

                    // Asynchronously dispatch to Elastic Lyric Worker with 3s grace period so stream starts instantly
                    setTimeout(() => {
                        import('../queues/lyric-enrichment.worker.js').then(({ ElasticLyricWorker }) => {
                            ElasticLyricWorker.enqueue(localTrack.id, { priority: 100, userInitiated: true }).catch(() => {});
                        }).catch(() => {});
                    }, 3000);

                    // Check track cache by DB id
                    const trackCached = youtubeStreamCache.get(`track:${localTrack.id}`);
                    if (trackCached && trackCached.expiresAt > Date.now()) {
                        const isCachedPreview = trackCached.directUrl.includes('audio-ssl') || trackCached.directUrl.includes('mzstatic') || trackCached.directUrl.includes('itunes.apple.com');
                        if (!isPreviewRequested && isCachedPreview) {
                            youtubeStreamCache.delete(`track:${localTrack.id}`);
                        } else {
                            server.log.info(`[stream-youtube] Stream cache hit for DB track:${localTrack.id}`);
                            try {
                                return await streamProxyUrl(trackCached.directUrl, request, reply);
                            } catch {
                                youtubeStreamCache.delete(`track:${localTrack.id}`);
                            }
                        }
                    }

                    // 1. Local uploaded file (e.g. /uploads/...)
                    if (localTrack.audioUrl && (localTrack.audioUrl.startsWith('/uploads/') || localTrack.audioUrl.startsWith('uploads/'))) {
                        const localFilePath = localTrack.audioUrl.startsWith('/') ? localTrack.audioUrl : `/${localTrack.audioUrl}`;
                        return reply.redirect(localFilePath);
                    }

                    // 2. Direct remote URL (Cloudinary, S3, custom CDN MP3/AAC - NOT preview, NOT unverified R2, and NOT youtube)
                    const dbAudio = (localTrack.audioUrl || '').trim();
                    const is30sPreview = dbAudio.includes('audio-ssl') || dbAudio.includes('mzstatic') || dbAudio.includes('itunes.apple.com') || dbAudio.includes('apple.com');
                    const isUnverifiedR2 = dbAudio.includes('r2.dev') && (!localTrack.audioResolutionScore || localTrack.audioResolutionScore < 50);
                    if (!is30sPreview && !isUnverifiedR2 && dbAudio.length > 5 && (dbAudio.startsWith('http://') || dbAudio.startsWith('https://')) && !dbAudio.includes('youtube.com') && !dbAudio.includes('youtu.be')) {
                        return await streamProxyUrl(dbAudio, request, reply);
                    }

                    // 3. YouTube canonical stream watch URL or known youtubeId (NEVER blocked by 30s preview!)
                    if (localTrack.youtubeId && /^[a-zA-Z0-9_-]{11}$/.test(localTrack.youtubeId)) {
                        targetUrl = `https://www.youtube.com/watch?v=${localTrack.youtubeId}`;
                        server.log.info(`[stream-youtube] Using known youtubeId: ${localTrack.youtubeId} for "${localTrack.title}"`);
                    } else if (dbAudio.includes('youtube.com') || dbAudio.includes('youtu.be')) {
                        targetUrl = dbAudio;
                    }
                }
            }
        } catch (dbErr: any) {
            server.log.warn(`[stream-youtube] Local DB check error: ${dbErr.message}`);
        }

        // If metadata is still missing and we have a videoId, fast-resolve via oEmbed (<300ms)
        if (!cleanCandTitle && currentVideoId) {
            try {
                const oembedRes = await axios.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${currentVideoId}&format=json`, { timeout: 2500 }).catch(() => null);
                if (oembedRes?.data?.title) {
                    const rawTitle = oembedRes.data.title;
                    const uploader = oembedRes.data.author_name || '';
                    if (rawTitle.includes(' - ')) {
                        const parts = rawTitle.split(' - ');
                        candArtist = parts[0].trim();
                        candTitle = parts.slice(1).join(' - ').trim();
                    } else if (rawTitle.includes('|')) {
                        const parts = rawTitle.split('|');
                        candTitle = parts[0].trim();
                        if (parts[1]) candArtist = parts[1].trim();
                    } else {
                        candTitle = rawTitle;
                        if (uploader) candArtist = uploader;
                    }
                    cleanCandTitle = candTitle.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').split('|')[0].trim();
                    cleanCandArtist = candArtist ? candArtist.replace(/\(.*?\)/g, '').split(/[,&/|]/)[0].trim() : '';
                    server.log.info(`[stream-youtube] Resolved canonical metadata via YouTube oEmbed: "${cleanCandArtist} - ${cleanCandTitle}"`);
                }
            } catch {}
        }

        // Convert spotify:track:xxxx to open.spotify.com/track/xxxx
        if (targetUrl.startsWith('spotify:track:')) {
            const id = targetUrl.split(':')[2];
            targetUrl = `https://open.spotify.com/track/${id}`;
        }

        // Direct support for itunes:trackId fallback - ALWAYS resolve to full artist - title song query for YouTube
        if (targetUrl.startsWith('itunes:') || targetUrl.startsWith('itunes-')) {
            const cleanId = targetUrl.replace(/^itunes:|^itunes-+/g, '').replace(/^(itunes-)+/, '').trim();
            const numericId = cleanId.replace(/[^0-9]/g, '');
            if (numericId) {
                try {
                    let itunesRes = await axios.get(`https://itunes.apple.com/lookup?id=${numericId}&entity=song&country=IN`, { timeout: 3500 }).catch(() => null);
                    if (!itunesRes?.data?.results?.length) {
                        itunesRes = await axios.get(`https://itunes.apple.com/lookup?id=${numericId}&entity=song&country=US`, { timeout: 3500 }).catch(() => null);
                    }
                    const item = itunesRes?.data?.results?.[0];
                    if (item) {
                        targetUrl = `${item.artistName || ''} - ${item.trackName || ''}`.trim();
                        server.log.info(`[stream-youtube] Resolved itunes:${numericId} to full search query: "${targetUrl}"`);
                    }
                } catch (err: any) {
                    server.log.warn(`[stream-youtube] Failed to lookup itunes:${numericId}: ${err.message}`);
                }
            }
        }

        // Direct support for audio-ssl and iTunes CDN streams - strictly upgrade to full song stream!
        if (targetUrl.includes('audio-ssl') || targetUrl.includes('mzstatic') || targetUrl.includes('itunes.apple.com') || targetUrl.includes('apple.com')) {
            if (cleanCandTitle) {
                targetUrl = cleanCandArtist ? `${cleanCandArtist} - ${cleanCandTitle}` : cleanCandTitle;
                server.log.info(`[stream-youtube] Upgrading 30s preview URL to full stream query: "${targetUrl}"`);
            } else if (targetUrl.includes(' - ')) {
                // Keep targetUrl as query
            }
        }

        // ── Language Auto-Detection (Heuristics + Low-cost Vercel Gateway LLM) ──
        let resolvedSongLang = language || (localTrack as any)?.language;
        if (!resolvedSongLang || resolvedSongLang === 'english') {
            try {
                const { AILyricsService } = await import('../services/ai-lyrics.service.js');
                const langRes = await AILyricsService.detectSongLanguageDetails({
                    title: cleanCandTitle || candTitle || targetUrl,
                    artist: cleanCandArtist || candArtist || '',
                    album: candAlbum || localTrack?.album?.title,
                    skipLLM: true
                });
                if (langRes && langRes.language && !langRes.isEnglish) {
                    resolvedSongLang = langRes.language.toLowerCase();
                    server.log.info(`[stream-youtube] Auto-detected song original release language: ${resolvedSongLang}`);
                }
            } catch {}
        }

        // ── 0.5. ULTRA-FAST CLEAN 320KBPS CDN RESOLVER (Protocol-Verified) ──
        if (cleanCandTitle && cleanCandArtist) {
            try {
                const { CleanCdnAudioService } = await import('../services/clean-cdn-audio.service.js');
                const cdnResult = await CleanCdnAudioService.resolveAudio({
                    title: candTitle || cleanCandTitle,
                    primaryArtist: cleanCandArtist || candArtist,
                    album: candAlbum,
                    duration: localTrack?.duration,
                    language: resolvedSongLang
                });
                if (cdnResult?.url) {
                    server.log.info(`[stream-youtube] Protocol-Verified Clean CDN match (320kbps): "${cdnResult.title}" by "${cdnResult.artist}"`);

                    const cachePayload = { directUrl: cdnResult.url, expiresAt: Date.now() + 4 * 60 * 60 * 1000 };
                    youtubeStreamCache.set(url, cachePayload);
                    if (targetUrl) youtubeStreamCache.set(targetUrl, cachePayload);

                    const effectiveTrackId = candId || localTrack?.id;
                    if (effectiveTrackId) {
                        youtubeStreamCache.set(`track:${effectiveTrackId}`, cachePayload);
                    }

                    return await streamProxyUrl(cdnResult.url, request, reply);
                }
            } catch (cdnErr: any) {
                server.log.warn(`[stream-youtube] Clean CDN resolution skipped: ${cdnErr.message}`);
            }
        }

        if (!targetUrl.includes('youtube.com') && !targetUrl.includes('youtu.be')) {
            try {
                if (targetUrl.includes('spotify.com')) {
                    const meta = await ExternalMetadataService.fetchFromUrl(targetUrl);
                    if (meta && meta.title) {
                        candArtist = meta.artist || candArtist;
                        candTitle = meta.title;
                    }
                }

                server.log.info(`[stream-youtube] Resolving clean official audio via AudioResolverService: "${candTitle || targetUrl}" - "${candArtist}"`);
                const { AudioResolverService } = await import('../services/audio-resolver.service.js');
                const resolverPromise = AudioResolverService.resolveBestAudioSource({
                    id: candId || localTrack?.id,
                    title: candTitle || cleanCandTitle || targetUrl,
                    primaryArtist: candArtist || cleanCandArtist || (localTrack?.artist?.name || ''),
                    album: candAlbum || localTrack?.album?.title,
                    duration: localTrack?.duration,
                    language: resolvedSongLang
                });
                const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 9000));
                const resolution: any = await Promise.race([resolverPromise, timeoutPromise]);

                if (resolution && resolution.watchUrl) {
                    targetUrl = resolution.watchUrl;
                    server.log.info(`[stream-youtube] Resolved audio [Score: ${resolution.score}, Verified: ${resolution.verified}]: ${targetUrl}`);
                } else {
                    server.log.warn(`[stream-youtube] AudioResolver found no verified watchUrl for: "${targetUrl}". Falling back to resilient direct search.`);
                    const searchArtist = candArtist || cleanCandArtist || (localTrack?.artist?.name || '');
                    const searchTitle = candTitle || cleanCandTitle || targetUrl;
                    const searchAlbum = candAlbum || localTrack?.album?.title;
                    let combinedQuery = searchArtist ? `${searchArtist} - ${searchTitle}` : searchTitle;
                    if (searchAlbum && !searchTitle.toLowerCase().includes(searchAlbum.toLowerCase())) {
                        combinedQuery += ` ${searchAlbum}`;
                    }
                    if (!targetUrl.startsWith('http') && !targetUrl.startsWith('ytsearch')) {
                        targetUrl = `ytsearch1:${combinedQuery}`;
                    }
                }
            } catch (err: any) {
                server.log.warn(`[stream-youtube] AudioResolver lookup error for "${targetUrl}": ${err.message}. Falling back to direct query search.`);
                const searchArtist = candArtist || cleanCandArtist || (localTrack?.artist?.name || '');
                const searchTitle = candTitle || cleanCandTitle || targetUrl;
                const searchAlbum = candAlbum || localTrack?.album?.title;
                let combinedQuery = searchArtist ? `${searchArtist} - ${searchTitle}` : searchTitle;
                if (searchAlbum && !searchTitle.toLowerCase().includes(searchAlbum.toLowerCase())) {
                    combinedQuery += ` ${searchAlbum}`;
                }
                if (!targetUrl.startsWith('http') && !targetUrl.startsWith('ytsearch')) {
                    targetUrl = `ytsearch1:${combinedQuery}`;
                }
            }
        }

        url = targetUrl;

        // 1. Check in-memory stream cache
        const memCached = youtubeStreamCache.get(url);
        if (memCached && memCached.expiresAt > Date.now()) {
            const isCachedPreview = memCached.directUrl.includes('audio-ssl') || memCached.directUrl.includes('mzstatic') || memCached.directUrl.includes('itunes.apple.com');
            if (!isPreviewRequested && isCachedPreview) {
                youtubeStreamCache.delete(url);
            } else {
                server.log.info(`[stream-youtube] Serving in-memory cached direct URL for: ${url}`);
                try {
                    return await streamProxyUrl(memCached.directUrl, request, reply);
                } catch (proxyErr) {
                    server.log.warn(`[stream-youtube] In-memory cached URL failed, clearing: ${proxyErr}`);
                    youtubeStreamCache.delete(url);
                    await invalidateCache(`stream:${url}`).catch(() => {});
                }
            }
        }

        // 2. Check Redis stream cache
        const redisCachedUrl = await getCacheVal(`stream:${url}`).catch(() => null);
        if (redisCachedUrl && typeof redisCachedUrl === 'string') {
            const isCachedPreview = redisCachedUrl.includes('audio-ssl') || redisCachedUrl.includes('mzstatic') || redisCachedUrl.includes('itunes.apple.com');
            if (!isPreviewRequested && isCachedPreview) {
                await invalidateCache(`stream:${url}`).catch(() => {});
            } else {
                server.log.info(`[stream-youtube] Serving Redis cached direct URL for: ${url}`);
                youtubeStreamCache.set(url, { directUrl: redisCachedUrl, expiresAt: Date.now() + 4 * 60 * 60 * 1000 });
                try {
                    return await streamProxyUrl(redisCachedUrl, request, reply);
                } catch (proxyErr) {
                    server.log.warn(`[stream-youtube] Redis cached URL failed, clearing: ${proxyErr}`);
                    youtubeStreamCache.delete(url);
                    await invalidateCache(`stream:${url}`).catch(() => {});
                }
            }
        }

        // 3. In-flight single-flight resolution with concurrency semaphore
        let directMediaUrl: string | null = null;
        let resolutionPromise = inFlightStreamResolutions.get(url);
        if (!resolutionPromise) {
            resolutionPromise = (async () => {
                const release = await ytdlpSemaphore.acquire();
                try {
                    const queryHint = cleanCandTitle ? `${cleanCandArtist ? cleanCandArtist + ' - ' : ''}${cleanCandTitle}` : (candTitle || undefined);
                    return await resolveDirectStreamUrl(url, server, queryHint);
                } finally {
                    release();
                }
            })();
            inFlightStreamResolutions.set(url, resolutionPromise);
        } else {
            server.log.info(`[stream-youtube] Awaiting in-flight resolution for: ${url}`);
        }

        try {
            directMediaUrl = await resolutionPromise;
        } finally {
            inFlightStreamResolutions.delete(url);
        }

        // 4. If directMediaUrl was resolved (via yt-dlp -g or Infinity Gates), stream via HTTP 206 Partial Content
        if (directMediaUrl) {
            const cachePayload = {
                directUrl: directMediaUrl,
                expiresAt: Date.now() + 4 * 60 * 60 * 1000
            };
            youtubeStreamCache.set(url, cachePayload);
            if (targetUrl) youtubeStreamCache.set(targetUrl, cachePayload);
            
            const effectiveTrackId = candId || localTrack?.id;
            if (effectiveTrackId) {
                youtubeStreamCache.set(`track:${effectiveTrackId}`, cachePayload);
                // Persist youtubeId if available
                if (url.includes('v=')) {
                    try {
                        const parsedVideoId = new URL(url).searchParams.get('v');
                        if (parsedVideoId && /^[a-zA-Z0-9_-]{11}$/.test(parsedVideoId)) {
                            prisma.track.update({
                                where: { id: effectiveTrackId },
                                data: { youtubeId: parsedVideoId }
                            }).catch(() => {});
                        }
                    } catch {}
                }
            }
            const isResolvedPreview = directMediaUrl.includes('audio-ssl') || directMediaUrl.includes('mzstatic') || directMediaUrl.includes('itunes.apple.com');
            if (!isResolvedPreview) {
                await setCacheVal(`stream:${url}`, directMediaUrl, 14400).catch(() => {});
            }

            try {
                return await streamProxyUrl(directMediaUrl, request, reply);
            } catch (pipeErr: any) {
                server.log.warn(`[stream-youtube] Direct proxy of resolved URL failed: ${pipeErr.message}`);
                youtubeStreamCache.delete(url);
                await invalidateCache(`stream:${url}`).catch(() => {});
            }
        }

        // 5. Fallback: Live spawn piping with Rule 3 Container Header Integrity
        if (Date.now() < localYtBlockCooldownUntil) {
            server.log.warn(`[stream-youtube] Local IP in active circuit breaker cooldown. Skipping yt-dlp spawn.`);
            return reply.status(503).send({ error: 'Audio stream temporarily unavailable.' });
        }

        try {
            const { spawn } = await import('child_process');
            const ytBin = getYtBin();
            const cookiesArgs = getCookieArgs();

            server.log.info(`[stream-youtube] Direct extraction failed. Falling back to live spawn pipe for: ${url}`);

            const clientStrategies = [
                ['--force-ipv4', '--extractor-args', 'youtube:player_client=android_music'],
                ['--force-ipv4', '--extractor-args', 'youtube:player_client=tv_embedded'],
            ];

            let spawned = false;
            const errors: string[] = [];

            for (const clientArgs of clientStrategies) {
                const args = [
                    '--js-runtimes', 'node',
                    ...cookiesArgs,
                    ...clientArgs,
                    '--socket-timeout', '6',
                    '--extractor-retries', '1',
                    '--no-check-certificates',
                    '--no-warnings',
                    '--no-playlist',
                    '-f', 'ba/18/b/best',
                    '-o', '-',
                    url,
                ];

                const strategyName = clientArgs.join(' ') || 'default';
                server.log.info(`[stream-youtube] Trying spawn: ${ytBin} ${strategyName}`);

                const [binExecutable, ...binPrefix] = ytBin.split(' ');
                const proc = spawn(binExecutable, [...binPrefix, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
                
                const killProcSafely = () => {
                    if (!proc || proc.killed) return;
                    try {
                        if (process.platform === 'win32' && proc.pid) {
                            import('child_process').then(({ exec }) => {
                                exec(`taskkill /pid ${proc.pid} /T /F`, { windowsHide: true }, () => {});
                            }).catch(() => {
                                try { proc.kill('SIGKILL'); } catch {}
                            });
                        } else {
                            try { proc.kill('SIGKILL'); } catch {}
                        }
                    } catch {
                        try { proc.kill('SIGKILL'); } catch {}
                    }
                };

                let strategyStderr = '';
                proc.stderr.on('data', (data: Buffer) => {
                    strategyStderr += data.toString();
                });

                let firstChunk: Buffer | null = null;

                const startOk = await new Promise<boolean>((resolve) => {
                    const timeout = setTimeout(() => {
                        if (!firstChunk) { killProcSafely(); resolve(false); }
                    }, 8000);

                    proc.stdout.once('data', (chunk: Buffer) => {
                        firstChunk = chunk;
                        clearTimeout(timeout);
                        resolve(true);
                    });

                    proc.once('error', () => { clearTimeout(timeout); resolve(false); });
                    proc.once('close', () => {
                        clearTimeout(timeout);
                        if (!firstChunk) resolve(false);
                    });
                });

                if (startOk && firstChunk) {
                    spawned = true;
                    server.log.info(`[stream-youtube] Stream started successfully using strategy: ${strategyName}`);

                    const buf = firstChunk as Buffer;
                    const isWebm = buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
                    const contentType = isWebm ? 'audio/webm' : 'audio/mp4';

                    if (!reply.raw.headersSent) {
                        reply.raw.writeHead(200, {
                            'Content-Type': contentType,
                            'Access-Control-Allow-Origin': '*',
                            'Accept-Ranges': 'bytes',
                            'Cache-Control': 'no-cache',
                        });
                    }

                    reply.raw.write(firstChunk);
                    proc.stdout.pipe(reply.raw);

                    proc.stderr.on('data', (data: Buffer) => {
                        server.log.warn(`[stream-youtube] strategy [${strategyName}] stderr: ${data.toString().slice(0, 200)}`);
                    });

                    proc.on('close', (code: number) => {
                        server.log.info(`[stream-youtube] yt-dlp strategy [${strategyName}] done (code ${code})`);
                        if (!reply.raw.writableEnded) reply.raw.end();
                    });

                    proc.on('error', (err: Error) => {
                        server.log.error(`[stream-youtube] proc error: ${err.message}`);
                        if (!reply.raw.writableEnded) reply.raw.end();
                    });

                    request.raw.on('close', () => killProcSafely());
                    break;
                } else {
                    const cleanStderr = strategyStderr.trim().slice(0, 300);
                    errors.push(`${strategyName}: ${cleanStderr || 'No stderr output'}`);
                    killProcSafely();
                }
            }

            if (!spawned) {
                // 6. ULTIMATE RESILIENT FALLBACK: Apple / iTunes CDN Direct AAC Stream
                // If YouTube extraction is blocked or challenged on host, stream high-fidelity AAC directly from Apple CDN
                try {
                    let searchTitle = cleanCandTitle || candTitle || '';
                    let searchArtist = cleanCandArtist || candArtist || '';

                    if ((!searchTitle || searchTitle.startsWith('http')) && currentVideoId) {
                        try {
                            const oemb = await axios.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${currentVideoId}&format=json`, { timeout: 2000 }).catch(() => null);
                            if (oemb?.data?.title) {
                                searchTitle = oemb.data.title.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').split('|')[0].trim();
                                if (!searchArtist && oemb.data.author_name) searchArtist = oemb.data.author_name;
                            }
                        } catch {}
                    }

                    if (!searchTitle || searchTitle.startsWith('http')) {
                        const rawClean = url.replace(/^ytsearch[0-9]*:/, '').replace(/https?:\/\/[^\s]+/g, '').trim();
                        if (rawClean.includes(' - ')) {
                            searchArtist = searchArtist || rawClean.split(' - ')[0].trim();
                            searchTitle = rawClean.split(' - ').slice(1).join(' ').trim();
                        } else {
                            searchTitle = rawClean;
                        }
                    }

                    // 1. Clean CDN Full Song Fallback (320kbps JioSaavn pristine audio)
                    if (searchTitle || searchArtist) {
                        try {
                            const { CleanCdnAudioService } = await import('../services/clean-cdn-audio.service.js');
                            const queryToTry = searchArtist ? `${searchArtist} - ${searchTitle}` : searchTitle;
                            const cdnResult = await CleanCdnAudioService.resolveAudio(queryToTry);
                            if (cdnResult?.url) {
                                server.log.info(`[stream-youtube] Ultimate Fallback: Clean CDN 320k resolved for "${queryToTry}": ${cdnResult.url}`);
                                return await streamProxyUrl(cdnResult.url, request, reply);
                            }
                        } catch (cdnErr: any) {
                            server.log.warn(`[stream-youtube] Clean CDN fallback attempt: ${cdnErr.message}`);
                        }
                    }

                    // 2. Full Song Fallback: Attempt intake to R2 cloud storage for permanent, 100% full song streaming
                    if (searchTitle || searchArtist) {
                        try {
                            server.log.info(`[stream-youtube] Attempting full audio R2 resolution fallback for: "${searchArtist} - ${searchTitle}"`);
                            const fullTrack = await ExternalMetadataService.fetchAudio(searchTitle, searchArtist, undefined, undefined, { preview: false, bypassCache: true });
                            if (fullTrack?.url && !fullTrack.url.includes('/stream-youtube')) {
                                if (!fullTrack.url.includes('audio-ssl') && !fullTrack.url.includes('itunes') && !fullTrack.url.includes('mzstatic')) {
                                    server.log.info(`[stream-youtube] R2 full audio stream resolved: ${fullTrack.url}`);
                                    return await streamProxyUrl(fullTrack.url, request, reply);
                                }
                            }
                        } catch (r2Err: any) {
                            server.log.warn(`[stream-youtube] R2 fallback error: ${r2Err.message}`);
                        }
                    }

                    // 3. Clean CDN 320kbps Audio (JioSaavn) Full Song Fallback
                    try {
                        const { CleanCdnAudioService } = await import('../services/clean-cdn-audio.service.js');
                        const cdnRes = await CleanCdnAudioService.resolveAudio({
                            title: searchTitle || cleanCandTitle || candTitle,
                            primaryArtist: searchArtist || cleanCandArtist || candArtist,
                            duration: localTrack?.duration,
                            language: resolvedSongLang
                        });
                        if (cdnRes?.url && !cdnRes.url.includes('audio-ssl') && !cdnRes.url.includes('mzstatic') && !cdnRes.url.includes('itunes.apple.com')) {
                            server.log.info(`[stream-youtube] Clean CDN 320kbps full song fallback resolved: ${cdnRes.url}`);
                            return await streamProxyUrl(cdnRes.url, request, reply);
                        }
                    } catch (cdnErr: any) {
                        server.log.warn(`[stream-youtube] Clean CDN fallback error: ${cdnErr.message}`);
                    }

                    // 4. RapidAPI Spotify / Music Downloader Fallback (via RAPIDAPI_KEY)
                    try {
                        const rapidApiKey = process.env.RAPIDAPI_KEY || (process.env.RAPIDAPI_KEYS ? process.env.RAPIDAPI_KEYS.split(',')[0].trim() : null);
                        if (rapidApiKey) {
                            const queryForRapid = (searchArtist && searchTitle ? `${searchArtist} - ${searchTitle}` : null) || targetUrl || url;
                            server.log.info(`[stream-youtube] Attempting RapidAPI Spotify download fallback for: "${queryForRapid}"`);
                            const rapidRes = await axios.get('https://spotify81.p.rapidapi.com/download_track', {
                                params: { q: queryForRapid, onlyLinks: 'true' },
                                headers: {
                                    'x-rapidapi-key': rapidApiKey,
                                    'x-rapidapi-host': 'spotify81.p.rapidapi.com'
                                },
                                timeout: 12000
                            }).catch(() => null);
                            if (rapidRes?.data?.url && !rapidRes.data.url.includes('audio-ssl') && !rapidRes.data.url.includes('mzstatic') && !rapidRes.data.url.includes('itunes.apple.com')) {
                                server.log.info(`[stream-youtube] RapidAPI Spotify stream fallback resolved full audio: ${rapidRes.data.url}`);
                                return await streamProxyUrl(rapidRes.data.url, request, reply);
                            }
                        }
                    } catch (rapidErr: any) {
                        server.log.warn(`[stream-youtube] RapidAPI download fallback error: ${rapidErr.message}`);
                    }

                    // 5. Direct Apify Spotify Fallback: When local/datacenter YouTube extraction is blocked or exhausted
                    try {
                        const fallbackTarget = (searchArtist && searchTitle ? `${searchArtist} - ${searchTitle}` : null) || targetUrl || url;
                        server.log.info(`[stream-youtube] Attempting Apify Spotify stream fallback for: "${fallbackTarget}"`);
                        const apifyUrl = await ExternalMetadataService.fetchAudioViaApifySpotify(fallbackTarget);
                        if (apifyUrl && !apifyUrl.includes('audio-ssl') && !apifyUrl.includes('mzstatic') && !apifyUrl.includes('itunes.apple.com')) {
                            server.log.info(`[stream-youtube] Apify Spotify stream fallback resolved full audio: ${apifyUrl}`);
                            return await streamProxyUrl(apifyUrl, request, reply);
                        }
                    } catch (apifyErr: any) {
                        server.log.warn(`[stream-youtube] Apify stream fallback error: ${apifyErr.message}`);
                    }
                } catch (fallbackErr: any) {
                    server.log.warn(`[stream-youtube] Fallback error: ${fallbackErr.message}`);
                }

                server.log.error({ errors }, '[stream-youtube] All client strategies failed');
                if (!reply.raw.headersSent) {
                    return reply.status(502).send({ 
                        error: 'Could not stream audio — all YouTube extraction methods failed.', 
                        details: errors 
                    });
                }
            }

        } catch (err: any) {
            server.log.error(`stream-youtube error: ${err.message}`);
            if (!reply.raw.headersSent) {
                return reply.status(500).send({ error: err.message });
            }
        }
    });

    server.get('/search-youtube', async (request, reply) => {
        const { q } = request.query as { q?: string };
        if (!q) {
            return reply.status(400).send({ error: 'Query parameter "q" is required' });
        }
        try {
            const { ExternalMetadataService } = await import('../services/external-metadata.service.js');
            const results = await ExternalMetadataService.searchYoutubeMusic(q);
            const tracks = results.map((v: any) => ExternalMetadataService.parseYoutubeVideoToTrack(v));
            return reply.send(tracks);
        } catch (err: any) {
            server.log.error(`search-youtube error: ${err.message}`);
            return reply.status(500).send({ error: err.message });
        }
    });

    // ── UNIVERSAL GLOBAL CATALOG SEARCH ──
    // Powers GlobalSearchModal and search bar. Guarantees 0 missing songs by federating Local DB, JioSaavn 320k, iTunes multi-country, and YouTube Music.
    server.get('/search-spotify', async (request, reply) => {
        const { q, country, limit, language } = request.query as { q?: string; country?: string; limit?: string; language?: string };
        if (!q || !q.trim()) return reply.status(400).send({ error: 'Query parameter "q" is required' });
        try {
            const { UniversalSearchService } = await import('../services/universal-search.service.js');
            const items = await UniversalSearchService.searchTracks(q.trim(), {
                country: country || 'in',
                limit: limit ? parseInt(limit, 10) : 30,
                language: language || undefined
            });
            return reply.send(items);
        } catch (err: any) {
            server.log.error(`search-spotify / search-global error: ${err.message}`);
            return reply.status(500).send({ error: err.message });
        }
    });

    server.get('/search-global', async (request, reply) => {
        const { q, country, limit, language } = request.query as { q?: string; country?: string; limit?: string; language?: string };
        if (!q || !q.trim()) return reply.status(400).send({ error: 'Query parameter "q" is required' });
        try {
            const { UniversalSearchService } = await import('../services/universal-search.service.js');
            const items = await UniversalSearchService.searchTracks(q.trim(), {
                country: country || 'in',
                limit: limit ? parseInt(limit, 10) : 30,
                language: language || undefined
            });
            return reply.send(items);
        } catch (err: any) {
            server.log.error(`search-global error: ${err.message}`);
            return reply.status(500).send({ error: err.message });
        }
    });

    server.get('/download-spotify', async (request, reply) => {
        const { id } = request.query as { id?: string };
        if (!id) return reply.status(400).send({ error: 'Query parameter "id" is required' });
        
        try {
            const { default: axios } = await import('axios');
            
            // Strategy 1: spotify-downloader9 (Amazon S3 MP3)
            try {
                const res = await axios.get('https://spotify-downloader9.p.rapidapi.com/downloadSong', {
                    params: { songId: `https://open.spotify.com/track/${id}` },
                    headers: {
                        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                        'x-rapidapi-host': 'spotify-downloader9.p.rapidapi.com'
                    },
                    timeout: 20000
                });
                if (res.data?.success && res.data?.data?.downloadLink) {
                    server.log.info(`[Spotify API] Strategy 1 Success: ${id}`);
                    return reply.send({ downloadLink: res.data.data.downloadLink });
                }
            } catch (err: any) {
                server.log.warn(`[Spotify API] Strategy 1 Failed for ${id}: ${err.message}`);
            }

            // Strategy 2: spotify81 fallback (Checkleaked YouTube/SC bypass)
            try {
                const res2 = await axios.get('https://spotify81.p.rapidapi.com/download_track', {
                    params: { q: id, onlyLinks: 'true' },
                    headers: {
                        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                        'x-rapidapi-host': 'spotify81.p.rapidapi.com'
                    },
                    timeout: 20000
                });
                if (res2.data?.url) {
                    server.log.info(`[Spotify API] Strategy 2 Success: ${id}`);
                    return reply.send({ downloadLink: res2.data.url });
                }
            } catch (err: any) {
                server.log.warn(`[Spotify API] Strategy 2 Failed for ${id}: ${err.message}`);
            }

            return reply.status(404).send({ error: 'Download link not found from both Spotify APIs' });
        } catch (err: any) {
            server.log.error(`download-spotify fatal error: ${err.message}`);
            return reply.status(500).send({ error: err.message });
        }
    });

    // Flush all caches (Redis DB + in-memory cache) - Protected: Admin Only
    server.post('/flush-cache', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])],
    }, async (request, reply) => {
        try {
            const { flushAllCaches } = await import('../utils/cache.js');
            const result = await flushAllCaches();
            server.log.info('[Utils] All cache DBs flushed cleanly by admin.');
            return reply.send({ success: true, message: 'All cache DBs flushed cleanly.', result });
        } catch (err: any) {
            server.log.error(`flush-cache error: ${err.message}`);
            return reply.status(500).send({ error: 'Failed to flush caches securely.' });
        }
    });

    // Reset catalog data (Tracks, Albums, Artists, Lyrics, Caches) while strictly preserving Users
    server.post('/reset-catalog-data', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])],
    }, async (request, reply) => {
        try {
            const { prisma } = await import('../utils/prisma.js');
            const { flushAllCaches } = await import('../utils/cache.js');

            server.log.info('[Maintenance] Beginning catalog reset (preserving users)...');

            // 1. Delete dependent records
            await prisma.lyricEnrichmentJob.deleteMany({}).catch(() => {});
            await prisma.trackVibeProfile.deleteMany({}).catch(() => {});
            await prisma.trackAnalytics.deleteMany({}).catch(() => {});
            await prisma.playlistTrack.deleteMany({}).catch(() => {});
            await prisma.like.deleteMany({}).catch(() => {});
            await prisma.rating.deleteMany({}).catch(() => {});
            await prisma.userTrackStat.deleteMany({}).catch(() => {});
            await prisma.history.deleteMany({}).catch(() => {});
            await prisma.purchase.deleteMany({}).catch(() => {});
            await prisma.featuredContent.deleteMany({}).catch(() => {});

            // 2. Delete Tracks & Lyrics
            const deletedTracks = await prisma.track.deleteMany({});

            // 3. Delete Albums
            const deletedAlbums = await prisma.album.deleteMany({});

            // 4. Delete Artist Aliases & Artists
            await prisma.artistAlias.deleteMany({}).catch(() => {});
            const deletedArtists = await prisma.artist.deleteMany({});

            // 5. Flush All Caches
            await flushAllCaches();

            const usersCount = await prisma.user.count();
            const tracksCount = await prisma.track.count();
            const albumsCount = await prisma.album.count();
            const artistsCount = await prisma.artist.count();

            server.log.info(`[Maintenance] Catalog reset complete. Users preserved: ${usersCount}. Remaining tracks: ${tracksCount}.`);

            return reply.send({
                success: true,
                message: 'All track details, artists, albums, lyrics, and caches have been reset successfully while preserving all user accounts.',
                usersPreserved: usersCount,
                deleted: {
                    tracks: deletedTracks.count,
                    albums: deletedAlbums.count,
                    artists: deletedArtists.count
                },
                remaining: {
                    tracks: tracksCount,
                    albums: albumsCount,
                    artists: artistsCount
                }
            });
        } catch (err: any) {
            server.log.error(`reset-catalog-data error: ${err.message}`);
            return reply.status(500).send({ error: err.message });
        }
    });
}



