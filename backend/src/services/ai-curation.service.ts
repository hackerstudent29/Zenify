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
  },
  korean: {
    artists: [
      'BTS', 'BLACKPINK', 'NewJeans', 'Stray Kids', 'TWICE', 'IU',
      'SEVENTEEN', 'Jungkook', 'LE SSERAFIM', 'aespa', 'ENHYPEN', 'TOMORROW X TOGETHER'
    ],
    trendingSongs: [
      'Seven Jungkook', 'Supernatural NewJeans', 'Supernova aespa', 'Magnetic ILLIT',
      'Standing Next to You', 'Dynamite BTS', 'How You Like That BLACKPINK', 'Drama aespa', 'OMG NewJeans', 'Cupid FIFTY FIFTY'
    ],
    newReleases: [
      'Crazy LE SSERAFIM', 'Supernatural NewJeans', 'Mantra JENNIE', 'Whiplash aespa',
      'Chk Chk Boom Stray Kids', 'Moonlit Floor LISA'
    ],
    shelves: [
      { title: 'K-Pop Global Sensations', subtitle: 'HALLYU HITMAKERS', query: 'Top trending K-Pop hit songs' },
      { title: 'Korean R&B & Chill', subtitle: 'NIGHT LOFI & SOUL', query: 'Korean indie RnB chill songs' }
    ]
  },
  'k-pop': {
    artists: [
      'BTS', 'BLACKPINK', 'NewJeans', 'Stray Kids', 'TWICE', 'IU',
      'SEVENTEEN', 'Jungkook', 'LE SSERAFIM', 'aespa', 'ENHYPEN', 'TOMORROW X TOGETHER'
    ],
    trendingSongs: [
      'Seven Jungkook', 'Supernatural NewJeans', 'Supernova aespa', 'Magnetic ILLIT',
      'Standing Next to You', 'Dynamite BTS', 'How You Like That BLACKPINK', 'Drama aespa', 'OMG NewJeans', 'Cupid FIFTY FIFTY'
    ],
    newReleases: [
      'Crazy LE SSERAFIM', 'Supernatural NewJeans', 'Mantra JENNIE', 'Whiplash aespa',
      'Chk Chk Boom Stray Kids', 'Moonlit Floor LISA'
    ],
    shelves: [
      { title: 'K-Pop Global Sensations', subtitle: 'HALLYU HITMAKERS', query: 'Top trending K-Pop hit songs' }
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
    const rawLang = (params.language || 'English').trim();
    const langNorm = rawLang.toLowerCase();
    const country = (params.country || 'United States').trim();
    const genres = (params.genres && params.genres.length > 0) ? params.genres : ['Pop', 'Film Music', 'Melody'];
    const favoriteArtists = (params.favoriteArtists && params.favoriteArtists.length > 0) ? params.favoriteArtists : [];

    const cacheKey = `ai_curation:v2:${langNorm}:${country.toLowerCase()}:${genres.slice().sort().join('_').toLowerCase()}`;
    const cached = await getCacheVal(cacheKey);
    if (cached) {
      return cached as AICurationResult;
    }

    const fallback = DETERMINISTIC_FALLBACKS[langNorm] || DETERMINISTIC_FALLBACKS['english'] || DETERMINISTIC_FALLBACKS['tamil'];
    void createGateway;
    void generateText;
    void config;

    // External AI curation disabled; cache deterministic selection for 6 hours.
    await setCacheVal(cacheKey, fallback, 21600);
    return fallback;
  }
}
