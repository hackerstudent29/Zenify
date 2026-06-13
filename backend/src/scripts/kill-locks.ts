import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
    const directUrl = process.env.DIRECT_URL;
    if (!directUrl) {
        console.error('DIRECT_URL not set');
        process.exit(1);
    }
    const prismaDirect = new PrismaClient({
        datasources: { db: { url: directUrl } }
    });

    try {
        console.log('[LockRemover] Terminating dangling transaction with pid 54011...');
        const res = await prismaDirect.$queryRawUnsafe(`SELECT pg_terminate_backend(54011)`);
        console.log('[LockRemover] Terminated result:', res);

        console.log('[LockRemover] Terminating any other idle in transaction sessions...');
        const resOthers: any[] = await prismaDirect.$queryRawUnsafe(`
            SELECT pid, pg_terminate_backend(pid) as terminated
            FROM pg_stat_activity
            WHERE state = 'idle in transaction' AND pid <> pg_backend_pid()
        `);
        console.log('[LockRemover] Terminated others:', resOthers);

        console.log('[LockRemover] Retrying ALTER TABLE on Track...');
        await prismaDirect.$executeRawUnsafe(`ALTER TABLE "Track" ADD COLUMN IF NOT EXISTS "sync_source" TEXT`);
        console.log('[LockRemover] Column sync_source successfully added!');

    } catch (e: any) {
        console.error('[LockRemover] Error:', e.message);
    } finally {
        await prismaDirect.$disconnect();
    }
}

main().catch(console.error);
