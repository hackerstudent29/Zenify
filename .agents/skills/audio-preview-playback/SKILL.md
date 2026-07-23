---
name: audio-preview-playback
description: Troubleshooting and architectural rules for audio preview playback, iTunes stream lookup, stream header preservation, and HTML5 audio DOM mounting in Zenify.
---

# Audio Preview Playback & Streaming Skill Guide

## Primary Diagnostic Checkpoints

When debugging audio playback failures (`Playback Failed` modal or `AbortError`), check the following 3 layers:

### 1. Fast iTunes Direct AAC Preview Streams
- **File**: `backend/src/services/external-metadata.service.ts`
- **Rule**: Clean YouTube titles by stripping bracketed video metadata (`(Lyric Video)`, `(Official Video)`) and splitting on `|` delimiters.
- **Rule**: Place `cleanTitle` first in `queriesToTry` for iTunes lookup.
- **Rule**: Invalidate stale `/stream-youtube` fallback URLs in `audioSearchCache` when `options.preview` is active.

### 2. React HTML5 `<audio>` DOM Persistence
- **File**: `frontend/src/components/admin/track-upload-studio.tsx`
- **Rule**: Keep `<audio ref={audioRef}>` continuously mounted at component root JSX level. Never enclose `<audio>` inside conditional step blocks (`{step === 0 && ...}`).
- **Rule**: Ignore `AbortError` and `interrupted` rejections in `play().catch()` handlers.

### 3. Backend Stream Proxy Header Integrity
- **File**: `backend/src/routes/utils.routes.ts`
- **Rule**: In `/stream-youtube`, capture `firstChunk` during stream probing and write `reply.raw.write(firstChunk)` before piping.
- **Rule**: Inspect magic bytes (`0x1a45dfa3` vs `ftyp`) to set accurate `Content-Type: audio/webm` or `Content-Type: audio/mp4`.
- **Rule**: Leverage `yt-dlp -g` direct URL resolution paired with `streamProxyUrl` to enable HTTP 206 Range seeking.
