import axios from 'axios';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { promisify } from 'util';
import cloudinary from '../utils/cloudinary';
import { uploadToR2 } from '../utils/s3';

// Dynamic imports for ESM modules if needed, or stick to require if it's simpler for these libs
const fetch = require('node-fetch');
const spotifyUrlInfo = require('spotify-url-info')(fetch);
const spotifyUri = require('spotify-uri');
const cheerio = require('cheerio');

const _execPromise = promisify(exec);
const execPromise = (cmd: string) => _execPromise(cmd, { maxBuffer: 10 * 1024 * 1024 });

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
        cover?: string;
        lyrics?: string;
    }>;
    bpm?: number;
    key?: string;
    composers?: string;
    featuredArtists?: string;
    lyrics?: string;
    description?: string;
}

// Helper to get correct yt-dlp command based on environment
const getYTCommand = (): string => {
    let cmd = 'yt-dlp';
    if (process.env.NODE_ENV !== 'production') {
        cmd = 'python -m yt_dlp';
    } else if (fs.existsSync('/usr/local/bin/yt-dlp')) {
        cmd = '/usr/local/bin/yt-dlp';
    }

    // NOTE: Do NOT add --extractor-args youtube:player-client=... here.
    // android requires PO tokens, ios requires PO tokens, mweb requires PO tokens,
    // tv triggers DRM. The default client (android_vr) works correctly with updated yt-dlp.

    // If YOUTUBE_COOKIES env var is present (Base64 encoded cookies.txt),
    // write it to a file and tell yt-dlp to use it.
    if (process.env.YOUTUBE_COOKIES) {
        try {
            const cookiesPath = path.join(os.tmpdir(), 'yt-cookies.txt');
            fs.writeFileSync(cookiesPath, Buffer.from(process.env.YOUTUBE_COOKIES, 'base64').toString('utf-8'));
            cmd += ` --cookies "${cookiesPath}"`;
            console.log('[ExternalMetadata] Injected YouTube cookies from environment.');
        } catch (e) {
            console.error('[ExternalMetadata] Failed to parse YOUTUBE_COOKIES env var', e);
        }
    }

    return cmd;
};

const YT_DLP_COMMAND = getYTCommand();
console.log(`[ExternalMetadata] Using yt-dlp command: "${YT_DLP_COMMAND}"`);

// In-memory cache for audio search results to prevent redundant slow searches
const audioSearchCache = new Map<string, { url: string; duration?: number; sourceType?: string; expires: number; watchUrl?: string }>();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

// Optional Diagnostic: Test yt-dlp version on start if in prod
if (process.env.NODE_ENV === 'production') {
    execPromise(`${YT_DLP_COMMAND.split(' ')[0]} --version`)
        .then(({ stdout }) => console.log(`[ExternalMetadata] yt-dlp version: ${stdout.trim()}`))
        .catch(err => console.error(`[ExternalMetadata] CRITICAL: yt-dlp failed diagnostic! ${err.message}`));
}

export class ExternalMetadataService {
    static async fetchFromUrl(url: string): Promise<ExtractedMetadata> {
        url = url.trim();
        let metadata: ExtractedMetadata = {
            title: '',
            artist: '',
            cover: '',
        };

        let isUrl = url.startsWith('http');

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
                    const isPlaylist = url.includes('list=') && !url.includes('watch?v=') && !url.includes('youtu.be/');

                    if (isPlaylist) {
                        try {
                            const command = `${YT_DLP_COMMAND} --dump-single-json --flat-playlist "${url}"`;
                            const { stdout } = await execPromise(command);
                            const playlist = JSON.parse(stdout);

                            metadata.title = playlist.title || "YouTube Playlist";
                            metadata.artist = playlist.uploader || playlist.channel || "Various Artists";
                            metadata.isCollection = true;

                            // Set cover artwork (best available thumbnail)
                            if (playlist.thumbnails && playlist.thumbnails.length > 0) {
                                metadata.cover = playlist.thumbnails[playlist.thumbnails.length - 1].url;
                            } else if (playlist.thumbnail) {
                                metadata.cover = playlist.thumbnail;
                            } else {
                                metadata.cover = '/logo.png';
                            }

                            const entries = playlist.entries || [];
                            metadata.tracks = entries.map((entry: any, i: number) => ({
                                title: entry.title || `Track ${i + 1}`,
                                artist: entry.uploader || entry.channel || metadata.artist,
                                duration: entry.duration || undefined,
                                trackNumber: i + 1,
                            }));
                        } catch (playlistErr: any) {
                            console.warn('YouTube playlist fetch failed:', playlistErr);
                            metadata.error = "Failed to fetch YouTube playlist. Please check the URL and try again.";
                        }
                        return metadata;
                    } else {
                        const videoIdMatch = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
                        const cleanUrl = videoIdMatch
                            ? `https://www.youtube.com/watch?v=${videoIdMatch[1]}`
                            : url;
                        const command = `${YT_DLP_COMMAND} --dump-json --no-playlist "${cleanUrl}"`;
                        const { stdout } = await execPromise(command);
                        const video = JSON.parse(stdout);

                        metadata.title = video.track || video.title.replace(/\[.*?\]/g, '').replace(/\(Official.*?\)/ig, '').trim();
                        metadata.artist = video.artist || video.uploader || video.channel || "Unknown Artist";
                        metadata.album = video.album || undefined;
                        metadata.duration = video.duration;

                        // Use AI-powered / Multi-source search for High Quality SQUARE cover
                        console.log(`[Artwork] Refining low-quality YouTube thumb for: ${metadata.artist} - ${metadata.title}`);
                        const refinedCover = await ExternalMetadataService.getHighQualitySquareCover(metadata.title, metadata.artist, video.album);
                        
                        if (refinedCover) {
                            metadata.cover = refinedCover;
                        } else if (video.thumbnails && video.thumbnails.length > 0) {
                            metadata.cover = video.thumbnails[video.thumbnails.length - 1].url;
                        } else if (video.thumbnail) {
                            metadata.cover = video.thumbnail;
                        } else {
                            metadata.cover = `https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`;
                        }

                        if (video.description) {
                            metadata.description = video.description.substring(0, 500);
                        }
                    }
                } catch (ytErr) {
                    console.warn('YouTube scraping failed:', ytErr);
                }
            }

            // Priority 0: Spotify (Using spotify-url-info)
            else if (url.includes('spotify.com')) {
                try {
                    const tracks = await spotifyUrlInfo.getTracks(url);
                    const details = await spotifyUrlInfo.getDetails(url);

                    if (details && details.preview) {
                        metadata.title = details.preview.title;
                        metadata.artist = details.preview.artist || details.preview.description?.split(' · ')[0] || "Unknown Artist";
                        metadata.cover = details.preview.image;

                        const parsed = spotifyUri.parse(url);
                        if (parsed.type === 'album' || parsed.type === 'playlist') {
                            metadata.isCollection = true;
                        }

                        if (tracks && tracks.length > 0) {
                            metadata.tracks = tracks.map((t: any, i: number) => ({
                                title: t.name,
                                artist: t.artist || t.artists?.[0]?.name || metadata.artist,
                                duration: Math.floor((t.duration || t.duration_ms || 0) / 1000),
                                trackNumber: i + 1,
                                cover: t.cover || t.image || t.thumbnailUrl || (t.images && t.images[0]?.url) || metadata.cover
                            }));
                        }
                    }
                } catch (spErr) {
                    console.warn('Spotify fetch failed, falling back to scraper:', spErr);
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
                        // Try multiple country codes — some tracks are only in certain stores
                        const countriesToTry = [country, 'us', 'gb', 'in'].filter((c, i, a) => a.indexOf(c) === i);
                        let result: any = null;
                        for (const c of countriesToTry) {
                            try {
                                const itunesRes = await axios.get(`https://itunes.apple.com/lookup?id=${id}&country=${c}`, { timeout: 5000 });
                                if (itunesRes.data.results && itunesRes.data.results[0]) {
                                    result = itunesRes.data.results[0];
                                    break;
                                }
                            } catch { /* try next country */ }
                        }
                        if (result) {
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
                        } // close if (result)
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
                                    trackNumber: t.trackNumber,
                                    cover: (t.artworkUrl100 || '').replace('100x100bb', '1000x1000bb') || metadata.cover
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

            // Priority 1B: Masstamilan.dev (Regional Powerhouse)
            if (url.includes('masstamilan')) {
                try {
                    // Use native fetch as Axios often gets blocked by Cloudflare 403s on Masstamilan
                    const response = await fetch(url, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
                    });
                    const html = await response.text();

                    const $ = cheerio.load(html);

                    const titleText = $('h1').text();
                    if (titleText) {
                        metadata.title = decode(titleText.replace(/mp3 songs download.*/i, '').trim());
                    }

                    // Look for Music director
                    $('b').each((i: number, el: any) => {
                        if ($(el).text().trim() === 'Music:') {
                            const artistLink = $(el).next('a').text().trim();
                            if (artistLink) metadata.artist = decode(artistLink);
                        }
                    });

                    const img = $('figure.ib img').attr('src');
                    if (img) {
                        metadata.cover = img.startsWith('http') ? img : `https://www.masstamilan.dev${img}`;
                    }

                    // Scrape Tracklist using robust DOM traversal instead of regex
                    const tracks: any[] = [];
                    $('tr[itemprop="itemListElement"]').each((i: number, el: any) => {
                        const trackNumberStr = $(el).find('[itemprop="position"]').text().trim();
                        const trackNumber = trackNumberStr ? parseInt(trackNumberStr) : i + 1;
                        
                        const trackTitle = decode($(el).find('[itemprop="name"] a').text().trim());
                        const trackArtist = decode($(el).find('[itemprop="byArtist"]').text().trim() || metadata.artist);
                        
                        const durationText = $(el).find('[itemprop="duration"]').text().trim();
                        let duration = 180;
                        if (durationText.includes(':')) {
                            const parts = durationText.split(':');
                            duration = parseInt(parts[0]) * 60 + parseInt(parts[1]);
                        }
                        
                        if (trackTitle) {
                            tracks.push({
                                trackNumber,
                                title: trackTitle,
                                artist: trackArtist,
                                duration
                            });
                        }
                    });

                    if (tracks.length > 0) {
                        metadata.isCollection = true;
                        metadata.tracks = tracks;
                    }
                    
                    if (metadata.title) return metadata;
                } catch (err) {
                    console.warn('Masstamilan fetch failed, falling back to generic:', err);
                }
            }

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

                    // Priority 3: JSON-LD Parsing (Highly reliable strategy for modern platforms)
                    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]+?)<\/script>/);
                    if (jsonLdMatch) {
                        try {
                            const ld = JSON.parse(jsonLdMatch[1]);
                            const root = Array.isArray(ld) ? ld[0] : ld;

                            // If it's a collection (Album/Playlist)
                            if (root['@type'] === 'MusicAlbum' || root['@type'] === 'MusicPlaylist' || root.tracks) {
                                metadata.isCollection = true;
                                if (root.name) metadata.title = root.name;
                                if (root.byArtist?.name) metadata.artist = root.byArtist.name;
                                if (root.image) metadata.cover = Array.isArray(root.image) ? root.image[0] : root.image;

                                // Try to extract track list
                                const tracks = root.tracks?.items || root.track?.itemListElement || root.itemListElement || [];
                                if (tracks.length > 0) {
                                    metadata.tracks = tracks.map((t: any, idx: number) => {
                                        const song = t.item || t;
                                        return {
                                            title: song.name || `Track ${idx + 1}`,
                                            artist: song.byArtist?.name || metadata.artist || "Zen Artist",
                                            duration: song.duration ? ExternalMetadataService.parseISO8601Duration(song.duration) : 180,
                                            trackNumber: idx + 1
                                        };
                                    });
                                }
                            } else if (root['@type'] === 'MusicRecording') {
                                // Single track
                                metadata.title = root.name;
                                metadata.artist = root.byArtist?.name || root.author?.name;
                                if (root.image) metadata.cover = Array.isArray(root.image) ? root.image[0] : root.image;
                                if (root.duration) metadata.duration = ExternalMetadataService.parseISO8601Duration(root.duration);
                            }
                        } catch (ldErr) {
                            console.warn("[GenericScraper] JSON-LD parse failed:", ldErr);
                        }
                    }

                    // Priority 4: Final fallback for track placeholders if still empty
                    if (metadata.isCollection && (!metadata.tracks || metadata.tracks.length === 0)) {
                        const countMatch = html.match(/(\d+) (tracks|songs|items)/i);
                        const count = countMatch ? parseInt(countMatch[1]) : 0;
                        if (count > 0) {
                            metadata.tracks = Array(count).fill(null).map((_, i) => ({
                                title: `Track ${i + 1}`,
                                artist: metadata.artist || 'Unknown Artist',
                                isPlaceholder: true,
                            }));
                        }
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

            if (metadata.title) {
                // Only strip trailing junk if it doesn't contain important version info
                const needsStripping = (metadata.title.includes(' - ') || metadata.title.includes(' \u2014 ')) && 
                                     !metadata.title.toLowerCase().match(/sped up|slowed|reverb|remix|cover|acoustic|live|edit|version|mix/);
                if (needsStripping) {
                    metadata.title = decode(metadata.title.replace(/ \u2014 .*$/, '').replace(/ - .*$/, '').trim());
                } else {
                    metadata.title = decode(metadata.title.trim());
                }
            }
            if (metadata.artist) metadata.artist = decode(metadata.artist.split(' | ')[0].split(' · ')[0].trim());

            // 4.5 Eagerly attempt to upgrade cover logic to high quality square cover (for Spotify/Generic fetches)
            if (metadata.title && metadata.artist && !url.includes('music.apple.com') && !metadata.isCollection) {
                const hqCover = await ExternalMetadataService.getHighQualitySquareCover(metadata.title, metadata.artist, metadata.album);
                if (hqCover) metadata.cover = hqCover;
            }

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
            
            // Fetch Lyrics
            if (metadata.isCollection && metadata.tracks && metadata.tracks.length > 0) {
                await Promise.all(metadata.tracks.map(async (track) => {
                    const lyrics = await ExternalMetadataService.fetchLyricsFromLRCLib(track.title, track.artist || metadata.artist);
                    if (lyrics) track.lyrics = lyrics;
                }));
            } else if (!metadata.isCollection && metadata.title && metadata.artist) {
                const lyrics = await ExternalMetadataService.fetchLyricsFromLRCLib(metadata.title, metadata.artist);
                if (lyrics) metadata.lyrics = lyrics;
            }

            // Final Refinements (Split artists, clean Topic/Vevo, etc)
            ExternalMetadataService.refineMetadata(metadata);

            return metadata;
        } catch (err: any) {
            console.error('ExternalMetadataService Error:', err.message);
            return { title: '', artist: '', cover: '', error: err.message };
        }
    }
    
    // ========================================================
    // STATIC UTILITIES for Artwork & Parsing
    // ========================================================

    static async fetchLyricsFromLRCLib(title: string, artist: string): Promise<string | undefined> {
        try {
            const cleanTitle = title.replace(/\(.*\)/g, '').replace(/\[.*\]/g, '').trim();
            const cleanArtist = artist.split(',')[0].split('&')[0].trim();
            const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(cleanTitle)}`;
            const res = await axios.get(url, { timeout: 3000 });
            if (res.data) {
                return res.data.syncedLyrics || res.data.plainLyrics;
            }
        } catch (e) {
            // Ignore 404s
        }
        return undefined;
    }

    /**
     * Finds the highest quality SQUARE album art for a track.
     * Prevents using rectangular YouTube thumbnails.
     */
    static async getHighQualitySquareCover(title: string, artist: string, album?: string): Promise<string | null> {
        try {
            // Priority 1: iTunes API (Fast, HQ Square 1000x1000)
            const cleanArtist = artist
                .replace(/\s*-\s*topic$/i, '')
                .replace(/\s*vevo$/i, '')
                .trim();
                
            const query = `${cleanArtist} ${title} ${album || ""}`.trim();
            const itunesRes = await axios.get(
                `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=1`, 
                { timeout: 5000 }
            );
            
            if (itunesRes.data.results && itunesRes.data.results.length > 0) {
                const res = itunesRes.data.results[0];
                // Replace 100x100 with 1000x1000 for high quality
                const hqArt = res.artworkUrl100?.replace('100x100bb', '1000x1000bb') || 
                             res.artworkUrl100?.replace('100x100bf', '1000x1000bf');
                if (hqArt) {
                    console.log(`[Artwork] iTunes HQ Match: ${hqArt}`);
                    return hqArt;
                }
            }
        } catch (e) {
            console.warn('[Artwork] iTunes search failed:', (e as any).message);
        }

        try {
            // Priority 2: YouTube Music search (Square thumbnails)
            const ytQuery = `${artist} ${title} official audio`;
            const searchCommand = `${YT_DLP_COMMAND} --dump-json --flat-playlist --no-warnings "ytsearch1:${ytQuery}"`;
            const { stdout } = await execPromise(searchCommand);
            const video = JSON.parse(stdout);

            if (video && video.thumbnails && video.thumbnails.length > 0) {
                // Return the largest thumbnail
                const bestThumb = video.thumbnails[video.thumbnails.length - 1].url;
                if (bestThumb) {
                    console.log(`[Artwork] YouTube Music Match: ${bestThumb}`);
                    return bestThumb;
                }
            }
        } catch (e) {
            console.warn('[Artwork] YouTube search fallback failed:', (e as any).message);
        }

        return null;
    }

    private static parseISO8601Duration(duration: string): number {
        const match = duration.match(/P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)(?:\.(\d+))?S)?/);
        if (!match) return 0;
        const days = parseInt(match[1]) || 0;
        const hours = parseInt(match[2]) || 0;
        const mins = parseInt(match[3]) || 0;
        const secs = parseInt(match[4]) || 0;
        return (days * 86400) + (hours * 3600) + (mins * 60) + secs;
    }

    public static refineMetadata(metadata: ExtractedMetadata) {
        const originalTitle = metadata.title;
        console.log(`[Metadata] Refining: "${originalTitle}" by "${metadata.artist}"`);

        // 1. Clean uploader noise like " - Topic" or " Vevo"
        const cleanArtist = (a: string) => a
            .replace(/\s*-\s*topic$/i, '')
            .replace(/\s*vevo$/i, '')
            .replace(/\s*official$/i, '')
            .trim();

        if (metadata.artist) metadata.artist = cleanArtist(metadata.artist);

        // 2. Handle Multi-Artist Splitting ("A & B" or "A, B, C")
        const artistStr = metadata.artist || "";
        const splitters = [", ", " & ", " x ", " X ", " ft. ", " feat. "];
        
        let foundSplitter = "";
        for (const s of splitters) {
            if (artistStr.includes(s)) {
                foundSplitter = s;
                break;
            }
        }

        if (foundSplitter) {
            const parts = artistStr.split(foundSplitter);
            metadata.artist = parts[0].trim();
            const others = parts.slice(1).join(", ").trim();
            metadata.featuredArtists = metadata.featuredArtists 
                ? `${metadata.featuredArtists}, ${others}` 
                : others;
        }

        // 3. Extract "feat." from Title if not already done
        if (metadata.title.toLowerCase().includes(' feat. ')) {
            const featParts = metadata.title.split(/ feat\. /i);
            metadata.title = featParts[0].trim();
            const featArtists = featParts[1].replace(/[()]/g, '').trim();
            metadata.featuredArtists = metadata.featuredArtists
                ? `${metadata.featuredArtists}, ${featArtists}`
                : featArtists;
        }

        // 4. Final deduplication of featured artists
        if (metadata.featuredArtists) {
            const unique = Array.from(new Set(metadata.featuredArtists.split(',').map(s => s.trim())));
            metadata.featuredArtists = unique.join(', ');
        }

        // 5. Clean brackets/parentheses/braces from Title unless they contain
        //    'feat', 'featuring', or any important version/variant keywords.
        //    KEEP: sped up, slowed, reverb, nightcore, acapella, instrumental,
        //          daycore, lofi, lo-fi, remix, cover, acoustic, live, edit,
        //          extended, version, mix, remaster
        const KEEP_KEYWORDS = [
            'feat', 'featuring',
            'sped up', 'sped-up', 'speed up',
            'slowed', 'slow',
            'reverb',
            'nightcore',
            'daycore',
            'acapella', 'a cappella',
            'instrumental',
            'lofi', 'lo-fi',
            'remix',
            'cover',
            'acoustic',
            'live',
            'edit',
            'extended',
            'version',
            'mix',
            'remaster',
            'super sped', 'super slowed',
            'bass boosted', 'bass boost',
        ];

        metadata.title = metadata.title.replace(/(\s*\([^)]*\)|\s*\[[^\]]*\]|\s*\{[^}]*\})/gi, (match) => {
            const lowerMatch = match.toLowerCase();
            if (KEEP_KEYWORDS.some(kw => lowerMatch.includes(kw))) {
                return match;
            }
            return '';
        }).replace(/\s+/g, ' ').trim();

        if (metadata.title !== originalTitle) {
            console.log(`[Metadata] Title refined: "${originalTitle}" -> "${metadata.title}"`);
        }
    }

    static async fetchAudio(title: string, artist: string, targetDuration?: number, directUrl?: string, options: { preview?: boolean; bypassCache?: boolean } = {}): Promise<{ url: string; duration?: number; sourceType?: string; watchUrl?: string }> {
        const cacheKey = `${title}:${artist}:${targetDuration || 'any'}:${options.preview ? 'p' : 'f'}`;
        const cached = audioSearchCache.get(cacheKey);
        if (!options.bypassCache && cached && cached.expires > Date.now()) {
            console.log(`[SmartAudio] Cache hit for: "${title}" by "${artist}"`);
            return cached;
        }

        console.log(`[SmartAudio] Initiating intake for: "${title}" by "${artist}" (Target: ${targetDuration}s)`);
        const tempDir = os.tmpdir();

        const findActualFile = (stem: string): string | null => {
            const exts = ['.mp3', '.m4a', '.webm', '.opus', '.ogg', '.mp4'];
            for (const ext of exts) {
                const candidate = stem + ext;
                if (fs.existsSync(candidate)) return candidate;
            }
            return null;
        };

        // Smart Checklist Validation logic
        const validateMatch = (candTitle: string, candArtist: string, candDuration?: number, uploader?: string) => {
            let score = 0;
            const clean = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
            const t1 = clean(title);
            const t2 = clean(candTitle);
            const a1 = clean(artist);
            const a2 = clean(candArtist);
            const up = clean(uploader || '');

            // 1. Title Similarity (High weight)
            if (t1 && (t2.includes(t1) || t1.includes(t2))) score += 60;
            
            // 2. Artist Match (Check both title and uploader)
            if (a1 && (a2.includes(a1) || a1.includes(a2))) score += 30;
            if (a1 && (up.includes(a1) || a1.includes(up))) score += 40; // Huge boost if uploader is the artist
            
            // 3. Duration Check (Intelligent Tolerance)
            if (targetDuration && candDuration) {
                const diff = Math.abs(targetDuration - candDuration);
                if (diff < 8) score += 40; // Near perfect
                else if (diff < 15) score += 20; // Acceptable
                else if (diff > 45) score -= 100; // Likely a different version/mix
            }

            // 4. Official Source Bonuses (The "Seal of Quality")
            const lowTitle = candTitle.toLowerCase();
            const lowUp = (uploader || '').toLowerCase();
            
            if (lowTitle.includes('official audio')) score += 50;
            if (lowUp.includes('- topic')) score += 60; // YouTube "Topic" channels are official releases
            if (lowTitle.includes('official video') || lowTitle.includes('music video')) score += 30;
            if (lowTitle.includes('lyric video')) score += 20;
            
            // 5. Hard Negatives (Wider net)
            if (lowTitle.includes('cover') && !title.toLowerCase().includes('cover')) score -= 150;
            if (lowTitle.includes('mashup') && !title.toLowerCase().includes('mashup')) score -= 150;
            if (lowTitle.includes('remix') && !title.toLowerCase().includes('remix')) score -= 80;
            if (lowTitle.includes('slowed') || lowTitle.includes('reverb') || lowTitle.includes('sped up')) {
                 if (!title.toLowerCase().includes('slowed') && !title.toLowerCase().includes('sped up')) score -= 150;
            }
            if (lowTitle.includes('karaoke') || lowTitle.includes('instrumental')) score -= 200;

            return score;
        };

        try {
            // Direct URL logic (YouTube override)
            if (directUrl) {
                console.log(`[SmartAudio] Direct URL override: ${directUrl}`);
                const infoCmd = `${YT_DLP_COMMAND} --dump-json --no-playlist "${directUrl}"`;
                const { stdout: infoJson } = await execPromise(infoCmd);
                const info = JSON.parse(infoJson);
                if (info) {
                    // For manual overrides, we log the score but we TRUST the user choice.
                    const score = validateMatch(info.title, info.uploader || '', info.duration, info.uploader);
                    console.log(`[SmartAudio] Direct URL validation score: ${score} (User-provided, bypassing threshold)`);
                    
                    if (options.preview) {
                        const streamUrl = await ExternalMetadataService.execYtDlp(`-g -f "ba[ext=m4a]/ba"`, directUrl);
                        return { url: (streamUrl || "").trim(), duration: info.duration, sourceType: 'direct_yt', watchUrl: directUrl };
                    }
                    
                    const fileId = `direct-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
                    const fileStem = path.join(tempDir, fileId);
                    await ExternalMetadataService.execYtDlp(`-f "ba[ext=m4a]/ba" --no-playlist --quiet`, directUrl, fileStem);
                    const actualFile = findActualFile(fileStem);
                    if (actualFile) {
                        const buffer = fs.readFileSync(actualFile);
                        const fileKey = `zenify/direct_imports/${fileId}${path.extname(actualFile)}`;
                        const publicUrl = await uploadToR2(fileKey, buffer, 'audio/mp4');
                        fs.unlinkSync(actualFile);
                        return { url: publicUrl, duration: info.duration, sourceType: 'direct_yt', watchUrl: directUrl };
                    }
                }
                // If direct URL failed to process, it will fall through to regular search
                console.warn("[SmartAudio] Direct URL processing failed, falling back to search...");
            }

            // 1. Regional source: Masstamilan (Prioritized for Tamil content)
            const isTamil = artist.toLowerCase().match(/tamil|ar rahman|anirudh|yuvan|harris|santhosh|gv prakash|hiphop|deva/i) || 
                            title.toLowerCase().match(/tamil/i) ||
                            /[\u0B80-\u0BFF]/.test(title) || 
                            /[\u0B80-\u0BFF]/.test(artist);
            if (isTamil) {
                try {
                    console.log("[SmartAudio] Regional metadata detected, searching Masstamilan for HQ validation...");
                    const searchRes = await axios.get(`https://www.masstamilan.dev/search?keyword=${encodeURIComponent(`${artist} ${title}`)}`, { timeout: 8000 });
                    const match = searchRes.data.match(/<div class="mw0">[\s\S]*?<a href="([^"]+)"/i);
                    if (match) {
                        const albumUrl = match[1].startsWith('http') ? match[1] : `https://www.masstamilan.dev${match[1]}`;
                        const albumData = await this.fetchFromUrl(albumUrl);
                        const best = albumData.tracks?.map(t => ({...t, score: validateMatch(t.title, t.artist, t.duration, t.artist)}))
                            .filter(t => t.score > 80)
                            .sort((a,b) => b.score - a.score)[0];
                        if (best) {
                            console.log(`[SmartAudio] Validated HQ metadata match on Masstamilan: "${best.title}"`);
                            title = best.title; // Pivot to precise Masstamilan title for cleaner search
                        }
                    }
                } catch (e) {
                    console.warn("[SmartAudio] Masstamilan verification skipped due to network error.");
                }
            }

            // 2. Multi-Candidate Search with Validator Checklist
            const getCandidates = async (q: string) => {
                const searchCommand = `${YT_DLP_COMMAND} --socket-timeout 20 --no-check-certificates --dump-json --flat-playlist --no-warnings --no-check-certificates "ytsearch10:${q}"`;
                const { stdout } = await execPromise(searchCommand);
                return stdout.trim().split('\n').filter(l => l.trim()).map(line => {
                    try { return JSON.parse(line); } catch { return null; }
                }).filter(v => v);
            };

            console.log("[SmartAudio] Fetching audio candidates for validator checklist...");
            let candidates = await getCandidates(`"${artist}" "${title}" official audio`).catch(() => []);
            if (candidates.length < 3) {
                const more = await getCandidates(`"${artist}" "${title}" topic`).catch(() => []);
                candidates = [...candidates, ...more];
            }
            if (candidates.length === 0) candidates = await getCandidates(`${artist} ${title}`).catch(() => []);

            const scored = candidates.map((v: any) => ({
                ...v,
                score: validateMatch(v.title, v.uploader || v.channel || '', v.duration, v.uploader || v.channel)
            })).sort((a,b) => b.score - a.score);

            // Log top candidates for debugging
            scored.slice(0, 3).forEach(c => console.log(`[SmartAudio] Candidate: "${c.title}" | Score: ${c.score} | Duration: ${c.duration}s`));

            const valid = scored.filter(v => v.score >= 45);

            const result = valid.length > 0 ? (async () => {
                const best = valid[0];
                console.log(`[SmartAudio] Checklist winner: "${best.title}" (Score: ${best.score}, Duration: ${best.duration}s)`);
                const videoUrl = `https://www.youtube.com/watch?v=${best.id}`;
                
                if (options.preview) {
                    console.log("[SmartAudio] Extracting stream URL with fallback support...");
                    const streamUrl = await ExternalMetadataService.execYtDlp(`-g -f "ba[ext=m4a]/ba"`, videoUrl);
                    return { url: (streamUrl || "").trim(), duration: best.duration, sourceType: 'smart_validated', watchUrl: videoUrl };
                }
                
                const fileId = `smart-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
                const fileStem = path.join(tempDir, fileId);
                
                console.log("[SmartAudio] Downloading audio with fallback support...");
                await ExternalMetadataService.execYtDlp(`-f "ba[ext=m4a]/ba" --no-playlist --quiet`, videoUrl, fileStem);
                
                const actualFile = findActualFile(fileStem);
                if (actualFile) {
                    const buffer = fs.readFileSync(actualFile);
                    const fileKey = `zenify/smart_imports/${fileId}${path.extname(actualFile)}`;
                    const publicUrl = await uploadToR2(fileKey, buffer, 'audio/mp4');
                    fs.unlinkSync(actualFile);
                    return { url: publicUrl, duration: best.duration, sourceType: 'smart_validated', watchUrl: videoUrl };
                }
                throw new Error("File extraction failed");
            })() : Promise.reject(new Error("Validation Failed: No audio candidates matched the duration and metadata checklist."));

            const finalResult = await result;
            audioSearchCache.set(cacheKey, { ...finalResult, expires: Date.now() + CACHE_TTL });
            return finalResult;
        } catch (err: any) {
             console.error(`[SmartAudio] Intake failed for ${title}:`, err.message);
             throw err;
        }
    }

    /**
     * Helper to execute yt-dlp with automatic fallback for format/bot-detection issues.
     */
    public static async execYtDlp(args: string, url: string, fileStem?: string): Promise<string> {
        const outputArg = fileStem ? `-o "${fileStem}.%(ext)s"` : "";
        const commonFlags = '--socket-timeout 30 --extractor-retries 3 --no-check-certificates';
        
        try {
            // Method 1: Standard command
            const cmd = `${YT_DLP_COMMAND} ${commonFlags} ${args} ${outputArg} "${url}"`;
            const { stdout } = await execPromise(cmd);
            return stdout;
        } catch (err: any) {
            console.warn(`[SmartAudio] Primary method failed (${err.message.slice(0, 120)}). Trying bestaudio fallback...`);
            
            try {
                // Method 2: Fallback with broad bestaudio format
                const fallbackArgs = args.replace(/-f "ba\[ext=m4a\]\/ba"/, '-f "bestaudio/best"');
                const fallbackCmd = `${YT_DLP_COMMAND} ${commonFlags} ${fallbackArgs} ${outputArg} "${url}"`;
                const { stdout } = await execPromise(fallbackCmd);
                return stdout;
            } catch (err2: any) {
                console.warn(`[SmartAudio] bestaudio fallback failed (${err2.message.slice(0, 80)}). Trying web client...`);
                
                try {
                    // Method 3: Force web client to bypass bot detection
                    const webArgs = args.replace(/-f "ba\[ext=m4a\]\/ba"/, '-f "bestaudio/best"');
                    const webCmd = `${YT_DLP_COMMAND} ${commonFlags} --extractor-args "youtube:player_client=web" ${webArgs} ${outputArg} "${url}"`;
                    const { stdout } = await execPromise(webCmd);
                    return stdout;
                } catch (err3: any) {
                    console.error("[SmartAudio] All yt-dlp methods failed.", err3.message.slice(0, 120));
                    throw new Error(`Audio intake failed: ${err3.message}`);
                }
            }
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

        const artistList = artist.split(',').map(s => s.trim());
        const primaryArtist = artistList[0] 
            .replace(/\s*feat\.?\s*.*/i, '')
            .replace(/\s*ft\.?\s*.*/i, '')
            .trim();

        const fullCollective = artistList.join(', '); // Standardized ARJN, KDS, FIFTY4, RONN

        let rawLyrics: string | null = null;

        // Source 1: JioSaavn Fallback for Indian/Regional content
        const TAMIL_KEYWORDS = ['tamil', 'kollywood', 'anirudh', 'ar rahman', 'yuvan', 'sriram'];
        const isRegionalActive = TAMIL_KEYWORDS.some(k => title.toLowerCase().includes(k) || artist.toLowerCase().includes(k));

        if (isRegionalActive && !rawLyrics) {
            try {
                // For JioSaavn, the full collective string is usually better for finding exact regional matches
                const saavnQuery = encodeURIComponent(`${artist} ${cleanTitle}`.trim());
                const saavnRes = await axios.get(`https://saavn.sumit.co/api/search/songs?query=${saavnQuery}`, { timeout: 6000 });
                // ... same logic as before ...
                if (saavnRes.data?.success && saavnRes.data.data?.results?.length > 0) {
                    const topResult = saavnRes.data.data.results[0];
                    if (topResult.id) {
                        const lyricsDetails = await axios.get(`https://saavn.sumit.co/api/songs/${topResult.id}/lyrics`, { timeout: 5000 });
                        if (lyricsDetails.data?.success && lyricsDetails.data.data?.lyrics) {
                            rawLyrics = lyricsDetails.data.data.lyrics.trim();
                            console.log(`[Lyrics] Found via JioSaavn (${rawLyrics!.length} chars)`);
                        }
                    }
                }
            } catch (err) {
                console.log('[Lyrics] JioSaavn miss...');
            }
        }

        // Source 2: lyrics.ovh (Free, no API key)
        if (!rawLyrics) {
            try {
                // Try primary artist first as lyrics.ovh is strict
                const res = await axios.get(
                    `https://api.lyrics.ovh/v1/${encodeURIComponent(primaryArtist)}/${encodeURIComponent(cleanTitle)}`,
                    { timeout: 8000 }
                );
                if (res.data?.lyrics) {
                    rawLyrics = res.data.lyrics.trim();
                    console.log(`[Lyrics] Found via lyrics.ovh (${rawLyrics!.length} chars)`);
                }
            } catch (err) {
                console.log('[Lyrics] lyrics.ovh miss, trying next source...');
            }
        }

        // Source 3: lrclib.net (Free, has synced lyrics)
        if (!rawLyrics) {
            try {
                // Try primary first
                const res = await axios.get(
                    `https://lrclib.net/api/get?artist_name=${encodeURIComponent(primaryArtist)}&track_name=${encodeURIComponent(cleanTitle)}`,
                    { timeout: 8000 }
                );
                if (res.data?.plainLyrics) {
                    rawLyrics = res.data.plainLyrics.trim();
                    console.log(`[Lyrics] Found via lrclib.net (${rawLyrics!.length} chars)`);
                } else if (res.data?.syncedLyrics) {
                    // Strip timestamp tags
                    rawLyrics = res.data.syncedLyrics.replace(/\[\d{2}:\d{2}\.\d{2,3}\]\s*/g, '').trim();
                    console.log(`[Lyrics] Found synced lyrics via lrclib.net (${rawLyrics!.length} chars)`);
                }
            } catch (err) {
                console.log('[Lyrics] lrclib.net miss, trying next source...');
            }
        }

        // Source 4: Search lrclib by query (broad search with collective)
        if (!rawLyrics) {
            try {
                // Use full collective for searching
                const res = await axios.get(
                    `https://lrclib.net/api/search?q=${encodeURIComponent(`${fullCollective} ${cleanTitle}`)}`,
                    { timeout: 8000 }
                );
                if (res.data && res.data.length > 0) {
                    const best = res.data[0];
                    rawLyrics = (best.plainLyrics || best.syncedLyrics?.replace(/\[\d{2}:\d{2}\.\d{2,3}\]\s*/g, '') || '').trim();
                }
            } catch (err) {
                console.log('[Lyrics] lrclib.net search failed');
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

