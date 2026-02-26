import axios from 'axios';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { promisify } from 'util';
import cloudinary from '../utils/cloudinary';

const execPromise = promisify(exec);

export interface ExtractedMetadata {
    title: string;
    artist: string;
    cover: string;
    album?: string;
    genre?: string;
    audioUrl?: string;
    error?: string;
    duration?: number;
    isCollection?: boolean;
    tracks?: Array<{
        title: string;
        artist: string;
        duration?: number;
        trackNumber?: number;
        isPlaceholder?: boolean;
    }>;
    bpm?: number;
    key?: string;
    composers?: string;
    featuredArtists?: string;
    lyrics?: string;
    description?: string;
}

export class ExternalMetadataService {
    static async fetchFromUrl(url: string): Promise<ExtractedMetadata> {
        let metadata: ExtractedMetadata = {
            title: '',
            artist: '',
            cover: '',
        };

        const isUrl = url.startsWith('http');

        if (!isUrl) {
            // Treat as search query "Artist - Title"
            if (url.includes(' - ')) {
                const parts = url.split(' - ');
                metadata.title = parts[1].trim();
                metadata.artist = parts[0].trim();
            } else {
                metadata.title = url;
            }
            return metadata;
        }

        try {
            // Priority 1A: YouTube / YouTube Music API
            if (url.includes('youtube.com') || url.includes('youtu.be')) {
                try {
                    const isPlaylist = url.includes('list=');

                    if (isPlaylist) {
                        const command = `python -m yt_dlp --dump-json --flat-playlist "${url}"`;
                        const { stdout } = await execPromise(command);

                        const lines = stdout.trim().split('\n');
                        const videos = lines.map(line => {
                            try { return JSON.parse(line); } catch { return null; }
                        }).filter(v => v);

                        if (videos.length > 0) {
                            // Extract playlist info from the first entry if available
                            metadata.isCollection = true;
                            // Set a generic playlist title, can use the first track's uploader as artist
                            metadata.title = "YouTube Playlist";
                            metadata.artist = videos[0].uploader || "Various Artists";

                            // Get playlist cover art from the first video
                            if (videos[0].thumbnails && videos[0].thumbnails.length > 0) {
                                metadata.cover = videos[0].thumbnails[videos[0].thumbnails.length - 1].url;
                            }

                            metadata.tracks = videos.map((v, i) => {
                                // Clean up title (remove "Official Video", etc)
                                let cleanTitle = v.title || `Track ${i + 1}`;
                                cleanTitle = cleanTitle.replace(/\[.*?\]/g, '').replace(/\(Official.*?\)/ig, '').trim();

                                return {
                                    title: cleanTitle,
                                    artist: v.uploader || metadata.artist,
                                    duration: v.duration || 0,
                                    trackNumber: i + 1
                                };
                            });
                        }
                    } else {
                        // Individual track
                        const command = `python -m yt_dlp --dump-json "${url}"`;
                        const { stdout } = await execPromise(command);
                        const video = JSON.parse(stdout);

                        metadata.title = video.track || video.title.replace(/\[.*?\]/g, '').replace(/\(Official.*?\)/ig, '').trim();
                        metadata.artist = video.artist || video.uploader || "Unknown Artist";
                        metadata.album = video.album || undefined;
                        metadata.duration = video.duration;

                        // Extract cover art
                        if (video.thumbnails && video.thumbnails.length > 0) {
                            metadata.cover = video.thumbnails[video.thumbnails.length - 1].url;
                        } else if (video.thumbnail) {
                            metadata.cover = video.thumbnail;
                        }

                        // Try to parse description for lyrics/info
                        if (video.description) {
                            metadata.description = video.description.substring(0, 500); // Truncate
                        }
                    }
                } catch (ytErr) {
                    console.warn('YouTube scraping failed:', ytErr);
                }
            }

            // Priority 1: Apple Music iTunes API (Very Reliable)
            else if (url.includes('music.apple.com')) {
                try {
                    const isPlaylist = url.includes('/playlist/');
                    const trackIdMatch = url.match(/[?&]i=(\d+)/);
                    const collectionIdMatch = url.match(/\/id(\d+)/) || url.match(/\/album\/[^\/]+\/(\d+)/);

                    const countryMatch = url.match(/apple\.com\/([a-z]{2})\//);
                    const country = countryMatch ? countryMatch[1] : 'us';

                    if (trackIdMatch) {
                        const id = trackIdMatch[1];
                        const itunesRes = await axios.get(`https://itunes.apple.com/lookup?id=${id}&country=${country}`, { timeout: 5000 });
                        if (itunesRes.data.results && itunesRes.data.results[0]) {
                            const result = itunesRes.data.results[0];
                            metadata.title = result.trackName || '';
                            metadata.artist = result.artistName || '';
                            metadata.cover = (result.artworkUrl100 || '').replace('100x100bb', '800x800bb');
                            metadata.album = result.collectionName;
                            metadata.genre = result.primaryGenreName;

                            // --- Featured Artists extraction from artist name ---
                            const artistName = result.artistName || '';
                            if (artistName.includes(' & ')) {
                                const artists = artistName.split(' & ').map((a: string) => a.trim());
                                metadata.artist = artists[0]; // Primary artist
                                metadata.featuredArtists = artists.slice(1).join(', ');
                            } else if (artistName.includes(', ')) {
                                const artists = artistName.split(', ').map((a: string) => a.trim());
                                metadata.artist = artists[0];
                                metadata.featuredArtists = artists.slice(1).join(', ');
                            }

                            // --- Extract "feat." from title ---
                            if (metadata.title.toLowerCase().includes(' feat. ')) {
                                const featParts = metadata.title.split(/ feat\. /i);
                                metadata.title = featParts[0].trim();
                                const featArtists = featParts[1].replace(/[()]/g, '').split(' & ').join(', ');
                                metadata.featuredArtists = metadata.featuredArtists
                                    ? `${metadata.featuredArtists}, ${featArtists}`
                                    : featArtists;
                            } else if (metadata.title.toLowerCase().includes('(feat.')) {
                                const featParts = metadata.title.split(/\(feat\.\s*/i);
                                metadata.title = featParts[0].trim();
                                const featArtists = featParts[1].replace(')', '').split(' & ').join(', ');
                                metadata.featuredArtists = metadata.featuredArtists
                                    ? `${metadata.featuredArtists}, ${featArtists}`
                                    : featArtists;
                            }

                            // --- Auto-generate track description ---
                            const descParts: string[] = [];
                            if (result.collectionName) descParts.push(`From the album "${result.collectionName}"`);
                            if (result.primaryGenreName) descParts.push(`Genre: ${result.primaryGenreName}`);
                            if (result.releaseDate) {
                                const releaseDate = new Date(result.releaseDate);
                                descParts.push(`Released: ${releaseDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
                            }
                            if (result.trackTimeMillis) {
                                const mins = Math.floor(result.trackTimeMillis / 60000);
                                const secs = Math.floor((result.trackTimeMillis % 60000) / 1000);
                                descParts.push(`Duration: ${mins}:${secs.toString().padStart(2, '0')}`);
                                metadata.duration = Math.floor(result.trackTimeMillis / 1000);
                            }
                            metadata.description = descParts.join(' · ');
                        }
                    } else if (collectionIdMatch && !isPlaylist) {
                        // Album Fetch
                        const id = collectionIdMatch[1];
                        const itunesRes = await axios.get(`https://itunes.apple.com/lookup?id=${id}&country=${country}&entity=song`, { timeout: 8000 });
                        if (itunesRes.data.results && itunesRes.data.results.length > 0) {
                            const albumInfo = itunesRes.data.results.find((r: any) => r.wrapperType === 'collection');
                            const tracks = itunesRes.data.results.filter((r: any) => r.wrapperType === 'track');

                            if (albumInfo) {
                                metadata.title = albumInfo.collectionName;
                                metadata.artist = albumInfo.artistName;
                                metadata.cover = (albumInfo.artworkUrl100 || '').replace('100x100bb', '1000x1000bb');
                                metadata.genre = albumInfo.primaryGenreName;
                                metadata.isCollection = true;
                                metadata.tracks = tracks.map((t: any) => ({
                                    title: t.trackName,
                                    artist: t.artistName,
                                    duration: Math.floor(t.trackTimeMillis / 1000),
                                    trackNumber: t.trackNumber
                                }));
                            }
                        }
                    }

                    // --- Scrape Apple Music page for BPM, Key, Composers ---
                    // Even if iTunes API worked, we try scraping the page for extra metadata
                    try {
                        const pageRes = await axios.get(url, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                'Accept-Language': 'en-US,en;q=0.9',
                            },
                            timeout: 8000,
                        });
                        const html = pageRes.data;

                        // BPM from page JSON
                        const bpmMatch = html.match(/["']bpm["']\s*:\s*(\d+)/i);
                        if (bpmMatch) metadata.bpm = parseInt(bpmMatch[1]);

                        // Musical Key from page JSON
                        const keyMatch = html.match(/["']key["']\s*:\s*["']([^"']+)["']/i);
                        if (keyMatch) metadata.key = keyMatch[1];

                        // Composers from page credits
                        const composerMatch = html.match(/["']composers["']\s*:\s*\[([^\]]+)\]/i);
                        if (composerMatch) {
                            metadata.composers = composerMatch[1].replace(/["']/g, '').split(',').map((s: string) => s.trim()).join(', ');
                        }

                        // Apple Music specific credits section
                        const creditsMatch = html.match(/class="song-credits"[^>]*>([\s\S]+?)<\/div>/i);
                        if (creditsMatch && !metadata.composers) {
                            const creditsText = creditsMatch[1].replace(/<[^>]+>/g, ' ').trim();
                            if (creditsText.toLowerCase().includes('writer') || creditsText.toLowerCase().includes('composer')) {
                                metadata.composers = creditsText;
                            }
                        }

                        // JSON-LD for composers
                        const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]+?)<\/script>/);
                        if (jsonLdMatch && !metadata.composers) {
                            try {
                                const ld = JSON.parse(jsonLdMatch[1]);
                                if (ld.workExample && ld.workExample[0]) {
                                    const creators = ld.workExample[0].creator?.map((c: any) => c.name).join(', ');
                                    if (creators) metadata.composers = creators;
                                }
                            } catch (e) { }
                        }

                        // Try to get description from meta
                        const descMatch = html.match(/name=["']description["']\s+content=["']([^"']+)["']/i) ||
                            html.match(/property=["']og:description["']\s+content=["']([^"']+)["']/i);
                        if (descMatch && !metadata.description) {
                            metadata.description = descMatch[1];
                        }
                    } catch (scrapeErr) {
                        console.warn('Apple Music page scrape failed (non-critical):', (scrapeErr as any).message);
                    }
                } catch (apiErr) {
                    console.warn('iTunes API failed, falling back to scraper:', apiErr);
                }
            }

            // Global Cleanups
            const decode = (str: string) => str
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .replace(/&#39;/g, "'")
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&apos;/g, "'")
                .replace(/\u00A0/g, ' '); // Non-breaking space

            // Priority 2: Generic Scraper (for Spotify and Fallbacks) - Only run if title not found yet
            if (!metadata.title) {
                const response = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    },
                    timeout: 8000
                });
                const html = response.data;

                const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ||
                    html.match(/<title>([^<]+)<\/title>/)?.[1];
                const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
                const ogType = html.match(/<meta property="og:type" content="([^"]+)"/)?.[1];
                const ogDesc = html.match(/<meta property="og:description" content="([^"]+)"/)?.[1];

                metadata.cover = metadata.cover || ogImage || '';
                if (ogType?.includes('music.album') || ogType?.includes('music.playlist') || url.includes('/album/') || url.includes('/playlist/')) {
                    metadata.isCollection = true;
                }

                if (url.includes('spotify.com')) {
                    const cleanTitle = ogTitle ? ogTitle.split(' | Spotify')[0] : '';
                    if (cleanTitle.includes(' - ')) {
                        const parts = cleanTitle.split(' - ');
                        metadata.title = parts[0].trim();
                        metadata.artist = parts[parts.length - 1].replace(/album by /i, '').replace(/playlist by /i, '').trim();
                    } else {
                        metadata.title = cleanTitle;
                    }

                    // Extract Featured Artists from title
                    if (metadata.title.toLowerCase().includes(' feat. ')) {
                        const featParts = metadata.title.split(/ feat\. /i);
                        metadata.title = featParts[0].trim();
                        metadata.featuredArtists = featParts[1].split(' & ').join(', ');
                    } else if (metadata.title.toLowerCase().includes(' (feat. ')) {
                        const featParts = metadata.title.split(/ \(feat\. /i);
                        metadata.title = featParts[0].trim();
                        metadata.featuredArtists = featParts[1].replace(')', '').split(' & ').join(', ');
                    }

                    const composerMatch = html.match(/["']composers["']\s*:\s*\[([^\]]+)\]/i);
                    if (composerMatch) {
                        metadata.composers = composerMatch[1].replace(/["']/g, '').split(',').map((s: string) => s.trim()).join(', ');
                    }

                    // Attempt to extract BPM/Key if available in hidden JSON
                    const bpmMatch = html.match(/["']bpm["']\s*:\s*(\d+)/i);
                    if (bpmMatch) metadata.bpm = parseInt(bpmMatch[1]);

                    const keyMatch = html.match(/["']key["']\s*:\s*["']([^"']+)["']/i);
                    if (keyMatch) metadata.key = keyMatch[1];

                    // Extract track count - more robust regex
                    if (ogDesc) {
                        const decodedDesc = decode(ogDesc);
                        const trackCountMatch = decodedDesc.match(/(\d+)[\s\u00A0,]+(songs?|tracks?)/i);
                        if (trackCountMatch && metadata.isCollection) {
                            const count = parseInt(trackCountMatch[1]);
                            if (count > 0 && (!metadata.tracks || metadata.tracks.length === 0)) {
                                metadata.tracks = Array(count).fill(null).map((_, i) => ({
                                    title: `Track ${i + 1}`,
                                    artist: metadata.artist || 'Unknown Artist',
                                    isPlaceholder: true,
                                }));
                            }
                        }
                    }

                    // Priority 3: JSON-LD Parsing (Highly reliable)
                    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]+?)<\/script>/);
                    if (jsonLdMatch) {
                        try {
                            const ld = JSON.parse(jsonLdMatch[1]);
                            if (ld.workExample && ld.workExample[0]) {
                                metadata.composers = ld.workExample[0].creator?.map((c: any) => c.name).join(', ');
                            }
                        } catch (e) { }
                    }
                } else if (url.includes('music.apple.com')) {
                    if (ogTitle?.includes(' by ')) {
                        const parts = ogTitle.split(' by ');
                        metadata.title = parts[0].trim();
                        metadata.artist = parts[1].trim();
                    }

                    // Try to extract composer from Apple Music credits
                    const creditsMatch = html.match(/class="song-credits"[^>]*>([\s\S]+?)<\/div>/i);
                    if (creditsMatch) {
                        const creditsText = creditsMatch[1].replace(/<[^>]+>/g, ' ').trim();
                        if (creditsText.toLowerCase().includes('writer') || creditsText.toLowerCase().includes('composer')) {
                            metadata.composers = creditsText;
                        }
                    }
                }
            }

            if (metadata.title) metadata.title = decode(metadata.title.replace(/ \u2014 .*$/, '').replace(/ - .*$/, '').trim());
            if (metadata.artist) metadata.artist = decode(metadata.artist.split(' | ')[0].split(' · ')[0].trim());

            // 5. Mirror artwork to Cloudinary for safety/persistence
            if (metadata.cover && metadata.cover.startsWith('http')) {
                try {
                    const uploadResult = await cloudinary.uploader.upload(metadata.cover, {
                        folder: 'zenify/artwork_mirrors',
                        resource_type: 'image'
                    });
                    metadata.cover = uploadResult.secure_url;
                } catch (mirrorErr) {
                    console.warn("Could not mirror artwork to Cloudinary:", mirrorErr);
                }
            }

            // Clean tracks if any
            if (metadata.tracks) {
                metadata.tracks = metadata.tracks.map(t => ({
                    ...t,
                    title: decode(t.title),
                    artist: decode(t.artist)
                }));
            }

            return metadata;
        } catch (err: any) {
            console.error('ExternalMetadataService Error:', err.message);
            return { title: '', artist: '', cover: '', error: err.message };
        }
    }

    static async fetchAudio(title: string, artist: string, targetDuration?: number, directUrl?: string): Promise<{ url: string; duration?: number; sourceType?: string }> {
        let query = `${artist} - ${title} official audio`;
        const tempDir = os.tmpdir();

        try {
            // If a direct YouTube URL is provided, skip search and download directly
            if (directUrl) {
                console.log(`[SmartAudio] Direct URL provided, skipping search: ${directUrl}`);
                const filename = `direct-fetch-${Date.now()}.m4a`;
                const outputPath = path.join(tempDir, filename);
                const downloadCommand = `python -m yt_dlp -f "ba[ext=m4a]/ba/b" --no-playlist --no-warnings -o "${outputPath}" "${directUrl}"`;
                await execPromise(downloadCommand);

                if (fs.existsSync(outputPath)) {
                    console.log("[SmartAudio] Direct download success, uploading to Cloudinary...");
                    const uploadResult = await cloudinary.uploader.upload(outputPath, {
                        resource_type: 'video',
                        folder: 'zenify/smart_imports',
                        public_id: filename.replace('.m4a', ''),
                    });
                    fs.unlinkSync(outputPath);
                    if (!uploadResult?.secure_url) throw new Error("Cloudinary upload failed");
                    return { url: uploadResult.secure_url, duration: uploadResult.duration ? Math.round(uploadResult.duration) : targetDuration, sourceType: 'direct_yt' };
                }
                throw new Error("File not found after direct download");
            }

            const getCandidates = async (q: string) => {
                const searchCommand = `python -m yt_dlp --dump-json --flat-playlist --no-warnings "ytsearch15:${q}"`;
                const { stdout } = await execPromise(searchCommand);
                return stdout.trim().split('\n').filter(l => l.trim()).map(line => {
                    try { return JSON.parse(line); } catch { return null; }
                }).filter(v => v);
            };

            let candidates = await getCandidates(query).catch(() => []);

            // Fallback: If specific search fails, try broad search
            if (candidates.length === 0) {
                console.log("[SmartAudio] Initial search yielded nothing. Trying broader query.");
                query = `${artist} ${title}`;
                candidates = await getCandidates(query).catch(() => []);
            }

            if (candidates.length === 0) {
                throw new Error("No YouTube results found after multiple attempts");
            }

            // Step 2: Scoring Algorithm
            const scoredResults = candidates.map(video => {
                let score = 0;
                const vTitle = video.title?.toLowerCase() || "";
                const vChannel = video.uploader?.toLowerCase() || "";
                const vDesc = (video.description || "").toLowerCase();
                const vDuration = video.duration || 0;

                // Priority 1: Official Artist Channel / Topic Channel (+50)
                if (artist && (vChannel.includes(artist.toLowerCase()) || vChannel.includes("topic"))) {
                    score += 50;
                }

                // Priority 2: Official Metadata (+40)
                if (vTitle.includes("official audio") || vDesc.includes("provided to youtube by")) {
                    score += 40;
                }

                // Priority 3: Lyric Video (+20)
                if (vTitle.includes("lyric video") || vTitle.includes("official lyric")) {
                    score += 20;
                }

                // Priority 4: Music Video (+5)
                if (vTitle.includes("official video") || vTitle.includes("video song")) {
                    score += 5;
                }

                // Critical Rejections: Scenes, Clips, Making-of (-100)
                const negatives = ["scene", "clip", "dialogue", "trailer", "teaser", "making", "behind the scenes", "interview"];
                if (negatives.some(n => vTitle.includes(n))) {
                    score -= 100;
                }

                // Duration Matching (Crucial to avoid long movie versions or short clips)
                if (targetDuration) {
                    const diff = Math.abs(vDuration - targetDuration);
                    if (diff > 45) {
                        score -= 200; // Likely a different version or dialogue-heavy
                    } else if (diff < 10) {
                        score += 30; // Very close match
                    } else if (diff < 20) {
                        score += 10;
                    }
                }

                return { ...video, score };
            });

            // Sort by score descending
            scoredResults.sort((a, b) => b.score - a.score);
            const best = scoredResults[0];

            console.log(`[SmartAudio] Selected: "${best.title}" (Score: ${best.score}, ID: ${best.id}, Channel: ${best.uploader})`);

            if (best.score < -50) {
                // If the best we found is still garbage, try a broader search or fail
                console.warn("[SmartAudio] Best match score is too low, falling back to first result or failing.");
            }

            // Step 3: Download the selected candidate
            const filename = `smart-fetch-${Date.now()}-${best.id}.m4a`;
            const outputPath = path.join(tempDir, filename);

            console.log(`[SmartAudio] Downloading best candidate output to: ${outputPath}`);
            // Use webpage_url if available, or just the id
            const videoUrl = best.url || best.webpage_url || `https://www.youtube.com/watch?v=${best.id}`;
            const downloadCommand = `python -m yt_dlp -f "ba[ext=m4a]" --no-playlist --no-warnings -o "${outputPath}" "${videoUrl}"`;

            await execPromise(downloadCommand);

            if (fs.existsSync(outputPath)) {
                console.log("[SmartAudio] Uploading to Cloudinary...");
                const uploadResult = await cloudinary.uploader.upload(outputPath, {
                    resource_type: 'video',
                    folder: 'zenify/smart_imports',
                    public_id: filename.replace('.m4a', ''),
                    context: {
                        yt_id: best.id,
                        match_score: best.score.toString(),
                        import_type: 'smart_selection'
                    }
                });

                // Cleanup
                fs.unlinkSync(outputPath);

                if (!uploadResult || !uploadResult.secure_url) {
                    throw new Error("Cloudinary upload failed for smart fetch");
                }

                // Determine source type for logging/UI
                let sourceType = "official_audio";
                if (best.score < 30) sourceType = "music_video";
                else if (best.score < 60) sourceType = "lyric_video";

                return {
                    url: uploadResult.secure_url,
                    duration: uploadResult.duration ? Math.round(uploadResult.duration) : best.duration,
                    sourceType
                };
            }
            throw new Error("File not found after smart download");

        } catch (err: any) {
            console.error("[SmartAudio] Fatal Error:", err.message);
            throw err;
        }
    }

    // ========================================================
    // LYRICS FETCHER — multi-source with song structure formatting
    // ========================================================
    static async fetchLyrics(title: string, artist: string): Promise<string | null> {
        console.log(`[Lyrics] Fetching lyrics for: "${title}" by ${artist}`);

        // Clean the title for better search results
        const cleanTitle = title
            .replace(/\s*\(.*?\)\s*/g, '')     // remove parenthetical info
            .replace(/\s*\[.*?\]\s*/g, '')     // remove bracket info
            .replace(/\s*-\s*.*$/, '')          // remove "- Remaster" etc.
            .trim();

        const cleanArtist = artist
            .replace(/\s*feat\.?\s*.*/i, '')   // remove "feat. X"
            .replace(/\s*ft\.?\s*.*/i, '')     // remove "ft. X"
            .trim();

        let rawLyrics: string | null = null;

        // Source 1: lyrics.ovh (Free, no API key)
        try {
            const res = await axios.get(
                `https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(cleanTitle)}`,
                { timeout: 8000 }
            );
            if (res.data?.lyrics) {
                rawLyrics = res.data.lyrics.trim();
                console.log(`[Lyrics] Found via lyrics.ovh (${rawLyrics!.length} chars)`);
            }
        } catch (err) {
            console.log('[Lyrics] lyrics.ovh miss, trying next source...');
        }

        // Source 2: lrclib.net (Free, has synced lyrics)
        if (!rawLyrics) {
            try {
                const res = await axios.get(
                    `https://lrclib.net/api/get?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(cleanTitle)}`,
                    { timeout: 8000 }
                );
                if (res.data?.plainLyrics) {
                    rawLyrics = res.data.plainLyrics.trim();
                    console.log(`[Lyrics] Found via lrclib.net (${rawLyrics!.length} chars)`);
                } else if (res.data?.syncedLyrics) {
                    // Strip timestamp tags from synced lyrics: [00:12.34] Line text
                    rawLyrics = res.data.syncedLyrics
                        .replace(/\[\d{2}:\d{2}\.\d{2,3}\]\s*/g, '')
                        .trim();
                    console.log(`[Lyrics] Found synced lyrics via lrclib.net (${rawLyrics!.length} chars)`);
                }
            } catch (err) {
                console.log('[Lyrics] lrclib.net miss, trying next source...');
            }
        }

        // Source 3: Search lrclib by query (fuzzy match)
        if (!rawLyrics) {
            try {
                const res = await axios.get(
                    `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanArtist} ${cleanTitle}`)}`,
                    { timeout: 8000 }
                );
                if (res.data && res.data.length > 0) {
                    const best = res.data[0];
                    rawLyrics = (best.plainLyrics || best.syncedLyrics?.replace(/\[\d{2}:\d{2}\.\d{2,3}\]\s*/g, '') || '').trim();
                    if (rawLyrics) {
                        console.log(`[Lyrics] Found via lrclib.net search (${rawLyrics.length} chars)`);
                    }
                }
            } catch (err) {
                console.log('[Lyrics] lrclib.net search miss');
            }
        }

        if (!rawLyrics) {
            console.log(`[Lyrics] No lyrics found for "${title}" by ${artist}`);
            return null;
        }

        // Format the lyrics into proper song structure
        return this.formatLyricsStructure(rawLyrics);
    }

    // ========================================================
    // LYRICS FORMATTER — Detect and label song sections
    // ========================================================
    private static formatLyricsStructure(raw: string): string {
        // If lyrics already have section labels like [Verse], [Chorus], return as-is
        if (/\[(Verse|Chorus|Bridge|Hook|Intro|Outro|Pre-Chorus|Refrain)/i.test(raw)) {
            return raw;
        }

        const lines = raw.split('\n');
        const sections: string[][] = [];
        let currentSection: string[] = [];

        // Split into sections based on empty lines
        for (const line of lines) {
            if (line.trim() === '') {
                if (currentSection.length > 0) {
                    sections.push([...currentSection]);
                    currentSection = [];
                }
            } else {
                currentSection.push(line);
            }
        }
        if (currentSection.length > 0) {
            sections.push(currentSection);
        }

        if (sections.length === 0) return raw;

        // Detect repeated sections (likely choruses)
        const sectionFingerprints = sections.map(s =>
            s.slice(0, 2).join('|').toLowerCase().replace(/[^a-z0-9]/g, '')
        );

        // Find the most repeated fingerprint = Chorus
        const fpCounts: Record<string, number> = {};
        for (const fp of sectionFingerprints) {
            if (fp.length > 5) { // Ignore very short sections
                fpCounts[fp] = (fpCounts[fp] || 0) + 1;
            }
        }

        let chorusFingerprint = '';
        let maxCount = 0;
        for (const [fp, count] of Object.entries(fpCounts)) {
            if (count > maxCount) {
                maxCount = count;
                chorusFingerprint = fp;
            }
        }

        // Now label sections
        let verseCount = 1;
        let chorusCount = 0;
        const labeled: string[] = [];

        for (let i = 0; i < sections.length; i++) {
            const fp = sectionFingerprints[i];
            const sectionText = sections[i].join('\n');
            const sectionLen = sections[i].length;

            // Determine section type
            let label: string;

            if (chorusFingerprint && fp === chorusFingerprint && maxCount > 1) {
                chorusCount++;
                label = '🎵 Chorus';
            } else if (i === 0 && sectionLen <= 3) {
                label = '🎤 Intro';
            } else if (i === sections.length - 1 && sectionLen <= 3) {
                label = '🔚 Outro';
            } else if (sectionLen <= 2 && i > 0 && i < sections.length - 1) {
                // Short section before a detected chorus = likely Pre-Chorus
                const nextFp = sectionFingerprints[i + 1];
                if (chorusFingerprint && nextFp === chorusFingerprint) {
                    label = '🎶 Pre-Chorus';
                } else {
                    label = `📝 Bridge`;
                }
            } else {
                label = `🎙️ Verse ${verseCount}`;
                verseCount++;
            }

            labeled.push(`[${label}]`);
            labeled.push(sectionText);
            labeled.push(''); // empty line between sections
        }

        return labeled.join('\n').trim();
    }
}

