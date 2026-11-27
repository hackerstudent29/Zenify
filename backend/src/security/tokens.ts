import { randomBytes, randomInt } from 'node:crypto';

/** 128-bit unguessable token, URL-safe. Replaces Math.random-based tokens. */
export function newToken(bytes = 16): string {
  return randomBytes(bytes).toString('base64url');
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

/** Short human-friendly invite code from a CSPRNG (10 chars ~ 50 bits). */
export function newInviteCode(len = 10): string {
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

export const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
export const CODE_RE = /^[A-HJ-NP-Z2-9]{10}$/;
