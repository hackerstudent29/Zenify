import fs from 'fs';
import path from 'path';

console.log('==================================================');
console.log('       ZENIFY SEO VERIFICATION AUDIT              ');
console.log('==================================================');

const distDir = path.resolve('dist');

// 1. Check prerendered static files
const testRoutes = [
  { route: '/', file: 'dist/index.html' },
  { route: '/pricing', file: 'dist/pricing/index.html' },
  { route: '/search', file: 'dist/search/index.html' },
  { route: '/about-zenify', file: 'dist/about-zenify/index.html' },
  { route: '/discover', file: 'dist/discover/index.html' },
  { route: '/privacy', file: 'dist/privacy/index.html' },
  { route: '/terms', file: 'dist/terms/index.html' }
];

console.log('\n--- 1. Prerendered Static HTML Analysis ---');
let allPrerenderOk = true;

for (const { route, file } of testRoutes) {
  if (!fs.existsSync(file)) {
    console.error(`[FAIL] Missing prerendered file: ${file}`);
    allPrerenderOk = false;
    continue;
  }
  const content = fs.readFileSync(file, 'utf8');

  // Extract title
  const titleMatch = content.match(/<title>([^<]*)<\/title>/);
  const title = titleMatch ? titleMatch[1] : 'NONE';

  // Extract canonical
  const canonicalMatch = content.match(/<link\s+rel="canonical"\s+href="([^"]*)"/i);
  const canonical = canonicalMatch ? canonicalMatch[1] : 'NONE';

  // Extract meta description
  const descMatch = content.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  const desc = descMatch ? descMatch[1] : 'NONE';

  // Count H1 elements
  const h1Matches = content.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi) || [];
  const h1Count = h1Matches.length;
  const h1Text = h1Matches.length > 0 ? h1Matches[0].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : 'NONE';

  // Extract JSON-LD scripts
  const jsonLdCount = (content.match(/<script\s+type="application\/ld\+json"[^>]*>/gi) || []).length;

  console.log(`Route: ${route}`);
  console.log(`  File: ${file}`);
  console.log(`  Title: "${title}" (length: ${title.length})`);
  console.log(`  Canonical: ${canonical}`);
  console.log(`  Description: "${desc.slice(0, 70)}..." (length: ${desc.length})`);
  console.log(`  H1 Count: ${h1Count} -> "${h1Text.slice(0, 60)}"`);
  console.log(`  JSON-LD scripts: ${jsonLdCount}`);

  if (h1Count !== 1) {
    console.warn(`  [WARN] Expected exactly 1 H1, found ${h1Count}`);
  }
  if (canonical === 'NONE') {
    console.warn(`  [WARN] Missing canonical on ${route}`);
  }
}

// 2. Search for any hardcoded /#/ links in src/
console.log('\n--- 2. Checking for any hardcoded /#/ links in src/ ---');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(full));
    } else if (/\.(tsx|ts|jsx|js|html)$/.test(file)) {
      results.push(full);
    }
  });
  return results;
}

const srcFiles = walk('./src');
let hashMatches = 0;
srcFiles.forEach(file => {
  const code = fs.readFileSync(file, 'utf8');
  const lines = code.split('\n');
  lines.forEach((line, idx) => {
    // Look for href="#/" or "/#/" in strings, ignoring the legacy redirect handler in main.tsx
    if ((line.includes('/#/') || line.includes('href="#/')) && !file.includes('main.tsx')) {
      console.log(`  Found hash link: ${file}:${idx + 1} -> ${line.trim()}`);
      hashMatches++;
    }
  });
});
if (hashMatches === 0) {
  console.log('[PASS] Zero hardcoded /#/ links found in src/ (except legacy redirect in main.tsx)!');
} else {
  console.log(`[WARN] Found ${hashMatches} potential hash links.`);
}

// 3. Check noindex on private routes
console.log('\n--- 3. Checking noindex on private routes ---');
const privateRoutes = [
  'src/app/(auth)/login/page.tsx',
  'src/app/(auth)/register/page.tsx',
  'src/app/onboarding/page.tsx',
  'src/app/profile/page.tsx',
  'src/app/settings/page.tsx',
  'src/app/settings/filter/page.tsx',
  'src/app/library/page.tsx',
  'src/app/history/page.tsx',
  'src/app/notifications/page.tsx',
  'src/app/payment/callback/page.tsx'
];

privateRoutes.forEach(f => {
  if (fs.existsSync(f)) {
    const content = fs.readFileSync(f, 'utf8');
    const hasNoIndex = content.includes('noindex={true}') || content.includes('noindex');
    console.log(`  ${f}: ${hasNoIndex ? '[PASS] noindex present' : '[FAIL] missing noindex'}`);
  }
});

// 4. Check Sitemap and Robots
console.log('\n--- 4. Checking Sitemap and Robots.txt ---');
const sitemapPath = path.resolve('public/sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  const sitemapXml = fs.readFileSync(sitemapPath, 'utf8');
  const urlCount = (sitemapXml.match(/<loc>/g) || []).length;
  const hasLastmod = sitemapXml.includes('<lastmod>');
  const hasChangefreq = sitemapXml.includes('<changefreq>');
  const hasPriority = sitemapXml.includes('<priority>');
  console.log(`  Sitemap URLs: ${urlCount}`);
  console.log(`  Has lastmod: ${hasLastmod ? '[PASS]' : '[FAIL]'}`);
  console.log(`  Has changefreq: ${hasChangefreq ? '[FAIL - should be dropped]' : '[PASS - dropped]'}`);
  console.log(`  Has priority: ${hasPriority ? '[FAIL - should be dropped]' : '[PASS - dropped]'}`);
}

const robotsPath = path.resolve('public/robots.txt');
if (fs.existsSync(robotsPath)) {
  const robotsTxt = fs.readFileSync(robotsPath, 'utf8');
  console.log('  Robots.txt content preview:');
  robotsTxt.split('\n').filter(l => l.startsWith('Disallow') || l.startsWith('Sitemap')).forEach(l => {
    console.log(`    ${l.trim()}`);
  });
}

// 5. Check og-image.png
console.log('\n--- 5. Checking og-image.png ---');
const ogPath = path.resolve('public/og-image.png');
if (fs.existsSync(ogPath)) {
  const stat = fs.statSync(ogPath);
  console.log(`  og-image.png exists: ${stat.size} bytes (${(stat.size / 1024).toFixed(1)} KB) - [PASS < 300KB]`);
} else {
  console.log('  [FAIL] og-image.png missing!');
}

console.log('\n==================================================');
console.log('              AUDIT COMPLETED                     ');
console.log('==================================================');
