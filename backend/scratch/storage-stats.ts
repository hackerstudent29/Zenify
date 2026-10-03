import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

function formatBytes(bytes: number): string {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

async function main() {
  console.log('------------------------------------------------------------');
  console.log('     ZENIFY CLOUD DB & STORAGE CONSUMPTION REPORT           ');
  console.log('------------------------------------------------------------\n');

  try {
    const tracks = await prisma.track.findMany({
      select: {
        id: true,
        title: true,
        duration: true,
        audioUrl: true,
        coverUrl: true,
        createdAt: true,
        artist: {
          select: { name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (tracks.length === 0) {
      console.log('⚠️  No tracks found in Zenify Cloud DB.');
      return;
    }

    let totalAudioBytes = 0;
    let totalCoverBytes = 0;
    let totalDurationSec = 0;

    const trackBreakdown = tracks.map((t, idx) => {
      const durSec = t.duration || 0;
      totalDurationSec += durSec;

      // High-fidelity 128kbps AAC/MP3 audio payload = 16 KB/sec
      const estAudioBytes = durSec * 16 * 1024;
      // High-res HD Cover artwork = ~150 KB
      const estCoverBytes = t.coverUrl ? 150 * 1024 : 0;
      const totalTrackBytes = estAudioBytes + estCoverBytes;

      totalAudioBytes += estAudioBytes;
      totalCoverBytes += estCoverBytes;

      return {
        index: idx + 1,
        id: t.id,
        title: t.title,
        artist: t.artist?.name || 'Unknown Artist',
        duration: formatDuration(durSec),
        audioSize: formatBytes(estAudioBytes),
        coverSize: formatBytes(estCoverBytes),
        totalSize: formatBytes(totalTrackBytes),
        rawBytes: totalTrackBytes,
      };
    });

    const totalSystemBytes = totalAudioBytes + totalCoverBytes;
    const avgSongBytes = totalSystemBytes / tracks.length;

    console.log(`📊 TOTAL CLOUD DB STATISTICS:`);
    console.log(`   - Total Songs Saved in Cloud DB : ${tracks.length}`);
    console.log(`   - Total Audio Duration           : ${formatDuration(totalDurationSec)} (${Math.round(totalDurationSec / 60)} minutes)`);
    console.log(`   - Total Audio Payload            : ${formatBytes(totalAudioBytes)}`);
    console.log(`   - Total Cover Art Payload        : ${formatBytes(totalCoverBytes)}`);
    console.log(`   - TOTAL CLOUD DB STORAGE CONSUMED: ${formatBytes(totalSystemBytes)}`);
    console.log(`   - Average Storage Per Song       : ${formatBytes(avgSongBytes)}\n`);

    console.log(`🎵 INDIVIDUAL SONG STORAGE BREAKDOWN:`);
    console.log('-----------------------------------------------------------------------------------------');
    console.log('| #   | Title                             | Artist               | Duration | Size in Cloud DB |');
    console.log('-----------------------------------------------------------------------------------------');

    trackBreakdown.forEach((item) => {
      const padTitle = item.title.padEnd(33).slice(0, 33);
      const padArtist = item.artist.padEnd(20).slice(0, 20);
      const padDur = item.duration.padEnd(8);
      const padSize = item.totalSize.padEnd(16);
      const padIdx = String(item.index).padEnd(3);

      console.log(`| ${padIdx} | ${padTitle} | ${padArtist} | ${padDur} | ${padSize} |`);
    });

    console.log('-----------------------------------------------------------------------------------------\n');
  } catch (err) {
    console.error('❌ Error executing Cloud DB storage stats query:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
