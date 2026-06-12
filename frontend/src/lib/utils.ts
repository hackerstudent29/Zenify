import * as React from "react"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
 return twMerge(clsx(inputs))
}

export function getApiBaseUrl() {
 return (import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL) || 'https://zenify-production-08b4.up.railway.app/api';
}

export function getMediaUrl(path?: string | null, type?: 'image' | 'audio') {
 if (!path) return undefined;
 const trimmedPath = path.trim();

 const API_BASE = getApiBaseUrl();
 const BASE_ORIGIN = API_BASE.replace(/\/api$/, '');

 // Blob URLs — use directly
 if (trimmedPath.startsWith('blob:')) {
 return trimmedPath;
 }

 // External URLs (http/https)
 if (trimmedPath.startsWith('http://') || trimmedPath.startsWith('https://')) {
 // Skip proxy for trusted CDNs
 if (trimmedPath.includes('unsplash.com') || trimmedPath.includes('ui-avatars.com') || trimmedPath.includes('res.cloudinary.com')) {
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
 } catch (e) {
 // Ignore parse errors
 }
 }

 // Already a proxied URL (pointing to our own backend)
 if (trimmedPath.includes('localhost:3000') || trimmedPath.includes('railway.app')) {
 // Fix localhost in non-localhost env
 if (trimmedPath.includes('localhost') && !API_BASE.includes('localhost')) {
 const relativePath = trimmedPath.split(':3000').pop() || '';
 return encodeURI(`${BASE_ORIGIN}${relativePath}`);
 }
 return trimmedPath;
 }

 // If explicitly requested as audio, or matches audio criteria, proxy as audio
 const AUDIO_EXTS = /\.(mp3|m4a|wav|aac|ogg|flac)(\?.*)?$/i;
 const isAudioUrl = type === 'audio' || 
 (!type && (
 AUDIO_EXTS.test(trimmedPath) || 
 trimmedPath.includes('googlevideo.com') || 
 trimmedPath.includes('r2.dev') || 
 trimmedPath.includes('cloudflarestorage.com') ||
 trimmedPath.includes('saavn.com') ||
 trimmedPath.includes('youtube.com') ||
 trimmedPath.includes('youtu.be')
 ));

 if (isAudioUrl) {
 if (trimmedPath.includes('/proxy-audio')) {
 return trimmedPath;
 }
 return `${API_BASE}/utils/proxy-audio?url=${encodeURIComponent(trimmedPath)}`;
 }

 // If explicitly requested as image, or has image extension, or is a media page (apple/spotify/youtube)
 const IMG_EXTS = /\.(jpg|jpeg|png|webp|gif|avif)(\?.*)?$/i;
 const isMediaPage = trimmedPath.includes('music.apple.com') || 
 trimmedPath.includes('spotify.com') || 
 trimmedPath.includes('youtube.com') || 
 trimmedPath.includes('youtu.be') ||
 trimmedPath.includes('music.youtube.com');
 
 const isImageUrl = type === 'image' || IMG_EXTS.test(trimmedPath) || isMediaPage;

 if (isImageUrl) {
 return `${API_BASE}/utils/proxy-image?url=${encodeURIComponent(trimmedPath)}`;
 }
 
 return trimmedPath;
 }

// Relative paths — prepend API base origin
 const normalizedPath = trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`;
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
 
 // Priority: track.coverUrl -> album.coverUrl -> artist.imageUrl
 const cover = (track.coverUrl && track.coverUrl.trim().length > 0) ? track.coverUrl :
 (track.album?.coverUrl && track.album.coverUrl.trim().length > 0) ? track.album.coverUrl :
 (track.artist?.imageUrl && track.artist.imageUrl.trim().length > 0) ? track.artist.imageUrl : 
 null;
 
 return getMediaUrl(cover, 'image') || "/logo.png";
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
export function formatDisplayTitle(input?: string | null): string {
 if (!input) return "";

 // 1. Identify and preserve bracketed content containing version descriptions or credits
 // e.g. (feat. artist), (Sped Up), [Instrumental], (Remix)
 let text = input;
 const bracketRegex = /([\(\[\{][^\)\]\}]*[\)\]\}])/g;
 
 const keepKeywords = [
 'feat', 'featuring', 'sped', 'slow', 'reverb', 
 'instrumental', 'acapella', 'remix', 'prod', 
 'version', 'mix', 'live', 'acoustic', 'cover', 'edit',
 'original', 'extended', 'radio',
 'lofi', 'lo-fi', 're-imagined', 'reimagined', 'remaster', 'remastered', 'deluxe', 're-recorded', 'rerecorded', 're-imagine', 'reimagine'
 ];
 
 // Replace brackets that do NOT contain the keeps keywords with empty space
 text = text.replace(bracketRegex, (match) => {
 const lowerMatch = match.toLowerCase();
 const shouldKeep = keepKeywords.some(keyword => lowerMatch.includes(keyword));
 return shouldKeep ? match : '';
 });

 // Remove double spaces left over by deletions
 text = text.replace(/\s+/g, ' ').trim();

 // 2. Case normalization: Convert entire text to lowercase first
 text = text.toLowerCase();

 // 3. Capitalization: Capitalize strings and handle brackets properly
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

 return text;
}
