import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import assert from 'assert';
import { TogetherRoomService } from '../src/services/together-room.service';

async function runTests() {
  console.log('--- RUNNING PHASE 3 LISTEN TOGETHER TESTS ---');

  // Test 1: Crockford Base32 room code uniqueness and formatting
  console.log('Test 1: Crockford Base32 6-char code generation');
  const code1 = await TogetherRoomService.generateUniqueCode();
  const code2 = await TogetherRoomService.generateUniqueCode();
  assert.strictEqual(code1.length, 6, 'Room code must be 6 characters');
  assert.strictEqual(code2.length, 6, 'Room code must be 6 characters');
  assert.notStrictEqual(code1, code2, 'Subsequent room codes should be unique');
  const crockfordRegex = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
  assert.ok(crockfordRegex.test(code1), 'Code must adhere to Crockford base32 alphabet (no I, L, O, 0, 1)');
  console.log('✅ Passed Test 1: Crockford codes valid and unique:', code1, code2);

  // Test 2: Room creation & single-use ticket verification
  console.log('Test 2: Room creation & single-use ticket minting');
  const hostUser = { id: 'user-host-123', name: 'DJ Alex', image: 'https://example.com/alex.jpg' };
  const { room, ticket } = await TogetherRoomService.createRoom(hostUser, { mode: 'dj' });

  assert.strictEqual(room.hostId, hostUser.id);
  assert.strictEqual(room.mode, 'dj');
  assert.strictEqual(room.members.length, 1);
  assert.strictEqual(room.members[0].role, 'host');
  assert.ok(ticket, 'Must return a ticket for WebSocket connection');

  // Consume ticket
  const consumed = await TogetherRoomService.verifyAndConsumeTicket(ticket);
  assert.ok(consumed, 'Ticket must verify successfully');
  assert.strictEqual(consumed.userId, hostUser.id);
  assert.strictEqual(consumed.roomCode, room.roomCode);

  // Second consumption must fail (single-use guarantee)
  const reuseAttempt = await TogetherRoomService.verifyAndConsumeTicket(ticket);
  assert.strictEqual(reuseAttempt, null, 'Ticket must be single-use and rejected on second attempt');
  console.log('✅ Passed Test 2: Room created and ticket consumed securely (single-use verified)');

  // Test 3: Listener joining room
  console.log('Test 3: Listener joining session');
  const listenerUser = { id: 'user-listener-456', name: 'Sam Listener', image: 'https://example.com/sam.jpg' };
  const { room: joinedRoom, ticket: listenerTicket } = await TogetherRoomService.joinRoom(room.roomCode, listenerUser);

  assert.strictEqual(joinedRoom.members.length, 2, 'Room must now have 2 members');
  const listenerMember = joinedRoom.members.find((m) => m.userId === listenerUser.id);
  assert.ok(listenerMember, 'Listener must be in member list');
  assert.strictEqual(listenerMember.role, 'listener');
  assert.ok(listenerTicket, 'Listener must receive their own single-use ticket');
  console.log('✅ Passed Test 3: Listener joined room with isolated credentials');

  // Test 4: Queue operations (Add, Reorder, Remove)
  console.log('Test 4: Shared Queue operations');
  const track1 = { id: 'track-1', title: 'Song One', duration: 180 };
  const track2 = { id: 'track-2', title: 'Song Two', duration: 200 };

  const { room: rWithTrack1, item: item1 } = await TogetherRoomService.addQueueItem(room.roomCode, track1, hostUser);
  const { room: rWithTrack2, item: item2 } = await TogetherRoomService.addQueueItem(room.roomCode, track2, listenerUser);

  assert.strictEqual(rWithTrack2.queue.length, 2);
  assert.strictEqual(rWithTrack2.queue[0].trackId, 'track-1');
  assert.strictEqual(rWithTrack2.queue[1].trackId, 'track-2');

  // Reorder queue
  const reordered = await TogetherRoomService.reorderQueue(room.roomCode, 1, 0);
  assert.strictEqual(reordered.queue[0].trackId, 'track-2', 'Track 2 should now be first');

  // Remove track
  const afterRemove = await TogetherRoomService.removeQueueItem(room.roomCode, item1.id);
  assert.strictEqual(afterRemove.queue.length, 1);
  assert.strictEqual(afterRemove.queue[0].id, item2.id);
  console.log('✅ Passed Test 4: Queue add, reorder, and remove operations verified');

  // Test 5: Ephemeral chat cap (max 50 messages)
  console.log('Test 5: Ephemeral chat message storage & 50-message cap');
  for (let i = 1; i <= 55; i++) {
    await TogetherRoomService.addChatMessage(room.roomCode, {
      userId: hostUser.id,
      username: hostUser.name,
      text: `Message ${i}`,
    });
  }

  const finalRoom = await TogetherRoomService.getRoom(room.roomCode);
  assert.strictEqual(finalRoom?.chat.length, 50, 'Chat must be capped at 50 messages to prevent unbounded memory growth');
  assert.strictEqual(finalRoom.chat[49].text, 'Message 55', 'Most recent message must be preserved');
  console.log('✅ Passed Test 5: Chat correctly capped at 50 messages');

  // Test 6: Room cleanup
  console.log('Test 6: Room closure');
  const closed = await TogetherRoomService.closeRoom(room.roomCode, hostUser.id);
  assert.strictEqual(closed, true);
  const nonExistent = await TogetherRoomService.getRoom(room.roomCode);
  assert.strictEqual(nonExistent, null, 'Closed room must no longer be discoverable');
  console.log('✅ Passed Test 6: Session cleanly ended');

  console.log('\n🎉 ALL 6 LISTEN TOGETHER (PHASE 3) TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
