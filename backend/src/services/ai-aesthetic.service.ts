import { prisma } from '../utils/prisma';
import { config } from '../config/env';

async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
        if (!res.ok) return null;
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = res.headers.get('content-type') || 'image/jpeg';
        return { buffer, contentType };
    } catch {
        return null;
    }
}

export class AIAestheticService {
    private static NVIDIA_API_KEY = config.NVIDIA_API_KEY;
    private static MAX_RETRIES = 2;
    private static RETRY_DELAY_MS = 2000;

    /**
     * Analyzes the track's cover artwork using NVIDIA Llama-90B Vision API to extract dominant color and vibe.
     */
    static async syncTrackAesthetic(trackId: string, retryCount = 0): Promise<any> {
        if (!this.NVIDIA_API_KEY) {
            console.warn('[AIAesthetic] NVIDIA_API_KEY not configured - skipping color extraction');
            return null;
        }

        const track = await prisma.track.findUnique({
            where: { id: trackId },
            include: { artist: true }
        });

        if (!track || !track.coverUrl) {
            console.warn(`[AIAesthetic] Track ${trackId} not found or has no cover URL`);
            return null;
        }

        // Resolve full cover URL for AI Vision
        let fullCoverUrl = track.coverUrl;
        if (!fullCoverUrl.startsWith('http')) {
            fullCoverUrl = `https://zenify-production-08b4.up.railway.app/uploads/${fullCoverUrl.replace(/^\/+/, '')}`;
        }

        console.log(`[AIAesthetic] Analyzing image for: ${track.title} at ${fullCoverUrl}`);

        try {
            const imageResult = await fetchImageBuffer(fullCoverUrl);
            if (!imageResult) {
                console.warn(`[AIAesthetic] Could not fetch image for ${track.title} from ${fullCoverUrl}`);
                return null;
            }
            const base64 = imageResult.buffer.toString('base64');
            const contentType = imageResult.contentType;

            const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.NVIDIA_API_KEY}`,
                },
                body: JSON.stringify({
                    model: 'meta/llama-3.2-90b-vision-instruct',
                    messages: [{
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'Analyze this album artwork and extract the dominant mood color (Hex) and a visual style vibe. Return ONLY a valid JSON object of the format: {"aura_color": "HEX_CODE", "aura_vibe": "VIBE_TEXT"}. Replace HEX_CODE with the actual hex color code (e.g. #00FFCC) and VIBE_TEXT with a 2-word aesthetic description of the visual style. Do not output any other text or markdown block.'
                            },
                            {
                                type: 'image_url',
                                image_url: { url: `data:${contentType};base64,${base64}` }
                            }
                        ]
                    }],
                    max_tokens: 120,
                    temperature: 0.1,
                })
            });

            if (!res.ok) {
                const errText = await res.text();
                console.error(`[AIAesthetic] NVIDIA Vision API error (${res.status}): ${errText}`);
                
                // Retry on server errors (5xx) or rate limits (429)
                if ((res.status >= 500 || res.status === 429) && retryCount < this.MAX_RETRIES) {
                    console.log(`[AIAesthetic] Retrying in ${this.RETRY_DELAY_MS}ms... (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
                    await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS * (retryCount + 1)));
                    return this.syncTrackAesthetic(trackId, retryCount + 1);
                }
                
                return null;
            }

            const data = await res.json() as any;
            const content = data.choices?.[0]?.message?.content || '';
            const match = content.match(/\{[\s\S]*?\}/);
            if (!match) {
                console.error(`[AIAesthetic] Could not parse JSON from response: ${content}`);
                return null;
            }

            const aesthetic = JSON.parse(match[0]);
            if (!aesthetic.aura_color || !aesthetic.aura_vibe) {
                console.error(`[AIAesthetic] Invalid aesthetic data: ${JSON.stringify(aesthetic)}`);
                return null;
            }

            console.log(`[AIAesthetic] ✅ Vision Result for "${track.title}": ${aesthetic.aura_vibe} (${aesthetic.aura_color})`);

            return await prisma.track.update({
                where: { id: trackId },
                data: {
                    aura_color: aesthetic.aura_color.trim().toUpperCase(),
                    aura_vibe: aesthetic.aura_vibe.trim()
                }
            });

        } catch (err: any) {
            console.error(`[AIAesthetic] ❌ Vision analysis failed for ${track.title}:`, err.message);
            
            // Retry on network errors
            if (retryCount < this.MAX_RETRIES && (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT')) {
                console.log(`[AIAesthetic] Retrying in ${this.RETRY_DELAY_MS}ms... (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
                await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS * (retryCount + 1)));
                return this.syncTrackAesthetic(trackId, retryCount + 1);
            }
            
            return null;
        }
    }

    /**
     * Predicts the visual aesthetic for an album.
     */
    static async syncAlbumAesthetic(albumId: string) {
        if (!this.NVIDIA_API_KEY) return null;

        const album = await prisma.album.findUnique({
            where: { id: albumId },
            include: { artist: true, tracks: { take: 5 } }
        });

        if (!album) return null;

        const trackTitles = album.tracks.map(t => t.title).join(', ');

        try {
            const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.NVIDIA_API_KEY}`,
                },
                body: JSON.stringify({
                    model: 'meta/llama-3.3-70b-instruct',
                    messages: [{
                        role: 'user',
                        content: `Predict the "Aura" (mood color and visual style) for this album based on its details:
                        Album: "${album.title}"
                        Artist: "${album.artist.name}"
                        Tracks: ${trackTitles}
                        
                        Return ONLY a valid JSON object of the format: {"aura_color": "HEX_CODE", "aura_vibe": "VIBE_TEXT"}. Replace HEX_CODE with the actual hex color code (e.g. #00FFCC) and VIBE_TEXT with a 2-word aesthetic description of the visual style. Do not output any other text or markdown block.`
                    }],
                    max_tokens: 100,
                    temperature: 0.1,
                })
            });

            if (!res.ok) return null;

            const data = await res.json() as any;
            const content = data.choices?.[0]?.message?.content || '';
            const match = content.match(/\{[\s\S]*?\}/);
            if (!match) return null;

            const aesthetic = JSON.parse(match[0]);

            return await prisma.album.update({
                where: { id: albumId },
                data: {
                    aura_color: aesthetic.aura_color.trim().toUpperCase(),
                    aura_vibe: aesthetic.aura_vibe.trim()
                }
            });
        } catch (err) {
            return null;
        }
    }
}
