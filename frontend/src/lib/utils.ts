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
    const API_BASE = (fullApi.endsWith('/api') ? fullApi.slice(0, -4) : fullApi).replace(/\/$/, "");

    // If it's a full URL or a blob URL
    if (trimmedPath.startsWith('http://') || trimmedPath.startsWith('https://') || trimmedPath.startsWith('blob:')) {
        // If it points to localhost but we are in production (Railway/etc), 
        // we should try to point it to our current API base instead.
        if (trimmedPath.includes('localhost') && !trimmedPath.startsWith('blob:') && API_BASE && !API_BASE.includes('localhost')) {
            const relativePath = trimmedPath.split(':3000').pop() || trimmedPath.split('localhost').pop() || "";
            // Ensure the relative part is clean (e.g., starts with /public/music/...)
            const cleanPath = relativePath.startsWith('/') ? relativePath : '/' + relativePath;
            return encodeURI(`${API_BASE}${cleanPath}`);
        }
        return trimmedPath;
    }

    // Ensure the path starts with a slash
    const normalizedPath = trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`;

    return encodeURI(`${API_BASE}${normalizedPath}`);
}

export function cleanTitle(title?: string | null): string {
    if (!title) return '';
    return title.replace(/\s*[\(\[].+?[\)\]]\s*/g, '').trim();
}
