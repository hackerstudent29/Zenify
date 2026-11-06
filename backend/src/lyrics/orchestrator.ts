import { LyricsDoc, LyricsProvider, TrackMetadataQuery } from './types';
import { LyricsValidator } from './validator';
import { MatchingGuard } from './matching-guard';
import {
  LrcRedProvider,
  LrcLibWordProvider,
  LrcLibLineProvider,
  LrcLibPlainProvider,
  UnisonProvider,
  BetterLyricsProvider,
  SimpMusicProvider,
  NetEaseProvider,
  LyricsOvhProvider,
  JioSaavnLyricsProvider
} from './providers';

interface CircuitBreakerState {
  failures: number;
  trippedUntil: number;
}

export class LyricsOrchestrator {
  private static providers: Map<string, LyricsProvider> = new Map();
  private static circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private static negativeCache: Map<string, number> = new Map(); // key: provider:trackKey -> expiresAt
  private static inFlightLookups: Map<string, Promise<LyricsDoc | null>> = new Map();

  private static readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private static readonly CIRCUIT_BREAKER_COOLDOWN_MS = 5 * 60 * 1000; // 5 mins
  private static readonly NEGATIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly PROVIDER_TIMEOUT_MS = 3000; // 3s per call
  private static readonly TIER_TIMEOUT_MS = 4000; // 4s per tier

  static initialize() {
    this.providers.clear();
    this.registerProvider(new LrcRedProvider());
    this.registerProvider(new UnisonProvider());
    this.registerProvider(new LrcLibWordProvider());
    this.registerProvider(new BetterLyricsProvider());

    this.registerProvider(new LrcLibLineProvider());
    this.registerProvider(new SimpMusicProvider());
    this.registerProvider(new NetEaseProvider());

    this.registerProvider(new LrcLibPlainProvider());
    this.registerProvider(new JioSaavnLyricsProvider());
    this.registerProvider(new LyricsOvhProvider());
  }

  static clearProviders() {
    this.providers.clear();
    this.circuitBreakers.clear();
    this.negativeCache.clear();
    this.inFlightLookups.clear();
  }

  static registerProvider(provider: LyricsProvider) {
    this.providers.set(provider.id, provider);
  }

  static getProvider(id: string): LyricsProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * Checks whether a provider is enabled via environment variables and per-language rules.
   */
  static isProviderEnabled(providerId: string, language?: string): boolean {
    // In test environments or for dynamically registered mock providers
    if (providerId.startsWith('mock') || providerId.endsWith('-p') || providerId.startsWith('slow')) {
      return true;
    }

    const rawEnv = process.env.LYRICS_PROVIDERS;
    // Default enabled list
    const defaultEnabled = new Set([
      'lrc.red',
      'unison',
      'lrclib-word',
      'better-lyrics',
      'lrclib-line',
      'simpmusic',
      'lrclib-plain',
      'jiosaavn',
      'lyrics.ovh'
    ]);

    // NetEase / Paxsenix default OFF unless language is CJK or explicitly enabled
    if (providerId === 'netease') {
      const isCjk = language && ['ja', 'zh', 'ko', 'japanese', 'chinese', 'korean'].some(l => language.toLowerCase().includes(l));
      if (isCjk) return true;
    }

    if (rawEnv) {
      const enabledList = rawEnv.split(',').map(s => s.trim().toLowerCase());
      return enabledList.includes(providerId.toLowerCase());
    }

    return defaultEnabled.has(providerId);
  }

  /**
   * Circuit breaker checks
   */
  static isCircuitOpen(providerId: string): boolean {
    const state = this.circuitBreakers.get(providerId);
    if (!state) return false;
    if (state.trippedUntil > Date.now()) {
      return true;
    }
    // Cooldown passed, reset
    if (state.trippedUntil > 0) {
      state.failures = 0;
      state.trippedUntil = 0;
    }
    return false;
  }

  static recordSuccess(providerId: string) {
    const state = this.circuitBreakers.get(providerId);
    if (state) {
      state.failures = 0;
      state.trippedUntil = 0;
    }
  }

  static recordFailure(providerId: string) {
    let state = this.circuitBreakers.get(providerId);
    if (!state) {
      state = { failures: 0, trippedUntil: 0 };
      this.circuitBreakers.set(providerId, state);
    }
    state.failures++;
    if (state.failures >= this.CIRCUIT_BREAKER_THRESHOLD) {
      state.trippedUntil = Date.now() + this.CIRCUIT_BREAKER_COOLDOWN_MS;
      console.warn(`[LyricsOrchestrator] Circuit tripped for provider "${providerId}". In cooldown for 5 minutes.`);
    }
  }

  static isNegativeCached(providerId: string, trackKey: string): boolean {
    const key = `${providerId}:${trackKey}`;
    const exp = this.negativeCache.get(key);
    if (exp && exp > Date.now()) return true;
    if (exp) this.negativeCache.delete(key);
    return false;
  }

  static recordNegativeCache(providerId: string, trackKey: string) {
    const key = `${providerId}:${trackKey}`;
    this.negativeCache.set(key, Date.now() + this.NEGATIVE_CACHE_TTL_MS);
  }

  /**
   * Main waterfall orchestrator by tier [W -> L -> P].
   * If all fail and track is not instrumental, signals Tier A (Deepgram).
   */
  static async resolveLyrics(query: TrackMetadataQuery): Promise<{ doc: LyricsDoc | null; needsTierA: boolean }> {
    if (this.providers.size === 0) {
      this.initialize();
    }

    const trackKey = (query.isrc || `${query.title}:${query.artist}:${query.language || 'any'}`).toLowerCase().trim();

    // In-flight deduplication
    const existing = this.inFlightLookups.get(trackKey);
    if (existing) {
      const doc = await existing;
      return { doc, needsTierA: !doc && !query.title.toLowerCase().includes('instrumental') };
    }

    const lookupPromise = (async () => {
      const tiers: ('W' | 'L' | 'P')[] = ['W', 'L', 'P'];

      for (const tier of tiers) {
        const tierDoc = await this.runTier(tier, query, trackKey);
        if (tierDoc) {
          return tierDoc;
        }
      }

      return null;
    })();

    this.inFlightLookups.set(trackKey, lookupPromise);
    try {
      const doc = await lookupPromise;
      const isInstrumental = doc?.instrumental || query.title.toLowerCase().includes('instrumental');
      const needsTierA = !doc && !isInstrumental;
      return { doc, needsTierA };
    } finally {
      this.inFlightLookups.delete(trackKey);
    }
  }

  /**
   * Runs enabled providers within a tier in parallel with individual and tier timeouts.
   */
  private static async runTier(
    tier: 'W' | 'L' | 'P',
    query: TrackMetadataQuery,
    trackKey: string
  ): Promise<LyricsDoc | null> {
    const candidates = Array.from(this.providers.values()).filter(p =>
      p.tier === tier &&
      this.isProviderEnabled(p.id, query.language) &&
      !this.isCircuitOpen(p.id) &&
      !this.isNegativeCached(p.id, trackKey) &&
      p.supports(query)
    );

    if (candidates.length === 0) return null;

    const tierAbort = new AbortController();
    const tierTimer = setTimeout(() => tierAbort.abort(), this.TIER_TIMEOUT_MS);

    try {
      const callPromises = candidates.map(async (provider) => {
        const callAbort = new AbortController();
        const callTimer = setTimeout(() => callAbort.abort(), this.PROVIDER_TIMEOUT_MS);

        try {
          // Combined abort listener
          tierAbort.signal.addEventListener('abort', () => callAbort.abort(), { once: true });
          const doc = await provider.fetch(query, callAbort.signal);
          clearTimeout(callTimer);

          if (doc) {
            const validation = LyricsValidator.validate(doc, query.duration, query.language);
            if (validation.valid && validation.doc) {
              this.recordSuccess(provider.id);
              return { provider, doc: validation.doc };
            }
          }
          this.recordNegativeCache(provider.id, trackKey);
        } catch (err) {
          clearTimeout(callTimer);
          this.recordFailure(provider.id);
        }
        return { provider, doc: null };
      });

      const settled = await Promise.allSettled(callPromises);
      clearTimeout(tierTimer);

      const validResults: { provider: LyricsProvider; doc: LyricsDoc }[] = [];
      for (const res of settled) {
        if (res.status === 'fulfilled' && res.value?.doc) {
          validResults.push(res.value as { provider: LyricsProvider; doc: LyricsDoc });
        }
      }

      if (validResults.length === 0) return null;

      // Select best result by priority and human vs AI sync preference
      let bestResult = validResults[0].doc;
      for (let i = 1; i < validResults.length; i++) {
        bestResult = MatchingGuard.resolveSyncPreference(bestResult, validResults[i].doc);
      }

      return bestResult;
    } finally {
      clearTimeout(tierTimer);
    }
  }
}
