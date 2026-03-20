import * as React from "react"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function getMediaUrl(path?: string | null) {
    if (!path) return undefined;
    const trimmedPath = path.trim();

    let fullApi = process.env.NEXT_PUBLIC_API_URL || "";
    
    // Auto-detect backend if in browser and env is missing
    if (!fullApi && typeof window !== 'undefined') {
        const host = window.location.hostname;
        const port = window.location.port ? `:${window.location.port}` : '';
        // If we are on port 3001 (frontend default often), try 3000 (backend)
        if (window.location.port === '3001') {
            fullApi = `${window.location.protocol}//${host}:3000/api`;
        } else {
            fullApi = `${window.location.protocol}//${host}/api`;
        }
    }

    const API_BASE = fullApi && fullApi.length > 0 ? (fullApi.endsWith('/api') ? fullApi : `${fullApi.replace(/\/$/, '')}/api`) : 'https://listenzenifybackend.up.railway.app/api';
    const BASE_ORIGIN = API_BASE.replace(/\/api$/, '');

    // Blob URLs — use directly
    if (trimmedPath.startsWith('blob:')) {
        return trimmedPath;
    }

    // External URLs (http/https)
    if (trimmedPath.startsWith('http://') || trimmedPath.startsWith('https://')) {
        // Skip proxy for trusted CDNs
        if (trimmedPath.includes('unsplash.com') || trimmedPath.includes('ui-avatars.com')) {
            return trimmedPath;
        }

        // Already a proxied URL (pointing to our own backend)
        if (trimmedPath.includes('localhost:3000') || trimmedPath.includes('railway.app')) {
            // Fix localhost in non-localhost env
            if (trimmedPath.includes('localhost') && !fullApi.includes('localhost')) {
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
    if (!title) return '';
    return title.replace(/\s*[\(\[].+?[\)\]]\s*/g, '').trim();
}
