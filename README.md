<div align="center">
  <br />
  <a href="https://listenzenify.com">
    <img src="https://res.cloudinary.com/dzqcuxchc/image/upload/v1779805544/zenify/brand/zenify_logo_purple_pink.png" alt="Zenify Logo" width="320" />
  </a>
  <br />
  <br />
  <p>
    <b>The Ultimate Modern Music Streaming Platform</b><br/>
    <em>Breathtaking aesthetics, Liquid Glass UI, background audio services, and AI-powered synchronized lyrics.</em>
  </p>

  <p>
    <a href="https://listenzenify.com"><img src="https://img.shields.io/badge/Live_Demo-listenzenify.com-FF2D55?style=flat&logo=vercel" alt="Live Demo" /></a>
    <img src="https://img.shields.io/badge/Status-Live_&_Actively_Developed-10B981?style=flat" alt="Status" />
    <img src="https://img.shields.io/badge/Platform-Web_&_Mobile-8B5CF6?style=flat" alt="Platform" />
    <img src="https://img.shields.io/badge/Version-2.1.0-3B82F6?style=flat" alt="Version" />
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

## 📱 Zenify Mobile (Native Flutter App)
Zenify features a gorgeous, fully native mobile application that delivers pixel-perfect visual parity with our premium web player.

*   **Dynamic 3D Flip Card:** A custom 3D card component that flips seamlessly at the 90-degree threshold to transition between Album Artwork and AI-synchronized scrollable lyrics.
*   **Persistent Native Playback:** Powered by a customized Kotlin `AudioServiceActivity` backend that hooks into Android's system audio framework. Features persistent background playback, custom lock-screen controls, and headset media key bindings.
*   **Immersive Liquid Glass Player:** Features an adaptive UI matching the active song's color aura, a Rose Pink Sleek Scrubber with negative remaining time, and an auto-collapsing meta-info panel that makes room for lyrics.
*   **Optimistic Synchronization:** Automatically fetches track details and syncs Likes (POST `/tracks/:id/like`) instantly with the backend.

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
| 🤖 **AI / ML** | `Deep AI Integration` | Real-time audio analysis, metadata parsing, and lyric synchronization. |
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
