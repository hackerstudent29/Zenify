import { generateText, createGateway } from 'ai';
import { config } from '../config/env';
import { prisma } from '../utils/prisma';

export class AILyricsService {
    private static VERCEL_AI_KEY = config.VERCEL_AI_KEY;

    private static async queryLLM(prompt: string, options?: { isJson?: boolean }): Promise<string | null> {
        const nvidiaKey = config.NVIDIA_API_KEY;
        if (nvidiaKey) {
            console.log("[AILyrics] Querying NVIDIA API directly...");
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 60000);
                const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${nvidiaKey}`,
                    },
                    body: JSON.stringify({
                        model: 'meta/llama-3.3-70b-instruct',
                        messages: [{
                            role: 'user',
                            content: prompt
                        }],
                        temperature: 0.1,
                    }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (!res.ok) {
                    console.error(`[AILyrics] NVIDIA API error: ${res.status}`, await res.text());
                } else {
                    const data = await res.json() as any;
                    const content = data.choices?.[0]?.message?.content;
                    if (content) {
                        return content;
                    }
                }
            } catch (err: any) {
                console.error("[AILyrics] NVIDIA direct query failed or timed out:", err.message);
            }
        }

        if (!this.VERCEL_AI_KEY) {
            throw new Error("No API credentials found for AILyricsService");
        }

        console.log("[AILyrics] Falling back to Vercel Gateway...");
        const gateway = createGateway({
            apiKey: this.VERCEL_AI_KEY,
        });
        const model = gateway('openai/gpt-4o-mini');
        const { text } = await generateText({
            model,
            prompt,
        });
        return text;
    }

    /**
     * Translates lyrics into the target language while preserving the artistic vibe.
     * Handles both plain text and synced lyrics format (preserving timestamps [00:00.00]).
     */
    static async translateLyrics(lyrics: string, targetLang: string = "English"): Promise<string | null> {
        console.log(`[AILyrics] Translating lyrics to ${targetLang}...`);

        try {
            const prompt = `Task: Translate the provided song lyrics into ${targetLang}.
            
            Mandatory Rules:
            1. Preserve the artistic meaning, intensity, and flow.
            2. If the lyrics have timestamps like "[MM:SS.ms]", KEEP them exactly at the start of each line.
            3. Do NOT translate the timestamps.
            4. Maintain the structure (line breaks, verses, chorus).
            5. Use a high-quality, professional translation style.
            6. Return ONLY the translated lyrics, no explanatory text.
            
            Lyrics to Translate:
            ${lyrics.slice(0, 3000)}`;

            const result = await this.queryLLM(prompt);
            return result ? result.trim() : null;
        } catch (err: any) {
            console.error(`[AILyrics] Translation failed:`, err.message);
            return null;
        }
    }

    /**
     * Generates a "Zen" insight/meaning for the song lyrics.
     */
    static async generateLyricsInsight(trackId: string): Promise<string | null> {
        const track = await prisma.track.findUnique({
            where: { id: trackId },
            select: { title: true, lyrics: true, artist: { select: { name: true } } }
        });

        if (!track || !track.lyrics) return null;

        console.log(`[AILyrics] Generating insight for: ${track.title}`);

        try {
            const prompt = `Task: Provide a "Zen" insight or emotional meaning for the song "${track.title}" by ${track.artist.name}.
            
            Lyrics:
            ${track.lyrics.slice(0, 2000)}
            
            Guidelines:
            1. Write exactly ONE sophisticated paragraph (2-3 sentences).
            2. Focus on the core emotion, story, or "soul" of the song.
            3. Keep the tone premium, poetic, and inspiring.
            4. Do not mention "The lyrics describe..." or "This song is about...". Start directly with the essence.`;

            const result = await this.queryLLM(prompt);
            if (!result) return null;

            const insight = result.trim();
            
            await prisma.track.update({
                where: { id: trackId },
                data: { lyrics_meaning: insight }
            });

            return insight;
        } catch (err: any) {
            console.error(`[AILyrics] Insight generation failed:`, err.message);
            return null;
        }
    }

    /**
     * AI-Powered Lyric Alignment: Takes plain text lyrics and a duration,
     * and returns a synced LRC-style structure with intelligent timestamps.
     */
    static async alignLyrics(lyrics: string, duration: number): Promise<{ time: number, text: string }[] | null> {
        console.log(`[AILyrics] Intelligently aligning lyrics for ${duration}s track...`);

        try {
            const prompt = `Task: Align the provided song lyrics to a timeline of ${duration} seconds.
            
            Guidelines:
            1. Distribute the lines naturally across the ${duration} seconds.
            2. Consider that songs often have intros (starting around 5-15s) and outros.
            3. Return the result as a JSON array of objects: { "time": number (seconds), "text": string }.
            4. Ensure timestamps are strictly increasing.
            5. Do NOT include any markdown formatting, just the raw JSON array.
            6. IMPORTANT: Return ONLY a valid JSON array. Do not output any explanation, notes, or conversation before or after the JSON.
            
            Lyrics:
            ${lyrics.slice(0, 2000)}`;

            const result = await this.queryLLM(prompt);
            if (!result) return null;

            // Clean up possible markdown wrappers from AI
            const cleanJson = result.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(cleanJson);
            
            if (Array.isArray(parsed)) {
                return parsed.map(item => ({
                    time: Number(item.time),
                    text: String(item.text)
                }));
            }
            return null;
        } catch (err: any) {
            console.error(`[AILyrics] Alignment failed:`, err.message);
            return null;
        }
    }
}
