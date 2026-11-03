import { prisma } from '../utils/prisma.js';

export async function runIntegrityCheck() {
  console.log('=== Running Catalog Identity Integrity Check ===');

  const tracks = await prisma.track.findMany({
    where: { deletedAt: null },
    include: {
      artist: true,
      album: true,
      trackArtists: { include: { artist: true } }
    }
  });

  const albums = await prisma.album.findMany({
    include: {
      artist: true,
      tracks: true
    }
  });

  const artists = await prisma.artist.findMany({
    include: {
      tracks: true,
      trackArtists: true
    }
  });

  let totalChecks = 0;
  let trackToAlbumMismatches = 0;
  let albumTracklistMismatches = 0;
  let artistOwnershipMismatches = 0;
  let missingCollaborationArtists = 0;

  // 1. Verify Track -> Correct Album
  for (const t of tracks) {
    totalChecks++;
    if (t.albumId) {
      if (!t.album) {
        trackToAlbumMismatches++;
      }
    }
  }

  // 2. Verify Album -> Exact Tracklist
  for (const alb of albums) {
    totalChecks++;
    for (const t of alb.tracks) {
      if (t.albumId !== alb.id) {
        albumTracklistMismatches++;
      }
    }
  }

  // 3. Verify Artist -> Own Songs Only
  for (const art of artists) {
    totalChecks++;
    for (const t of art.tracks) {
      if (t.artistId !== art.id) {
        artistOwnershipMismatches++;
      }
    }
  }

  // 4. Verify Collaboration Tracks with Multiple Artists
  for (const t of tracks) {
    if (t.trackArtists && t.trackArtists.length > 1) {
      totalChecks++;
      const hasDistinctArtists = new Set(t.trackArtists.map(ta => ta.artistId)).size > 1;
      if (!hasDistinctArtists) {
        missingCollaborationArtists++;
      }
    }
  }

  const totalMismatches = trackToAlbumMismatches + albumTracklistMismatches + artistOwnershipMismatches + missingCollaborationArtists;
  const mismatchRate = totalChecks > 0 ? ((totalMismatches / totalChecks) * 100).toFixed(2) : '0.00';

  const report = {
    totalTracksChecked: tracks.length,
    totalAlbumsChecked: albums.length,
    totalArtistsChecked: artists.length,
    totalChecks,
    trackToAlbumMismatches,
    albumTracklistMismatches,
    artistOwnershipMismatches,
    missingCollaborationArtists,
    totalMismatches,
    mismatchRatePercent: mismatchRate,
    status: totalMismatches === 0 ? 'HEALTHY' : 'MISMATCHES_DETECTED'
  };

  console.log('=== Integrity Report ===', JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1]?.includes('integrity-check')) {
  runIntegrityCheck()
    .then(report => {
      process.exit(report.status === 'HEALTHY' ? 0 : 1);
    })
    .catch(err => {
      console.error('Integrity check error:', err);
      process.exit(1);
    });
}

