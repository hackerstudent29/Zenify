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
    const BASE_ORIGIN = API_BASE.replace(/\/api$/, '');

    // Blob URLs — use directly
    if (trimmedPath.startsWith('blob:')) {
        return trimmedPath;
    }

    // External URLs (http/https)
    if (trimmedPath.startsWith('http://') || trimmedPath.startsWith('https://')) {
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


export function cleanTitle(title?: string | null): string {
    if (!title) return '';
    return title.replace(/\s*[\(\[].+?[\)\]]\s*/g, '').trim();
}
