import fs from 'fs';
import path from 'path';

const DIST_DIR = path.resolve('dist');

const ROUTE_DATA = {
  '/': {
    title: 'Zenify – Free Music Player with Synced Lyrics & 8D Audio',
    description: 'Free open-source web music player with sub-second synced lyrics for Tamil, Tanglish, Hindi & English, 8D audio, a 3-band EQ and nightcore/slowed effects.',
    canonical: 'https://listenzenify.vercel.app/',
    content: `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "SoftwareApplication",
            "@id": "https://listenzenify.vercel.app/#application",
            "name": "Zenify Music Streaming Platform",
            "operatingSystem": "Web Browser, Android, iOS, Windows, macOS",
            "applicationCategory": "MultimediaApplication",
            "applicationSubCategory": "Music & Audio Streaming",
            "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
            "description": "Zenify is a free open-source modern music streaming platform with Web Audio DSP effects (3-band EQ, 8D spatial audio, convolution reverb, DJ speed/pitch), sub-second AI synchronized multilingual lyrics, and local file playback."
          },
          {
            "@type": "FAQPage",
            "@id": "https://listenzenify.vercel.app/#faq",
            "mainEntity": [
              {
                "@type": "Question",
                "name": "What is Zenify?",
                "acceptedAnswer": { "@type": "Answer", "text": "Zenify is a free, modern web and mobile music player featuring instant audio playback, sub-second synchronized lyrics, 8D spatial audio, and dynamic visualizer themes." }
              },
              {
                "@type": "Question",
                "name": "How can I listen to music on Zenify for free?",
                "acceptedAnswer": { "@type": "Answer", "text": "You can stream music on Zenify directly in your web browser at listenzenify.vercel.app without paying any subscription fees or encountering audio interruptions." }
              },
              {
                "@type": "Question",
                "name": "Does Zenify support synchronized lyrics?",
                "acceptedAnswer": { "@type": "Answer", "text": "Yes, Zenify includes an AI-powered lyrics alignment engine with syllable-level timing and instrumental solo gap protection across English, Tamil, Tanglish, Hindi, and international tracks." }
              },
              {
                "@type": "Question",
                "name": "What audio effects and DSP features are built in?",
                "acceptedAnswer": { "@type": "Answer", "text": "Zenify includes a studio 3-band equalizer, binaural 8D spatial panning, convolution reverb simulations (hall and cathedral), and nightcore/slowed DJ pitch warper." }
              },
              {
                "@type": "Question",
                "name": "Can I play my own local audio files in Zenify?",
                "acceptedAnswer": { "@type": "Answer", "text": "Yes! Zenify includes an in-browser local audio scanner that parses ID3 tags for MP3, FLAC, WAV, and AAC files directly on your device with 100% privacy." }
              }
            ]
          }
        ]
      }
      </script>
      <section class="mt-16 mb-20 px-6 sm:px-10 max-w-6xl mx-auto border-t border-white/10 pt-12 text-zinc-300">
        <header class="mb-12">
          <h1 class="text-2xl sm:text-4xl font-black font-sans text-white tracking-tight leading-tight">
            Free Music Player with Synced Lyrics, 8D Audio & Equalizer
          </h1>
          <p class="mt-3 text-sm sm:text-base text-zinc-400 max-w-3xl leading-relaxed">
            Zenify is a high-performance open-source web music streaming platform designed for audiophiles and lyric enthusiasts. Stream millions of tracks ad-free, adjust precision acoustic frequencies, and experience real-time synchronized multilingual lyrics directly in your browser.
          </p>
        </header>

        <div class="mb-14">
          <h2 class="text-xl sm:text-2xl font-bold text-white tracking-tight mb-6">Core Audio & Streaming Features</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            <div class="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
              <h3 class="text-base font-bold text-white mb-2">Multilingual Synced Lyrics</h3>
              <p class="text-xs sm:text-sm text-zinc-400 leading-relaxed">Sub-second syllable-level lyric synchronization for Tamil, Tanglish, Hindi, Malayalam, and English songs with instrumental gap skip protection.</p>
            </div>
            <div class="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
              <h3 class="text-base font-bold text-white mb-2">Studio 3-Band Equalizer</h3>
              <p class="text-xs sm:text-sm text-zinc-400 leading-relaxed">Fine-tune bass, mids, and treble frequencies with professional biquad Web Audio filters calibrated for crystal-clear acoustic fidelity.</p>
            </div>
            <div class="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
              <h3 class="text-base font-bold text-white mb-2">8D Spatial Audio Panning</h3>
              <p class="text-xs sm:text-sm text-zinc-400 leading-relaxed">Immerse yourself in 360-degree binaural spatial audio that rotates dynamically around your headphone soundstage.</p>
            </div>
            <div class="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
              <h3 class="text-base font-bold text-white mb-2">Nightcore & Slowed Warper</h3>
              <p class="text-xs sm:text-sm text-zinc-400 leading-relaxed">Seamlessly shift playback speed and pitch in real-time to create custom nightcore, daycore, or slowed-and-reverb listening sessions.</p>
            </div>
            <div class="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
              <h3 class="text-base font-bold text-white mb-2">Local File Playback</h3>
              <p class="text-xs sm:text-sm text-zinc-400 leading-relaxed">Play your private MP3, FLAC, WAV, and AAC music files straight from your device with zero cloud uploads and full offline security.</p>
            </div>
            <div class="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
              <h3 class="text-base font-bold text-white mb-2">Lossless Crossfade & Cache</h3>
              <p class="text-xs sm:text-sm text-zinc-400 leading-relaxed">Dual-buffer audio pipeline enabling instantaneous gapless track transitions, background playback, and offline PWA capabilities.</p>
            </div>
          </div>
        </div>

        <div class="mb-10">
          <h2 class="text-xl sm:text-2xl font-bold text-white tracking-tight mb-6">Frequently Asked Questions</h2>
          <div class="space-y-6">
            <article class="border-b border-white/5 pb-5 last:border-b-0">
              <h3 class="text-base font-semibold text-white mb-2">What is Zenify?</h3>
              <p class="text-xs sm:text-sm text-zinc-400 leading-relaxed">Zenify is a free, modern web and mobile music player featuring instant audio playback, sub-second synchronized lyrics, 8D spatial audio, and dynamic visualizer themes.</p>
            </article>
            <article class="border-b border-white/5 pb-5 last:border-b-0">
              <h3 class="text-base font-semibold text-white mb-2">How can I listen to music on Zenify for free?</h3>
              <p class="text-xs sm:text-sm text-zinc-400 leading-relaxed">You can stream music on Zenify directly in your web browser at listenzenify.vercel.app without paying any subscription fees or encountering audio interruptions.</p>
            </article>
            <article class="border-b border-white/5 pb-5 last:border-b-0">
              <h3 class="text-base font-semibold text-white mb-2">Does Zenify support synchronized lyrics?</h3>
              <p class="text-xs sm:text-sm text-zinc-400 leading-relaxed">Yes, Zenify includes an AI-powered lyrics alignment engine with syllable-level timing and instrumental solo gap protection across English, Tamil, Tanglish, Hindi, and international tracks.</p>
            </article>
            <article class="border-b border-white/5 pb-5 last:border-b-0">
              <h3 class="text-base font-semibold text-white mb-2">What audio effects and DSP features are built in?</h3>
              <p class="text-xs sm:text-sm text-zinc-400 leading-relaxed">Zenify includes a studio 3-band equalizer, binaural 8D spatial panning, convolution reverb simulations (hall and cathedral), and nightcore/slowed DJ pitch warper.</p>
            </article>
            <article class="border-b border-white/5 pb-5 last:border-b-0">
              <h3 class="text-base font-semibold text-white mb-2">Can I play my own local audio files in Zenify?</h3>
              <p class="text-xs sm:text-sm text-zinc-400 leading-relaxed">Yes! Zenify includes an in-browser local audio scanner that parses ID3 tags for MP3, FLAC, WAV, and AAC files directly on your device with 100% privacy.</p>
            </article>
          </div>
        </div>
      </section>
    `
  },
  '/pricing': {
    title: 'Zenify Premium – Ad-Free High Fidelity Streaming & DSP',
    description: 'Unlock high-fidelity lossless FLAC audio streaming, studio equalizer presets, unlimited synchronized lyrics, and offline PWA listening with Zenify Premium.',
    canonical: 'https://listenzenify.vercel.app/pricing',
    content: `
      <main class="px-6 py-16 max-w-4xl mx-auto text-zinc-200">
        <h1 class="text-3xl font-black text-white mb-4">zenify Premium Plans</h1>
        <p class="text-zinc-400 mb-8 leading-relaxed">Experience uncompromised sound with Zenify Premium. 100% ad-free music streaming, 8D spatial audio engine, customizable equalizer, and offline caching.</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="p-6 rounded-2xl bg-zinc-900 border border-white/10">
            <h2 class="text-xl font-bold text-white mb-2">Free Plan</h2>
            <p class="text-zinc-400 text-sm">Full access to synced lyrics, 8D audio, and web radio.</p>
          </div>
          <div class="p-6 rounded-2xl bg-zinc-900 border border-brand/50">
            <h2 class="text-xl font-bold text-white mb-2">Eclipse Premium</h2>
            <p class="text-zinc-400 text-sm">Ultra-HD lossless streaming, priority audio processing, and zero interruptions.</p>
          </div>
        </div>
      </main>
    `
  },
  '/search': {
    title: 'Search Songs, Artists & Multilingual Lyrics – Zenify',
    description: 'Search millions of songs, tracks, albums, and artists with instant sub-second synchronized lyrics on Zenify.',
    canonical: 'https://listenzenify.vercel.app/search',
    content: `
      <main class="px-6 py-16 max-w-4xl mx-auto text-zinc-200">
        <h1 class="text-3xl font-black text-white mb-4">Search Music & Lyrics</h1>
        <p class="text-zinc-400 mb-8 leading-relaxed">Find your favorite tracks, artists, albums, and synchronized lyrics across English, Tamil, Hindi, and Malayalam music.</p>
      </main>
    `
  },
  '/about-zenify': {
    title: 'About Zenify – Next-Generation Web Music Player',
    description: 'Zenify is a high-performance open-source music streaming web platform featuring synchronized multilingual lyrics and studio audio effects.',
    canonical: 'https://listenzenify.vercel.app/about-zenify',
    content: `
      <main class="px-6 py-16 max-w-4xl mx-auto text-zinc-200">
        <h1 class="text-3xl font-black text-white mb-4">The architecture of pure sound.</h1>
        <p class="text-zinc-400 mb-8 leading-relaxed">Built for music enthusiasts who demand uncompromising playback speed, visual elegance, and syllable-accurate lyrics timing.</p>
      </main>
    `
  },
  '/discover': {
    title: 'Discover Trending Music, New Releases & Top Charts – Zenify',
    description: 'Explore trending tracks, top music charts, curated artist playlists, and new releases across multiple genres on Zenify.',
    canonical: 'https://listenzenify.vercel.app/discover',
    content: `
      <main class="px-6 py-16 max-w-4xl mx-auto text-zinc-200">
        <h1 class="text-3xl font-black text-white mb-4">Discover</h1>
        <p class="text-zinc-400 mb-8 leading-relaxed">Explore trending music, new album drops, and curated soundscapes tailored to your mood.</p>
      </main>
    `
  },
  '/privacy': {
    title: 'Privacy Policy – Zenify',
    description: 'Read the Zenify privacy policy to understand how we protect your personal data, audio cache, and listening preferences.',
    canonical: 'https://listenzenify.vercel.app/privacy',
    content: `
      <main class="px-6 py-16 max-w-4xl mx-auto text-zinc-200">
        <h1 class="text-3xl font-black text-white mb-4">Privacy Policy</h1>
        <p class="text-zinc-400 mb-8 leading-relaxed">Your privacy is fundamental to Zenify. We collect minimal telemetry strictly needed for session authentication and audio delivery.</p>
      </main>
    `
  },
  '/terms': {
    title: 'Terms of Service – Zenify',
    description: 'Review the terms of service governing use of the Zenify web music streaming application.',
    canonical: 'https://listenzenify.vercel.app/terms',
    content: `
      <main class="px-6 py-16 max-w-4xl mx-auto text-zinc-200">
        <h1 class="text-3xl font-black text-white mb-4">Terms of Service</h1>
        <p class="text-zinc-400 mb-8 leading-relaxed">By accessing Zenify, you agree to these Terms of Service. Stream responsibly and enjoy pure music fidelity.</p>
      </main>
    `
  },
  '/about': {
    title: 'About Zenify – Next-Generation Web Music Player',
    description: 'Learn about the mission, audio technology, and architecture behind the Zenify web streaming application.',
    canonical: 'https://listenzenify.vercel.app/about',
    content: `
      <main class="px-6 py-16 max-w-4xl mx-auto text-zinc-200">
        <h1 class="text-3xl font-black text-white mb-4">About Zenify</h1>
        <p class="text-zinc-400 mb-8 leading-relaxed">Zenify reimagines web audio streaming with real-time DSP effects, sub-second synchronized lyrics, and a responsive glassmorphic player.</p>
      </main>
    `
  },
  '/radio': {
    title: 'Live Radio & Non-Stop Frequency Stations – Zenify',
    description: 'Tune into non-stop live music frequencies, mood stations, and curated radio streams on Zenify.',
    canonical: 'https://listenzenify.vercel.app/radio',
    content: `
      <main class="px-6 py-16 max-w-4xl mx-auto text-zinc-200">
        <h1 class="text-3xl font-black text-white mb-4">Zenify Radio</h1>
        <p class="text-zinc-400 mb-8 leading-relaxed">Immerse yourself in continuous curated radio broadcasts and non-stop music frequencies.</p>
      </main>
    `
  },
  '/local-library': {
    title: 'Local Music Player & Offline Library – Zenify',
    description: 'Play local MP3, FLAC, WAV, and AAC audio files straight from your device in your web browser with Zenify local audio scanner.',
    canonical: 'https://listenzenify.vercel.app/local-library',
    content: `
      <main class="px-6 py-16 max-w-4xl mx-auto text-zinc-200">
        <h1 class="text-3xl font-black text-white mb-4">Local Audio Files</h1>
        <p class="text-zinc-400 mb-8 leading-relaxed">Stream your personal audio collection with zero cloud uploads and full Web Audio equalizer support.</p>
      </main>
    `
  }
};

function renderRouteHtml(baseTemplate, route, data) {
  let html = baseTemplate;

  // Replace Title
  html = html.replace(/<title>.*?<\/title>/is, `<title>${data.title}</title>`);
  html = html.replace(/<meta name="title" content=".*?" \/>/is, `<meta name="title" content="${data.title}" />`);

  // Replace Description
  html = html.replace(/<meta name="description" content=".*?" \/>/is, `<meta name="description" content="${data.description}" />`);

  // Add / Replace Canonical
  const canonicalTag = `<link rel="canonical" href="${data.canonical}" />`;
  if (html.includes('rel="canonical"')) {
    html = html.replace(/<link rel="canonical" href=".*?" \/>/is, canonicalTag);
  } else {
    html = html.replace('</head>', `  ${canonicalTag}\n  </head>`);
  }

  // OpenGraph & Twitter Meta Tags
  const ogTags = `
    <meta property="og:site_name" content="Zenify" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${data.canonical}" />
    <meta property="og:title" content="${data.title}" />
    <meta property="og:description" content="${data.description}" />
    <meta property="og:image" content="https://listenzenify.vercel.app/og-image.png" />
    <meta property="og:image:alt" content="${data.title}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="en_IN" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@zenifymusic" />
    <meta name="twitter:url" content="${data.canonical}" />
    <meta name="twitter:title" content="${data.title}" />
    <meta name="twitter:description" content="${data.description}" />
    <meta name="twitter:image" content="https://listenzenify.vercel.app/og-image.png" />
  `;

  // Strip existing og/twitter tags if any, then insert updated
  html = html.replace(/<meta property="og:.*?" content=".*?" \/>/gis, '');
  html = html.replace(/<meta name="twitter:.*?" content=".*?" \/>/gis, '');
  html = html.replace('</head>', `${ogTags}\n  </head>`);

  // Inject content inside #root container
  const rootReplacement = `<div id="root" class="h-full w-full flex flex-col">${data.content}</div>`;
  html = html.replace(/<div id="root"[^>]*>[\s\S]*?<\/div>/is, rootReplacement);

  return html;
}

function prerender() {
  const indexHtmlPath = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(indexHtmlPath)) {
    console.error('[prerender] dist/index.html does not exist! Run vite build first.');
    process.exit(1);
  }

  const baseTemplate = fs.readFileSync(indexHtmlPath, 'utf8');
  console.log(`[prerender] Generating static HTML for ${Object.keys(ROUTE_DATA).length} routes...`);

  let rootHtml = null;

  for (const [route, data] of Object.entries(ROUTE_DATA)) {
    const html = renderRouteHtml(baseTemplate, route, data);

    if (route === '/') {
      rootHtml = html;
    } else {
      const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
      const routeDir = path.join(DIST_DIR, cleanRoute);
      fs.mkdirSync(routeDir, { recursive: true });
      fs.writeFileSync(path.join(routeDir, 'index.html'), html, 'utf8');
      fs.writeFileSync(path.join(DIST_DIR, `${cleanRoute}.html`), html, 'utf8');
      console.log(`  [OK] Prerendered: ${route}`);
    }
  }

  if (rootHtml) {
    fs.writeFileSync(indexHtmlPath, rootHtml, 'utf8');
    console.log(`  [OK] Prerendered root: ${indexHtmlPath}`);
  }

  console.log('[prerender] Prerendering finished successfully.');
}

prerender();
