/*
  Warnings:

  - You are about to drop the column `plays` on the `Track` table. All the data in the column will be lost.
  - You are about to drop the column `lastPlayedAt` on the `UserTrackStat` table. All the data in the column will be lost.
  - You are about to drop the column `playCount` on the `UserTrackStat` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Track_plays_idx";

-- AlterTable
ALTER TABLE "Album" ADD COLUMN     "search_vector" tsvector;

-- AlterTable
ALTER TABLE "Artist" ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "coverUrl" TEXT,
ADD COLUMN     "monthlyListeners" INTEGER DEFAULT 0,
ADD COLUMN     "role" TEXT,
ADD COLUMN     "search_vector" tsvector,
ADD COLUMN     "totalStreams" BIGINT DEFAULT 0;

-- AlterTable
ALTER TABLE "Playlist" ADD COLUMN     "search_vector" tsvector;

-- AlterTable
ALTER TABLE "Track" DROP COLUMN "plays",
ADD COLUMN     "region" TEXT DEFAULT 'Global',
ADD COLUMN     "search_vector" tsvector,
ADD COLUMN     "streams" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trackNumber" INTEGER DEFAULT 1,
ADD COLUMN     "track_type" TEXT NOT NULL DEFAULT 'original';

-- AlterTable
ALTER TABLE "UserTrackStat" DROP COLUMN "lastPlayedAt",
DROP COLUMN "playCount",
ADD COLUMN     "lastStreamedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "streamCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TrackAnalytics" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_listen_time" INTEGER NOT NULL DEFAULT 0,
    "play_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TrackAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrackAnalytics_date_idx" ON "TrackAnalytics"("date");

-- CreateIndex
CREATE UNIQUE INDEX "TrackAnalytics_trackId_date_key" ON "TrackAnalytics"("trackId", "date");

-- CreateIndex
CREATE INDEX "Track_streams_idx" ON "Track"("streams");

-- CreateIndex
CREATE INDEX "Track_language_idx" ON "Track"("language");

-- CreateIndex
CREATE INDEX "Track_region_idx" ON "Track"("region");

-- CreateIndex
CREATE INDEX "Track_track_type_idx" ON "Track"("track_type");

-- AddForeignKey
ALTER TABLE "TrackAnalytics" ADD CONSTRAINT "TrackAnalytics_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;
