import { S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

// Cloudflare R2 disabled across backend services.
const isR2Configured = false;

export const s3Client: S3Client | null = null;

export async function isR2CapExceeded(): Promise<boolean> {
  return false;
}

/**
 * Uploads a file to Cloudflare R2 bucket.
 * @param key Unique key for the file in the bucket (e.g. "zenify/tracks/upload-123.mp3")
 * @param body Buffer, Readable Stream, or string payload
 * @param contentType The mime type of the file (e.g. "audio/mpeg")
 * @returns The public URL of the uploaded asset
 */
export async function uploadToR2(
  key: string,
  _body: Buffer | Readable | string,
  _contentType: string
): Promise<string> {
  void isR2Configured;
  return `/public/mock-r2/${key}`;
}

export async function deleteFromR2(_key: string): Promise<void> {
  return;
}

export async function uploadUrlToR2(url: string | null | undefined, _keyPrefix: string): Promise<string | null> {
  return url || null;
}

export async function deleteUrlFromR2(_url: string | null | undefined): Promise<void> {
  return;
}
