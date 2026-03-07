import { FastifyInstance } from 'fastify';
import https from 'https';
import http from 'http';

// ── helpers ────────────────────────────────────────────────────────────────

/** Fetch a URL server-side and return { statusCode, contentType, body } */
function serverFetch(
    rawUrl: string,
    asBuffer = false,
): Promise<{ statusCode: number; contentType: string; body: Buffer; finalUrl: string }> {
    return new Promise((resolve, reject) => {
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

// ── Route ──────────────────────────────────────────────────────────────────

export async function utilsRoutes(server: FastifyInstance) {
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
}
