import { prisma } from '../utils/prisma.js';
import { jiosaavnCatalog } from '../services/jiosaavn-catalog.service.js';
import { DataIdentityService } from '../services/data-identity.service.js';

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

export async function runBackfill(batchSize = 25) {
  console.log('=== Starting Idempotent Backfill for Canonical IDs & TrackArtist ===');
  let repairedArtists = 0;
  let repairedAlbums = 0;
  let repairedTracks = 0;

  // 1. Repair Artists without providerId
  const artists = await prisma.artist.findMany({
    where: { providerId: null },
    take: batchSize
  });

  console.log(`Found ${artists.length} artists lacking providerId.`);
  for (const art of artists) {
    try {
      const searchRes = await jiosaavnCatalog.search(art.name, 'in', 3);
      const targetNorm = art.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = searchRes.artists.find(a => {
        const aNorm = a.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return aNorm === targetNorm || aNorm.includes(targetNorm) || targetNorm.includes(aNorm);
      });

      if (match && match.id) {
        await prisma.artist.update({
          where: { id: art.id },
          data: {
            providerId: match.id,
            provider: 'jiosaavn',
            imageUrl: match.imageUrl || art.imageUrl
          }
        });
        repairedArtists++;
      }
    } catch (err: any) {
      console.warn(`[Backfill] Failed to repair artist "${art.name}":`, err.message);
    }
    await sleep(60); // Rate-limiting guard
  }

  // 2. Repair Albums without providerId
  const albums = await prisma.album.findMany({
    where: { providerId: null },
    include: { artist: true },
    take: batchSize
  });

  console.log(`Found ${albums.length} albums lacking providerId.`);
  for (const alb of albums) {
    try {
      const query = `${alb.title} ${alb.artist.name}`.trim();
      const searchRes = await jiosaavnCatalog.search(query, 'in', 5);
      const targetTitleNorm = alb.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = searchRes.albums.find(a => {
        const aNorm = a.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        return aNorm === targetTitleNorm || aNorm.includes(targetTitleNorm) || targetTitleNorm.includes(aNorm);
      });

      if (match && match.id) {
        await prisma.album.update({
          where: { id: alb.id },
          data: {
            providerId: match.id,
            provider: 'jiosaavn',
            coverUrl: match.coverUrl || alb.coverUrl
          }
        });
        repairedAlbums++;
      }
    } catch (err: any) {
      console.warn(`[Backfill] Failed to repair album "${alb.title}":`, err.message);
    }
    await sleep(60);
  }

  // 3. Repair Tracks without providerId or without TrackArtist records
  const tracks = await prisma.track.findMany({
    where: {
      OR: [
        { providerId: null },
        { trackArtists: { none: {} } }
      ]
    },
    include: { artist: true, album: true, trackArtists: true },
    take: batchSize
  });

  console.log(`Found ${tracks.length} tracks needing repair.`);
  for (const tr of tracks) {
    try {
      const query = `${tr.title} ${tr.artist.name}`.trim();
      const searchRes = await jiosaavnCatalog.search(query, 'in', 5);
      const targetTitleNorm = tr.title.toLowerCase().replace(/[^a-z0-9]/g, '');

      const match = searchRes.tracks.find(t => {
        const tNorm = t.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        const durationMatch = Math.abs(t.duration - tr.duration) <= 15;
        return (tNorm === targetTitleNorm || tNorm.includes(targetTitleNorm)) && durationMatch;
      });

      if (match) {
        // Update track canonical providerId and audioUrl if missing
        await prisma.track.update({
          where: { id: tr.id },
          data: {
            providerId: match.id,
            provider: 'jiosaavn',
            audioUrl: match.audioUrl || tr.audioUrl,
            duration: tr.duration || match.duration
          }
        });

        // Ensure TrackArtist relations exist
        for (let i = 0; i < match.artists.length; i++) {
          const a = match.artists[i];
          const dbArtist = await DataIdentityService.syncArtist(a);
          const role = a.role || (i === 0 ? 'primary' : 'featured');

          await prisma.trackArtist.upsert({
            where: {
              trackId_artistId_role: {
                trackId: tr.id,
                artistId: dbArtist.id,
                role
              }
            },
            update: { order: i },
            create: {
              trackId: tr.id,
              artistId: dbArtist.id,
              role,
              order: i
            }
          });
        }
        repairedTracks++;
      }
    } catch (err: any) {
      console.warn(`[Backfill] Failed to repair track "${tr.title}":`, err.message);
    }
    await sleep(60);
  }

  console.log(`=== Backfill complete: Repaired ${repairedArtists} artists, ${repairedAlbums} albums, ${repairedTracks} tracks. ===`);
  return { repairedArtists, repairedAlbums, repairedTracks };
}

if (process.argv[1]?.includes('backfill-canonical-ids')) {
  runBackfill(50)
    .then(stats => {
      console.log('Backfill stats:', stats);
      process.exit(0);
    })
    .catch(err => {
      console.error('Backfill error:', err);
      process.exit(1);
    });
}

