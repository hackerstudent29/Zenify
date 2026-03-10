import * as React from "react"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function getMediaUrl(path?: string | null) {
    if (!path) return undefined;
    const trimmedPath = path.trim();

    const fullApi = process.env.NEXT_PUBLIC_API_URL || 'https://listenzenifybackend.up.railway.app/api';
    const API_BASE = fullApi.endsWith('/api') ? fullApi : `${fullApi.replace(/\/$/, '')}/api`;

    // Blob URLs — use directly (they're local object URLs from fetch)
    if (trimmedPath.startsWith('blob:')) {
        return trimmedPath;
    }

    // Audio file extensions — NEVER proxy through image proxy (returns 415)
    const AUDIO_EXTS = /\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)(\?.*)?$/i;
    if (AUDIO_EXTS.test(trimmedPath)) {
        return trimmedPath;
    }



    // External URLs (http/https) — proxy through backend to avoid hotlink blocks on images
    if (trimmedPath.startsWith('http://') || trimmedPath.startsWith('https://')) {
        // Already a proxied URL (pointing to our own backend) — return as-is
        if (trimmedPath.includes('localhost:3000') || trimmedPath.includes('railway.app')) {
            // If it's a localhost path in non-localhost env, fix it
            if (trimmedPath.includes('localhost') && !fullApi.includes('localhost')) {
                const relativePath = trimmedPath.split(':3000').pop() || '';
                return encodeURI(`${API_BASE.replace('/api', '')}${relativePath}`);
            }
            return trimmedPath;
        }
        // All other external image URLs — route through proxy
        return `${API_BASE}/utils/proxy-image?url=${encodeURIComponent(trimmedPath)}`;
    }

    // Relative paths — prepend API base (without /api suffix)
    const baseOrigin = API_BASE.replace(/\/api$/, '');
    const normalizedPath = trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`;
    return encodeURI(`${baseOrigin}${normalizedPath}`);
}


export function cleanTitle(title?: string | null): string {
    if (!title) return '';
    return title.replace(/\s*[\(\[].+?[\)\]]\s*/g, '').trim();
}
