import { FastifyInstance } from 'fastify';
import https from 'https';
import http from 'http';
import nodemailer from 'nodemailer';
import { config } from '../config/env';



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

    // Fallback: first <img src> that looks like a real image
    const imgMatch = html.match(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i);
    if (imgMatch?.[1]) {
        const src = imgMatch[1];
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
     * GET /api/utils/extract-palette?url=<encoded-image-url>
     *
     * Fetches the image server-side, calls NVIDIA Vision AI (Llama-3.2-vision)
     * and returns the 4 most dominant vibrant hex colors from the album art.
     * Results are cached in-memory per session.
     */
    server.get('/extract-palette', async (request, reply) => {
        const { url } = request.query as { url?: string };
        if (!url) return reply.status(400).send({ error: 'Missing url parameter' });

        // Serve from cache if available
        if (paletteAICache.has(url)) {
            return reply.header('X-Cache', 'HIT').send({ palette: paletteAICache.get(url) });
        }

        const NVIDIA_KEY = process.env.NVIDIA_API_KEY;
        if (!NVIDIA_KEY) return reply.status(503).send({ error: 'No AI key configured' });

        try {
            // Fetch the image buffer server-side (handles CORS, redirects, auth)
            const imgResult = await serverFetch(url, true);
            if (imgResult.statusCode < 200 || imgResult.statusCode >= 400 || !imgResult.body.length) {
                return reply.status(422).send({ error: 'Could not fetch image' });
            }

            // Encode to base64 data URI
            const base64 = imgResult.body.toString('base64');
            const contentType = (imgResult.contentType.split(';')[0] || 'image/jpeg').replace(/[^a-z/]/g, '');

            // Call NVIDIA Vision AI
            const aiRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${NVIDIA_KEY}`,
                },
                body: JSON.stringify({
                    model: 'meta/llama-3.2-90b-vision-instruct',
                    messages: [{
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'Analyze this album cover art and identify the 4 most visually dominant and vibrant colors. Return ONLY a valid JSON array of exactly 4 hex color codes, nothing else. Example: ["#C8001A","#4A0080","#00B4D8","#FF6B00"]',
                            },
                            {
                                type: 'image_url',
                                image_url: { url: `data:${contentType};base64,${base64}` },
                            },
                        ],
                    }],
                    max_tokens: 80,
                    temperature: 0.05,
                }),
                signal: AbortSignal.timeout(12000),
            });

            if (!aiRes.ok) {
                const errText = await aiRes.text();
                server.log.warn(`[extract-palette] NVIDIA AI error ${aiRes.status}: ${errText.slice(0, 200)}`);
                return reply.status(422).send({ error: 'AI extraction failed', detail: aiRes.status });
            }

            const aiData = await aiRes.json() as any;
            const rawText: string = aiData.choices?.[0]?.message?.content ?? '';

            // Extract JSON array from the AI response
            const match = rawText.match(/\[[\s\S]*?\]/);
            if (!match) {
                server.log.warn(`[extract-palette] Could not parse AI response: ${rawText.slice(0, 200)}`);
                return reply.status(422).send({ error: 'Could not parse AI color response' });
            }

            let palette: string[] = JSON.parse(match[0]);
            if (!Array.isArray(palette) || palette.length === 0) {
                return reply.status(422).send({ error: 'Empty palette from AI' });
            }

            // Validate hex format & normalize
            palette = palette
                .filter((c: any) => typeof c === 'string' && /^#[0-9A-Fa-f]{3,6}$/.test(c.trim()))
                .map((c: string) => c.trim().toUpperCase());

            // Ensure exactly 4 entries
            while (palette.length < 4) palette.push(palette[0]);
            const finalPalette = palette.slice(0, 4);

            paletteAICache.set(url, finalPalette);
            server.log.info(`[extract-palette] AI palette for ${url.slice(-40)}: ${finalPalette.join(', ')}`);
            return reply.header('X-Cache', 'MISS').send({ palette: finalPalette });

        } catch (err: any) {
            server.log.error(`[extract-palette] ${err?.message}`);
            return reply.status(500).send({ error: 'Internal error during palette extraction' });
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
        const { url } = request.query as { url?: string };
        if (!url) return reply.status(400).send({ error: 'Missing url parameter' });

        try {
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
                    'Cache-Control': 'public, max-age=86400',
                    'Content-Length': String(imgResult.body.length),
                });
                reply.raw.end(imgResult.body);
                return;
            }

            // Step 4: direct image — check content type
            if (!result.contentType.startsWith('image/') && !result.contentType.includes('octet-stream')) {
                return reply.status(415).send({ error: 'URL does not point to an image or a web page with images' });
            }

            reply.raw.writeHead(200, {
                'Content-Type': result.contentType.includes('octet-stream') ? 'image/jpeg' : result.contentType,
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=86400',
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
                    'Cache-Control': 'public, max-age=86400',
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

    /**
     * GET /api/utils/test-mail?to=some-email@gmail.com
     * 
     * Temporary diagnostic endpoint to test SMTP settings on the running backend server.
     */
    server.get('/test-mail', async (request, reply) => {
        const { to, port, secure } = request.query as { to?: string; port?: string; secure?: string };
        const target = to || 'ramsimply5@gmail.com';
        const smtpPort = port ? parseInt(port, 10) : config.SMTP_PORT;
        const smtpSecure = secure === 'true' || smtpPort === 465;
        try {
            const dns = require('dns').promises;
            let resolvedHost = config.SMTP_HOST;
            
            // Resolve host manually if it's a hostname to avoid IPv6 issues
            if (config.SMTP_HOST && !/^[0-9.]+$/.test(config.SMTP_HOST)) {
                try {
                    const ips = await dns.resolve4(config.SMTP_HOST);
                    if (ips && ips.length > 0) {
                        resolvedHost = ips[0];
                    }
                } catch (dnsErr) {
                    // Ignore and fallback to hostname
                }
            }
            
            const transporter = nodemailer.createTransport({
                host: resolvedHost,
                port: smtpPort,
                secure: smtpSecure,
                auth: {
                    user: config.SMTP_USER,
                    pass: config.SMTP_PASS,
                },
                tls: {
                    servername: config.SMTP_HOST,
                },
                connectionTimeout: 5000,
                greetingTimeout: 5000,
                socketTimeout: 5000
            } as any);


            const info = await transporter.sendMail({
                from: `"Zenify Test" <${config.SMTP_USER}>`,
                to: target,
                subject: 'Zenify SMTP Test',
                text: 'Testing SMTP connection from production backend with manual DNS resolution.',
            });

            return {
                success: true,
                info,
                config: {
                    SMTP_HOST: config.SMTP_HOST,
                    resolvedHost,
                    SMTP_PORT: smtpPort,
                    secure: smtpSecure,
                    SMTP_USER: config.SMTP_USER,
                    hasPass: !!config.SMTP_PASS,
                    passLength: config.SMTP_PASS?.length
                }
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message,
                stack: error.stack,
                config: {
                    SMTP_HOST: config.SMTP_HOST,
                    SMTP_PORT: smtpPort,
                    secure: smtpSecure,
                    SMTP_USER: config.SMTP_USER,
                    hasPass: !!config.SMTP_PASS,
                    passLength: config.SMTP_PASS?.length
                }
            };
        }
    });
}

