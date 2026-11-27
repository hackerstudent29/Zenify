import { z } from 'zod';
import { clean, safeHttpsUrl } from '../security/sanitize';

/** Bounded, cleaned string. Bound BEFORE cleaning so huge inputs are rejected cheaply. */
export const text = (max: number, min = 0) =>
  z
    .string()
    .max(max * 4)
    .transform((s) => clean(s, max))
    .pipe(z.string().min(min));

export const httpsUrl = z
  .string()
  .max(500)
  .transform((s) => safeHttpsUrl(s))
  .pipe(z.string());

export const trackId = z.string().min(1).max(64).regex(/^[\w\-:.]+$/);

const weights = z
  .record(z.string().min(1).max(60), z.number().finite().min(0).max(1))
  .refine((r) => Object.keys(r).length <= 40, 'too many keys');

/** A user's taste snapshot for matching. Everything bounded. */
export const matchSnapshot = z.object({
  userId: text(40),
  displayName: text(30, 1),
  periodKey: text(30),
  totalMinutes: z.number().finite().min(0).max(10_000_000),
  uniqueSongsCount: z.number().int().min(0).max(1_000_000),
  uniqueArtistsCount: z.number().int().min(0).max(1_000_000),
  discoveryPct: z.number().finite().min(0).max(1),
  topArtists: weights,
  topTracks: z.array(text(40)).max(60),
  languageDistribution: weights.optional(),
  genreDistribution: weights.optional(),
  daypartDistribution: weights,
  topGenre: text(30).optional(),
  topLanguage: text(30).optional(),
});
export type MatchSnapshot = z.infer<typeof matchSnapshot>;

export const giftBody = z
  .object({
    trackId,
    title: text(200, 1),
    artist: text(200, 1),
    coverUrl: httpsUrl.optional(),
    note: text(140),
    senderName: text(30).optional(),
  })
  .strict();

export const RESERVED = new Set(['admin', 'support', 'zenify', 'root', 'moderator', 'system', 'official', 'help', 'null', 'undefined']);

export const username = z
  .string()
  .max(20)
  .transform((s) => s.trim().toLowerCase())
  .pipe(
    z
      .string()
      .regex(/^[a-z0-9][a-z0-9_.]{2,19}$/)
      .refine((u) => !u.includes('..') && !u.endsWith('.') && !u.endsWith('_'), 'bad ending')
      .refine((u) => !RESERVED.has(u), 'reserved'),
  );

const pref = z.array(text(24, 1)).max(8);

/** Public profile document: the only thing a client may publish. */
export const publicProfileBody = z
  .object({
    username,
    bio: text(160),
    titleId: z.string().max(40).regex(/^[\w-]+$/).optional(),
    realName: text(40, 1).optional(),
    age: z.number().int().min(13).max(120).optional(),
    gender: text(20, 1).optional(),
    country: z.string().regex(/^[A-Z]{2}$/).optional(),
    languages: pref.optional(),
    genres: pref.optional(),
    hours: z.number().int().min(0).max(1_000_000).optional(),
    artists: z.number().int().min(0).max(1_000_000).optional(),
    songs: z.number().int().min(0).max(1_000_000).optional(),
    streakBest: z.number().int().min(0).max(100_000).optional(),
    memberSince: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    topArtists: z.array(text(60, 1)).max(3).optional(),
    showcase: z.array(z.string().max(40).regex(/^[\w-]+$/)).max(3).optional(),
    badgeCount: z.number().int().min(0).max(10_000).optional(),
    titleCount: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();
export type PublicProfileDoc = z.infer<typeof publicProfileBody>;
