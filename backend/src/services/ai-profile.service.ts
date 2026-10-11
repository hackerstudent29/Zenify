import { prisma } from '../utils/prisma';
import { z } from 'zod';
import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { config } from '../config/env';

const AIInferenceSchema = z.object({
  interests: z.array(z.string()).max(10).describe('List of musical taste descriptions and thematic interests'),
  moods: z.array(z.string()).max(10).describe('Vibe and mood tags'),
  similarArtists: z.array(z.string()).max(10).describe('Suggested similar artists based on taste profile'),
  searchSeeds: z.array(z.string()).max(10).describe('Specific search terms and seeds for personalized discovery')
});

export type AIInferredProfile = z.infer<typeof AIInferenceSchema>;

export class AIProfileService {
  /**
   * Compute recency-weighted language, genre, and artist weights in code
   */
  static async computeUserWeights(userId: string) {
    const preferences = await prisma.userPreferences.findUnique({
      where: { userId }
    });

    const now = Date.now();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    // 1. Fetch recent activity events & plays
    const [recentEvents, historyPlays, userLikes] = await Promise.all([
      prisma.userActivityEvent.findMany({
        where: { userId, createdAt: { gte: thirtyDaysAgo } },
        orderBy: { createdAt: 'desc' },
        take: 300
      }),
      prisma.history.findMany({
        where: { userId, playedAt: { gte: thirtyDaysAgo } },
        include: {
          track: {
            select: { language: true, genre: true, artist: { select: { name: true } } }
          }
        },
        take: 150
      }),
      prisma.like.findMany({
        where: { userId },
        include: {
          track: {
            select: { language: true, genre: true, artist: { select: { name: true } } }
          }
        },
        take: 100
      })
    ]);

    const languageScores: Record<string, number> = {};
    const genreScores: Record<string, number> = {};
    const artistScores: Record<string, number> = {};

    // Baseline from onboarding preferences
    if (preferences?.languages && preferences.languages.length > 0) {
      preferences.languages.forEach((lang, idx) => {
        const key = lang.toLowerCase().trim();
        languageScores[key] = (languageScores[key] || 0) + (10 - idx * 1.5);
      });
    }

    if (preferences?.preferredGenres && preferences.preferredGenres.length > 0) {
      preferences.preferredGenres.forEach((g, idx) => {
        const key = g.trim();
        genreScores[key] = (genreScores[key] || 0) + (10 - idx * 1.5);
      });
    }

    if (preferences?.favoriteArtists && Array.isArray(preferences.favoriteArtists)) {
      (preferences.favoriteArtists as any[]).forEach((a, idx) => {
        if (a && a.name) {
          const key = a.name.trim();
          artistScores[key] = (artistScores[key] || 0) + (12 - idx * 1);
        }
      });
    }

    // Helper for recency decay factor
    const getRecencyMultiplier = (date: Date) => {
      const diffHours = (now - date.getTime()) / (1000 * 60 * 60);
      if (diffHours <= 48) return 3.0; // Last 2 days: 3x
      if (diffHours <= 168) return 2.0; // Last 7 days: 2x
      return 1.0;
    };

    // Ingest history plays
    for (const h of historyPlays) {
      const mult = getRecencyMultiplier(h.playedAt);
      if (h.track?.language) {
        const langKey = h.track.language.toLowerCase().trim();
        languageScores[langKey] = (languageScores[langKey] || 0) + 2.5 * mult;
      }
      if (h.track?.genre) {
        const gKey = h.track.genre.trim();
        genreScores[gKey] = (genreScores[gKey] || 0) + 2.5 * mult;
      }
      if (h.track?.artist?.name) {
        const aKey = h.track.artist.name.trim();
        artistScores[aKey] = (artistScores[aKey] || 0) + 3.0 * mult;
      }
    }

    // Ingest likes
    for (const l of userLikes) {
      const mult = getRecencyMultiplier(l.createdAt);
      if (l.track?.language) {
        const langKey = l.track.language.toLowerCase().trim();
        languageScores[langKey] = (languageScores[langKey] || 0) + 3.0 * mult;
      }
      if (l.track?.genre) {
        const gKey = l.track.genre.trim();
        genreScores[gKey] = (genreScores[gKey] || 0) + 3.0 * mult;
      }
      if (l.track?.artist?.name) {
        const aKey = l.track.artist.name.trim();
        artistScores[aKey] = (artistScores[aKey] || 0) + 4.0 * mult;
      }
    }

    // Ingest activity events
    for (const ev of recentEvents) {
      const mult = getRecencyMultiplier(ev.createdAt);
      const data = (ev.eventData as any) || {};
      if (data.language) {
        const lKey = String(data.language).toLowerCase().trim();
        languageScores[lKey] = (languageScores[lKey] || 0) + 1.5 * mult;
      }
      if (data.genre) {
        const gKey = String(data.genre).trim();
        genreScores[gKey] = (genreScores[gKey] || 0) + 1.5 * mult;
      }
      if (data.artistName) {
        const aKey = String(data.artistName).trim();
        artistScores[aKey] = (artistScores[aKey] || 0) + 2.0 * mult;
      }
    }

    // Normalize weights to sum to 1.0 (with max 6 items each)
    const normalize = (scores: Record<string, number>, topN = 6): Record<string, number> => {
      const sorted = Object.entries(scores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN);
      const total = sorted.reduce((sum, curr) => sum + curr[1], 0);
      if (total === 0) return {};
      const result: Record<string, number> = {};
      for (const [k, val] of sorted) {
        result[k] = Math.round((val / total) * 100) / 100;
      }
      return result;
    };

    return {
      languageWeights: normalize(languageScores, 5),
      genreWeights: normalize(genreScores, 6),
      artistWeights: normalize(artistScores, 8),
      recentActivityCount: recentEvents.length + historyPlays.length
    };
  }

  /**
   * Run one AI inference per user using compact anonymized data
   */
  static async inferAIProfile(
    languageWeights: Record<string, number>,
    genreWeights: Record<string, number>,
    artistWeights: Record<string, number>
  ): Promise<AIInferredProfile> {
    const apiKey = process.env.AI_GATEWAY_API_KEY || config.VERCEL_AI_KEY || process.env.VERCEL_AI_KEY;
    const modelName = process.env.AI_GATEWAY_MODEL || config.AI_GATEWAY_MODEL || 'openai/gpt-4o-mini';

    // Fallback profile if AI key is unavailable or fails
    const codeFallbackProfile: AIInferredProfile = {
      interests: Object.keys(genreWeights).map(g => `${g} Discovery`),
      moods: ['Upbeat', 'Focus', 'Evening Chill', 'Soundtrack Drive'],
      similarArtists: Object.keys(artistWeights).slice(0, 5),
      searchSeeds: [
        ...Object.keys(artistWeights).slice(0, 3).map(a => `${a} hits`),
        ...Object.keys(genreWeights).slice(0, 2).map(g => `Top ${g}`)
      ]
    };

    if (!apiKey) {
      console.warn('[AIProfileService] AI_GATEWAY_API_KEY missing, using code-inferred fallback.');
      return codeFallbackProfile;
    }

    const openai = createOpenAI({
      apiKey,
      baseURL: process.env.AI_GATEWAY_BASE_URL || undefined
    });

    const promptSummary = `
You are an expert music curator and recommendation intelligence engine.
Analyze this anonymized user listening taste profile (recency-weighted):
- Language Preferences: ${JSON.stringify(languageWeights)}
- Genre Preferences: ${JSON.stringify(genreWeights)}
- Favorite & Top Streamed Artists: ${JSON.stringify(artistWeights)}

Infer the following:
1. "interests": 3-5 concise phrases capturing the user's specific musical tastes and subcultural affinities (e.g., "Tamil cinematic anthems", "Melodic acoustic indie").
2. "moods": 3-5 vibe or mood tags that match this music profile.
3. "similarArtists": 5-8 artist names not explicitly listed in their top artists who have a strong stylistic and cultural overlap.
4. "searchSeeds": 4-6 specific search queries for discovering new songs matching this vibe.
`;

    try {
      const model = openai(modelName as any);
      const { object } = await generateObject({
        model,
        schema: AIInferenceSchema,
        prompt: promptSummary
      });

      return object;
    } catch (err: any) {
      console.warn('[AIProfileService] AI Gateway call failed, falling back to rule-based profile:', err.message);
      return codeFallbackProfile;
    }
  }

  /**
   * Run daily analysis for a single user (called exclusively by scheduler / offline worker)
   */
  static async runDailyAnalysis(userId: string): Promise<{ status: 'SUCCESS' | 'SKIPPED' | 'FAILED'; error?: string }> {
    const startTime = Date.now();
    try {
      // 1. Check existing profile & whether there has been new activity
      const existingProfile = await prisma.userInterestProfile.findUnique({
        where: { userId }
      });

      const { languageWeights, genreWeights, artistWeights, recentActivityCount } = await this.computeUserWeights(userId);

      // If user has existing profile and 0 recent events since last run, skip AI call
      if (existingProfile && recentActivityCount === 0) {
        console.log(`[AIProfileService] No new activity for user ${userId}. Skipping AI call.`);
        return { status: 'SKIPPED' };
      }

      // 2. Perform single compact AI request
      const aiResults = await this.inferAIProfile(languageWeights, genreWeights, artistWeights);

      // 3. Save or update UserInterestProfile
      await prisma.userInterestProfile.upsert({
        where: { userId },
        update: {
          languageWeights,
          genreWeights,
          artistWeights,
          interests: aiResults.interests,
          moods: aiResults.moods,
          seeds: aiResults.searchSeeds,
          analyzedAt: new Date()
        },
        create: {
          userId,
          languageWeights,
          genreWeights,
          artistWeights,
          interests: aiResults.interests,
          moods: aiResults.moods,
          seeds: aiResults.searchSeeds,
          analyzedAt: new Date()
        }
      });

      console.log(`[AIProfileService] Analysis completed for user ${userId} in ${Date.now() - startTime}ms.`);
      return { status: 'SUCCESS' };
    } catch (err: any) {
      console.error(`[AIProfileService] Analysis failed for user ${userId}:`, err);
      return { status: 'FAILED', error: err.message };
    }
  }
}
