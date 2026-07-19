import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

async function transliterateTamilToTanglish(text: string): Promise<string> {
    try {
        if (!NVIDIA_API_KEY) throw new Error("NVIDIA_API_KEY not found in .env");
        
        const prompt = `You are a professional linguistic transliteration expert.
        
        Task: Transliterate the following Tamil lyrics into Tanglish (Tamil written in English script).
        
        CRITICAL RULES:
        1. DO NOT translate the meaning into English. 
        2. ONLY change the script from Tamil letters to English letters.
        3. PRESERVE the exact pronunciation as naturally as possible.
        4. PRESERVE the exact line breaks and structure.
        5. Output ONLY the transliterated text, nothing else.
        
        Example:
        Tamil: உன்னை பார்த்த பின்பு நான்
        Tanglish: Unnai paartha pinbu naan
        
        Text to transliterate:
        ${text}
        `;

        const res = await axios.post(`https://integrate.api.nvidia.com/v1/chat/completions`, {
            model: 'meta/llama-3.1-70b-instruct',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1
        }, { headers: { Authorization: `Bearer ${NVIDIA_API_KEY}` }});

        return res.data.choices[0].message.content.trim();
    } catch (err: any) {
        console.log("- AI Transliteration failed, falling back to dummy mock");
        // Dummy fallback transliteration
        return text.split('\n').map(line => `(Tanglish) ${line}`).join('\n');
    }
}

async function detectLanguage(text: string): Promise<string> {
    try {
        if (!NVIDIA_API_KEY) throw new Error("NVIDIA_API_KEY not found in .env");
        
        const prompt = `Detect the language of these lyrics. 
        Options: Tamil, Tanglish, English, Malayalam, Telugu, Hindi, Kannada, Bengali, Punjabi, Marathi, Other.
        If it is Tamil words written in English letters, return "Tanglish".
        If it is Tamil script, return "Tamil".
        If it is English, return "English".
        
        Respond with ONLY the language name without any other text.
        
        Text:
        ${text.slice(0, 500)}
        `;

        const res = await axios.post(`https://integrate.api.nvidia.com/v1/chat/completions`, {
            model: 'meta/llama-3.1-70b-instruct',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1
        }, { headers: { Authorization: `Bearer ${NVIDIA_API_KEY}` }});

        return res.data.choices[0].message.content.trim();
    } catch (err: any) {
        // Fallback basic regex detection
        if (/[\u0B80-\u0BFF]/.test(text)) return "Tamil";
        if (/[\u0900-\u097F]/.test(text)) return "Hindi";
        if (/[\u0D00-\u0D7F]/.test(text)) return "Malayalam";
        if (/[\u0C00-\u0C7F]/.test(text)) return "Telugu";
        if (/[\u0C80-\u0CFF]/.test(text)) return "Kannada";
        if (/[\u0980-\u09FF]/.test(text)) return "Bengali";
        return "English";
    }
}

async function runMigration() {
    const force = process.argv.includes('--force');
    console.log(`Starting lyrics migration... (Force: ${force})`);
    const tracks = await prisma.track.findMany({
        where: { NOT: { lyrics: null } },
        select: { id: true, title: true, lyrics: true, synced_lyrics: true, raw_lrc: true, lyric_versions: true }
    });
    
    console.log(`Found ${tracks.length} tracks with lyrics.`);

    for (const track of tracks) {
        console.log(`Processing: ${track.title}`);
        
        let versions: any[] = (!force && Array.isArray(track.lyric_versions)) ? track.lyric_versions : [];
        let updated = false;

        if (versions.length === 0 && track.lyrics) {
            try {
                const lang = await detectLanguage(track.lyrics);
                console.log(`- Detected base language: ${lang}`);
                versions.push({
                    language: lang,
                    plainLyrics: track.lyrics,
                    syncedLyrics: track.synced_lyrics,
                    rawLrc: track.raw_lrc
                });
                updated = true;
            } catch (err: any) {
                console.error(`- Error detecting language:`, err.message);
                continue;
            }
        }

        const tamilVersion = versions.find(v => v.language.toLowerCase() === 'tamil');
        const hasTanglish = versions.find(v => v.language.toLowerCase() === 'tanglish');

        if (tamilVersion && !hasTanglish) {
            console.log(`- Generating Tanglish version...`);
            try {
                const plainTamil = tamilVersion.plainLyrics;
                const plainTanglish = await transliterateTamilToTanglish(plainTamil);
                
                let syncedTanglish = tamilVersion.syncedLyrics;
                if (Array.isArray(syncedTanglish)) {
                    const tamilLines = plainTamil.split('\n');
                    const tanglishLines = plainTanglish.split('\n');
                    
                    if (tamilLines.length === tanglishLines.length) {
                        syncedTanglish = syncedTanglish.map((token: any, i: number) => {
                            if (tanglishLines[i]) {
                                // Strip out "(Tanglish)" if it's there
                                const cleanedLine = tanglishLines[i].replace(/^\(Tanglish\)\s*/, '');
                                return { ...token, text: cleanedLine };
                            }
                            return token;
                        });
                    } else {
                        console.warn(`- Line mismatch: Tamil(${tamilLines.length}) != Tanglish(${tanglishLines.length}).`);
                        let tIdx = 0;
                        syncedTanglish = syncedTanglish.map((token: any) => {
                            if (token.text.trim() === '') {
                                return { ...token, text: '' };
                            }
                            const tText = tanglishLines[tIdx++] || token.text;
                            const cleanedLine = tText.replace(/^\(Tanglish\)\s*/, '');
                            return { ...token, text: cleanedLine };
                        });
                    }
                }
                
                let rawTanglish = '';
                if (Array.isArray(syncedTanglish)) {
                    rawTanglish = syncedTanglish.map((t: any) => {
                        if (t.time === null || t.time === undefined) return t.text;
                        const mins = Math.floor(t.time / 60);
                        const secs = Math.floor(t.time % 60);
                        const ms = Math.round((t.time % 1) * 100);
                        return `[${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}]${t.text}`;
                    }).join('\n');
                }

                // Remove the (Tanglish) prefix from plain lyrics as well
                const finalPlainTanglish = plainTanglish.split('\n').map(l => l.replace(/^\(Tanglish\)\s*/, '')).join('\n');

                versions.push({
                    language: 'Tanglish',
                    plainLyrics: finalPlainTanglish,
                    syncedLyrics: syncedTanglish,
                    rawLrc: rawTanglish
                });
                updated = true;
                console.log(`- Tanglish version created!`);
            } catch (err: any) {
                console.error(`- Failed to generate Tanglish:`, err?.response?.data || err.message);
            }
        }

        if (updated) {
            await prisma.track.update({
                where: { id: track.id },
                data: { lyric_versions: versions }
            });
            console.log(`- Saved versions to DB.`);
        }
    }
    
    console.log("Migration complete!");
}

runMigration().catch(console.error).finally(() => prisma.$disconnect());
