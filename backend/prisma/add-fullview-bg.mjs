// Run: node prisma/add-fullview-bg.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load env
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Adding fullviewReactiveBg column...');
    await prisma.$executeRawUnsafe(
        `ALTER TABLE "UserPreferences" ADD COLUMN IF NOT EXISTS "fullviewReactiveBg" BOOLEAN NOT NULL DEFAULT true`
    );
    console.log('✅ Column added (or already existed).');
}

main()
    .catch(e => { console.error('❌', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
