import { XMLParser } from 'fast-xml-parser';
import { LyricsDoc, LyricsLine, LyricsWord } from '../types';

export class TtmlParser {
  private static parseTimeString(raw: string | undefined): number {
    if (!raw) return 0;
    const s = String(raw).trim();
    if (s.endsWith('ms')) {
      return parseFloat(s.slice(0, -2));
    }
    if (s.endsWith('s')) {
      return Math.round(parseFloat(s.slice(0, -1)) * 1000);
    }
    // mm:ss.xx or hh:mm:ss.xxx
    const parts = s.split(':').map(p => parseFloat(p));
    if (parts.length === 3) {
      return Math.round((parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000);
    }
    if (parts.length === 2) {
      return Math.round((parts[0] * 60 + parts[1]) * 1000);
    }
    const direct = parseFloat(s);
    return isNaN(direct) ? 0 : Math.round(direct * 1000);
  }

  static parse(xmlString: string, providerId: string = 'lrc.red', providerRef?: string): LyricsDoc | null {
    if (!xmlString || typeof xmlString !== 'string') return null;

    try {
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        processEntities: false, // XXE Safe: entity expansion completely disabled
        trimValues: true
      });

      const parsed = parser.parse(xmlString);
      const tt = parsed.tt || parsed['tt:tt'];
      if (!tt) return null;

      // Extract byModel from root attributes
      const byModelAttr =
        tt['@_lrc:byModel'] ??
        tt['@_byModel'] ??
        tt['@_lrc:by_model'];
      const aiSynced = byModelAttr === 'true' || byModelAttr === true;

      const body = tt.body || tt['tt:body'];
      if (!body) return null;

      const divs = Array.isArray(body.div) ? body.div : (body.div ? [body.div] : []);
      const pElements: any[] = [];

      for (const d of divs) {
        if (d.p) {
          if (Array.isArray(d.p)) pElements.push(...d.p);
          else pElements.push(d.p);
        }
      }
      if (body.p) {
        if (Array.isArray(body.p)) pElements.push(...body.p);
        else pElements.push(body.p);
      }

      if (pElements.length === 0) return null;

      const lines: LyricsLine[] = [];
      let hasWordLevelTimings = false;

      for (const p of pElements) {
        const lineBegin = TtmlParser.parseTimeString(p['@_begin']);
        const lineEnd = TtmlParser.parseTimeString(p['@_end']) || (lineBegin + 3000);
        const agent = p['@_ttm:agent'] || p['@_agent'];
        const isBackground =
          p['@_ttm:role'] === 'background' ||
          p['@_role'] === 'background';

        let lineText = '';
        const words: LyricsWord[] = [];

        // Check if p contains span tags
        if (p.span) {
          const spans = Array.isArray(p.span) ? p.span : [p.span];
          for (const sp of spans) {
            const spanText = (typeof sp === 'string' ? sp : (sp['#text'] || sp['text'] || '')).trim();
            if (!spanText) continue;

            const spanBegin = TtmlParser.parseTimeString(sp['@_begin']);
            const spanEnd = TtmlParser.parseTimeString(sp['@_end']) || (spanBegin + 300);

            if (spanBegin > 0 || spanEnd > 0) {
              hasWordLevelTimings = true;
              words.push({
                startMs: spanBegin || lineBegin,
                endMs: spanEnd || (spanBegin + 300),
                text: spanText
              });
            }
            lineText += (lineText ? ' ' : '') + spanText;
          }
        }

        if (!lineText) {
          lineText = (typeof p === 'string' ? p : (p['#text'] || '')).trim();
        }

        if (lineText) {
          lines.push({
            startMs: lineBegin,
            endMs: lineEnd,
            text: lineText,
            words: words.length > 0 ? words : undefined,
            isBackground,
            agent
          });
        }
      }

      // Sort lines
      lines.sort((a, b) => a.startMs - b.startMs);

      return {
        syncLevel: hasWordLevelTimings ? (aiSynced ? 'ai-word' : 'word') : 'line',
        instrumental: false,
        aiGenerated: false,
        aiSynced,
        providerId,
        providerRef,
        lines
      };
    } catch (err) {
      return null;
    }
  }
}

