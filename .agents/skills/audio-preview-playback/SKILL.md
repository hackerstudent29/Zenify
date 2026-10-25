---
name: audio-preview-playback
description: Troubleshooting and architectural rules for audio streaming, strict ban on 30-second iTunes previews, JioSaavn 320kbps CDN resolution, stream header preservation, and HTML5 audio DOM mounting in Zenify.
---

# Audio Preview Playback & Streaming Skill Guide

## Primary Diagnostic Checkpoints

When debugging audio playback failures (`Playback Failed` modal or `AbortError`), check the following 3 layers:

### 1. STRICT BAN on 30-Second iTunes Preview Audio & Full-Song Priority
- **Rule**: NEVER play or stream 30-second audio snippets (`mzstatic.com`, `audio-ssl.itunes.apple.com`, `itunes.apple.com/preview`) anywhere in the application—neither as primary playback nor as a fallback.
- **Priority 1: JioSaavn Clean CDN (320kbps full song)**: Use `CleanCdnAudioService.resolveAudio` for instant Akamai CDN direct streaming of complete songs.
- **Priority 2: yt-dlp Full Audio Stream**: Use `/stream-youtube` proxy with direct `googlevideo` URL resolution (`-g`) for full song streaming and range seeking.
- **Priority 3: RapidAPI Spotify / Music Downloader**: Use `RAPIDAPI_KEY` (`spotify81.p.rapidapi.com`, `spotify-downloader9.p.rapidapi.com`) to extract direct full MP3 streams.
- **Rule**: Strip all `previewUrl` parameters from track mappings and playback fallbacks.

### 2. React HTML5 `<audio>` DOM Persistence
- **File**: `frontend/src/components/player/global-audio.tsx`
- **Rule**: Keep `<audio ref={audioRef}>` continuously mounted at component root JSX level. Never enclose `<audio>` inside conditional step blocks (`{step === 0 && ...}`).
- **Rule**: Ignore `AbortError` and `interrupted` rejections in `play().catch()` handlers.
- **Rule**: If an audio stream returns an error, call `/tracks/:id/refetch-audio` to resolve a verified full-length audio stream. Never fall back to 30s preview snippets.

### 3. Backend Stream Proxy Header Integrity
- **File**: `backend/src/routes/utils.routes.ts`
- **Rule**: In `/stream-youtube`, capture `firstChunk` during stream probing and write `reply.raw.write(firstChunk)` before piping.
- **Rule**: Inspect magic bytes (`0x1a45dfa3` vs `ftyp`) to set accurate `Content-Type: audio/webm` or `Content-Type: audio/mp4`.
- **Rule**: Leverage `yt-dlp -g` direct URL resolution paired with `streamProxyUrl` to enable HTTP 206 Range seeking.

