import * as React from "react"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function getApiBaseUrl() {
    let fullApi = import.meta.env.NEXT_PUBLIC_API_URL || "";
    if (!fullApi && typeof window !== 'undefined') {
        const host = window.location.hostname;
        if (window.location.port === '3001') {
            fullApi = `${window.location.protocol}//${host}:3000/api`;
        } else {
            fullApi = `${window.location.protocol}//${host}/api`;
        }
    }
    const cleanUrl = fullApi.trim().replace(/\/+$/, '');
    return cleanUrl && cleanUrl.length > 0 ? (cleanUrl.endsWith('/api') ? cleanUrl : `${cleanUrl}/api`) : 'https://zenify-production-08b4.up.railway.app/api';
}

export function getMediaUrl(path?: string | null) {
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

        // Image file extensions — route through proxy to avoid hotlink blocks
        const IMG_EXTS = /\.(jpg|jpeg|png|webp|gif|avif)(\?.*)?$/i;
        if (IMG_EXTS.test(trimmedPath)) {
            return `${API_BASE}/utils/proxy-image?url=${encodeURIComponent(trimmedPath)}`;
        }
        
        // Audio proxying to prevent CORS blocking for Web Audio API (StudioFX Analyzer)
        const AUDIO_EXTS = /\.(mp3|m4a|wav|aac|ogg|flac)(\?.*)?$/i;
        const isAudioUrl = AUDIO_EXTS.test(trimmedPath) || 
                           trimmedPath.includes('googlevideo.com') || 
                           trimmedPath.includes('r2.dev') || 
                           trimmedPath.includes('cloudflarestorage.com') ||
                           trimmedPath.includes('saavn.com') ||
                           trimmedPath.includes('youtube.com') ||
                           trimmedPath.includes('youtu.be');
        
        if (isAudioUrl) {
            if (trimmedPath.includes('/proxy-audio')) {
                return trimmedPath;
            }
            return `${API_BASE}/utils/proxy-audio?url=${encodeURIComponent(trimmedPath)}`;
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
    
    return getMediaUrl(cover) || "/logo.png";
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

    // 1. Remove bracket text and contents: (...) [...] {...}
    let text = input.replace(/\s*[\(\[\{][^\)\]\}]*([\)\]\}]|$)/g, '');

    // 2. Case normalization: Convert entire text to lowercase first
    text = text.toLowerCase();

    // 3. Capitalization: Capitalize the first letter of the string and every word after a space.
    // This also handles rule 5 (single word logic) naturally.
    text = text.trim()
               .split(' ')
               .filter(word => word.length > 0)
               .map(word => word.charAt(0).toUpperCase() + word.slice(1))
               .join(' ');

    return text;
}
