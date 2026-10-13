import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../utils/prisma';
import { CountryLanguageService } from '../services/country-language.service';
import { COUNTRIES, MUSIC_LANGUAGES } from '../constants/metadata.constants';
import { getCacheVal, setCacheVal } from '../utils/cache';
import { HomeSectionsService } from '../services/home-sections.service';

function formatTrackItem(track: any) {
  return {
    id: track.id,
    title: track.title,
    duration: track.duration,
    coverUrl: track.coverUrl,
    imageUrl: track.coverUrl,
    audioUrl: track.audioUrl,
    countryCode: track.countryCode,
    countryName: track.countryName,
    languageCode: track.languageCode,
    languageName: track.languageName,
    languages: track.languages || [],
    metadataStatus: track.metadataStatus,
    metadataConfidence: track.metadataConfidence,
    releaseDate: track.releaseDate,
    streamCount: track.streamCount,
    artistName: track.artist?.name || 'Unknown Artist',
    albumTitle: track.album?.title || '',
    artist: {
      id: track.artist?.id || '',
      name: track.artist?.name || 'Unknown Artist',
      imageUrl: track.artist?.imageUrl || track.coverUrl
    },
    album: track.album ? {
      id: track.album.id,
      title: track.album.title,
      coverUrl: track.album.coverUrl
    } : undefined
  };
}

export class DiscoveryController {
  /**
   * GET /api/discover/tracks
   * Strict country AND language music discovery with RapidAPI dynamic catalog enrichment.
   */
  async discoverTracks(
    req: FastifyRequest<{
      Querystring: {
        country?: string;
        language?: string;
        category?: 'all' | 'popular' | 'new_releases' | 'recommended';
        page?: string;
        limit?: string;
      };
    }>,
    reply: FastifyReply
  ) {
    const { country, language, category = 'all' } = req.query;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    // Both filters are strictly required
    if (!country || !language) {
      return reply.status(400).send({
        error: 'Both country and language are strictly required',
        message: 'Please provide both country (ISO 3166-1) and language (ISO 639-1) parameters for music discovery.'
      });
    }

    const normCountry = CountryLanguageService.normalizeCountry(country);
    const normLang = CountryLanguageService.normalizeLanguage(language);

    if (!normCountry) {
      return reply.status(400).send({
        error: 'Invalid country parameter',
        message: `Could not resolve country: "${country}". Please use a valid ISO 3166-1 alpha-2 country code or standard name.`
      });
    }

    if (!normLang) {
      return reply.status(400).send({
        error: 'Invalid language parameter',
        message: `Could not resolve language: "${language}". Please use a valid ISO 639-1 language code or standard name.`
      });
    }

    // Cache key containing all dimensions
    const cacheKey = `discover:tracks:${normCountry.code}:${normLang.code}:${category}:${page}:${limit}`;
    const cached = await getCacheVal(cacheKey);
    if (cached) {
      return reply.send(cached);
    }

    const baseWhere: any = {
      deletedAt: null,
      releaseStatus: 'PUBLISHED',
      countryCode: normCountry.code,
      OR: [
        { languageCode: normLang.code },
        { languages: { has: normLang.code } }
      ],
      metadataStatus: 'verified'
    };

    // Check count in database
    let totalCount = await prisma.track.count({ where: baseWhere });

    // RAPID API INGESTION:
    // If fewer than 10 tracks exist locally for this country + language combination,
    // trigger on-demand RapidAPI catalog discovery to ingest authentic, relatable songs!
    if (totalCount < 10) {
      try {
        console.log(`[DiscoveryController] Catalog for ${normCountry.name} (${normLang.name}) has only ${totalCount} tracks. Triggering RapidAPI discovery...`);
        await CountryLanguageService.discoverAndIngestForCountryLanguage(normCountry.code, normLang.code, 20);
        // Recount after ingestion
        totalCount = await prisma.track.count({ where: baseWhere });
      } catch (ingestErr: any) {
        console.warn('[DiscoveryController] RapidAPI discovery warn:', ingestErr.message);
      }
    }

    // Ordering strategy based on category
    let orderBy: any = [{ streams: 'desc' }, { trendingScore: 'desc' }];
    if (category === 'new_releases') {
      orderBy = [{ releaseDate: 'desc' }, { createdAt: 'desc' }];
    } else if (category === 'popular') {
      orderBy = [{ streams: 'desc' }, { createdAt: 'desc' }];
    } else if (category === 'recommended') {
      orderBy = [{ trendingScore: 'desc' }, { streams: 'desc' }];
    }

    const tracks = await prisma.track.findMany({
      where: baseWhere,
      skip,
      take: limit,
      orderBy,
      include: {
        artist: true,
        album: true
      }
    });

    const response = {
      country: normCountry,
      language: normLang,
      category,
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit) || 0,
      items: tracks.map(formatTrackItem),
      message: tracks.length === 0 ? 'No verified songs are available for this country and language yet.' : undefined
    };

    await setCacheVal(cacheKey, response, 600); // 10 minutes cache
    return reply.send(response);
  }

  /**
   * GET /api/discover/sections
   * Returns verified country and language homepage sections:
   * 1. From Your Country
   * 2. Popular in Your Language
   * 3. Discover Your Music
   * 4. New Releases from Your Country
   */
  async getDiscoverSections(
    req: FastifyRequest<{
      Querystring: {
        country?: string;
        language?: string;
      };
    }>,
    reply: FastifyReply
  ) {
    const userId = (req.user as any)?.id;
    let countryCode = req.query.country;
    let languageCode = req.query.language;

    // If not supplied in query, fallback to user's saved preferences
    if ((!countryCode || !languageCode) && userId) {
      const prefs = await prisma.userPreferences.findUnique({ where: { userId } });
      if (prefs) {
        countryCode = countryCode || prefs.selectedCountryCode || undefined;
        languageCode = languageCode || prefs.selectedLanguageCode || undefined;
      }
    }

    if (!countryCode || !languageCode) {
      return reply.send({
        sections: [],
        configured: false,
        message: 'Please select both a country and a language to view personalized discovery shelves.'
      });
    }

    const normCountry = CountryLanguageService.normalizeCountry(countryCode);
    const normLang = CountryLanguageService.normalizeLanguage(languageCode);

    if (!normCountry || !normLang) {
      return reply.send({
        sections: [],
        configured: false,
        message: 'Invalid country or language selection.'
      });
    }

    const cacheKey = `discover:sections:${normCountry.code}:${normLang.code}:${userId || 'anon'}`;
    const cached = await getCacheVal(cacheKey);
    if (cached) {
      return reply.send(cached);
    }

    const baseWhere: any = {
      deletedAt: null,
      releaseStatus: 'PUBLISHED',
      countryCode: normCountry.code,
      OR: [
        { languageCode: normLang.code },
        { languages: { has: normLang.code } }
      ],
      metadataStatus: 'verified'
    };

    // Ensure catalog has songs for this combination via RapidAPI if sparse
    const count = await prisma.track.count({ where: baseWhere });
    if (count < 10) {
      try {
        await CountryLanguageService.discoverAndIngestForCountryLanguage(normCountry.code, normLang.code, 20);
      } catch (e) {}
    }

    // Query Sections with strict dual filtering
    const [popular, newReleases, fromCountry, discoverSet] = await Promise.all([
      // Popular in Your Language
      prisma.track.findMany({
        where: baseWhere,
        take: 10,
        orderBy: [{ streams: 'desc' }, { trendingScore: 'desc' }],
        include: { artist: true, album: true }
      }),

      // New Releases from Your Country
      prisma.track.findMany({
        where: baseWhere,
        take: 10,
        orderBy: [{ releaseDate: 'desc' }, { createdAt: 'desc' }],
        include: { artist: true, album: true }
      }),

      // From Your Country
      prisma.track.findMany({
        where: baseWhere,
        take: 10,
        orderBy: [{ trendingScore: 'desc' }, { createdAt: 'desc' }],
        include: { artist: true, album: true }
      }),

      // Discover Your Music (Personalized / Diversified)
      prisma.track.findMany({
        where: baseWhere,
        take: 10,
        orderBy: [{ createdAt: 'desc' }, { streams: 'desc' }],
        include: { artist: true, album: true }
      })
    ]);

    const sections = [];

    if (fromCountry.length > 0) {
      sections.push({
        id: 'from_your_country',
        title: `From ${normCountry.name}`,
        subtitle: `VERIFIED AUTHENTIC SONGS FROM ${normCountry.name.toUpperCase()} IN ${normLang.name.toUpperCase()}`,
        items: fromCountry.map(formatTrackItem)
      });
    }

    if (popular.length > 0) {
      sections.push({
        id: 'popular_in_language',
        title: `Popular in ${normLang.name}`,
        subtitle: `TOP STREAMED HITS IN ${normLang.name.toUpperCase()} FROM ${normCountry.name.toUpperCase()}`,
        items: popular.map(formatTrackItem)
      });
    }

    if (discoverSet.length > 0) {
      sections.push({
        id: 'discover_your_music',
        title: `Discover Your Music`,
        subtitle: `HANDPICKED FOR YOUR TASTE IN ${normLang.name.toUpperCase()}`,
        items: discoverSet.map(formatTrackItem)
      });
    }

    if (newReleases.length > 0) {
      sections.push({
        id: 'new_releases_country',
        title: `New Releases from ${normCountry.name}`,
        subtitle: `FRESH TRACKS SUNG IN ${normLang.name.toUpperCase()}`,
        items: newReleases.map(formatTrackItem)
      });
    }

    const payload = {
      country: normCountry,
      language: normLang,
      configured: true,
      sections
    };

    await setCacheVal(cacheKey, payload, 600);
    return reply.send(payload);
  }

  /**
   * GET /api/preferences/country-language
   * Returns current user's preferences and standardized reference metadata.
   */
  async getPreferences(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as any)?.id;
    let selectedCountry = null;
    let selectedLanguage = null;

    if (userId) {
      const prefs = await prisma.userPreferences.findUnique({ where: { userId } });
      if (prefs?.selectedCountryCode) {
        selectedCountry = {
          code: prefs.selectedCountryCode,
          name: prefs.selectedCountryName || prefs.selectedCountryCode
        };
      }
      if (prefs?.selectedLanguageCode) {
        selectedLanguage = {
          code: prefs.selectedLanguageCode,
          name: prefs.selectedLanguageName || prefs.selectedLanguageCode
        };
      }
    }

    return reply.send({
      selectedCountry,
      selectedLanguage,
      countries: COUNTRIES,
      languages: MUSIC_LANGUAGES
    });
  }

  /**
   * PUT /api/preferences/country-language
   * Saves preferred country and language to UserPreferences.
   */
  async updatePreferences(
    req: FastifyRequest<{
      Body: {
        countryCode?: string;
        languageCode?: string;
      };
    }>,
    reply: FastifyReply
  ) {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Authentication required to save preferences' });
    }

    const { countryCode, languageCode } = req.body;
    let normCountry = null;
    let normLang = null;

    if (countryCode) {
      normCountry = CountryLanguageService.normalizeCountry(countryCode);
      if (!normCountry) {
        return reply.status(400).send({ error: 'Invalid country code provided' });
      }
    }

    if (languageCode) {
      normLang = CountryLanguageService.normalizeLanguage(languageCode);
      if (!normLang) {
        return reply.status(400).send({ error: 'Invalid language code provided' });
      }
    }

    const updated = await prisma.userPreferences.upsert({
      where: { userId },
      update: {
        selectedCountryCode: normCountry ? normCountry.code : null,
        selectedCountryName: normCountry ? normCountry.name : null,
        selectedLanguageCode: normLang ? normLang.code : null,
        selectedLanguageName: normLang ? normLang.name : null
      },
      create: {
        userId,
        selectedCountryCode: normCountry ? normCountry.code : null,
        selectedCountryName: normCountry ? normCountry.name : null,
        selectedLanguageCode: normLang ? normLang.code : null,
        selectedLanguageName: normLang ? normLang.name : null
      }
    });

    // Invalidate user cache
    await HomeSectionsService.invalidateUserHomeCache(userId).catch(() => {});

    return reply.send({
      message: 'Discovery preferences saved successfully',
      country: normCountry,
      language: normLang,
      preferences: updated
    });
  }
}
