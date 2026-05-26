import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config/env';
import { Readable } from 'stream';

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
