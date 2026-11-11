# Database Schema Evolution & Migration Plan

This document details the database schema plan for implementing **Authentication (Google ID Token & Email OTP)**, **Settings Synchronization**, and **Listening Tracking & Insights Rollups** in the Zenify backend, fulfilling the specifications in **17-AUTH-SETTINGS-INSIGHTS-PROMPT.md**.

## Safety Guarantee: Zero Data Loss
- **No Tables Dropped**: All existing tables (`users`, `user_preferences`, `listen_events`, `artist_follows`, `refresh_tokens`, etc.) remain intact.
- **Additive Migrations Only**: All changes are strictly additive: new tables, new nullable/defaulted columns, and performance indexes.
- **Backwards Compatibility**: Existing web authentication tokens and web preferences continue functioning without interruption.

---

## 1. Table Evolution & Additions

### 1.1 `users` Table Evolution
Reusing existing `User` model, extending with columns required for guest sessions and soft deletion:
```prisma
// Existing User model extensions
model User {
  // Existing fields preserved: id, email, name, password, role, provider, googleId, avatarUrl, username, isVerified, timezone, country, age, etc.
  
  // New columns:
  isGuest        Boolean        @default(false) @map("is_guest")
  deletedAt      DateTime?      @map("deleted_at")
  displayName    String?        @map("display_name") // Fallback alias to name
  bio            String?

  // New relations:
  identities     AuthIdentity[]
  activeSessions Session[]
  listeningEvents ListeningEvent[]
  listeningEventArtists ListeningEventArtist[]
  userArtistStats UserArtistStat[]
  userHourlyStats UserHourlyStat[]
}
```

### 1.2 `auth_identities` (Multi-Provider Identity Table)
Enables one person = one user. Allows linking both Google OAuth (`sub` claim) and verified Email OTP to the same account:
```prisma
model AuthIdentity {
  id             String   @id @default(uuid())
  userId         String   @map("user_id")
  provider       String   // 'google' | 'email'
  providerUserId String   @map("provider_user_id") // Google 'sub' claim or normalized email
  email          String?
  createdAt      DateTime @default(now()) @map("created_at")

  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerUserId])
  @@index([userId])
  @@index([email])
  @@map("auth_identities")
}
```

### 1.3 `otp_codes` (Cryptographic Email OTP Storage)
Stores HMAC-SHA256 hashed 6-digit codes with strict 10-minute expiry, single-use tracking, and attempt rate-limiting:
```prisma
model OtpCode {
  id            String    @id @default(uuid())
  email         String
  codeHash      String    @map("code_hash")      // HMAC-SHA256(serverSecret, email + ":" + code)
  expiresAt     DateTime  @map("expires_at")
  attempts      Int       @default(0)
  consumedAt    DateTime? @map("consumed_at")
  createdAt     DateTime  @default(now()) @map("created_at")
  requestIpHash String?   @map("request_ip_hash") // SHA256 of requesting client IP for abuse tracking

  @@index([email, createdAt(sort: Desc)])
  @@map("otp_codes")
}
```

### 1.4 `sessions` (Rotating Refresh Token Family & Devices)
Implements 30-day rotating refresh tokens with family reuse detection and active device management:
```prisma
model Session {
  id          String    @id @default(uuid())
  userId      String    @map("user_id")
  refreshHash String    @unique @map("refresh_hash") // SHA-256 of opaque refresh token
  familyId    String    @map("family_id")            // Token family for reuse invalidation
  deviceId    String?   @map("device_id")
  deviceName  String?   @map("device_name")          // e.g. "Pixel 8 Pro", "Chrome on macOS"
  platform    String?   @map("platform")             // "android", "ios", "web"
  appVersion  String?   @map("app_version")
  createdAt   DateTime  @default(now()) @map("created_at")
  lastUsedAt  DateTime  @default(now()) @map("last_used_at")
  expiresAt   DateTime  @map("expires_at")
  revokedAt   DateTime? @map("revoked_at")

  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([familyId])
  @@map("sessions")
}
```

### 1.5 `user_preferences` Extensions
Extends existing `UserPreferences` table to support all new mobile rows and timestamped per-key conflict resolution:
```prisma
// Extensions to existing UserPreferences model
// New columns:
cellularQuality        String   @default("high") @map("cellular_quality")       // "low" | "high" | "lossless"
downloadQuality        String   @default("lossless") @map("download_quality")   // "low" | "high" | "lossless"
gaplessPlayback        Boolean  @default(true) @map("gapless_playback")
lyricsDefaultScript    String   @default("original") @map("lyrics_default_script") // "original" | "tanglish" | "hinglish"
saveListeningHistory   Boolean  @default(true) @map("save_listening_history")
profileVisibility      String   @default("public") @map("profile_visibility")   // "public" | "friends" | "private"
showTopArtists         Boolean  @default(true) @map("show_top_artists")
defaultRoomMode        String   @default("dj") @map("default_room_mode")        // "dj" | "collab"
whoCanInvite           String   @default("everyone") @map("who_can_invite")    // "everyone" | "friends"
autoHideDetails        Boolean  @default(true) @map("auto_hide_details")
syncTimestamps         Json?    @map("sync_timestamps")                        // { [prefKey: string]: ISO8601Timestamp }
```

### 1.6 `artist_follows` Synchronization
Augmenting existing `ArtistFollow` (`artist_follows`) table to support canonical YouTube channel `browseId` and standardized `artist_key`:
```prisma
// In model ArtistFollow:
// Existing: id, userId, artistProviderId, artistName, artistImage, createdAt
artistKey String?  @map("artist_key") // e.g. "UCxxxx" or "name:anirudh"
browseId  String?  @map("browse_id")  // YouTube Music Browse Channel ID

// Adding index:
@@index([userId, artistKey])
```

---

## 2. Listening Tracking & Insights Schema

Per Section 5.5 of the specification, the tracking pipeline requires raw events plus real-time aggregated rollups.

### 2.1 `listening_events` (Raw Ingestion Table)
Stores validated listen events synced from the Android native ExoPlayer journal:
```prisma
model ListeningEvent {
  userId          String   @map("user_id")
  eventId         String   @map("event_id")
  startedAt       DateTime @map("started_at")
  endedAt         DateTime @map("ended_at")
  tzOffsetMin     Int      @map("tz_offset_min")
  listenedMs      Int      @map("listened_ms")
  trackDurationMs Int      @map("track_duration_ms")
  endReason       String   @map("end_reason") // completed, skipped, error, paused_timeout, app_killed, queue_replaced
  trackSource     String   @default("youtube") @map("track_source")
  trackId         String   @map("track_id")
  trackTitle      String   @map("track_title")
  trackAlbum      String?  @map("track_album")
  language        String?  @map("language")
  genre           String?  @map("genre")
  contextType     String?  @map("context_type") // album, playlist, search, home, radio, liked, queue
  contextId       String?  @map("context_id")
  offline         Boolean  @default(false)
  quality         Int      @default(256)
  deviceId        String?  @map("device_id")
  qualified       Boolean  @default(false) // computed: listenedMs >= 30000 or (duration < 60000 and listenedMs * 2 >= duration)
  createdAt       DateTime @default(now()) @map("created_at")

  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([userId, eventId])
  @@index([userId, startedAt(sort: Desc)])
  @@index([userId, trackId])
  @@map("listening_events")
}
```

### 2.2 `listening_event_artists` (Multi-Artist Credit Mapping)
Ensures every credited artist on a collaboration receives full listening credit:
```prisma
model ListeningEventArtist {
  userId     String   @map("user_id")
  eventId    String   @map("event_id")
  artistKey  String   @map("artist_key")
  artistName String   @map("artist_name")
  isPrimary  Boolean  @default(true) @map("is_primary")

  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([userId, eventId, artistKey])
  @@index([userId, artistKey])
  @@map("listening_event_artists")
}
```

### 2.3 Rollup Tables (Insights Acceleration)
Rollup tables accelerate the **All Time** range and the **24x7 Heatmap** to guarantee <300ms response times:

```prisma
model UserArtistStat {
  userId      String    @map("user_id")
  artistKey   String    @map("artist_key")
  artistName  String    @map("artist_name")
  artistImage String?   @map("artist_image")
  plays       Int       @default(0)
  listenedMs  BigInt    @default(0) @map("listened_ms")
  firstPlayed DateTime  @default(now()) @map("first_played")
  lastPlayed  DateTime  @default(now()) @map("last_played")

  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([userId, artistKey])
  @@index([userId, plays(sort: Desc)])
  @@index([userId, listenedMs(sort: Desc)])
  @@map("user_artist_stats")
}

model UserHourlyStat {
  userId     String @map("user_id")
  dow        Int    // 0 = Sunday ... 6 = Saturday
  hour       Int    // 0 ... 23 (user local hour based on tzOffsetMin)
  listenedMs BigInt @default(0) @map("listened_ms")

  user       User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([userId, dow, hour])
  @@map("user_hourly_stats")
}
```

*(Note: `UserTrackStat` and `UserDailyStat` already exist in `schema.prisma` and will be augmented to record `listenedMs` and play count rollups concurrently).*

---

## 3. Raw SQL Migration Script (Preview)

```sql
-- 1. Create auth_identities
CREATE TABLE IF NOT EXISTS "auth_identities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "email" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "auth_identities_provider_provider_user_id_key" UNIQUE ("provider", "provider_user_id")
);
CREATE INDEX IF NOT EXISTS "auth_identities_user_id_idx" ON "auth_identities"("user_id");
CREATE INDEX IF NOT EXISTS "auth_identities_email_idx" ON "auth_identities"("email");

-- 2. Create otp_codes
CREATE TABLE IF NOT EXISTS "otp_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_ip_hash" TEXT,
    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "otp_codes_email_created_at_idx" ON "otp_codes"("email", "created_at" DESC);

-- 3. Create sessions
CREATE TABLE IF NOT EXISTS "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "refresh_hash" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "device_id" TEXT,
    "device_name" TEXT,
    "platform" TEXT,
    "app_version" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sessions_refresh_hash_key" UNIQUE ("refresh_hash"),
    CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX IF NOT EXISTS "sessions_family_id_idx" ON "sessions"("family_id");

-- 4. Extend User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "is_guest" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "display_name" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "bio" TEXT;

-- 5. Extend UserPreferences table
ALTER TABLE "UserPreferences" ADD COLUMN IF NOT EXISTS "cellular_quality" TEXT NOT NULL DEFAULT 'high';
ALTER TABLE "UserPreferences" ADD COLUMN IF NOT EXISTS "download_quality" TEXT NOT NULL DEFAULT 'lossless';
ALTER TABLE "UserPreferences" ADD COLUMN IF NOT EXISTS "gapless_playback" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserPreferences" ADD COLUMN IF NOT EXISTS "lyrics_default_script" TEXT NOT NULL DEFAULT 'original';
ALTER TABLE "UserPreferences" ADD COLUMN IF NOT EXISTS "save_listening_history" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserPreferences" ADD COLUMN IF NOT EXISTS "profile_visibility" TEXT NOT NULL DEFAULT 'public';
ALTER TABLE "UserPreferences" ADD COLUMN IF NOT EXISTS "show_top_artists" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserPreferences" ADD COLUMN IF NOT EXISTS "default_room_mode" TEXT NOT NULL DEFAULT 'dj';
ALTER TABLE "UserPreferences" ADD COLUMN IF NOT EXISTS "who_can_invite" TEXT NOT NULL DEFAULT 'everyone';
ALTER TABLE "UserPreferences" ADD COLUMN IF NOT EXISTS "auto_hide_details" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserPreferences" ADD COLUMN IF NOT EXISTS "sync_timestamps" JSONB;

-- 6. Create listening_events
CREATE TABLE IF NOT EXISTS "listening_events" (
    "user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3) NOT NULL,
    "tz_offset_min" INTEGER NOT NULL,
    "listened_ms" INTEGER NOT NULL,
    "track_duration_ms" INTEGER NOT NULL,
    "end_reason" TEXT NOT NULL,
    "track_source" TEXT NOT NULL DEFAULT 'youtube',
    "track_id" TEXT NOT NULL,
    "track_title" TEXT NOT NULL,
    "track_album" TEXT,
    "language" TEXT,
    "genre" TEXT,
    "context_type" TEXT,
    "context_id" TEXT,
    "offline" BOOLEAN NOT NULL DEFAULT false,
    "quality" INTEGER NOT NULL DEFAULT 256,
    "device_id" TEXT,
    "qualified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "listening_events_pkey" PRIMARY KEY ("user_id", "event_id"),
    CONSTRAINT "listening_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "listening_events_user_started_idx" ON "listening_events"("user_id", "started_at" DESC);
CREATE INDEX IF NOT EXISTS "listening_events_user_track_idx" ON "listening_events"("user_id", "track_id");

-- 7. Create listening_event_artists
CREATE TABLE IF NOT EXISTS "listening_event_artists" (
    "user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "artist_key" TEXT NOT NULL,
    "artist_name" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "listening_event_artists_pkey" PRIMARY KEY ("user_id", "event_id", "artist_key"),
    CONSTRAINT "listening_event_artists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "listening_event_artists_user_artist_idx" ON "listening_event_artists"("user_id", "artist_key");

-- 8. Create user_artist_stats
CREATE TABLE IF NOT EXISTS "user_artist_stats" (
    "user_id" TEXT NOT NULL,
    "artist_key" TEXT NOT NULL,
    "artist_name" TEXT NOT NULL,
    "artist_image" TEXT,
    "plays" INTEGER NOT NULL DEFAULT 0,
    "listened_ms" BIGINT NOT NULL DEFAULT 0,
    "first_played" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_played" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_artist_stats_pkey" PRIMARY KEY ("user_id", "artist_key"),
    CONSTRAINT "user_artist_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "user_artist_stats_user_plays_idx" ON "user_artist_stats"("user_id", "plays" DESC);

-- 9. Create user_hourly_stats
CREATE TABLE IF NOT EXISTS "user_hourly_stats" (
    "user_id" TEXT NOT NULL,
    "dow" INTEGER NOT NULL,
    "hour" INTEGER NOT NULL,
    "listened_ms" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "user_hourly_stats_pkey" PRIMARY KEY ("user_id", "dow", "hour"),
    CONSTRAINT "user_hourly_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
```

---

## 4. Execution Workflow
1. Apply Prisma migration schema updates (`backend/prisma/schema.prisma`).
2. Run Prisma migration generation (`npx prisma migrate dev --name auth_settings_insights_parity`).
3. Seed/backfill any existing users into `auth_identities` based on their `email` and `googleId`.
4. Validate query performance with EXPLAIN ANALYZE on index scans.

