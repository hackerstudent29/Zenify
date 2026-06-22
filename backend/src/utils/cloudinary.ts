import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config/env';

const cloudinaryConfig: Record<string, any> = { secure: true };

if (config.CLOUDINARY_CLOUD_NAME) cloudinaryConfig.cloud_name = config.CLOUDINARY_CLOUD_NAME;
if (config.CLOUDINARY_API_KEY) cloudinaryConfig.api_key = config.CLOUDINARY_API_KEY;
if (config.CLOUDINARY_API_SECRET) cloudinaryConfig.api_secret = config.CLOUDINARY_API_SECRET;

cloudinary.config(cloudinaryConfig);

/**
 * Uploads an external image URL directly to Cloudinary if it's not already hosted there.
 * @param url External image URL or local proxy URL
 * @param folder Cloudinary folder name
 * @returns The secure Cloudinary URL or original URL as fallback
 */
export async function uploadUrlToCloudinary(url: string | null | undefined, folder: string): Promise<string | null> {
    if (!url) return null;
    
    // Extract actual target URL if it's a local proxy URL
    let targetUrl = url;
    if (targetUrl.includes('proxy-image?url=')) {
        try {
            const urlObj = new URL(targetUrl);
            const extracted = urlObj.searchParams.get('url');
            if (extracted) targetUrl = extracted;
        } catch {
            const match = targetUrl.match(/[?&]url=([^&]+)/);
            if (match) targetUrl = decodeURIComponent(match[1]);
        }
    }

    // Decode in case it's double-encoded or contains encoded characters
    try {
        if (targetUrl.includes('%')) {
            targetUrl = decodeURIComponent(targetUrl);
        }
    } catch {
        // Ignore decoding errors and use as-is
    }

    // Already hosted on Cloudinary
    if (targetUrl.includes('res.cloudinary.com')) {
        return targetUrl;
    }

    // Must be a valid HTTP or data URI link to upload
    if (!targetUrl.startsWith('http') && !targetUrl.startsWith('data:image/')) {
        return url; // fallback to original input
    }

    try {
        const result = await cloudinary.uploader.upload(targetUrl, {
            folder: folder,
            resource_type: 'image'
        });
        return result.secure_url;
    } catch (error) {
        console.warn(`[Cloudinary] Could not upload URL to Cloudinary (${targetUrl}):`, error);
        return url; // fallback to original input
    }
}

/**
 * Deletes a resource from Cloudinary using its secure URL.
 * @param url Cloudinary URL
 * @returns Promise<boolean> True if deleted successfully, false otherwise
 */
export async function deleteFromCloudinary(url: string | null | undefined): Promise<boolean> {
    if (!url || !url.includes('res.cloudinary.com')) {
        return false;
    }
    try {
        const urlParts = url.split('res.cloudinary.com/');
        if (urlParts.length < 2) return false;
        
        const pathParts = urlParts[1].split('/');
        // Skip cloud_name, resource_type, upload_type (usually parts[0], parts[1], parts[2])
        const remaining = pathParts.slice(3);
        if (remaining.length === 0) return false;
        
        // Skip version (starts with 'v' followed by digits) if present
        if (remaining[0].match(/^v\d+$/)) {
            remaining.shift();
        }
        
        const fileWithExt = remaining.join('/');
        // Remove file extension
        const dotIndex = fileWithExt.lastIndexOf('.');
        const publicId = dotIndex > -1 ? fileWithExt.substring(0, dotIndex) : fileWithExt;
        
        console.log(`[Cloudinary] Destroying public ID: "${publicId}" from URL: "${url}"`);
        const result = await cloudinary.uploader.destroy(publicId);
        return result.result === 'ok';
    } catch (error) {
        console.error(`[Cloudinary] Failed to delete resource (${url}):`, error);
        return false;
    }
}

export default cloudinary;
