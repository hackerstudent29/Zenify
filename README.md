<div align="center">
  <br />
  <a href="https://listenzenify.vercel.app">
    <img src="assets/images/zenify_logo_animation.gif" alt="Zenify Open Source Music Streaming App Logo Animation" width="600" />
  </a>
  <br />
  <br />
  <h1>Zenify: Free Open-Source Music Streaming App with Synced Lyrics</h1>
  <p>
    <b>Ad-free Spotify alternative • Synced Tamil, Hindi, Malayalam & English lyrics • Studio EQ & 8D audio • Web + Android</b>
  </p>
  <p>
    <em>Listen to music online for free with synchronized lyrics for Tamil, Tanglish, Hindi, Malayalam & English. Ad-free, fast streaming, and cross-platform listening.</em>
  </p>

  <p>
    <a href="https://listenzenify.vercel.app"><img src="https://img.shields.io/badge/🚀_Try_Live_Web_App-listenzenify.vercel.app-E11D48?style=for-the-badge&logo=vercel&logoColor=white" alt="Live Demo" /></a>
    <a href="https://github.com/hackerstudent29/Zenify/releases"><img src="https://img.shields.io/badge/�_Download_APK-Releases-0078D4?style=for-the-badge&logo=android&logoColor=white" alt="Download APK" /></a>
    <a href="DEVELOPER.md"><img src="https://img.shields.io/badge/🛠️_Developer_Guide-DEVELOPER.md-18181B?style=for-the-badge&logo=git&logoColor=white" alt="Developer Guide" /></a>
    <a href="https://github.com/hackerstudent29/Zenify"><img src="https://img.shields.io/github/stars/hackerstudent29/Zenify?style=for-the-badge&color=gold" alt="GitHub Stars" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT License" /></a>
  </p>

  <p>
    <em>Built with ❤️ by <a href="https://github.com/hackerstudent29"><b>Ramanathan S</b></a></em>
  </p>
</div>

---

## 📸 Screenshots & Demo

| 🎵 Home Dashboard | 🎤 Synced Lyrics | 🎛️ Studio FX Engine |
| :---: | :---: | :---: |
| <img src="assets/screenshots/zenify_home_dashboard.png" alt="Home Dashboard" width="100%" /> | <img src="assets/screenshots/zenify_synced_lyrics.png" alt="Synced Lyrics" width="100%" /> | <img src="assets/screenshots/zenify_fullview_player.png" alt="Studio FX Player" width="100%" /> |

---

## 🚀 Quick Start

**Web (No Installation Required):**
1. Visit **[listenzenify.vercel.app](https://listenzenify.vercel.app)**
2. Search for any song and start playing instantly
3. Enjoy synced lyrics, Studio FX, and offline local file playback

**Install as PWA (Web App):**
- Click **"Install"** on your browser (Chrome, Edge, Firefox, Safari)
- Add to home screen on mobile for native app experience
- Full offline support + lock screen controls

**Android APK:**
- Download latest from **[Releases](https://github.com/hackerstudent29/Zenify/releases)**
- No Play Store required, full permissions control

---

## ⚡ What is Zenify?

**Zenify** is an **open-source music streaming platform** built for music lovers who value pristine audio quality, comprehensive multilingual synced lyrics, and professional-grade audio customization. Born from the need for better regional language support and transparent audio processing, Zenify combines the best of modern streaming with studio-grade audio tools.

Unlike commercial platforms that treat non-English content as secondary, Zenify provides **karaoke-grade synchronized lyrics** with **Deepgram AI-powered onset alignment** for perfect timing, **automatic romanization** for 9 Indian languages, and **intelligent instrumental gap detection**. The built-in **Studio FX Engine** delivers hardware-accelerated audio DSP (3-band EQ, 8D spatial audio, vocal isolation, reorderable FX chain) alongside **vibe-based smart recommendations**, an **in-browser local file player**, and a stunning **liquid glassmorphism UI** with palette-reactive backgrounds.

> 🎧 **Start listening immediately:** Visit **[listenzenify.vercel.app](https://listenzenify.vercel.app)** — no account or download required!

---

## ✨ Why Listen on Zenify?

* 🎤 **Sub-Second Synced Lyrics with AI Onset Alignment:** Real-time karaoke-grade lyric synchronization powered by **Deepgram AI** for precise onset detection. Supports **Tamil, Tanglish, Hindi, Malayalam, Telugu, Kannada, Bengali, Punjabi, Gujarati, and English** with automatic romanization. Features intelligent instrumental gap detection (`• • •` markers during breaks >3.2s) and word-level timing.

* 🎛️ **Professional Studio FX Engine (Right-Side Glass Panel):**
  * **Collapsible Accordion Sections:** Six organized sections (Presets, Tune, Space, Voice, Chain, Tempo) in a 320px glass panel matching Queue/Lyrics style
  * **3-Band Parametric Equalizer:** Bass (110Hz), Mid (1.5kHz), Treble (8kHz) with ±12dB adjustment
  * **Reorderable FX Chain:** Customize signal routing order (EQ → Filter → Drive → Chorus → Echo → Reverb)
  * **Native Vocal Isolation:** Zero-latency WebAudio Mid-Side processor for karaoke and vocal enhancement
  * **8D Spatial Audio:** Bi-directional panner-based 3D sound with adjustable orbit speed
  * **DJ-Style Filter:** High-pass/low-pass with frequency visualization (20Hz-20kHz sweep)
  * **Advanced Effects:** Chorus, Echo (with feedback control), Reverb (Small Hall/Cathedral), Warmth/Drive saturation, Stereo Width (mono to 200%)
  * **Speed & Pitch Control:** Independent speed (0.5x-2x) and pitch shifting for Nightcore/Daycore
  * **Night Mode:** Dynamics compression with makeup gain for comfortable late-night listening
  * **10+ Built-in Presets:** After Hours, Immersive, Studio Clarity, Headphones, Bass Boost, Vocal Boost, Concert Hall, Lo-Fi, Dream Echo

* 📁 **Local Audio Player (Zero Upload):** Drag and drop **MP3, FLAC, WAV, M4A, AAC** files directly into your browser. Zenify extracts embedded cover art and ID3 tags client-side—your files never leave your device.

* 🎵 **Intelligent 3-Tier Queue System:**
  * **User Queue:** FIFO queue for manually added tracks (preserves order during shuffle)
  * **Context Queue:** Tracks from album/playlist (affected by shuffle)
  * **Play History:** Last 50 tracks for seamless backward navigation
  * **Vibe-Based Autoplay:** Automatically continues with similar tracks when queue ends
  * **Repeat Modes:** Off, Repeat One (1x), Repeat Two (2x), Repeat All

* 🔮 **Liquid Glassmorphism & Palette Reactive Backgrounds:** Dynamic canvas-based reactive animations extract and pulse dominant colors from your album art in sync with the music's beat. Customizable per surface (Full Player, Track Page, Album Page).

* 🚀 **Gapless Playback with Dual-Buffer Preloading:** Seamless transitions between tracks with intelligent preloading and configurable crossfade (0-10 seconds).

* 📱 **Progressive Web App (PWA):** Install on **Windows, macOS, Linux, Android, and iOS** with native features:
  - Lock screen media controls
  - Bluetooth media button support (headphone play/pause, next/prev)
  - Offline playback capability
  - App-like experience without app store downloads

---

## � Zenify vs Spotify: Why Choose?

| Feature | Zenify | Spotify |
| :--- | :---: | :---: |
| **Ad-Free** | ✅ Forever | ❌ (Premium only) |
| **Synced Regional Lyrics** | ✅ Tamil, Hindi, Malayalam… | ❌ English only |
| **Studio EQ & 8D Audio** | ✅ Professional DSP | ❌ Limited EQ |
| **Local File Playback** | ✅ MP3, FLAC, WAV, M4A | ❌ Spotify files only |
| **Open Source** | ✅ MIT License | ❌ Proprietary |
| **Privacy-First** | ✅ No trackers | ❌ Heavy analytics |
| **Self-Hosted Option** | ✅ Docker ready | ❌ Cloud only |

---

## 🛠️ For Developers & Self-Hosters

Looking to contribute, inspect the Web Audio DSP routing, self-host a backend instance, or compile the Flutter Android companion app?

👉 **See the complete [Developer & Architecture Guide (DEVELOPER.md)](DEVELOPER.md)** for:
- System architecture & Mermaid data flow diagrams
- Technology stack specifications (`React 19`, `Vite 6`, `Fastify 5`, `Prisma`, `PostgreSQL`, `Flutter 3`)
- Local development setup & environment variable guide
- REST API endpoint documentation
- Production security & contribution instructions

---

---

## � Roadmap

- ✅ **v2.5** – Studio FX Glass Panel, AI Lyrics Alignment, Settings Cleanup
- 🔄 **v2.6** (In Progress) – Mobile App Improvements, Offline Queue Sync
- 📅 **v2.7** – Artist Verification Dashboard, Playlist Collaboration
- 🚀 **v3.0** – Community Recommendations, Social Features, Advanced Analytics

Want to contribute? Check [open issues](https://github.com/hackerstudent29/Zenify/issues) labeled `good first issue`.

---

## ⚖️ Legal & Content Sources

**Music Sources:**
- Zenify streams music from **official iTunes CDN** where available (original AAC quality, no re-encoding)
- Falls back to **verified public APIs** for regional catalog (LyricsDB, Rapid API)
- Local file playback uses **your own device files** (completely private, no upload)
- **Users are responsible** for ensuring local files don't violate their local copyright laws

**Lyrics:**
- Synced lyrics sourced from **LRCLib, Musixmatch API, Apple Music LRC format**
- Automatic romanization is **transformative fair use** (creates new educational value)
- User-provided lyrics are **never stored** on our servers

**Self-Hosting:**
- You are responsible for verifying music streaming rights in your jurisdiction
- Zenify is **not endorsed by or affiliated with Spotify, Apple Music, or any streaming service**
- Use Zenify to play **content you have rights to play**

---

## � Support the Project

Zenify is maintained by **[Ramanathan S](https://github.com/hackerstudent29)** as a volunteer open-source project. If you enjoy it, consider:
- ⭐ **Starring** this repo
- 🐛 **Reporting bugs** and suggesting features
- 🤝 **Contributing code** (see [CONTRIBUTING.md](CONTRIBUTING.md))
- 📢 **Sharing** with others who love music

---

## 📜 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

```
MIT License
Copyright (c) 2026 Zenify (hackerstudent29 - Ramanathan S)
```

---

<div align="center">
  <b><a href="https://listenzenify.vercel.app">Zenify</a></b> • Built with ❤️ by <a href="https://github.com/hackerstudent29"><b>Ramanathan S (hackerstudent29)</b></a>
</div>
