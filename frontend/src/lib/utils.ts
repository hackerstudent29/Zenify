import * as React from "react"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function getMediaUrl(path?: string | null) {
    if (!path) return "";

    // If it's already an absolute URL, return as is
    if (path.startsWith('http://') || path.startsWith('https://')) {
        return path;
    }

    const fullApi = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3000/api';
    const API_BASE = fullApi.endsWith('/api') ? fullApi.slice(0, -4) : fullApi;

    // Ensure the path starts with a slash
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${API_BASE}${normalizedPath}`;
}
