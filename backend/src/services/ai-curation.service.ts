import { createGateway, generateText } from 'ai';
import { config } from '../config/env';
import { getCacheVal, setCacheVal } from '../utils/cache';

export interface AICurationResult {
  artists: string[];
  trendingSongs: string[];
  newReleases: string[];
  shelves: Array<{
    title: string;
    subtitle: string;
    query: string;
  }>;
}

// Deterministic seed fallback per language in case external AI is unreachable
const DETERMINISTIC_FALLBACKS: Record<string, AICurationResult> = {
  tamil: {
    artists: [
      'Anirudh Ravichander', 'A.R. Rahman', 'Yuvan Shankar Raja', 'Harris Jayaraj',
      'Sid Sriram', 'Santhosh Narayanan', 'Pradeep Kumar', 'Shreya Ghoshal',
      'G.V. Prakash Kumar', 'Sean Roldan', 'D. Imman', 'K.S. Chithra'
    ],
    trendingSongs: [
      'Vaathi Coming', 'Marana Mass', 'Hukum Jailer', 'Badass Leo', 'Arabic Kuthu',
      'Naan Pesa Ninaipathellam', 'Kadavul Padaippil', 'Enna Solla Pogirai', 'Vennilave Vennilave', 'Kannaana Kanney'
    ],
    newReleases: [
      'Ponni Nadhi', 'Chinnanjiru Nilave', 'Dancing Kuthu', 'Naan Yaar',
      'Halena', 'Vada Chennai Penne', 'Matta GOAT', 'Fear Song Devara Tamil'
    ],
    shelves: [
      { title: 'Tamil Melody Magic', subtitle: 'SOULFUL FREQUENCIES', query: 'Tamil romantic melody songs' },
      { title: 'Anirudh High Voltage', subtitle: 'TRENDING KUTHU & BASS', query: 'Anirudh Ravichander hits' },
      { title: 'Kollywood Soundtracks', subtitle: 'CINEMA BLOCKBUSTERS', query: 'Top Tamil movie soundtracks' }
    ]
  },
  hindi: {
    artists: [
      'Arijit Singh', 'Pritam', 'A.R. Rahman', 'Shreya Ghoshal',
      'Sachin-Jigar', 'Vishal-Shekhar', 'Sonu Nigam', 'Atif Aslam',
      'Badshah', 'Jubin Nautiyal', 'Neha Kakkar', 'Armaan Malik'
    ],
    trendingSongs: [
      'Kesariya', 'Apna Bana Le', 'Tum Hi Ho', 'Chaleya', 'Jhoome Jo Pathaan',
      'Tere Hawaale', 'O Bedardeya', 'Raataan Lambiyan', 'Pehle Bhi Main', 'Satranga'
    ],
    newReleases: [
      'Tauba Tauba', 'Soni Soni', 'Aaj Ki Raat', 'Taras',
      'Ve Kamleya', 'Tu Hai Kahan', 'Nain Ta Heere', 'Heeriye'
    ],
    shelves: [
      { title: 'Bollywood Romantic Melodies', subtitle: 'PURE HINDI HITS', query: 'Hindi romantic melodies' },
      { title: 'Arijit Singh Essentials', subtitle: 'HEARTFELT ACOUSTICS', query: 'Arijit Singh best songs' },
      { title: 'Bollywood Party Beats', subtitle: 'HIGH ENERGY', query: 'Top Hindi party dance songs' }
    ]
  },
  telugu: {
    artists: [
      'Devi Sri Prasad', 'Thaman S', 'Sid Sriram', 'Anirudh Ravichander',
      'Ram Miriyala', 'Anurag Kulkarni', 'Mangli', 'Shreya Ghoshal',
      'M.M. Keeravaani', 'S.P. Balasubrahmanyam', 'Chitra', 'Armaan Malik'
    ],
    trendingSongs: [
      'Naatu Naatu', 'Inkem Inkem', 'Samajavaragamana', 'Butta Bomma', 'Saranga Dariya',
      'Oo Antava', 'Kurchi Madathapetti', 'Fear Song Devara Telugu', 'Ayudha Pooja', 'Chuttamalle'
    ],
    newReleases: [
      'Chuttamalle Devara', 'Daavudi Devara', 'Jaragandi Game Changer', 'Pushpa Pushpa',
      'Sooseki Pushpa 2', 'Ta Takkara', 'Hey Rangule', 'Kalyani Vachenbaa'
    ],
    shelves: [
      { title: 'Tollywood Top Chartbusters', subtitle: 'TELUGU MASS & MELODY', query: 'Top Telugu hit songs' },
      { title: 'Sid Sriram Telugu Melodies', subtitle: 'SOUL STIRRING', query: 'Sid Sriram Telugu songs' }
    ]
  },
  malayalam: {
    artists: [
      'Sushin Shyam', 'Hesham Abdul Wahab', 'K.J. Yesudas', 'Job Kurian',
      'Vineeth Sreenivasan', 'Shaan Rahman', 'Gopi Sundar', 'K.S. Chithra'
    ],
    trendingSongs: [
      'Illuminati Aavesham', 'Jaada Aavesham', 'Darshana Hridayam', 'Malare Premam',
      'Cherathukal Kumbalangi', 'Palarivattom', 'Matha Jimbrue', 'Kaantha'
    ],
    newReleases: [
      'Aavesham OST', 'Manjummel Boys Song', 'Kuthanthram', 'Armadham',
      'Oru Chiri Iru Chiri', 'Premalu Song', 'Welcome to Hyderabad', 'Mini Maharani'
    ],
    shelves: [
      { title: 'Mollywood Vibes', subtitle: 'FRESH MALAYALAM GROOVES', query: 'Top Malayalam songs' }
    ]
  },
  english: {
    artists: [
      'The Weeknd', 'Taylor Swift', 'Drake', 'Billie Eilish',
      'Ed Sheeran', 'Dua Lipa', 'Bruno Mars', 'Post Malone',
      'Ariana Grande', 'Coldplay', 'Kendrick Lamar', 'Travis Scott'
    ],
    trendingSongs: [
      'Blinding Lights', 'Cruel Summer', 'Birds of a Feather', 'Die With A Smile',
      'Starboy', 'As It Was', 'Espresso', 'Save Your Tears', 'Not Like Us', 'Greedy'
    ],
    newReleases: [
      'Taste Sabrina Carpenter', 'Good Luck Babe', 'Die With A Smile Lady Gaga',
      'Please Please Please', 'Timeless Playboi Carti The Weeknd', 'Dancing in the Flames'
    ],
    shelves: [
      { title: 'Global Pop Powerhouse', subtitle: 'BILLBOARD HOT 100', query: 'Top global English pop hits' }
    ]
  }
};

export class AICurationService {
  /**
   * Generates or fetches personalized shelf and artist curation using Vercel AI Gateway
   * with strict adherence to the specified language.
   */
  static async getCuration(params: {
    language: string;
    country?: string;
    genres?: string[];
    favoriteArtists?: string[];
  }): Promise<AICurationResult> {
    const rawLang = (params.language || 'Tamil').trim();
    const langNorm = rawLang.toLowerCase();
    const country = (params.country || 'India').trim();
    const genres = (params.genres && params.genres.length > 0) ? params.genres : ['Pop', 'Film Music', 'Melody'];
    const favoriteArtists = (params.favoriteArtists && params.favoriteArtists.length > 0) ? params.favoriteArtists : [];

    const cacheKey = `ai_curation:v2:${langNorm}:${country.toLowerCase()}:${genres.slice().sort().join('_').toLowerCase()}`;
    const cached = await getCacheVal(cacheKey);
    if (cached) {
      return cached as AICurationResult;
    }

    const fallback = DETERMINISTIC_FALLBACKS[langNorm] || DETERMINISTIC_FALLBACKS['tamil'];

    // If Vercel AI Key is available, invoke AI for bespoke high-fidelity discovery
    const apiKey = config.VERCEL_AI_KEY || process.env.VERCEL_AI_KEY_2 || process.env.AI_GATEWAY_API_KEY;
    if (apiKey) {
      try {
        const gateway = createGateway({ apiKey });
        const model = gateway('openai/gpt-4o-mini');

        const prompt = `You are the lead music curator for Zenify streaming platform.
Generate a JSON curation object for user music recommendations with ABSOLUTE STRICT language fidelity.
Target Language: ${rawLang}
Territory / Country: ${country}
Preferred Genres: ${genres.join(', ')}
${favoriteArtists.length > 0 ? `User's Favorite Artists: ${favoriteArtists.join(', ')}` : ''}

NON-NEGOTIABLE RULES:
1. Every single artist and song title MUST strictly belong to the ${rawLang} music industry/language.
2. ABSOLUTELY DO NOT mix songs or artists from other languages (e.g. if ${rawLang} is selected, do NOT output Hindi, Telugu, or English artists unless explicitly requested).
3. Return ONLY a valid JSON object without markdown fences, conforming to this exact structure:
{
  "artists": ["Artist 1", "Artist 2", "Artist 3", "Artist 4", "Artist 5", "Artist 6", "Artist 7", "Artist 8"],
  "trendingSongs": ["Song 1", "Song 2", "Song 3", "Song 4", "Song 5", "Song 6", "Song 7", "Song 8", "Song 9", "Song 10"],
  "newReleases": ["Song 1", "Song 2", "Song 3", "Song 4", "Song 5", "Song 6", "Song 7", "Song 8"],
  "shelves": [
    { "title": "${rawLang} Melodies", "subtitle": "SOULFUL CLASSICS", "query": "${rawLang} romantic melodies" },
    { "title": "${rawLang} Party & Beats", "subtitle": "HIGH ENERGY", "query": "${rawLang} dance party hits" }
  ]
}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const { text } = await generateText({
          model,
          prompt,
          abortSignal: controller.signal
        });
        clearTimeout(timeoutId);

        const cleanJson = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);

        if (Array.isArray(parsed.artists) && parsed.artists.length > 0) {
          const curated: AICurationResult = {
            artists: parsed.artists.slice(0, 12),
            trendingSongs: Array.isArray(parsed.trendingSongs) ? parsed.trendingSongs.slice(0, 15) : fallback.trendingSongs,
            newReleases: Array.isArray(parsed.newReleases) ? parsed.newReleases.slice(0, 12) : fallback.newReleases,
            shelves: Array.isArray(parsed.shelves) && parsed.shelves.length > 0 ? parsed.shelves : fallback.shelves
          };

          // Cache for 24 hours (86400s)
          await setCacheVal(cacheKey, curated, 86400);
          console.log(`[AICuration] Successfully curated ${curated.artists.length} artists & shelves for ${rawLang} via Vercel AI.`);
          return curated;
        }
      } catch (err: any) {
        console.warn(`[AICuration] Vercel AI curation failed for ${rawLang} (${err.message}). Trying NVIDIA NIM fallback...`);
      }
    }

    // Tier 2: NVIDIA NIM Fallback using fast bolt-e4b model
    const nvidiaKey = config.NVIDIA_API_KEY || process.env.NVIDIA_API_KEY;
    if (nvidiaKey) {
      try {
        const { default: axios } = await import('axios');
        const prompt = `You are the lead music curator for Zenify streaming platform.
Generate a JSON curation object for user music recommendations with ABSOLUTE STRICT language fidelity.
Target Language: ${rawLang}
Territory / Country: ${country}
Preferred Genres: ${genres.join(', ')}

NON-NEGOTIABLE RULES:
1. Every single artist and song title MUST strictly belong to the ${rawLang} music industry/language.
2. ABSOLUTELY DO NOT mix songs or artists from other languages.
3. Return ONLY a valid JSON object conforming to this exact structure:
{
  "artists": ["Artist 1", "Artist 2", "Artist 3", "Artist 4", "Artist 5", "Artist 6"],
  "trendingSongs": ["Song 1", "Song 2", "Song 3", "Song 4", "Song 5"],
  "newReleases": ["Song 1", "Song 2", "Song 3", "Song 4"],
  "shelves": [
    { "title": "${rawLang} Hits", "subtitle": "FEATURED SELECTION", "query": "${rawLang} hits" }
  ]
}`;

        const nRes = await axios.post(
          'https://integrate.api.nvidia.com/v1/chat/completions',
          {
            model: 'nvidia/nemotron-3.5-bolt-e4b',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: 450
          },
          {
            headers: {
              'Authorization': `Bearer ${nvidiaKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 8000
          }
        );

        const rawContent = nRes.data?.choices?.[0]?.message?.content || '';
        const cleanJson = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);

        if (Array.isArray(parsed.artists) && parsed.artists.length > 0) {
          const curated: AICurationResult = {
            artists: parsed.artists.slice(0, 12),
            trendingSongs: Array.isArray(parsed.trendingSongs) ? parsed.trendingSongs.slice(0, 15) : fallback.trendingSongs,
            newReleases: Array.isArray(parsed.newReleases) ? parsed.newReleases.slice(0, 12) : fallback.newReleases,
            shelves: Array.isArray(parsed.shelves) && parsed.shelves.length > 0 ? parsed.shelves : fallback.shelves
          };

          await setCacheVal(cacheKey, curated, 86400);
          console.log(`[AICuration] Successfully curated ${curated.artists.length} artists for ${rawLang} via NVIDIA NIM.`);
          return curated;
        }
      } catch (nErr: any) {
        console.warn(`[AICuration] NVIDIA NIM curation failed for ${rawLang} (${nErr.message}). Using high-fidelity deterministic fallback.`);
      }
    }

    // Cache deterministic fallback for 6 hours
    await setCacheVal(cacheKey, fallback, 21600);
    return fallback;
  }
}
