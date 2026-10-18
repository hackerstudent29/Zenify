import fs from 'fs';
import path from 'path';
import http from 'http';
import puppeteer from 'puppeteer';

const DIST_DIR = path.resolve('dist');
const API_URL = process.env.VITE_API_URL || 'https://zenify-production-f9b9.up.railway.app/api';

const STATIC_ROUTES = [
  '/',
  '/search',
  '/pricing',
  '/about-zenify',
  '/discover',
  '/privacy',
  '/terms',
  '/about',
  '/radio',
  '/local-library'
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.xml': 'application/xml',
  '.txt': 'text/plain'
};

function startStaticServer(cleanTemplateHtml) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rawPath = req.url.split('?')[0];
      const cleanPath = decodeURIComponent(rawPath);
      let filePath = path.join(DIST_DIR, cleanPath);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }

      if (!fs.existsSync(filePath)) {
        // Return 404 for missing static assets
        if (cleanPath.startsWith('/assets/') || path.extname(cleanPath)) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }
        // Always serve clean un-prerendered SPA template for browser navigation
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(cleanTemplateHtml);
        return;
      }

      // If root index.html is requested by browser navigation during prerender, serve clean template
      if (filePath === path.join(DIST_DIR, 'index.html')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(cleanTemplateHtml);
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      try {
        const data = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(err.message);
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      console.log(`[prerender] Local server running on http://127.0.0.1:${port}`);
      resolve({ server, port });
    });
  });
}

async function fetchDynamicRoutes() {
  const dynamicRoutes = [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${API_URL}/home/catalog`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data?.trendingTracks && Array.isArray(data.trendingTracks)) {
        data.trendingTracks.slice(0, 80).forEach(t => {
          if (t.id) dynamicRoutes.push(`/track/${t.id}`);
        });
      }
      if (data?.artists && Array.isArray(data.artists)) {
        data.artists.slice(0, 60).forEach(a => {
          if (a.id) dynamicRoutes.push(`/artist/${a.id}`);
        });
      }
      if (data?.trendingAlbums && Array.isArray(data.trendingAlbums)) {
        data.trendingAlbums.slice(0, 60).forEach(al => {
          if (al.id) dynamicRoutes.push(`/album/${al.id}`);
        });
      }
    }
  } catch (err) {
    console.log('[prerender] API unavailable for dynamic routes pre-rendering (skipping dynamic routes):', err.message);
  }
  return dynamicRoutes;
}

function deduplicateTags(html, expectedPath) {
  // 1. Deduplicate <title>
  const titles = [...html.matchAll(/<title>([^<]*)<\/title>/gi)];
  if (titles.length > 1) {
    const chosenTitle = titles[0][1];
    html = html.replace(/<title>[^<]*<\/title>/gi, '');
    html = html.replace('</head>', `<title>${chosenTitle}</title></head>`);
  }

  // 2. Deduplicate <link rel="canonical">
  const canonicals = [...html.matchAll(/<link\s+rel="canonical"\s+href="([^"]*)"[^>]*>/gi)];
  if (canonicals.length > 1) {
    // Pick the canonical matching the expectedPath
    const expectedCanonical = expectedPath === '/' || expectedPath === ''
      ? 'https://listenzenify.vercel.app/'
      : `https://listenzenify.vercel.app${expectedPath.startsWith('/') ? '' : '/'}${expectedPath}`;
    
    html = html.replace(/<link\s+rel="canonical"[^>]*>/gi, '');
    html = html.replace('</head>', `<link rel="canonical" href="${expectedCanonical}" /></head>`);
  }

  return html;
}

async function prerender() {
  const indexHtmlPath = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(indexHtmlPath)) {
    console.error('[prerender] dist/index.html does not exist! Run vite build first.');
    process.exit(1);
  }

  // Preserve the pristine un-prerendered Vite template
  const cleanTemplateHtml = fs.readFileSync(indexHtmlPath, 'utf8');

  const { server, port } = await startStaticServer(cleanTemplateHtml);
  const dynamicRoutes = await fetchDynamicRoutes();
  const allRoutes = [...new Set([...STATIC_ROUTES, ...dynamicRoutes])];

  console.log(`[prerender] Total routes to prerender: ${allRoutes.length}`);

  let rootPrerenderedHtml = null;
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    for (const route of allRoutes) {
      const page = await browser.newPage();
      try {
        const url = `http://127.0.0.1:${port}${route}`;
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 }).catch(async () => {
          await page.waitForSelector('#root', { timeout: 4000 }).catch(() => {});
        });

        await page.waitForFunction(
          () => {
            const root = document.querySelector('#root');
            return root && root.children.length > 0;
          },
          { timeout: 5000 }
        ).catch(() => {});

        await new Promise(r => setTimeout(r, 250));

        let html = await page.content();
        html = deduplicateTags(html, route);

        if (route === '/') {
          rootPrerenderedHtml = html;
        } else {
          const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
          const routeDir = path.join(DIST_DIR, cleanRoute);
          fs.mkdirSync(routeDir, { recursive: true });
          fs.writeFileSync(path.join(routeDir, 'index.html'), html, 'utf8');
          fs.writeFileSync(path.join(DIST_DIR, `${cleanRoute}.html`), html, 'utf8');
        }

        console.log(`  [OK] Prerendered: ${route}`);
      } catch (routeErr) {
        console.warn(`  [SKIP] Failed to prerender ${route}:`, routeErr.message);
      } finally {
        await page.close();
      }
    }

    // Finally overwrite dist/index.html with root prerendered HTML
    if (rootPrerenderedHtml) {
      fs.writeFileSync(indexHtmlPath, rootPrerenderedHtml, 'utf8');
      console.log('  [OK] Successfully wrote prerendered dist/index.html');
    }

  } catch (err) {
    console.error('[prerender] Error during prerendering:', err);
  } finally {
    if (browser) await browser.close();
    server.close();
    console.log('[prerender] Prerendering finished successfully.');
  }
}

prerender();
