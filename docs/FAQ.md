# ❓ Frequently Asked Questions

---

## 🎵 General Questions

### Q: What is Zenify?
**A**: Zenify is a free, open-source music streaming player with professional audio tools. It works offline, supports multiple languages, and respects your privacy (no ads, no tracking).

### Q: Why should I use Zenify instead of Spotify?
**A**: 
- **Free forever** (Spotify costs $12/month)
- **No ads** (Spotify interrupts with ads)
- **No tracking** (Spotify sells your data)
- **Professional audio tools** (EQ, 8D, vocal isolation - free)
- **Works offline** (Spotify doesn't)
- **Open source** (you can see all code)

### Q: Is Zenify really free?
**A**: Yes, completely free. No premium paywall, no hidden costs. Ever.

### Q: Do I need an account?
**A**: No. Zenify works without login. Totally optional if you want to save preferences.

### Q: Can I use Zenify offline?
**A**: Yes! As a PWA, it works completely offline with cached music and lyrics.

### Q: Is my music data tracked?
**A**: No. Zenify is 100% open source with zero tracking. No ads. No data collection.

---

## 🎛️ Audio & Features

### Q: What audio effects, DJ crossfades, and video features does Zenify have?
**A**: 
- **Studio FX DSP**: 3-band equalizer (Bass, Mid, Treble), 8D spatial audio, vocal isolation/extraction, Chorus, Echo, Reverb, Drive, Stereo Width, speed control (`0.5x–2.0x`), pitch shifting (`-12` to `+12` semitones), and Night mode compression
- **20 DJ Crossfade Styles (Android v1.1.22)**: 20 smooth DJ transition curves customizable between `1s–12s`, alongside standard gapless playback
- **16:9 4K Video Theater**: In-player music video toggle with seamless background audio continuity and offline `.mp4` video downloads on Android
- **Sound Atlas (Global Music Map)**: Interactive 177-country world map, 76 curated global music cities, and 11 live country chart feeds (`IN`, `US`, `GB`, `DE`, `CA`, `AU`, `JP`, `FR`, `BR`, `KR`, `AE`)
- **Replay & Insights + Story Sharing**: 27 listening telemetry metrics, monthly/all-time recaps, 16 share card templates, Song Credits, and Pure OLED `#000000` dark mode

### Q: Can I use Zenify for karaoke and reading lyrics?
**A**: Yes! Zenify includes vocal isolation + word-level karaoke highlighting, plus stationary plain full lyrics and automatic romanization.

---

## 🔤 Lyrics & Languages

### Q: What languages have synced lyrics?
**A**: Full word-by-word/line synced lyrics and stationary plain lyrics across **50+ global and regional languages**, including English, Tamil, Tanglish, Hindi, Malayalam, Telugu, Kannada, Punjabi, Korean, Japanese, Spanish, French, German, Portuguese, and Arabic—with script romanization.

### Q: How accurate is lyrics sync?
**A**: Sub-second accuracy. Word-level highlighting and stationary plain lyrics are supported, with offline cached lyric support.

### Q: Can I add custom or community-contributed lyrics?
**A**: Admins and contributors can align and export LRC timing in the Web Lyric Studio, alongside automated multi-source enrichment (`LRCLIB`, `lrc.red`, Deepgram alignment).

### Q: Why doesn't my language have synced lyrics yet for a specific song?
**A**: Regional and international language coverage expands continuously with each release; when word-sync is unavailable, Zenify falls back cleanly to plain lyrics.

---

## 📱 Installation & Setup

### Q: How do I install Zenify?
**A**: 
- **Web**: Visit [listenzenify.vercel.app](https://listenzenify.vercel.app) (no install needed)
- **PWA**: Click "Install" in Chrome/Edge or "Add to Home Screen" in iOS/macOS Safari
- **Android (v1.1.22, Build 2036)**: Download the `16.2 MB` ARM64 APK or `36.8 MB` Universal APK from [listenzenify.vercel.app/download](https://listenzenify.vercel.app/download) or [GitHub Releases](https://github.com/hackerstudent29/Zenify/releases/tag/v1.1.22)
- **Docker**: `docker-compose up`

### Q: Do I need Node.js installed?
**A**: Only for manual self-hosted setup. Using the Web app, PWA, Docker, or Android APK requires no developer tools.

### Q: How long does setup take?
**A**: 
- Web: Instant
- PWA / Android APK: Under 1 minute
- Docker: 2 minutes
- Manual source build: 5–10 minutes

### Q: What's the minimum requirement?
**A**: Android 8.0+ (API 26+) for the native APK, or latest Chrome, Firefox, Safari, or Edge with Web Audio API for Web/PWA.

### Q: Does Zenify work on mobile and globally?
**A**: 
- **Android**: Native Flutter + Media3 ExoPlayer `1.9.2` APK (`com.zenify.mobile`)
- **Web / PWA**: Responsive worldwide web player & installable PWA
- **iOS / iPadOS**: Works via Safari PWA (`Share -> Add to Home Screen`)

---

## 🎵 Music Sources

### Q: Where does music come from?
**A**: 
- Pristine **320kbps Clean CDN** full-length streams (global and regional releases)
- **YouTube InnerTube** full-length audio & 16:9 4K music video streams with HTTP 206 seeking
- **Private Local Files** (your personal MP3, FLAC, WAV, M4A, AAC files)
> Zenify enforces a strict ban on 30-second preview snippets so every track plays in full length.

### Q: Can I use Zenify offline?
**A**: Yes! Works offline with:
- Downloaded full-length songs (`.m4a`) and offline music videos (`.mp4`) on Android
- Local files (MP3, FLAC, WAV, M4A, AAC)
- Offline synced & plain lyrics and artwork

### Q: Can I listen together with friends across the world?
**A**: Yes! **Room Together** supports up to 100 synchronized participants with shared queues, LiveKit voice chat, reactions, timestamped Story Moments, and session recaps.

### Q: Is Zenify open source and privacy-friendly?
**A**: Yes. Music streams are resolved seamlessly and open-source code is inspectable on GitHub.

---

## 💻 Technical

### Q: Is Zenify open source?
**A**: Yes, 100% open source (MIT License). See [GitHub](https://github.com/hackerstudent29/Zenify).

### Q: What's the tech stack?
**A**: React 19 + Vite (frontend), Fastify + PostgreSQL (backend), Flutter (mobile), Web Audio API (audio DSP).

### Q: Can I self-host Zenify?
**A**: Yes! See [INSTALLATION.md](INSTALLATION.md) for Docker setup.

### Q: Is there an API I can use?
**A**: Yes, see [DEVELOPER.md](DEVELOPER.md) for 50+ endpoints.

### Q: How do I contribute?
**A**: See [CONTRIBUTING.md](../CONTRIBUTING.md). All help welcome!

---

## 🔒 Privacy & Security

### Q: Does Zenify track me?
**A**: No. Zero tracking. Completely open source (audit the code).

### Q: Does Zenify have ads?
**A**: No ads, ever. Completely ad-free.

### Q: Who owns my data?
**A**: You do. Zenify doesn't collect personal data.

### Q: Is Zenify secure?
**A**: Yes. Regular security audits, HTTPS enforced, no vulnerabilities. See [SECURITY.md](../SECURITY.md).

### Q: How do I report security issues?
**A**: Email: hackerstudent29@gmail.com (48-hour response SLA).

---

## 🐛 Troubleshooting

### Q: Audio not playing?
**A**: See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for step-by-step solutions.

### Q: Lyrics out of sync?
**A**: Manual offset adjustment available in settings. Try refreshing lyrics.

### Q: App crashes on mobile?
**A**: Clear browser cache, update browser, or try Android APK.

### Q: Local files not showing?
**A**: Ensure MP3/FLAC have ID3 tags. Refresh library. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

---

## 💰 Pricing & Business

### Q: Will Zenify ever have a premium version?
**A**: No. Zenify will always be free. Premium paywalls are against our values.

### Q: How is Zenify funded?
**A**: Open source community. We welcome sponsorships via GitHub Sponsors.

### Q: Can I donate?
**A**: Yes! Click the sponsor button on GitHub or contribute code.

### Q: Can I use Zenify commercially?
**A**: Yes (MIT License). Attribution appreciated.

---

## 🚀 Roadmap & Future

### Q: What features are coming next?
**A**: See [CHANGELOG.md](../CHANGELOG.md) for latest `v1.1.22` releases (Sound Atlas across 177 countries & 76 cities, 20 DJ crossfade styles, 16:9 4K Video Theater & offline `.mp4` downloads, Replay & Insights with 27 metrics, and 16 Story Share templates) and upcoming cross-platform enhancements:
- Expanded Sound Atlas city scenes & additional regional feeds
- Collaborative playlists & artist analytics
- Native Apple silicon / iOS Swift exploration alongside PWA
- Podcast & long-form audio chapters

### Q: When is the next release?
**A**: Monthly releases. Check [CHANGELOG.md](../CHANGELOG.md) for dates.

### Q: Can I request a feature?
**A**: Yes! [Open an issue](https://github.com/hackerstudent29/Zenify/issues) or [discuss on GitHub](https://github.com/hackerstudent29/Zenify/discussions).

---

## 📞 Still Have Questions?

- **Documentation**: [README.md](../README.md)
- **Issues**: [GitHub Issues](https://github.com/hackerstudent29/Zenify/issues)
- **Discussions**: [GitHub Discussions](https://github.com/hackerstudent29/Zenify/discussions)
- **Email**: hackerstudent29@gmail.com

---

**Last updated**: November 2026 (`v1.1.22`)  
**Suggest a question?** Open an issue or discussion!

