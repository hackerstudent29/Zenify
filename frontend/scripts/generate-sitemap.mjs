import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const BASE_URL = 'https://listenzenify.vercel.app';
const API_BASE = process.env.VITE_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

const STATIC_ROUTES = [
  '/',
  '/search',
  '/pricing',
  '/about-zenify',
  '/about',
  '/discover',
  '/radio',
  '/local-library',
  '/privacy',
  '/terms'
];

function formatDate(date) {
  try {
    const d = date ? new Date(date) : new Date();
    if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
    return d.toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

async function fetchWithTimeout(url, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

function escapeXml(unsafe) {
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

function generateUrlXml(loc, lastmod) {
  return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${escapeXml(lastmod)}</lastmod>\n  </url>`;
}

async function generateSitemap() {
  const today = formatDate();
  const entries = [];

  // Add static routes
  for (const route of STATIC_ROUTES) {
    const loc = route === '/' ? `${BASE_URL}/` : `${BASE_URL}${route}`;
    entries.push({ loc, lastmod: today });
  }

  // Fetch dynamic items gracefully
  console.log('[Sitemap] Attempting to fetch dynamic catalog from API:', API_BASE);
  try {
    const [tracksRes, artistsRes, albumsRes, playlistsRes] = await Promise.all([
      fetchWithTimeout(`${API_BASE}/tracks?limit=1000`),
      fetchWithTimeout(`${API_BASE}/artists?limit=1000`),
      fetchWithTimeout(`${API_BASE}/albums?limit=1000`),
      fetchWithTimeout(`${API_BASE}/playlists/public?limit=1000`)
    ]);

    const tracks = tracksRes?.items || tracksRes?.tracks || (Array.isArray(tracksRes) ? tracksRes : []);
    const artists = artistsRes?.items || artistsRes?.artists || (Array.isArray(artistsRes) ? artistsRes : []);
    const albums = albumsRes?.items || albumsRes?.albums || (Array.isArray(albumsRes) ? albumsRes : []);
    const playlists = playlistsRes?.items || playlistsRes?.playlists || (Array.isArray(playlistsRes) ? playlistsRes : []);

    for (const track of tracks) {
      if (track?.id) {
        entries.push({
          loc: `${BASE_URL}/track/${track.id}`,
          lastmod: formatDate(track.updatedAt || track.createdAt)
        });
      }
    }

    for (const artist of artists) {
      if (artist?.id) {
        entries.push({
          loc: `${BASE_URL}/artist/${artist.id}`,
          lastmod: formatDate(artist.updatedAt || artist.createdAt)
        });
      }
    }

    for (const album of albums) {
      if (album?.id) {
        entries.push({
          loc: `${BASE_URL}/album/${album.id}`,
          lastmod: formatDate(album.updatedAt || album.createdAt)
        });
      }
    }

    for (const playlist of playlists) {
      if (playlist?.id) {
        entries.push({
          loc: `${BASE_URL}/playlist/${playlist.id}`,
          lastmod: formatDate(playlist.updatedAt || playlist.createdAt)
        });
      }
    }

    console.log(`[Sitemap] Total dynamic entries fetched: ${entries.length - STATIC_ROUTES.length}`);
  } catch (err) {
    console.warn('[Sitemap] API unavailable, continuing with static routes only:', err?.message || err);
  }

  // Ensure public directory exists
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  const MAX_PER_SITEMAP = 5000;
  if (entries.length <= MAX_PER_SITEMAP) {
    const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(e => generateUrlXml(e.loc, e.lastmod)).join('\n')}\n</urlset>\n`;
    fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), sitemapXml, 'utf8');
    console.log(`[Sitemap] Successfully wrote ${entries.length} URLs to public/sitemap.xml`);
  } else {
    // Split into sitemap index
    const sitemapFiles = [];
    let partIndex = 1;
    for (let i = 0; i < entries.length; i += MAX_PER_SITEMAP) {
      const chunk = entries.slice(i, i + MAX_PER_SITEMAP);
      const filename = `sitemap-${partIndex}.xml`;
      const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${chunk.map(e => generateUrlXml(e.loc, e.lastmod)).join('\n')}\n</urlset>\n`;
      fs.writeFileSync(path.join(PUBLIC_DIR, filename), sitemapXml, 'utf8');
      sitemapFiles.push(filename);
      partIndex++;
    }

    const indexXml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapFiles.map(fn => `  <sitemap>\n    <loc>${BASE_URL}/${fn}</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>`).join('\n')}\n</sitemapindex>\n`;
    fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), indexXml, 'utf8');
    console.log(`[Sitemap] Successfully generated sitemap index with ${sitemapFiles.length} sub-sitemaps (${entries.length} total URLs).`);
  }
}

generateSitemap().catch(err => {
  console.error('[Sitemap] Critical error generating sitemap:', err);
  process.exit(0); // Exit 0 so build does not fail
});
