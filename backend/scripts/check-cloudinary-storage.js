/**
 * Zenify Cloudinary Storage & Usage Inspector
 * Run directly in terminal:
 *   node scripts/check-cloudinary-storage.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const cloudinary = require('cloudinary').v2;

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function inspectCloudinary() {
  console.log('\n\x1b[1m\x1b[35m========================================================\x1b[0m');
  console.log('\x1b[1m\x1b[35m        ZENIFY - CLOUDINARY STORAGE & USAGE DETAILS     \x1b[0m');
  console.log('\x1b[1m\x1b[35m========================================================\x1b[0m\n');

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    console.error('\x1b[31m[ERROR] Missing Cloudinary credentials in .env:\x1b[0m');
    console.error(`- CLOUDINARY_CLOUD_NAME: ${cloudName ? 'Set' : '\x1b[31mMissing\x1b[0m'}`);
    console.error(`- CLOUDINARY_API_KEY: ${apiKey ? 'Set' : '\x1b[31mMissing\x1b[0m'}`);
    console.error(`- CLOUDINARY_API_SECRET: ${apiSecret ? 'Set' : '\x1b[31mMissing\x1b[0m'}`);
    process.exit(1);
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  console.log(`\x1b[90mConnecting to Cloudinary Cloud:\x1b[0m \x1b[33m${cloudName}\x1b[0m`);
  console.log('\x1b[90mQuerying Cloudinary Usage API...\x1b[0m\n');

  try {
    const usage = await cloudinary.api.usage();

    console.log('\x1b[1m\x1b[32m[ACCOUNT & PLAN OVERVIEW]\x1b[0m');
    console.log(`  Cloud Name:           \x1b[1m${cloudName}\x1b[0m`);
    console.log(`  Plan:                 \x1b[1m\x1b[36m${usage.plan || 'Free'}\x1b[0m`);
    if (usage.last_updated) {
      console.log(`  Last Updated:         ${usage.last_updated}`);
    }
    console.log('');

    // Storage Usage
    const storageUsage = usage.storage || {};
    const storageBytes = storageUsage.usage || 0;
    const storageLimit = storageUsage.limit;
    const storagePercent = storageUsage.used_percent !== undefined 
      ? storageUsage.used_percent.toFixed(2) + '%' 
      : (storageLimit ? ((storageBytes / storageLimit) * 100).toFixed(2) + '%' : 'N/A');

    // Bandwidth Usage
    const bandwidthUsage = usage.bandwidth || {};
    const bandwidthBytes = bandwidthUsage.usage || 0;
    const bandwidthLimit = bandwidthUsage.limit;
    const bandwidthPercent = bandwidthUsage.used_percent !== undefined 
      ? bandwidthUsage.used_percent.toFixed(2) + '%' 
      : (bandwidthLimit ? ((bandwidthBytes / bandwidthLimit) * 100).toFixed(2) + '%' : 'N/A');

    // Credits / Transformations
    const creditsUsage = usage.credits || {};
    const transformationsUsage = usage.transformations || {};

    console.log('\x1b[1m\x1b[33m[STORAGE & RESOURCE METRICS]\x1b[0m');
    console.table([
      {
        'Metric': 'Storage Used',
        'Used': formatBytes(storageBytes),
        'Limit': storageLimit ? formatBytes(storageLimit) : 'Account Level',
        '% Used': storagePercent,
      },
      {
        'Metric': 'Bandwidth',
        'Used': formatBytes(bandwidthBytes),
        'Limit': bandwidthLimit ? formatBytes(bandwidthLimit) : 'Account Level',
        '% Used': bandwidthPercent,
      },
      {
        'Metric': 'Transformations',
        'Used': (transformationsUsage.usage || 0).toLocaleString(),
        'Limit': transformationsUsage.limit ? transformationsUsage.limit.toLocaleString() : 'N/A',
        '% Used': transformationsUsage.used_percent !== undefined ? transformationsUsage.used_percent.toFixed(2) + '%' : 'N/A',
      },
      {
        'Metric': 'Credits',
        'Used': (creditsUsage.usage || 0).toFixed(2),
        'Limit': creditsUsage.limit ? creditsUsage.limit.toLocaleString() : 'N/A',
        '% Used': creditsUsage.used_percent !== undefined ? creditsUsage.used_percent.toFixed(2) + '%' : 'N/A',
      },
    ]);
    console.log('');

    // Media Assets Breakdown
    const objectsUsage = usage.objects || {};
    console.log('\x1b[1m\x1b[34m[MEDIA ASSETS BREAKDOWN]\x1b[0m');
    console.table([
      {
        'Resource Type': 'Total Media Assets',
        'Count': (objectsUsage.usage || 0).toLocaleString(),
      },
      {
        'Resource Type': 'Images Stored',
        'Count': (usage.resources || objectsUsage.usage || 0).toLocaleString(),
      },
      {
        'Resource Type': 'Derived (Transformed) Assets',
        'Count': (usage.derived_resources || 0).toLocaleString(),
      },
    ]);

    // Also list the 10 most recent uploads in Cloudinary
    console.log('\n\x1b[90mFetching recent uploads from Cloudinary...\x1b[0m');
    const resourcesRes = await cloudinary.api.resources({
      max_results: 10,
      type: 'upload',
      direction: 'desc',
    });

    if (resourcesRes.resources && resourcesRes.resources.length > 0) {
      console.log('\x1b[1m\x1b[36m[RECENT 10 ASSETS UPLOADED]\x1b[0m');
      console.table(
        resourcesRes.resources.map((r, i) => ({
          '#': i + 1,
          'Public ID': r.public_id.length > 40 ? '...' + r.public_id.slice(-37) : r.public_id,
          'Format': r.format || 'unknown',
          'Size': formatBytes(r.bytes),
          'Created At': r.created_at ? r.created_at.split('T')[0] : 'N/A',
        }))
      );
    } else {
      console.log('\x1b[90m  No media uploads found in Cloudinary.\x1b[0m');
    }

    console.log('\n\x1b[32m✔ Cloudinary storage & usage inspection completed successfully.\x1b[0m\n');
  } catch (err) {
    console.error('\n\x1b[31m[ERROR] Failed to query Cloudinary API:\x1b[0m', err.message);
    process.exit(1);
  }
}

inspectCloudinary();
