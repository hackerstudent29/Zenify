# Troubleshooting Guide

## 🎵 Audio Playback Issues

### Audio Not Playing
**Problem**: Track starts but no sound comes out.

**Solutions**:
1. **Check volume** – Browser volume might be muted. Check system volume + browser tab volume.
2. **Check audio context** – Open browser DevTools (F12) → Console. Type: `audioContext.state` → should say "running"
   - If "suspended": Click the play button again to resume audio context (some browsers require user interaction)
3. **Check audio source** – Try a different song. YouTube CDN might be unavailable.
4. **Clear cache** – Open Settings → Clear cache, then reload the app.
5. **Try incognito mode** – Browser extensions might block audio. Open in incognito/private mode.

### Audio Crackling / Stuttering
**Problem**: Audio has pops, clicks, or stutters.

**Solutions**:
1. **Lower effects intensity** – Go to Audio Effects → Lower EQ values, reduce reverb/chorus levels
2. **Disable 8D Audio** – 8D panning is CPU-intensive. Try disabling it.
3. **Close browser tabs** – Too many tabs = CPU overload. Close unnecessary tabs.
4. **Restart browser** – Sometimes audio buffers get corrupted.
5. **Update browser** – Old browser versions have worse Web Audio performance.

### Audio Cutting Out / Stops Unexpectedly
**Problem**: Track stops or disconnects mid-playback.

**Solutions**:
1. **Check internet connection** – Weak WiFi = streaming interruptions. Try wired ethernet or stronger WiFi.
2. **Check YouTube availability** – Zenify streams from YouTube CDN by default. YouTube might be blocked in your region.
   - Try a VPN (if not blocked)
3. **Check rate limiting** – Backend might be rate-limiting your IP. Wait 5 minutes and try again.
4. **Restart the app** – Reload the page: `Ctrl+R` (Windows/Linux) or `Cmd+R` (Mac)

### Lyrics Out of Sync
**Problem**: Lyrics don't match the music (too early, too late, or missing).

**Solutions**:
1. **Manual sync offset** – Settings → Lyrics → Offset (adjust +/- milliseconds)
2. **Refresh lyrics** – Click the lyrics icon again to re-load
3. **Try a different source** – Some songs have multiple lyric versions. Search the track again.
4. **Report the issue** – If sync is consistently wrong, [report on GitHub Issues](https://github.com/hackerstudent29/Zenify/issues)

---

## 📁 Local Files Issues

### Local Files Not Showing
**Problem**: You added local music files, but they don't appear in the library.

**Solutions**:
1. **Check file format** – Zenify supports: MP3, FLAC, WAV, M4A, AAC
   - Unsupported formats: OGG, AIFF, WMA (use an online converter)
2. **Check file metadata** – Files must have ID3 tags (title, artist, album)
   - Use [MP3Tag](https://www.mp3tag.de/) or [Tagger](https://tagger.pic-me.de/) to add tags
3. **Refresh library** – Settings → Library → Refresh local library
4. **Check file permissions** – Make sure Zenify has read access to the file location
5. **Try a test file** – Download a known-good MP3 (like from a music site) and try uploading it

### Local Files Playing Incorrectly
**Problem**: Local file plays but sounds weird (wrong speed, wrong pitch, crackling).

**Solutions**:
1. **Disable effects** – Try playing without EQ/effects to isolate the issue
2. **Try a different file** – The file might be corrupted. Use a media player (VLC, Windows Media Player) to verify it plays correctly
3. **Convert the file** – Zenify prefers MP3/AAC. If using FLAC/WAV, try converting to MP3 first
4. **Clear cache** – Settings → Clear cache

---

## 🌐 Connection & Network Issues

### "No Internet" Error / Can't Search
**Problem**: Search fails or shows network error.

**Solutions**:
1. **Check your internet** – Open Google.com to verify connectivity
2. **Check backend availability** – Backend at `https://api.listenzenify.com` might be down
   - Check [GitHub Status](https://github.com/hackerstudent29/Zenify/issues) for ongoing issues
3. **Try VPN** – Some ISPs/regions block music streaming. Use a VPN.
4. **Disable DNS filtering** – Some routers block streaming. Try a different DNS:
   - Cloudflare DNS: `1.1.1.1` + `1.0.0.1`
   - Google DNS: `8.8.8.8` + `8.8.4.4`

### Website Very Slow / Not Loading
**Problem**: App takes forever to load or is sluggish.

**Solutions**:
1. **Check internet speed** – Run a speedtest at [speedtest.net](https://speedtest.net)
   - Zenify needs at least 1 Mbps for smooth streaming
2. **Clear browser cache** – Browser might be storing too much data
   - DevTools (F12) → Application → Storage → Clear everything
3. **Restart router** – Unplug router for 30 seconds, then plug back in
4. **Try a different browser** – Chrome, Firefox, Safari, Edge all perform differently
5. **Check for malware** – Run antivirus scan (some malware slows streaming)

---

## 🎨 UI & Display Issues

### App Looks Broken / Elements Not Showing
**Problem**: Buttons missing, text overlapping, or interface glitched.

**Solutions**:
1. **Hard refresh** – `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac) to bypass cache
2. **Check screen resolution** – Zenify is optimized for 1024px+ width. Very small screens might have issues.
3. **Zoom reset** – Reset browser zoom: `Ctrl+0` (Windows/Linux) or `Cmd+0` (Mac)
4. **Try different browser** – Could be a browser-specific rendering issue
5. **Clear local storage** – DevTools (F12) → Application → Local Storage → Delete all

### Dark/Light Theme Not Switching
**Problem**: Theme toggle doesn't change colors.

**Solutions**:
1. **Refresh page** – Theme changes take effect on reload
2. **Check OS theme** – Zenify might be following system theme. Change OS theme settings.
3. **Clear cache** – Settings → Clear cache

---

## 📱 Mobile / PWA Issues

### App Crashes on Mobile
**Problem**: App crashes or keeps reloading on phone.

**Solutions**:
1. **Check phone storage** – If storage is full, browser can't cache. Free up space.
2. **Clear browser cache** – Settings → Apps → Browser → Storage → Clear cache
3. **Update browser** – Old mobile browsers have bugs. Update to latest version.
4. **Try Chrome instead** – Some users report issues on Firefox mobile. Chrome is more stable for Zenify.
5. **Reinstall APK** – If using Android APK, uninstall + reinstall the latest version

### PWA Install Not Working
**Problem**: "Install" button doesn't appear or installation fails.

**Solutions**:
1. **Use Chrome/Edge on Desktop** – PWA installation works best on Chrome, Edge, Firefox
2. **Use HTTPS connection** – PWA requires secure HTTPS (but listenzenify.vercel.app is HTTPS)
3. **Wait a moment** – Install button appears after you've visited the page a few times
4. **Check settings** – Browser PWA installation might be disabled. Enable it:
   - Chrome: Settings → Apps → "Allow sites to install apps"
5. **Try again tomorrow** – Sometimes cache needs to refresh

### Offline Mode Not Working
**Problem**: App requires internet even though it should work offline.

**Solutions**:
1. **First, load online** – Offline mode only caches content you've already loaded online. Load songs first.
2. **Check service worker** – DevTools (F12) → Application → Service Workers → Status should be "activated and running"
3. **Try a cached song** – Offline works for: local files + previously played songs
4. **Clear cache, then load** – Go online, load a song, then go offline
5. **Use PWA version** – Installed PWA app has better offline support than web browser

---

## 🔐 Account & Login Issues

### Can't Log In / Forgot Password
**Problem**: Login fails or password reset doesn't work.

**Solutions**:
1. **Check email** – Check spam folder for reset email
2. **Wait 5 minutes** – Email might take time to arrive
3. **Try different browser** – Login cookies might be cached in old browser
4. **Clear cookies** – DevTools (F12) → Application → Cookies → Delete all
5. **Contact support** – [GitHub Issues](https://github.com/hackerstudent29/Zenify/issues) for account problems

---

## 🐛 Reporting Bugs

If you've tried all solutions above and still have issues:

1. **[Open a GitHub Issue](https://github.com/hackerstudent29/Zenify/issues/new)**
2. **Include**:
   - What you were doing when the bug occurred
   - Your browser + version (Chrome 130, Firefox 131, etc.)
   - Operating system (Windows, Mac, Linux, Android)
   - Error message from DevTools Console (F12)
   - Screenshot if visual issue
3. **Example**:
   ```
   **Problem**: Audio cuts out after 2 minutes
   **Browser**: Chrome 130 on Windows 11
   **Steps**: Open Zenify → Search "Never Gonna Give You Up" → Play
   **Error**: (screenshot of console error)
   ```

---

## 🚀 Still Stuck?

- **Documentation**: Read [DEVELOPER.md](DEVELOPER.md) for tech details
- **Issues**: [GitHub Issues](https://github.com/hackerstudent29/Zenify/issues)
- **Discussions**: [GitHub Discussions](https://github.com/hackerstudent29/Zenify/discussions)
- **Email**: hackerstudent29@gmail.com (for security/urgent issues)

