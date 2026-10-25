# Audio Preview & Streaming Architecture Guidelines

## Overview
This document outlines standard architectural rules, debugging patterns, and code practices for audio preview fetching and stream proxying in the Zenify application. Follow these instructions whenever modifying track metadata imports, audio playback components, or backend streaming proxies.

---

## 1. Strict Ban on 30-Second iTunes Preview Audio & Full-Song Resolution Priority

### Policy & Architectural Rule
Playing 30-second audio snippets is strictly unacceptable in Zenify. Users must receive full-length, high-quality audio at all times.
- **Strict Ban on iTunes Previews**: Never play, stream, or return 30-second preview audio snippets (`mzstatic.com`, `audio-ssl.itunes.apple.com`, or `apple.com/preview`) anywhere in the app—neither for primary playback nor as a fallback.
- **Resolution Priority Order**:
  1. **JioSaavn Clean CDN (Pristine 320kbps Akamai CDN full song)**: Resolved instantly via `CleanCdnAudioService.resolveAudio`. Covers regional (Tamil, Telugu, Hindi, Malayalam, Punjabi) and international releases.
  2. **yt-dlp Stream Proxy**: Real-time YouTube full-audio extraction via `/stream-youtube` with direct URL resolution (`-g`) for HTTP 206 seeking.
  3. **RapidAPI Spotify / Music Downloader**: Full track MP3 resolution via active `RAPIDAPI_KEY` (`spotify81.p.rapidapi.com`, `spotify-downloader9.p.rapidapi.com`).
  4. **Cloudflare R2 Persistent Storage**: Ingested full tracks in Cloudflare R2 bucket (`pub-2e8a5f55356644999b77124c45ef0753.r2.dev`).
- **Frontend Safeguards**: In `global-audio.tsx`, reject any source containing `mzstatic` or `audio-ssl`. When a playback error occurs, trigger `/tracks/:id/refetch-audio` for full song recovery instead of falling back to preview URLs.

---

## 2. React HTML5 `<audio>` DOM Lifecycle & AbortError Handling

### Problem
Rendering `<audio>` elements inside conditional step views (e.g., `{step === 0 && <audio />}`) causes React to unmount the DOM element during state changes. If `play()` is pending, Chrome/Edge rejects the promise with:
`AbortError: The play() request was interrupted because the media was removed from the document.`

### Prevention & Solution Rules
- **Persistent Root Mounting**: Always mount `<audio ref={audioRef}>` elements at the persistent root of the React component JSX hierarchy, outside conditional step blocks.
- **Filter AbortError Rejections**: In `play()` `.catch()` handlers, explicitly filter out `AbortError` and interrupted messages:
  ```ts
  if (err?.name === 'AbortError' || err?.message?.includes('interrupted')) return;
  ```
  This prevents showing alarming user error alerts during routine DOM updates or user pause actions.

---

## 3. Real-Time Stream Proxying & Container Header Integrity (`/stream-youtube`)

### Problem
When probing stream startup via `proc.stdout.once('data')`, the first data chunk containing the container header (`ftyp` box for MP4 or EBML header for WebM) is consumed. If `proc.stdout.pipe(reply.raw)` is called afterwards, the initial header chunk is missing from the HTTP response, causing HTML5 `<audio>` players to fail demuxing with `Playback Failed`.

### Prevention & Solution Rules
- **Preserve Header Chunks**: Capture `firstChunk` during stream probing and explicitly flush `reply.raw.write(firstChunk)` before piping subsequent stream data:
  ```ts
  if (startOk && firstChunk) {
      const isWebm = firstChunk[0] === 0x1a && firstChunk[1] === 0x45 && firstChunk[2] === 0xdf && firstChunk[3] === 0xa3;
      const contentType = isWebm ? 'audio/webm' : 'audio/mp4';

      reply.raw.writeHead(200, {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache',
      });

      reply.raw.write(firstChunk);
      proc.stdout.pipe(reply.raw);
  }
  ```
- **Direct URL Resolution Strategy**: In `/stream-youtube`, attempt `yt-dlp -g` first to extract direct `googlevideo` HTTPS stream URLs and proxy them via `streamProxyUrl`. This enables native HTTP 206 Partial Content range seeking and instant playback.

---

## 4. Mandatory Signature Admin Console Button Design System

### Standard Signature Button Rule
ALL action buttons, import buttons, catalog trigger buttons, and action controls created across the Zenify application MUST strictly follow the exact signature button design used in the Admin Console (`IMPORT DETAILS` / `TrackUploadStudio`).

### Mandatory Tailwind Classes for Buttons:
```tsx
className="h-10 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
```

### Key Design Parameters:
- **Background**: Dark Charcoal Neutral (`bg-zinc-900 hover:bg-zinc-800` or `bg-zinc-900/90`)
- **Border**: Crisp micro border (`border border-white/10` or `border-white/5`)
- **Text Color**: High-contrast Crimson/Maroon Red (`text-brand`)
- **Typography**: `text-[10px] font-bold uppercase tracking-widest`
- **Corner Curve**: Rounded corners `rounded-xl`
- **Icon Accent**: `text-brand` matching red text
- **Micro-Interactions**: `transition-all active:scale-95 cursor-pointer disabled:opacity-50`

