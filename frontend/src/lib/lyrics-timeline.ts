/**
 * Lyrics Timeline & Instrumental Break Processor
 * Normalizes lyric lines to max 2 visual lines and identifies instrumental gaps.
 */

export type LyricLineInput = { text: string; start: number; end?: number };

export type LyricTimelineItem =
  | { type: "line"; text: string; start: number; end: number }
  | { type: "gap"; start: number; end: number };

export function splitLyricLine(l: LyricLineInput, nextStart: number, max = 60): LyricLineInput[] {
  const text = (l.text || "").trim().replace(/\s+/g, " ");
  if (!text) return [];
  const end = l.end ?? nextStart;
  if (text.length <= max) return [{ text, start: l.start, end }];

  const n = Math.ceil(text.length / max);
  const target = text.length / n;
  const parts: string[] = [];
  let cur = "";

  for (const w of text.split(" ")) {
    if (cur && (cur + " " + w).length > target && parts.length < n - 1) {
      parts.push(cur);
      cur = w;
    } else {
      cur = cur ? cur + " " + w : w;
    }
  }
  if (cur) parts.push(cur);

  let t = l.start;
  const dur = Math.max(end - l.start, 0.5);
  return parts.map((p) => {
    const d = (dur * p.length) / text.length;
    const o = { text: p, start: t, end: t + d };
    t += d;
    return o;
  });
}

const IS_BREAK = /^[\s♪♫\-–—*#]*$|^[\(\[]?\s*(instrumental|music|interlude|solo|intro|outro)\s*[\)\]]?$/i;

export function buildLyricTimeline(
  lines: LyricLineInput[],
  duration: number,
  maxChars = 60,
  minGap = 6
): LyricTimelineItem[] {
  const out: LyricTimelineItem[] = [];
  let prevEnd = 0;

  const pushGap = (a: number, b: number) => {
    if (b - a >= minGap) {
      out.push({ type: "gap", start: a + 0.4, end: b - 0.3 });
    }
  };

  lines.forEach((l, i) => {
    const nextStart = lines[i + 1]?.start ?? duration;
    if (IS_BREAK.test(l.text)) return; // becomes part of an instrumental gap

    pushGap(prevEnd, l.start);

    // LRC has no end time: estimate how long the line is actually sung
    const sung = l.end ?? Math.min(nextStart, l.start + Math.max(2.5, l.text.length * 0.09));
    splitLyricLine({ ...l, end: sung }, nextStart, maxChars).forEach((p) => {
      out.push({ type: "line", text: p.text, start: p.start, end: p.end! });
    });
    prevEnd = sung;
  });

  pushGap(prevEnd, duration);
  return out;
}

export type WordTimestamp = { word: string; start: number; end: number };

export function deepgramGaps(words: WordTimestamp[], duration: number, minGap = 5) {
  const gaps: { start: number; end: number }[] = [];
  if (!words || words.length < 5) {
    return { instrumental: true, gaps: [{ start: 0, end: duration }] };
  }
  if (words[0].start >= minGap) {
    gaps.push({ start: 0.4, end: words[0].start - 0.3 });
  }
  for (let i = 1; i < words.length; i++) {
    if (words[i].start - words[i - 1].end >= minGap) {
      gaps.push({ start: words[i - 1].end + 0.4, end: words[i].start - 0.3 });
    }
  }
  const last = words[words.length - 1].end;
  if (duration - last >= minGap) {
    gaps.push({ start: last + 0.4, end: duration });
  }
  return { instrumental: false, gaps };
}
