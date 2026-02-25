/*
  Warnings:

  - A unique constraint covering the columns `[username]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Album" ADD COLUMN     "popularity_score" DOUBLE PRECISION DEFAULT 0;

-- AlterTable
ALTER TABLE "Artist" ADD COLUMN     "follower_count" INTEGER DEFAULT 0,
ADD COLUMN     "popularity_score" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "verified" BOOLEAN DEFAULT false;

-- AlterTable
ALTER TABLE "Playlist" ADD COLUMN     "follower_count" INTEGER DEFAULT 0,
ADD COLUMN     "popularity_score" DOUBLE PRECISION DEFAULT 0;

-- AlterTable
ALTER TABLE "Rating" ADD COLUMN     "comment" TEXT;

-- AlterTable
ALTER TABLE "Track" ADD COLUMN     "allowDownloads" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "bpm" INTEGER,
ADD COLUMN     "composers" TEXT,
ADD COLUMN     "copyrightLabel" TEXT,
ADD COLUMN     "downloads" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "enableComments" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "featuredArtists" TEXT,
ADD COLUMN     "isUnlisted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "key" TEXT,
ADD COLUMN     "language" TEXT DEFAULT 'english',
ADD COLUMN     "like_count" INTEGER DEFAULT 0,
ADD COLUMN     "popularity_score" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "producers" TEXT,
ADD COLUMN     "releaseStatus" TEXT NOT NULL DEFAULT 'PUBLISHED',
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "age" INTEGER,
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- AddForeignKey
ALTER TABLE "Track" ADD CONSTRAINT "Track_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
