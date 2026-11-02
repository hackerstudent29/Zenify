<div align="center">
  <br />
  <a href="https://listenzenify.vercel.app">
    <img src="assets/images/zenify_logo_animation.gif" alt="Zenify Free Ad-Free Music Streaming App" width="560" />
  </a>
  <br />
  <br />
  <h1>Zenify: Free Ad-Free Music Streaming App</h1>
  <p>
    <b>The beautiful, ad-free music web player with Apple-style design, synchronized lyrics, studio audio effects, and local playback.</b>
  </p>

  <p>
    <a href="https://listenzenify.vercel.app"><img src="https://img.shields.io/badge/🚀_Live_App-listenzenify.vercel.app-E11D48?style=for-the-badge&logo=vercel&logoColor=white" alt="Live Demo" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT License" /></a>
    <a href="https://github.com/hackerstudent29/Zenify"><img src="https://img.shields.io/github/stars/hackerstudent29/Zenify?style=for-the-badge&color=gold" alt="GitHub Stars" /></a>
  </p>

  <p>
    <a href="#try-it-now">Try It Now</a> •
    <a href="#features">Features</a> •
    <a href="#screenshots">Screenshots</a> •
    <a href="#why-zenify">Why Zenify</a> •
    <a href="#faq">FAQ</a> •
    <a href="#where-the-music-comes-from">Where the Music Comes From</a>
  </p>
</div>

---

## 🎧 Hero

<div align="center">
  <img src="docs/images/zenify_fullview_player.png" alt="Zenify Full-View Music Player with Reactive Dynamic Artwork Background and Studio Equalizer" width="100%" />
</div>

Zenify is a free, ad-free online music streaming player designed with a refined Apple Music-inspired visual aesthetic. Listen to your favorite songs with real-time synchronized lyrics, fine-tune your sound with a studio equalizer, or play your own local music collection directly in your browser.

---

## 🚀 Try It Now

Start listening immediately — **no sign-up or credit card required**.

* **Web Player**: Open **[listenzenify.vercel.app](https://listenzenify.vercel.app)** in any modern web browser on your phone, tablet, or computer.
* **Install on Desktop (Windows, macOS, Linux)**: Open the link in Google Chrome, Microsoft Edge, or Brave, and click the **Install** icon in the address bar for a standalone native app experience.
* **Install on iPhone & iPad**: Open the link in Safari, tap the **Share** button, and select **Add to Home Screen**.
* **Install on Android**: Open the link in Google Chrome, tap the menu (⋮), and choose **Install App** or **Add to Home Screen**.

---

## ✨ Features

| Feature | What It Does for You |
|---|---|
| **100% Free & Ad-Free** | Listen continuously without audio ads, video popups, or paid subscription gates. |
| **Apple-Inspired Design** | Clean, distraction-free interface with glassmorphic accents and dynamic artwork color themes. |
| **Real-Time Synced Lyrics** | Sing along with sub-second syllable-level lyric tracking and karaoke highlights in over 50 languages. |
| **Studio 3-Band Equalizer** | Customize bass, mid, and treble frequencies to fit your headphones or sound system. |
| **8D Spatial Audio & Audio FX** | Enjoy immersive headphone panning, warm room reverbs, and DJ speed and pitch adjustment. |
| **Local File Player (MP3 / FLAC)** | Drop in your personal MP3, FLAC, WAV, and M4A audio files to play privately offline without uploading. |
| **Smart Continuous Autoplay** | Keeps the vibe going automatically with complementary recommendations when your queue ends. |
| **Instant Keyboard Search** | Press `Ctrl + K` (or `Cmd + K`) anywhere to jump straight to any artist, album, or track. |

---

## 📸 Screenshots

| 🏠 Home Dashboard | 🎛️ Studio Player & Audio Controls |
| :---: | :---: |
| <img src="docs/images/zenify_home_dashboard.png" alt="Zenify Home Dashboard with Curated Music Shelves and Charts" width="100%" /> | <img src="docs/images/zenify_fullview_player.png" alt="Zenify Full Screen Player with Studio Controls" width="100%" /> |
| *Discover trending releases and personalized collections* | *Sculpt your sound with real-time EQ and spatial audio* |

| 🎤 Real-Time Synced Lyrics | 👤 Artist Discography |
| :---: | :---: |
| <img src="docs/images/zenify_synced_lyrics.png" alt="Zenify Sub-Second Synchronized Karaoke Lyrics" width="100%" /> | <img src="docs/images/zenify_artist_page.png" alt="Zenify Artist Profile Page with Discography and Top Tracks" width="100%" /> |
| *Sub-second karaoke lyrics with instrumental pause indicators* | *Explore full discographies, popular songs, and related artists* |

---

## ⚡ Why Zenify?

| Feature | Zenify | Spotify Free | Apple Music | YouTube Music Free |
|---|:---:|:---:|:---:|:---:|
| **Price** | Free | Free with ads | Paid subscription required | Free with ads |
| **Audio Ads Between Songs** | None | Frequent audio ads | None (Paid) | Frequent video/audio ads |
| **Account Required to Listen** | No | Yes | Yes | Yes |
| **Real-Time Synced Lyrics** | Included | Included (Limited) | Included (Paid) | Basic text |
| **Studio Equalizer & 8D Audio** | Included | Basic presets only | Basic presets only | None |
| **Plays Local Files Privately** | Yes (Client-side) | Complex desktop sync | Desktop only | Upload to cloud |
| **Pitch & Speed Warper** | Included | None | None | None |
| **Open Source** | Yes | Closed source | Closed source | Closed source |

---

## ❓ Frequently Asked Questions (FAQ)

### 1. Is Zenify really free?
Yes. Zenify is completely free and open-source. There are no paid subscription plans, no paywalls, and no audio advertisements interrupting your listening sessions.

### 2. Do I need an account to listen to music?
No. You can open Zenify and begin listening to songs, albums, and radios immediately without creating an account or providing an email address. Creating a free account is optional if you wish to sync favorite songs across devices.

### 3. Can I play my own audio files from my computer or phone?
Yes. The **Local Library** feature allows you to select MP3, FLAC, WAV, and M4A audio files from your device storage. Files play entirely inside your browser using the HTML5 Web Audio API; your files are never uploaded to any remote server.

### 4. How do the synchronized lyrics work?
Zenify fetches timestamped lyric files and aligns them in real time with the audio timeline. Syllables and words light up dynamically as the artist sings, with visual pause markers displayed during instrumental interludes.

### 5. Can I install Zenify on my phone as an app?
Yes. Zenify is built as a Progressive Web App (PWA). You can install it on iOS Safari (via *Share → Add to Home Screen*) or Android Chrome (via *Install App*) for full-screen listening with native lock-screen media controls.

---

## 🌐 Where the Music Comes From

* Zenify is a client player interface that discovers and streams publicly available audio streams and catalog metadata from public music indexes.
* Personal music files are read directly from your device file system on demand and remain 100% private.
* Zenify does not host or store copyrighted audio files on its application servers and honors content creator rights.

---

## 🤝 Contribute & Support

Zenify is free and open-source software built for music lovers around the world. If you enjoy listening with Zenify, please **star this repository on GitHub** and share it with your friends!

---

## 📜 License

Distributed under the **MIT License**. Created by [Ramanathan S](https://github.com/hackerstudent29).
