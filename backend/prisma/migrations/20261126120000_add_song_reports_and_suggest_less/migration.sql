-- CreateTable: Song Reports + Screenshots (max 5 enforced in API & UI) + Per-User Track Suppressions (Suggest Less)
CREATE TABLE IF NOT EXISTS "song_reports" (
    "id" TEXT NOT NULL,
    "ticket_code" VARCHAR(24) NOT NULL,
    "user_id" TEXT,
    "device_key" VARCHAR(128),
    "reporter_email" VARCHAR(255),
    "reporter_name" VARCHAR(120),
    "track_id" VARCHAR(128) NOT NULL,
    "track_title" VARCHAR(256) NOT NULL,
    "artist_name" VARCHAR(256) NOT NULL,
    "album_name" VARCHAR(256),
    "cover_url" TEXT,
    "is_video" BOOLEAN NOT NULL DEFAULT false,
    "category" VARCHAR(64) NOT NULL,
    "sub_issues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "severity" VARCHAR(16) NOT NULL DEFAULT 'medium',
    "description" TEXT,
    "suggested_solutions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "user_solution" TEXT,
    "app_version" VARCHAR(32),
    "platform" VARCHAR(32),
    "audio_quality" VARCHAR(32),
    "context_source" VARCHAR(64),
    "status" VARCHAR(24) NOT NULL DEFAULT 'OPEN',
    "admin_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "song_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "song_report_screenshots" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime_type" VARCHAR(64) NOT NULL,
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "song_report_screenshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "user_track_suppressions" (
    "id" TEXT NOT NULL,
    "owner_key" VARCHAR(160) NOT NULL,
    "user_id" TEXT,
    "device_key" VARCHAR(128),
    "track_key" VARCHAR(128) NOT NULL,
    "signature" VARCHAR(256) NOT NULL,
    "title" VARCHAR(256) NOT NULL,
    "artist" VARCHAR(256) NOT NULL,
    "album" VARCHAR(256),
    "cover_url" TEXT,
    "is_video" BOOLEAN NOT NULL DEFAULT false,
    "suppression_level" VARCHAR(24) NOT NULL DEFAULT 'ultra_less',
    "reason" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_track_suppressions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "song_reports_ticket_code_key" ON "song_reports"("ticket_code");
CREATE INDEX IF NOT EXISTS "song_reports_user_id_created_at_idx" ON "song_reports"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "song_reports_device_key_created_at_idx" ON "song_reports"("device_key", "created_at");
CREATE INDEX IF NOT EXISTS "song_reports_track_id_idx" ON "song_reports"("track_id");
CREATE INDEX IF NOT EXISTS "song_reports_status_created_at_idx" ON "song_reports"("status", "created_at");
CREATE INDEX IF NOT EXISTS "song_report_screenshots_report_id_position_idx" ON "song_report_screenshots"("report_id", "position");

CREATE UNIQUE INDEX IF NOT EXISTS "user_track_suppressions_owner_key_track_key_key" ON "user_track_suppressions"("owner_key", "track_key");
CREATE INDEX IF NOT EXISTS "user_track_suppressions_owner_key_idx" ON "user_track_suppressions"("owner_key");
CREATE INDEX IF NOT EXISTS "user_track_suppressions_user_id_idx" ON "user_track_suppressions"("user_id");
CREATE INDEX IF NOT EXISTS "user_track_suppressions_device_key_idx" ON "user_track_suppressions"("device_key");
CREATE INDEX IF NOT EXISTS "user_track_suppressions_signature_idx" ON "user_track_suppressions"("signature");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'song_reports_user_id_fkey'
  ) THEN
    ALTER TABLE "song_reports" ADD CONSTRAINT "song_reports_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'song_report_screenshots_report_id_fkey'
  ) THEN
    ALTER TABLE "song_report_screenshots" ADD CONSTRAINT "song_report_screenshots_report_id_fkey"
      FOREIGN KEY ("report_id") REFERENCES "song_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_track_suppressions_user_id_fkey'
  ) THEN
    ALTER TABLE "user_track_suppressions" ADD CONSTRAINT "user_track_suppressions_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
