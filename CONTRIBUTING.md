# Contributing to Zenify 🎵

Thank you for your interest in contributing to **Zenify**! We welcome community contributions, bug fixes, feature requests, and improvements to our multilingual synced lyrics engine.

---

## 🌟 How You Can Help

1. **Multilingual Lyrics & Synchronization**:
   - Improve phoneme/syllable timing for regional languages (Tamil, Tanglish, Hindi, Malayalam, Telugu, Kannada).
   - Add support for new lyrics providers or LRC format converters.

2. **Web Audio & Visualizers**:
   - Create new canvas visualizers (spectrogram, fluid aura, particle ripple).
   - Enhance audio DSP features (EQ presets, spatial audio, compressor).

3. **Flutter Companion Mobile App**:
   - Enhance Android background playback, lock-screen notifications, or iOS CarPlay / widget support.
   - Improve offline music scanner performance.

4. **Bug Reports & Performance**:
   - Report browser audio playback quirks or UI glitches across different screen sizes.

---

## 🛠️ Local Development Setup

### 1. Fork & Clone
```bash
git clone https://github.com/your-username/Zenify.git
cd Zenify
```

### 2. Backend Setup
```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run dev
```
Backend will run at `http://localhost:3000`.

### 3. Frontend Setup
```bash
cd ../frontend
cp .env.example .env
npm install
npm run dev
```
Web player will run at `http://localhost:5173`.

---

## 📜 Pull Request Guidelines

1. Create a feature branch: `git checkout -b feature/your-feature-name`.
2. Ensure code compiles cleanly with `npm run build` in both `frontend/` and `backend/`.
3. Commit with clear, conventional commit messages: `feat: ...`, `fix: ...`, `docs: ...`.
4. Open a Pull Request targeting `main`.

---

## ⚖️ License
By contributing to Zenify, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
