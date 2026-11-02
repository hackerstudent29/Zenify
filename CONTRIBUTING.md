# Contributing to Zenify 🎵

Thank you for your interest in contributing to **Zenify**! We welcome community contributions, bug fixes, feature requests, documentation improvements, and enhancements to our high-fidelity audio discovery and synchronized lyrics engine.

---

## 🌟 How You Can Help

1. **Multilingual Lyrics & Synchronization**:
   - Improve phoneme/syllable timing for regional languages (Tamil, Tanglish, Hindi, Malayalam, Telugu, Kannada, English, and more).
   - Add support for new open lyrics providers or LRC format converters.

2. **Web Audio & Visualizers**:
   - Create new canvas visualizers (spectrogram, dynamic reactive aurora, particle ripple).
   - Enhance Web Audio DSP features (3-band EQ presets, 8D spatial audio, compressor).

3. **Core Discoverability & Performance**:
   - Optimize streaming startup, audio buffering, caching, and offline PWA reliability.
   - Report or resolve browser audio playback quirks and UI responsiveness across devices.

---

## 🛠️ Local Development Setup

### Prerequisites
- **Node.js**: v20.x or higher
- **npm**: v9.x or higher
- **Git**: Latest version
- **PostgreSQL**: v14+ (or Docker)

### 1. Fork & Clone
```bash
git clone https://github.com/YOUR-USERNAME/Zenify.git
cd Zenify
git remote add upstream https://github.com/hackerstudent29/Zenify.git
```

### 2. Backend Setup
```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npm run dev
```
Backend API will run at `http://localhost:3000`.

### 3. Frontend Setup
```bash
cd ../frontend
cp .env.example .env
npm install
npm run dev
```
Frontend web player will run at `http://localhost:3001`.

---

## 📜 Contribution & PR Guidelines

### Commit Message Conventions
We follow Conventional Commits:
```
<type>(<scope>): <subject>
```
**Types**:
- `feat`: New feature or capability
- `fix`: Bug fix
- `docs`: Documentation updates
- `refactor`: Code refactoring without behavior change
- `test`: Adding or updating tests
- `chore`: Tooling, dependencies, or configuration

### Pull Request Checklist
- [ ] Tested changes locally across desktop and mobile viewports.
- [ ] Clean build passes in both `frontend` (`npm run build`) and `backend` (`npm run build`).
- [ ] Follows existing styling tokens and canonical design guidelines.
- [ ] No regression in audio playback or lyrics synchronization.

---

## ⚖️ License
By contributing to Zenify, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
