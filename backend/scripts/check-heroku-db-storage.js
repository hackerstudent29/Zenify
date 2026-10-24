/**
 * Zenify Heroku PostgreSQL Database Storage & Stats Inspector
 * Run directly in terminal:
 *   node scripts/check-heroku-db-storage.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');

function formatBytes(bytes) {
  if (!bytes || bytes === 0 || isNaN(bytes)) return '0 B';
  const num = typeof bytes === 'string' ? parseInt(bytes, 10) : Number(bytes);
  if (isNaN(num) || num === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(num) / Math.log(k));
  return parseFloat((num / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function inspectHerokuDatabase() {
  console.log('\n\x1b[1m\x1b[34m========================================================\x1b[0m');
  console.log('\x1b[1m\x1b[34m     ZENIFY - HEROKU POSTGRESQL DB STORAGE & STATS      \x1b[0m');
  console.log('\x1b[1m\x1b[34m========================================================\x1b[0m\n');

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('\x1b[31m[ERROR] Missing DATABASE_URL in .env\x1b[0m');
    process.exit(1);
  }

  // Parse host and database name safely for display
  try {
    const urlObj = new URL(dbUrl);
    console.log(`\x1b[90mHost:\x1b[0m       \x1b[33m${urlObj.hostname}\x1b[0m`);
    console.log(`\x1b[90mDatabase:\x1b[0m   \x1b[33m${urlObj.pathname.replace('/', '')}\x1b[0m`);
    console.log(`\x1b[90mUser:\x1b[0m       ${urlObj.username}`);
  } catch (e) {
    console.log(`\x1b[90mDatabase URL:\x1b[0m [Configured]`);
  }

  console.log('\x1b[90mConnecting to PostgreSQL database...\x1b[0m\n');

  const prisma = new PrismaClient();

  try {
    // 1. Get Database Version
    const versionRes = await prisma.$queryRawUnsafe('SELECT version();');
    const versionStr = versionRes[0]?.version || 'PostgreSQL';
    const shortVersion = versionStr.split(',')[0];

    // 2. Total Database Size
    const totalSizeRes = await prisma.$queryRawUnsafe(`
      SELECT 
        pg_database_size(current_database()) AS total_bytes,
        pg_size_pretty(pg_database_size(current_database())) AS total_pretty
    `);
    const totalBytes = Number(totalSizeRes[0]?.total_bytes || 0);
    const totalPretty = totalSizeRes[0]?.total_pretty || formatBytes(totalBytes);

    // 3. Active Connections Count
    const connectionsRes = await prisma.$queryRawUnsafe(`
      SELECT 
        count(*)::int AS total,
        count(CASE WHEN state = 'active' THEN 1 END)::int AS active,
        count(CASE WHEN state = 'idle' THEN 1 END)::int AS idle
      FROM pg_stat_activity 
      WHERE datname = current_database();
    `);
    const connStats = connectionsRes[0] || { total: 0, active: 0, idle: 0 };

    // 4. Per Table Sizes & Live Row Counts
    const tablesRes = await prisma.$queryRawUnsafe(`
      SELECT
        c.relname AS table_name,
        COALESCE(s.n_live_tup, 0)::bigint AS row_count,
        pg_total_relation_size(c.oid)::bigint AS total_bytes,
        pg_relation_size(c.oid)::bigint AS table_bytes,
        pg_indexes_size(c.oid)::bigint AS index_bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC;
    `);

    let totalRowCount = 0;
    const tableData = tablesRes.map((t) => {
      const rows = Number(t.row_count || 0);
      const totalB = Number(t.total_bytes || 0);
      const tableB = Number(t.table_bytes || 0);
      const indexB = Number(t.index_bytes || 0);
      totalRowCount += rows;

      return {
        table: t.table_name,
        rows: rows,
        totalBytes: totalB,
        tableBytes: tableB,
        indexBytes: indexB,
      };
    });

    // Summary Box
    console.log('\x1b[1m\x1b[32m[DATABASE OVERVIEW]\x1b[0m');
    console.log(`  Engine:               \x1b[36m${shortVersion}\x1b[0m`);
    console.log(`  Total DB Size:        \x1b[1m\x1b[32m${totalPretty}\x1b[0m (${totalBytes.toLocaleString()} bytes)`);
    console.log(`  Total Tables:         \x1b[1m${tableData.length}\x1b[0m tables in 'public' schema`);
    console.log(`  Total Live Rows:      \x1b[1m\x1b[33m${totalRowCount.toLocaleString()}\x1b[0m rows`);
    console.log(`  Active Connections:   \x1b[1m${connStats.total}\x1b[0m (${connStats.active} active, ${connStats.idle} idle)\n`);

    // Top Tables by Space Usage Table
    console.log('\x1b[1m\x1b[33m[STORAGE FOOTPRINT BY TABLE (SORTED BY TOTAL SIZE)]\x1b[0m');
    console.table(
      tableData.map((t) => ({
        'Table Name': t.table,
        'Rows': t.rows.toLocaleString(),
        'Data Size': formatBytes(t.tableBytes),
        'Index Size': formatBytes(t.indexBytes),
        'Total Size': formatBytes(t.totalBytes),
        'Share of DB': ((t.totalBytes / (totalBytes || 1)) * 100).toFixed(1) + '%',
      }))
    );
    console.log('');

    // Heroku Tier Guidance & Warnings
    console.log('\x1b[1m\x1b[36m[HEROKU POSTGRES TIER CAPACITY REFERENCE]\x1b[0m');
    console.log('  • Essential-0 (Mini):   Max 10,000 rows  | ~1 GB Storage Limit | 20 Connections');
    console.log('  • Essential-1 (Basic):  Max 10,000,000 rows | ~10 GB Storage Limit | 20 Connections');
    console.log('  • Standard / Premium:   Multi-GB/TB dedicated RAM & disk\n');

    if (totalRowCount > 8000 && totalRowCount <= 10000) {
      console.log('\x1b[33m  ⚠ Warning: Row count is approaching 10,000 (Essential-0 row limit).\x1b[0m');
    } else if (totalRowCount > 10000) {
      console.log('\x1b[32m  ✔ Current row count is beyond 10,000 (operating on Essential-1 or above).\x1b[0m');
    }

    console.log('\n\x1b[32m✔ Heroku PostgreSQL inspection completed successfully.\x1b[0m\n');
  } catch (err) {
    console.error('\n\x1b[31m[ERROR] Failed to query Heroku PostgreSQL database:\x1b[0m', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

inspectHerokuDatabase();
