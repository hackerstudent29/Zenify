# Zenify 🎵

A modern, high-performance music streaming application inspired by the best (Spotify/Apple Music). Built with **Next.js 14**, **Fastify**, **Prisma**, and **PostgreSQL**.

![Zenify App](/frontend/public/zenify_app_icon_1771338324463.png)

## 🚀 Features

-   **Authentication**: Secure JWT Auth (Access/Refresh Tokens) + RBAC.
-   **Music Discovery**: Real-time search for tracks and playlists.
-   **Library Management**: Create playlists, favorite songs, and organize your collection.
-   **Player**: Persistent audio player with queue management and gapless playback.
-   **Profile**: User profile management and secure password updates.
-   **Performance**: Optimistic updates, skeleton loading, and edge-ready architecture.

## 🛠️ Tech Stack

### Frontend
-   **Framework**: Next.js 14 (App Router)
-   **Styling**: Tailwind CSS + Framer Motion
-   **State**: Zustand (Player) + React Query (Data)
-   **Icons**: Lucide React

### Backend
-   **Server**: Fastify (Node.js)
-   **Database**: PostgreSQL (Supabase)
-   **ORM**: Prisma
-   **Validation**: Zod
-   **Caching**: Redis (Optional)

## 📦 Installation

### Prerequisites
-   Node.js 18+
-   PostgreSQL / Supabase Account

### 1. Clone Repository
```bash
git clone https://github.com/hackerstudent29/Zenify.git
cd Zenify
```

### 2. Backend Setup
```bash
cd backend
npm install
cp .env.example .env # Configure DATABASE_URL
npx prisma db push
npm run dev
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

## 🧪 Running Tests
```bash
cd backend
npx tsx scripts/test-flow.ts
```

## 🤝 Contributing
Built by [hackerstudent29](https://github.com/hackerstudent29).
