import { FastifyInstance } from 'fastify';
import https from 'https';
import http from 'http';
import { config } from '../config/env';
import cloudinary from '../utils/cloudinary.js';




// ── helpers ────────────────────────────────────────────────────────────────

/** Fetch a URL server-side and return { statusCode, contentType, body } */
function serverFetch(
    rawUrl: string,
    asBuffer = false,
): Promise<{ statusCode: number; contentType: string; body: Buffer; finalUrl: string }> {
    return new Promise((resolve, reject) => {
        let targetUrl: URL;
        try { targetUrl = new URL(rawUrl); } catch { return reject(new Error('Invalid URL')); }

        if (targetUrl.hostname === 'localhost') {
            targetUrl.hostname = '127.0.0.1';
        }

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
        let url: string = queryUrl;

        try {
            // Smart extraction for media links (Apple Music, YouTube, Spotify)
            const isMediaUrl = url.includes('youtube.com') || url.includes('youtu.be') || url.includes('music.youtube.com') || url.includes('music.apple.com') || url.includes('spotify.com');
            if (isMediaUrl) {
                try {
                    const { ExternalMetadataService } = await import('../services/external-metadata.service.js');
                    // Eagerly try fetchFromUrl first to use iTunes/Spotify official APIs
                    const meta = await ExternalMetadataService.fetchFromUrl(url);
                    if (meta && meta.cover) {
                        url = meta.cover;
                    } else {
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

            // Step 2: fetch the resolved URL
            const result = await serverFetch(resolvedUrl);

            // Step 3: if it came back as HTML, extract the best image URL from the page
            let imageUrl = resolvedUrl;
            if (result.contentType.includes('text/html')) {
                const html = result.body.toString('utf-8');
                const extracted = extractImageFromHtml(html, resolvedUrl);
                if (!extracted) {
                    return reply.status(422).send({ error: 'No image found on that page. Try right-clicking the image and choosing "Copy image address".' });
                }
                imageUrl = extracted;

                // Fetch the actual image now
                const imgResult = await serverFetch(imageUrl);
                if (!imgResult.contentType.startsWith('image/')) {
                    return reply.status(415).send({ error: 'Extracted URL is not an image' });
                }

                reply.raw.writeHead(200, {
                    'Content-Type': imgResult.contentType,
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, max-age=31536000, immutable',
                    'Content-Length': String(imgResult.body.length),
                });
                reply.raw.end(imgResult.body);
                return;
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
                return reply.status(415).send({ error: `URL does not point to an image or a web page with images (got ${result.contentType})` });
            }

            reply.raw.writeHead(200, {
                'Content-Type': result.contentType.includes('octet-stream') ? 'image/jpeg' : result.contentType,
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=31536000, immutable',
                'Content-Length': String(result.body.length),
            });
            reply.raw.end(result.body);

        } catch (err: any) {
            server.log.error('Image proxy error:', err?.message);
            return reply.status(502).send({ error: 'Could not reach image source' });
        }
    });

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

        let targetUrl: URL;
        try { targetUrl = new URL(url); } catch {
            return reply.status(400).send({ error: 'Invalid URL' });
        }

        const rangeHeader = (request.headers as any)['range'] as string | undefined;

        const makeRequest = (rawUrl: string, depth = 0): Promise<void> => new Promise((resolve, reject) => {
            if (depth > 5) return reject(new Error('Too many redirects'));

            let u: URL;
            try { u = new URL(rawUrl); } catch { return reject(new Error('Invalid redirect URL')); }

            const client = u.protocol === 'https:' ? https : http;
            const options = {
                hostname: u.hostname,
                port: u.port || (u.protocol === 'https:' ? 443 : 80),
                path: u.pathname + u.search,
                method: 'GET',
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

                const statusCode = res.statusCode === 206 ? 206 : 200;
                const responseHeaders: Record<string, string> = {
                    'Content-Type': res.headers['content-type'] || 'audio/mpeg',
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

            req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
            req.on('error', reject);
            req.end();
        });

        try {
            await makeRequest(url);
        } catch (err: any) {
            server.log.error('Audio proxy error:', err?.message);
            if (!reply.raw.headersSent) {
                return reply.status(502).send({ error: 'Could not reach audio source' });
            }
        }
    });
}

