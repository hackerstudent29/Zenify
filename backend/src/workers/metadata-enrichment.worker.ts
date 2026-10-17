import { prisma } from '../utils/prisma';
import { CountryLanguageService, ResolvedSongMetadata } from '../services/country-language.service';

export interface MetadataAuditReport {
  totalAudited: number;
  successfullyEnriched: number;
  previouslyComplete: number;
  needsReview: number;
  unresolved: number;
  failed: number;
  details: {
    countryDistribution: Record<string, number>;
    languageDistribution: Record<string, number>;
  };
}

export class MetadataEnrichmentWorker {
  private static isRunning = false;
  private static readonly BATCH_SIZE = 25;
  private static readonly MAX_ATTEMPTS = 3;

  /**
   * Continuous background enrichment step.
   * Finds pending, missing, or review-needed tracks and enriches them.
   */
  static async runEnrichmentCycle(): Promise<{ processed: number; enriched: number; failed: number }> {
    if (this.isRunning) {
      console.log('[MetadataEnrichmentWorker] Worker is already running. Skipping concurrent invocation.');
      return { processed: 0, enriched: 0, failed: 0 };
    }

    this.isRunning = true;
    let processed = 0;
    let enriched = 0;
    let failed = 0;

    try {
      // 1. Select eligible tracks:
      // Priority 1: Unverified or missing country/language
      // Priority 2: Needs review
      const eligibleTracks = await prisma.track.findMany({
        where: {
          deletedAt: null,
          OR: [
            { countryCode: null },
            { languageCode: null },
            { metadataStatus: 'pending' },
            { metadataStatus: 'needs_review' },
            { metadataStatus: null }
          ]
        },
        select: {
          id: true,
          title: true,
          isrc: true,
          language: true,
          region: true,
          lyrics: true,
          countryCode: true,
          countryName: true,
          languageCode: true,
          languageName: true,
          languages: true,
          artist: { select: { name: true } }
        },
        take: this.BATCH_SIZE,
        orderBy: { createdAt: 'desc' }
      });

      if (eligibleTracks.length === 0) {
        return { processed: 0, enriched: 0, failed: 0 };
      }

      console.log(`[MetadataEnrichmentWorker] Processing batch of ${eligibleTracks.length} tracks...`);

      for (const track of eligibleTracks) {
        processed++;
        try {
          // Research song metadata across sources
          const resolved: ResolvedSongMetadata = await CountryLanguageService.researchTrackMetadata({
            title: track.title,
            artistName: track.artist?.name,
            isrc: track.isrc,
            existingLanguage: track.language,
            existingRegion: track.region,
            lyrics: track.lyrics
          });

          // Only update country/language if resolution has sufficient confidence
          await prisma.track.update({
            where: { id: track.id },
            data: {
              countryCode: resolved.countryCode || track.countryCode,
              countryName: resolved.countryName || track.countryName,
              languageCode: resolved.languageCode || track.languageCode,
              languageName: resolved.languageName || track.languageName,
              languages: resolved.languages.length > 0 ? resolved.languages : (track.languages.length > 0 ? track.languages : []),
              metadataSource: resolved.metadataSource,
              metadataConfidence: resolved.metadataConfidence,
              metadataStatus: resolved.metadataStatus,
              metadataUpdatedAt: new Date()
            }
          });

          if (resolved.metadataStatus === 'verified') {
            enriched++;
          }
        } catch (err: any) {
          failed++;
          console.warn(`[MetadataEnrichmentWorker] Error enriching track ${track.id} ("${track.title}"):`, err.message);
          
          await prisma.track.update({
            where: { id: track.id },
            data: {
              metadataStatus: 'failed',
              metadataUpdatedAt: new Date()
            }
          }).catch(() => {});
        }
      }

      console.log(`[MetadataEnrichmentWorker] Cycle completed. Processed: ${processed}, Enriched: ${enriched}, Failed: ${failed}`);
      return { processed, enriched, failed };
    } catch (globalErr: any) {
      console.error('[MetadataEnrichmentWorker] Fatal error in cycle:', globalErr);
      return { processed, enriched, failed };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Full historical catalog audit & backfill pipeline.
   * Processes all tracks in batches, records metrics, and produces a complete audit report.
   */
  static async runFullCatalogBackfill(onProgress?: (progress: { current: number; total: number }) => void): Promise<MetadataAuditReport> {
    console.log('[MetadataEnrichmentWorker] Starting full historical catalog backfill...');

    const totalTracks = await prisma.track.count({ where: { deletedAt: null } });
    let cursor: string | undefined = undefined;
    let totalAudited = 0;
    let successfullyEnriched = 0;
    let previouslyComplete = 0;
    let needsReview = 0;
    let unresolved = 0;
    let failed = 0;

    const countryDist: Record<string, number> = {};
    const langDist: Record<string, number> = {};

    const BATCH = 50;

    while (totalAudited < totalTracks) {
      const batch = await prisma.track.findMany({
        where: { deletedAt: null },
        take: BATCH,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
        select: {
          id: true,
          title: true,
          isrc: true,
          language: true,
          region: true,
          lyrics: true,
          countryCode: true,
          countryName: true,
          languageCode: true,
          languageName: true,
          languages: true,
          metadataStatus: true,
          metadataConfidence: true,
          artist: { select: { name: true } }
        },
        orderBy: { id: 'asc' }
      });

      if (batch.length === 0) break;

      cursor = batch[batch.length - 1].id;

      for (const track of batch) {
        totalAudited++;
        if (onProgress) onProgress({ current: totalAudited, total: totalTracks });

        // If track is already verified with high confidence, record and skip
        if (track.countryCode && track.languageCode && track.metadataStatus === 'verified' && (track.metadataConfidence || 0) >= 0.85) {
          previouslyComplete++;
          countryDist[track.countryCode] = (countryDist[track.countryCode] || 0) + 1;
          langDist[track.languageCode] = (langDist[track.languageCode] || 0) + 1;
          continue;
        }

        try {
          const resolved = await CountryLanguageService.researchTrackMetadata({
            title: track.title,
            artistName: track.artist?.name,
            isrc: track.isrc,
            existingLanguage: track.language,
            existingRegion: track.region,
            lyrics: track.lyrics
          });

          await prisma.track.update({
            where: { id: track.id },
            data: {
              countryCode: resolved.countryCode,
              countryName: resolved.countryName,
              languageCode: resolved.languageCode,
              languageName: resolved.languageName,
              languages: resolved.languages,
              metadataSource: resolved.metadataSource,
              metadataConfidence: resolved.metadataConfidence,
              metadataStatus: resolved.metadataStatus,
              metadataUpdatedAt: new Date()
            }
          });

          if (resolved.metadataStatus === 'verified') {
            successfullyEnriched++;
            if (resolved.countryCode) countryDist[resolved.countryCode] = (countryDist[resolved.countryCode] || 0) + 1;
            if (resolved.languageCode) langDist[resolved.languageCode] = (langDist[resolved.languageCode] || 0) + 1;
          } else if (resolved.metadataStatus === 'needs_review') {
            needsReview++;
          } else {
            unresolved++;
          }
        } catch (e: any) {
          failed++;
          console.warn(`[MetadataEnrichmentWorker] Backfill track error for "${track.title}":`, e.message);
        }
      }
    }

    const report: MetadataAuditReport = {
      totalAudited,
      successfullyEnriched,
      previouslyComplete,
      needsReview,
      unresolved,
      failed,
      details: {
        countryDistribution: countryDist,
        languageDistribution: langDist
      }
    };

    console.log('[MetadataEnrichmentWorker] Backfill complete! Report:', JSON.stringify(report, null, 2));
    return report;
  }
}
