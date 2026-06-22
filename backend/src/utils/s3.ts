import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config/env';
import { Readable } from 'stream';
import axios from 'axios';

const isR2Configured = !!(
  config.R2_ACCESS_KEY_ID &&
  config.R2_SECRET_ACCESS_KEY &&
  config.R2_ENDPOINT &&
  config.R2_BUCKET_NAME
);

if (!isR2Configured) {
  console.warn('[R2] Warning: Cloudflare R2 is not fully configured. File uploads will fall back to local/mock paths.');
}

export const s3Client = isR2Configured
  ? new S3Client({
      region: 'auto',
      endpoint: config.R2_ENDPOINT,
      credentials: {
        accessKeyId: config.R2_ACCESS_KEY_ID!,
        secretAccessKey: config.R2_SECRET_ACCESS_KEY!,
      },
    })
  : null;

/**
 * Uploads a file to Cloudflare R2 bucket.
 * @param key Unique key for the file in the bucket (e.g. "zenify/tracks/upload-123.mp3")
 * @param body Buffer, Readable Stream, or string payload
 * @param contentType The mime type of the file (e.g. "audio/mpeg")
 * @returns The public URL of the uploaded asset
 */
export async function uploadToR2(
  key: string,
  body: Buffer | Readable | string,
  contentType: string
): Promise<string> {
  if (!isR2Configured || !s3Client) {
    console.warn(`[R2] Cloudflare R2 is not configured. Simulating R2 upload for key: ${key}`);
    return `/public/mock-r2/${key}`;
  }

  const command = new PutObjectCommand({
    Bucket: config.R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await s3Client.send(command);

  // Determine streaming domain URL
  const publicDomain = config.R2_PUBLIC_DOMAIN || config.R2_ENDPOINT;
  const base = publicDomain!.replace(/\/$/, '');

  // If using standard R2 API endpoint without a custom domain
  if (base.includes('cloudflarestorage.com')) {
    return `${base}/${config.R2_BUCKET_NAME}/${key}`;
  }
  return `${base}/${key}`;
}

/**
 * Deletes an object from Cloudflare R2 bucket.
 * @param key Unique key of the file in the bucket
 */
export async function deleteFromR2(key: string): Promise<void> {
  if (!isR2Configured || !s3Client) {
    console.warn(`[R2] Cloudflare R2 is not configured. Simulating delete for key: ${key}`);
    return;
  }

  const command = new DeleteObjectCommand({
    Bucket: config.R2_BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
}

/**
 * Downloads a file from an external URL and uploads it to R2.
 * @param url External file URL
 * @param keyPrefix Folder path in the bucket (e.g. "zenify/tracks")
 * @returns The R2 public URL
 */
export async function uploadUrlToR2(url: string | null | undefined, keyPrefix: string): Promise<string | null> {
    if (!url || !url.startsWith('http')) return url || null;
    
    // If it's already hosted on R2, return it directly
    const publicDomain = config.R2_PUBLIC_DOMAIN || config.R2_ENDPOINT;
    if (publicDomain) {
        const base = publicDomain.replace(/\/$/, '');
        if (url.startsWith(base)) {
            return url;
        }
    }
    
    try {
        console.log(`[R2] Downloading external file: ${url}`);
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const contentType = response.headers['content-type'] || 'audio/mpeg';
        const fileBuffer = Buffer.from(response.data);
        
        // Generate a unique file name
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        const ext = url.split(/[#?]/)[0].split('.').pop() || 'mp3';
        const key = `${keyPrefix}/${uniqueSuffix}.${ext}`;
        
        const finalUrl = await uploadToR2(key, fileBuffer, contentType);
        console.log(`[R2] Successfully downloaded & uploaded file to R2: ${finalUrl}`);
        return finalUrl;
    } catch (error: any) {
        console.warn(`[R2] Could not download & upload file to R2 from URL (${url}):`, error.message);
        return url; // fallback to original input url
    }
}

/**
 * Deletes an object from R2 by its public/endpoint URL.
 * @param url Full URL of the file in R2
 */
export async function deleteUrlFromR2(url: string | null | undefined): Promise<void> {
  if (!url) return;
  
  // If it's a mock path (e.g. starts with /public/mock-r2/)
  if (url.startsWith('/public/mock-r2/')) {
    const key = url.replace('/public/mock-r2/', '');
    console.log(`[R2] Simulating delete for mock key: ${key}`);
    return;
  }
  
  try {
    const publicDomain = config.R2_PUBLIC_DOMAIN || config.R2_ENDPOINT;
    if (!publicDomain) return;
    
    const base = publicDomain.replace(/\/$/, '');
    let key = '';
    
    if (url.startsWith(base)) {
      key = url.replace(base, '');
      if (key.startsWith('/')) {
        key = key.substring(1);
      }
      
      // If it starts with bucket name (when using standard R2 domain)
      if (config.R2_BUCKET_NAME && key.startsWith(config.R2_BUCKET_NAME + '/')) {
        key = key.replace(config.R2_BUCKET_NAME + '/', '');
      }
    } else {
      const endpoint = config.R2_ENDPOINT ? config.R2_ENDPOINT.replace(/\/$/, '') : '';
      if (endpoint && url.startsWith(endpoint)) {
        key = url.replace(endpoint, '');
        if (key.startsWith('/')) key = key.substring(1);
        if (config.R2_BUCKET_NAME && key.startsWith(config.R2_BUCKET_NAME + '/')) {
          key = key.replace(config.R2_BUCKET_NAME + '/', '');
        }
      }
    }
    
    if (key) {
      key = decodeURIComponent(key);
      console.log(`[R2] Extracting key for deletion: "${key}" from URL: "${url}"`);
      await deleteFromR2(key);
    }
  } catch (error: any) {
    console.error(`[R2] Failed to delete file by URL (${url}):`, error.message);
  }
}
