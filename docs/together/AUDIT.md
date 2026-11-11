# Room Together Backend & Integration Audit

## 1. Existing Stack Summary
- **Backend Framework**: Fastify 5 (`backend/src/index.ts`), `@fastify/websocket` 11, `@fastify/multipart` 9, `@fastify/jwt`, `helmet` (with CSRF origin hook), Zod 4.
- **Database**: PostgreSQL (AWS RDS) via Prisma ORM (`backend/prisma/schema.prisma`). Note: 49 tables already exist; `user_achievements` is already in use for global badges, so Room Together achievement progress uses `room_user_achievements` (`TogetherUserAchievement`) alongside `achievement_defs`.
- **Cache**: `ioredis` optional client in `backend/src/utils/cache.ts` (`REDIS_URL` currently unset in local `.env`, so `cache.ts` gracefully uses in-memory TTL store fallback while supporting Redis whenever `REDIS_URL` is configured).
- **Object Storage**: Cloudflare R2 (`@aws-sdk/client-s3` in `backend/src/utils/s3.ts`, configured via `R2_*` env vars) with Cloudinary fallback (`backend/src/utils/cloudinary.ts`).
- **Auth**: JWT bearer token (`server.authenticate` / `server.optionalAuthenticate` in `backend/src/middleware/auth.ts`). Room Together supports both authenticated Zenify users and guest identities (`guest_<id>`) on room endpoints, while reserving `/insights` and personal privacy for authenticated users.
- **Audio & Lyrics Services Reused (No New Libraries / No Mocks)**:
  - **Lyrics**: Reuses existing `LyricsOrchestrator` (`backend/src/lyrics/orchestrator.ts`) across all existing providers (`better-lyrics`, `jiosaavn`, `lrc-red`, `lrclib`, `lyrics-ovh`, `netease`, `simpmusic`, `unison`) plus Prisma `lyrics_documents` cache.
  - **Recommendations & Catalog**: Reuses existing `RecommendationsService`, `CompositeCatalogService`, `UniversalSearchService`, `ExternalMetadataService`, and local Prisma `Track` catalog (no 30-second iTunes previews).
  - **Voice (LiveKit)**: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` are not set in `.env`. The voice module implements real HS256 LiveKit JWT signing, LiveKit Twirp REST calls (`UpdateParticipant`, `MutePublishedTrack`, `DeleteRoom`), and webhook verification, and cleanly returns `503 VOICE_NOT_CONFIGURED` when LiveKit credentials are absent.

## 2. Architecture Layout
- **Routes**:
  - Legacy `/api/together/*` preserved for backward compatibility (`backend/src/routes/together.routes.ts`).
  - Versioned `/api/v1/together/*` (`backend/src/routes/together-v1.routes.ts`).
  - Android App Links / Universal Web Links (`/.well-known/assetlinks.json` and `/room/:code`).
  - WebSocket gateway `/ws/together` (`backend/src/websocket/together-ws.ts`) emitting versioned `{ eventId, schemaVersion, roomId, type, seq, revision, serverTimestampMs, actorId, payload }` envelopes with `RESUME { lastSeq }` replay and backward-compatible fields.
- **Modular Services (`backend/src/services/together/`)**:
  - `room-permission.service.ts` — RBAC roles, permissions, speak policy, idempotency cache, input sanitization.
  - `room-event.service.ts` — Transactional monotonic `seq`, `room_events` & `room_audit` persistence, WS envelope broadcast & replay, activity feed.
  - `room-session.service.ts` — Room creation, Crockford code generation, password hashing/brute-force lockout, state transitions, cover upload, DB recovery.
  - `room-membership.service.ts` — Member roles, ownership transfer, kick/block, waiting-room join requests, row-locked capacity check.
  - `queue-management.service.ts` — Queue revision concurrency (`409 QUEUE_CONFLICT`), DJ queue/request modes, queue lock, skip voting.
  - `room-lifecycle.scheduler.ts` — Presence tracking, 90s host failover, 10m stale member cleanup, T-5m/T-1m `ROOM_ENDING_SOON`, expiry, recap generation.
  - `voice-session.service.ts` — LiveKit HS256 token minting, Twirp moderation calls, webhook handler.
  - `room-analytics.service.ts` — Sessions, role time, user tracks, insights SQL aggregations, retention cleanup.
  - `achievement.service.ts` — Idempotent achievement progress & unlock evaluator.
  - `room-phase2.service.ts` — Bookmarks, reaction timeline, encrypted/hashed invites, chat edit/reply/soft-delete, theme, DJ settings, announcements, `LyricsOrchestrator` bridge, catalog-backed recommendations + feedback.

