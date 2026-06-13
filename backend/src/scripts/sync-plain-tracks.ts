import { prisma } from '../utils/prisma.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const execPromise = promisify(exec);

async function main() {
    console.log('[SyncPlainTracks] Querying database for tracks with plain lyrics but no synced timestamps...');
    
    // Find tracks that have plain text lyrics, a valid audioUrl, and no sync_source
    const tracks = await prisma.track.findMany({
        where: {
            lyrics: { not: null },
            audioUrl: { startsWith: 'http' },
            deletedAt: null,
            sync_source: null
        },
        select: { id: true, title: true, audioUrl: true, lyrics: true, language: true, duration: true, synced_lyrics: true, sync_source: true },
        take: 5
    });

    if (tracks.length === 0) {
        console.log('[SyncPlainTracks] No tracks found with sync_source = null. Searching for any track with plain lyrics...');
        // Fallback: search for any track with plain lyrics
        const anyTrack = await prisma.track.findFirst({
            where: {
                lyrics: { not: null },
                audioUrl: { startsWith: 'http' },
                deletedAt: null
            },
            select: { id: true, title: true, audioUrl: true, lyrics: true, language: true, duration: true, synced_lyrics: true, sync_source: true }
        });
        
        if (!anyTrack) {
            console.error('[SyncPlainTracks] ❌ No tracks found in the database with lyrics and audioUrl!');
            process.exit(1);
        }
        tracks.push(anyTrack);
    }

    // Pick the first track
    let targetTrack = tracks[0];

    console.log(`[SyncPlainTracks] Selected track for alignment: "${targetTrack.title}" (ID: ${targetTrack.id}, Language: ${targetTrack.language})`);
    if (targetTrack.sync_source) {
        console.log(`[SyncPlainTracks] Note: This track already has synced lyrics (source: ${targetTrack.sync_source}). We will overwrite it.`);
    }

    const tempDir = os.tmpdir();
    const fileId = `sync-run-${Date.now()}`;
    const tempAudioPath = path.join(tempDir, `${fileId}.mp3`);
    const tempLyricsPath = path.join(tempDir, `${fileId}.txt`);

    try {
        console.log(`[SyncPlainTracks] Downloading audio: ${targetTrack.audioUrl.slice(0, 80)}...`);
        const response = await axios({
            method: 'get',
            url: targetTrack.audioUrl,
            responseType: 'stream',
            timeout: 45000,
        });

        const writer = fs.createWriteStream(tempAudioPath);
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        console.log('[SyncPlainTracks] Audio downloaded successfully.');

        // Clean plain lyrics (remove any existing timestamps to be safe)
        const plainLyrics = targetTrack.lyrics!.replace(/\[\d{2}:\d{2}.*?\]/g, '').trim();
        fs.writeFileSync(tempLyricsPath, plainLyrics, 'utf-8');

        const alignerPath = path.join(process.cwd(), 'aligner.py');
        const langCode = targetTrack.language === 'tamil' ? 'ta-IN' : 'en-US';

        console.log(`[SyncPlainTracks] Spawning Python forced-aligner...`);
        console.log(`[SyncPlainTracks] Command: python "${alignerPath}" "${tempAudioPath}" "${tempLyricsPath}" "${langCode}"`);

        const start = Date.now();
        const { stdout, stderr } = await execPromise(`python "${alignerPath}" "${tempAudioPath}" "${tempLyricsPath}" "${langCode}"`);
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);

        if (stderr) {
            console.log(`[SyncPlainTracks] Python Stderr Log:\n${stderr}`);
        }

        const alignedData = JSON.parse(stdout);
        if (alignedData.error) {
            throw new Error(alignedData.error);
        }

        console.log(`[SyncPlainTracks] Aligned lines returned: ${alignedData.length}`);

        // Construct raw LRC string
        const syncedTokens = alignedData.map((item: any) => ({
            time: Number(item.time) || 0,
            text: String(item.text).trim()
        }));

        const rawLrc = syncedTokens.map((line: any) => {
            const m = Math.floor(line.time / 60);
            const s = Math.floor(line.time % 60);
            const ms = Math.floor((line.time % 1) * 100);
            return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}] ${line.text}`;
        }).join('\n');

        console.log(`[SyncPlainTracks] Saving synced lyrics to database with source LOCAL_ALIGNER...`);
        
        await prisma.track.update({
            where: { id: targetTrack.id },
            data: {
                synced_lyrics: syncedTokens as any,
                raw_lrc: rawLrc,
                sync_source: 'LOCAL_ALIGNER'
            }
        });

        console.log(`\n[SyncPlainTracks] 🎉 SUCCESS! Database updated successfully for "${targetTrack.title}"!`);
        console.log(`[SyncPlainTracks] Elapsed time: ${elapsed}s.`);
        
        console.log('\nSample of updated database synced_lyrics (First 5 lines):');
        syncedTokens.slice(0, 5).forEach((line: any, idx: number) => {
            console.log(`  [${line.time}s]: "${line.text}"`);
        });

    } catch (err: any) {
        console.error('[SyncPlainTracks] ❌ ERROR: Sync process failed!');
        console.error(`[SyncPlainTracks] Details: ${err.message}`);
    } finally {
        // Cleanup temp files
        try {
            if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);
            if (fs.existsSync(tempLyricsPath)) fs.unlinkSync(tempLyricsPath);
        } catch {}
        await prisma.$disconnect();
    }
}

main().catch(console.error);
