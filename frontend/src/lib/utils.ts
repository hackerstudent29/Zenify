import * as React from "react"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function getMediaUrl(path?: string | null) {
    if (!path) return "";
    const trimmedPath = path.trim();

    // If it's already an absolute URL, return as is
    if (trimmedPath.startsWith('http://') || trimmedPath.startsWith('https://')) {
        return trimmedPath;
    }

    const fullApi = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
    const API_BASE = (fullApi.endsWith('/api') ? fullApi.slice(0, -4) : fullApi).replace(/\/$/, "");

    // Ensure the path starts with a slash
    const normalizedPath = trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`;

    return `${API_BASE}${normalizedPath}`;
}
