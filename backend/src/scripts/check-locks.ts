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
        console.log('--- Active database connections & queries ---');
        const activities: any[] = await prismaDirect.$queryRawUnsafe(`
            SELECT pid, state, query, CAST(age(clock_timestamp(), query_start) as text) as age, wait_event_type, wait_event
            FROM pg_stat_activity
            WHERE query NOT LIKE '%pg_stat_activity%' AND state IS NOT NULL
        `);
        console.log(JSON.stringify(activities, null, 2));

        console.log('\n--- Active locks ---');
        const locks: any[] = await prismaDirect.$queryRawUnsafe(`
            SELECT t.relname AS relation_name, l.mode, l.granted, l.pid, a.query
            FROM pg_locks l
            JOIN pg_class t ON l.relation = t.oid
            JOIN pg_stat_activity a ON l.pid = a.pid
            WHERE t.relname = 'Track'
        `);
        console.log(JSON.stringify(locks, null, 2));

    } catch (e: any) {
        console.error('Failed to query:', e.message);
    } finally {
        await prismaDirect.$disconnect();
    }
}

main().catch(console.error);
