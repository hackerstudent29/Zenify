import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import assert from 'assert';
import { prisma } from '../src/utils/prisma';
import { BlendEngineService } from '../src/services/blend-engine.service';

async function runPhase8Tests() {
  console.log('\n===============================================================');
  console.log('   ZENIFY PHASE 8 BLEND & TASTE MATCHING TEST SUITE            ');
  console.log('===============================================================\n');

  const testUserAId = `test_user_blend_a_${Date.now()}`;
  const testUserBId = `test_user_blend_b_${Date.now()}`;
  const testUserCId = `test_user_blend_c_${Date.now()}`;
  const testArtistId = `test_artist_blend_${Date.now()}`;
  const testTrackAId = `test_track_blend_a_${Date.now()}`;
  const testTrackBId = `test_track_blend_b_${Date.now()}`;

  let createdSessionId = '';

  try {
    // Setup 3 test users
    await prisma.user.createMany({
      data: [
        {
          id: testUserAId,
          email: `${testUserAId}@zenify.test`,
          name: 'Alex Rider',
          role: 'LISTENER',
        },
        {
          id: testUserBId,
          email: `${testUserBId}@zenify.test`,
          name: 'Jordan Sparks',
          role: 'LISTENER',
        },
        {
          id: testUserCId,
          email: `${testUserCId}@zenify.test`,
          name: 'Charlie Stranger',
          role: 'LISTENER',
        },
      ],
    });

    await prisma.artist.create({
      data: {
        id: testArtistId,
        name: `Shared Blend Icon ${Date.now()}`,
      },
    });

    await prisma.track.createMany({
      data: [
        {
          id: testTrackAId,
          title: "Alex's Anthem",
          artistId: testArtistId,
          duration: 200,
          audioUrl: 'https://example.com/a.mp3',
        },
        {
          id: testTrackBId,
          title: "Jordan's Groove",
          artistId: testArtistId,
          duration: 220,
          audioUrl: 'https://example.com/b.mp3',
        },
      ],
    });

    // Add affinities & listening events
    await prisma.userAffinity.createMany({
      data: [
        {
          userId: testUserAId,
          kind: 'artist',
          key: 'shared blend icon',
          score: 8.5,
        },
        {
          userId: testUserBId,
          kind: 'artist',
          key: 'shared blend icon',
          score: 9.0,
        },
      ],
    });

    await prisma.listenEvent.createMany({
      data: [
        {
          userId: testUserAId,
          trackId: testTrackAId,
          msPlayed: 200000,
          durationMs: 200000,
          completed: true,
        },
        {
          userId: testUserBId,
          trackId: testTrackBId,
          msPlayed: 220000,
          durationMs: 220000,
          completed: true,
        },
      ],
    });

    // Test 1: Create Blend Invite
    console.log('Test 1: Create 128-bit secure Blend invite');
    const invite = await BlendEngineService.createInvite(testUserAId);
    assert.ok(invite.sessionId, 'Session ID must exist');
    assert.ok(invite.token && invite.token.length >= 32, 'Must generate 128-bit token (32 hex chars)');
    createdSessionId = invite.sessionId;

    const sessionInDb = await prisma.blendSession.findUnique({
      where: { id: invite.sessionId },
    });
    assert.ok(sessionInDb);
    assert.strictEqual(sessionInDb.status, 'PENDING');
    assert.strictEqual(sessionInDb.userAId, testUserAId);
    console.log('✅ Passed Test 1: Blend invite created with hashed cryptographic token');

    // Test 2: Creator self-join rejection
    console.log('Test 2: Prevent creator from blending with themselves');
    let selfJoinError = false;
    try {
      await BlendEngineService.joinInvite(testUserAId, invite.token);
    } catch (err: any) {
      selfJoinError = true;
      assert.ok(err.message.includes('cannot blend with yourself'));
    }
    assert.strictEqual(selfJoinError, true);
    console.log('✅ Passed Test 2: Self-join prevented');

    // Test 3: User B joins invite
    console.log('Test 3: User B joins Blend invite');
    const joinRes = await BlendEngineService.joinInvite(testUserBId, invite.token);
    assert.strictEqual(joinRes.sessionId, createdSessionId);
    assert.strictEqual(joinRes.status, 'ACTIVE');
    assert.ok(joinRes.snapshot, 'Snapshot must be generated upon activation');
    assert.ok(joinRes.snapshot.matchScore >= 45, 'Taste match score must be calculated');
    console.log(`✅ Passed Test 3: Blend activated with ${joinRes.snapshot.matchScore}% Taste Match`);

    // Test 4: Prevent replay / re-use of consumed invite token
    console.log('Test 4: Verify single-use token protection');
    let replayError = false;
    try {
      await BlendEngineService.joinInvite(testUserCId, invite.token);
    } catch (err: any) {
      replayError = true;
      assert.ok(err.message.includes('already been used'));
    }
    assert.strictEqual(replayError, true);
    console.log('✅ Passed Test 4: Single-use token enforced');

    // Test 5: Authorization - View blend details
    console.log('Test 5: Member viewing & third-party rejection');
    const details = await BlendEngineService.getBlendDetails(testUserAId, createdSessionId);
    assert.strictEqual(details.partner.name, 'Jordan Sparks');
    assert.ok(Array.isArray(details.tracks));
    assert.ok(details.tracks.length > 0);

    let thirdPartyBlocked = false;
    try {
      await BlendEngineService.getBlendDetails(testUserCId, createdSessionId);
    } catch (err: any) {
      thirdPartyBlocked = true;
      assert.ok(err.message.includes('Unauthorized'));
    }
    assert.strictEqual(thirdPartyBlocked, true);
    console.log('✅ Passed Test 5: Authorization strictly enforced (only members can view)');

    // Test 6: Leave Blend
    console.log('Test 6: Leave / archive Blend session');
    const leaveRes = await BlendEngineService.leaveBlend(testUserBId, createdSessionId);
    assert.strictEqual(leaveRes.success, true);

    const checkGone = await prisma.blendSession.findUnique({
      where: { id: createdSessionId },
    });
    assert.strictEqual(checkGone, null);
    console.log('✅ Passed Test 6: Blend cleanly removed upon leave');

    console.log('\n🎉 ALL PHASE 8 BLEND & TASTE MATCHING TESTS PASSED!\n');
  } finally {
    // Cleanup
    if (createdSessionId) {
      await prisma.blendSnapshot.deleteMany({ where: { sessionId: createdSessionId } }).catch(() => {});
      await prisma.blendSession.deleteMany({ where: { id: createdSessionId } }).catch(() => {});
    }
    await prisma.listenEvent.deleteMany({ where: { userId: { in: [testUserAId, testUserBId, testUserCId] } } }).catch(() => {});
    await prisma.userAffinity.deleteMany({ where: { userId: { in: [testUserAId, testUserBId, testUserCId] } } }).catch(() => {});
    await prisma.track.deleteMany({ where: { id: { in: [testTrackAId, testTrackBId] } } }).catch(() => {});
    await prisma.artist.deleteMany({ where: { id: testArtistId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [testUserAId, testUserBId, testUserCId] } } }).catch(() => {});
    await prisma.$disconnect();
  }
}

runPhase8Tests().catch((err) => {
  console.error('❌ Phase 8 tests failed:', err);
  process.exit(1);
});

