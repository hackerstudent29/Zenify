import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app';
import type { Authenticator } from '../src/auth/auth';
import { CODE_RE, TOKEN_RE, newInviteCode, newToken } from '../src/security/tokens';
import { clean, safeHttpsUrl } from '../src/security/sanitize';

const auth: Authenticator = async (req) => {
  const u = req.headers['x-user'];
  return typeof u === 'string' && u ? { id: u } : null;
};
const H = (u: string) => ({ 'x-user': u, 'content-type': 'application/json' });

async function mk(opts: { now?: () => number; auth?: Authenticator; dir?: string } = {}) {
  const dir = opts.dir ?? (await mkdtemp(join(tmpdir(), 'zen-api-')));
  const app = await buildApp({ dataDir: dir, auth: opts.auth ?? auth, ...(opts.now ? { now: opts.now } : {}) });
  return { app, dir, done: async () => { await app.close(); if (!opts.dir) await rm(dir, { recursive: true, force: true }); } };
}

const gift = (over: object = {}) => ({ trackId: 'dQw4w9WgXcQ', title: 'Song', artist: 'Artist', note: 'hello', ...over });

test('tokens: CSPRNG, unique, correct format', () => {
  const set = new Set<string>();
  for (let i = 0; i < 500; i++) set.add(newToken());
  assert.equal(set.size, 500);
  assert.ok([...set].every((t) => TOKEN_RE.test(t)));
  const codes = new Set<string>();
  for (let i = 0; i < 500; i++) codes.add(newInviteCode());
  assert.equal(codes.size, 500);
  assert.ok([...codes].every((c) => CODE_RE.test(c)));
});

test('sanitize: strips bidi/control/zero-width and non-https urls', () => {
  assert.equal(clean('a\u202eb\u200bc\u0000d', 10), 'abcd');
  assert.equal(clean('x'.repeat(50), 10).length, 10);
  assert.equal(safeHttpsUrl('http://x.com/a.jpg'), undefined);
  assert.equal(safeHttpsUrl('javascript:alert(1)'), undefined);
  assert.equal(safeHttpsUrl('https://user:pw@x.com/a'), undefined);
  assert.equal(safeHttpsUrl('https://i.ytimg.com/vi/a/mq.jpg'), 'https://i.ytimg.com/vi/a/mq.jpg');
});

test('fail-closed: with the default authenticator nothing writable works', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zen-api-'));
  const app = await buildApp({ dataDir: dir }); // no auth supplied
  const r = await app.inject({ method: 'POST', url: '/gifts', payload: gift() });
  assert.equal(r.statusCode, 401);
  assert.equal((await app.inject({ method: 'PUT', url: '/profiles/me', payload: {} })).statusCode, 401);
  await app.close();
  await rm(dir, { recursive: true, force: true });
});

test('gifts: create -> public view, no owner leak, marks opened', async () => {
  const { app, done } = await mk();
  const r = await app.inject({ method: 'POST', url: '/gifts', headers: H('u1'), payload: gift() });
  assert.equal(r.statusCode, 201);
  const { token, giftUrl } = r.json();
  assert.ok(TOKEN_RE.test(token));
  assert.equal(giftUrl, `https://zenify.app/gift/${token}`);
  const g = await app.inject({ method: 'GET', url: `/gifts/${token}` });
  assert.equal(g.statusCode, 200);
  const body = g.json().gift;
  assert.equal(body.title, 'Song');
  assert.ok(!('ownerId' in body) && !JSON.stringify(body).includes('u1'));
  assert.equal(g.headers['cache-control'], 'no-store');
  assert.equal((await app.inject({ method: 'GET', url: '/gifts/not-a-token' })).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: `/gifts/${newToken()}` })).statusCode, 404);
  await done();
});

test('gifts: strict validation', async () => {
  const { app, done } = await mk();
  const post = (payload: object) => app.inject({ method: 'POST', url: '/gifts', headers: H('u1'), payload });
  assert.equal((await post(gift({ extra: 1 }))).statusCode, 400, 'unknown field rejected');
  assert.equal((await post(gift({ coverUrl: 'http://evil.com/a.png' }))).statusCode, 400, 'http cover rejected');
  assert.equal((await post(gift({ coverUrl: 'javascript:alert(1)' }))).statusCode, 400);
  assert.equal((await post(gift({ trackId: '../../etc/passwd' }))).statusCode, 400);
  assert.equal((await post(gift({ note: 'n'.repeat(900) }))).statusCode, 400, 'absurd note rejected');
  const ok = await post(gift({ note: 'n'.repeat(300), title: 'T\u202eitle', coverUrl: 'https://i.ytimg.com/a.jpg' }));
  assert.equal(ok.statusCode, 201);
  const token = ok.json().token as string;
  const view = (await app.inject({ method: 'GET', url: `/gifts/${token}` })).json().gift;
  assert.equal(view.note.length, 140, 'long notes are clipped to 140');
  assert.equal(view.title, 'Title', 'bidi override stripped');
  assert.equal((await app.inject({ method: 'POST', url: '/gifts', headers: H('u1'), payload: 'x'.repeat(40000) })).statusCode >= 400, true, 'body limit');
  await done();
});

test('gifts: expire after 30 days', async () => {
  let t = 1_700_000_000_000;
  const { app, done } = await mk({ now: () => t });
  const { token } = (await app.inject({ method: 'POST', url: '/gifts', headers: H('u1'), payload: gift() })).json();
  assert.equal((await app.inject({ method: 'GET', url: `/gifts/${token}` })).statusCode, 200);
  t += 31 * 24 * 60 * 60 * 1000;
  assert.equal((await app.inject({ method: 'GET', url: `/gifts/${token}` })).statusCode, 404);
  await done();
});

test('rate limit: 31st write in an hour is 429, resets after the window', async () => {
  let t = 1_700_000_000_000;
  const { app, done } = await mk({ now: () => t });
  let last = 0;
  for (let i = 0; i < 31; i++) last = (await app.inject({ method: 'POST', url: '/gifts', headers: H('spammer'), payload: gift() })).statusCode;
  assert.equal(last, 429);
  assert.equal((await app.inject({ method: 'POST', url: '/gifts', headers: H('someone-else'), payload: gift() })).statusCode, 201, 'other users unaffected');
  t += 61 * 60 * 1000;
  assert.equal((await app.inject({ method: 'POST', url: '/gifts', headers: H('spammer'), payload: gift() })).statusCode, 201);
  await done();
});

test('persistence + corruption recovery', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zen-api-'));
  let m = await mk({ dir });
  const { token } = (await m.app.inject({ method: 'POST', url: '/gifts', headers: H('u1'), payload: gift() })).json();
  await m.done();
  m = await mk({ dir });
  assert.equal((await m.app.inject({ method: 'GET', url: `/gifts/${token}` })).statusCode, 200, 'survives restart');
  await m.done();
  await writeFile(join(dir, 'social.json'), '{ not json');
  m = await mk({ dir });
  assert.equal((await m.app.inject({ method: 'GET', url: `/gifts/${token}` })).statusCode, 404, 'corrupt state starts empty, no crash');
  assert.ok((await readdir(dir)).some((f) => f.startsWith('social.json.corrupt-')));
  await m.done();
  await rm(dir, { recursive: true, force: true });
});

const profile = (over: object = {}) => ({ username: 'arun_k', bio: 'night owl', country: 'IN', languages: ['Tamil'], hours: 120, ...over });

test('profiles: publish, uniqueness, rename frees old name, no user id leak', async () => {
  const { app, done } = await mk();
  const put = (u: string, payload: object) => app.inject({ method: 'PUT', url: '/profiles/me', headers: H(u), payload });
  assert.equal((await put('u1', profile())).statusCode, 200);
  assert.equal((await put('u2', profile())).statusCode, 409, 'taken');
  assert.equal((await put('u1', profile({ username: 'arun2' }))).statusCode, 200);
  assert.equal((await put('u2', profile())).statusCode, 200, 'old name freed');
  const g = await app.inject({ method: 'GET', url: '/profiles/Arun2' });
  assert.equal(g.statusCode, 200, 'case-insensitive lookup');
  const raw = JSON.stringify(g.json());
  assert.ok(!raw.includes('u1') && !raw.includes('userId'));
  assert.equal((await app.inject({ method: 'GET', url: '/profiles/nobody' })).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: '/profiles/..%2f..' })).statusCode, 404);
  assert.equal((await app.inject({ method: 'DELETE', url: '/profiles/me', headers: H('u1') })).statusCode, 204);
  assert.equal((await app.inject({ method: 'GET', url: '/profiles/arun2' })).statusCode, 404);
  await done();
});

test('profiles: only allowlisted public fields, strict validation', async () => {
  const { app, done } = await mk();
  const put = (payload: object) => app.inject({ method: 'PUT', url: '/profiles/me', headers: H('u1'), payload });
  assert.equal((await put(profile({ email: 'a@b.com' }))).statusCode, 400, 'email can never be stored');
  assert.equal((await put(profile({ listeningHistory: [1] }))).statusCode, 400);
  assert.equal((await put(profile({ age: 5 }))).statusCode, 400);
  assert.equal((await put(profile({ username: 'admin' }))).statusCode, 400, 'reserved');
  assert.equal((await put(profile({ username: 'ab' }))).statusCode, 400);
  assert.equal((await put(profile({ country: 'India' }))).statusCode, 400);
  assert.equal((await put(profile({ genres: Array(20).fill('x') }))).statusCode, 400);
  assert.equal((await put(profile({ bio: 'b'.repeat(5000) }))).statusCode, 400);
  const ok = await put(profile({ bio: 'hi\u202e there\u200b', username: 'Clean_User' }));
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().profile.bio, 'hi there');
  assert.equal(ok.json().profile.username, 'clean_user');
  await done();
});

const snap = (artists: Record<string, number>, over: object = {}) => ({
  userId: 'x', displayName: 'Arun', periodKey: '2026-11', totalMinutes: 600, uniqueSongsCount: 50, uniqueArtistsCount: 10, discoveryPct: 0.3,
  topArtists: artists, topTracks: ['a', 'b'], daypartDistribution: { night: 0.6, morning: 0.4 }, ...over,
});

test('match: invite roundtrip, calculate sanity, bounds', async () => {
  const { app, done } = await mk();
  const inv = await app.inject({ method: 'POST', url: '/match/invite', headers: H('u1'), payload: { snapshot: snap({ a: 0.6, b: 0.4 }) } });
  assert.equal(inv.statusCode, 201);
  const code = inv.json().inviteCode as string;
  assert.ok(CODE_RE.test(code));
  const got = await app.inject({ method: 'GET', url: `/match/invite/${code}` });
  assert.equal(got.json().snapshot.userId, '', 'owner id is not exposed');
  assert.equal((await app.inject({ method: 'GET', url: '/match/invite/BADCODE' })).statusCode, 404);

  const same = await app.inject({ method: 'POST', url: '/match/calculate', headers: H('u1'), payload: { snapshotA: snap({ a: 0.6, b: 0.4 }), snapshotB: snap({ a: 0.6, b: 0.4 }) } });
  assert.equal(same.json().compatibilityScore, 100);
  assert.equal(same.json().winner, 'draw');
  const diff = await app.inject({ method: 'POST', url: '/match/calculate', headers: H('u1'), payload: { snapshotA: snap({ a: 1 }, { topTracks: ['q'], daypartDistribution: { night: 1 } }), snapshotB: snap({ z: 1 }, { topTracks: ['w'], daypartDistribution: { morning: 1 } }) } });
  assert.ok(diff.json().compatibilityScore < 20, `got ${diff.json().compatibilityScore}`);
  const bad = (payload: object) => app.inject({ method: 'POST', url: '/match/calculate', headers: H('u1'), payload });
  assert.equal((await bad({ snapshotA: snap({ a: 5 }), snapshotB: snap({ a: 1 }) })).statusCode, 400, 'weights > 1 rejected');
  assert.equal((await bad({ snapshotA: snap(Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`a${i}`, 0.1]))), snapshotB: snap({ a: 1 }) })).statusCode, 400, 'too many artists');
  assert.equal((await bad({ snapshotA: snap({ a: 1 }, { totalMinutes: -1 }), snapshotB: snap({ a: 1 }) })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: '/match/calculate', payload: {} })).statusCode, 401);
  await done();
});

test('security headers present and errors do not leak internals', async () => {
  const { app, done } = await mk();
  const r = await app.inject({ method: 'GET', url: '/profiles/nobody' });
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['x-frame-options'], 'DENY');
  assert.ok(!r.body.includes('stack') && !r.body.includes('/home'));
  await done();
});

test('prototype-pollution payloads do not alter Object.prototype', async () => {
  const { app, done } = await mk();
  const evil = '{"snapshot":{"userId":"x","displayName":"A","periodKey":"p","totalMinutes":1,"uniqueSongsCount":1,"uniqueArtistsCount":1,"discoveryPct":0.1,"topArtists":{"__proto__":0.5,"constructor":0.2},"topTracks":[],"daypartDistribution":{"night":1}}}';
  await app.inject({ method: 'POST', url: '/match/invite', headers: H('u1'), payload: evil });
  await app.inject({ method: 'PUT', url: '/profiles/me', headers: H('u1'), payload: '{"__proto__":{"polluted":true},"username":"abc_def","bio":""}' });
  assert.equal(({} as Record<string, unknown>)['polluted'], undefined);
  assert.equal(({} as Record<string, unknown>)['0.5'], undefined);
  await done();
});

test('malformed JSON is a clean 400', async () => {
  const { app, done } = await mk();
  const r = await app.inject({ method: 'POST', url: '/gifts', headers: H('u1'), payload: '{bad json' });
  assert.equal(r.statusCode, 400);
  assert.ok(!r.body.includes('Unexpected'));
  await done();
});
