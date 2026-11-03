import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import assert from 'assert';
import fastify from 'fastify';
import { shareRoutes } from '../src/routes/share.routes';

async function runPhase4Tests() {
  console.log('--- RUNNING PHASE 4 SHARE & LINK PREVIEW TESTS ---');

  const app = fastify();
  await app.register(shareRoutes);

  // Test 1: General website preview fallback
  console.log('Test 1: General preview fallback for unknown track');
  const res1 = await app.inject({
    method: 'GET',
    url: '/s/track/non-existent-id-12345',
  });

  assert.strictEqual(res1.statusCode, 200);
  assert.ok(res1.headers['content-type']?.includes('text/html'), 'Must return HTML for social scrapers');
  const body1 = res1.body;

  assert.ok(body1.includes('<meta property="og:site_name" content="Zenify" />'), 'Must include og:site_name');
  assert.ok(body1.includes('<meta name="twitter:card" content="summary_large_image" />'), 'Must include twitter:card');
  assert.ok(body1.includes('window.location.replace'), 'Must include client redirect script for humans');
  console.log('✅ Passed Test 1: SSR HTML preview generated with valid Open Graph & Twitter meta tags');

  // Test 2: Together Room share preview
  console.log('Test 2: Listen Together session link preview');
  const res2 = await app.inject({
    method: 'GET',
    url: '/s/together/ABC999',
  });

  assert.strictEqual(res2.statusCode, 200);
  assert.ok(res2.body.includes('Zenify'), 'Must include brand name');
  assert.ok(res2.body.includes('<meta http-equiv="refresh" content="0; url='), 'Must include instant redirect');
  console.log('✅ Passed Test 2: Listen Together room link preview verified');

  console.log('\n🎉 ALL PHASE 4 SHARE & LINK PREVIEW TESTS PASSED!');
}

runPhase4Tests().catch((err) => {
  console.error('❌ Phase 4 tests failed:', err);
  process.exit(1);
});
