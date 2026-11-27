import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import Fastify from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import { feedbackRoutes } from '../src/routes/feedback.routes';
import {
  ActorIdentity,
  FeedbackRepository,
  FeedbackService,
  MAX_REPORT_SCREENSHOTS,
  ScreenshotInput,
  SongReportDTO,
  StoredScreenshot,
  SuppressedTrackDTO,
} from '../src/services/feedback.service';

class MemoryFeedbackRepository implements FeedbackRepository {
  readonly reports: SongReportDTO[] = [];
  readonly suppressions = new Map<string, SuppressedTrackDTO>();

  async ensureReady(): Promise<void> {}

  async claimDeviceRecords(userId: string, deviceKey: string): Promise<void> {
    const devOwner = `device:${deviceKey}`;
    const userOwner = `user:${userId}`;
    for (const r of this.reports) {
      if (r.deviceKey === deviceKey && !r.userId) {
        r.userId = userId;
      }
    }
    for (const [key, item] of [...this.suppressions.entries()]) {
      if (item.ownerKey === devOwner) {
        this.suppressions.delete(key);
        const targetMapKey = `${userOwner}::${item.trackKey}`;
        if (!this.suppressions.has(targetMapKey)) {
          this.suppressions.set(targetMapKey, {
            ...item,
            ownerKey: userOwner,
            userId,
            deviceKey: null,
          });
        }
      }
    }
  }

  async createReport(
    data: Omit<SongReportDTO, 'id' | 'createdAt' | 'screenshots'>,
    screenshots: StoredScreenshot[]
  ): Promise<SongReportDTO> {
    const dto: SongReportDTO = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      screenshots: screenshots.map((s, i) => ({
        ...s,
        id: crypto.randomUUID(),
        position: i,
      })),
    };
    this.reports.unshift(dto);
    return dto;
  }

  async listReports(actor: ActorIdentity, limit = 50): Promise<SongReportDTO[]> {
    return this.reports
      .filter((r) => (actor.userId ? r.userId === actor.userId : r.deviceKey === actor.deviceKey))
      .slice(0, limit);
  }

  async listSuppressions(actor: ActorIdentity): Promise<SuppressedTrackDTO[]> {
    return [...this.suppressions.values()].filter((s) => s.ownerKey === actor.ownerKey);
  }

  async upsertSuppression(
    actor: ActorIdentity,
    data: {
      trackKey: string;
      signature: string;
      title: string;
      artist: string;
      album: string | null;
      coverUrl: string | null;
      isVideo: boolean;
      suppressionLevel: string;
      reason: string | null;
    }
  ): Promise<SuppressedTrackDTO> {
    const mapKey = `${actor.ownerKey}::${data.trackKey}`;
    const existing = this.suppressions.get(mapKey);
    const now = new Date();
    const row: SuppressedTrackDTO = {
      id: existing?.id ?? crypto.randomUUID(),
      ownerKey: actor.ownerKey,
      userId: actor.userId,
      deviceKey: actor.userId ? null : actor.deviceKey,
      trackKey: data.trackKey,
      signature: data.signature,
      title: data.title,
      artist: data.artist,
      album: data.album,
      coverUrl: data.coverUrl,
      isVideo: data.isVideo,
      suppressionLevel: data.suppressionLevel,
      reason: data.reason,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.suppressions.set(mapKey, row);
    return row;
  }

  async revokeSuppression(
    actor: ActorIdentity,
    trackKey: string,
    signature?: string | null
  ): Promise<number> {
    let removed = 0;
    for (const [k, v] of [...this.suppressions.entries()]) {
      if (
        v.ownerKey === actor.ownerKey &&
        (v.trackKey === trackKey || (signature && v.signature === signature))
      ) {
        this.suppressions.delete(k);
        removed++;
      }
    }
    return removed;
  }
}

// Valid minimal PNG header + bytes
const VALID_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

function buildMultipartPayload(
  fields: Record<string, string>,
  files: Array<{ name: string; filename: string; contentType: string; data: Buffer }>
) {
  const boundary = '----ZenifyBoundary' + crypto.randomBytes(6).toString('hex');
  const chunks: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
        'utf8'
      )
    );
  }
  for (const f of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"; filename="${f.filename}"\r\nContent-Type: ${f.contentType}\r\n\r\n`,
        'utf8'
      )
    );
    chunks.push(f.data);
    chunks.push(Buffer.from('\r\n', 'utf8'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat(chunks),
  };
}

async function createTestApp() {
  const repo = new MemoryFeedbackRepository();
  const service = new FeedbackService(repo, async (file: ScreenshotInput, ticket, pos) => ({
    url: `https://cdn.zenify.app/reports/${ticket}/shot_${pos}.png`,
    mimeType: file.mimetype || 'image/png',
    sizeBytes: file.buffer.length,
    position: pos,
  }));

  const app = Fastify({ logger: false });
  await app.register(fastifyMultipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  app.decorate('optionalAuthenticate', async (req: any) => {
    const authUser = req.headers['x-test-user'];
    if (typeof authUser === 'string' && authUser) {
      req.user = { id: authUser, isGuest: false, email: `${authUser}@zenify.app`, name: 'Test User' };
    }
  });
  await app.register(
    async (instance) => {
      await feedbackRoutes(instance, { service });
    },
    { prefix: '/api/me' }
  );
  return { app, repo };
}

test('feedback routes enforce fail-closed 401 without JWT or valid X-Device-Key', async () => {
  const { app } = await createTestApp();
  const r1 = await app.inject({ method: 'GET', url: '/api/me/suggestions/less' });
  assert.equal(r1.statusCode, 401);

  const r2 = await app.inject({
    method: 'POST',
    url: '/api/me/reports',
    headers: { 'x-device-key': 'short' },
    payload: { trackId: 'abc', trackTitle: 'Song', artistName: 'Artist', category: 'lyrics_issue' },
  });
  assert.equal(r2.statusCode, 401);
  await app.close();
});

test('song report accepts up to 5 screenshots with category & user solution, rejects 6th screenshot', async () => {
  const { app, repo } = await createTestApp();

  const payloadJson = JSON.stringify({
    trackId: 'yt-abc123',
    trackTitle: 'Pathala Pathala',
    artistName: 'Anirudh Ravichander',
    albumName: 'Vikram',
    category: 'lyrics_issue',
    subIssues: ['Timing delayed / early', 'Word-sync broken'],
    severity: 'high',
    description: 'Chorus timestamps arrive 3 seconds late.',
    suggestedSolutions: ['Re-sync or fetch correct lyrics'],
    userSolution: 'Shift timestamps earlier by 3s and use Tamil+Romanized sync.',
  });

  // 5 screenshots -> 201 Created
  const fiveShots = Array.from({ length: MAX_REPORT_SCREENSHOTS }, (_, i) => ({
    name: `screenshot_${i}`,
    filename: `shot_${i}.png`,
    contentType: 'image/png',
    data: VALID_PNG,
  }));
  const mp5 = buildMultipartPayload({ payload: payloadJson }, fiveShots);
  const res5 = await app.inject({
    method: 'POST',
    url: '/api/me/reports',
    headers: {
      'content-type': mp5.contentType,
      'x-test-user': 'user-42',
      'x-device-key': 'dev_stable_key_999',
    },
    payload: mp5.body,
  });

  assert.equal(res5.statusCode, 201);
  const body5 = res5.json();
  assert.match(body5.ticketCode, /^ZNF-RPT-/);
  assert.equal(body5.report.category, 'lyrics_issue');
  assert.equal(body5.report.screenshots.length, 5);
  assert.match(body5.report.userSolution, /Shift timestamps/);
  assert.equal(repo.reports.length, 1);

  // 6 screenshots -> 400 Rejected
  const sixShots = Array.from({ length: 6 }, (_, i) => ({
    name: `screenshot_${i}`,
    filename: `shot_${i}.png`,
    contentType: 'image/png',
    data: VALID_PNG,
  }));
  const mp6 = buildMultipartPayload({ payload: payloadJson }, sixShots);
  const res6 = await app.inject({
    method: 'POST',
    url: '/api/me/reports',
    headers: {
      'content-type': mp6.contentType,
      'x-test-user': 'user-42',
    },
    payload: mp6.body,
  });
  assert.equal(res6.statusCode, 400);
  assert.match(res6.json().error, /Maximum 5 screenshots/i);
  await app.close();
});

test('Suggest Less persists per device across guest reinstalls, claims on login, and revokes cleanly', async () => {
  const { app } = await createTestApp();
  const devHeaders = { 'x-device-key': 'dev_persist_hardware_01' };

  // 1. Guest marks track as Suggest Less
  const addRes = await app.inject({
    method: 'POST',
    url: '/api/me/suggestions/less',
    headers: devHeaders,
    payload: {
      trackId: 'yt-badtrack1',
      title: 'Annoying Track',
      artist: 'Some Artist',
      album: 'Album X',
      suppressionLevel: 'ultra_less',
    },
  });
  assert.equal(addRes.statusCode, 200);
  assert.equal(addRes.json().item.trackKey, 'badtrack1');

  // 2. Guest reinstalls (no JWT, same hardware device key) -> still persisted
  const guestRestore = await app.inject({
    method: 'GET',
    url: '/api/me/suggestions/less',
    headers: devHeaders,
  });
  assert.equal(guestRestore.statusCode, 200);
  assert.equal(guestRestore.json().items.length, 1);
  assert.equal(guestRestore.json().items[0].trackKey, 'badtrack1');

  // 3. User signs in on device -> automatically claims device suppression into user account
  const loggedRestore = await app.inject({
    method: 'GET',
    url: '/api/me/suggestions/less',
    headers: {
      'x-test-user': 'user-abc',
      ...devHeaders,
    },
  });
  assert.equal(loggedRestore.statusCode, 200);
  assert.equal(loggedRestore.json().items.length, 1);
  assert.equal(loggedRestore.json().items[0].userId, 'user-abc');

  // 4. User uninstalls and signs into a brand new device (no old device key!) -> still restored from user DB
  const newPhoneRestore = await app.inject({
    method: 'GET',
    url: '/api/me/suggestions/less',
    headers: {
      'x-test-user': 'user-abc',
      'x-device-key': 'dev_brand_new_phone_99',
    },
  });
  assert.equal(newPhoneRestore.statusCode, 200);
  assert.equal(newPhoneRestore.json().items.length, 1);

  // 5. User clicks Suggest Less again to revoke action
  const revokeRes = await app.inject({
    method: 'DELETE',
    url: '/api/me/suggestions/less/yt-badtrack1',
    headers: { 'x-test-user': 'user-abc' },
  });
  assert.equal(revokeRes.statusCode, 200);
  assert.equal(revokeRes.json().removed, 1);

  const afterRevoke = await app.inject({
    method: 'GET',
    url: '/api/me/suggestions/less',
    headers: { 'x-test-user': 'user-abc' },
  });
  assert.equal(afterRevoke.statusCode, 200);
  assert.equal(afterRevoke.json().items.length, 0);

  await app.close();
});
