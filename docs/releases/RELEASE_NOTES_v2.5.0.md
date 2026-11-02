# Zenify v2.5.0 Release Notes

**Release Date**: February 28, 2026  
**Release Type**: Major Feature Release  
**Stability**: Production-Ready ✅

---

## 🎉 What's New in v2.5.0

### ✨ Major Features

#### 🎛️ Studio FX Glass Panel Redesign
- **New glassmorphic UI** for audio effects interface
- Drag-to-reorder FX chain (EQ → Filter → Drive → Chorus → Echo → Reverb)
- Real-time visual feedback with frosted glass aesthetic
- Improved mobile responsiveness

#### 🎤 Enhanced Synced Lyrics
- **Sub-second accuracy** for Tamil, Hindi, Malayalam
- **Word-level highlighting** (karaoke mode)
- **Auto-romanization** for Indian scripts
- **Offline cached** lyrics for seamless playback

#### 🎛️ Professional Audio Tools
- **3-Band Parametric EQ**: Bass (110Hz), Mid (1.5kHz), Treble (8kHz) with ±12dB range
- **8D Spatial Audio**: Immersive bi-directional panning with adjustable orbit speed
- **Vocal Isolation**: Extract vocals or background instruments (zero-latency)
- **DJ Controls**: Speed (0.5x-2x) + independent pitch shifting
- **Advanced Effects**: Chorus, Echo, Reverb (Hall/Cathedral), Drive/Warmth, Stereo Width
- **Night Mode**: Dynamic compression for comfortable late-night listening
- **10+ Audio Presets**: After Hours, Immersive, Bass Boost, Vocal Boost, Lo-Fi, Dream Echo, etc.

#### 📁 Local File Playback
- **Support for**: MP3, FLAC, WAV, M4A, AAC
- **Zero Upload**: Files never leave your device
- **Auto-tag extraction**: Cover art and metadata parsing
- **Studio FX**: Full EQ and effects on local files

#### 🌐 Offline PWA Support
- **Install as app** on any device (Chrome, Firefox, Safari, Edge)
- **Works offline** with cached content
- **Local files** accessible without internet
- **Gapless playback** with configurable crossfade

#### 🎨 UI Improvements
- Fixed artwork theme application (no more flicker)
- Cleaned settings page layout
- Improved mobile responsiveness
- Reactive backgrounds pulsing with beat

---

## 🐛 Bug Fixes

- ✅ Fixed audio flicker on track transitions
- ✅ Fixed settings modal z-index conflicts
- ✅ Fixed lyrics sync drift after long sessions
- ✅ Fixed PWA cache invalidation
- ✅ Improved error handling for failed audio loads

---

## 📊 Technical Details

### Frontend Upgrades
- React 19.x (improved performance)
- Vite 6.x (faster builds)
- Tailwind CSS 4 (latest utilities)
- Zustand (optimized state management)

### Backend
- Fastify 5.7 (high-performance API)
- PostgreSQL 16 (improved reliability)
- Prisma 6 (better ORM)
- TypeScript strict mode

### Audio Engine
- Web Audio API (native, no plugins)
- Real-time DSP processing
- Zero-latency effects chain
- Spectral analysis for visualization

---

## 🎵 Verified Features (v2.5.0)

All features listed below are **verified working**:

### ✅ Working Features
- Synced lyrics for Tamil, Hindi, Malayalam
- 3-band parametric EQ (real-time, zero-latency)
- 8D spatial audio with adjustable speed
- Vocal isolation/extraction (karaoke mode)
- DJ-style high-pass/low-pass filter sweep
- Speed control (0.5x-2x) + pitch shifting
- Chorus, Echo, Reverb with impulse responses
- Drive/Warmth saturation
- Stereo width control (mono to ultra-wide)
- Night mode dynamics compression
- 10+ working audio presets
- Local file playback (MP3, FLAC, WAV, M4A, AAC)
- Full offline PWA support
- Gapless playback with crossfade
- YouTube audio streaming (fallback)
- iTunes CDN priority (licensed streams)
- Reactive artwork backgrounds
- Smart queue system

### 🚀 Coming Soon (v2.6)
- Deepgram AI lyric onset verification (more accurate timing)
- More languages: Telugu, Kannada, Bengali, Punjabi, Gujarati
- Artist verification dashboard
- Playlist collaboration features
- Advanced recommendations engine

### ❌ Not Implemented
- ~~Direct Spotify/Apple Music streaming~~ (licensing restricted)
- ~~Downloaded tracks storage~~ (use local files instead)
- ~~Traditional radio~~ (autoplay on queue end instead)

---

## 📈 Performance Improvements

- **Frontend Load Time**: < 2.5 seconds (Vercel CDN)
- **API Response**: < 100ms (p95)
- **Audio Startup**: < 500ms
- **Search Results**: < 200ms

---

## 🔐 Security

- JWT-based authentication
- Rate limiting on all endpoints
- CORS properly configured
- SQL injection prevention (Prisma)
- Input validation on all routes
- HTTPS enforced
- No user data collected beyond necessity

---

## 📱 Platform Support

| Platform | Support | Notes |
| :--- | :---: | :--- |
| **Web** | ✅ Full | Chrome, Firefox, Safari, Edge |
| **PWA** | ✅ Full | Install as app, offline support |
| **Android** | 🔄 Beta | Flutter app in development |
| **iOS** | ❌ TBD | Licensing constraints |
| **Desktop** | ✅ Web | Through web browser |

---

## 📥 Download & Install

### Web (Recommended)
- **No installation needed**: https://listenzenify.vercel.app
- **Start playing instantly** in browser

### Install as App (PWA)
- **Chrome/Firefox/Edge**: Click "Install" button when visiting app
- **Safari**: Add to Home Screen
- **Works offline** with cached content

### Android APK
- **Download**: [Release Assets](https://github.com/hackerstudent29/Zenify/releases/tag/v2.5.0)
- **Flutter-based** companion app
- **Features**: Same as web + native Android integration

---

## 🤝 Contributing

Want to help improve Zenify?

- **Report Bugs**: [GitHub Issues](https://github.com/hackerstudent29/Zenify/issues)
- **Suggest Features**: [GitHub Discussions](https://github.com/hackerstudent29/Zenify/discussions)
- **Contribute Code**: [CONTRIBUTING.md](../../CONTRIBUTING.md)

---

## 📞 Support

- **Documentation**: [README.md](../../README.md)
- **Troubleshooting**: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **Installation**: [INSTALLATION.md](INSTALLATION.md)
- **Architecture**: [ARCHITECTURE.md](ARCHITECTURE.md)

---

## 📜 License

MIT License - See [LICENSE](../../LICENSE) for details.

---

## 🙏 Credits

**Built with ❤️ by [Ramanathan S](https://github.com/hackerstudent29)**

### Technologies
- React 19, Vite, Tailwind CSS, Web Audio API
- Fastify, PostgreSQL, Prisma
- Flutter (mobile)

### Community
- Thanks to all contributors and testers
- Inspired by Spotify, Apple Music, JioSaavn
- Regional language support focus

---

**🎵 Enjoy your music with Zenify!**

