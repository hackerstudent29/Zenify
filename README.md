<div align="center">

  <a href="https://listenzenify.vercel.app">
    <img src="assets/images/zenify_logo_animation.gif" alt="Zenify Logo" width="460" />
  </a>

  # Zenify
  **Pure Music. Zero Ads. Infinite Sound.**

  A fast, open-source music streaming app and web player crafted with an Apple-inspired editorial design, real-time synchronized karaoke lyrics, spatial audio, and synchronized group rooms.

  <p align="center">
    <a href="https://listenzenify.vercel.app"><img src="https://img.shields.io/badge/Web_Player-Launch_Zenify-E11D48?style=for-the-badge&logo=vercel&logoColor=white" alt="Open Web Player"></a>
    <a href="https://listenzenify.vercel.app/downloads/zenify.apk"><img src="https://img.shields.io/badge/Android_APK-v1.0.10_Direct-22c55e?style=for-the-badge&logo=android&logoColor=white" alt="Download APK"></a>
    <a href="https://github.com/hackerstudent29/Zenify/releases/latest"><img src="https://img.shields.io/badge/GitHub-Releases-blue?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Releases"></a>
  </p>

  <p align="center">
    <img src="https://img.shields.io/badge/Version-1.0.10-E11D48?style=flat-square" alt="Version 1.0.10">
    <img src="https://img.shields.io/badge/Ads-Strictly_Zero-black?style=flat-square" alt="Zero Ads">
    <img src="https://img.shields.io/badge/Audio-Up_to_320kbps-E11D48?style=flat-square" alt="High Fidelity">
    <img src="https://img.shields.io/badge/License-MIT-gray?style=flat-square" alt="License MIT">
  </p>

</div>

---

### ✨ Highlights

- **🚫 100% Ad-Free**: No commercial audio ads, no video interruptions, no subscription paywalls.
- **🎤 Synchronized Karaoke Lyrics**: Real-time line-by-line and word-level progress, romanized Indic scripts, and interactive interlude transitions.
- **⚡ Studio Fidelity**: Direct 320kbps streams with instant seeking and zero 30-second preview limitations.
- **👥 Room Together**: Shared real-time listening rooms with friends, live synchronized queues, and reaction chat.
- **🎛️ StudioFX & 8D Spatial Audio**: Multi-band equalizer, bass booster, room reverb, and dynamic spatial panning.
- **📱 True Cross-Platform**: Native Android app with Dynamic Island notifications and high-performance Web / PWA.

---

### 📲 Download & Install

| Platform | Recommended Method | Link |
| :--- | :--- | :--- |
| **Android (ARM64)** | Direct Split APK *(Lightweight ~15 MB)* | [⬇️ Download `zenify.apk`](https://listenzenify.vercel.app/downloads/zenify.apk) |
| **Android (Universal)** | All architectures (`arm64`, `armv7`, `x86_64`) | [⬇️ Download `zenify-universal.apk`](https://listenzenify.vercel.app/downloads/zenify-universal.apk) |
| **Web & iOS (PWA)** | Instant Browser Playback + Add to Home Screen | [🎧 Launch Web App](https://listenzenify.vercel.app) |
| **All Releases** | GitHub Release Assets & Source Code | [📦 GitHub Releases](https://github.com/hackerstudent29/Zenify/releases) |

#### Quick Android Setup:
1. Tap [Download `zenify.apk`](https://listenzenify.vercel.app/downloads/zenify.apk).
2. Open the downloaded file from your browser notification or file manager.
3. When prompted, allow installation from your browser, then tap **Install**.

---

### 📸 Preview

<div align="center">
  <table>
    <tr>
      <td width="50%">
        <img src="docs/images/zenify_home_dashboard.png" alt="Home Dashboard" width="100%" />
        <p align="center"><em>Discovery & Curated Collections</em></p>
      </td>
      <td width="50%">
        <img src="docs/images/zenify_fullview_player.png" alt="Player Shell" width="100%" />
        <p align="center"><em>Editorial Player Shell & Sound Stage</em></p>
      </td>
    </tr>
    <tr>
      <td width="50%">
        <img src="docs/images/zenify_synced_lyrics.png" alt="Synchronized Lyrics" width="100%" />
        <p align="center"><em>Synced Karaoke Lyrics & Pronunciations</em></p>
      </td>
      <td width="50%">
        <img src="docs/images/zenify_artist_page.png" alt="Artist Profile" width="100%" />
        <p align="center"><em>Artist Profiles, Discography & Top Tracks</em></p>
      </td>
    </tr>
  </table>
</div>

---

### 🛠️ Architecture & Tech Stack

- **Mobile Client**: Flutter 3 (Android native channels, custom Spring physics, dynamic blur backdrops)
- **Web Frontend**: React 18, Vite, Tailwind CSS, Lucide icons, Framer Motion
- **Backend**: Node.js, Fastify, TypeScript, Prisma ORM, PostgreSQL (AWS RDS)
- **Audio Pipeline**: JioSaavn Akamai CDN, YouTube InnerTube on-device engine, Web Audio API / JustAudio

---

### 📄 License

Zenify is open-source software licensed under the [MIT License](LICENSE).

<div align="center">
  <sub>Crafted for listeners who simply want their music back.</sub>
</div>
