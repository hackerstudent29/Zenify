import axios from 'axios';
import { generateObject, generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

export class AIArtistService {
    static async generateArtistBio(artistName: string): Promise<string | null> {
        const profile = await this.enrichArtistProfile(artistName);
        return profile.bio;
    }

    private static VERCEL_AI_KEY = process.env.VERCEL_AI_KEY;

    /**
     * Generates an enriched artist profile including bio, DOB, and fetches images via Deezer.
     */
    static async enrichArtistProfile(artistName: string): Promise<{ bio: string | null; dob: Date | null; imageUrl: string | null; coverUrl: string | null; genre: string | null }> {
        const result = { bio: null as string | null, dob: null as Date | null, imageUrl: null as string | null, coverUrl: null as string | null, genre: null as string | null };

        // 1. Fetch images from Deezer (Free, no auth)
        try {
            console.log(`[AIArtist] Fetching Deezer images for ${artistName}...`);
            const dzRes = await axios.get(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}`, { timeout: 4000 });
            if (dzRes.data && dzRes.data.data && dzRes.data.data.length > 0) {
                const artist = dzRes.data.data[0];
                result.imageUrl = artist.picture_xl || artist.picture_big || artist.picture;
                // Deezer doesn't provide cover art typically for artists, so we reuse the high-res profile or leave null.
                result.coverUrl = artist.picture_xl || null; 
            }
        } catch (err: any) {
            console.error(`[AIArtist] Deezer image fetch failed for ${artistName}: ${err.message}`);
        }

        // Safety: If name contains " & ", " feat. ", or ",", it's likely a collaboration. Skip AI bio.
        if (artistName.includes('&') || artistName.toLowerCase().includes('feat.') || (artistName.includes(',') && !artistName.includes(',Inc'))) {
            console.warn(`[AIArtist] Skipping AI bio for collaboration string: "${artistName}"`);
            return result;
        }

        if (!this.VERCEL_AI_KEY) {
            console.warn("[AIArtist] VERCEL_AI_KEY not found. Skipping bio/DOB generation.");
            return result;
        }

        console.log(`[AIArtist] Generating bio, genre, and DOB via AI for: ${artistName}`);

        const prompt = `
        Task: Provide information for the music artist "${artistName}".
        
        Guidelines:
        1. Write a short, professional, engaging biography (2-3 paragraphs, ~150 words). Focus ONLY on their music career.
        2. Provide their Date of Birth (or group formation date) in exactly YYYY-MM-DD format. If unknown, use "UNKNOWN".
        3. Identify their primary music genre (e.g., "Pop", "Hip-Hop", "Rock", "Classical").
        4. Format your response STRICTLY as a valid JSON object with no markdown wrappers, no backticks, and no extra text.
        
        Example exact format:
        {
          "bio": "Bio goes here...",
          "dob": "1990-01-01",
          "genre": "Pop"
        }
        `;

        try {
            const res = await axios.post(
                'https://integrate.api.nvidia.com/v1/chat/completions',
                {
                    model: "meta/llama-3.1-405b-instruct",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.2,
                    max_tokens: 400
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.VERCEL_AI_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            let aiResponse = res.data.choices[0]?.message?.content?.trim();
            if (aiResponse) {
                // Strip markdown formatting if AI hallucinated it
                aiResponse = aiResponse.replace(/^```(json)?/, '').replace(/```$/, '').trim();
                
                try {
                    const parsed = JSON.parse(aiResponse);
                    if (parsed.bio && parsed.bio.length > 50) {
                        result.bio = parsed.bio;
                    }
                    if (parsed.dob && parsed.dob !== "UNKNOWN") {
                        const d = new Date(parsed.dob);
                        if (!isNaN(d.getTime())) {
                            result.dob = d;
                        }
                    }
                    if (parsed.genre && typeof parsed.genre === 'string') {
                        result.genre = parsed.genre;
                    }
                    console.log(`[AIArtist] Successfully enriched profile for ${artistName}`);
                } catch (parseErr) {
                    console.error(`[AIArtist] Failed to parse AI JSON for ${artistName}: ${aiResponse}`);
                }
            }
        } catch (err: any) {
            console.error(`[AIArtist] Bio/DOB generation failed for ${artistName}:`, err.message);
        }

        return result;
    }

    /**
     * AI-based track classification: Decides if a track is from a movie.
     * Returns the normalized movie name, or null if it's a standalone single.
     */
    static async classifyTrack(title: string, artist: string, albumContext?: string, description?: string): Promise<{ isMovie: boolean; movieName: string | null }> {
        if (!this.VERCEL_AI_KEY) {
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
            const customOpenAI = createOpenAI({ apiKey: this.VERCEL_AI_KEY });
            const { text } = await generateText({
                model: customOpenAI('gpt-4o-mini'),
                prompt,
                temperature: 0.1,
                
            });
            let result = text.trim() || "SINGLE";
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


    /**
     * Predicts the genre of a track based on its title and artist.
     */
    static async predictTrackGenre(title: string, artistName: string): Promise<string> {
        if (!this.VERCEL_AI_KEY) {
            console.warn('[AIArtist] VERCEL_AI_KEY missing. Defaulting to Unknown genre.');
            return 'Unknown';
        }

        try {
            const customOpenAI = createOpenAI({ apiKey: this.VERCEL_AI_KEY });
            
            const prompt = `
            Task: Predict the primary music genre for the following track.
            
            Track Title: "${title}"
            Artist: "${artistName}"
            
            Rules:
            1. Respond strictly with a single short genre name (e.g., Pop, Hip-Hop, Rock, Melody, Tamil Folk, Electronic, Classical).
            2. Do not include any explanations, punctuation, or extra words.
            3. If it's completely ambiguous, respond with "Pop" as a safe fallback.
            `;

            const { text } = await generateText({
                model: customOpenAI('gpt-4o-mini'),
                prompt,
                temperature: 0.1,
                
            });

            const predictedGenre = text.trim();
            console.log(`[AIGenre] Predicted '${predictedGenre}' for '${title}' by '${artistName}'`);
            return predictedGenre || 'Unknown';
        } catch (err: any) {
            console.error(`[AIGenre] Genre prediction failed for '${title}':`, err.message);
            return 'Unknown';
        }
    }
}