import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { PreferencesService } from '../services/preferences.service';
import { ActivityService } from '../services/activity.service';
import { AnalysisSchedulerService } from '../services/analysis-scheduler.service';
import { HomeSectionsService } from '../services/home-sections.service';

const updatePreferencesSchema = z.object({
  favoriteArtists: z.array(
    z.object({
      id: z.string(),
      name: z.string().min(1),
      image: z.string().optional().default(''),
      source: z.string().optional().default('custom')
    })
  ).min(3, 'Select at least 3 favorite artists').max(10, 'Maximum 10 favorite artists allowed'),

  preferredGenres: z.array(z.string()).min(1, 'Select at least 1 genre').max(8, 'Maximum 8 genres allowed'),

  languages: z.array(z.string()).min(1, 'Select at least 1 language').max(6, 'Maximum 6 languages allowed'),

  country: z.string().min(1, 'Please select your country'),

  age: z.coerce.number().int().min(13, 'Age must be at least 13').max(100, 'Age must be 100 or below').optional(),

  gender: z.string().max(40).optional()
});

export class PreferencesController {
  /**
   * GET /api/preferences
   * Get current authenticated user's preferences
   */
  async getPreferences(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as any)?.id;
    if (!userId) throw reply.server.httpErrors.unauthorized();

    const [user, preferences] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { country: true, age: true, analysisSlot: true }
      }),
      prisma.userPreferences.findUnique({
        where: { userId }
      })
    ]);

    return reply.send({
      onboardingCompleted: preferences?.onboardingCompleted || false,
      onboardingCompletedAt: preferences?.onboardingCompletedAt || null,
      languages: preferences?.languages || [],
      preferredGenres: preferences?.preferredGenres || [],
      favoriteArtists: preferences?.favoriteArtists || [],
      country: user?.country || null,
      age: user?.age || null,
      audioQuality: preferences?.audioQuality || 'high',
      theme: preferences?.theme || 'dark'
    });
  }

  /**
   * PUT /api/preferences
   * Update preferences and complete onboarding
   */
  async updatePreferences(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as any)?.id;
    if (!userId) throw reply.server.httpErrors.unauthorized();

    const parseResult = updatePreferencesSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parseResult.error.format()
      });
    }

    const data = parseResult.data;

    // 1. Update User model (country, age, and ensure analysisSlot is assigned)
    await prisma.user.update({
      where: { id: userId },
      data: {
        country: data.country,
        ...(data.age !== undefined ? { age: data.age } : {})
      }
    });

    await AnalysisSchedulerService.assignUserSlot(userId);

    // 2. Resolve normalized country and language to keep in sync
    const { CountryLanguageService } = await import('../services/country-language.service.js');
    const primaryLang = data.languages[0] || 'ta';
    const normLang = CountryLanguageService.normalizeLanguage(primaryLang) || { code: 'ta', name: 'Tamil' };
    const normCountry = CountryLanguageService.normalizeCountry(data.country) || { code: 'IN', name: 'India' };

    // 3. Upsert UserPreferences
    const updatedPreferences = await prisma.userPreferences.upsert({
      where: { userId },
      update: {
        onboardingCompleted: true,
        onboardingCompletedAt: new Date(),
        languages: data.languages,
        selectedLanguageCode: normLang.code,
        selectedLanguageName: normLang.name,
        selectedCountryCode: normCountry.code,
        selectedCountryName: normCountry.name,
        preferredGenres: data.preferredGenres,
        favoriteArtists: data.favoriteArtists
      },
      create: {
        userId,
        onboardingCompleted: true,
        onboardingCompletedAt: new Date(),
        languages: data.languages,
        selectedLanguageCode: normLang.code,
        selectedLanguageName: normLang.name,
        selectedCountryCode: normCountry.code,
        selectedCountryName: normCountry.name,
        preferredGenres: data.preferredGenres,
        favoriteArtists: data.favoriteArtists
      }
    });

    // 3. Log onboarding event to UserActivityEvent
    await ActivityService.logEvent(userId, 'onboarding_completed', {
      languages: data.languages,
      preferredGenres: data.preferredGenres,
      artistCount: data.favoriteArtists.length,
      country: data.country,
      age: data.age
    });

    // 4. Invalidate personalized homepage cache so new preferences reflect immediately
    try {
      await HomeSectionsService.invalidateUserHomeCache(userId);
    } catch (e) {
      // Non-fatal
    }

    return reply.send({
      message: 'Preferences saved successfully',
      preferences: updatedPreferences
    });
  }

  /**
   * GET /api/preferences/artists/search?q=...
   */
  async searchArtists(req: FastifyRequest<{ Querystring: { q?: string; limit?: string } }>, reply: FastifyReply) {
    const query = req.query.q || '';
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit || '10', 10)));

    if (!query.trim()) {
      return reply.send([]);
    }

    const artists = await PreferencesService.searchArtists(query, limit);
    return reply.send(artists);
  }

  /**
   * GET /api/preferences/artists/suggested?languages=...&genres=...
   */
  async getSuggestedArtists(
    req: FastifyRequest<{ Querystring: { languages?: string; genres?: string } }>,
    reply: FastifyReply
  ) {
    const languages = req.query.languages ? req.query.languages.split(',').map(s => s.trim()) : [];
    const genres = req.query.genres ? req.query.genres.split(',').map(s => s.trim()) : [];

    const artists = await PreferencesService.getSuggestedArtists(languages, genres);
    return reply.send(artists);
  }

  /**
   * GET /api/preferences/metadata
   */
  async getMetadata(req: FastifyRequest, reply: FastifyReply) {
    return reply.send(PreferencesService.getMetadata());
  }

  /**
   * GET /api/preferences/languages
   * Get user or guest language preferences with browser pre-selection suggestions
   */
  async getLanguages(req: FastifyRequest, reply: FastifyReply) {
    const { VERIFIED_CATALOG_LANGUAGES, detectLanguagesFromAcceptHeader } = await import('../constants/languages.js');
    const userId = (req.user as any)?.id;
    let selectedLanguages: string[] = [];

    if (userId) {
      const prefs = await prisma.userPreferences.findUnique({
        where: { userId },
        select: { languages: true }
      });
      if (prefs?.languages && prefs.languages.length > 0) {
        selectedLanguages = prefs.languages;
      }
    }

    const acceptHeader = req.headers['accept-language'];
    const suggestedLanguages = detectLanguagesFromAcceptHeader(acceptHeader);

    return reply.send({
      languages: selectedLanguages,
      verifiedLanguages: VERIFIED_CATALOG_LANGUAGES,
      suggestedLanguages: suggestedLanguages.length > 0 ? suggestedLanguages : ['english']
    });
  }

  /**
   * PUT /api/preferences/languages
   * Strict validation: Whitelist, dedupe, 1 to 6 languages. Blocks a 7th.
   */
  async updateLanguages(req: FastifyRequest<{ Body: { languages?: string[] } }>, reply: FastifyReply) {
    const userId = (req.user as any)?.id;
    if (!userId) throw reply.server.httpErrors.unauthorized();

    const { normalizeCatalogLanguage } = await import('../constants/languages.js');
    const rawList = Array.isArray(req.body?.languages) ? req.body.languages : [];

    const validated: string[] = [];
    const seen = new Set<string>();

    for (const item of rawList) {
      const norm = normalizeCatalogLanguage(String(item));
      if (norm && !seen.has(norm)) {
        seen.add(norm);
        validated.push(norm);
      }
    }

    if (validated.length < 1) {
      return reply.status(400).send({
        error: 'Select at least 1 language.'
      });
    }

    if (validated.length > 6) {
      return reply.status(400).send({
        error: 'Maximum 6 languages allowed. Please deselect a language to choose another.'
      });
    }

    const updated = await prisma.userPreferences.upsert({
      where: { userId },
      update: {
        languages: validated,
        updatedAt: new Date()
      },
      create: {
        userId,
        languages: validated,
        updatedAt: new Date()
      }
    });

    // Invalidate home cache immediately so home updates on next fetch
    try {
      await HomeSectionsService.invalidateUserHomeCache(userId);
    } catch {}

    return reply.send({
      success: true,
      languages: updated.languages
    });
  }

  /**
   * POST /api/preferences/languages/merge
   * Merges guest localStorage languages into user account on login
   */
  async mergeGuestLanguages(req: FastifyRequest<{ Body: { languages?: string[] } }>, reply: FastifyReply) {
    const userId = (req.user as any)?.id;
    if (!userId) throw reply.server.httpErrors.unauthorized();

    const { normalizeCatalogLanguage } = await import('../constants/languages.js');
    const guestList = Array.isArray(req.body?.languages) ? req.body.languages : [];

    const existing = await prisma.userPreferences.findUnique({
      where: { userId },
      select: { languages: true }
    });

    const mergedSet = new Set<string>(existing?.languages || []);
    for (const item of guestList) {
      const norm = normalizeCatalogLanguage(String(item));
      if (norm && mergedSet.size < 6) {
        mergedSet.add(norm);
      }
    }

    const finalList = Array.from(mergedSet);
    if (finalList.length > 0) {
      await prisma.userPreferences.upsert({
        where: { userId },
        update: {
          languages: finalList,
          updatedAt: new Date()
        },
        create: {
          userId,
          languages: finalList,
          updatedAt: new Date()
        }
      });

      try {
        await HomeSectionsService.invalidateUserHomeCache(userId);
      } catch {}
    }

    return reply.send({
      success: true,
      languages: finalList
    });
  }
}
