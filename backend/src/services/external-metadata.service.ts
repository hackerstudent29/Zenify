import axios from 'axios';
import { exec, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { promisify } from 'util';
import cloudinary from '../utils/cloudinary';
import { uploadToR2 } from '../utils/s3';
import { LyricsEnhancementService } from './lyrics-enhancement.service';

// Dynamic imports for ESM modules if needed, or stick to require if it's simpler for these libs
const fetch = require('node-fetch');
const spotifyUrlInfo = require('spotify-url-info')(fetch);
const spotifyUri = require('spotify-uri');
const cheerio = require('cheerio');

const _execPromise = promisify(exec);
const execPromise = (cmd: string) => _execPromise(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 25000 });

export interface ExtractedMetadata {
    title: string;
    artist: string;
    cover: string;
    album?: string;
    genre?: string;
    audioUrl?: string;
    previewUrl?: string;
    error?: string;
    duration?: number;
    isCollection?: boolean;
    releaseDate?: string;
    tracks?: Array<{
        title: string;
        artist: string;
        duration?: number;
        trackNumber?: number;
        isPlaceholder?: boolean;
        cover?: string;
        lyrics?: string;
        featuredArtists?: string;
        releaseDate?: string;
        previewUrl?: string;
        audioUrl?: string;
    }>;
    bpm?: number;
    key?: string;
    composers?: string;
    featuredArtists?: string;
    lyrics?: string;
    description?: string;
}

// Helper to get correct yt-dlp command based on environment using dynamic probing
const getYTCommand = (): string => {
    // Hardcode local Windows binary check first to avoid probe flakiness
    const localExe = path.resolve(process.cwd(), 'yt-dlp.exe');
    if (fs.existsSync(localExe)) {
        console.log(`[ExternalMetadata] Using local yt-dlp binary: "${localExe}"`);
        return localExe;
    }

    const candidates = [
        'yt-dlp',
        'python -m yt_dlp',
        'python3 -m yt_dlp',
        '/usr/local/bin/yt-dlp',
        '/usr/bin/yt-dlp'
    ];

    let chosenCmd = '';

    for (const candidate of candidates) {
        try {
            // Run a quick version probe to confirm standard executable functionality
            execSync(`${candidate} --version`, { stdio: 'ignore', timeout: 3000 });
            chosenCmd = candidate;
            console.log(`[ExternalMetadata] Probe success for yt-dlp command: "${candidate}"`);
            break;
        } catch (err) {
            // Try next candidate
        }
    }

    if (!chosenCmd) {
        console.warn('[ExternalMetadata] All yt-dlp probes failed. Falling back to environment-based logic.');
        if (process.env.NODE_ENV !== 'production') {
            chosenCmd = 'python -m yt_dlp';
        } else if (fs.existsSync('/usr/local/bin/yt-dlp')) {
            chosenCmd = '/usr/local/bin/yt-dlp';
        } else {
            chosenCmd = 'yt-dlp';
        }
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
            chosenCmd += ` --cookies "${cookiesPath}"`;
            console.log('[ExternalMetadata] Injected YouTube cookies from environment.');
        } catch (e) {
            console.error('[ExternalMetadata] Failed to parse YOUTUBE_COOKIES env var', e);
        }
    }

    return chosenCmd;
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
            // Priority 0: Instagram
            if (url.includes('instagram.com/p/') || url.includes('instagram.com/reel/')) {
                try {
                    const match = url.match(/instagram\.com\/(?:p|reel)\/([a-zA-Z0-9_-]+)/);
                    if (match && match[1]) {
                        const shortcode = match[1];
                        const mediaUrl = `https://www.instagram.com/p/${shortcode}/media/?size=l`;
                        const res = await axios.get(mediaUrl, { 
                            maxRedirects: 0, 
                            validateStatus: () => true,
                            timeout: 5000,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                            }
                        });
                        const redirectUrl = res.headers.location || mediaUrl;
                        metadata.title = `Instagram Post ${shortcode}`;
                        metadata.artist = 'Instagram';
                        metadata.cover = redirectUrl;
                        return metadata;
                    }
                } catch (instaErr: any) {
                    console.warn('[Instagram] Fetch failed:', instaErr.message);
                }
            }

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
                            metadata.tracks = entries.map((entry: any, i: number) => {
                                const videoId = entry.id || (entry.url && entry.url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1]);
                                const watchUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : (entry.url || entry.webpage_url);
                                const streamProxyUrl = watchUrl ? `/api/utils/stream-youtube?url=${encodeURIComponent(watchUrl)}` : undefined;
                                const trackCover = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : (entry.thumbnails?.[0]?.url || metadata.cover);

                                let rawTitle = (entry.title || `Track ${i + 1}`).trim();
                                let trackArtist = entry.uploader || entry.channel || metadata.artist;
                                let trackTitle = rawTitle;

                                // Clean brackets noise and split "Artist - Title" or "Artist | Title"
                                if (rawTitle.includes(' - ') || rawTitle.includes(' | ')) {
                                    const parts = rawTitle.split(/ - | \| /);
                                    if (parts.length >= 2) {
                                        trackArtist = parts[0].trim();
                                        trackTitle = parts.slice(1).join(' - ').replace(/\[.*?\]/g, '').replace(/\(Official.*?\)/ig, '').trim();
                                    }
                                }

                                return {
                                    title: trackTitle || rawTitle,
                                    artist: trackArtist || metadata.artist,
                                    duration: entry.duration || undefined,
                                    trackNumber: i + 1,
                                    audioUrl: watchUrl || undefined,
                                    previewUrl: streamProxyUrl || undefined,
                                    cover: trackCover
                                };
                            });
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
                        const videoId = videoIdMatch ? videoIdMatch[1] : null;

                        let video: any = null;
                        try {
                            const command = `${YT_DLP_COMMAND} --dump-json --no-playlist "${cleanUrl}"`;
                            const { stdout } = await execPromise(command);
                            video = JSON.parse(stdout);
                        } catch (ytDlpErr: any) {
                            console.warn('[YouTube] yt-dlp --dump-json failed, trying oEmbed fallback:', ytDlpErr.message?.slice(0, 80));
                            // Fallback: use YouTube oEmbed API for title/author (no auth needed)
                            if (videoId) {
                                try {
                                    const oembedRes = await axios.get(
                                        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
                                        { timeout: 5000 }
                                    );
                                    video = {
                                        id: videoId,
                                        title: oembedRes.data.title || `YouTube Video`,
                                        uploader: oembedRes.data.author_name || 'Unknown Artist',
                                        thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
                                        thumbnails: [
                                            { url: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`, width: 1280 },
                                            { url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, width: 480 },
                                        ],
                                        duration: null,
                                    };
                                    console.log(`[YouTube] oEmbed fallback success: "${video.title}" by "${video.uploader}"`);
                                } catch (oembedErr: any) {
                                    console.warn('[YouTube] oEmbed fallback also failed:', oembedErr.message?.slice(0, 60));
                                    // Last resort: construct minimal metadata from video ID
                                    video = {
                                        id: videoId,
                                        title: `YouTube Video`,
                                        uploader: 'Unknown Artist',
                                        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                                        thumbnails: [{ url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, width: 480 }],
                                        duration: null,
                                    };
                                }
                            }
                        }

                        if (!video) {
                            console.warn('[YouTube] Could not extract any metadata for URL:', url);
                        } else {
                            metadata.title = video.track || (video.title || '').replace(/\[.*?\]/g, '').replace(/\(Official.*?\)/ig, '').trim() || 'Unknown Title';
                            metadata.artist = video.artist || video.uploader || video.channel || "Unknown Artist";
                            metadata.album = video.album || undefined;
                            metadata.duration = video.duration || undefined;

                            // Refine metadata BEFORE retrieving the high quality square cover
                            ExternalMetadataService.refineMetadata(metadata);

                            // Try to get HQ square cover from iTunes/YouTube Music
                            console.log(`[Artwork] Fetching HQ cover for: ${metadata.artist} - ${metadata.title}`);
                            const refinedCover = await ExternalMetadataService.getHighQualitySquareCover(metadata.title, metadata.artist, video.album);

                            if (refinedCover) {
                                metadata.cover = refinedCover;
                            } else if (video.thumbnails && video.thumbnails.length > 0) {
                                const sortedThumbs = [...video.thumbnails]
                                    .filter((t: any) => t && t.url)
                                    .sort((a: any, b: any) => (b.width || 0) - (a.width || 0));
                                metadata.cover = sortedThumbs[0]?.url || video.thumbnail || `https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`;
                            } else if (video.thumbnail) {
                                metadata.cover = video.thumbnail;
                            } else if (videoId) {
                                metadata.cover = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
                            }

                            if (video.description) {
                                metadata.description = video.description.substring(0, 500);
                            }
                        }
                    }
                } catch (ytErr: any) {
                    console.warn('[YouTube] Outer fetch failed:', ytErr.message?.slice(0, 80));
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

                        if (details.preview.audioUrl) {
                            metadata.previewUrl = details.preview.audioUrl;
                            metadata.audioUrl = details.preview.audioUrl;
                        }

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
                                cover: t.cover || t.image || t.thumbnailUrl || (t.images && t.images[0]?.url) || metadata.cover,
                                previewUrl: t.preview_url || t.previewUrl || t.audioUrl || undefined,
                                audioUrl: t.preview_url || t.previewUrl || t.audioUrl || undefined
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
                            if (result.releaseDate) {
                                metadata.releaseDate = result.releaseDate;
                            }
                            if (result.previewUrl) {
                                metadata.previewUrl = result.previewUrl;
                                metadata.audioUrl = result.previewUrl;
                            }

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
                                if (albumInfo.releaseDate) {
                                    metadata.releaseDate = albumInfo.releaseDate;
                                }
                                metadata.tracks = tracks.map((t: any) => ({
                                    title: t.trackName,
                                    artist: t.artistName,
                                    duration: Math.floor(t.trackTimeMillis / 1000),
                                    trackNumber: t.trackNumber,
                                    cover: (t.artworkUrl100 || '').replace('100x100bb', '1000x1000bb') || metadata.cover,
                                    releaseDate: t.releaseDate || albumInfo.releaseDate,
                                    previewUrl: t.previewUrl || undefined,
                                    audioUrl: t.previewUrl || undefined
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
                let cleanT = metadata.title;
                // Handle "Artist - Title" commonly found on YouTube
                if (cleanT.includes(' - ') || cleanT.includes(' \u2014 ')) {
                    let parts = cleanT.split(/ - | \u2014 /);
                    let lastPartLower = parts[parts.length - 1].toLowerCase();
                    
                    // If the last part is just noise like "audio" or "official video", strip it
                    if (['audio', 'lyric', 'official', 'video', 'visualizer'].some(kw => lastPartLower.includes(kw))) {
                        parts = parts.slice(0, -1);
                        cleanT = parts.join(' - ');
                    } 
                    
                    // After potentially stripping noise, check if it's "Artist - Title"
                    if (parts.length >= 2) {
                        metadata.artist = decode(parts[0].trim());
                        cleanT = parts.slice(1).join(' - ');
                    }
                }
                metadata.title = decode(cleanT.trim());
            }
            if (metadata.artist) metadata.artist = decode(metadata.artist.split(' | ')[0].split(' · ')[0].trim());

            // 4.5 Eagerly attempt to upgrade cover logic to high quality square cover (for Spotify/Generic fetches)
            if (metadata.title && metadata.artist && !url.includes('music.apple.com') && !metadata.isCollection) {
                // Refine metadata BEFORE retrieving the high quality square cover to clean up titles/artists for iTunes!
                ExternalMetadataService.refineMetadata(metadata);
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

            // Clean tracks if any and run refinement on each track to boost downstream syncing/sync matching
            if (metadata.tracks) {
                metadata.tracks = metadata.tracks.map(t => {
                    const cleanTrack = {
                        title: decode(t.title),
                        artist: decode(t.artist),
                        cover: t.cover || '',
                        duration: t.duration,
                        trackNumber: t.trackNumber,
                        lyrics: t.lyrics,
                        featuredArtists: t.featuredArtists
                    };
                    ExternalMetadataService.refineMetadata(cleanTrack);
                    return {
                        ...t,
                        title: cleanTrack.title,
                        artist: cleanTrack.artist,
                        featuredArtists: cleanTrack.featuredArtists
                    };
                });

                // Assign default album cover to tracks in collection if missing
                for (const track of metadata.tracks) {
                    if (!track.cover) {
                        track.cover = metadata.cover || '';
                    }
                }
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

    static async fetchLyricsFromLRCLib(title: string, artist: string, durationSeconds?: number): Promise<string | undefined> {
        try {
            const cleanTitle = title.replace(/\(.*\)/g, '').replace(/\[.*\]/g, '').trim();
            const cleanArtist = artist.split(',')[0].split('&')[0].trim();
            let url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(cleanTitle)}`;
            if (durationSeconds && durationSeconds > 0) {
                url += `&duration=${durationSeconds}`;
            }
            try {
                const res = await axios.get(url, { timeout: 4000 });
                if (res.data) {
                    return res.data.syncedLyrics || res.data.plainLyrics;
                }
            } catch (err: any) {
                if (err.response && err.response.status === 404 && durationSeconds) {
                    console.log(`[Lyrics] Strict match failed for ${cleanTitle}, falling back to search...`);
                    const searchUrl = `https://lrclib.net/api/search?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(cleanTitle)}`;
                    const searchRes = await axios.get(searchUrl, { timeout: 4000 });
                    if (searchRes.data && searchRes.data.length > 0) {
                        return searchRes.data[0].syncedLyrics || searchRes.data[0].plainLyrics;
                    }
                }
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
    static async searchITunesMetadata(title: string, artist: string, album?: string): Promise<{ coverUrl: string | null; releaseDate: string | null; genre: string | null } | null> {
        try {
            const cleanArtist = artist
                .replace(/\s*-\s*topic$/i, '')
                .replace(/\s*vevo$/i, '')
                .trim();

            const query = `${cleanArtist} ${title}`.trim();
            const itunesRes = await axios.get(
                `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=5`,
                { timeout: 5000 }
            );

            if (itunesRes.data.results && itunesRes.data.results.length > 0) {
                const results = itunesRes.data.results;
                const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
                const normTitle = normalize(title);
                const normArtist = normalize(cleanArtist);

                let bestResult = results[0];
                let bestScore = -1;

                for (const r of results) {
                    const rTitle = normalize(r.trackName || '');
                    const rArtist = normalize(r.artistName || '');
                    let score = 0;
                    if (rTitle === normTitle) score += 3;
                    else if (rTitle.includes(normTitle) || normTitle.includes(rTitle)) score += 1;
                    if (rArtist === normArtist) score += 3;
                    else if (rArtist.includes(normArtist) || normArtist.includes(rArtist)) score += 1;
                    if (score > bestScore) { bestScore = score; bestResult = r; }
                }

                if (bestScore >= 2) {
                    let hqArt = bestResult.artworkUrl100 || bestResult.artworkUrl60 || null;
                    if (hqArt) {
                        hqArt = hqArt.replace(/[0-9]+x[0-9]+[a-zA-Z]*/i, '1000x1000bb');
                    }
                    console.log(`[iTunesSearch] Match (score ${bestScore}): "${bestResult.trackName}" by "${bestResult.artistName}"`);
                    return {
                        coverUrl: hqArt,
                        releaseDate: bestResult.releaseDate || null,
                        genre: bestResult.primaryGenreName || null
                    };
                }
            }
        } catch (e) {
            console.warn('[iTunesSearch] Search failed:', (e as any).message);
        }
        return null;
    }

    static async getHighQualitySquareCover(title: string, artist: string, album?: string): Promise<string | null> {
        try {
            // Priority 1: iTunes API — search with title+artist, pick the closest match
            const cleanArtist = artist
                .replace(/\s*-\s*topic$/i, '')
                .replace(/\s*vevo$/i, '')
                .trim();

            // Search with title + artist for precision, fetch top 5 and pick best match
            const query = `${cleanArtist} ${title}`.trim();
            const itunesRes = await axios.get(
                `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=5`,
                { timeout: 5000 }
            );

            if (itunesRes.data.results && itunesRes.data.results.length > 0) {
                const results = itunesRes.data.results;

                // Score each result by how closely title and artist match
                const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
                const normTitle = normalize(title);
                const normArtist = normalize(cleanArtist);

                let bestResult = results[0];
                let bestScore = -1;

                for (const r of results) {
                    const rTitle = normalize(r.trackName || '');
                    const rArtist = normalize(r.artistName || '');
                    let score = 0;
                    if (rTitle === normTitle) score += 3;
                    else if (rTitle.includes(normTitle) || normTitle.includes(rTitle)) score += 1;
                    if (rArtist === normArtist) score += 3;
                    else if (rArtist.includes(normArtist) || normArtist.includes(rArtist)) score += 1;
                    if (score > bestScore) { bestScore = score; bestResult = r; }
                }

                let hqArt = bestResult.artworkUrl100 || bestResult.artworkUrl60;
                if (hqArt && bestScore >= 2) {
                    hqArt = hqArt.replace(/[0-9]+x[0-9]+[a-zA-Z]*/i, '1000x1000bb');
                    console.log(`[Artwork] iTunes HQ Match (score ${bestScore}): "${bestResult.trackName}" by "${bestResult.artistName}" → ${hqArt}`);
                    return hqArt;
                } else if (bestScore < 2) {
                    console.warn(`[Artwork] iTunes match score too low (${bestScore}) for "${title}" by "${artist}" — skipping to avoid wrong art`);
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
                const sortedThumbs = [...video.thumbnails]
                    .filter((t: any) => t && t.url)
                    .sort((a: any, b: any) => (b.width || 0) - (a.width || 0));
                let bestThumb = sortedThumbs.length > 0 ? sortedThumbs[0].url : video.thumbnails[video.thumbnails.length - 1].url;
                if (bestThumb) {
                    if (bestThumb.includes('hqdefault.jpg')) {
                        bestThumb = bestThumb.replace('hqdefault.jpg', 'maxresdefault.jpg');
                    }
                    bestThumb = bestThumb.split('?')[0];
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

        // 5. Clean brackets/parentheses/braces from Title for known noise ONLY.
        //    We want to keep almost everything else (like feat, sped up, etc. or just extra song info)
        const NOISE_KEYWORDS = [
            'official video',
            'official music video',
            'official lyric video',
            'official audio',
            'lyric video',
            'lyrics',
            'audio',
            'music video',
            'visualizer'
        ];

        metadata.title = metadata.title.replace(/(\s*\([^)]*\)|\s*\[[^\]]*\]|\s*\{[^}]*\})/gi, (match) => {
            const lowerMatch = match.toLowerCase();
            if (NOISE_KEYWORDS.some(kw => lowerMatch.includes(kw))) {
                return ''; // Remove known noise
            }
            return match; // Keep everything else
        }).replace(/\s+/g, ' ').trim();

        if (metadata.title !== originalTitle) {
            console.log(`[Metadata] Title refined: "${originalTitle}" -> "${metadata.title}"`);
        }
    }

    static async fetchAudio(title: string, artist: string, targetDuration?: number, directUrl?: string, options: { preview?: boolean; bypassCache?: boolean } = {}): Promise<{ url: string; duration?: number; sourceType?: string; watchUrl?: string }> {
        const cacheKey = `${title}:${artist}:${targetDuration || 'any'}:f`;
        const cached = audioSearchCache.get(cacheKey);
        if (!options.bypassCache && cached && cached.expires > Date.now() && (!options.preview || !cached.url.includes('/stream-youtube'))) {
            console.log(`[SmartAudio] Cache hit for: "${title}" by "${artist}"`);
            return cached;
        }

        console.log(`[SmartAudio] Initiating intake for: "${title}" by "${artist}" (Target: ${targetDuration}s)`);
        const tempDir = os.tmpdir();

        // Fast iTunes search preview-first optimization
        if (options.preview) {
            try {
                console.log(`[SmartAudio] Preview requested. Attempting iTunes search lookup...`);
                const cleanTitle = title.split('|')[0].replace(/\(Lyric Video\)/i, '').replace(/\(Official Audio\)/i, '').replace(/\(Official Video\)/i, '').replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
                const titleParts = title.split('|').map(s => s.trim());
                const featuredNames = titleParts.slice(1).join(' ').replace(/\|/g, ' ').trim();
                const cleanArtist = artist.replace(/\s*-\s*topic$/i, '').replace(/\s*vevo$/i, '').replace(/\|.*/g, '').replace(/\(.*?\)/g, '').trim();

                const isGenericArtist = !cleanArtist || cleanArtist.toLowerCase().includes('various artist') || cleanArtist.toLowerCase().includes('unknown');

                const queriesToTry = [
                    cleanTitle,
                    `${cleanTitle} ${featuredNames}`.trim(),
                    !isGenericArtist ? `${cleanArtist} ${cleanTitle}`.trim() : null,
                ].filter((q): q is string => !!q && q.length > 2);

                let match: any = null;
                for (const query of queriesToTry) {
                    try {
                        console.log(`[SmartAudio] Searching iTunes with query: "${query}"`);
                        const itunesRes = await axios.get(
                            `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=5`,
                            { timeout: 3500 }
                        );
                        if (itunesRes.data.results && itunesRes.data.results.length > 0) {
                            const candidateMatch = itunesRes.data.results.find((r: any) => r.previewUrl);
                            if (candidateMatch) {
                                match = candidateMatch;
                                break;
                            }
                        }
                    } catch (qErr) {
                        // Continue to next query
                    }
                }
                
                if (match && match.previewUrl) {
                    console.log(`[SmartAudio] iTunes direct preview URL found: ${match.previewUrl}`);
                    
                    let ytWatchUrl: string | undefined = undefined;
                    try {
                        const ytCandidates = await ExternalMetadataService.searchYoutubeDirect(`${cleanArtist} ${cleanTitle} official audio`).catch(() => []);
                        if (ytCandidates && ytCandidates.length > 0) {
                            ytWatchUrl = `https://www.youtube.com/watch?v=${ytCandidates[0].id}`;
                        }
                    } catch (ytSearchErr) {
                        console.warn(`[SmartAudio] Fast YouTube search failed:`, ytSearchErr);
                    }

                    const previewResult = {
                        url: match.previewUrl,
                        duration: match.trackTimeMillis ? Math.floor(match.trackTimeMillis / 1000) : undefined,
                        sourceType: 'itunes_direct_preview',
                        watchUrl: ytWatchUrl || match.trackViewUrl || directUrl || undefined
                    };
                    
                    audioSearchCache.set(cacheKey, { ...previewResult, expires: Date.now() + CACHE_TTL });
                    return previewResult;
                }
            } catch (err: any) {
                console.warn(`[SmartAudio] iTunes preview lookup failed:`, err.message);
            }
        }

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
                let info: any = null;
                try {
                    const infoCmd = `${YT_DLP_COMMAND} --dump-json --no-playlist "${directUrl}"`;
                    const { stdout: infoJson } = await execPromise(infoCmd);
                    info = JSON.parse(infoJson);
                } catch (infoErr: any) {
                    console.warn(`[SmartAudio] yt-dlp direct url info dump failed: ${infoErr.message}. Bypassing info query...`);
                }

                const duration = info?.duration || targetDuration || 180;

                // Preview mode: try fast iTunes direct preview stream first
                if (options.preview) {
                    try {
                        const cleanTitle = title.split('|')[0].replace(/\(Lyric Video\)/i, '').replace(/\(Official Audio\)/i, '').replace(/\(Official Video\)/i, '').replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
                        const titleParts = title.split('|').map(s => s.trim());
                        const featuredNames = titleParts.slice(1).join(' ').replace(/\|/g, ' ').trim();
                        const cleanArtist = artist.replace(/\s*-\s*topic$/i, '').replace(/\s*vevo$/i, '').replace(/\|.*/g, '').replace(/\(.*?\)/g, '').trim();

                        const queriesToTry = [
                            cleanTitle,
                            `${cleanTitle} ${featuredNames}`.trim(),
                            `${cleanArtist} ${cleanTitle}`.trim(),
                        ].filter(q => q.length > 2);

                        for (const query of queriesToTry) {
                            try {
                                const itunesRes = await axios.get(
                                    `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=5`,
                                    { timeout: 3500 }
                                );
                                if (itunesRes.data.results && itunesRes.data.results.length > 0) {
                                    const match = itunesRes.data.results.find((r: any) => r.previewUrl);
                                    if (match && match.previewUrl) {
                                        console.log(`[SmartAudio] iTunes direct preview URL found for directUrl: ${match.previewUrl}`);
                                        return {
                                            url: match.previewUrl,
                                            duration: match.trackTimeMillis ? Math.floor(match.trackTimeMillis / 1000) : duration,
                                            sourceType: 'itunes_direct_preview',
                                            watchUrl: directUrl
                                        };
                                    }
                                }
                            } catch (qErr) {}
                        }
                    } catch (itunesErr: any) {
                        console.warn(`[SmartAudio] iTunes preview check for directUrl failed:`, itunesErr.message);
                    }

                    try {
                        const streamUrl = await ExternalMetadataService.fetchYoutubeAudioViaPublicAPI(directUrl);
                        if (streamUrl) {
                            console.log(`[SmartAudio] Preview stream URL obtained for direct URL`);
                            return { url: streamUrl, duration, sourceType: 'direct_yt_preview', watchUrl: directUrl };
                        }
                    } catch (previewErr: any) {
                        console.warn(`[SmartAudio] Preview stream fetch failed: ${previewErr.message}`);
                    }
                    console.warn("[SmartAudio] Preview stream failed for direct URL. Falling back to search matching...");
                } else {
                    // Full download mode: download and upload to R2
                    try {
                        const fileId = `direct-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
                        const fileStem = path.join(tempDir, fileId);
                        await ExternalMetadataService.execYtDlp(`-f "ba[ext=m4a]/ba" --no-playlist --quiet`, directUrl, fileStem);
                        const actualFile = findActualFile(fileStem);
                        if (actualFile) {
                            const buffer = fs.readFileSync(actualFile);
                            const fileKey = `zenify/direct_imports/${fileId}${path.extname(actualFile)}`;
                            const publicUrl = await uploadToR2(fileKey, buffer, path.extname(actualFile) === '.mp3' ? 'audio/mpeg' : 'audio/mp4');
                            fs.unlinkSync(actualFile);
                            return { url: publicUrl, duration, sourceType: 'direct_yt', watchUrl: directUrl };
                        }
                    } catch (directErr: any) {
                        console.error("[SmartAudio] Direct URL resolution failed:", directErr.message);
                    }
                    console.warn("[SmartAudio] Direct URL processing failed. Falling back to search matching...");
                }
            }

            // 1. Multi-Candidate Search with Validator Checklist
            const getCandidates = async (q: string) => {
                try {
                    console.log(`[SmartAudio] Trying play-dl search for query: "${q}"`);
                    const play = require('play-dl');
                    const playResults = await play.search(q, { limit: 10 });
                    if (playResults && playResults.length > 0) {
                        return playResults.map((r: any) => ({
                            id: r.id,
                            title: r.title,
                            duration: r.durationInSec,
                            uploader: r.channel?.name || ''
                        }));
                    }
                } catch (playSearchErr: any) {
                    console.warn(`[SmartAudio] play-dl search failed: ${playSearchErr.message}`);
                }

                try {
                    console.log(`[SmartAudio] Trying yt-dlp search for query: "${q}"`);
                    const searchCommand = `${YT_DLP_COMMAND} --socket-timeout 20 --no-check-certificates --dump-json --flat-playlist --no-warnings --no-check-certificates "ytsearch10:${q}"`;
                    const { stdout } = await execPromise(searchCommand);
                    const results = stdout.trim().split('\n').filter(l => l.trim()).map(line => {
                        try { return JSON.parse(line); } catch { return null; }
                    }).filter(v => v);
                    if (results && results.length > 0) {
                        return results;
                    }
                    console.warn('[SmartAudio] yt-dlp search returned 0 candidates. Falling back to alternative search methods...');
                } catch (ytSearchErr: any) {
                    console.warn(`[SmartAudio] yt-dlp search failed (${ytSearchErr.message.slice(0, 120)}). Trying fallback search methods...`);
                }

                // Fallback 1: Direct YouTube HTML Search Scraper
                const directResults = await ExternalMetadataService.searchYoutubeDirect(q);
                if (directResults && directResults.length > 0) {
                    return directResults;
                }

                // Fallback 2: FreightPass (Y2Mate clone) Scraper
                const fpResults = await ExternalMetadataService.searchYoutubeViaFreightPass(q);
                if (fpResults && fpResults.length > 0) {
                    return fpResults;
                }

                // Fallback 3: HexaDesigns (Mp3Juice clone) Scraper
                const hdResults = await ExternalMetadataService.searchYoutubeViaHexaDesigns(q);
                if (hdResults && hdResults.length > 0) {
                    return hdResults;
                }

                return [];
            };


            console.log("[SmartAudio] Fetching audio candidates for validator checklist...");
            const primaryArtist = artist.split(',')[0].trim().replace(/\s*feat\.?\s*.*/i, '').replace(/\s*ft\.?\s*.*/i, '').trim();
            
            // Run multiple searches concurrently to cast a wide net
            const [officialCands, topicCands, cleanCands] = await Promise.all([
                getCandidates(`${primaryArtist} ${title} official audio`).catch(() => []),
                getCandidates(`${primaryArtist} ${title} topic`).catch(() => []),
                getCandidates(`${primaryArtist} ${title}`).catch(() => [])
            ]);

            // Combine and deduplicate candidates by ID
            const allCandidates = [...topicCands, ...officialCands, ...cleanCands];
            const seenIds = new Set();
            let candidates = [];
            for (const cand of allCandidates) {
                if (!seenIds.has(cand.id)) {
                    seenIds.add(cand.id);
                    candidates.push(cand);
                }
            }

            const scored = candidates.map((v: any) => ({
                ...v,
                score: validateMatch(v.title, v.uploader || v.channel || '', v.duration, v.uploader || v.channel)
            })).sort((a,b) => b.score - a.score);

            // Log top candidates for debugging
            scored.slice(0, 3).forEach(c => console.log(`[SmartAudio] Candidate: "${c.title}" | Score: ${c.score} | Duration: ${c.duration}s`));

            const valid = scored.filter(v => v.score >= 45);

            // Pick the best candidate: preferably one that meets the threshold, otherwise the best available
            const best = valid.length > 0 ? valid[0] : (scored.length > 0 ? scored[0] : null);

            if (!best) {
                throw new Error("Validation Failed: No audio candidates found at all.");
            }

            if (valid.length === 0) {
                console.warn(`[SmartAudio] Top candidate scored low (${best.score}), but using as fallback: "${best.title}"`);
            }

            const result = (async () => {
                console.log(`[SmartAudio] Selected candidate: "${best.title}" (Score: ${best.score}, Duration: ${best.duration}s)`);
                const videoUrl = `https://www.youtube.com/watch?v=${best.id}`;
                const sourceType = best.score >= 45 ? 'smart_validated' : 'smart_fallback';
                
                // If we only need a preview, do not download the file to R2
                if (options.preview) {
                    try {
                        const streamUrl = await ExternalMetadataService.fetchYoutubeAudioViaPublicAPI(videoUrl);
                        if (streamUrl) {
                            return { url: streamUrl, duration: best.duration, sourceType, watchUrl: videoUrl };
                        }
                    } catch (e: any) {
                        console.warn("[SmartAudio] Preview stream fetch failed, returning watchUrl:", e.message);
                    }
                    // Return the watchUrl as the url so it resolves quickly (preview player might fail, but it won't crash server)
                    return { url: videoUrl, duration: best.duration, sourceType: 'preview_only', watchUrl: videoUrl };
                }
                
                const fileId = `smart-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
                const fileStem = path.join(tempDir, fileId);
                
                console.log("[SmartAudio] Downloading audio with fallback support...");
                await ExternalMetadataService.execYtDlp(`-f "ba[ext=m4a]/ba" --no-playlist --quiet`, videoUrl, fileStem);
                
                const actualFile = findActualFile(fileStem);
                if (actualFile) {
                    const buffer = fs.readFileSync(actualFile);
                    const fileKey = `zenify/smart_imports/${fileId}${path.extname(actualFile)}`;
                    const publicUrl = await uploadToR2(fileKey, buffer, path.extname(actualFile) === '.mp3' ? 'audio/mpeg' : 'audio/mp4');
                    fs.unlinkSync(actualFile);
                    return { url: publicUrl, duration: best.duration, sourceType, watchUrl: videoUrl };
                }
                throw new Error("File extraction failed");
            })();

            const finalResult = await result;
            audioSearchCache.set(cacheKey, { ...finalResult, expires: Date.now() + CACHE_TTL });
            return finalResult;
        } catch (err: any) {
             console.error(`[SmartAudio] Intake failed for ${title}:`, err.message);
             if (options.preview) {
                 try {
                     console.log(`[SmartAudio] Preview fallback: searching iTunes for "${artist} - ${title}"`);
                     const cleanArtist = artist.replace(/\s*-\s*topic$/i, '').replace(/\s*vevo$/i, '').trim();
                     const query = `${cleanArtist} ${title}`.trim();
                     const itunesRes = await axios.get(
                         `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=5`,
                         { timeout: 5000 }
                     );
                     if (itunesRes.data.results && itunesRes.data.results.length > 0) {
                         const match = itunesRes.data.results[0];
                         if (match.previewUrl) {
                             console.log(`[SmartAudio] iTunes fallback preview URL found: ${match.previewUrl}`);
                             const fallbackResult = {
                                 url: match.previewUrl,
                                 duration: match.trackTimeMillis ? Math.floor(match.trackTimeMillis / 1000) : undefined,
                                 sourceType: 'itunes_fallback',
                                 watchUrl: match.trackViewUrl || undefined
                             };
                             audioSearchCache.set(cacheKey, { ...fallbackResult, expires: Date.now() + CACHE_TTL });
                             return fallbackResult;
                         }
                     }
                 } catch (fallbackErr: any) {
                     console.warn(`[SmartAudio] iTunes preview fallback failed:`, fallbackErr.message);
                 }
             }
             throw err;
        }
    }

    /**
     * Helper to execute yt-dlp with automatic fallback for format/bot-detection issues.
     */
    public static async execYtDlp(args: string, url: string, fileStem?: string): Promise<string> {
        if (url.includes('music.youtube.com')) {
            url = url.replace('music.youtube.com', 'youtube.com');
        }

        const outputArg = fileStem ? `-o "${fileStem}.%(ext)s"` : "";
        // Removed --force-ipv6 as it causes instant failure on networks without outbound IPv6
        const commonFlags = '--socket-timeout 30 --extractor-retries 3 --no-check-certificates --no-warnings';

        const isMetadataQuery = args.includes('--dump-json') || 
                                args.includes('--write-subs') || 
                                args.includes('--write-auto-subs') || 
                                args.includes('--skip-download') || 
                                args.includes('--flat-playlist') ||
                                args.includes('-g') ||
                                args.includes('--get-url');

        // Strategy 1: Try public/alternative APIs first (no yt-dlp needed)
        if (!isMetadataQuery && (url.includes('youtube.com') || url.includes('youtu.be'))) {
            try {
                console.log('[SmartAudio] Trying public API extraction first...');
                const streamUrl = await ExternalMetadataService.fetchYoutubeAudioViaPublicAPI(url);
                if (streamUrl) {
                    if (fileStem) {
                        const dest = `${fileStem}.mp3`;
                        await ExternalMetadataService.downloadFile(streamUrl, dest);
                        console.log(`[SmartAudio] Public API download successful: ${dest}`);
                    }
                    return streamUrl;
                }
            } catch (apiErr: any) {
                console.warn(`[SmartAudio] Public API failed: ${apiErr.message.slice(0, 80)}`);
            }
        }

        // Strategy 2: yt-dlp with clients that work without PO tokens on cloud IPs (Prioritizing IPv6)
        const strategies = [
            {
                name: 'tv_embedded client',
                cmd: `${YT_DLP_COMMAND} ${commonFlags} ${args} --extractor-args "youtube:player_client=tv_embedded" -f "bestaudio[ext=m4a]/bestaudio/best" ${outputArg} "${url}"`
            },
            {
                name: 'web_creator client',
                cmd: `${YT_DLP_COMMAND} ${commonFlags} ${args} --extractor-args "youtube:player_client=web_creator" -f "bestaudio[ext=m4a]/bestaudio/best" ${outputArg} "${url}"`
            },
            {
                name: 'mweb client',
                cmd: `${YT_DLP_COMMAND} ${commonFlags} ${args} --extractor-args "youtube:player_client=mweb" -f "bestaudio/best" ${outputArg} "${url}"`
            },
            {
                name: 'default (no client override)',
                cmd: `${YT_DLP_COMMAND} ${commonFlags} ${args} -f "bestaudio[ext=m4a]/bestaudio/best" ${outputArg} "${url}"`
            },
            {
                name: 'ios client',
                cmd: `${YT_DLP_COMMAND} ${commonFlags} ${args} --extractor-args "youtube:player_client=ios" -f "bestaudio/best" ${outputArg} "${url}"`
            },
            {
                name: 'android_vr client',
                cmd: `${YT_DLP_COMMAND} ${commonFlags} ${args} --extractor-args "youtube:player_client=android_vr" -f "bestaudio/best" ${outputArg} "${url}"`
            },
            {
                name: 'tv_embedded client (IPv6)',
                cmd: `${YT_DLP_COMMAND} --force-ipv6 ${commonFlags} ${args} --extractor-args "youtube:player_client=tv_embedded" -f "bestaudio[ext=m4a]/bestaudio/best" ${outputArg} "${url}"`
            },
            {
                name: 'web_creator client (IPv6)',
                cmd: `${YT_DLP_COMMAND} --force-ipv6 ${commonFlags} ${args} --extractor-args "youtube:player_client=web_creator" -f "bestaudio[ext=m4a]/bestaudio/best" ${outputArg} "${url}"`
            },
        ];

        for (const strategy of strategies) {
            try {
                console.log(`[SmartAudio] Trying yt-dlp ${strategy.name}...`);
                const { stdout } = await execPromise(strategy.cmd);
                console.log(`[SmartAudio] Success with ${strategy.name}`);
                return stdout;
            } catch (err: any) {
                console.warn(`[SmartAudio] ${strategy.name} failed: ${err.message.slice(0, 100)}`);
            }
        }

        // Strategy 3: Final retry of public APIs
        console.warn("[SmartAudio] All yt-dlp strategies failed. Final API retry...");
        try {
            const streamUrl = await ExternalMetadataService.fetchYoutubeAudioViaPublicAPI(url);
            if (streamUrl) {
                if (fileStem) {
                    const dest = `${fileStem}.mp3`;
                    await ExternalMetadataService.downloadFile(streamUrl, dest);
                }
                return streamUrl;
            }
        } catch (e: any) {
            console.error("[SmartAudio] Final API retry failed:", e.message);
        }

        throw new Error(`Audio intake failed: All download methods exhausted. Please ensure yt-dlp is updated (run: yt-dlp -U or pip install -U yt-dlp). YouTube may also be blocking requests temporarily.`);
    }

    /**
     * Downloads a file from direct URL to disk.
     */
    public static async downloadFile(url: string, outputPath: string): Promise<void> {
        console.log(`[SmartAudio] Downloading stream directly to: ${outputPath}`);
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 30000
        });

        const writer = fs.createWriteStream(outputPath);

        return new Promise<void>((resolve, reject) => {
            let lastBytes = 0;
            let currentBytes = 0;
            
            // Watchdog: reject if no data received for 20 seconds
            const timer = setInterval(() => {
                if (currentBytes === lastBytes) {
                    clearInterval(timer);
                    response.data.destroy();
                    writer.destroy();
                    reject(new Error("Download stream stalled (no data received for 20s)"));
                } else {
                    lastBytes = currentBytes;
                }
            }, 20000);

            response.data.on('data', (chunk: any) => {
                currentBytes += chunk.length;
            });

            response.data.on('error', (err: any) => {
                clearInterval(timer);
                reject(err);
            });

            writer.on('finish', () => {
                clearInterval(timer);
                resolve();
            });

            writer.on('error', (err: any) => {
                clearInterval(timer);
                reject(err);
            });

            response.data.pipe(writer);
        });
    }

    /**
     * Fetches YouTube audio stream URLs via multiple public APIs and Invidious instances.
     * Order: Invidious -> Piped -> Cobalt -> direct page extraction -> yt-dlp -g
     */
    public static async fetchYoutubeAudioViaPublicAPI(youtubeUrl: string): Promise<string | null> {
        const videoIdMatch = youtubeUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([^&\s?#]+)/);
        const videoId = videoIdMatch ? videoIdMatch[1] : null;

        if (!videoId) {
            console.warn('[SmartAudio] Could not extract video ID from URL:', youtubeUrl);
            return null;
        }

        console.log(`[SmartAudio] Routing audio preview for video ${videoId} to internal stream proxy`);
        return `/api/utils/stream-youtube?url=${encodeURIComponent(youtubeUrl)}`;
    }

    /**
     * Fallback 1: Scrapes YouTube search page directly via axios and parses ytInitialData.
     */
    public static async searchYoutubeDirect(query: string): Promise<any[]> {
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        try {
            console.log(`[SmartAudio] [YoutubeDirect] Searching directly for: "${query}"`);
            const res = await axios.get(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
                headers: {
                    'User-Agent': userAgent,
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                timeout: 8000
            });
            const html = res.data;
            const match = html.match(/var ytInitialData\s*=\s*({.*?});/);
            if (!match) {
                console.warn('[YoutubeDirect] Could not find ytInitialData in HTML');
                return [];
            }

            const data = JSON.parse(match[1]);
            let contents = null;
            try {
                contents = data.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents[0].itemSectionRenderer.contents;
            } catch (e) {}

            if (!contents) {
                try {
                    const items = data.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents;
                    for (const item of items) {
                        if (item.itemSectionRenderer) {
                            contents = item.itemSectionRenderer.contents;
                            break;
                        }
                    }
                } catch (e) {}
            }

            if (!contents) {
                console.warn('[YoutubeDirect] Could not parse contents path in ytInitialData');
                return [];
            }

            const results: any[] = [];
            for (const item of contents) {
                if (item.videoRenderer) {
                    const vr = item.videoRenderer;
                    const title = vr.title?.runs?.[0]?.text || vr.title?.accessibility?.accessibilityData?.label || 'Unknown Title';
                    const id = vr.videoId;
                    const durationText = vr.lengthText?.simpleText || '';
                    const uploader = vr.ownerText?.runs?.[0]?.text || vr.shortBylineText?.runs?.[0]?.text || 'Unknown';
                    
                    let durationSeconds = 180;
                    if (durationText) {
                        const parts = durationText.split(':').map((x: string) => parseInt(x, 10));
                        if (parts.every((x: number) => !isNaN(x))) {
                            if (parts.length === 2) {
                                durationSeconds = parts[0] * 60 + parts[1];
                            } else if (parts.length === 3) {
                                durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
                            }
                        }
                    }

                    results.push({
                        id,
                        title,
                        duration: durationSeconds,
                        uploader,
                        channel: uploader
                    });
                }
            }
            console.log(`[YoutubeDirect] Successfully scraped ${results.length} candidates.`);
            return results;
        } catch (e: any) {
            console.error('[YoutubeDirect] Direct search failed:', e.message);
            return [];
        }
    }

    /**
     * Fallback 2: Queries FreightPass (Y2Mate clone) JSON endpoint.
     */
    public static async searchYoutubeViaFreightPass(query: string): Promise<any[]> {
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        try {
            console.log(`[SmartAudio] [FreightPass] Searching for: "${query}"`);
            const res1 = await axios.post('https://freightpass.ca/convert/', 
                new URLSearchParams({ q: query }).toString(), 
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': userAgent
                    },
                    timeout: 8000
                }
            );

            const finalUrl = res1.request.res.responseUrl || 'https://freightpass.ca/convert/';
            const res2 = await axios.post(finalUrl, {}, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': userAgent
                },
                timeout: 8000
            });

            if (Array.isArray(res2.data)) {
                const results = res2.data.map((item: any) => {
                    let durationSeconds = 180;
                    if (item.duration && typeof item.duration === 'string' && item.duration.includes(':')) {
                        const parts = item.duration.split(':').map((x: string) => parseInt(x, 10));
                        if (parts.every((x: number) => !isNaN(x))) {
                            if (parts.length === 2) {
                                durationSeconds = parts[0] * 60 + parts[1];
                            } else if (parts.length === 3) {
                                durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
                            }
                        }
                    }
                    const uploader = item.artist || 'Unknown';
                    return {
                        id: item.id,
                        title: item.title,
                        duration: durationSeconds,
                        uploader: uploader,
                        channel: uploader
                    };
                });
                console.log(`[FreightPass] Successfully retrieved ${results.length} candidates.`);
                return results;
            }
        } catch (e: any) {
            console.error('[FreightPass] Search fallback failed:', e.message);
        }
        return [];
    }

    /**
     * Fallback 3: Queries HexaDesigns (Mp3Juice clone) JSON endpoint.
     */
    public static async searchYoutubeViaHexaDesigns(query: string): Promise<any[]> {
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        try {
            console.log(`[SmartAudio] [HexaDesigns] Searching for: "${query}"`);
            const res = await axios.get(`https://hexadesigns.fr/grab/json.php?q=${encodeURIComponent(query)}`, {
                headers: {
                    'User-Agent': userAgent
                },
                timeout: 8000
            });

            if (res.data && Array.isArray(res.data.items)) {
                const results = res.data.items.map((item: any) => {
                    let durationSeconds = 180;
                    if (item.duration && typeof item.duration === 'string' && item.duration.includes(':')) {
                        const parts = item.duration.split(':').map((x: string) => parseInt(x, 10));
                        if (parts.every((x: number) => !isNaN(x))) {
                            if (parts.length === 2) {
                                durationSeconds = parts[0] * 60 + parts[1];
                            } else if (parts.length === 3) {
                                durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
                            }
                        }
                    }
                    const uploaderParts = [item.artist, item.views, item.duration].filter(
                        (x: any) => typeof x === 'string' && x.length > 0 && !/^\d+(:\d+)+$/.test(x.trim())
                    );
                    const uploader = uploaderParts.join(' ') || 'Unknown';
                    return {
                        id: item.id,
                        title: item.title,
                        duration: durationSeconds,
                        uploader: uploader,
                        channel: uploader
                    };
                });
                console.log(`[HexaDesigns] Successfully retrieved ${results.length} candidates.`);
                return results;
            }
        } catch (e: any) {
            console.error('[HexaDesigns] Search fallback failed:', e.message);
        }
        return [];
    }




    // ========================================================
    // LYRICS FETCHER — multi-source with song structure formatting
    // ========================================================
    static async fetchLyrics(title: string, artist: string, durationSeconds?: number): Promise<string | null> {
        console.log(`[Lyrics] Fetching lyrics for: "${title}" by ${artist}`);

        // Try the enhanced service first (which includes cache, Musixmatch, etc.)
        const enhanced = await LyricsEnhancementService.getLyricsWithCache(title, artist, durationSeconds);
        if (enhanced && enhanced.lyrics) {
            return this.formatLyricsStructure(enhanced.lyrics);
        }

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

        // Source 1: lyrics.ovh (Free, no API key)
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

