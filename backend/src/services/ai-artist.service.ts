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

    /**
     * AI-based track classification: Decides if a track is from a movie.
     * Returns the normalized movie name, or null if it's a standalone single.
     */
    static async classifyTrack(title: string, artist: string, albumContext?: string, description?: string): Promise<{ isMovie: boolean; movieName: string | null }> {
        if (!this.NVIDIA_API_KEY) {
            // Fallback rules if AI is unavailable
            if (albumContext && (albumContext.toLowerCase().includes('original motion picture soundtrack') || albumContext.toLowerCase().includes(' ost'))) {
                let name = albumContext.replace(/(original motion picture soundtrack| ost)/i, '').trim();
                return { isMovie: true, movieName: name };
            }
            return { isMovie: false, movieName: null };
        }

        console.log(`[AIArtist] Classifying track: "${title}" by ${artist}`);

        const prompt = `
        Task: Determine if the song "${title}" by "${artist}" (Album: "${albumContext || 'None'}") is from a movie soundtrack (film) or if it is a standalone single/unrelated studio album.
        
        Guidelines:
        1. If it's a prominent song from an Indian or international movie, output exactly formatting the movie name.
        2. Ignore labels like "Original Motion Picture Soundtrack", "OST", "BGM", etc. Just output the clean movie title.
        3. If it is NOT a movie song (it's an indie pop track, a standard studio album, a standalone single, etc.), output: "SINGLE".
        4. If it is a movie song, output ONLY the clean, normalized movie name (e.g., "Interstellar", "Leo", "Jawan").
        5. Do not explain your reasoning. Just return the string.
        ${description ? `Context/Description: ${description.substring(0, 300)}` : ''}
        `;

        try {
            const res = await axios.post(
                'https://integrate.api.nvidia.com/v1/chat/completions',
                {
                    model: "meta/llama-3.1-8b-instruct",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.1,
                    max_tokens: 20
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.NVIDIA_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            let result = res.data.choices[0]?.message?.content?.trim() || "SINGLE";
            result = result.replace(/^"|"$/g, '').trim(); // Remove quotes

            const lowResult = result.toLowerCase();
            const isRefusal = lowResult.includes("unable") || lowResult.includes("cannot") || lowResult.includes("could not") || lowResult.includes("sorry") || lowResult.length > 60;

            if (lowResult === "single" || lowResult.includes("single") || isRefusal) {
                return { isMovie: false, movieName: null };
            }

            return { isMovie: true, movieName: result };
        } catch (err: any) {
            console.error(`[AIArtist] Classification failed for ${title}:`, err.message);
            // Fallback
            if (albumContext && albumContext.toLowerCase().includes('soundtrack')) {
                return { isMovie: true, movieName: albumContext.replace(/soundtrack/i, '').trim() };
            }
            return { isMovie: false, movieName: null };
        }
    }
}
