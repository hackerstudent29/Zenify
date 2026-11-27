import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { config } from '../config/env';
import cloudinary from '../utils/cloudinary';
import { logBuffer } from '../utils/log-buffer';
import { prisma } from '../utils/prisma';

export const REPORT_CATEGORIES = [
  'playback_error',
  'wrong_audio_or_version',
  'lyrics_issue',
  'metadata_error',
  'audio_quality',
  'download_offline',
  'explicit_or_content',
  'other_bug',
] as const;

export const REPORT_SEVERITIES = ['low', 'medium', 'high'] as const;

export const MAX_REPORT_SCREENSHOTS = 5;
export const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024; // 8 MB per screenshot

export const ALLOWED_SCREENSHOT_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
]);

export interface ActorIdentity {
  ownerKey: string;
  userId: string | null;
  deviceKey: string | null;
  isGuest: boolean;
  email?: string | null;
  name?: string | null;
}

export interface ScreenshotInput {
  buffer: Buffer;
  filename: string;
  mimetype: string;
}

export interface StoredScreenshot {
  id?: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  position: number;
}

export interface SongReportDTO {
  id: string;
  ticketCode: string;
  userId: string | null;
  deviceKey: string | null;
  reporterEmail: string | null;
  reporterName: string | null;
  trackId: string;
  trackTitle: string;
  artistName: string;
  albumName: string | null;
  coverUrl: string | null;
  isVideo: boolean;
  category: string;
  subIssues: string[];
  severity: string;
  description: string | null;
  suggestedSolutions: string[];
  userSolution: string | null;
  appVersion: string | null;
  platform: string | null;
  audioQuality: string | null;
  contextSource: string | null;
  status: string;
  createdAt: Date;
  screenshots: StoredScreenshot[];
}

export interface SuppressedTrackDTO {
  id: string;
  ownerKey: string;
  userId: string | null;
  deviceKey: string | null;
  trackKey: string;
  signature: string;
  title: string;
  artist: string;
  album: string | null;
  coverUrl: string | null;
  isVideo: boolean;
  suppressionLevel: string;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const createSongReportSchema = z.object({
  trackId: z.string().trim().min(1).max(128),
  trackTitle: z.string().trim().min(1).max(256),
  artistName: z.string().trim().min(1).max(256),
  albumName: z.string().trim().max(256).optional().nullable(),
  coverUrl: z.string().trim().max(2048).optional().nullable(),
  isVideo: z.coerce.boolean().optional().default(false),
  category: z.enum(REPORT_CATEGORIES),
  subIssues: z.array(z.string().trim().min(1).max(80)).max(10).optional().default([]),
  severity: z.enum(REPORT_SEVERITIES).optional().default('medium'),
  description: z.string().trim().max(2000).optional().nullable(),
  suggestedSolutions: z.array(z.string().trim().min(1).max(120)).max(8).optional().default([]),
  userSolution: z.string().trim().max(1500).optional().nullable(),
  appVersion: z.string().trim().max(32).optional().nullable(),
  platform: z.string().trim().max(32).optional().nullable(),
  audioQuality: z.string().trim().max(32).optional().nullable(),
  contextSource: z.string().trim().max(64).optional().nullable(),
});

export const suppressTrackSchema = z.object({
  trackId: z.string().trim().min(1).max(128),
  title: z.string().trim().min(1).max(256),
  artist: z.string().trim().max(256).optional().default('Unknown Artist'),
  album: z.string().trim().max(256).optional().nullable(),
  coverUrl: z.string().trim().max(2048).optional().nullable(),
  isVideo: z.coerce.boolean().optional().default(false),
  suppressionLevel: z.enum(['ultra_less', 'no_suggestion']).optional().default('ultra_less'),
  reason: z.string().trim().max(64).optional().nullable(),
  updatedAt: z.string().optional(),
});

export const syncSuppressedSchema = z.object({
  items: z.array(suppressTrackSchema).max(500).default([]),
});

export function sanitizeFeedbackText(input: string | null | undefined, maxLen: number): string | null {
  if (!input) return null;
  const cleaned = input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .trim()
    .slice(0, maxLen);
  return cleaned.length > 0 ? cleaned : null;
}

export function sanitizeDeviceKey(raw: string | string[] | undefined): string | null {
  const val = Array.isArray(raw) ? raw[0] : raw;
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  return /^[a-zA-Z0-9_-]{8,128}$/.test(trimmed) ? trimmed : null;
}

export function normalizeTrackKey(rawId: string): string {
  return rawId
    .trim()
    .replace(/^(yt-|yt:)/i, '')
    .trim()
    .slice(0, 128);
}

export function normalizeSignature(title: string, artist: string): string {
  const cleanTitle = title
    .toLowerCase()
    .replace(/\s*[\(\[].*?[\)\]]/g, '')
    .replace(/^.*?\s+-\s+/, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const cleanArtist = artist
    .toLowerCase()
    .replace(/(\b(feat|ft|and|with)\b|&).*/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${cleanTitle}|${cleanArtist}`.slice(0, 256);
}

export function generateTicketCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars[bytes[i]! % chars.length];
  }
  return `ZNF-RPT-${suffix}`;
}

export function detectImageMimeFromBuffer(buf: Buffer, fallbackMime?: string): { mime: string; ext: string } | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  // WEBP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  // HEIC / AVIF ISO BMFF ftyp box
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('ascii').toLowerCase();
    if (brand.startsWith('heic') || brand.startsWith('heix') || brand.startsWith('mif1')) {
      return { mime: 'image/heic', ext: 'heic' };
    }
    if (brand.startsWith('avif')) {
      return { mime: 'image/avif', ext: 'avif' };
    }
  }
  void fallbackMime;
  return null;
}

export interface FeedbackRepository {
  ensureReady(): Promise<void>;
  claimDeviceRecords(userId: string, deviceKey: string): Promise<void>;
  createReport(
    data: Omit<SongReportDTO, 'id' | 'createdAt' | 'screenshots'>,
    screenshots: StoredScreenshot[]
  ): Promise<SongReportDTO>;
  listReports(actor: ActorIdentity, limit?: number): Promise<SongReportDTO[]>;
  listSuppressions(actor: ActorIdentity): Promise<SuppressedTrackDTO[]>;
  upsertSuppression(
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
  ): Promise<SuppressedTrackDTO>;
  revokeSuppression(
    actor: ActorIdentity,
    trackKey: string,
    signature?: string | null
  ): Promise<number>;
}

export class PrismaFeedbackRepository implements FeedbackRepository {
  private readyPromise: Promise<void> | null = null;

  async ensureReady(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = this.initTables().catch((err) => {
        this.readyPromise = null;
        throw err;
      });
    }
    await this.readyPromise;
  }

  private async initTables(): Promise<void> {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "song_reports" (
        "id" TEXT NOT NULL,
        "ticket_code" VARCHAR(24) NOT NULL,
        "user_id" TEXT,
        "device_key" VARCHAR(128),
        "reporter_email" VARCHAR(255),
        "reporter_name" VARCHAR(120),
        "track_id" VARCHAR(128) NOT NULL,
        "track_title" VARCHAR(256) NOT NULL,
        "artist_name" VARCHAR(256) NOT NULL,
        "album_name" VARCHAR(256),
        "cover_url" TEXT,
        "is_video" BOOLEAN NOT NULL DEFAULT false,
        "category" VARCHAR(64) NOT NULL,
        "sub_issues" TEXT[] DEFAULT ARRAY[]::TEXT[],
        "severity" VARCHAR(16) NOT NULL DEFAULT 'medium',
        "description" TEXT,
        "suggested_solutions" TEXT[] DEFAULT ARRAY[]::TEXT[],
        "user_solution" TEXT,
        "app_version" VARCHAR(32),
        "platform" VARCHAR(32),
        "audio_quality" VARCHAR(32),
        "context_source" VARCHAR(64),
        "status" VARCHAR(24) NOT NULL DEFAULT 'OPEN',
        "admin_notes" TEXT,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "song_reports_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "song_report_screenshots" (
        "id" TEXT NOT NULL,
        "report_id" TEXT NOT NULL,
        "url" TEXT NOT NULL,
        "mime_type" VARCHAR(64) NOT NULL,
        "size_bytes" INTEGER NOT NULL DEFAULT 0,
        "position" INTEGER NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "song_report_screenshots_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "user_track_suppressions" (
        "id" TEXT NOT NULL,
        "owner_key" VARCHAR(160) NOT NULL,
        "user_id" TEXT,
        "device_key" VARCHAR(128),
        "track_key" VARCHAR(128) NOT NULL,
        "signature" VARCHAR(256) NOT NULL,
        "title" VARCHAR(256) NOT NULL,
        "artist" VARCHAR(256) NOT NULL,
        "album" VARCHAR(256),
        "cover_url" TEXT,
        "is_video" BOOLEAN NOT NULL DEFAULT false,
        "suppression_level" VARCHAR(24) NOT NULL DEFAULT 'ultra_less',
        "reason" VARCHAR(64),
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "user_track_suppressions_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "song_reports_ticket_code_key" ON "song_reports"("ticket_code");`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "song_reports_user_id_created_at_idx" ON "song_reports"("user_id", "created_at");`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "song_reports_device_key_created_at_idx" ON "song_reports"("device_key", "created_at");`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "song_report_screenshots_report_id_position_idx" ON "song_report_screenshots"("report_id", "position");`
    );
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "user_track_suppressions_owner_key_track_key_key" ON "user_track_suppressions"("owner_key", "track_key");`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "user_track_suppressions_owner_key_idx" ON "user_track_suppressions"("owner_key");`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "user_track_suppressions_user_id_idx" ON "user_track_suppressions"("user_id");`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "user_track_suppressions_device_key_idx" ON "user_track_suppressions"("device_key");`
    );
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'song_reports_user_id_fkey') THEN
          ALTER TABLE "song_reports" ADD CONSTRAINT "song_reports_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'song_report_screenshots_report_id_fkey') THEN
          ALTER TABLE "song_report_screenshots" ADD CONSTRAINT "song_report_screenshots_report_id_fkey"
            FOREIGN KEY ("report_id") REFERENCES "song_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_track_suppressions_user_id_fkey') THEN
          ALTER TABLE "user_track_suppressions" ADD CONSTRAINT "user_track_suppressions_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);
  }

  async claimDeviceRecords(userId: string, deviceKey: string): Promise<void> {
    const deviceOwnerKey = `device:${deviceKey}`;
    const userOwnerKey = `user:${userId}`;

    // Migrate guest/device song reports onto the signed-in user
    await prisma.songReport
      .updateMany({
        where: { deviceKey, userId: null },
        data: { userId },
      })
      .catch(() => {});

    // Migrate unclaimed pre-login suppressions cleanly onto the user account
    const deviceRows = await prisma.userTrackSuppression
      .findMany({ where: { ownerKey: deviceOwnerKey } })
      .catch(() => []);

    for (const row of deviceRows) {
      await prisma.userTrackSuppression
        .upsert({
          where: {
            ownerKey_trackKey: {
              ownerKey: userOwnerKey,
              trackKey: row.trackKey,
            },
          },
          create: {
            ownerKey: userOwnerKey,
            userId,
            deviceKey: null,
            trackKey: row.trackKey,
            signature: row.signature,
            title: row.title,
            artist: row.artist,
            album: row.album,
            coverUrl: row.coverUrl,
            isVideo: row.isVideo,
            suppressionLevel: row.suppressionLevel,
            reason: row.reason,
          },
          update: {},
        })
        .catch(() => {});
      await prisma.userTrackSuppression.delete({ where: { id: row.id } }).catch(() => {});
    }
  }

  async createReport(
    data: Omit<SongReportDTO, 'id' | 'createdAt' | 'screenshots'>,
    screenshots: StoredScreenshot[]
  ): Promise<SongReportDTO> {
    const created = await prisma.songReport.create({
      data: {
        ticketCode: data.ticketCode,
        userId: data.userId,
        deviceKey: data.deviceKey,
        reporterEmail: data.reporterEmail ?? null,
        reporterName: data.reporterName ?? null,
        trackId: data.trackId,
        trackTitle: data.trackTitle,
        artistName: data.artistName,
        albumName: data.albumName,
        coverUrl: data.coverUrl,
        isVideo: data.isVideo,
        category: data.category,
        subIssues: data.subIssues,
        severity: data.severity,
        description: data.description,
        suggestedSolutions: data.suggestedSolutions,
        userSolution: data.userSolution,
        appVersion: data.appVersion,
        platform: data.platform,
        audioQuality: data.audioQuality,
        contextSource: data.contextSource,
        status: data.status,
        screenshots: {
          create: screenshots.map((s, idx) => ({
            url: s.url,
            mimeType: s.mimeType,
            sizeBytes: s.sizeBytes,
            position: idx,
          })),
        },
      },
      include: {
        screenshots: { orderBy: { position: 'asc' } },
      },
    });
    return created as SongReportDTO;
  }

  async listReports(actor: ActorIdentity, limit = 50): Promise<SongReportDTO[]> {
    const where = actor.userId
      ? { userId: actor.userId }
      : actor.deviceKey
        ? { deviceKey: actor.deviceKey }
        : { id: '__none__' };
    const rows = await prisma.songReport.findMany({
      where,
      include: { screenshots: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows as SongReportDTO[];
  }

  async listSuppressions(actor: ActorIdentity): Promise<SuppressedTrackDTO[]> {
    const rows = await prisma.userTrackSuppression.findMany({
      where: { ownerKey: actor.ownerKey },
      orderBy: { updatedAt: 'desc' },
    });
    return rows as SuppressedTrackDTO[];
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
    const row = await prisma.userTrackSuppression.upsert({
      where: {
        ownerKey_trackKey: {
          ownerKey: actor.ownerKey,
          trackKey: data.trackKey,
        },
      },
      create: {
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
      },
      update: {
        signature: data.signature,
        title: data.title,
        artist: data.artist,
        album: data.album,
        coverUrl: data.coverUrl,
        isVideo: data.isVideo,
        suppressionLevel: data.suppressionLevel,
        reason: data.reason,
      },
    });
    return row as SuppressedTrackDTO;
  }

  async revokeSuppression(
    actor: ActorIdentity,
    trackKey: string,
    signature?: string | null
  ): Promise<number> {
    const res = await prisma.userTrackSuppression.deleteMany({
      where: {
        ownerKey: actor.ownerKey,
        OR: [
          { trackKey },
          ...(signature ? [{ signature }] : []),
        ],
      },
    });
    return res.count;
  }
}

export class FeedbackService {
  constructor(
    private readonly repo: FeedbackRepository = new PrismaFeedbackRepository(),
    private readonly uploadScreenshotFn?: (
      file: ScreenshotInput,
      ticketCode: string,
      position: number
    ) => Promise<StoredScreenshot>
  ) {}

  static readonly defaultInstance = new FeedbackService();

  static resolveActor(req: {
    user?: any;
    headers: Record<string, string | string[] | undefined>;
  }): ActorIdentity | null {
    const u = req.user;
    const rawUserId = typeof u?.id === 'string' ? u.id.trim() : '';
    const isGuest = Boolean(u?.isGuest) || rawUserId.startsWith('guest_');
    const deviceKey = sanitizeDeviceKey(req.headers['x-device-key']);

    if (rawUserId && !isGuest) {
      return {
        ownerKey: `user:${rawUserId}`,
        userId: rawUserId,
        deviceKey,
        isGuest: false,
        email: typeof u?.email === 'string' ? u.email : null,
        name: typeof u?.name === 'string' ? u.name : null,
      };
    }

    if (deviceKey) {
      return {
        ownerKey: `device:${deviceKey}`,
        userId: null,
        deviceKey,
        isGuest: true,
        email: null,
        name: 'Guest Listener',
      };
    }

    if (rawUserId) {
      return {
        ownerKey: `guest:${rawUserId}`,
        userId: null,
        deviceKey: null,
        isGuest: true,
        email: null,
        name: 'Guest Listener',
      };
    }

    return null;
  }

  private async defaultUploadScreenshot(
    file: ScreenshotInput,
    ticketCode: string,
    position: number
  ): Promise<StoredScreenshot> {
    if (file.buffer.length === 0) {
      throw new Error('Screenshot file is empty');
    }
    if (file.buffer.length > MAX_SCREENSHOT_BYTES) {
      throw new Error('Screenshot exceeds maximum allowed size of 8 MB');
    }

    const detected = detectImageMimeFromBuffer(file.buffer, file.mimetype);
    if (!detected) {
      throw new Error('Unsupported screenshot image format. Use PNG, JPG, WebP, HEIC, or AVIF.');
    }

    const hasCloudinary =
      Boolean(config.CLOUDINARY_CLOUD_NAME) &&
      Boolean(config.CLOUDINARY_API_KEY) &&
      Boolean(config.CLOUDINARY_API_SECRET);

    if (hasCloudinary) {
      try {
        const secureUrl = await new Promise<string>((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              resource_type: 'image',
              folder: `zenify/reports/${ticketCode}`,
              public_id: `shot_${position}_${crypto.randomBytes(6).toString('hex')}`,
            },
            (err, result) => {
              if (err || !result?.secure_url) reject(err || new Error('Upload failed'));
              else resolve(result.secure_url);
            }
          );
          stream.end(file.buffer);
        });
        return {
          url: secureUrl,
          mimeType: detected.mime,
          sizeBytes: file.buffer.length,
          position,
        };
      } catch {
        // Fallback cleanly to local static directory below if Cloudinary fails
      }
    }

    const relDir = path.join('uploads', 'reports', ticketCode);
    const diskDir = path.join(process.cwd(), 'public', relDir);
    await fs.mkdir(diskDir, { recursive: true });
    const fname = `shot_${position}_${crypto.randomBytes(12).toString('hex')}.${detected.ext}`;
    await fs.writeFile(path.join(diskDir, fname), file.buffer);

    return {
      url: `/public/uploads/reports/${ticketCode}/${fname}`,
      mimeType: detected.mime,
      sizeBytes: file.buffer.length,
      position,
    };
  }

  async submitReport(
    actor: ActorIdentity,
    rawBody: unknown,
    screenshots: ScreenshotInput[]
  ): Promise<SongReportDTO> {
    if (screenshots.length > MAX_REPORT_SCREENSHOTS) {
      const err: any = new Error(`Maximum ${MAX_REPORT_SCREENSHOTS} screenshots allowed per report.`);
      err.statusCode = 400;
      throw err;
    }

    const parsed = createSongReportSchema.safeParse(rawBody);
    if (!parsed.success) {
      const err: any = new Error('Invalid report details');
      err.statusCode = 400;
      err.details = parsed.error.format();
      throw err;
    }

    const data = parsed.data;
    const cleanSolution = sanitizeFeedbackText(data.userSolution, 1500);
    const cleanDesc = sanitizeFeedbackText(data.description, 2000);
    const cleanSuggestedSolutions = data.suggestedSolutions
      .map((s) => sanitizeFeedbackText(s, 120))
      .filter((s): s is string => Boolean(s));
    const cleanSubIssues = data.subIssues
      .map((s) => sanitizeFeedbackText(s, 80))
      .filter((s): s is string => Boolean(s));

    await this.repo.ensureReady();
    if (actor.userId && actor.deviceKey) {
      await this.repo.claimDeviceRecords(actor.userId, actor.deviceKey);
    }

    const ticketCode = generateTicketCode();
    const uploader = this.uploadScreenshotFn ?? this.defaultUploadScreenshot.bind(this);
    const storedShots: StoredScreenshot[] = [];

    for (let i = 0; i < screenshots.length; i++) {
      try {
        const shot = await uploader(screenshots[i]!, ticketCode, i);
        storedShots.push(shot);
      } catch (e: any) {
        const err: any = new Error(e?.message || 'Invalid screenshot attachment');
        err.statusCode = 400;
        throw err;
      }
    }

    const created = await this.repo.createReport(
      {
        ticketCode,
        userId: actor.userId,
        deviceKey: actor.deviceKey,
        reporterEmail: actor.email ?? null,
        reporterName: actor.name ?? null,
        trackId: normalizeTrackKey(data.trackId) || data.trackId.slice(0, 128),
        trackTitle: sanitizeFeedbackText(data.trackTitle, 256) ?? 'Unknown Track',
        artistName: sanitizeFeedbackText(data.artistName, 256) ?? 'Unknown Artist',
        albumName: sanitizeFeedbackText(data.albumName, 256),
        coverUrl: sanitizeFeedbackText(data.coverUrl, 2048),
        isVideo: Boolean(data.isVideo),
        category: data.category,
        subIssues: cleanSubIssues,
        severity: data.severity,
        description: cleanDesc,
        suggestedSolutions: cleanSuggestedSolutions,
        userSolution: cleanSolution,
        appVersion: sanitizeFeedbackText(data.appVersion, 32),
        platform: sanitizeFeedbackText(data.platform, 32),
        audioQuality: sanitizeFeedbackText(data.audioQuality, 32),
        contextSource: sanitizeFeedbackText(data.contextSource, 64),
        status: 'OPEN',
      },
      storedShots
    );

    logBuffer.add({
      level: 'INFO',
      category: 'HTTP',
      message: `[SongReport] ${ticketCode} (${data.category}/${data.severity}) for "${created.trackTitle}" (${storedShots.length} screenshots)`,
    });

    return created;
  }

  async getReports(actor: ActorIdentity): Promise<SongReportDTO[]> {
    await this.repo.ensureReady();
    if (actor.userId && actor.deviceKey) {
      await this.repo.claimDeviceRecords(actor.userId, actor.deviceKey);
    }
    return this.repo.listReports(actor);
  }

  async getSuppressedTracks(actor: ActorIdentity): Promise<SuppressedTrackDTO[]> {
    await this.repo.ensureReady();
    if (actor.userId && actor.deviceKey) {
      await this.repo.claimDeviceRecords(actor.userId, actor.deviceKey);
    }
    return this.repo.listSuppressions(actor);
  }

  async addSuppressedTrack(actor: ActorIdentity, rawBody: unknown): Promise<SuppressedTrackDTO> {
    const parsed = suppressTrackSchema.safeParse(rawBody);
    if (!parsed.success) {
      const err: any = new Error('Invalid suppress track payload');
      err.statusCode = 400;
      err.details = parsed.error.format();
      throw err;
    }

    await this.repo.ensureReady();
    if (actor.userId && actor.deviceKey) {
      await this.repo.claimDeviceRecords(actor.userId, actor.deviceKey);
    }

    const d = parsed.data;
    const cleanTitle = sanitizeFeedbackText(d.title, 256) ?? 'Unknown Title';
    const cleanArtist = sanitizeFeedbackText(d.artist, 256) ?? 'Unknown Artist';
    const trackKey = normalizeTrackKey(d.trackId) || normalizeSignature(cleanTitle, cleanArtist);

    return this.repo.upsertSuppression(actor, {
      trackKey,
      signature: normalizeSignature(cleanTitle, cleanArtist),
      title: cleanTitle,
      artist: cleanArtist,
      album: sanitizeFeedbackText(d.album, 256),
      coverUrl: sanitizeFeedbackText(d.coverUrl, 2048),
      isVideo: Boolean(d.isVideo),
      suppressionLevel: d.suppressionLevel,
      reason: sanitizeFeedbackText(d.reason, 64) ?? 'suggest_less',
    });
  }

  async removeSuppressedTrack(
    actor: ActorIdentity,
    rawTrackKey: string,
    rawTitle?: string,
    rawArtist?: string
  ): Promise<{ removed: number }> {
    await this.repo.ensureReady();
    if (actor.userId && actor.deviceKey) {
      await this.repo.claimDeviceRecords(actor.userId, actor.deviceKey);
    }
    const trackKey = normalizeTrackKey(rawTrackKey);
    const sig =
      rawTitle && rawTitle.trim().length > 0
        ? normalizeSignature(rawTitle, rawArtist ?? '')
        : null;
    const removed = await this.repo.revokeSuppression(actor, trackKey, sig);
    return { removed };
  }

  async syncSuppressedTracks(
    actor: ActorIdentity,
    rawBody: unknown
  ): Promise<SuppressedTrackDTO[]> {
    const parsed = syncSuppressedSchema.safeParse(rawBody);
    if (!parsed.success) {
      const err: any = new Error('Invalid sync payload');
      err.statusCode = 400;
      throw err;
    }

    await this.repo.ensureReady();
    if (actor.userId && actor.deviceKey) {
      await this.repo.claimDeviceRecords(actor.userId, actor.deviceKey);
    }

    for (const d of parsed.data.items) {
      const cleanTitle = sanitizeFeedbackText(d.title, 256) ?? 'Unknown Title';
      const cleanArtist = sanitizeFeedbackText(d.artist, 256) ?? 'Unknown Artist';
      const trackKey = normalizeTrackKey(d.trackId) || normalizeSignature(cleanTitle, cleanArtist);
      await this.repo.upsertSuppression(actor, {
        trackKey,
        signature: normalizeSignature(cleanTitle, cleanArtist),
        title: cleanTitle,
        artist: cleanArtist,
        album: sanitizeFeedbackText(d.album, 256),
        coverUrl: sanitizeFeedbackText(d.coverUrl, 2048),
        isVideo: Boolean(d.isVideo),
        suppressionLevel: d.suppressionLevel,
        reason: sanitizeFeedbackText(d.reason, 64) ?? 'suggest_less',
      });
    }

    return this.repo.listSuppressions(actor);
  }
}
