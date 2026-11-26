import fs from 'fs';
import path from 'path';

const DIST_DIR = path.resolve('dist');
const BASE_URL = 'https://listenzenify.vercel.app';

const ORGANIZATION_SCHEMA = {
  '@type': 'Organization',
  '@id': `${BASE_URL}/#organization`,
  name: 'Zenify',
  alternateName: ['Zendrum', 'ListenZenify'],
  url: `${BASE_URL}/`,
  logo: {
    '@type': 'ImageObject',
    url: `${BASE_URL}/favicon_z_512.png`,
    width: 512,
    height: 512,
  },
  founder: {
    '@type': 'Person',
    name: 'Ram Prasath',
    alternateName: ['Ramanathan S', 'hackerstudent29', 'ramzendrum'],
    url: 'https://github.com/hackerstudent29',
  },
  areaServed: 'Worldwide',
  sameAs: ['https://github.com/hackerstudent29/Zenify', 'https://github.com/hackerstudent29'],
};

const FAQ_ENTITIES = [
  {
    question: 'What is Zenify?',
    answer:
      'Zenify (v1.1.22) is a free, ad-free global music and music video streaming platform built for Web, PWA, and Android. Created by Ram Prasath (hackerstudent29 / Zendrum), it delivers 320kbps full-length audio, sub-second synced lyrics in 50+ languages, an interactive 177-country Sound Atlas, Studio FX DSP, 20 DJ crossfade styles, 16:9 4K Video Theater, and real-time Room Together sessions.',
  },
  {
    question: 'How can I listen to music on Zenify for free?',
    answer:
      'Stream full-length 320kbps music directly in any browser at https://listenzenify.vercel.app or install the native Android APK (v1.1.22, Build 2036) with zero ads, zero paywalls, and zero subscription fees.',
  },
  {
    question: "How does Zenify's Sound Atlas global music discovery work?",
    answer:
      'Sound Atlas lets listeners explore trending charts, local scenes, and curated playlists across an interactive 177-country vector world map, 76 curated global music cities, and 11 dedicated regional country chart feeds spanning India, the United States, the United Kingdom, Germany, Canada, Australia, Japan, France, Brazil, South Korea, and the UAE.',
  },
  {
    question: 'Does Zenify support synchronized lyrics and romanization?',
    answer:
      'Yes. Zenify features sub-second syllable-level karaoke lyrics and stationary plain full lyrics across 50+ languages including English, Tamil, Tanglish, Hindi, Malayalam, Telugu, Korean, Japanese, Spanish, French, Portuguese, and Arabic, complete with script romanization and automatic instrumental solo gap protection ([BGM], [Guitar Solo]).',
  },
  {
    question: 'What Studio FX and DJ crossfade features are included?',
    answer:
      'The Web Player provides a Web Audio Studio FX suite with a 3-band biquad equalizer, 8D spatial binaural panning, convolution reverb (hall and cathedral), and live Nightcore/Daycore speed-and-pitch warping. The Android app adds 20 DJ-grade crossfade transition styles with 1-12 second customizable transitions powered by Media3 ExoPlayer 1.9.2.',
  },
  {
    question: 'Can I watch 4K music videos and download songs offline?',
    answer:
      'Yes. Zenify includes a 16:9 4K Video Theater with seamless audio/video switching and background playback, plus offline song and .mp4 music video downloads on Android for uninterrupted offline listening without an internet connection.',
  },
  {
    question: 'How does Room Together synchronized listening work?',
    answer:
      'Room Together lets up to 100 listeners stream in millisecond sync via shareable invite links or 6-character room codes. Rooms include collaborative queue controls, live voice/text chat, floating reactions, timestamped Story Moments, custom themes, and shareable session recaps.',
  },
  {
    question: 'Does Zenify include Replay & Insights, Story Sharing, and Song Credits?',
    answer:
      'Yes. Replay & Insights analyzes your listening across 27 telemetry metrics for monthly and all-time recaps, Story Sharing exports 16 share card templates, and every track supports full Song Credits plus Pure OLED (#000000) dark mode.',
  },
  {
    question: 'Can I play my own local audio files privately in Zenify?',
    answer:
      'Yes. Zenify includes an in-browser Local Audio Scanner that parses ID3 tags for MP3, FLAC, WAV, and AAC files completely on your device with 100% privacy and full EQ/8D Studio FX support.',
  },
  {
    question: 'Which platforms and devices support Zenify v1.1.22?',
    answer:
      'Zenify runs globally on Web and installable PWA (Windows, macOS, Linux, ChromeOS, and iOS/iPadOS Safari) and offers a native Android 8.0+ APK (16.2 MB ARM64 or 36.8 MB Universal, Build 2036).',
  },
];

function jsonLdScript(obj) {
  return `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n</script>`;
}

const ROUTE_DATA = {
  '/': {
    title: 'Zenify – Global Ad-Free Music Player, Sound Atlas, Synced Lyrics & 8D Audio',
    description:
      'Stream 320kbps music & 4K videos worldwide free. Explore 177-country Sound Atlas, synced lyrics in 50+ languages, 20 DJ crossfades, Studio FX 8D audio & Room Together.',
    canonical: `${BASE_URL}/`,
    content: `
      ${jsonLdScript({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            '@id': `${BASE_URL}/#website`,
            name: 'Zenify',
            alternateName: ['Zenify Music', 'ListenZenify', 'Zenify Web Player'],
            url: `${BASE_URL}/`,
            inLanguage: 'en',
            publisher: { '@id': `${BASE_URL}/#organization` },
            potentialAction: {
              '@type': 'SearchAction',
              target: `${BASE_URL}/discover?q={search_term_string}`,
              'query-input': 'required name=search_term_string',
            },
          },
          ORGANIZATION_SCHEMA,
          {
            '@type': 'SoftwareApplication',
            '@id': `${BASE_URL}/#application`,
            name: 'Zenify Music & Video Streaming Platform',
            softwareVersion: '1.1.22',
            dateModified: '2026-11-25',
            operatingSystem: 'Web Browser, Android 8.0+, iOS, Windows, macOS, Linux',
            applicationCategory: 'MultimediaApplication',
            applicationSubCategory: 'Music & Audio Streaming',
            inLanguage: ['en', 'ta', 'hi', 'ml', 'te', 'ko', 'ja', 'es', 'fr', 'de', 'pt', 'ar'],
            countriesSupported: 'Worldwide (177 countries in Sound Atlas)',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            description:
              'Zenify v1.1.22 is a free open-source global music and 4K video streaming platform with Sound Atlas (177 countries, 76 cities), Web Audio & Media3 Studio FX DSP, 20 DJ crossfades, 50+ language synced lyrics, Room Together, Replay & Insights, and private local file playback.',
          },
          {
            '@type': 'FAQPage',
            '@id': `${BASE_URL}/#faq`,
            mainEntity: FAQ_ENTITIES.map((faq) => ({
              '@type': 'Question',
              name: faq.question,
              acceptedAnswer: { '@type': 'Answer', text: faq.answer },
            })),
          },
        ],
      })}
      <section class="mt-16 mb-20 px-6 sm:px-10 max-w-6xl mx-auto border-t border-white/10 pt-12 text-zinc-300">
        <header class="mb-12">
          <h1 class="text-2xl sm:text-4xl font-black font-sans text-white tracking-tight leading-tight">
            Global Ad-Free Music Player with Sound Atlas, Synced Lyrics & 4K Video
          </h1>
          <p class="mt-3 text-sm sm:text-base text-zinc-400 max-w-3xl leading-relaxed">
            Zenify (v1.1.22) is an open-source, zero-ad global music and music video platform built for audiophiles, explorers, and lyric lovers. Stream full-length 320kbps tracks, explore 177 countries via Sound Atlas, tune Studio FX DSP, watch 16:9 4K videos, and listen together in real time across Web, PWA, and Android.
          </p>
        </header>

        <div class="mb-14">
          <h2 class="text-xl sm:text-2xl font-bold text-white tracking-tight mb-6">Core Global Features (v1.1.22)</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            <div class="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
              <h3 class="text-base font-bold text-white mb-2">Sound Atlas (177 Countries, 76 Cities)</h3>
              <p class="text-xs sm:text-sm text-zinc-400 leading-relaxed">Interactive vector world map spanning 177 countries, 76 curated cities, and 11 live country chart feeds.</p>
            </div>
            <div class="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
              <h3 class="text-base font-bold text-white mb-2">Synced & Plain Lyrics (50+ Languages)</h3>
              <p class="text-xs sm:text-sm text-zinc-400 leading-relaxed">Sub-second syllable timing, stationary plain full lyrics, automatic script romanization, and solo gap detection.</p>
            </div>
            <div class="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
              <h3 class="text-base font-bold text-white mb-2">20 DJ Crossfades & Studio FX</h3>
              <p class="text-xs sm:text-sm text-zinc-400 leading-relaxed">Studio 3-band EQ, 8D spatial audio, convolution reverb, Nightcore pitch warper, and 20 DJ transition styles.</p>
            </div>
            <div class="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
              <h3 class="text-base font-bold text-white mb-2">16:9 4K Video Theater & Offline Downloads</h3>
              <p class="text-xs sm:text-sm text-zinc-400 leading-relaxed">Watch HD/4K music videos cleanly with background audio playback and save songs or .mp4 videos offline on Android.</p>
            </div>
            <div class="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
              <h3 class="text-base font-bold text-white mb-2">Room Together (Up to 100 Listeners)</h3>
              <p class="text-xs sm:text-sm text-zinc-400 leading-relaxed">Millisecond-synced listening rooms with shared DJ queues, voice/text chat, reactions, Story Moments, and recaps.</p>
            </div>
            <div class="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
              <h3 class="text-base font-bold text-white mb-2">Replay Insights, Story Cards & Local Files</h3>
              <p class="text-xs sm:text-sm text-zinc-400 leading-relaxed">27 Replay listening metrics, 16 Story Share templates, full Song Credits, Pure OLED mode, and private FLAC/MP3 playback.</p>
            </div>
          </div>
        </div>

        <div class="mb-14">
          <h2 class="text-xl sm:text-2xl font-bold text-white tracking-tight mb-6">Zenify Platform Comparison</h2>
          <table>
            <thead>
              <tr><th>Capability</th><th>Zenify v1.1.22 (Free)</th><th>Traditional Paid Plans</th></tr>
            </thead>
            <tbody>
              <tr><td>Monthly Cost & Audio Ads</td><td>$0 Forever, Zero Ads</td><td>Paid Tier or Ad Interruptions</td></tr>
              <tr><td>Audio & Video Formats</td><td>320kbps Full Audio + 16:9 4K Video Theater</td><td>Limited by Plan or Region</td></tr>
              <tr><td>Global Music Map</td><td>Sound Atlas (177 Countries, 76 Cities, 11 Feeds)</td><td>Basic Regional Charts</td></tr>
              <tr><td>DSP & Transitions</td><td>3-Band EQ, 8D Audio, 20 DJ Crossfades (1-12s)</td><td>Basic Equalizer Only</td></tr>
              <tr><td>Source Code & Privacy</td><td>MIT Open Source, Private On-Device Local Files</td><td>Closed Source Telemetry</td></tr>
            </tbody>
          </table>
        </div>

        <div class="mb-10">
          <h2 class="text-xl sm:text-2xl font-bold text-white tracking-tight mb-6">Frequently Asked Questions</h2>
          <div class="space-y-6">
            ${FAQ_ENTITIES.map(
              (faq) => `<article class="border-b border-white/5 pb-5 last:border-b-0">
              <h3 class="text-base font-semibold text-white mb-2">${faq.question}</h3>
              <p class="text-xs sm:text-sm text-zinc-400 leading-relaxed">${faq.answer}</p>
            </article>`
            ).join('\n            ')}
          </div>
        </div>
      </section>
    `,
  },
  '/search': {
    title: 'Search Global Songs, Artists & 50+ Language Lyrics – Zenify',
    description:
      'Search millions of global songs, albums, artists, and 4K music videos with instant 320kbps playback and synced lyrics in 50+ languages.',
    canonical: `${BASE_URL}/search`,
    content: `
      ${jsonLdScript({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'SearchResultsPage',
            '@id': `${BASE_URL}/search#page`,
            url: `${BASE_URL}/search`,
            name: 'Search Global Songs, Artists & 50+ Language Lyrics – Zenify',
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
              { '@type': 'ListItem', position: 2, name: 'Search', item: `${BASE_URL}/search` },
            ],
          },
        ],
      })}
      <main class="px-6 py-16 max-w-4xl mx-auto text-zinc-200">
        <h1 class="text-3xl font-black text-white mb-4">Search Global Music & Synced Lyrics</h1>
        <p class="text-zinc-400 mb-8 leading-relaxed">Find full-length 320kbps tracks, 4K music videos, artists, albums, and synchronized lyrics across English, Tamil, Hindi, Malayalam, Korean, Japanese, Spanish, French, Portuguese, and 50+ languages.</p>
      </main>
    `,
  },
  '/about-zenify': {
    title: 'About Zenify v1.1.22 – Global Music, Sound Atlas, Synced Lyrics & Studio FX',
    description:
      'Explore Zenify v1.1.22: Sound Atlas (177 countries), Studio FX 3-band EQ, 8D spatial audio, 20 DJ crossfades, 4K Video Theater & 50+ language synced lyrics.',
    canonical: `${BASE_URL}/about-zenify`,
    content: `
      ${jsonLdScript({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'AboutPage',
            '@id': `${BASE_URL}/about-zenify#page`,
            url: `${BASE_URL}/about-zenify`,
            name: 'About Zenify Music Platform',
            mainEntity: { '@id': `${BASE_URL}/#application` },
          },
          ORGANIZATION_SCHEMA,
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
              { '@type': 'ListItem', position: 2, name: 'About Zenify', item: `${BASE_URL}/about-zenify` },
            ],
          },
        ],
      })}
      <main class="px-6 py-16 max-w-4xl mx-auto text-zinc-200">
        <h1 class="text-3xl font-black text-white mb-4">The Architecture of Pure Sound (v1.1.22)</h1>
        <p class="text-zinc-400 mb-8 leading-relaxed">Built for music lovers worldwide who demand 320kbps audio fidelity, 177-country Sound Atlas exploration, 20 DJ crossfades, 16:9 4K Video Theater, Replay & Insights, and sub-second lyrics timing in 50+ languages with zero ads.</p>
      </main>
    `,
  },
  '/discover': {
    title: 'Discover Global Charts, New Releases & Sound Atlas – Zenify',
    description:
      'Explore global trending charts across 11 country feeds and 177 Sound Atlas regions, newly released albums, 4K videos, and playlists on Zenify.',
    canonical: `${BASE_URL}/discover`,
    content: `
      ${jsonLdScript({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'CollectionPage',
            '@id': `${BASE_URL}/discover#page`,
            url: `${BASE_URL}/discover`,
            name: 'Discover Global Charts, New Releases & Sound Atlas – Zenify',
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
              { '@type': 'ListItem', position: 2, name: 'Discover', item: `${BASE_URL}/discover` },
            ],
          },
        ],
      })}
      <main class="px-6 py-16 max-w-4xl mx-auto text-zinc-200">
        <h1 class="text-3xl font-black text-white mb-4">Discover Global Music & Sound Atlas</h1>
        <p class="text-zinc-400 mb-8 leading-relaxed">Explore trending music, 11 country chart feeds, 177 Sound Atlas territories, 76 curated music cities, new album drops, and 4K music videos.</p>
      </main>
    `,
  },
  '/privacy': {
    title: 'Privacy Policy – Zenify',
    description:
      'Read the Zenify privacy policy to understand how we protect your personal data, local audio playback, IndexedDB cache, and zero-ad privacy architecture.',
    canonical: `${BASE_URL}/privacy`,
    content: `
      <main class="px-6 py-16 max-w-4xl mx-auto text-zinc-200">
        <h1 class="text-3xl font-black text-white mb-4">Privacy Policy</h1>
        <p class="text-zinc-400 mb-8 leading-relaxed">Your privacy is fundamental to Zenify. Zero ad trackers, private on-device local file scanning, and minimal data strictly for optional account sync and audio delivery.</p>
      </main>
    `,
  },
  '/terms': {
    title: 'Terms of Service – Zenify',
    description:
      'Review the terms of service governing use of the Zenify Web Player, PWA, and Android streaming application.',
    canonical: `${BASE_URL}/terms`,
    content: `
      <main class="px-6 py-16 max-w-4xl mx-auto text-zinc-200">
        <h1 class="text-3xl font-black text-white mb-4">Terms of Service</h1>
        <p class="text-zinc-400 mb-8 leading-relaxed">By accessing Zenify, you agree to these Terms of Service. Stream responsibly and enjoy open-source audio and video fidelity.</p>
      </main>
    `,
  },
  '/about': {
    title: 'Ram Prasath (hackerstudent29) – Creator & Producer of Zenify',
    description:
      'Meet Ram Prasath (@ramzendrum), music producer and open-source software engineer from Chennai building Zenify v1.1.22 for ad-free global audio.',
    canonical: `${BASE_URL}/about`,
    content: `
      ${jsonLdScript({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'ProfilePage',
            '@id': `${BASE_URL}/about#profile`,
            url: `${BASE_URL}/about`,
            name: 'Ram Prasath – Creator & Developer of Zenify',
            mainEntity: {
              '@type': 'Person',
              name: 'Ram Prasath',
              alternateName: ['Ram', 'Ramanathan S', 'ramzendrum', 'hackerstudent29'],
              jobTitle: 'Music Producer & Full-Stack Software Engineer',
              homeLocation: { '@type': 'Place', name: 'Chennai, India' },
              sameAs: [
                'https://github.com/hackerstudent29',
                'https://github.com/hackerstudent29/Zenify',
                'https://www.instagram.com/ramzendrum?igsh=MXBkYXE4YnZmdHN0A==',
                'https://open.spotify.com/artist/3imsDaYqTYfQZ8ZhSjMD4T?si=PcXvQrghS5O7Y65u5eIc6A',
              ],
            },
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
              { '@type': 'ListItem', position: 2, name: 'About Creator', item: `${BASE_URL}/about` },
            ],
          },
        ],
      })}
      <main class="px-6 py-16 max-w-4xl mx-auto text-zinc-200">
        <h1 class="text-3xl font-black text-white mb-4">Ram Prasath – Creator of Zenify</h1>
        <p class="text-zinc-400 mb-8 leading-relaxed">Music producer and full-stack software developer from Chennai, India (@ramzendrum / hackerstudent29), engineering Zenify v1.1.22 for ad-free global sound and synced lyrics.</p>
      </main>
    `,
  },
  '/radio': {
    title: 'Zenify Radio – Non-Stop Global Stations, Moods & Focus Streams',
    description:
      'Tune in to ad-free 24/7 radio channels for deep focus, midnight chill, workout energy, and global moods on Zenify Radio.',
    canonical: `${BASE_URL}/radio`,
    content: `
      ${jsonLdScript({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebPage',
            '@id': `${BASE_URL}/radio#page`,
            url: `${BASE_URL}/radio`,
            name: 'Zenify Radio – Continuous Global Mood & Focus Stations',
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
              { '@type': 'ListItem', position: 2, name: 'Radio', item: `${BASE_URL}/radio` },
            ],
          },
        ],
      })}
      <main class="px-6 py-16 max-w-4xl mx-auto text-zinc-200">
        <h1 class="text-3xl font-black text-white mb-4">Zenify Radio</h1>
        <p class="text-zinc-400 mb-8 leading-relaxed">Immerse yourself in continuous curated radio broadcasts, focus stations, and non-stop global music frequencies.</p>
      </main>
    `,
  },
  '/local-library': {
    title: 'Local Audio Player – Play MP3, FLAC & WAV Privately | Zenify',
    description:
      'Play local MP3, FLAC, WAV, and AAC audio files offline in your browser with ID3 tag parsing, 3-band EQ, 8D spatial audio, and 100% on-device privacy.',
    canonical: `${BASE_URL}/local-library`,
    content: `
      ${jsonLdScript({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebApplication',
            '@id': `${BASE_URL}/local-library#app`,
            url: `${BASE_URL}/local-library`,
            name: 'Zenify Local Audio Player',
            applicationCategory: 'MultimediaApplication',
            operatingSystem: 'Web Browser',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
              { '@type': 'ListItem', position: 2, name: 'Local Library', item: `${BASE_URL}/local-library` },
            ],
          },
        ],
      })}
      <main class="px-6 py-16 max-w-4xl mx-auto text-zinc-200">
        <h1 class="text-3xl font-black text-white mb-4">Local Audio Files</h1>
        <p class="text-zinc-400 mb-8 leading-relaxed">Stream your personal MP3, FLAC, WAV, and AAC audio collection with zero cloud uploads and full Web Audio Studio FX equalizer support.</p>
      </main>
    `,
  },
  '/download': {
    title: 'Download Zenify APK (v1.1.22) & PWA – Global Music & 4K Video App',
    description:
      'Download Zenify v1.1.22 Android APK (16.2 MB ARM64 / 36.8 MB Universal) or install the global PWA. 320kbps audio, Sound Atlas, 4K Video & synced lyrics.',
    canonical: `${BASE_URL}/download`,
    content: `
      ${jsonLdScript({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'MobileApplication',
            '@id': `${BASE_URL}/download#mobile-app`,
            name: 'Zenify Music Player',
            operatingSystem: 'Android 8.0+ (API 26+)',
            softwareVersion: '1.1.22',
            datePublished: '2026-11-25',
            fileSize: '16.2 MB',
            applicationCategory: 'MultimediaApplication',
            applicationSubCategory: 'Music & Audio',
            inLanguage: ['en', 'ta', 'hi', 'ml', 'te', 'ko', 'ja', 'es', 'fr', 'de', 'pt', 'ar'],
            downloadUrl: `${BASE_URL}/downloads/zenify.apk`,
            installUrl: `${BASE_URL}/download`,
            screenshot: `${BASE_URL}/og-image.png`,
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            publisher: { '@id': `${BASE_URL}/#organization` },
            description:
              'Free ad-free Android music and 4K video player (v1.1.22, Build 2036) with 320kbps streaming, Sound Atlas (177 countries), 20 DJ crossfades, Room Together, native Studio FX DSP, and synced lyrics.',
          },
          {
            '@type': 'HowTo',
            '@id': `${BASE_URL}/download#install-android`,
            name: 'How to Install Zenify v1.1.22 on Android',
            totalTime: 'PT2M',
            step: [
              { '@type': 'HowToStep', position: 1, name: 'Download the Zenify APK', text: 'Download zenify-v1.1.22.apk (16.2 MB ARM64) or the 36.8 MB Universal APK from listenzenify.vercel.app/download.' },
              { '@type': 'HowToStep', position: 2, name: 'Open APK in Chrome or Files', text: 'Tap the completed APK file in your Android notification shade or Downloads folder.' },
              { '@type': 'HowToStep', position: 3, name: 'Allow Unknown Apps for Installer', text: 'Grant Allow from this source if Android prompts during your first sideload installation.' },
              { '@type': 'HowToStep', position: 4, name: 'Install and Launch Zenify', text: 'Tap Install and open Zenify (com.zenify.mobile) to stream ad-free music globally.' },
            ],
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
              { '@type': 'ListItem', position: 2, name: 'Download', item: `${BASE_URL}/download` },
            ],
          },
        ],
      })}
      <main class="px-6 py-16 max-w-4xl mx-auto text-zinc-200">
        <h1 class="text-3xl font-black text-white mb-4">Get Zenify v1.1.22 on Android, iOS & Desktop</h1>
        <p class="text-zinc-400 mb-8 leading-relaxed">Download Zenify v1.1.22 (Build 2036, com.zenify.mobile) in 16.2 MB ARM64 or 36.8 MB Universal APK editions, or install as a standalone global PWA on iPhone, iPad, Windows, macOS, and Linux.</p>
      </main>
    `,
  },
  '/together': {
    title: 'Room Together – Listen to Music in Live Global Sync | Zenify',
    description:
      'Host or join live Room Together listening parties for up to 100 friends. Synced queues, voice chat, reactions, Story Moments & session recaps.',
    canonical: `${BASE_URL}/together`,
    content: `
      ${jsonLdScript({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebPage',
            '@id': `${BASE_URL}/together#page`,
            url: `${BASE_URL}/together`,
            name: 'Room Together – Listen in Live Global Sync | Zenify',
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
              { '@type': 'ListItem', position: 2, name: 'Room Together', item: `${BASE_URL}/together` },
            ],
          },
        ],
      })}
      <main class="px-6 py-16 max-w-4xl mx-auto text-zinc-200">
        <h1 class="text-3xl font-black text-white mb-4">Room Together – Listen in Live Global Sync</h1>
        <p class="text-zinc-400 mb-8 leading-relaxed">Host real-time synchronized listening rooms for up to 100 participants with shared DJ queues, timestamped Story Moments, live reactions, LiveKit voice rooms, and shareable session recaps across Web and Android.</p>
      </main>
    `,
  },
  '/faq': {
    title: 'Zenify Features & Frequently Asked Questions (FAQ)',
    description:
      'Answers about Zenify v1.1.22 free streaming, Sound Atlas (177 countries), 20 DJ crossfades, Studio FX 8D audio, 4K videos & 50+ language lyrics.',
    canonical: `${BASE_URL}/faq`,
    content: `
      ${jsonLdScript({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'FAQPage',
            '@id': `${BASE_URL}/faq#faq`,
            mainEntity: FAQ_ENTITIES.map((faq) => ({
              '@type': 'Question',
              name: faq.question,
              acceptedAnswer: { '@type': 'Answer', text: faq.answer },
            })),
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
              { '@type': 'ListItem', position: 2, name: 'Features & FAQ', item: `${BASE_URL}/faq` },
            ],
          },
        ],
      })}
      <main class="px-6 py-16 max-w-4xl mx-auto text-zinc-200">
        <h1 class="text-3xl font-black text-white mb-4">Zenify Features & FAQ</h1>
        <p class="text-zinc-400 mb-8 leading-relaxed">Everything you need to know about Zenify v1.1.22 global ad-free music and video streaming, Sound Atlas (177 countries), 20 DJ crossfades, Studio FX DSP, synced lyrics in 50+ languages, and private local playback.</p>
        <div class="space-y-6">
          ${FAQ_ENTITIES.map(
            (faq) => `<article class="border-b border-white/5 pb-5 last:border-b-0">
            <h2 class="text-base font-semibold text-white mb-2">${faq.question}</h2>
            <p class="text-xs sm:text-sm text-zinc-400 leading-relaxed">${faq.answer}</p>
          </article>`
          ).join('\n          ')}
        </div>
      </main>
    `,
  },
};

function renderRouteHtml(baseTemplate, _route, data) {
  let html = baseTemplate;

  // Replace Title
  html = html.replace(/<title>.*?<\/title>/is, `<title>${data.title}</title>`);
  html = html.replace(/<meta name="title" content=".*?" \/>/is, `<meta name="title" content="${data.title}" />`);

  // Replace Description
  html = html.replace(/<meta name="description" content=".*?" \/>/is, `<meta name="description" content="${data.description}" />`);

  // Replace Canonical & Hreflang Links per route
  const canonicalTag = `<link rel="canonical" href="${data.canonical}" />`;
  const hreflangTags = [
    `<link rel="alternate" hreflang="en" href="${data.canonical}" />`,
    `<link rel="alternate" hreflang="en-US" href="${data.canonical}" />`,
    `<link rel="alternate" hreflang="en-IN" href="${data.canonical}" />`,
    `<link rel="alternate" hreflang="en-GB" href="${data.canonical}" />`,
    `<link rel="alternate" hreflang="x-default" href="${data.canonical}" />`,
  ].join('\n    ');

  html = html.replace(/<link\s+rel="alternate"\s+hreflang="[^"]*"\s+href="[^"]*"\s*\/>/gis, '');
  if (html.includes('rel="canonical"')) {
    html = html.replace(/<link\s+rel="canonical"\s+href=".*?"\s*\/>/is, `${canonicalTag}\n    ${hreflangTags}`);
  } else {
    html = html.replace('</head>', `  ${canonicalTag}\n    ${hreflangTags}\n  </head>`);
  }

  // OpenGraph & Twitter Meta Tags
  const ogTags = `
    <meta property="og:site_name" content="Zenify" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${data.canonical}" />
    <meta property="og:title" content="${data.title}" />
    <meta property="og:description" content="${data.description}" />
    <meta property="og:image" content="${BASE_URL}/og-image.png" />
    <meta property="og:image:alt" content="${data.title}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:locale:alternate" content="en_IN" />
    <meta property="og:locale:alternate" content="en_GB" />
    <meta property="og:locale:alternate" content="en_CA" />
    <meta property="og:locale:alternate" content="en_AU" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@zenifymusic" />
    <meta name="twitter:url" content="${data.canonical}" />
    <meta name="twitter:title" content="${data.title}" />
    <meta name="twitter:description" content="${data.description}" />
    <meta name="twitter:image" content="${BASE_URL}/og-image.png" />
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
