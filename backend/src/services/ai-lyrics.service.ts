import axios from 'axios';

export class AILyricsService {
    private static NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

    /**
     * Translates lyrics into the target language while preserving the artistic vibe.
     * Handles both plain text and synced lyrics format (preserving timestamps [00:00.00]).
     */
    static async translateLyrics(lyrics: string, targetLang: string = "English"): Promise<string | null> {
        if (!this.NVIDIA_API_KEY) return null;

        console.log(`[AILyrics] Translating lyrics to ${targetLang}...`);

        const prompt = `
        Task: Translate the provided song lyrics into ${targetLang}.
        
        Mandatory Rules:
        1. Preserve the artistic meaning, intensity, and flow.
        2. If the lyrics have timestamps like "[MM:SS.ms]", KEEP them exactly at the start of each line.
        3. Do NOT translate the timestamps.
        4. Maintain the structure (line breaks, verses, chorus).
        5. Use a high-quality, professional translation style.
        6. Return ONLY the translated lyrics, no explanatory text.
        
        Lyrics to Translate:
        ${lyrics.slice(0, 3000)} // Capped for context safety
        `;

        try {
            const res = await axios.post(
                'https://integrate.api.nvidia.com/v1/chat/completions',
                {
                    model: "meta/llama-3.1-405b-instruct",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.3,
                    max_tokens: 2000
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.NVIDIA_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return res.data.choices[0]?.message?.content?.trim() || null;
        } catch (err: any) {
            console.error(`[AILyrics] Translation failed:`, err.message);
            return null;
        }
    }
}
