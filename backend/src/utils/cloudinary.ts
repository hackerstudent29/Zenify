import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config/env';

const cloudinaryConfig: Record<string, any> = { secure: true };

if (config.CLOUDINARY_CLOUD_NAME) cloudinaryConfig.cloud_name = config.CLOUDINARY_CLOUD_NAME;
if (config.CLOUDINARY_API_KEY) cloudinaryConfig.api_key = config.CLOUDINARY_API_KEY;
if (config.CLOUDINARY_API_SECRET) cloudinaryConfig.api_secret = config.CLOUDINARY_API_SECRET;

cloudinary.config(cloudinaryConfig);

/**
 * Uploads an external image URL directly to Cloudinary if it's not already hosted there.
 * @param url External image URL
 * @param folder Cloudinary folder name
 * @returns The secure Cloudinary URL or original URL as fallback
 */
export async function uploadUrlToCloudinary(url: string | null | undefined, folder: string): Promise<string | null> {
    if (!url || !url.startsWith('http') || url.includes('res.cloudinary.com')) {
        return url || null;
    }
    try {
        const result = await cloudinary.uploader.upload(url, {
            folder: folder,
            resource_type: 'image'
        });
        return result.secure_url;
    } catch (error) {
        console.warn(`[Cloudinary] Could not upload URL to Cloudinary (${url}):`, error);
        return url;
    }
}

export default cloudinary;
