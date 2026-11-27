import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Authenticator, requireUser } from '../auth/auth';
import { rateLimit } from '../security/rateLimit';
import { CODE_RE, TOKEN_RE, newInviteCode, newToken } from '../security/tokens';
import { giftBody, matchSnapshot, type MatchSnapshot } from '../shared/schemas';
import type { JsonStore } from '../store/jsonStore';

export interface Gift {
  token: string;
  ownerId: string;
  trackId: string;
  title: string;
  artist: string;
  coverUrl?: string;
  note: string;
  senderName: string;
  createdAt: number;
  expiresAt: number;
  openedAt?: number;
}

export interface Invite {
  code: string;
  ownerId: string;
  snapshot: MatchSnapshot;
  createdAt: number;
  expiresAt: number;
}

export interface SocialState {
  gifts: Record<string, Gift>;
  invites: Record<string, Invite>;
}

export const emptySocialState = (): SocialState => ({ gifts: {}, invites: {} });

export interface SocialOptions {
  store: JsonStore<SocialState>;
  auth: Authenticator;
  /** Public site used in share links, e.g. https://zenify.app */
  publicBaseUrl: string;
  now?: () => number;
}

const DAY = 24 * 60 * 60 * 1000;
const MAX_GIFTS = 20_000;
const MAX_INVITES = 20_000;

function purge(s: SocialState, now: number): void {
  for (const [k, g] of Object.entries(s.gifts)) if (g.expiresAt <= now) delete s.gifts[k];
  for (const [k, i] of Object.entries(s.invites)) if (i.expiresAt <= now) delete s.invites[k];
  const trim = <T extends { createdAt: number }>(m: Record<string, T>, cap: number) => {
    const keys = Object.keys(m);
    if (keys.length <= cap) return;
    keys
      .sort((a, b) => (m[a]?.createdAt ?? 0) - (m[b]?.createdAt ?? 0))
      .slice(0, keys.length - cap)
      .forEach((k) => delete m[k]);
  };
  trim(s.gifts, MAX_GIFTS);
  trim(s.invites, MAX_INVITES);
}

// ---------------------------------------------------------------- matching
const weightedJaccard = (a: Record<string, number>, b: Record<string, number>): number => {
  let mn = 0;
  let mx = 0;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] ?? 0;
    const y = b[k] ?? 0;
    mn += Math.min(x, y);
    mx += Math.max(x, y);
  }
  return mx > 0 ? mn / mx : 0;
};

const jaccard = (a: string[], b: string[]): number => {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = new Set([...A, ...B]).size;
  return union > 0 ? inter / union : 0;
};

const distOverlap = (a: Record<string, number>, b: Record<string, number>): number => {
  let diff = 0;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff += Math.abs((a[k] ?? 0) - (b[k] ?? 0));
  return Math.max(0, 1 - 0.5 * diff);
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function calculateMatch(A: MatchSnapshot, B: MatchSnapshot) {
  const artistOverlap = weightedJaccard(A.topArtists, B.topArtists);
  const trackOverlap = jaccard(A.topTracks, B.topTracks);
  const daypartOverlap = distOverlap(A.daypartDistribution, B.daypartDistribution);
  let weight = 0.35 + 0.25 + 0.1;
  let acc = 0.35 * artistOverlap + 0.25 * trackOverlap + 0.1 * daypartOverlap;
  let languageOverlap: number | null = null;
  if (A.languageDistribution && B.languageDistribution) {
    languageOverlap = distOverlap(A.languageDistribution, B.languageDistribution);
    acc += 0.15 * languageOverlap;
    weight += 0.15;
  }
  let genreOverlap: number | null = null;
  if (A.genreDistribution && B.genreDistribution) {
    genreOverlap = distOverlap(A.genreDistribution, B.genreDistribution);
    acc += 0.15 * genreOverlap;
    weight += 0.15;
  }
  const share = (a: number, b: number) => (a + b > 0 ? a / (a + b) : 0.5);
  const battleA = 0.5 * share(A.totalMinutes, B.totalMinutes) + 0.3 * share(A.discoveryPct, B.discoveryPct) + 0.2 * share(A.uniqueArtistsCount, B.uniqueArtistsCount);
  const battleB = 1 - battleA;
  const winner = battleA > 0.505 ? 'A' : battleB > 0.505 ? 'B' : 'draw';
  const sharedArtists = Object.keys(A.topArtists).filter((k) => k in B.topArtists).slice(0, 5);
  const bTracks = new Set(B.topTracks);
  return {
    compatibilityScore: Math.round(100 * (acc / weight)),
    artistOverlap: r2(artistOverlap),
    trackOverlap: r2(trackOverlap),
    daypartOverlap: r2(daypartOverlap),
    languageOverlap: languageOverlap === null ? null : r2(languageOverlap),
    genreOverlap: genreOverlap === null ? null : r2(genreOverlap),
    battleScoreA: Math.round(battleA * 1000) / 1000,
    battleScoreB: Math.round(battleB * 1000) / 1000,
    winner,
    sharedArtists,
    sharedTracks: A.topTracks.filter((t) => bTracks.has(t)).slice(0, 5),
  };
}

// ------------------------------------------------------------------ routes
function bad(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: 'Invalid request', fields: [...new Set(err.issues.map((i) => i.path.join('.')))].slice(0, 10) });
}

export function socialRoutes(opts: SocialOptions) {
  const now = opts.now ?? Date.now;
  const base = opts.publicBaseUrl.replace(/\/+$/, '');
  const authed = requireUser(opts.auth);
  const write = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, now });
  const calc = rateLimit({ windowMs: 60 * 1000, max: 60, now });
  const read = rateLimit({ windowMs: 60 * 1000, max: 60, now, key: (r) => `ip:${r.ip}` });

  return async function register(server: FastifyInstance): Promise<void> {
    // ------------------------------------------------------------- gifts
    server.post('/gifts', { preHandler: [authed, write] }, async (req, reply) => {
      const p = giftBody.safeParse(req.body);
      if (!p.success) return bad(reply, p.error);
      const t = now();
      const gift: Gift = {
        token: newToken(),
        ownerId: req.zenUserId as string,
        trackId: p.data.trackId,
        title: p.data.title,
        artist: p.data.artist,
        note: p.data.note,
        senderName: p.data.senderName || 'A Zenify friend',
        createdAt: t,
        expiresAt: t + 30 * DAY,
        ...(p.data.coverUrl ? { coverUrl: p.data.coverUrl } : {}),
      };
      await opts.store.update((s) => {
        purge(s, t);
        s.gifts[gift.token] = gift;
      });
      return reply.code(201).send({ token: gift.token, giftUrl: `${base}/gift/${gift.token}`, expiresAt: new Date(gift.expiresAt).toISOString() });
    });

    server.get('/gifts/:token', { preHandler: [read] }, async (req, reply) => {
      const { token } = req.params as { token: string };
      if (!TOKEN_RE.test(token)) return reply.code(404).send({ error: 'Not found' });
      const g = opts.store.read().gifts[token];
      if (!g || g.expiresAt <= now()) return reply.code(404).send({ error: 'Not found' });
      if (!g.openedAt) {
        await opts.store.update((s) => {
          const x = s.gifts[token];
          if (x && !x.openedAt) x.openedAt = now();
        });
      }
      // Only fields that are safe to show: never the owner id.
      return reply.header('Cache-Control', 'no-store').send({
        gift: { trackId: g.trackId, title: g.title, artist: g.artist, coverUrl: g.coverUrl ?? null, note: g.note, senderName: g.senderName, createdAt: new Date(g.createdAt).toISOString() },
      });
    });

    // ------------------------------------------------------------- match
    server.post('/match/invite', { preHandler: [authed, write] }, async (req, reply) => {
      const p = z.object({ snapshot: matchSnapshot }).strict().safeParse(req.body);
      if (!p.success) return bad(reply, p.error);
      const t = now();
      const code = newInviteCode();
      const inv: Invite = { code, ownerId: req.zenUserId as string, snapshot: p.data.snapshot, createdAt: t, expiresAt: t + 7 * DAY };
      await opts.store.update((s) => {
        purge(s, t);
        s.invites[code] = inv;
      });
      return reply.code(201).send({ inviteCode: code, shareUrl: `${base}/match/${code}`, expiresAt: new Date(inv.expiresAt).toISOString() });
    });

    server.get('/match/invite/:code', { preHandler: [read] }, async (req, reply) => {
      const { code } = req.params as { code: string };
      if (!CODE_RE.test(code)) return reply.code(404).send({ error: 'Not found' });
      const inv = opts.store.read().invites[code];
      if (!inv || inv.expiresAt <= now()) return reply.code(404).send({ error: 'Not found' });
      return reply.header('Cache-Control', 'no-store').send({ snapshot: { ...inv.snapshot, userId: '' } });
    });

    server.post('/match/calculate', { preHandler: [authed, calc] }, async (req, reply) => {
      const p = z.object({ snapshotA: matchSnapshot, snapshotB: matchSnapshot }).strict().safeParse(req.body);
      if (!p.success) return bad(reply, p.error);
      return reply.send(calculateMatch(p.data.snapshotA, p.data.snapshotB));
    });
  };
}

/** Public HTML share & deep-link landing pages for gifted tracks and taste matches. */
export function socialPublicRoutes(opts: { store: JsonStore<SocialState>; webBaseUrl?: string; now?: () => number }) {
  const now = opts.now ?? Date.now;
  const webBase = (opts.webBaseUrl ?? 'https://listenzenify.vercel.app').replace(/\/+$/, '');
  const escHtml = (value: string) =>
    value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));

  return async function registerPublic(server: FastifyInstance): Promise<void> {
    server.get('/gift/:token', async (req, reply) => {
      const { token } = req.params as { token: string };
      if (!TOKEN_RE.test(token)) return reply.code(404).type('text/plain').send('Gift not found');
      const g = opts.store.read().gifts[token];
      if (!g || g.expiresAt <= now()) return reply.code(404).type('text/plain').send('Gift not found or expired');

      const title = escHtml(`${g.title} — Gifted by ${g.senderName}`);
      const desc = escHtml(g.note ? `"${g.note}" — Open in Zenify to listen now.` : `Listen to ${g.title} by ${g.artist} on Zenify.`);
      const img = escHtml(g.coverUrl || `${webBase}/og-image.png`);
      const deepLink = escHtml(`zenify://gift/${token}`);
      const webUrl = escHtml(`${webBase}/track/${encodeURIComponent(g.trackId)}`);

      return reply.type('text/html; charset=utf-8').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Zenify</title>
<meta name="description" content="${desc}">
<meta name="robots" content="noindex, follow">
<meta name="theme-color" content="#0A0A0D">
<meta property="og:site_name" content="Zenify">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${img}">
<meta name="twitter:card" content="summary_large_image">
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#0A0A0D;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
.box{max-width:420px;text-align:center}.actions{display:flex;flex-direction:column;gap:12px;margin-top:24px}.btn{display:inline-block;padding:14px 28px;border-radius:12px;background:#fa2d48;color:#fff;text-decoration:none;font-weight:700}.btn-secondary{background:#18181b;border:1px solid rgba(255,255,255,0.14);color:#fff}</style>
</head><body><div class="box"><h1>${title}</h1><p>${desc}</p>
<div class="actions"><a class="btn" href="${deepLink}">Open Gift in Zenify App</a><a class="btn btn-secondary" href="${webUrl}">Listen on Web Player</a></div></div></body></html>`);
    });

    server.get('/match/:code', async (req, reply) => {
      const code = ((req.params as { code: string }).code || '').toUpperCase();
      if (!CODE_RE.test(code)) return reply.code(404).type('text/plain').send('Match invite not found');
      const inv = opts.store.read().invites[code];
      if (!inv || inv.expiresAt <= now()) return reply.code(404).type('text/plain').send('Match invite expired');

      const name = escHtml(inv.snapshot.displayName || 'A Zenify friend');
      const title = escHtml(`${name}'s Zenify Music Match (${code})`);
      const desc = escHtml('Compare your listening taste, top artists, and battle scores in Zenify Replay.');
      const deepLink = escHtml(`zenify://match/${code}`);
      const webUrl = escHtml(`${webBase}/`);

      return reply.type('text/html; charset=utf-8').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta name="robots" content="noindex, follow">
<meta name="theme-color" content="#0A0A0D">
<meta property="og:site_name" content="Zenify">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${webBase}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#0A0A0D;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
.box{max-width:420px;text-align:center}.actions{display:flex;flex-direction:column;gap:12px;margin-top:24px}.btn{display:inline-block;padding:14px 28px;border-radius:12px;background:#E9C46A;color:#1D1400;text-decoration:none;font-weight:700}.btn-secondary{background:#18181b;border:1px solid rgba(255,255,255,0.14);color:#fff}</style>
</head><body><div class="box"><h1>${title}</h1><p>${desc}</p>
<p style="font-family:monospace;letter-spacing:2px;color:#E9C46A">${code}</p>
<div class="actions"><a class="btn" href="${deepLink}">Open Match in Zenify App</a><a class="btn btn-secondary" href="${webUrl}">Open Zenify Web</a></div></div></body></html>`);
    });
  };
}
