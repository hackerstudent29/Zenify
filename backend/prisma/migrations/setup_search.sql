-- 1. Add missing columns and search_vector columns
-- Tracks
ALTER TABLE "Track" ADD COLUMN IF NOT EXISTS "language" TEXT DEFAULT 'english';
ALTER TABLE "Track" ADD COLUMN IF NOT EXISTS "popularity_score" FLOAT DEFAULT 0;
ALTER TABLE "Track" ADD COLUMN IF NOT EXISTS "like_count" INTEGER DEFAULT 0;
ALTER TABLE "Track" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;

-- Artists
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "follower_count" INTEGER DEFAULT 0;
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "verified" BOOLEAN DEFAULT false;
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "popularity_score" FLOAT DEFAULT 0;
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;

-- Albums
ALTER TABLE "Album" ADD COLUMN IF NOT EXISTS "popularity_score" FLOAT DEFAULT 0;
ALTER TABLE "Album" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;

-- Playlists
ALTER TABLE "Playlist" ADD COLUMN IF NOT EXISTS "follower_count" INTEGER DEFAULT 0;
ALTER TABLE "Playlist" ADD COLUMN IF NOT EXISTS "popularity_score" FLOAT DEFAULT 0;
ALTER TABLE "Playlist" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;

-- 2. Create Search Vector Update Function
CREATE OR REPLACE FUNCTION update_search_vectors() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'Track' THEN
    NEW.search_vector :=
      to_tsvector('english', coalesce(NEW.title, '')) ||
      to_tsvector('english', coalesce((SELECT name FROM "Artist" WHERE id = NEW."artistId"), '')) ||
      to_tsvector('english', coalesce((SELECT title FROM "Album" WHERE id = NEW."albumId"), '')) ||
      to_tsvector('english', coalesce(NEW.genre, ''));
  ELSIF TG_TABLE_NAME = 'Artist' THEN
    NEW.search_vector := to_tsvector('english', coalesce(NEW.name, ''));
  ELSIF TG_TABLE_NAME = 'Album' THEN
    NEW.search_vector := to_tsvector('english', coalesce(NEW.title, ''));
  ELSIF TG_TABLE_NAME = 'Playlist' THEN
    NEW.search_vector := to_tsvector('english', coalesce(NEW.name, ''));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create Triggers
DROP TRIGGER IF EXISTS trg_track_search_update ON "Track";
CREATE TRIGGER trg_track_search_update BEFORE INSERT OR UPDATE OF title, genre, "artistId", "albumId" ON "Track"
FOR EACH ROW EXECUTE FUNCTION update_search_vectors();

DROP TRIGGER IF EXISTS trg_artist_search_update ON "Artist";
CREATE TRIGGER trg_artist_search_update BEFORE INSERT OR UPDATE OF name ON "Artist"
FOR EACH ROW EXECUTE FUNCTION update_search_vectors();

DROP TRIGGER IF EXISTS trg_album_search_update ON "Album";
CREATE TRIGGER trg_album_search_update BEFORE INSERT OR UPDATE OF title ON "Album"
FOR EACH ROW EXECUTE FUNCTION update_search_vectors();

DROP TRIGGER IF EXISTS trg_playlist_search_update ON "Playlist";
CREATE TRIGGER trg_playlist_search_update BEFORE INSERT OR UPDATE OF name ON "Playlist"
FOR EACH ROW EXECUTE FUNCTION update_search_vectors();

-- 4. Initial Vector Population
UPDATE "Track" SET search_vector = to_tsvector('english', coalesce(title, '')) || to_tsvector('english', coalesce(genre, ''));
UPDATE "Artist" SET search_vector = to_tsvector('english', coalesce(name, ''));
UPDATE "Album" SET search_vector = to_tsvector('english', coalesce(title, ''));
UPDATE "Playlist" SET search_vector = to_tsvector('english', coalesce(name, ''));

-- 5. Create GIN Indexes for FTS
CREATE INDEX IF NOT EXISTS idx_track_search ON "Track" USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_artist_search ON "Artist" USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_album_search ON "Album" USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_playlist_search ON "Playlist" USING GIN(search_vector);

-- 6. Create Prefix Indexes for Autocomplete
CREATE INDEX IF NOT EXISTS idx_tracks_title_prefix ON "Track" (title text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_artists_name_prefix ON "Artist" (name text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_albums_title_prefix ON "Album" (title text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_playlists_name_prefix ON "Playlist" (name text_pattern_ops);
