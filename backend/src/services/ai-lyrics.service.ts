export interface DetectedSongLanguage {
    language: string;
    code: string;
    isEnglish: boolean;
    romanizedLang: string;
}

import { generateText, createGateway } from 'ai';
import { config } from '../config/env';
import { prisma } from '../utils/prisma';

export class AILyricsService {
    private static VERCEL_AI_KEY = config.VERCEL_AI_KEY;

    public static async queryLLM(prompt: string, options?: { isJson?: boolean }): Promise<string | null> {
        try {
            const { askAI, FAST_MODEL } = await import('../utils/ai.js');
            const res = await askAI(prompt, FAST_MODEL);
            if (res && res.trim().length > 0) {
                return res;
            }
        } catch (vErr: any) {
            console.warn("[AILyrics] askAI failed, attempting fallback:", vErr.message);
        }

        if (this.VERCEL_AI_KEY) {
            try {
                const gateway = createGateway({
                    apiKey: this.VERCEL_AI_KEY,
                });
                const model = gateway('openai/gpt-4o-mini');
                const { text } = await generateText({
                    model,
                    prompt,
                });
                if (text && text.trim().length > 0) {
                    return text;
                }
            } catch (vErr: any) {
                console.warn("[AILyrics] Vercel Gateway query failed, attempting NVIDIA fallback:", vErr.message);
            }
        }

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
                        model: 'meta/llama-3.1-70b-instruct',
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

        return null;
    }

    /**
     * Parses song details (title, artist, album, and artist metadata) to an LLM
     * to accurately identify the song's language and ISO code before calling Deepgram.
     */
    static async detectSongLanguageDetails(params: {
        title: string;
        artist: string;
        album?: string;
        lyrics?: string;
    }): Promise<DetectedSongLanguage> {
        const { title, artist, album, lyrics } = params;

        // Fast heuristics for Tamil music directors / artists / indie singers
        const lowArtist = (artist || '').toLowerCase();
        const lowTitle = (title || '').toLowerCase();
        const tamilKeywords = [
            'anirudh', 'ar rahman', 'ilayaraja', 'yuvan', 'sid sriram', 'harris jayaraj', 
            'gv prakash', 'g.v. prakash', 'santhosh narayanan', 'vijay antony', 'dhibu ninan thomas', 
            'imman', 'deva', 'hiphop tamizha', 'vidyasagar', 'spb', 's. p. balasubrahmanyam', 
            'pradeep kumar', 'dhanush', 'sathyaprakash', 'gengee', 'nithux', 'sujaan', 'paal dabba',
            'aswin', 'arivuv', 'ofro', 'adk', 'tenma', 'stephen zechariah'
        ];
        if (tamilKeywords.some(k => lowArtist.includes(k)) && !lowTitle.includes('hindi') && !lowTitle.includes('telugu')) {
            return {
                language: 'Tamil',
                code: 'ta',
                isEnglish: false,
                romanizedLang: 'Tanglish'
            };
        }

        // Fast check for Tamil script characters
        if (lyrics && /[\u0b80-\u0bff]/.test(lyrics)) {
            return {
                language: 'Tamil',
                code: 'ta',
                isEnglish: false,
                romanizedLang: 'Tanglish'
            };
        }

        // Fast check for Devanagari (Hindi) script
        if (lyrics && /[\u0900-\u097f]/.test(lyrics)) {
            return {
                language: 'Hindi',
                code: 'hi',
                isEnglish: false,
                romanizedLang: 'Hinglish'
            };
        }

        // Fast check for Telugu script
        if (lyrics && /[\u0c00-\u0c7f]/.test(lyrics)) {
            return {
                language: 'Telugu',
                code: 'te',
                isEnglish: false,
                romanizedLang: 'Tenglish'
            };
        }

        // Parse song details with LLM for comprehensive global language identification
        try {
            const prompt = `You are an expert global musicologist and multilingual music catalog specialist.
Analyze this song and artist to determine the primary singing language:
Title: "${title}"
Artist: "${artist}"
${album ? `Album: "${album}"` : ''}

CRITICAL RULES:
1. The ARTIST'S origin, music scene, and industry (e.g., Tamil cinema/indie, Bollywood Hindi, Tollywood Telugu, K-pop, Afrobeats, Latin, Western/English pop) is the absolute PRIMARY ground truth.
2. Artists such as GengEe, Nithux, Anirudh, Paal Dabba, AR Rahman, Yuvan, etc., make Tamil songs. If the artist is Tamil (like GengEe), the language is Tamil (code: "ta", romanizedLang: "Tanglish").
3. DO NOT be confused by placeholder or mismatched lyrics.
4. Respond ONLY with valid JSON (no markdown formatting):
{
  "language": "Tamil",
  "code": "ta",
  "isEnglish": false,
  "romanizedLang": "Tanglish"
}`;

            const responseText = await this.queryLLM(prompt);
            if (responseText) {
                const cleanJson = responseText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
                const parsed = JSON.parse(cleanJson);
                if (parsed.language && parsed.code) {
                    return {
                        language: parsed.language,
                        code: parsed.code.toLowerCase(),
                        isEnglish: !!parsed.isEnglish,
                        romanizedLang: parsed.romanizedLang || parsed.language
                    };
                }
            }
        } catch (err: any) {
            console.warn(`[AILyrics] LLM language detection fallback:`, err.message);
        }

        return {
            language: 'English',
            code: 'en',
            isEnglish: true,
            romanizedLang: 'English'
        };
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
