# Audio Preview & Streaming Architecture Guidelines

## Overview
This document outlines standard architectural rules, debugging patterns, and code practices for audio preview fetching and stream proxying in the Zenify application. Follow these instructions whenever modifying track metadata imports, audio playback components, or backend streaming proxies.

---

## 1. Fast Audio Preview Resolution (iTunes CDN Priority)

### Problem
YouTube scraper metadata often returns cluttered titles like:
`"DARBAR (Tamil) - Tharam Maara Single (Lyric Video) | Rajinikanth | AR Murugadoss | Anirudh"`
If raw title/artist strings are passed directly to external lookup APIs (like iTunes), queries fail or fall back to slow real-time stdout streaming.

### Prevention & Solution Rules
- **Title Cleaning**: Always strip bracketed text (`(Lyric Video)`, `[Official Video]`, etc.) and split on `|` delimiters to extract the pure song title before searching external APIs.
- **iTunes Query Order**: In `ExternalMetadataService.fetchAudio`, ensure `cleanTitle` is placed at the top of `queriesToTry` so exact title matching succeeds even when movie/channel names contaminate artist metadata.
- **Cache Invalidation for Fallback URLs**: In `fetchAudio`, bypass `audioSearchCache` if the cached URL is a fallback `/stream-youtube` link during preview requests, ensuring the system can upgrade to an iTunes AAC preview stream when available.

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
