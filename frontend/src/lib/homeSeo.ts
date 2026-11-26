export const HOMEPAGE_FAQS = [
  {
    question: "What is Zenify?",
    answer:
      "Zenify (v1.1.22) is a free, ad-free global music and music video streaming platform built for Web, PWA, and Android. Created by Ram Prasath (hackerstudent29 / Zendrum), it delivers 320kbps full-length audio, sub-second synced lyrics in 50+ languages, an interactive 177-country Sound Atlas, Studio FX DSP, 20 DJ crossfade styles, 16:9 4K Video Theater, and real-time Room Together sessions.",
  },
  {
    question: "How can I listen to music on Zenify for free?",
    answer:
      "Stream full-length 320kbps music directly in any browser at https://listenzenify.vercel.app or install the native Android APK (v1.1.22, Build 2036) with zero ads, zero paywalls, and zero subscription fees.",
  },
  {
    question: "How does Zenify's Sound Atlas global music discovery work?",
    answer:
      "Sound Atlas lets listeners explore trending charts, local scenes, and curated playlists across an interactive 177-country vector world map, 76 curated global music cities, and 11 dedicated regional country chart feeds spanning India, the United States, the United Kingdom, Germany, Canada, Australia, Japan, France, Brazil, South Korea, and the UAE.",
  },
  {
    question: "Does Zenify support synchronized lyrics and romanization?",
    answer:
      "Yes. Zenify features sub-second syllable-level karaoke lyrics and stationary plain full lyrics across 50+ languages including English, Tamil, Tanglish, Hindi, Malayalam, Telugu, Korean, Japanese, Spanish, French, Portuguese, and Arabic, complete with script romanization and automatic instrumental solo gap protection ([BGM], [Guitar Solo]).",
  },
  {
    question: "What Studio FX and DJ crossfade features are included?",
    answer:
      "The Web Player provides a Web Audio Studio FX suite with a 3-band biquad equalizer, 8D spatial binaural panning, convolution reverb (hall and cathedral), and live Nightcore/Daycore speed-and-pitch warping. The Android app adds 20 DJ-grade crossfade transition styles with 1-12 second customizable transitions powered by Media3 ExoPlayer 1.9.2.",
  },
  {
    question: "Can I watch 4K music videos and download songs offline?",
    answer:
      "Yes. Zenify includes a 16:9 4K Video Theater with seamless audio/video switching and background playback, plus offline song and .mp4 music video downloads on Android for uninterrupted offline listening without an internet connection.",
  },
  {
    question: "How does Room Together synchronized listening work?",
    answer:
      "Room Together lets up to 100 listeners stream in millisecond sync via shareable invite links or 6-character room codes. Rooms include collaborative queue controls, live voice/text chat, floating reactions, timestamped Story Moments, custom themes, and shareable session recaps.",
  },
  {
    question: "Does Zenify include Replay & Insights, Story Sharing, and Song Credits?",
    answer:
      "Yes. Replay & Insights analyzes your listening across 27 telemetry metrics for monthly and all-time recaps, Story Sharing exports 16 share card templates, and every track supports full Song Credits plus Pure OLED (#000000) dark mode.",
  },
  {
    question: "Can I play my own local audio files privately in Zenify?",
    answer:
      "Yes. Zenify includes an in-browser Local Audio Scanner that parses ID3 tags for MP3, FLAC, WAV, and AAC files completely on your device with 100% privacy and full EQ/8D Studio FX support.",
  },
  {
    question: "Which platforms and devices support Zenify v1.1.22?",
    answer:
      "Zenify runs globally on Web and installable PWA (Windows, macOS, Linux, ChromeOS, and iOS/iPadOS Safari) and offers a native Android 8.0+ APK (16.2 MB ARM64 or 36.8 MB Universal, Build 2036).",
  },
];

export const FEATURES = [
  {
    title: "Sound Atlas (177 Countries & 76 Cities)",
    body: "Explore global music scenes across an interactive 177-country world map, 76 curated cities, and 11 regional country chart feeds.",
  },
  {
    title: "Synced & Plain Lyrics (50+ Languages)",
    body: "Sub-second syllable synchronization, stationary plain full lyrics, script romanization, and clean instrumental solo gap protection.",
  },
  {
    title: "20 DJ Crossfade Styles & Gapless Audio",
    body: "Transition seamlessly with 20 DJ crossfade modes (1-12s), dual-buffer gapless playback, and background lock-screen controls.",
  },
  {
    title: "Studio FX, 3-Band EQ & 8D Spatial Audio",
    body: "Sculpt live sound with biquad bass/mids/treble filters, 360-degree binaural 8D panning, convolution reverb, and Nightcore/slowed pitch control.",
  },
  {
    title: "16:9 4K Video Theater & Offline Downloads",
    body: "Watch 16:9 HD/4K music videos with background audio continuity and save songs or .mp4 videos for offline playback on Android.",
  },
  {
    title: "Room Together, Replay Insights & Local Files",
    body: "Host 100-listener synced rooms, track 27 Replay metrics with 16 Story Share cards, inspect Song Credits, or play private local FLAC/MP3 files.",
  },
];

const organizationSchema = {
  "@type": "Organization",
  "@id": "https://listenzenify.vercel.app/#organization",
  name: "Zenify",
  alternateName: ["Zendrum", "ListenZenify"],
  url: "https://listenzenify.vercel.app/",
  logo: {
    "@type": "ImageObject",
    url: "https://listenzenify.vercel.app/favicon_z_512.png",
    width: 512,
    height: 512,
  },
  founder: {
    "@type": "Person",
    name: "Ram Prasath",
    alternateName: ["Ramanathan S", "hackerstudent29", "ramzendrum"],
    url: "https://github.com/hackerstudent29",
  },
  areaServed: "Worldwide",
  sameAs: ["https://github.com/hackerstudent29/Zenify", "https://github.com/hackerstudent29"],
};

const softwareAppSchema = {
  "@type": "SoftwareApplication",
  "@id": "https://listenzenify.vercel.app/#application",
  name: "Zenify Music & Video Streaming Platform",
  softwareVersion: "1.1.22",
  dateModified: "2026-11-25",
  operatingSystem: "Web Browser, Android 8.0+, iOS, Windows, macOS, Linux",
  applicationCategory: "MultimediaApplication",
  applicationSubCategory: "Music & Audio Streaming",
  inLanguage: ["en", "ta", "hi", "ml", "te", "ko", "ja", "es", "fr", "de", "pt", "ar"],
  countriesSupported: "Worldwide (177 countries in Sound Atlas)",
  publisher: { "@id": "https://listenzenify.vercel.app/#organization" },
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  description:
    "Zenify v1.1.22 is a free, open-source global music and video platform featuring Sound Atlas (177 countries, 76 cities), 320kbps full-length audio, sub-second synced lyrics in 50+ languages, Studio FX DSP (3-band EQ, 8D audio, reverb, pitch warper), 20 DJ crossfade styles, 16:9 4K Video Theater, Room Together (up to 100 listeners), Replay & Insights, and private local playback.",
  author: {
    "@type": "Person",
    name: "Ram Prasath",
    alternateName: ["hackerstudent29", "ramzendrum"],
    url: "https://github.com/hackerstudent29",
  },
  featureList: [
    "Sound Atlas Interactive World Map (177 Countries, 76 Curated Cities, 11 Regional Chart Feeds)",
    "Studio 3-Band Equalizer & Biquad Audio Filters",
    "8D Spatial Audio Binaural Panning Engine",
    "DJ Speed & Pitch Warper (Nightcore & Daycore Slowed Mode)",
    "Convolution Reverb Acoustic Simulation (Small Hall & Cathedral)",
    "20 DJ-Grade Crossfade Transition Styles with Dual-Buffer Gapless Engine",
    "Sub-Second AI Synchronized Lyrics & Stationary Plain Lyrics in 50+ Languages with Romanization",
    "Smart Instrumental & Solo Gap Protection ([BGM], [Guitar Solo])",
    "16:9 4K Video Theater with Background Play & Offline .mp4 Video Downloads",
    "Replay & Insights Personal Analytics (27 Listening Metrics) & 16 Story Share Templates",
    "Song Credits Sheet & Pure OLED #000000 Surface Theme",
    "Room Together Synchronized Live Listening for up to 100 Listeners with Chat, Moments & Recaps",
    "Browser Local Audio Scanner & In-Browser ID3 Tag Parser (MP3, FLAC, WAV, AAC)",
    "320kbps Full-Track Clean CDN Resolution with HTTP 206 Stream Proxy",
    "Native Android APK (v1.1.22, Build 2036, Media3 1.9.2) & Offline PWA",
  ],
};

const webSiteSchema = {
  "@type": "WebSite",
  "@id": "https://listenzenify.vercel.app/#website",
  name: "Zenify",
  alternateName: ["Zenify Music", "ListenZenify", "Zenify Web Player"],
  url: "https://listenzenify.vercel.app/",
  inLanguage: "en",
  publisher: { "@id": "https://listenzenify.vercel.app/#organization" },
  potentialAction: {
    "@type": "SearchAction",
    target: "https://listenzenify.vercel.app/discover?q={search_term_string}",
    "query-input": "required name=search_term_string",
  },
};

/** Home page: describes the app and organization. */
export const homeJsonLd = {
  "@context": "https://schema.org",
  "@graph": [webSiteSchema, organizationSchema, softwareAppSchema],
};

/** /faq page: FAQ markup lives where the questions are actually shown. */
export const faqJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "FAQPage",
      "@id": "https://listenzenify.vercel.app/faq#faq",
      mainEntity: HOMEPAGE_FAQS.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    },
  ],
};

