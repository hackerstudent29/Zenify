import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import { prisma } from '../src/utils/prisma.js';

async function main() {
    console.log('Ensuring LyricEnrichmentJob table exists in Postgres...');
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "LyricEnrichmentJob" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "trackId" TEXT NOT NULL UNIQUE REFERENCES "Track"("id") ON DELETE CASCADE,
            "status" TEXT NOT NULL DEFAULT 'pending',
            "audioHash" TEXT,
            "attempts" INTEGER NOT NULL DEFAULT 0,
            "maxAttempts" INTEGER NOT NULL DEFAULT 3,
            "lastProcessedAt" TIMESTAMP(3),
            "nextRetryAt" TIMESTAMP(3),
            "source" TEXT,
            "enrichmentType" TEXT,
            "confidence" DOUBLE PRECISION,
            "error" TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "LyricEnrichmentJob_status_nextRetryAt_idx" ON "LyricEnrichmentJob"("status", "nextRetryAt");
    `);

    await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "LyricEnrichmentJob_trackId_idx" ON "LyricEnrichmentJob"("trackId");
    `);

    console.log('✅ LyricEnrichmentJob table and indexes ensured successfully.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
