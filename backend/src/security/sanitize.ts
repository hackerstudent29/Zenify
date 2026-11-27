// eslint-disable-next-line no-control-regex
const BAD_CHARS = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

/** Strip control, zero-width and bidi-override characters; collapse spaces; clip. */
export function clean(input: string, max: number): string {
  const t = input.replace(BAD_CHARS, '').replace(/[ \t]+/g, ' ').trim();
  return t.length > max ? t.slice(0, max).trimEnd() : t;
}

/** Only https URLs with a host; anything else becomes undefined. */
export function safeHttpsUrl(input: string | undefined | null, max = 500): string | undefined {
  if (!input || input.length > max) return undefined;
  try {
    const u = new URL(input.trim());
    if (u.protocol !== 'https:' || !u.hostname || u.username || u.password) return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}
