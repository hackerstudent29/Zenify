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
    isCollection?: boolean;
    tracks?: Array<{
        title: string;
        artist: string;
        duration?: number;
        trackNumber?: number;
    }>;
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
            // Priority 1: Apple Music iTunes API (Very Reliable)
            if (url.includes('music.apple.com')) {
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

                    // Attempt to extract artist and track count from ogDesc
                    if (ogDesc) {
                        const decodedDesc = decode(ogDesc);

                        if (!metadata.artist) {
                            const descParts = decodedDesc.split(' · ');
                            if (descParts.length >= 2) {
                                metadata.artist = descParts[1].replace(/Playlist by /i, '').replace(/Album by /i, '').trim();
                            }
                        }

                        // Extract track count - more robust regex
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

                    // Priority 3: JSON-LD Parsing (Highly reliable for Spotify/Apple)
                    if (!metadata.tracks || metadata.tracks.length === 0) {
                        const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]+?)<\/script>/);
                        if (jsonLdMatch) {
                            try {
                                const ld = JSON.parse(jsonLdMatch[1]);
                                const count = ld.numberOfItems || ld.track?.length || (ld.itemListElement && ld.itemListElement.length);
                                if (count && metadata.isCollection) {
                                    metadata.tracks = Array(count).fill(null).map((_, i) => ({
                                        title: ld.itemListElement?.[i]?.item?.name || `Track ${i + 1}`,
                                        artist: ld.itemListElement?.[i]?.item?.byArtist?.name || metadata.artist || 'Unknown Artist',
                                        isPlaceholder: !ld.itemListElement?.[i]?.item?.name,
                                    }));
                                }
                            } catch (e) {
                                console.warn("Failed to parse JSON-LD for metadata.");
                            }
                        }
                    }

                    // Priority 4: Deep HTML Regex Search (Last Resort for Count)
                    if (metadata.isCollection && (!metadata.tracks || metadata.tracks.length === 0)) {
                        const patterns = [
                            /["']track_count["']\s*:\s*(\d+)/,
                            /["']total_count["']\s*:\s*(\d+)/,
                            /["']itemCount["']\s*:\s*(\d+)/,
                            /(\d+)\s*songs/i,
                            /(\d+)\s*tracks/i
                        ];
                        for (const p of patterns) {
                            const m = html.match(p);
                            if (m) {
                                const count = parseInt(m[1]);
                                if (count > 0) {
                                    metadata.tracks = Array(count).fill(null).map((_, i) => ({
                                        title: `Track ${i + 1}`,
                                        artist: metadata.artist || 'Unknown Artist',
                                        isPlaceholder: true,
                                    }));
                                    break;
                                }
                            }
                        }
                    }

                    // For Spotify collections, full tracklist scraping usually requires API or deep JSON-LD parsing
                } else if (url.includes('music.apple.com')) {
                    if (ogTitle?.includes(' by ')) {
                        const parts = ogTitle.split(' by ');
                        metadata.title = parts[0].trim();
                        metadata.artist = parts[1].trim();
                    }
                }
            }

            if (metadata.title) metadata.title = decode(metadata.title.replace(/ \u2014 .*$/, '').replace(/ - .*$/, '').trim());
            if (metadata.artist) metadata.artist = decode(metadata.artist.split(' | ')[0].split(' · ')[0].trim());

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

    static async fetchAudio(title: string, artist: string): Promise<{ url: string; duration?: number }> {
        const query = `${artist} - ${title} official audio`;
        const tempDir = os.tmpdir();
        const filename = `fetch-${Date.now()}-${Math.floor(Math.random() * 1000)}.m4a`;
        const outputPath = path.join(tempDir, filename);

        try {
            console.log(`Starting cloud audio fetch for: ${query}`);
            const command = `python -m yt_dlp -f "ba[ext=m4a]" --no-playlist --no-warnings --print-to-file "after_move:filepath" "${outputPath}.tmp" "ytsearch1:${query}" -o "${outputPath}"`;

            try {
                await execPromise(command);
            } catch (err) {
                console.warn("yt-dlp warning during cloud fetch:", err);
            }

            if (fs.existsSync(outputPath)) {
                console.log("Uploading track to Cloudinary...");
                // Upload to Cloudinary
                const result = await cloudinary.uploader.upload(outputPath, {
                    resource_type: 'video', // 'video' covers audio in cloudinary
                    folder: 'zenify/temp_imports',
                    public_id: filename.replace('.m4a', ''),
                });

                // Delete local temp file immediately after upload
                fs.unlinkSync(outputPath);

                if (!result || !result.secure_url) {
                    throw new Error("Cloudinary upload failed");
                }

                return {
                    url: result.secure_url,
                    duration: result.duration ? Math.round(result.duration) : undefined
                };
            }
            throw new Error("File not found after download");
        } catch (err: any) {
            console.error("Audio Fetch Error:", err.message);
            // Delete temp file if it exists and error happened
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            throw err;
        }
    }
}
