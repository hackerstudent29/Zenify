/*
  Warnings:

  - You are about to drop the column `play_count` on the `TrackAnalytics` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "TrackAnalytics" DROP COLUMN "play_count",
ADD COLUMN     "stream_count" INTEGER NOT NULL DEFAULT 0;
