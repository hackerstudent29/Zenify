-- AlterTable
ALTER TABLE "Track" ADD COLUMN     "engagement_score" DOUBLE PRECISION DEFAULT 0;

-- AlterTable
ALTER TABLE "UserTrackStat" ADD COLUMN     "completionRateAvg" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "skipCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalListenDuration" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Track_genre_idx" ON "Track"("genre");

-- CreateIndex
CREATE INDEX "Track_plays_idx" ON "Track"("plays");

-- CreateIndex
CREATE INDEX "Track_createdAt_idx" ON "Track"("createdAt");

-- CreateIndex
CREATE INDEX "Track_engagement_score_idx" ON "Track"("engagement_score");
