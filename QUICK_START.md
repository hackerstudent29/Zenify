# ⚡ Quick Start: Get Zenify Running in 5 Minutes

## 🚀 Option 1: Web (No Installation)

**Just click and play:**
→ https://listenzenify.vercel.app

No account required. Start playing immediately in your browser.

---

## 🐳 Option 2: Docker (Full Stack - 2 Minutes)

**Prerequisites**: Docker & Docker Compose installed

```bash
git clone https://github.com/hackerstudent29/Zenify.git
cd Zenify
docker-compose up
```

**Access**:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

**Includes**: PostgreSQL, Backend, Frontend, Redis, Health Checks

---

## ⚙️ Option 3: Manual Setup (5-10 Minutes)

### Backend
```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run dev
```

### Frontend (New Terminal)
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

**Access**: http://localhost:5173

---

## 📱 Option 4: Android APK

Download from [GitHub Releases](https://github.com/hackerstudent29/Zenify/releases)

---

## 🎵 What to Try First

1. **Search a song**: Type "Imagine" or any song name
2. **Click play**: Hear it stream in real-time
3. **Open audio effects**: Click the settings icon
4. **Try EQ**: Adjust bass/mid/treble
5. **Try 8D audio**: Experience spatial sound
6. **Upload local file**: Add your MP3 to local library

---

## 🆘 Need Help?

- **Troubleshooting**: See [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **Full Docs**: See [README.md](README.md)
- **Installation Details**: See [INSTALLATION.md](INSTALLATION.md)
- **Architecture**: See [ARCHITECTURE.md](ARCHITECTURE.md)

---

**Ready?** Pick your option above and start in < 5 minutes! 🎵

