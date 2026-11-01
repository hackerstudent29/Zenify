export const HOMEPAGE_FAQS = [
  {
    question: "What is Zenify?",
    answer: "Zenify is a free, modern web and mobile music player featuring instant audio playback, sub-second synchronized lyrics, 8D spatial audio, and dynamic visualizer themes.",
  },
  {
    question: "How can I listen to music on Zenify for free?",
    answer: "You can stream music on Zenify directly in your web browser at listenzenify.vercel.app without paying any subscription fees or encountering audio interruptions.",
  },
  {
    question: "Does Zenify support synchronized lyrics?",
    answer: "Yes, Zenify includes an AI-powered lyrics alignment engine with syllable-level timing and instrumental solo gap protection across English, Tamil, Tanglish, Hindi, and international tracks.",
  },
  {
    question: "What audio effects and DSP features are built in?",
    answer: "Zenify includes a studio 3-band equalizer, binaural 8D spatial panning, convolution reverb simulations (hall and cathedral), and nightcore/slowed DJ pitch warper.",
  },
  {
    question: "Can I play my own local audio files in Zenify?",
    answer: "Yes! Zenify includes an in-browser local audio scanner that parses ID3 tags for MP3, FLAC, WAV, and AAC files directly on your device with 100% privacy.",
  },
];

export const FEATURES = [
  {
    title: "Synced lyrics",
    body: "Syllable-level timing for Tamil, Tanglish, Hindi, Malayalam and English songs, with instrumental gaps skipped cleanly.",
  },
  {
    title: "3-band equalizer",
    body: "Adjust bass, mids and treble with biquad filters built on the Web Audio API.",
  },
  {
    title: "8D audio",
    body: "Sound pans around your headphones in a full circle.",
  },
  {
    title: "Nightcore and slowed",
    body: "Change speed and pitch live for nightcore, daycore or slowed-and-reverb listening.",
  },
  {
    title: "Local files",
    body: "Play MP3, FLAC, WAV and AAC files from your device. Nothing is uploaded.",
  },
  {
    title: "Gapless playback",
    body: "A dual-buffer player gives gapless transitions and crossfade, with background playback and offline support as a PWA.",
  },
];

const softwareAppSchema = {
  "@type": "SoftwareApplication",
  "@id": "https://listenzenify.vercel.app/#application",
  name: "Zenify Music Streaming Platform",
  operatingSystem: "Web Browser, Android, iOS, Windows, macOS",
  applicationCategory: "MultimediaApplication",
  applicationSubCategory: "Music & Audio Streaming",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  description:
    "Zenify is a free open-source modern music streaming platform with Web Audio DSP effects (3-band EQ, 8D spatial audio, convolution reverb, DJ speed/pitch), sub-second AI synchronized multilingual lyrics, and local file playback.",
  author: { "@type": "Person", name: "hackerstudent29", url: "https://github.com/hackerstudent29" },
  featureList: [
    "Studio 3-Band Equalizer & Biquad Audio Filters",
    "8D Spatial Audio Binaural Panning Engine",
    "DJ Speed & Pitch Warper (Nightcore & Daycore Slowed Mode)",
    "Convolution Reverb Acoustic Simulation (Small Hall & Cathedral)",
    "Sub-Second AI Synchronized Lyrics (Tamil, Tanglish, Hindi, Malayalam, English)",
    "Smart Instrumental & Solo Gap Protection ([BGM], [Guitar Solo])",
    "Administrative Karaoke Lyric Sync Studio with LRC Export",
    "Real-Time Reactive Audio FFT Canvas Visualizer",
    "Liquid Glass UI with Dynamic Album Artwork Color Aura Extraction",
    "Browser Local Audio Scanner & In-Browser ID3 Tag Parser (MP3, FLAC, WAV, AAC)",
    "Dual-Buffer Gapless Web Audio Player with Crossfade",
    "Instant Clean CDN Audio Lookup with HTTP 206 Stream Proxy",
    "Dynamic Mood Stations (Deep Focus, Midnight Chill, Energy)",
    "Offline PWA with Lock-Screen MediaSession API Controls",
  ],
};

/** Home page: describes the app. */
export const homeJsonLd = {
  "@context": "https://schema.org",
  "@graph": [softwareAppSchema],
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

