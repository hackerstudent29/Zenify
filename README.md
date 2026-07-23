<div align="center">
  <br />
  <a href="https://listenzenify.com">
    <img src="https://res.cloudinary.com/dzqcuxchc/image/upload/v1779805544/zenify/brand/zenify_logo_purple_pink.png" alt="Zenify Logo" width="320" />
  </a>
  <br />
  <br />
  <p>
    <b>The Ultimate Modern Music Streaming Platform</b><br/>
    <em>Breathtaking aesthetics, Liquid Glass UI, background audio services, and High-Precision AI-powered synchronized lyrics.</em>
  </p>

  <p>
    <a href="https://listenzenify.com"><img src="https://img.shields.io/badge/Live_Demo-listenzenify.com-FF2D55?style=flat&logo=vercel" alt="Live Demo" /></a>
    <img src="https://img.shields.io/badge/Status-Live_&_Actively_Developed-10B981?style=flat" alt="Status" />
    <img src="https://img.shields.io/badge/Platform-Web_&_Mobile-8B5CF6?style=flat" alt="Platform" />
    <img src="https://img.shields.io/badge/Version-2.2.0-3B82F6?style=flat" alt="Version" />
  </p>

  <p>
    <em>Crafted for audiophiles and creators by <a href="https://github.com/hackerstudent29"><b>hackerstudent29</b></a>.</em>
  </p>
</div>

<br />

---

<br />

## 🔒 Proprietary Software Notice
> **⛔ WARNING: This is a paid, closed-source commercial project.** 

This repository and its contents are strictly confidential and proprietary. You **DO NOT** have permission to clone, download, distribute, reverse-engineer, or run this project locally without explicit written authorization from the owner. 

Any unauthorized use or deployment of this source code is strictly prohibited. For licensing inquiries, please contact the repository owner.

<br />

## ✨ Key Platform Features

### 🎤 High-Precision AI Audio-to-Lyrics Alignment Engine
*   **100% Free & Standalone Alignment:** Instant timestamping (`[mm:ss.xx]`) for pasted plain lyrics without requiring external paid API keys or subscriptions.
*   **Instrumental & Solo Gap Protection:** Automatically recognizes non-vocal sections (`[Guitar Solo]`, `[Instrumental Break]`, `[BGM]`, `[Intro]`, `[Outro]`) and reserves explicit non-vocal timing windows (12s–24s), ensuring lyrics are never stretched into solos or instrumental breaks.
*   **Multi-Lingual Syllable Pacing:** Analyzes phonetic vowel groups and syllable density across English, Tamil, Tanglish, Hindi, Malayalam, Telugu, and other languages to compute line start times with sub-second accuracy.
*   **Lyric Sync Studio:** Interactive studio suite featuring an AI Auto-Matcher, real-time Karaoke Painter View, manual timestamp fine-tuning, and global time-shift tools.

### ⚡ Fast Audio Preview & Stream Proxy Engine
*   **Sub-50ms iTunes CDN Priority:** High-speed audio preview lookup that resolves direct AAC preview streams instantly, bypassing stdout streaming overhead.
*   **Container Header Integrity (`/stream-youtube`):** Preserves initial media container headers (`ftyp`/`EBML`) during stream initialization, resolving HTML5 `<audio>` demuxing and playback errors across Chrome and Edge.
*   **Native HTTP Range Seeking:** Supports direct `googlevideo` URL resolution via `yt-dlp -g` for native HTTP 206 Partial Content range-seeking support.

### 📱 Zenify Mobile (Native Flutter App)
Zenify features a gorgeous, fully native mobile application that delivers pixel-perfect visual parity with our premium web player, loaded with next-generation interactive features:

*   **Floating Glassmorphic Miniplayer:** A true glassmorphic floating oval player card designed to blend seamlessly with any background. Crafted using a `BackdropFilter` with a heavy blur radius of `30.0` and a thin translucent border, creating a floating translucent premium card look.
*   **Dynamic 3D Flip Card:** A custom 3D card component that flips seamlessly at the 90-degree threshold to transition between Album Artwork and AI-synchronized scrollable lyrics.
*   **Premium Glass Lyrics & Tap-to-Seek:** A stunning frosted glass lyrics view with custom BackdropFilters that fits perfectly within the device viewport. Listeners can tap any line in the lyrics view to instantly seek playback to that exact lyric segment.
*   **Karaoke-Style Text Filling Effect:** Dynamic left-to-right lyric coloring. Powered by a high-frequency position tracker and a custom `ShaderMask` `LinearGradient`, lines fill smoothly in real time as the song plays.
*   **Offline Local Files Player:** Integrates native `permission_handler` and `file_picker` to scan user music folders (e.g. `/Music` and `/Download`) and select manual files. Plays all local audio formats offline through the app's persistent background service.
*   **Dynamic Database Feeds:** Renders fully-featured rows fetching **Featured Tracks**, **New Arrivals**, and **Recommendations** directly from the Fastify backend database.
*   **Resilient UX / Guest Mode Support:** Automatically intercepts 401 authentication errors and transitions from a crash state to a friendly, elegant "Guest Mode Login" card.
*   **Persistent Native Playback:** Powered by a customized Kotlin `AudioServiceActivity` backend that hooks into Android's system audio framework. Features persistent background playback, custom lock-screen controls, and headset media key bindings.
*   **Immersive Liquid Glass Player:** Features an adaptive UI matching the active song's color aura, a Rose Pink Sleek Scrubber with negative remaining time, and an auto-collapsing meta-info panel that makes room for lyrics.

<br />

## 💻 Tech Stack & Architecture

Zenify is built on a highly scalable, split-domain architecture spanning web, mobile, and lightweight APIs.

<div align="center">

| **Domain** | **Technology** | **Description** |
| :--- | :--- | :--- |
| 📱 **Mobile App** | `Flutter (Dart)` & `Kotlin` | High-fidelity cross-platform app with background audio and fluid 3D transformations. |
| 🌐 **Frontend** | `Next.js 14` & `React` | Server-Side Rendering and App Router for lightning-fast web loads. |
| 💅 **Styling** | `Tailwind CSS` & `Framer Motion` | Glassmorphism, dynamic gradients, and physics-based interactions. |
| 🧠 **State** | `Zustand` & `Riverpod` | Web audio state machine and mobile state container providers. |
| 🚀 **Backend** | `Fastify` (Node.js) | High-performance, low-latency API server. |
| 🗄️ **Database** | `PostgreSQL` & `Prisma` | Fully relational database with type-safe schema modeling. |
| 🤖 **AI / ML Engine** | `High-Precision Acoustic Aligner` | Sub-second audio analysis, acoustic density modeling, and non-vocal gap protection. |
| 📨 **Delivery** | `Brevo API` | Automated creator reports and release notifications. |

</div>

<br />

## 📂 Repository Structure

The project code is organized into clean, modular sub-projects:

*   [`/flutter_app`](file:///d:/.gemini/Zenify/flutter_app): Native Flutter mobile application featuring the immersive music player and background services.
*   [`/frontend`](file:///d:/.gemini/Zenify/frontend): Next.js web application utilizing Zustand state and Framer Motion visual designs.
*   [`/backend`](file:///d:/.gemini/Zenify/backend): Fastify API server with PostgreSQL/Prisma integration.

<br />

## 🛡️ Security & Authentication
Zenify features an enterprise-grade security implementation:
- **End-to-End JWT Auth:** Secure access and refresh token rotation.
- **Role-Based Access Control (RBAC):** Distinct permissions for Listeners, Creators, and Admins.
- **Data Protection:** Helmet middleware, strict CORS policies, and sanitized inputs via Zod.

<br />

---

<div align="center">
  <b>Zenify</b> • Crafted with ❤️ by <a href="https://github.com/hackerstudent29"><b>hackerstudent29</b></a>
  <br/><br/>
  <a href="https://github.com/hackerstudent29"><img src="https://img.shields.io/github/followers/hackerstudent29?label=Follow&style=social" alt="GitHub followers" /></a>
</div>
