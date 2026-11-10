// backend/prisma/seed_insights.ts
import { prisma } from '../src/utils/prisma';
import {
  isQualifiedPlay,
  isSkip,
  clampListenedMs,
  getLocalTimeBuckets,
} from '../src/services/listening-analytics';
import { ListeningService } from '../src/services/listening.service';

const CATALOG_TRACKS = [
  {
    trackId: 'track_katchi_sera',
    title: 'Katchi Sera',
    artist: 'Sai Abhyankkar',
    album: 'Think Indie',
    language: 'Tamil',
    genre: 'Pop',
    durationMs: 184000,
  },
  {
    trackId: 'track_hukum',
    title: 'Hukum - Thalaivar Alappara',
    artist: 'Anirudh Ravichander',
    album: 'Jailer',
    language: 'Tamil',
    genre: 'Soundtrack',
    durationMs: 207000,
  },
  {
    trackId: 'track_naa_ready',
    title: 'Naa Ready',
    artist: 'Anirudh Ravichander',
    album: 'Leo',
    language: 'Tamil',
    genre: 'Soundtrack',
    durationMs: 248000,
  },
  {
    trackId: 'track_aaradhya',
    title: 'Aaradhya',
    artist: 'Sid Sriram',
    album: 'Kushi',
    language: 'Telugu',
    genre: 'Romance',
    durationMs: 285000,
  },
  {
    trackId: 'track_blinding_lights',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    album: 'After Hours',
    language: 'English',
    genre: 'Synthwave',
    durationMs: 200000,
  },
  {
    trackId: 'track_starboy',
    title: 'Starboy',
    artist: 'The Weeknd',
    album: 'Starboy',
    language: 'English',
    genre: 'R&B',
    durationMs: 230000,
  },
  {
    trackId: 'track_hosanna',
    title: 'Hosanna',
    artist: 'A.R. Rahman',
    album: 'Vinnaithaandi Varuvaayaa',
    language: 'Tamil',
    genre: 'Soundtrack',
    durationMs: 330000,
  },
  {
    trackId: 'track_nenjukkul_peidhidum',
    title: 'Nenjukkul Peidhidum',
    artist: 'Harris Jayaraj',
    album: 'Vaaranam Aayiram',
    language: 'Tamil',
    genre: 'Soundtrack',
    durationMs: 370000,
  },
  {
    trackId: 'track_cruel_summer',
    title: 'Cruel Summer',
    artist: 'Taylor Swift',
    album: 'Lover',
    language: 'English',
    genre: 'Pop',
    durationMs: 178000,
  },
  {
    trackId: 'track_kesariya',
    title: 'Kesariya',
    artist: 'Arijit Singh',
    album: 'Brahmastra',
    language: 'Hindi',
    genre: 'Bollywood',
    durationMs: 268000,
  },
];

async function seed90DaysInsights() {
  console.log('\n--- Seeding 90 Days of Realistic Listening Insights (Fast Bulk Pipeline) ---');

  const user = await prisma.user.findFirst();
  if (!user) {
    console.error('No user found in database to seed insights for.');
    return;
  }

  const userId = user.id;
  console.log(`Target User: ${user.email} (${userId})`);

  // Clear previous test events cleanly
  await prisma.listeningEventArtist.deleteMany({ where: { userId } });
  await prisma.listeningEvent.deleteMany({ where: { userId } });
  await prisma.userArtistStat.deleteMany({ where: { userId } });
  await prisma.userHourlyStat.deleteMany({ where: { userId } });

  const now = new Date();
  const rawEvents: any[] = [];
  const artistLinks: any[] = [];

  const artistAggs = new Map<string, { artistName: string; plays: number; listenedMs: bigint; first: Date; last: Date }>();
  const hourlyAggs = new Map<string, { dow: number; hour: number; listenedMs: bigint }>();

  // Generate 90 days backwards
  for (let dayOffset = 89; dayOffset >= 0; dayOffset--) {
    const dayDate = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000);
    const dayOfWeek = dayDate.getDay();

    const basePlays = dayOfWeek === 5 || dayOfWeek === 6 ? 12 : 6;
    const sessionCount = dayOfWeek === 5 ? 3 : 2;

    for (let s = 0; s < sessionCount; s++) {
      const hour = s === 0 ? 9 : (dayOfWeek === 5 ? 23 : 21);
      const minute = Math.floor(Math.random() * 30);

      const sessionStartTime = new Date(dayDate);
      sessionStartTime.setHours(hour, minute, 0, 0);

      const tracksInSession = Math.floor(basePlays / sessionCount) + (Math.random() > 0.5 ? 1 : 0);
      let currentCursor = new Date(sessionStartTime);

      for (let t = 0; t < tracksInSession; t++) {
        // Skew selection towards Anirudh and A.R. Rahman
        const trackIdx = Math.random() < 0.45
          ? (Math.random() < 0.5 ? 1 : 2) // Anirudh
          : Math.floor(Math.random() * CATALOG_TRACKS.length);

        const track = CATALOG_TRACKS[trackIdx];
        const isSkipEvent = Math.random() < 0.08;
        const rawDuration = isSkipEvent
          ? 5000 + Math.floor(Math.random() * 4000)
          : track.durationMs - Math.floor(Math.random() * 10000);

        const listenedMs = clampListenedMs(rawDuration, track.durationMs);
        const qualified = isQualifiedPlay(listenedMs, track.durationMs);
        const skip = isSkip(rawDuration, isSkipEvent ? 'skipped' : 'completed');

        const startedAt = new Date(currentCursor);
        const endedAt = new Date(currentCursor.getTime() + listenedMs);
        const eventId = `seed_${dayOffset}_${s}_${t}_${Date.now()}`;

        rawEvents.push({
          userId,
          eventId,
          startedAt,
          endedAt,
          tzOffsetMin: 330, // IST
          listenedMs,
          trackDurationMs: track.durationMs,
          endReason: isSkipEvent ? 'skipped' : 'completed',
          trackSource: 'home',
          trackId: track.trackId,
          trackTitle: track.title,
          trackAlbum: track.album,
          language: track.language,
          genre: track.genre,
          contextType: 'album',
          contextId: track.album,
          offline: false,
          quality: 320,
          qualified,
          isSkip: skip,
          completed: !isSkipEvent,
        });

        artistLinks.push({
          userId,
          eventId,
          artistKey: track.artist,
          artistName: track.artist,
          isPrimary: true,
        });

        if (qualified) {
          // In-memory Artist Aggregates
          const existingArt = artistAggs.get(track.artist) || {
            artistName: track.artist,
            plays: 0,
            listenedMs: BigInt(0),
            first: startedAt,
            last: endedAt,
          };
          existingArt.plays += 1;
          existingArt.listenedMs += BigInt(listenedMs);
          if (startedAt < existingArt.first) existingArt.first = startedAt;
          if (endedAt > existingArt.last) existingArt.last = endedAt;
          artistAggs.set(track.artist, existingArt);

          // In-memory Hourly Aggregates (Local time)
          const { dow, hour } = getLocalTimeBuckets(startedAt, 330);
          const hourKey = `${dow}_${hour}`;
          const existingHour = hourlyAggs.get(hourKey) || {
            dow,
            hour,
            listenedMs: BigInt(0),
          };
          existingHour.listenedMs += BigInt(listenedMs);
          hourlyAggs.set(hourKey, existingHour);
        }

        currentCursor = new Date(endedAt.getTime() + 10000);
      }
    }
  }

  console.log(`Generated ${rawEvents.length} events. Performing high-speed bulk insert...`);

  // Bulk insert raw listening events
  await prisma.listeningEvent.createMany({ data: rawEvents });
  console.log(`- Inserted ${rawEvents.length} listening_events.`);

  // Bulk insert artist links
  await prisma.listeningEventArtist.createMany({ data: artistLinks });
  console.log(`- Inserted ${artistLinks.length} listening_event_artists.`);

  // Bulk insert UserArtistStats
  const artistStatsData = Array.from(artistAggs.entries()).map(([key, val]) => ({
    userId,
    artistKey: key,
    artistName: val.artistName,
    plays: val.plays,
    listenedMs: val.listenedMs,
    firstPlayed: val.first,
    lastPlayed: val.last,
  }));
  await prisma.userArtistStat.createMany({ data: artistStatsData });
  console.log(`- Inserted ${artistStatsData.length} user_artist_stats.`);

  // Bulk insert UserHourlyStats
  const hourlyStatsData = Array.from(hourlyAggs.values()).map((h) => ({
    userId,
    dow: h.dow,
    hour: h.hour,
    listenedMs: h.listenedMs,
  }));
  await prisma.userHourlyStat.createMany({ data: hourlyStatsData });
  console.log(`- Inserted ${hourlyStatsData.length} user_hourly_stats.`);

  console.log('\n--- Fetching Verification Insights ---');
  const insights = await ListeningService.getInsights(userId, 'month');
  console.log(`Total Plays (Last 30 Days): ${insights.totalPlays}`);
  console.log(`Total Listening Time: ${insights.totalListeningMinutes} minutes`);
  console.log(`Active Days: ${insights.activeDays} days`);
  console.log(`Current Streak: ${insights.streakDays} days`);
  console.log(`Music Persona: ${insights.musicPersonality?.title} ("${insights.musicPersonality?.subtitle}")`);
  console.log(`Top Artist: ${insights.topArtists?.[0]?.artistName} (${insights.topArtists?.[0]?.plays} plays, ${insights.topArtists?.[0]?.percentage}% share)`);
  console.log(`Top Track: ${insights.topTracks?.[0]?.trackTitle} (${insights.topTracks?.[0]?.plays} plays)`);
  console.log(`Heatmap Insight: ${insights.heatmapInsight}`);
  console.log('--------------------------------------------------\n');
}

seed90DaysInsights()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  });
