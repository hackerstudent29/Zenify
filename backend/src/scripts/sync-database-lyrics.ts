import { prisma } from '../utils/prisma';
import { LyricsSyncService } from '../services/lyrics-sync.service';

async function main() {
    try {
        console.log("Starting database lyrics and language sync script...");

        // 1. Fetch all tracks in the database
        const tracks = await prisma.track.findMany({
            include: {
                artist: true
            }
        });

        console.log(`Found ${tracks.length} tracks in database.`);

        for (const track of tracks) {
            console.log(`\n--------------------------------------------------`);
            console.log(`Processing: "${track.title}" by ${track.artist.name}`);
            
            // Detect and update language
            const songLang = await LyricsSyncService.detectSongLanguage(track.title, track.artist.name, track.lyrics || undefined);
            console.log(`Detected language: ${songLang}`);

            const updateData: any = {
                language: songLang
            };

            // Re-sync specific tracks or if they have 0 synced lyrics
            const isStarboyAlbum = track.title.toLowerCase().includes('starboy') ||
                                  track.title.toLowerCase().includes('sidewalks') ||
                                  track.title.toLowerCase().includes('stargirl') ||
                                  track.title.toLowerCase().includes('party monster') ||
                                  track.title.toLowerCase().includes('false alarm') ||
                                  track.title.toLowerCase().includes('reminder') ||
                                  track.title.toLowerCase().includes('six feet under') ||
                                  track.title.toLowerCase().includes('secrets');

            const needsSync = !track.synced_lyrics || 
                              (Array.isArray(track.synced_lyrics) && track.synced_lyrics.length === 0) || 
                              isStarboyAlbum ||
                              track.title.toLowerCase().includes('timeless') ||
                              track.title.toLowerCase().includes('raga of revenge');

            if (needsSync) {
                console.log(`Track needs sync. Running getSyncedLyrics...`);
                try {
                    const synced = await LyricsSyncService.getSyncedLyrics(
                        track.title,
                        track.artist.name,
                        track.audioUrl,
                        track.lyrics || undefined,
                        track.duration
                    );

                    if (synced && synced.syncedTokens && synced.syncedTokens.length > 0) {
                        updateData.synced_lyrics = synced.syncedTokens;
                        updateData.raw_lrc = synced.rawLrc || null;
                        console.log(`Successfully synced! Lines count: ${synced.syncedTokens.length}`);
                    } else {
                        console.warn(`Sync returned no tokens.`);
                    }
                } catch (syncErr: any) {
                    console.error(`Sync error for "${track.title}":`, syncErr.message);
                }
            }

            // If we didn't re-sync, but the track already has synced lyrics with Genius contributor headers, clean it!
            if (!updateData.synced_lyrics && track.synced_lyrics && Array.isArray(track.synced_lyrics)) {
                let modified = false;
                const cleanedLyrics = (track.synced_lyrics as any[]).map((line: any) => {
                    const originalText = line.text || '';
                    const cleanedText = LyricsSyncService.cleanLyricsText(originalText);
                    if (cleanedText !== originalText) {
                        modified = true;
                    }
                    return {
                        ...line,
                        text: cleanedText
                    };
                }).filter(line => line.text.trim().length > 0); // Filter out empty lines if any

                if (modified) {
                    updateData.synced_lyrics = cleanedLyrics;
                    console.log(`Cleaned Genius contributor text from existing synced lyrics.`);
                }
            }

            // Save updates to database
            await prisma.track.update({
                where: { id: track.id },
                data: updateData
            });
            console.log(`Updated database record for "${track.title}".`);
        }

        console.log(`\n==================================================`);
        console.log("Database lyrics and language sync completed successfully!");

    } catch (e: any) {
        console.error("Script failed:", e.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
