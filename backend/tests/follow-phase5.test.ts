import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import assert from 'assert';
import { prisma } from '../src/utils/prisma';
import { FollowService } from '../src/services/follow.service';
import { WebPushService } from '../src/services/web-push.service';

async function runPhase5Tests() {
  console.log('\n===============================================================');
  console.log('   ZENIFY PHASE 5 FOLLOW ARTISTS & RELEASES TEST SUITE        ');
  console.log('===============================================================\n');

  const testUserId = `test_user_phase5_${Date.now()}`;
  const testArtistProviderId = `artist_saavn_${Date.now()}`;
  const testArtistName = 'Anirudh Ravichander';

  try {
    // Setup test user
    await prisma.user.create({
      data: {
        id: testUserId,
        email: `${testUserId}@zenify.test`,
        timezone: 'Asia/Kolkata',
        role: 'LISTENER',
      },
    });

    // Test 1: Follow Artist & verify Affinity signal (+3.0)
    console.log('Test 1: Follow artist and verify affinity weight');
    const followRes = await FollowService.followArtist(
      testUserId,
      testArtistProviderId,
      testArtistName,
      'https://c.saavncdn.com/artists/Anirudh_500x500.jpg'
    );
    assert.strictEqual(followRes.following, true);
    assert.strictEqual(followRes.follow.artistName, testArtistName);

    // Verify UserAffinity row created or updated
    const affinity = await prisma.userAffinity.findUnique({
      where: {
        userId_kind_key: {
          userId: testUserId,
          kind: 'artist',
          key: testArtistName.toLowerCase().trim(),
        },
      },
    });
    assert.ok(affinity, 'UserAffinity must exist for followed artist');
    assert.ok(affinity.score >= 3.0, 'Affinity score must be >= 3.0 after following');
    console.log('✅ Passed Test 1: Artist followed and +3.0 affinity recorded');

    // Test 2: Batch Follow Status check
    console.log('Test 2: Check batch following status');
    const batchStatus = await FollowService.isFollowingBatch(testUserId, [
      testArtistProviderId,
      'non_followed_artist_999',
    ]);
    assert.strictEqual(batchStatus[testArtistProviderId], true);
    assert.strictEqual(batchStatus['non_followed_artist_999'], false);
    console.log('✅ Passed Test 2: Batch following status accurate');

    // Test 3: Get Followed Artists List
    console.log('Test 3: List followed artists');
    const listRes = await FollowService.getFollowedArtists(testUserId, 1, 10);
    assert.strictEqual(listRes.total, 1);
    assert.strictEqual(listRes.artists[0].artistProviderId, testArtistProviderId);
    console.log('✅ Passed Test 3: Followed artists list fetched correctly');

    // Test 4: Web Push Subscription Registration & VAPID Key
    console.log('Test 4: Register Web Push subscription and get VAPID public key');
    const vapidKey = WebPushService.getPublicKey();
    assert.ok(vapidKey && vapidKey.length > 20, 'Must have valid VAPID public key');

    const testEndpoint = `https://fcm.googleapis.com/fcm/send/test_${Date.now()}`;
    const pushSub = await WebPushService.registerSubscription(testUserId, {
      endpoint: testEndpoint,
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9t0448G3RnzXxmmcxMRBQioJ3604q',
      auth: 'tBHItJI5svbpez7KI4CCXg',
    });
    assert.strictEqual(pushSub.userId, testUserId);
    assert.strictEqual(pushSub.endpoint, testEndpoint);
    console.log('✅ Passed Test 4: Push subscription registered with valid VAPID key');

    // Test 5: Unfollow Artist
    console.log('Test 5: Unfollow artist');
    const unfollowRes = await FollowService.unfollowArtist(testUserId, testArtistProviderId);
    assert.strictEqual(unfollowRes.following, false);

    const checkAfterUnfollow = await FollowService.isFollowingBatch(testUserId, [testArtistProviderId]);
    assert.strictEqual(checkAfterUnfollow[testArtistProviderId], false);
    console.log('✅ Passed Test 5: Artist unfollowed cleanly');

    console.log('\n🎉 ALL PHASE 5 FOLLOW & RELEASES TESTS PASSED!\n');
  } finally {
    // Cleanup test data
    await prisma.pushSubscription.deleteMany({ where: { userId: testUserId } }).catch(() => {});
    await prisma.artistFollow.deleteMany({ where: { userId: testUserId } }).catch(() => {});
    await prisma.userAffinity.deleteMany({ where: { userId: testUserId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: testUserId } }).catch(() => {});
    await prisma.$disconnect();
  }
}

runPhase5Tests().catch((err) => {
  console.error('❌ Phase 5 tests failed:', err);
  process.exit(1);
});
