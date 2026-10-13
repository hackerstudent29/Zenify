import { FastifyInstance } from 'fastify';
import axios from 'axios';
import https from 'https';
import http from 'http';
import { config } from '../config/env';
import cloudinary from '../utils/cloudinary.js';

import { getCacheVal, setCacheVal, invalidateCache } from '../utils/cache.js';

// Module-level caches & concurrency management for YouTube streaming
let cachedYtBin: string | null = null;
const youtubeStreamCache = new Map<string, { directUrl: string; expiresAt: number }>();

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
async function resolveDirectStreamUrl(url: string, server: FastifyInstance): Promise<string | null> {
    const videoIdMatch = url.match(/(?:v=|youtu\.be\/|embed\/|\/v\/)([a-zA-Z0-9_-]{11})/);
    const videoId = videoIdMatch ? videoIdMatch[1] : null;

    const ytBin = getYtBin();
    const cookiesArgs = getCookieArgs();
    const proxyArgs = getProxyArgs();

    // 1. Direct extraction via yt-dlp -g (bypassed if local IP is under active 5-min circuit breaker cooldown)
    const isLocalBlocked = Date.now() < localYtBlockCooldownUntil;
    if (ytBin && !isLocalBlocked) {
        // Priority: null (default/VisionOS/Web works best with audio), then android_vr, mweb, web. Strictly avoid ios (causes requested format error).
        const gClients: (string | null)[] = [null, 'android_vr', 'mweb', 'web'];
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
                    '-f', 'bestaudio[ext=m4a]/bestaudio/best',
                    '--no-playlist',
                    '--socket-timeout', '12',
                    url
                ];
                const { stdout } = await safeExecFile(binExecutable, gArgs, { timeout: 12000 });
                const urls = stdout.split(/\r?\n/).map(l => l.trim()).filter(l => l.startsWith('http'));
                const directMediaUrl = urls.find(u => u.includes('mime=audio') || u.includes('audio')) || urls[0];
                if (directMediaUrl && directMediaUrl.startsWith('http')) {
                    server.log.info(`[stream-youtube] Direct media URL resolved via -g (${client || 'default-node'}): ${directMediaUrl.slice(0, 80)}...`);
                    return directMediaUrl;
                }
            } catch (gErr: any) {
                server.log.warn(`[stream-youtube] Direct URL lookup -g (${client || 'default-node'}) failed: ${gErr.message}`);
                if (gErr.message?.includes('429') || gErr.message?.includes('Sign in to confirm') || gErr.message?.includes('bot')) {
                    server.log.warn(`[stream-youtube] YouTube IP block/bot challenge detected on host. Engaging 5-minute circuit breaker to route directly to Infinity Gates.`);
                    localYtBlockCooldownUntil = Date.now() + 5 * 60 * 1000;
                    break;
                }
            }
        }
    } else if (isLocalBlocked) {
        server.log.info(`[stream-youtube] Host IP in active circuit breaker cooldown. Routing directly to Infinity Gates network.`);
    }

    // 2. Infinity Gates fallback: If local yt-dlp was blocked or 429'd
    server.log.warn('[stream-youtube] Engaging Infinity Gates distributed resolver pool (RapidAPI MP3, Piped, Invidious, Cobalt)...');

    // Gate 1: RapidAPI MP3 Gateway
    try {
        const { SystemSettingsService } = await import('../services/system-settings.service.js');
        const rapidApiKey = await SystemSettingsService.getRapidApiKey();
        if (rapidApiKey) {
            const mp3Res = await axios.get('https://yt-search-and-download-mp3.p.rapidapi.com/mp3', {
                params: { url },
                headers: { 'x-rapidapi-key': rapidApiKey, 'x-rapidapi-host': 'yt-search-and-download-mp3.p.rapidapi.com' },
                timeout: 6000
            }).catch(() => null);

            if (mp3Res?.data?.success && mp3Res?.data?.download) {
                server.log.info(`[stream-youtube] Infinity Gate 1 (RapidAPI MP3) successfully resolved full audio stream!`);
                return mp3Res.data.download;
            }
        }
    } catch (rapErr: any) {
        server.log.warn(`[stream-youtube] RapidAPI MP3 Gateway error: ${rapErr.message}`);
    }

    // Gate 2: Distributed Piped API instances in parallel race
    if (videoId) {
        const pipedEndpoints = [
            `https://pipedapi.kavin.rocks/streams/${videoId}`,
            `https://api.piped.privacydev.net/streams/${videoId}`,
            `https://pipedapi.tokhmi.xyz/streams/${videoId}`,
            `https://cf.pipedapi.kavin.rocks/streams/${videoId}`,
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
            `https://invidious.nerdvpn.de/api/v1/videos/${videoId}`,
            `https://invidious.drgns.space/api/v1/videos/${videoId}`,
            `https://inv.tux.pizza/api/v1/videos/${videoId}`,
            `https://yewtu.be/api/v1/videos/${videoId}`,
            `https://invidious.privacydev.net/api/v1/videos/${videoId}`
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
        let { url, title, artist, trackId, preview, mode, language } = request.query as {
            url?: string;
            title?: string;
            artist?: string;
            trackId?: string;
            preview?: string;
            mode?: string;
            language?: string;
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

        // Parse title/artist candidates for ultra-fast local DB check
        let candId = trackId;
        let candTitle = (title || '').trim();
        let candArtist = (artist || '').trim();

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

        const cleanCandTitle = candTitle ? candTitle.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').split('|')[0].trim() : '';
        const cleanCandArtist = candArtist ? candArtist.replace(/\(.*?\)/g, '').split(/[,&/|]/)[0].trim() : '';

        // ── 0. ULTRA-FAST LOCAL DB PRE-LOOKUP (<5-10ms) ──────────
        // If the track is already in the database (e.g. downloaded or imported from search), use it directly!
        let localTrack: any = null;
        try {
            const startDb = Date.now();
            if (candId || cleanCandTitle) {
                localTrack = await prisma.track.findFirst({
                    where: {
                        deletedAt: null,
                        ...(candId ? { id: candId } : {
                            title: { equals: cleanCandTitle, mode: 'insensitive' },
                            ...(cleanCandArtist ? {
                                OR: [
                                    { artist: { name: { contains: cleanCandArtist, mode: 'insensitive' } } },
                                    { featuredArtists: { contains: cleanCandArtist, mode: 'insensitive' } }
                                ]
                            } : {})
                        }),
                        audioUrl: { not: '' }
                    },
                    select: { id: true, title: true, audioUrl: true, youtubeId: true, audioResolutionScore: true, duration: true, language: true, artist: { select: { name: true } } }
                });

                if (localTrack && localTrack.audioUrl) {
                    const dbAudio = localTrack.audioUrl.trim();
                    const is30sPreview = dbAudio.includes('audio-ssl') || dbAudio.includes('mzstatic') || dbAudio.includes('itunes.apple.com');
                    
                    if (!is30sPreview && dbAudio.length > 5) {
                        server.log.info(`[stream-youtube] Ultra-fast Local DB match in ${Date.now() - startDb}ms: "${localTrack.title}" (${localTrack.id})`);

                        // 1. Local uploaded file (e.g. /uploads/...)
                        if (dbAudio.startsWith('/uploads/') || dbAudio.startsWith('uploads/')) {
                            const localFilePath = dbAudio.startsWith('/') ? dbAudio : `/${dbAudio}`;
                            return reply.redirect(localFilePath);
                        }

                        // 2. Direct remote URL (Cloudinary, S3, custom CDN MP3/AAC)
                        if ((dbAudio.startsWith('http://') || dbAudio.startsWith('https://')) && !dbAudio.includes('youtube.com') && !dbAudio.includes('youtu.be')) {
                            return await streamProxyUrl(dbAudio, request, reply);
                        }

                        // 3. YouTube canonical stream watch URL or youtubeId (verified score >= 50)
                        if (dbAudio.includes('youtube.com') || dbAudio.includes('youtu.be')) {
                            targetUrl = dbAudio;
                        } else if (localTrack.youtubeId && (localTrack.audioResolutionScore == null || localTrack.audioResolutionScore >= 50)) {
                            targetUrl = `https://www.youtube.com/watch?v=${localTrack.youtubeId}`;
                        }
                    }
                }
            }
        } catch (dbErr: any) {
            server.log.warn(`[stream-youtube] Local DB check error: ${dbErr.message}`);
        }

        // Convert spotify:track:xxxx to open.spotify.com/track/xxxx
        if (targetUrl.startsWith('spotify:track:')) {
            const id = targetUrl.split(':')[2];
            targetUrl = `https://open.spotify.com/track/${id}`;
        }

        // Direct support for itunes:trackId fallback - ALWAYS resolve to full artist - title song query for YouTube
        if (targetUrl.startsWith('itunes:')) {
            const trackId = targetUrl.replace('itunes:', '').trim();
            try {
                const itunesRes = await axios.get(`https://itunes.apple.com/lookup?id=${trackId}&entity=song`, { timeout: 3500 }).catch(() => null);
                const item = itunesRes?.data?.results?.[0];
                if (item) {
                    targetUrl = `${item.artistName || ''} - ${item.trackName || ''}`.trim();
                    server.log.info(`[stream-youtube] Resolved itunes:${trackId} to full search query: "${targetUrl}"`);
                }
            } catch (err: any) {
                server.log.warn(`[stream-youtube] Failed to lookup itunes:${trackId}: ${err.message}`);
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
                const resolution = await AudioResolverService.resolveBestAudioSource({
                    id: candId || localTrack?.id,
                    title: candTitle || cleanCandTitle || targetUrl,
                    primaryArtist: candArtist || cleanCandArtist || (localTrack?.artist?.name || ''),
                    duration: localTrack?.duration,
                    language: language || (localTrack as any)?.language
                });

                if (resolution && resolution.verified && resolution.watchUrl) {
                    targetUrl = resolution.watchUrl;
                    server.log.info(`[stream-youtube] Successfully resolved clean audio [Score: ${resolution.score}]: ${targetUrl}`);
                } else {
                    server.log.warn(`[stream-youtube] No clean verified audio found for query: "${targetUrl}"`);
                    return reply.status(404).send({ error: 'Clean official audio not available for this track' });
                }
            } catch (err: any) {
                server.log.error(`[stream-youtube] Failed to resolve query "${targetUrl}": ${err.message}`);
                return reply.status(500).send({ error: `Failed to resolve query: ${err.message}` });
            }
        }

        url = targetUrl;

        // 1. Check in-memory stream cache
        const memCached = youtubeStreamCache.get(url);
        if (memCached && memCached.expiresAt > Date.now()) {
            server.log.info(`[stream-youtube] Serving in-memory cached direct URL for: ${url}`);
            try {
                return await streamProxyUrl(memCached.directUrl, request, reply);
            } catch (proxyErr) {
                server.log.warn(`[stream-youtube] In-memory cached URL failed, clearing: ${proxyErr}`);
                youtubeStreamCache.delete(url);
                await invalidateCache(`stream:${url}`).catch(() => {});
            }
        }

        // 2. Check Redis stream cache
        const redisCachedUrl = await getCacheVal(`stream:${url}`).catch(() => null);
        if (redisCachedUrl && typeof redisCachedUrl === 'string') {
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

        // 3. In-flight single-flight resolution with concurrency semaphore
        let directMediaUrl: string | null = null;
        let resolutionPromise = inFlightStreamResolutions.get(url);
        if (!resolutionPromise) {
            resolutionPromise = (async () => {
                const release = await ytdlpSemaphore.acquire();
                try {
                    return await resolveDirectStreamUrl(url, server);
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
            youtubeStreamCache.set(url, {
                directUrl: directMediaUrl,
                expiresAt: Date.now() + 4 * 60 * 60 * 1000
            });
            await setCacheVal(`stream:${url}`, directMediaUrl, 14400).catch(() => {});

            try {
                return await streamProxyUrl(directMediaUrl, request, reply);
            } catch (pipeErr: any) {
                server.log.warn(`[stream-youtube] Direct proxy of resolved URL failed: ${pipeErr.message}`);
                youtubeStreamCache.delete(url);
                await invalidateCache(`stream:${url}`).catch(() => {});
            }
        }

        // 5. Fallback: Live spawn piping with Rule 3 Container Header Integrity
        try {
            const { spawn } = await import('child_process');
            const ytBin = getYtBin();
            const cookiesArgs = getCookieArgs();

            server.log.info(`[stream-youtube] Direct extraction failed. Falling back to live spawn pipe for: ${url}`);

            const clientStrategies = [
                ['--force-ipv4'],
                ['--force-ipv4', '--extractor-args', 'youtube:player_client=ios'],
                ['--force-ipv4', '--extractor-args', 'youtube:player_client=android_vr'],
                ['--force-ipv4', '--extractor-args', 'youtube:player_client=mweb'],
                ['--force-ipv6'],
            ];

            let spawned = false;
            const errors: string[] = [];

            for (const clientArgs of clientStrategies) {
                const args = [
                    '--js-runtimes', 'node',
                    ...cookiesArgs,
                    ...clientArgs,
                    '--socket-timeout', '15',
                    '--extractor-retries', '2',
                    '--no-check-certificates',
                    '--no-warnings',
                    '--no-playlist',
                    '-f', 'bestaudio[ext=m4a]/bestaudio/best',
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

    server.get('/search-spotify', async (request, reply) => {
        const { q } = request.query as { q?: string };
        if (!q || !q.trim()) return reply.status(400).send({ error: 'Query parameter "q" is required' });
        try {
            const { prisma } = await import('../utils/prisma.js');
            const { default: axios } = await import('axios');
            const { SystemSettingsService } = await import('../services/system-settings.service.js');
            const rapidApiKey = await SystemSettingsService.getSpotifyApiKey();

            // 1. Query local Zenify Database tracks first
            const dbTracks = await prisma.track.findMany({
                where: {
                    deletedAt: null,
                    OR: [
                        { title: { contains: q.trim(), mode: 'insensitive' } },
                        { artist: { name: { contains: q.trim(), mode: 'insensitive' } } }
                    ]
                },
                include: { artist: true, album: true },
                take: 10
            });

            const localZenifyItems = dbTracks.map((t: any) => ({
                id: t.id,
                name: t.title,
                artists: { items: [{ profile: { name: t.artist?.name || 'Unknown Artist' } }] },
                albumOfTrack: { name: t.album?.title || 'Single', coverArt: { sources: [{ url: t.coverUrl || '' }] } },
                duration: { totalMilliseconds: (t.duration || 180) * 1000 },
                audioUrl: t.audioUrl,
                isZenify: true,
                isImported: true
            }));

            // 2. Query external APIs (Tier 1: Spotify23, Tier 2: Spotify81, Tier 3: iTunes)
            let searchData: any = null;
            try {
                const res1 = await axios.get('https://spotify23.p.rapidapi.com/search/', {
                    params: { q, type: 'tracks', limit: 20 },
                    headers: { 'x-rapidapi-key': rapidApiKey, 'x-rapidapi-host': 'spotify23.p.rapidapi.com' },
                    timeout: 6000
                });
                searchData = res1.data;
            } catch (e1: any) {
                server.log.warn(`[utils/search-spotify] Tier 1 Spotify23 failed: ${e1.message}`);
            }

            if (!searchData || (!searchData.tracks && !searchData.results)) {
                try {
                    const res2 = await axios.get('https://spotify81.p.rapidapi.com/search', {
                        params: { q, type: 'tracks', limit: 20 },
                        headers: { 'x-rapidapi-key': rapidApiKey, 'x-rapidapi-host': 'spotify81.p.rapidapi.com' },
                        timeout: 6000
                    });
                    searchData = res2.data;
                } catch (e2: any) {
                    server.log.warn(`[utils/search-spotify] Tier 2 Spotify81 failed: ${e2.message}`);
                }
            }

            let rawItems: any[] = [];
            if (Array.isArray(searchData?.tracks)) {
                rawItems = searchData.tracks;
            } else if (Array.isArray(searchData?.tracks?.items)) {
                rawItems = searchData.tracks.items;
            } else if (Array.isArray(searchData?.results)) {
                rawItems = searchData.results;
            } else if (Array.isArray(searchData)) {
                rawItems = searchData;
            }

            if (rawItems.length === 0) {
                try {
                    const itunesRes = await axios.get(`https://itunes.apple.com/search`, {
                        params: { term: q, media: 'music', entity: 'song', limit: 15 },
                        timeout: 5000
                    });
                    rawItems = (itunesRes.data?.results || []).map((t: any) => ({
                        id: t.trackId.toString(),
                        name: t.trackName,
                        preview_url: t.previewUrl,
                        artists: { items: [{ profile: { name: t.artistName } }] },
                        albumOfTrack: { name: t.collectionName, coverArt: { sources: [{ url: t.artworkUrl100 ? t.artworkUrl100.replace('100x100bb', '600x600bb') : '' }] } },
                        duration: { totalMilliseconds: t.trackTimeMillis || 180000 }
                    }));
                } catch (e3: any) {
                    server.log.warn(`[utils/search-spotify] Tier 3 iTunes failed: ${e3.message}`);
                }
            }

            // Tier 4: YouTube Virtual Catalog Fallback if external is still empty
            if (rawItems.length === 0) {
                try {
                    const { ExternalMetadataService } = await import('../services/external-metadata.service.js');
                    const ytResults = await ExternalMetadataService.searchYoutubeMusic(q);
                    rawItems = (ytResults || []).map((v: any) => {
                        const parsed = ExternalMetadataService.parseYoutubeVideoToTrack(v);
                        return {
                            id: parsed.id,
                            name: parsed.title,
                            artists: { items: [{ profile: { name: parsed.artist.name } }] },
                            albumOfTrack: { name: parsed.album.title, coverArt: { sources: [{ url: parsed.coverUrl }] } },
                            duration: { totalMilliseconds: parsed.duration * 1000 },
                            audioUrl: parsed.audioUrl,
                            preview_url: parsed.audioUrl,
                            isVirtual: true,
                            isYoutube: true
                        };
                    });
                } catch (eYt: any) {
                    server.log.warn(`[utils/search-spotify] Tier 4 YouTube fallback failed: ${eYt.message}`);
                }
            }

            // 3. Cross-reference external results with existing DB tracks to set isZenify
            const existingDbTracks = await prisma.track.findMany({
                where: { deletedAt: null },
                select: { id: true, title: true, artist: { select: { name: true } }, audioUrl: true }
            });

            const dbMap = new Map<string, any>();
            for (const dbt of existingDbTracks) {
                const key = `${dbt.title.toLowerCase().trim()}:${dbt.artist.name.toLowerCase().trim()}`;
                dbMap.set(key, dbt);
            }

            const processedExternalItems = rawItems.map((item: any) => {
                const trackObj = item.data || item;
                const title = (trackObj.name || trackObj.title || '').toLowerCase().trim();
                const artist = (trackObj.artists?.items?.[0]?.profile?.name || trackObj.artists?.[0]?.name || trackObj.artistName || '').toLowerCase().trim();
                const key = `${title}:${artist}`;
                const dbMatch = dbMap.get(key);

                if (dbMatch) {
                    return {
                        ...item,
                        id: dbMatch.id,
                        isZenify: true,
                        isImported: true,
                        audioUrl: dbMatch.audioUrl || item.preview_url || item.previewUrl
                    };
                }
                return item;
            });

            // 4. Merge Zenify DB tracks first, avoiding duplicate titles
            const seenKeys = new Set<string>();
            const combinedResults: any[] = [];

            for (const item of [...localZenifyItems, ...processedExternalItems]) {
                const trackObj = item.data || item;
                const title = (trackObj.name || trackObj.title || '').toLowerCase().trim();
                const artist = (trackObj.artists?.items?.[0]?.profile?.name || trackObj.artists?.[0]?.name || trackObj.artistName || '').toLowerCase().trim();
                const key = `${title}:${artist}`;

                if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    combinedResults.push(item);
                }
            }

            return reply.send(combinedResults);
        } catch (err: any) {
            server.log.error(`search-spotify error: ${err.message}`);
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
}

