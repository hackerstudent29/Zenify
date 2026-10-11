import dotenv from 'dotenv';
dotenv.config();

import { CronService } from '../services/cron.service.js';
import { prisma } from '../utils/prisma.js';

const targetEmail = process.argv[2] || 'ramzendrum@gmail.com';

async function main() {
    console.log(`====================================================`);
    console.log(`🎵 Triggering Authentic Weekly Summary for: ${targetEmail}`);
    console.log(`====================================================\n`);

    try {
        const success = await CronService.sendWeeklySummaryForUser(targetEmail);
        if (success) {
            console.log(`\n✅ Authentic weekly summary email sent successfully to ${targetEmail}!`);
        } else {
            console.error(`\n❌ Failed to send weekly summary: User not found or inactive.`);
            process.exit(1);
        }
    } catch (err: any) {
        console.error(`\n❌ Error sending weekly summary:`, err?.response?.data || err?.message || err);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
