import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { execSync } from 'child_process';

const testSuites = [
  { name: 'Phase 1: Prerequisites & Data Identity', file: 'backend/tests/prerequisites-phase1.test.ts' },
  { name: 'Phase 3: Listen Together & NTP Drift Sync', file: 'backend/tests/listen-together-phase3.test.ts' },
  { name: 'Phase 4: Share Cards & Link Previews', file: 'backend/tests/share-phase4.test.ts' },
  { name: 'Phase 5: Follow Artists & Web Push Notifications', file: 'backend/tests/follow-phase5.test.ts' },
  { name: 'Phase 7: Day Mixes & Daylight Time-Slot Engine', file: 'backend/tests/day-mix-phase7.test.ts' },
  { name: 'Phase 8: Blend Sessions & Taste Match Engine', file: 'backend/tests/blend-phase8.test.ts' },
];

async function runAll() {
  console.log('\n========================================================================');
  console.log('   ZENIFY PHASE 10 COMPREHENSIVE END-TO-END VERIFICATION SUITE         ');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  for (const suite of testSuites) {
    console.log(`\n▶ Running ${suite.name}...`);
    try {
      execSync(`npx tsx ${suite.file}`, {
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '../..'),
        env: process.env,
      });
      passed++;
      console.log(`✔ Passed ${suite.name}`);
    } catch (err: any) {
      failed++;
      console.error(`✖ Failed ${suite.name}`);
    }
  }

  console.log('\n========================================================================');
  console.log(`   FINAL SUMMARY: ${passed} PASSED, ${failed} FAILED / ${testSuites.length} SUITES`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAll();

