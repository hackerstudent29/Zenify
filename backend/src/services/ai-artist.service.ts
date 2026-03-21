import axios from 'axios';

export class AIArtistService {
    private static NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

    /**
     * Generates a high-quality, engaging biography for an artist using NVIDIA Llama-3.
     */
    static async generateArtistBio(artistName: string): Promise<string | null> {
        if (!this.NVIDIA_API_KEY) {
            console.warn("[AIArtist] NVIDIA_API_KEY not found. Skipping bio generation.");
            return null;
        }

        console.log(`[AIArtist] Generating bio for: ${artistName}`);

        // Safety: If name contains " & ", " feat. ", or ",", it's likely a collaboration. Return null.
        if (artistName.includes('&') || artistName.toLowerCase().includes('feat.') || (artistName.includes(',') && !artistName.includes(',Inc'))) {
            console.warn(`[AIArtist] Skipping bio for collaboration string: "${artistName}"`);
            return null;
        }

        const prompt = `
        Task: Write a short, professional, and engaging biography for the music artist "${artistName}".
        
        Guidelines:
        1. Keep it concise (2-3 paragraphs, around 100-150 words).
        2. Mention their musical style, general background, and why people love them (if known).
        3. Use a premium, slightly atmospheric, yet journalistic tone.
        4. Focus ONLY on their music career.
        5. If the artist is very new or obscure, write a generic but classy introduction about them being a rising talent in their genre.
        6. Format: Plain text only, NO markdown headers.
        7. Language: English.
        `;

        try {
            const res = await axios.post(
                'https://integrate.api.nvidia.com/v1/chat/completions',
                {
                    model: "meta/llama-3.1-405b-instruct",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.7,
                    max_tokens: 350
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.NVIDIA_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const bio = res.data.choices[0]?.message?.content?.trim();
            if (bio && bio.length > 50) {
                console.log(`[AIArtist] Successfully generated bio for ${artistName}`);
                return bio;
            }

            return null;
        } catch (err: any) {
            console.error(`[AIArtist] Bio generation failed for ${artistName}:`, err.message);
            return null;
        }
    }
}
