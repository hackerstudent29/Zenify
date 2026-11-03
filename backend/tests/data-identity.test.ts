import assert from 'node:assert';
import { JioSaavnCatalogService } from '../src/services/jiosaavn-catalog.service.js';
import { DataIdentityService } from '../src/services/data-identity.service.js';
import { prisma } from '../src/utils/prisma.js';

/**
 * Zenify Data Identity & Canonical Provider Keys Acceptance Suite
 * Validates Phase 2 Requirements:
 * 1. Track -> correct album (FK matches, providerId matches, album details verified)
 * 2. Album -> exact tracklist (tracklist matches provider album ID, never inferred from name search)
 * 3. Artist -> own songs only (only genuine songs belonging to artist)
 * 4. Collaboration tracks with multiple artists (TrackArtist join table populated with roles)
 */
async function runDataIdentityTestSuite() {
  console.log('\n===============================================================');
  console.log('   ZENIFY DATA IDENTITY & CANONICAL KEYS TEST SUITE            ');
  console.log('===============================================================\n');

  let passed = 0;
  const total = 4;
  const catalog = new JioSaavnCatalogService();

  // FIXTURE DATA (Canonical IDs)
  const BEAST_ALBUM_ID = '34735026';
  const ARABIC_KUTHU_TRACK_ID = 'AgeRwxTb';
  const ANIRUDH_ARTIST_ID = '455663';

  // --------------------------------------------------------------------------
  // TEST 1: Track -> Correct Album
  // --------------------------------------------------------------------------
  try {
    console.log('Testing: Track -> Correct Album...');
    const track = await catalog.getTrack(ARABIC_KUTHU_TRACK_ID);
    assert(track !== null, 'Track should be found in catalog');
    assert.strictEqual(track.id, ARABIC_KUTHU_TRACK_ID);
    assert.strictEqual(track.albumId, BEAST_ALBUM_ID, 'Track should point to Beast album ID');
    assert.strictEqual(track.albumTitle, 'Beast', 'Track album title should be Beast');

    // Sync to DB and check relational FK
    const dbTrack = await DataIdentityService.syncTrack(track);
    assert(dbTrack.albumId !== null, 'Track in DB must have non-null albumId FK');

    const dbAlbum = await prisma.album.findUnique({ where: { id: dbTrack.albumId } });
    assert(dbAlbum !== null, 'Referenced album must exist in DB');
    assert.strictEqual(dbAlbum.providerId, BEAST_ALBUM_ID, 'Referenced DB album providerId must match');
    assert.strictEqual(dbAlbum.title, 'Beast');

    console.log('✅ Test 1 Passed: Track correctly maps to its canonical album in catalog and database FK.');
    passed++;
  } catch (err: any) {
    console.error('❌ Test 1 Failed:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Album -> Exact Tracklist
  // --------------------------------------------------------------------------
  try {
    console.log('Testing: Album -> Exact Tracklist...');
    const album = await catalog.getAlbum(BEAST_ALBUM_ID);
    assert(album !== null, 'Album should be found in catalog');
    assert.strictEqual(album.id, BEAST_ALBUM_ID);
    assert.strictEqual(album.title, 'Beast');
    assert.strictEqual(album.tracks.length, 5, 'Beast soundtrack must contain exactly 5 official tracks');

    const trackTitles = album.tracks.map(t => t.title);
    assert(trackTitles.some(t => t.includes('Arabic Kuthu')), 'Must include Arabic Kuthu');
    assert(trackTitles.some(t => t.includes('Jolly O Gymkhana')), 'Must include Jolly O Gymkhana');
    assert(trackTitles.some(t => t.includes('Beast Mode')), 'Must include Beast Mode');

    // All tracks must have the same albumId
    for (const t of album.tracks) {
      assert.strictEqual(t.albumId, BEAST_ALBUM_ID);
    }

    console.log('✅ Test 2 Passed: Album returns exact 5-track official tracklist without loose name inference.');
    passed++;
  } catch (err: any) {
    console.error('❌ Test 2 Failed:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Artist -> Own Songs Only
  // --------------------------------------------------------------------------
  try {
    console.log('Testing: Artist -> Own Songs Only...');
    const artist = await catalog.getArtist(ANIRUDH_ARTIST_ID);
    assert(artist !== null, 'Artist should be found in catalog');
    assert.strictEqual(artist.id, ANIRUDH_ARTIST_ID);
    assert.strictEqual(artist.name, 'Anirudh Ravichander');
    assert(artist.topSongs.length > 0, 'Artist must have top songs');
    assert(artist.imageUrl !== undefined && artist.imageUrl.length > 0, 'Artist must have image');

    // Every top song must have Anirudh in its artists array
    for (const song of artist.topSongs) {
      const hasAnirudh = song.artists.some(a => a.id === ANIRUDH_ARTIST_ID || a.name.includes('Anirudh'));
      assert(hasAnirudh, `Track "${song.title}" must belong to Anirudh Ravichander`);
    }

    console.log(`✅ Test 3 Passed: Artist returns ${artist.topSongs.length} verified songs belonging exclusively to Anirudh.`);
    passed++;
  } catch (err: any) {
    console.error('❌ Test 3 Failed:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Collaboration Tracks with Multiple Artists & TrackArtist Join Records
  // --------------------------------------------------------------------------
  try {
    console.log('Testing: Collaboration Tracks & TrackArtist relations...');
    const track = await catalog.getTrack(ARABIC_KUTHU_TRACK_ID);
    assert(track !== null);

    // Arabic Kuthu has Anirudh (composer/singer), Jonita Gandhi (singer), Sivakarthikeyan (lyricist), Vijay (starring)
    assert(track.artists.length >= 2, 'Collaboration track must have at least 2 distinct artists');

    const dbTrack = await DataIdentityService.syncTrack(track);
    const trackArtists = await prisma.trackArtist.findMany({
      where: { trackId: dbTrack.id },
      include: { artist: true },
      orderBy: { order: 'asc' }
    });

    assert(trackArtists.length >= 2, 'Database must have TrackArtist join records');
    const artistNames = trackArtists.map(ta => ta.artist.name);
    assert(artistNames.some(n => n.includes('Anirudh')), 'Anirudh must be in TrackArtist join table');
    assert(artistNames.some(n => n.includes('Jonita')), 'Jonita Gandhi must be in TrackArtist join table');

    const roles = trackArtists.map(ta => ta.role);
    assert(roles.includes('primary') || roles.includes('singer') || roles.includes('music'), 'Must have specific artist roles');

    console.log(`✅ Test 4 Passed: Collaboration track has ${trackArtists.length} TrackArtist entries with distinct roles: [${roles.join(', ')}].`);
    passed++;
  } catch (err: any) {
    console.error('❌ Test 4 Failed:', err.message);
  }

  console.log('\n===============================================================');
  console.log(`   DATA IDENTITY SUITE COMPLETE: ${passed}/${total} PASSED     `);
  console.log('===============================================================\n');

  await prisma.$disconnect();
  if (passed !== total) {
    process.exit(1);
  }
}

runDataIdentityTestSuite().catch(async (e) => {
  console.error('FATAL TEST ERROR:', e);
  await prisma.$disconnect();
  process.exit(1);
});

