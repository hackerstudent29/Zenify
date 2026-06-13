<div align="center">
  <br />
  <a href="https://listenzenify.com">
    <img src="https://raw.githubusercontent.com/hackerstudent29/Zenify/main/frontend/public/zenify_app_icon_1771338324463.png" alt="Zenify Logo" width="150" />
  </a>
  <br />
  <br />

  <h1>🎶 𝗭𝗘𝗡𝗜𝗙𝗬 🎶</h1>
  <p>
    <b>The Ultimate Modern Music Streaming Platform</b>
  </p>

  <p>
    <a href="https://listenzenify.com"><img src="https://img.shields.io/badge/Live_Demo-listenzenify.com-FF2D55?style=for-the-badge&logo=vercel" alt="Live Demo" /></a>
    <img src="https://img.shields.io/badge/Status-Live_&_Actively_Developed-10B981?style=for-the-badge" alt="Status" />
    <img src="https://img.shields.io/badge/Version-2.0.0-3B82F6?style=for-the-badge" alt="Version" />
  </p>

  <p>
    <em>Designed with breathtaking aesthetics, Liquid Glass UI, and AI-powered synchronized lyrics.<br/>Built by <a href="https://github.com/hackerstudent29"><b>hackerstudent29</b></a> for audiophiles and creators.</em>
  </p>
</div>

<br />

---

<br />

## 🎵 Elevating the Listening Experience

Zenify isn't just another streaming clone. It is a **premium, high-fidelity audio platform** engineered to rival industry giants. From the fluid, glassmorphism design that adapts to your music, to the robust persistent audio engine, every detail has been crafted to perfection.

<table align="center" width="100%">
  <tr>
    <td width="50%" align="center">
      <h3>🎤 Liquid Glass Lyrics</h3>
      <p>AI-synchronized, karaoke-style lyrics that scroll dynamically. The UI features a fluid, glassmorphism design that seamlessly adopts the album's core colors.</p>
    </td>
    <td width="50%" align="center">
      <h3>🎧 Gapless Playback</h3>
      <p>Your music never stops. Built with a highly customized Zustand state machine, Zenify ensures uninterrupted, persistent audio as you navigate.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <h3>🎨 Dynamic Aura Colors</h3>
      <p>Every track and album is analyzed via an advanced extraction engine to generate a dynamic color palette that themes the entire application in real-time.</p>
    </td>
    <td width="50%" align="center">
      <h3>📈 Creator Studio</h3>
      <p>A full suite for artists. Upload music, schedule future releases, track deep analytics, and manage your public artist profile in one place.</p>
    </td>
  </tr>
</table>

<br />

## 💻 Tech Stack & Architecture

Zenify is built on a cutting-edge, highly scalable modern web architecture.

<div align="center">

| **Domain** | **Technology** | **Description** |
| :--- | :--- | :--- |
| 🌐 **Frontend** | `Next.js 14` & `React` | Server-Side Rendering and App Router for lightning-fast loads. |
| 💅 **Styling** | `Tailwind CSS` & `Framer Motion` | Highly customized, fluid animations with a custom design system. |
| 🧠 **State** | `Zustand` & `React Query` | Persistent global audio player state and cached server state. |
| 🚀 **Backend** | `Fastify` (Node.js) | Extremely high-performance, low-latency API server. |
| 🗄️ **Database** | `PostgreSQL` & `Prisma` | Fully relational database with strong type safety and scalability. |
| 🤖 **AI / ML** | `Deep AI Integration` | Real-time audio processing, LRC lyric syncing, and aesthetic analysis. |
| 📨 **Delivery** | `Brevo API` | Automated, scheduled emails for releases and weekly analytics summaries. |

</div>

<br />

## 🚀 Getting Started

Want to run Zenify locally? Follow these steps to set up the development environment.

### 📋 Prerequisites
> Ensure you have **Node.js (v18+)** and a running instance of **PostgreSQL** (or a Supabase account) before starting.

### 1️⃣ Clone the Repository
```bash
git clone https://github.com/hackerstudent29/Zenify.git
cd Zenify
```

### 2️⃣ Backend Setup
```bash
cd backend
npm install

# Configure your environment variables
cp .env.example .env 

# Push database schema and sync Prisma
npx prisma db push

# Start the Fastify development server
npm run dev
```

### 3️⃣ Frontend Setup
```bash
cd ../frontend
npm install

# Configure frontend environment variables
cp .env.example .env.local

# Start the Next.js development server
npm run dev
```

<br />

## 🛡️ Security & Authentication
Zenify features an enterprise-grade security implementation:
- **End-to-End JWT Auth:** Secure access and refresh token rotation.
- **Role-Based Access Control (RBAC):** Distinct permissions for Listeners, Creators, and Admins.
- **Data Protection:** Helmet middleware, strict CORS policies, and sanitized inputs via Zod.

<br />

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. **Fork** the Project
2. Create your Feature Branch: `git checkout -b feature/AmazingFeature`
3. Commit your Changes: `git commit -m 'Add some AmazingFeature'`
4. Push to the Branch: `git push origin feature/AmazingFeature`
5. Open a **Pull Request**

<br />

---

<div align="center">
  <b>Zenify</b> • Crafted with ❤️ by <a href="https://github.com/hackerstudent29"><b>hackerstudent29</b></a>
  <br/><br/>
  <a href="https://github.com/hackerstudent29"><img src="https://img.shields.io/github/followers/hackerstudent29?label=Follow&style=social" alt="GitHub followers" /></a>
</div>
