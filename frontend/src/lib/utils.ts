import * as React from "react"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function getMediaUrl(path?: string | null) {
    if (!path) return "";
    // Use the backend origin dynamically from env in Vercel. 
    // Usually NEXT_PUBLIC_API_URL is 'https://domain.com/api', so we slice off the '/api'
    const fullApi = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001/api';
    const API_BASE = fullApi.endsWith('/api') ? fullApi.slice(0, -4) : fullApi;

    // Ensure the path starts with a slash
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${API_BASE}${normalizedPath}`;
}
