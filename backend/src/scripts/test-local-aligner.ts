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
    console.log('[LocalAlignerTest] Fetching a test track with lyrics and audioUrl...');
    
    // Find a track that has both plain lyrics and audioUrl
    const track = await prisma.track.findFirst({
        where: {
            lyrics: { not: null },
            audioUrl: { startsWith: 'http' },
            deletedAt: null
        },
        select: { id: true, title: true, audioUrl: true, lyrics: true, language: true }
    });

    if (!track || !track.lyrics) {
        console.error('[LocalAlignerTest] ❌ No suitable test track found in database with both lyrics and audioUrl!');
        process.exit(1);
    }

    console.log(`[LocalAlignerTest] Found track: "${track.title}" (${track.language})`);
    
    // Setup temp paths
    const tempDir = os.tmpdir();
    const fileId = `test-align-${Date.now()}`;
    const tempAudioPath = path.join(tempDir, `${fileId}.mp3`);
    const tempLyricsPath = path.join(tempDir, `${fileId}.txt`);

    try {
        console.log(`[LocalAlignerTest] Downloading test audio from R2: ${track.audioUrl.slice(0, 80)}...`);
        const response = await axios({
            method: 'get',
            url: track.audioUrl,
            responseType: 'stream',
            timeout: 30000,
        });

        const writer = fs.createWriteStream(tempAudioPath);
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        console.log('[LocalAlignerTest] Audio downloaded successfully.');

        // Write plain lyrics text
        console.log('[LocalAlignerTest] Writing plain lyrics to temporary file...');
        const plainLyrics = track.lyrics.replace(/\[\d{2}:\d{2}.*?\]/g, '').trim(); // strip any LRC formatting if present
        fs.writeFileSync(tempLyricsPath, plainLyrics, 'utf-8');

        // Path to aligner.py
        const alignerPath = path.join(process.cwd(), 'aligner.py');
        const langCode = track.language === 'tamil' ? 'ta-IN' : 'en-US';

        console.log(`[LocalAlignerTest] Running Python aligner script on ${os.platform()}...`);
        console.log(`[LocalAlignerTest] Command: python "${alignerPath}" "${tempAudioPath}" "${tempLyricsPath}" "${langCode}"`);

        const start = Date.now();
        const { stdout, stderr } = await execPromise(`python "${alignerPath}" "${tempAudioPath}" "${tempLyricsPath}" "${langCode}"`);
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);

        if (stderr) {
            console.log(`[LocalAlignerTest] Python Stderr Log:\n${stderr}`);
        }

        const alignedData = JSON.parse(stdout);
        if (alignedData.error) {
            throw new Error(alignedData.error);
        }

        console.log(`\n[LocalAlignerTest] ✅ SUCCESS! Local alignment completed in ${elapsed}s.`);
        console.log(`[LocalAlignerTest] Aligned lines returned: ${alignedData.length}`);
        
        console.log('\nSnippet of aligned output (First 5 lines):');
        alignedData.slice(0, 5).forEach((line: any, idx: number) => {
            console.log(`  [${line.time}s]: "${line.text}"`);
        });

    } catch (err: any) {
        console.error('[LocalAlignerTest] ❌ ERROR: Local aligner test failed!');
        console.error(`[LocalAlignerTest] Details: ${err.message}`);
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
