import * as React from "react"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
 return twMerge(clsx(inputs))
}

export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes || isNaN(bytes) || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function calculateCompressedCloudSize(durationSec: number): number {
  if (!durationSec || durationSec <= 0) return 0;
  // High-fidelity 128kbps AAC/MP3 audio payload = 16 KB/sec
  return Math.round(durationSec * 16 * 1024);
}

export function getApiBaseUrl() {
  // In local dev, use the Vite proxy path (/api) so requests go through the
  // dev server proxy (vite.config.ts: /api → http://localhost:3000).
  // This avoids CORS issues and works even when the backend port differs.
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return '/api';
  }
 let envUrl = '';
 try {
 envUrl = (import.meta.env?.VITE_API_URL || import.meta.env?.NEXT_PUBLIC_API_URL || '') as string;
 } catch {}
 if (!envUrl && typeof process !== 'undefined' && process.env) {
 envUrl = (process.env.VITE_API_URL || process.env.NEXT_PUBLIC_API_URL || '') as string;
 }
 let rawUrl = envUrl || 'https://zenify-78e257420386.herokuapp.com/api';
 if (rawUrl.includes('railway.app') || rawUrl.includes('zenify-production')) {
 rawUrl = 'https://zenify-78e257420386.herokuapp.com/api';
 }
 // If it's a relative path (proxy mode), keep it as-is
 if (rawUrl.startsWith('/')) {
   return rawUrl;
 }
 if (rawUrl && !rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
 rawUrl = `https://${rawUrl}`;
 }
 return rawUrl;
}

let jioSaavnCorsPassed: boolean | null = null;

export function getJioSaavnCorsStatus(): boolean | null {
  return jioSaavnCorsPassed;
}

export async function testJioSaavnCorsStartup(): Promise<boolean> {
  if (typeof window === 'undefined') return true;
  if (jioSaavnCorsPassed !== null) return jioSaavnCorsPassed;

  try {
    const testUrl = 'https://aac.saavncdn.com/312/9faaf9ef4a0f3596b15adfbf3b9cc273_160.mp4';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(testUrl, {
      method: 'HEAD',
      mode: 'cors',
      signal: controller.signal
    });
    clearTimeout(timer);

    jioSaavnCorsPassed = res.ok || res.status === 206 || res.status === 200;
    console.log('[Startup] JioSaavn CDN CORS test:', jioSaavnCorsPassed ? 'PASSED (Direct Streaming)' : 'FAILED (Proxy Streaming)');
    return jioSaavnCorsPassed;
  } catch (err: any) {
    console.warn('[Startup] JioSaavn CDN CORS test notice (' + err.message + '). Enabling direct streaming.');
    jioSaavnCorsPassed = true;
    return true;
  }
}

if (typeof window !== 'undefined') {
  testJioSaavnCorsStartup().catch(() => {});
}

export function getMediaUrl(
  path?: string | null, 
  type?: 'image' | 'audio',
  trackContext?: { id?: string; title?: string; artist?: string; album?: string; language?: string }
): string | undefined {
  if (!path || typeof path !== 'string') return undefined;
  let trimmedPath = path.trim();
  if (!trimmedPath || trimmedPath === '/' || trimmedPath === '#' || trimmedPath === 'undefined' || trimmedPath === 'null') {
    return type === 'image' ? '/logo.png' : undefined;
  }

  const API_BASE = getApiBaseUrl();
  const BASE_ORIGIN = API_BASE.replace(/\/api$/, '');

  // Strip Vercel domain if an API endpoint was incorrectly resolved relative to window.location (Vercel has no backend!)
  if (trimmedPath.includes('listenzenify.vercel.app')) {
    trimmedPath = trimmedPath.replace(/https?:\/\/listenzenify\.vercel\.app/, BASE_ORIGIN);
  } else if (trimmedPath.includes('localhost:3000') && !API_BASE.includes('localhost')) {
    trimmedPath = trimmedPath.replace(/http:\/\/localhost:3000/, BASE_ORIGIN);
  }

  // Blob & Data URLs — use directly
  if (trimmedPath.startsWith('blob:') || trimmedPath.startsWith('data:')) {
    return trimmedPath;
  }

  // Local static assets — use directly
  if (trimmedPath === '/logo.png' || trimmedPath === 'logo.png' || trimmedPath.endsWith('/logo.png')) {
    return '/logo.png';
  }

  // Already-proxied or API backend URLs — ensure correct BASE_ORIGIN and return directly
  if (trimmedPath.includes('/proxy-audio') || trimmedPath.includes('/stream-youtube') || trimmedPath.includes('/proxy-image') || trimmedPath.includes('/tracks/stream')) {
    let finalUrl = trimmedPath;
    if (!trimmedPath.startsWith('http://') && !trimmedPath.startsWith('https://')) {
      const cleanRelative = trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`;
      finalUrl = `${BASE_ORIGIN}${cleanRelative}`;
    }
    if (trackContext && finalUrl.includes('/stream-youtube')) {
      try {
        const u = new URL(finalUrl);
        if (!u.searchParams.has('trackId') && trackContext.id) u.searchParams.set('trackId', trackContext.id);
        if (!u.searchParams.has('title') && trackContext.title) u.searchParams.set('title', trackContext.title);
        if (!u.searchParams.has('artist') && trackContext.artist) u.searchParams.set('artist', trackContext.artist);
        if (!u.searchParams.has('album') && trackContext.album) u.searchParams.set('album', trackContext.album);
        if (!u.searchParams.has('language') && trackContext.language) u.searchParams.set('language', trackContext.language);
        finalUrl = u.toString();
      } catch {}
    }
    return finalUrl;
  }

  // Direct uploaded files
  if (trimmedPath.startsWith('/uploads/') || trimmedPath.startsWith('uploads/')) {
    const cleanRelative = trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`;
    return `${BASE_ORIGIN}${cleanRelative}`;
  }

  // Audio: Search queries (no protocol, no slash, no audio extension) route directly to stream-youtube
  if (type === 'audio' && !trimmedPath.startsWith('http') && !trimmedPath.startsWith('/') && !trimmedPath.match(/\.(mp3|m4a|wav|aac|ogg|flac|webm)(\?.*)?$/i)) {
    const params = new URLSearchParams({ url: trimmedPath });
    if (trackContext?.id) params.set('trackId', trackContext.id);
    if (trackContext?.title) params.set('title', trackContext.title);
    if (trackContext?.artist) params.set('artist', trackContext.artist);
    if (trackContext?.album) params.set('album', trackContext.album);
    if (trackContext?.language) params.set('language', trackContext.language);
    return `${API_BASE}/utils/stream-youtube?${params.toString()}`;
  }

  // Direct iTunes/Apple Music custom schemes
  if (trimmedPath.startsWith('itunes:')) {
    return `${API_BASE}/utils/stream-youtube?url=${encodeURIComponent(trimmedPath)}`;
  }

  // External URLs (http/https)
  if (trimmedPath.startsWith('http://') || trimmedPath.startsWith('https://')) {
    const isMediaPage = trimmedPath.includes('music.apple.com') || 
                        trimmedPath.includes('spotify.com') || 
                        trimmedPath.includes('youtube.com') || 
                        trimmedPath.includes('youtu.be') ||
                        trimmedPath.includes('music.youtube.com');

    // YouTube URLs stream through stream-youtube
    if (trimmedPath.includes('youtube.com') || trimmedPath.includes('youtu.be')) {
      const params = new URLSearchParams({ url: trimmedPath });
      if (trackContext?.id) params.set('trackId', trackContext.id);
      if (trackContext?.title) params.set('title', trackContext.title);
      if (trackContext?.artist) params.set('artist', trackContext.artist);
      if (trackContext?.album) params.set('album', trackContext.album);
      if (trackContext?.language) params.set('language', trackContext.language);
      return `${API_BASE}/utils/stream-youtube?${params.toString()}`;
    }

    // Strict ban on 30s preview URLs: reroute directly to full audio streaming
    if (type === 'audio' && (trimmedPath.includes('audio-ssl') || trimmedPath.includes('mzstatic.com') || trimmedPath.includes('itunes.apple.com'))) {
      const query = `${trackContext?.artist || ''} - ${trackContext?.title || ''}`.trim() || trimmedPath;
      const params = new URLSearchParams({ url: query });
      if (trackContext?.id) params.set('trackId', trackContext.id);
      if (trackContext?.title) params.set('title', trackContext.title);
      if (trackContext?.artist) params.set('artist', trackContext.artist);
      if (trackContext?.album) params.set('album', trackContext.album);
      if (trackContext?.language) params.set('language', trackContext.language);
      return `${API_BASE}/utils/stream-youtube?${params.toString()}`;
    }

    // Direct CDN audio streams with CORS support (JioSaavn Akamai, Cloudinary, Supabase, R2)
    if (trimmedPath.includes('saavncdn.com') || trimmedPath.includes('jiosaavn.com') ||
        trimmedPath.includes('r2.dev') || trimmedPath.includes('res.cloudinary.com') ||
        trimmedPath.includes('supabase.co')) {
      return trimmedPath;
    }

    if (type === 'audio') {
      return `${API_BASE}/utils/proxy-audio?url=${encodeURIComponent(trimmedPath)}`;
    }

    // Skip proxy for trusted image CDNs
    if (!isMediaPage && (
      trimmedPath.includes('unsplash.com') || 
      trimmedPath.includes('ui-avatars.com') || 
      trimmedPath.includes('res.cloudinary.com') ||
      trimmedPath.includes('scdn.co') ||
      trimmedPath.includes('dzcdn.net') ||
      trimmedPath.includes('gettyimages.com') ||
      trimmedPath.includes('r2.dev') ||
      trimmedPath.includes('cloudflarestorage.com') ||
      trimmedPath.includes('mzstatic.com') || 
      trimmedPath.includes('saavncdn.com') ||
      trimmedPath.includes('jiosaavn.com') ||
      (trimmedPath.includes('apple.com') && !trimmedPath.includes('music.apple.com'))
    )) {
      return trimmedPath;
    }

    // Automatic salvage of Bing/Google Image search links!
    if (trimmedPath.includes('bing.com/images/search') || trimmedPath.includes('google.com/search') || trimmedPath.includes('google.co.')) {
      try {
        const urlObj = new URL(trimmedPath);
        const extractedUrl = urlObj.searchParams.get('mediaurl') || urlObj.searchParams.get('imgurl') || urlObj.searchParams.get('imgres');
        if (extractedUrl) {
          return `${API_BASE}/utils/proxy-image?url=${encodeURIComponent(extractedUrl)}`;
        }
      } catch (e) {}
    }

    const IMG_EXTS = /\.(jpg|jpeg|png|webp|gif|avif)(\?.*)?$/i;
    const isImageUrl = type === 'image' || IMG_EXTS.test(trimmedPath) || isMediaPage;
    if (isImageUrl) {
      return `${API_BASE}/utils/proxy-image?url=${encodeURIComponent(trimmedPath)}`;
    }

    return trimmedPath;
  }

  // Relative paths — prepend API base origin
  const normalizedPath = trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`;
  if (normalizedPath === '/' || normalizedPath === '') {
    return type === 'image' ? '/logo.png' : undefined;
  }
  if (type === 'audio' && !normalizedPath.match(/\.(mp3|m4a|wav|aac|ogg|flac|webm)/i)) {
    return undefined;
  }
  return encodeURI(`${BASE_ORIGIN}${normalizedPath}`);
}

/**
 * Universal helper to get the best possible cover image for a track.
 * Priority: 
 * 1. track.coverUrl
 * 2. track.album.coverUrl
 * 3. track.artist.imageUrl
 * 4. Default Logo
 */
export function getTrackCover(track: any): string {
  if (!track) return "/logo.png";
  
  // Priority: track.coverUrl -> track.imageUrl -> album.coverUrl -> Default Logo
  // STRICT ARCHITECTURAL RULE: NEVER fall back to track.artist?.imageUrl or artist?.coverUrl
  // because that replaces song/album artwork with artist facial headshots.
  const cover = (track.coverUrl && track.coverUrl.trim().length > 0 && !track.coverUrl.includes("/logo.png")) ? track.coverUrl :
    (track.imageUrl && track.imageUrl.trim().length > 0 && !track.imageUrl.includes("/logo.png")) ? track.imageUrl :
    (track.album?.coverUrl && track.album.coverUrl.trim().length > 0 && !track.album.coverUrl.includes("/logo.png")) ? track.album.coverUrl :
    null;
  
  return getMediaUrl(cover, 'image') || "/logo.png";
}

// Universal High-Resolution Unmasked Artist Visuals Dictionary (JioSaavn CDN & Deezer 1000x1000)
// STRICT ARCHITECTURAL RULE: Never use Apple Music circular arch masks (cw.png, _cropped.png)
export const CANONICAL_APPLE_ARTISTS: Record<string, string> = {
  "arrahman": "https://c.saavncdn.com/artists/AR_Rahman_002_20210120084455_500x500.jpg",
  "rahman": "https://c.saavncdn.com/artists/AR_Rahman_002_20210120084455_500x500.jpg",
  "arr": "https://c.saavncdn.com/artists/AR_Rahman_002_20210120084455_500x500.jpg",
  "anirudhravichander": "https://c.saavncdn.com/artists/Anirudh_Ravichander_003_20260121134149_500x500.jpg",
  "anirudh": "https://c.saavncdn.com/artists/Anirudh_Ravichander_003_20260121134149_500x500.jpg",
  "hiphoptamizha": "https://c.saavncdn.com/artists/Hiphop_Tamizha_002_20230315131424_500x500.jpg",
  "hiphoptamizhaaadhi": "https://c.saavncdn.com/artists/Hiphop_Tamizha_002_20230315131424_500x500.jpg",
  "hiphopaadhi": "https://c.saavncdn.com/artists/Hiphop_Tamizha_002_20230315131424_500x500.jpg",
  "aadhi": "https://c.saavncdn.com/artists/Hiphop_Tamizha_002_20230315131424_500x500.jpg",
  "gvprakashkumar": "https://c.saavncdn.com/artists/G_V__Prakash_Kumar_003_20251113063655_500x500.jpg",
  "gvprakash": "https://c.saavncdn.com/artists/G_V__Prakash_Kumar_003_20251113063655_500x500.jpg",
  "gvp": "https://c.saavncdn.com/artists/G_V__Prakash_Kumar_003_20251113063655_500x500.jpg",
  "thamans": "https://c.saavncdn.com/artists/Thaman_S__007_20231106094011_500x500.jpg",
  "thaman": "https://c.saavncdn.com/artists/Thaman_S__007_20231106094011_500x500.jpg",
  "sthaman": "https://c.saavncdn.com/artists/Thaman_S__007_20231106094011_500x500.jpg",
  "santhoshnarayanan": "https://c.saavncdn.com/artists/Santhosh_Narayanan_002_20250527101718_500x500.jpg",
  "santhosh": "https://c.saavncdn.com/artists/Santhosh_Narayanan_002_20250527101718_500x500.jpg",
  "sana": "https://c.saavncdn.com/artists/Santhosh_Narayanan_002_20250527101718_500x500.jpg",
  "sidsriram": "https://cdn-images.dzcdn.net/images/artist/fbe3e1d17fc6958e047f011f74233f82/1000x1000-000000-80-0-0.jpg",
  "yuvanshankarraja": "https://cdn-images.dzcdn.net/images/artist/1dbf7d81a2e964d9c707e53478407974/1000x1000-000000-80-0-0.jpg",
  "yuvan": "https://cdn-images.dzcdn.net/images/artist/1dbf7d81a2e964d9c707e53478407974/1000x1000-000000-80-0-0.jpg",
  "u1": "https://cdn-images.dzcdn.net/images/artist/1dbf7d81a2e964d9c707e53478407974/1000x1000-000000-80-0-0.jpg",
  "harrisjayaraj": "https://c.saavncdn.com/artists/Harris_Jayaraj_002_20230718071330_500x500.jpg",
  "harris": "https://c.saavncdn.com/artists/Harris_Jayaraj_002_20230718071330_500x500.jpg",
  "dimman": "https://is1-ssl.mzstatic.com/image/thumb/Music123/v4/31/09/b2/3109b228-528d-c03c-e305-7987f515d667/886443574151.jpg/600x600bb.jpg",
  "imman": "https://is1-ssl.mzstatic.com/image/thumb/Music123/v4/31/09/b2/3109b228-528d-c03c-e305-7987f515d667/886443574151.jpg/600x600bb.jpg",
  "samcs": "https://is1-ssl.mzstatic.com/image/thumb/Features124/v4/51/3b/b8/513bb8d5-f934-0da8-9650-be89a3a3c37f/mza_3068448473619100532.png/600x600bb.jpg",
  "ilaiyaraaja": "https://c.saavncdn.com/artists/Ilaiyaraaja_001_20251020081419_500x500.jpg",
  "ilayaraja": "https://c.saavncdn.com/artists/Ilaiyaraaja_001_20251020081419_500x500.jpg",
  "seanroldan": "https://c.saavncdn.com/artists/Sean_Roldan_000_20220601072935_500x500.jpg",
  "ghibran": "https://is1-ssl.mzstatic.com/image/thumb/Features125/v4/80/3a/b8/803ab878-4d72-5183-fa15-e0b1ad2c4288/pr_source.png/600x600bb.jpg",
  "saiabhyankkar": "https://c.saavncdn.com/artists/Sai_Abhyankkar_003_20250707122433_500x500.jpg",
  "deva": "https://is1-ssl.mzstatic.com/image/thumb/Music128/v4/71/61/2d/71612d86-487b-2f1f-8414-b8a3ed8b53eb/191773236113.jpg/600x600bb.jpg",
  "devisriprasad": "https://c.saavncdn.com/artists/Devi_Sri_Prasad_008_20250619062824_500x500.jpg",
  "dsp": "https://c.saavncdn.com/artists/Devi_Sri_Prasad_008_20250619062824_500x500.jpg",
  "sushinshyam": "https://c.saavncdn.com/artists/Sushin_Shyam_002_20250707125538_500x500.jpg",
  "sushin": "https://c.saavncdn.com/artists/Sushin_Shyam_002_20250707125538_500x500.jpg",
  "justinbieber": "https://c.saavncdn.com/artists/Justin_Bieber_005_20201127112218_500x500.jpg",
  "theweeknd": "https://c.saavncdn.com/artists/The_Weeknd_002_20241003071400_500x500.jpg",
  "thekidlaroi": "https://cdn-images.dzcdn.net/images/artist/ced3d1693e8b8add20a9e40bd01eeb2e/1000x1000-000000-80-0-0.jpg",
  "taylorswift": "https://cdn-images.dzcdn.net/images/artist/cc2495870fe1a792ad0cdb05501ad5ec/1000x1000-000000-80-0-0.jpg",
  "edsheeran": "https://is1-ssl.mzstatic.com/image/thumb/Features125/v4/13/c5/40/13c54093-b9dc-0677-fc9e-a86dca50a977/mza_12702714472282215835.png/600x600bb.jpg",
  "billieeilish": "https://cdn-images.dzcdn.net/images/artist/8eab1a9a644889aabaca1e193e05f984/1000x1000-000000-80-0-0.jpg",
  "arianagrande": "https://cdn-images.dzcdn.net/images/artist/721d8fab84b315502de422b8d0901509/1000x1000-000000-80-0-0.jpg",
  "drake": "https://is1-ssl.mzstatic.com/image/thumb/Features115/v4/64/0d/17/640d1706-e78b-07b4-3fa0-bfb9c46ce1eb/mza_10332306733333333333.png/600x600bb.jpg",
  "lilnasx": "https://cdn-images.dzcdn.net/images/artist/1ca412353f85efec0825c88cc1a5f24c/1000x1000-000000-80-0-0.jpg",
  "elliegoulding": "https://cdn-images.dzcdn.net/images/artist/e3611824a11b28e07bc5a363c629dcb4/1000x1000-000000-80-0-0.jpg"
};

/**
 * Universal helper to get the best possible profile picture for an artist.
 * Strictly uses official Apple Music artist portraits (mzstatic.com).
 * STRICTLY BANNED: Falling back to song covers (e.g. Golden Sparrow) or concert photos.
 */
export function getArtistProfileImage(artist: any, fallbackSongCover?: string | null): string {
  if (!artist) return "/logo.png";

  const name = typeof artist === "string" ? artist : (artist.name || "");
  const normKey = name.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Priority 1: Match canonical Apple Music official portrait
  if (normKey && CANONICAL_APPLE_ARTISTS[normKey]) {
    return CANONICAL_APPLE_ARTISTS[normKey];
  }

  const rawImage = typeof artist === "string" ? artist : artist.imageUrl;
  const isJunkOrSongCover = rawImage && (
    rawImage.includes('/albums/') ||
    rawImage.includes('cover.jpg') ||
    rawImage.includes('Cover.jpg') ||
    rawImage.includes('Golden_Sparrow') ||
    rawImage.includes('golden-sparrow') ||
    rawImage.includes('mza_16722262254049312592') ||
    rawImage.includes('150x150') ||
    rawImage.includes('50x50')
  );

  const hasValidImage = rawImage && 
    typeof rawImage === "string" && 
    rawImage.trim().length > 0 && 
    !rawImage.includes("placeholder") && 
    !rawImage.includes("ui-avatars.com") &&
    !rawImage.includes("default_avatar") &&
    !rawImage.includes("share-image") &&
    !rawImage.includes("artist-default") &&
    !rawImage.includes("_i/") &&
    !isJunkOrSongCover;

  // Priority 2: Use provided image if it is an official Apple Music visual or valid portrait
  if (hasValidImage) {
    return getMediaUrl(rawImage, "image");
  }

  // Priority 3: Fall back to clean avatar logo (NEVER song covers)
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "Artist")}&background=18181b&color=e11d48&size=512`;
}

export function cleanTitle(title?: string | null): string {
 return formatDisplayTitle(title);
}

/**
 * Universal Text Normalization Engine
 * Follows strict rules:
 * 1) Removes brackets and their contents () [] {}
 * 2) Trims whitespace
 * 3) Converts to lowercase
 * 4 & 5) Applies Title Case appropriately (Capitalizes first letter of every word)
 * 6) Preserves numbers and unique chars
 */
/**
 * Universal Text Normalization Engine
 * Strictly follows the Zenify formatting protocol.
 */
export function decodeHtmlEntities(input?: string | null): string {
  if (!input) return "";
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function formatDisplayTitle(input?: string | null): string {
 if (!input) return "";

 // 1. Identify and preserve bracketed content containing version/credit keywords.
 // e.g. (feat. artist), (Sped Up), [Instrumental], (Remix), (Lofi Flip)
 let text = decodeHtmlEntities(input);
 const bracketRegex = /([\(\[\{][^\)\]\}]*[\)\]\}])/g;
 
 const keepKeywords = [
 'feat', 'featuring', 'sped', 'slow', 'reverb', 
 'instrumental', 'acapella', 'remix', 'flip', 'prod', 
 'version', 'mix', 'live', 'acoustic', 'cover', 'edit',
 'original', 'extended', 'radio', 'slowed',
 'lofi', 'lo-fi', 're-imagined', 'reimagined', 'remaster', 'remastered',
 'deluxe', 're-recorded', 'rerecorded', 're-imagine', 'reimagine',
 'mashup', 'bootleg', 'nightcore', 'vip', 'club', 'dub', 'bass',
  'tamil', 'telugu', 'hindi', 'kannada', 'malayalam', 'punjabi', 'bengali', 'marathi', 'gujarati', 'english', 'japanese', 'korean', 'mandarin', 'spanish',
  'part', 'chapter', 'pt', 'vol', 'volume', 'season', 'ost', 'soundtrack', 'theme', 'score'
 ];
 
 // Replace brackets that do NOT contain keep keywords with empty string
 text = text.replace(bracketRegex, (match) => {
 const lowerMatch = match.toLowerCase();
 const shouldKeep = keepKeywords.some(keyword => lowerMatch.includes(keyword));
 return shouldKeep ? match : '';
 });

 // 2. Strip bare noise words/phrases outside of brackets.
 // These are common YouTube/SoundCloud suffix patterns that don't add value.
 // We only remove them if they appear as standalone words/phrases (not part of the actual song name).
 const noisePhrases = [
 /\bvideo\s+song\b/gi,
 /\bofficial\s+video\b/gi,
 /\bofficial\s+audio\b/gi,
 /\bofficial\s+music\s+video\b/gi,
 /\bofficial\s+lyric\s+video\b/gi,
 /\bofficial\s+hd\s+video\b/gi,
 /\blyric\s+video\b/gi,
 /\bfull\s+video\b/gi,
 /\bfull\s+song\b/gi,
 /\bhd\s+video\b/gi,
 /\b4k\s+video\b/gi,
 /\bofficial\b/gi,
 /\blyrics?\b(?!\s*version)/gi, // "Lyrics" but not "Lyrics Version"
 /\bvisualizer\b/gi,
 /\baudio\s+visualizer\b/gi,
 /\bpromo\b/gi,
 /\bsingle\b(?!\s+mix)/gi, // "Single" but not "Single Mix"
 /\bteaser\b/gi,
 /\btrailer\b/gi,
 /\b(?:hd|hq|4k|8k|1080p|720p)\b/gi,
 ];

 for (const pattern of noisePhrases) {
 text = text.replace(pattern, '');
 }

 // Remove leftover separator characters at the end: | - ,
 text = text.replace(/[\|\-–—,]+\s*$/, '').trim();

 // Remove double spaces left over by deletions
 text = text.replace(/\s+/g, ' ').trim();

 // 3. Case normalization: Convert entire text to lowercase first
 text = text.toLowerCase();

 // 4. Capitalization: Capitalize strings and handle brackets properly
 text = text.trim()
 .split(' ')
 .filter(word => word.length > 0)
 .map(word => {
 // Handle capitalization inside brackets e.g. (feat. -> (Feat.
 if (word.startsWith('(') || word.startsWith('[') || word.startsWith('{')) {
 if (word.length > 1) {
 return word.charAt(0) + word.charAt(1).toUpperCase() + word.slice(2);
 }
 return word;
 }
 return word.charAt(0).toUpperCase() + word.slice(1);
 })
 .join(' ');

  return text || (input ? input.trim() : String());
}

export const PROTECTED_ARTISTS = [
  "simon & garfunkel",
  "simon and garfunkel",
  "crosby, stills, nash & young",
  "crosby, stills, nash and young",
  "brooks & dunn",
  "brooks and dunn",
  "hall & oates",
  "hall and oates",
  "earth, wind & fire",
  "earth, wind and fire",
  "kool & the gang",
  "kool and the gang",
  "florence + the machine",
  "florence and the machine",
  "mumford & sons",
  "mumford and sons",
  "iron & wine",
  "iron and wine",
  "raghu dixit project",
  "the local train"
];

export const HONORIFIC_TITLES = [
  "thenisai thendral",
  "isaignani",
  "isai gnani",
  "isai puyal",
  "isaipuyal",
  "padmashri",
  "padma shri",
  "padmabhushan",
  "padma bhushan",
  "padmavibhushan",
  "padma vibhushan",
  "maestro",
  "kavignar",
  "makkal thilagam",
  "nadigar thilagam",
  "puratchi thalaivar",
  "puratchi thalaivi",
  "captain",
  "dr.",
  "dr",
  "sir"
];

export function stripHonorifics(name: string): string {
  if (!name) return "";
  let clean = name.trim();
  for (const h of HONORIFIC_TITLES) {
    const escaped = h.replace(/[.*+?^\$\{\}()|[\]\\]/g, '\\$&');
    const reg = new RegExp('^' + escaped + '\\s+', 'i');
    clean = clean.replace(reg, '').trim();
  }
  return clean || name.trim();
}

export const ARTIST_DELIMITER_REGEX = /(?:\s*,\s*|\s*[/\\|•·]\s*|\s+(?:&|and|feat\.?|ft\.?|featuring|with|vs\.?|[xX])\s+|\s*&\s*)/i;

/**
 * Splits raw artist strings on common delimiters (&, comma, feat, ft, etc.)
 * Preserves recognized multi-word protected groups (e.g. "Simon & Garfunkel")
 * and strips common honorific titles (e.g. "Thenisai Thendral Deva" -> "Deva").
 */
export function splitArtistNames(raw: string | string[]): string[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const result: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const sanitized = item.replace(/^[\s,;&/|•·\-–—]+|[\s,;&/|•·\-–—]+$/g, '').trim();
    if (!sanitized) continue;

    const lower = sanitized.toLowerCase();
    if (PROTECTED_ARTISTS.some(p => p === lower || lower === p.replace(/&/g, 'and'))) {
      result.push(stripHonorifics(sanitized));
      continue;
    }

    const parts = sanitized
      .split(ARTIST_DELIMITER_REGEX)
      .map(p => p.replace(/^[\s,;&/|•·\-–—]+|[\s,;&/|•·\-–—]+$/g, '').trim())
      .map(p => stripHonorifics(p))
      .filter(p => p.length > 0 && !/^\d+$/.test(p) && !/^itunes\s*artist/i.test(p));
    result.push(...parts);
  }
  return result;
}

/**
 * Universal Artist Formatting
 * Combines the main artist with featured artists and applies consistent capitalization.
 */
export function formatArtists(track: any, fallback: string = "Unknown Artist"): string {
  if (!track) return fallback;

  const seen = new Set<string>();
  const parts: string[] = [];

  const add = (name: string, role?: string) => {
    if (!name || typeof name !== 'string') return;
    const split = splitArtistNames(name);
    for (const item of split) {
      const clean = item.replace(/^[\s,;&/|•·\-–—]+|[\s,;&/|•·\-–—]+$/g, '').trim();
      if (!clean || clean.length < 2 || /^\d+$/.test(clean) || /^itunes\s*artist/i.test(clean)) continue;
      const lower = clean.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        const title = formatDisplayTitle(clean);
        parts.push(role ? `${title} (${role})` : title);
      }
    }
  };

  // 1. Main artist is the composer / music director
  const rawComposers = track.composers || 
                       track.music || 
                       track.musicDirector || 
                       track.more_info?.music || 
                       track.more_info?.composer || 
                       track.album?.musicDirector || 
                       track.album?.composer;
  const rawBgm = track.bgmComposer || track.bgm || track.more_info?.bgm;

  let hasComposer = false;
  if (rawComposers) {
    add(String(rawComposers));
    hasComposer = parts.length > 0;
  }
  if (rawBgm) {
    add(String(rawBgm), "BGM");
  }

  // 2. Primary artist from all metadata shapes
  let rawPrimary = "";
  if (Array.isArray(track.artists) && track.artists.length > 0) {
    const first = track.artists[0];
    rawPrimary = typeof first === 'string' ? first : (first?.name || first?.profile?.name || "");
  }
  if (!rawPrimary && Array.isArray(track.artists?.items) && track.artists.items.length > 0) {
    const first = track.artists.items[0];
    rawPrimary = first?.profile?.name || first?.name || "";
  }
  if (!rawPrimary && track.artist) {
    rawPrimary = typeof track.artist === 'string' ? track.artist : (track.artist.name || "");
  }
  if (!rawPrimary && track.artistName) {
    rawPrimary = track.artistName;
  }
  if (!rawPrimary && track.primaryArtists) {
    rawPrimary = track.primaryArtists;
  }
  if (!rawPrimary && track.more_info?.primary_artists) {
    rawPrimary = track.more_info.primary_artists;
  }
  if (!rawPrimary && track.album?.artist?.name) {
    rawPrimary = track.album.artist.name;
  }
  if (!rawPrimary && typeof track.album?.artist === 'string') {
    rawPrimary = track.album.artist;
  }
  if (!rawPrimary && track.subtitle && typeof track.subtitle === 'string') {
    if (!/^\d{4}\b/i.test(track.subtitle) && !/\bsong\b/i.test(track.subtitle)) {
      rawPrimary = track.subtitle;
    }
  }

  if (!hasComposer && rawPrimary) {
    add(rawPrimary);
  }

  // 3. Secondary artists: Singers
  const rawSingers = track.singers || 
                     track.more_info?.singers || 
                     track.singer || 
                     track.vocals || 
                     track.sungBy;
  if (rawSingers) {
    add(String(rawSingers), "Singer");
  } else if (hasComposer && rawPrimary) {
    add(rawPrimary, "Singer");
  }

  // 4. Secondary artists: Lyricists
  const rawLyricists = track.lyricist || 
                       track.lyricists || 
                       track.more_info?.lyricist || 
                       track.more_info?.lyrics;
  if (rawLyricists) {
    add(String(rawLyricists), "Lyricist");
  }

  // 5. Featured / other credits
  if (track.featuredArtists) {
    add(String(track.featuredArtists), "Featured");
  }

  // 6. Explicit artistMap if available
  if (track.more_info?.artistMap?.primary_artists && Array.isArray(track.more_info.artistMap.primary_artists)) {
    for (const pa of track.more_info.artistMap.primary_artists) {
      if (pa?.name) add(pa.name);
    }
  }

  if (parts.length === 0) return fallback;
  return parts.join(' • ');
}

/**
 * Safely resolves the navigation target for an artist from any track/artist object
 */
export function getArtistTarget(trackOrArtist: any): string | null {
  if (!trackOrArtist) return null;
  // If track has explicit artistId and the artist name is not a combo string
  if (typeof trackOrArtist.artist === 'object' && trackOrArtist.artist?.name) {
    const parts = splitArtistNames(trackOrArtist.artist.name);
    if (parts.length > 1) {
      // If combo, point to the first primary artist's individual page
      return `/artist/${encodeURIComponent(parts[0])}`;
    }
    if (trackOrArtist.artist.id) return `/artist/${trackOrArtist.artist.id}`;
    return `/artist/${encodeURIComponent(trackOrArtist.artist.name)}`;
  }
  if (trackOrArtist.artistId) {
    const name = trackOrArtist.artistName || trackOrArtist.artist?.name;
    if (name) {
      const parts = splitArtistNames(name);
      if (parts.length > 1) return `/artist/${encodeURIComponent(parts[0])}`;
    }
    return `/artist/${trackOrArtist.artistId}`;
  }
  if (typeof trackOrArtist.artist === 'string' && trackOrArtist.artist.trim()) {
    const parts = splitArtistNames(trackOrArtist.artist.trim());
    return `/artist/${encodeURIComponent(parts[0] || trackOrArtist.artist.trim())}`;
  }
  if (trackOrArtist.artistName && typeof trackOrArtist.artistName === 'string') {
    const parts = splitArtistNames(trackOrArtist.artistName.trim());
    return `/artist/${encodeURIComponent(parts[0] || trackOrArtist.artistName.trim())}`;
  }
  if (trackOrArtist.id && (trackOrArtist.name || trackOrArtist.follower_count !== undefined)) return `/artist/${trackOrArtist.id}`;
  if (trackOrArtist.name && typeof trackOrArtist.name === 'string') {
    const parts = splitArtistNames(trackOrArtist.name.trim());
    return `/artist/${encodeURIComponent(parts[0] || trackOrArtist.name.trim())}`;
  }
  return null;
}
