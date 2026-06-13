<div align="center">
  <img src="https://raw.githubusercontent.com/hackerstudent29/Zenify/main/frontend/public/zenify_app_icon_1771338324463.png" alt="Zenify App Icon" width="150" height="150" />

  # Zenify 🎵
  **The ultimate modern music streaming platform.**
  
  *High-fidelity audio, liquid glass UI, and AI-powered synchronized lyrics. Designed to be beautiful.*

  [Live Demo](https://listenzenify.com) · [Report Bug](https://github.com/hackerstudent29/Zenify/issues) · [Request Feature](https://github.com/hackerstudent29/Zenify/issues)
</div>

---

## ✨ Features

Zenify is built with a focus on **aesthetics, performance, and features**. It offers a premium listening experience matched only by industry giants like Spotify and Apple Music.

- 🎤 **Liquid Glass Lyrics**: AI-synchronized, karaoke-style lyrics that scroll dynamically. The UI features a fluid, glassmorphism design that adapts to the album's core colors.
- 🎨 **Dynamic Aura Colors**: Every track and album is analyzed to generate a dynamic color palette that seamlessly themes the entire application as you listen.
- 📱 **Premium Cross-Platform UI**: Fully responsive interfaces featuring distinct, highly polished experiences for PC and Mobile browsers.
- 🎧 **Gapless Persistent Playback**: Your music never stops when you navigate. Built with a robust Zustand state machine for uninterrupted audio.
- 📈 **Creator Studio**: Upload music, schedule future releases, track analytics, and manage your artist profile in one place.
- 📨 **Smart Email Notifications**: Weekly listening summaries, scheduled release reminders, and new release alerts powered by Brevo.
- 🔒 **Secure Authentication**: End-to-end secure JWT Auth with Role-Based Access Control.

## 🛠️ Technology Stack

Zenify is built using cutting-edge web technologies:

### **Frontend**
- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS & Framer Motion (for fluid, complex animations)
- **State Management**: Zustand (Audio Player) & React Query (Server State)
- **Icons**: Lucide React

### **Backend**
- **Server**: Fastify (Node.js) - High performance, low latency
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Validation**: Zod
- **AI Integrations**: Deep AI analysis for lyrics sync and aesthetic generation
- **Email Delivery**: Brevo API

## 🚀 Getting Started

To get a local copy up and running, follow these simple steps.

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL Database

### 1. Clone the Repository
```bash
git clone https://github.com/hackerstudent29/Zenify.git
cd Zenify
```

### 2. Backend Setup
```bash
cd backend
npm install
# Configure your environment variables
cp .env.example .env 
# Push database schema
npx prisma db push
# Start the development server
npm run dev
```

### 3. Frontend Setup
```bash
cd ../frontend
npm install
# Configure frontend environment variables
cp .env.example .env.local
# Start the Next.js development server
npm run dev
```

## 🤝 Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---
<div align="center">
  Built with ❤️ by <a href="https://github.com/hackerstudent29">hackerstudent29</a>
</div>
