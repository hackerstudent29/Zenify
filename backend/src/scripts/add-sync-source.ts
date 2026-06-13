import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
    const directUrl = process.env.DIRECT_URL;
    if (!directUrl) {
        console.error('DIRECT_URL is not set in environment.');
        process.exit(1);
    }
    
    console.log('[Schema] Connecting directly to database via DIRECT_URL...');
    const prismaDirect = new PrismaClient({
        datasources: {
            db: {
                url: directUrl,
            },
        },
    });

    console.log('[Schema] Adding sync_source column to Track table...');
    try {
        await prismaDirect.$executeRawUnsafe(`ALTER TABLE "Track" ADD COLUMN IF NOT EXISTS "sync_source" TEXT`);
        console.log('[Schema] Column sync_source successfully added!');
    } catch (e: any) {
        console.error('[Schema] Failed to add column:', e.message);
    } finally {
        await prismaDirect.$disconnect();
    }
}

main().catch(console.error);
