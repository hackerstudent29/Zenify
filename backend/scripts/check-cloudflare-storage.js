/**
 * Zenify Cloudflare R2 Storage Inspector
 * Run directly in terminal:
 *   node scripts/check-cloudflare-storage.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function inspectCloudflareR2() {
  console.log('\n\x1b[1m\x1b[36m========================================================\x1b[0m');
  console.log('\x1b[1m\x1b[36m        ZENIFY - CLOUDFLARE R2 STORAGE DETAILS          \x1b[0m');
  console.log('\x1b[1m\x1b[36m========================================================\x1b[0m\n');

  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const publicDomain = process.env.R2_PUBLIC_DOMAIN;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
    console.error('\x1b[31m[ERROR] Missing Cloudflare R2 credentials in .env:\x1b[0m');
    console.error(`- R2_ENDPOINT: ${endpoint ? 'Set' : '\x1b[31mMissing\x1b[0m'}`);
    console.error(`- R2_ACCESS_KEY_ID: ${accessKeyId ? 'Set' : '\x1b[31mMissing\x1b[0m'}`);
    console.error(`- R2_SECRET_ACCESS_KEY: ${secretAccessKey ? 'Set' : '\x1b[31mMissing\x1b[0m'}`);
    console.error(`- R2_BUCKET_NAME: ${bucketName ? 'Set' : '\x1b[31mMissing\x1b[0m'}`);
    process.exit(1);
  }

  console.log(`\x1b[90mConnecting to R2 Bucket:\x1b[0m \x1b[33m${bucketName}\x1b[0m`);
  console.log(`\x1b[90mEndpoint:\x1b[0m ${endpoint}`);
  if (publicDomain) console.log(`\x1b[90mPublic Domain:\x1b[0m ${publicDomain}`);
  console.log('\x1b[90mFetching storage objects...\x1b[0m\n');

  const s3 = new S3Client({
    region: 'auto',
    endpoint: endpoint,
    credentials: {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
    },
  });

  let totalObjects = 0;
  let totalBytes = 0;
  const extensionStats = {};
  const folderStats = {};
  const allObjects = [];

  let continuationToken = undefined;

  try {
    do {
      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        ContinuationToken: continuationToken,
      });

      const response = await s3.send(command);
      const contents = response.Contents || [];

      for (const item of contents) {
        totalObjects++;
        const size = item.Size || 0;
        totalBytes += size;

        // Folder categorization
        const parts = (item.Key || '').split('/');
        const folder = parts.length > 1 ? parts[0] + '/' : '(root)';
        folderStats[folder] = folderStats[folder] || { count: 0, bytes: 0 };
        folderStats[folder].count++;
        folderStats[folder].bytes += size;

        // File extension categorization
        const ext = path.extname(item.Key || '').toLowerCase() || '(no-ext)';
        extensionStats[ext] = extensionStats[ext] || { count: 0, bytes: 0 };
        extensionStats[ext].count++;
        extensionStats[ext].bytes += size;

        allObjects.push({
          key: item.Key,
          size: size,
          lastModified: item.LastModified,
        });
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    // Summary Box
    console.log('\x1b[1m\x1b[32m[STORAGE SUMMARY]\x1b[0m');
    console.log(`  Bucket Name:          \x1b[1m${bucketName}\x1b[0m`);
    console.log(`  Total Objects:        \x1b[1m\x1b[33m${totalObjects.toLocaleString()}\x1b[0m files`);
    console.log(`  Total Space Used:     \x1b[1m\x1b[32m${formatBytes(totalBytes)}\x1b[0m (${totalBytes.toLocaleString()} bytes)`);
    console.log(`  Free Tier Usage:      ~${((totalBytes / (10 * 1024 * 1024 * 1024)) * 100).toFixed(2)}% of 10 GB Free Tier\n`);

    // Folder Breakdown Table
    console.log('\x1b[1m\x1b[34m[STORAGE BY FOLDER / PREFIX]\x1b[0m');
    const folderRows = Object.entries(folderStats).sort((a, b) => b[1].bytes - a[1].bytes);
    if (folderRows.length === 0) {
      console.log('  (Bucket is empty)');
    } else {
      console.table(
        folderRows.map(([folder, stat]) => ({
          'Folder / Prefix': folder,
          'Files': stat.count.toLocaleString(),
          'Size': formatBytes(stat.bytes),
          'Share': ((stat.bytes / (totalBytes || 1)) * 100).toFixed(1) + '%',
        }))
      );
    }
    console.log('');

    // Extension Breakdown Table
    console.log('\x1b[1m\x1b[35m[STORAGE BY FILE EXTENSION]\x1b[0m');
    const extRows = Object.entries(extensionStats).sort((a, b) => b[1].bytes - a[1].bytes);
    if (extRows.length > 0) {
      console.table(
        extRows.map(([ext, stat]) => ({
          'Extension': ext,
          'Files': stat.count.toLocaleString(),
          'Size': formatBytes(stat.bytes),
          'Share': ((stat.bytes / (totalBytes || 1)) * 100).toFixed(1) + '%',
        }))
      );
    }
    console.log('');

    // Top 10 Largest Files
    if (allObjects.length > 0) {
      console.log('\x1b[1m\x1b[33m[TOP 10 LARGEST STORED FILES]\x1b[0m');
      const top10 = allObjects.sort((a, b) => b.size - a.size).slice(0, 10);
      console.table(
        top10.map((obj, i) => ({
          '#': i + 1,
          'File Key': obj.key.length > 50 ? '...' + obj.key.slice(-47) : obj.key,
          'Size': formatBytes(obj.size),
          'Last Modified': obj.lastModified ? new Date(obj.lastModified).toISOString().split('T')[0] : 'N/A',
        }))
      );
    }

    console.log('\n\x1b[32m✔ Cloudflare R2 storage inspection completed successfully.\x1b[0m\n');
  } catch (err) {
    console.error('\n\x1b[31m[ERROR] Failed to query Cloudflare R2:\x1b[0m', err.message);
    process.exit(1);
  }
}

inspectCloudflareR2();
