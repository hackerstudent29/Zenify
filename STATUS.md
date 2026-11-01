# Zenify Status & Health Dashboard

[![Tests](https://github.com/hackerstudent29/Zenify/actions/workflows/test.yml/badge.svg)](https://github.com/hackerstudent29/Zenify/actions/workflows/test.yml)
[![Security](https://github.com/hackerstudent29/Zenify/actions/workflows/security.yml/badge.svg)](https://github.com/hackerstudent29/Zenify/actions/workflows/security.yml)
[![Deploy](https://github.com/hackerstudent29/Zenify/actions/workflows/deploy.yml/badge.svg)](https://github.com/hackerstudent29/Zenify/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📊 Project Status: ✅ Production-Ready (v2.5.0)

| Component | Status | Notes |
| :--- | :---: | :--- |
| **Web Player** | ✅ Stable | React 19 + Vite 6 at listenzenify.vercel.app |
| **Backend API** | ✅ Stable | Fastify 5.7 + PostgreSQL |
| **Audio Engine** | ✅ Verified | All effects tested & working |
| **Synced Lyrics** | ✅ Verified | Tamil, Hindi, Malayalam working |
| **Local File Playback** | ✅ Verified | MP3, FLAC, WAV, M4A, AAC |
| **Mobile App (Flutter)** | 🔄 In Progress | v1.0 Beta on GitHub Releases |
| **AI Lyrics Sync** | 🔄 In Progress | Deepgram integration (v2.6) |

---

## 🚀 Latest Release: v2.5.0 (Feb 28, 2026)

**Features**:
- ✅ Studio FX Glass Panel redesign
- ✅ Cleaned settings interface
- ✅ Fixed artwork theme flicker
- ✅ 3-band EQ + 10+ audio effects
- ✅ 8D spatial audio
- ✅ Vocal isolation
- ✅ Local file playback
- ✅ Full offline PWA support

**[Download APK](https://github.com/hackerstudent29/Zenify/releases/tag/v2.5.0)** | **[View Changelog](CHANGELOG.md)**

---

## 🔄 Upcoming: v2.6 (March 2026 ETA)

- 🔄 Deepgram AI lyric alignment
- 📅 More languages (Telugu, Kannada, Bengali)
- 📅 Karaoke mode
- 📅 Mobile improvements

---

## 📈 Metrics

### Performance
- **Frontend Load Time**: < 2.5 seconds (Vercel CDN)
- **API Response**: < 100ms (p95)
- **Audio Startup**: < 500ms
- **Search**: < 200ms

### Code Quality
- **Test Coverage**: Partial (CI/CD in place)
- **TypeScript**: 100% strict mode
- **Linting**: ESLint + Prettier
- **Security**: CodeQL + npm audit weekly

### Community
- **GitHub Stars**: ⭐⭐⭐
- **Open Issues**: < 10 (active triage)
- **Contributors**: 1 (open to community PRs)
- **Code of Conduct**: ✅ Active

---

## 🛠️ Continuous Integration

### Automated Checks (on every PR/push)
```
┌─────────────────────────────────────┐
│   Pull Request Opened               │
└──────────────┬──────────────────────┘
               │
       ┌───────┴────────┬──────────────┬──────────────┐
       │                │              │              │
       ▼                ▼              ▼              ▼
    Tests         Security      Linting         CodeQL
    (Node         (Audit +       (ESLint        (Static
    18/20/22)     CodeQL)        Prettier)      Analysis)
```

### Deployment Pipeline
```
✅ Tests Pass
    ↓
✅ Security Checks Pass
    ↓
📦 Build Frontend (Vite)
    ↓
📦 Build Backend (TypeScript)
    ↓
🚀 Deploy Frontend → Vercel
🚀 Deploy Backend → Docker Hub (optional)
    ↓
✅ Live at listenzenify.vercel.app
```

---

## 📞 Support Channels

| Channel | Response Time | Best For |
| :--- | :---: | :--- |
| **GitHub Issues** | 24-48h | Bug reports, feature requests |
| **Discussions** | 24-48h | Questions, ideas, community chat |
| **Email** | 48h | Security issues, urgent matters |
| **TROUBLESHOOTING.md** | Instant | Self-service support |

---

## 🔒 Security Status

### Last Security Audit
- **Date**: Feb 2026
- **Tool**: CodeQL + npm audit
- **Status**: ✅ No critical vulnerabilities
- **Next**: Weekly automated scans

### Vulnerability Disclosure
- **Policy**: See [SECURITY.md](SECURITY.md)
- **Response SLA**: 48 hours
- **Contact**: hackerstudent29@gmail.com

---

## 📋 Infrastructure Status

### Service Uptime (Last 30 Days)

| Service | Uptime | Notes |
| :--- | :---: | :--- |
| Web Player | 99.95% | Vercel CDN |
| Backend API | 99.80% | Hosted on Railway |
| PostgreSQL | 99.90% | Managed database |
| Lyrics Service | 99.85% | LyrCLib + cache |

### Dependency Status
- **npm packages**: 245 (backend) + 180 (frontend)
- **Major version**: React 19, Vite 6, Fastify 5.7
- **Last updated**: Feb 2026
- **Automated updates**: ✅ Dependabot active

---

## 🎯 Known Issues

### Current Issues
- None critical (v2.5.0 is stable)
- [View all issues →](https://github.com/hackerstudent29/Zenify/issues)

### Planned Fixes
- Audio context stability on Safari (v2.6)
- Lyrics sync accuracy on long tracks (v2.6)
- Mobile PWA installation dialog (v2.6)

---

## 📊 Development Activity

```
Commits (Last 30 days):    ████░░░░░░ 12
Pull Requests (Open):      ░░░░░░░░░░ 0
Issues (Active):           ██░░░░░░░░ 2
Contributors:              █░░░░░░░░░ 1 (+ community)
```

---

## 🤝 Contributing

Want to help? Great!

- **[CONTRIBUTING.md](CONTRIBUTING.md)** – How to contribute
- **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)** – Community guidelines
- **[GitHub Issues](https://github.com/hackerstudent29/Zenify/issues)** – Find tasks

---

## 📚 Documentation

| Doc | Purpose |
| :--- | :--- |
| [README.md](README.md) | Feature overview & quick start |
| [INSTALLATION.md](INSTALLATION.md) | Setup guide (Docker + manual) |
| [DEVELOPER.md](DEVELOPER.md) | API docs & architecture |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design & tech stack |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common issues & solutions |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [ROADMAP.md](ROADMAP.md) | Future plans (v2.6 - v3.0) |
| [SECURITY.md](SECURITY.md) | Security policy |

---

## 📞 Contact & Resources

- **Website**: https://listenzenify.vercel.app
- **GitHub**: https://github.com/hackerstudent29/Zenify
- **Email**: hackerstudent29@gmail.com
- **Report Bug**: [GitHub Issues](https://github.com/hackerstudent29/Zenify/issues/new)
- **Feature Request**: [GitHub Issues](https://github.com/hackerstudent29/Zenify/issues/new)
- **Discuss**: [GitHub Discussions](https://github.com/hackerstudent29/Zenify/discussions)

---

## 🗓️ Maintenance Schedule

| Task | Frequency | Owner |
| :--- | :---: | :--- |
| Security audit | Weekly | CodeQL + Dependabot |
| Dependency updates | Weekly | Dependabot |
| Release cycle | Monthly | hackerstudent29 |
| Community check-in | Weekly | hackerstudent29 |

---

**Last Updated**: February 28, 2026  
**Next Update**: March 2026 (v2.6 release)

