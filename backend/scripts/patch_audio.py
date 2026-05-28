import sys

NEW_METHODS = '''    /**
     * Helper to execute yt-dlp with automatic fallback for format/bot-detection issues.
     */
    public static async execYtDlp(args: string, url: string, fileStem?: string): Promise<string> {
        const outputArg = fileStem ? `-o "${fileStem}.%(ext)s"` : "";
        const commonFlags = '--socket-timeout 30 --extractor-retries 3 --no-check-certificates --no-warnings';

        // Strategy 1: Try public/alternative APIs first (no yt-dlp needed)
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
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

        // Strategy 2: yt-dlp with clients that work without PO tokens on cloud IPs
        const strategies = [
            {
                name: 'tv_embedded client',
                cmd: `${YT_DLP_COMMAND} ${commonFlags} --extractor-args "youtube:player_client=tv_embedded" -f "bestaudio[ext=m4a]/bestaudio/best" ${outputArg} "${url}"`
            },
            {
                name: 'web_creator client',
                cmd: `${YT_DLP_COMMAND} ${commonFlags} --extractor-args "youtube:player_client=web_creator" -f "bestaudio[ext=m4a]/bestaudio/best" ${outputArg} "${url}"`
            },
            {
                name: 'mweb client',
                cmd: `${YT_DLP_COMMAND} ${commonFlags} --extractor-args "youtube:player_client=mweb" -f "bestaudio/best" ${outputArg} "${url}"`
            },
            {
                name: 'default (no client override)',
                cmd: `${YT_DLP_COMMAND} ${commonFlags} -f "bestaudio[ext=m4a]/bestaudio/best" ${outputArg} "${url}"`
            },
            {
                name: 'ios client',
                cmd: `${YT_DLP_COMMAND} ${commonFlags} --extractor-args "youtube:player_client=ios" -f "bestaudio/best" ${outputArg} "${url}"`
            },
            {
                name: 'android_vr client',
                cmd: `${YT_DLP_COMMAND} ${commonFlags} --extractor-args "youtube:player_client=android_vr" -f "bestaudio/best" ${outputArg} "${url}"`
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
            timeout: 45000
        });

        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    }

    /**
     * Fetches YouTube audio stream URLs via multiple public APIs and Invidious instances.
     * Order: Invidious -> Piped -> Cobalt -> direct page extraction -> yt-dlp -g
     */
    public static async fetchYoutubeAudioViaPublicAPI(youtubeUrl: string): Promise<string | null> {
        const videoIdMatch = youtubeUrl.match(/(?:youtube\\.com\\/watch\\?v=|youtu\\.be\\/)([^&\\s]+)/);
        const videoId = videoIdMatch ? videoIdMatch[1] : null;

        if (!videoId) {
            console.warn('[SmartAudio] Could not extract video ID from URL');
            return null;
        }

        // Strategy 1: Invidious public instances (most reliable on cloud IPs)
        const invidiousInstances = [
            'https://invidious.nerdvpn.de',
            'https://invidious.privacydev.net',
            'https://inv.nadeko.net',
            'https://invidious.fdn.fr',
            'https://invidious.lunar.icu',
            'https://yt.cdaut.de',
            'https://invidious.perennialte.ch',
        ];

        for (const instance of invidiousInstances) {
            try {
                console.log(`[SmartAudio] Trying Invidious: ${instance}`);
                const res = await axios.get(`${instance}/api/v1/videos/${videoId}`, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 8000
                });

                const formats: any[] = res.data?.adaptiveFormats || res.data?.formatStreams || [];
                const audioFormats = formats
                    .filter((f: any) => f.type?.startsWith('audio') && f.url)
                    .sort((a: any, b: any) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0));

                if (audioFormats.length > 0) {
                    console.log(`[SmartAudio] Invidious success via ${instance}`);
                    return audioFormats[0].url;
                }
            } catch (err: any) {
                console.warn(`[SmartAudio] Invidious ${instance} failed: ${err.message.slice(0, 60)}`);
            }
        }

        // Strategy 2: Piped API instances
        const pipedInstances = [
            'https://pipedapi.kavin.rocks',
            'https://pipedapi.adminforge.de',
            'https://pipedapi.tokhmi.xyz',
            'https://pipedapi.moomoo.me',
        ];

        for (const instance of pipedInstances) {
            try {
                console.log(`[SmartAudio] Trying Piped: ${instance}`);
                const res = await axios.get(`${instance}/streams/${videoId}`, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 8000
                });

                const audioStreams: any[] = res.data?.audioStreams || [];
                const best = audioStreams
                    .filter((s: any) => s.url)
                    .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];

                if (best?.url) {
                    console.log(`[SmartAudio] Piped success via ${instance}`);
                    return best.url;
                }
            } catch (err: any) {
                console.warn(`[SmartAudio] Piped ${instance} failed: ${err.message.slice(0, 60)}`);
            }
        }

        // Strategy 3: Cobalt API (updated endpoint)
        const cobaltInstances = [
            'https://api.cobalt.tools',
            'https://cobalt.api.ryzen.cc',
        ];

        for (const instance of cobaltInstances) {
            try {
                console.log(`[SmartAudio] Trying Cobalt: ${instance}`);
                const res = await axios.post(`${instance}/`, {
                    url: youtubeUrl,
                    downloadMode: 'audio',
                    audioFormat: 'best',
                }, {
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0',
                    },
                    timeout: 10000
                });

                const streamUrl = res.data?.url || res.data?.stream;
                if (streamUrl) {
                    console.log(`[SmartAudio] Cobalt success via ${instance}`);
                    return streamUrl;
                }
            } catch (err: any) {
                console.warn(`[SmartAudio] Cobalt ${instance} failed: ${err.message.slice(0, 60)}`);
            }
        }

        // Strategy 4: Direct YouTube page extraction
        try {
            console.log('[SmartAudio] Trying direct YouTube page extraction...');
            const response = await axios.get(`https://www.youtube.com/watch?v=${videoId}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
                timeout: 10000
            });

            const html = response.data as string;
            const match = html.match(/ytInitialPlayerResponse\\s*=\\s*({.+?})\\s*;/);
            if (match) {
                const playerResponse = JSON.parse(match[1]);
                const formats: any[] = [
                    ...(playerResponse?.streamingData?.adaptiveFormats || []),
                    ...(playerResponse?.streamingData?.formats || []),
                ];
                const audioFormat = formats
                    .filter((f: any) => f.mimeType?.startsWith('audio') && f.url)
                    .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];

                if (audioFormat?.url) {
                    console.log('[SmartAudio] Direct page extraction success');
                    return audioFormat.url;
                }
            }
        } catch (directErr: any) {
            console.warn('[SmartAudio] Direct page extraction failed:', directErr.message.slice(0, 80));
        }

        // Strategy 5: yt-dlp -g (stream URL only, no download)
        try {
            console.log('[SmartAudio] Trying yt-dlp -g (stream URL only)...');
            const clients = ['tv_embedded', 'web_creator', 'mweb'];
            for (const client of clients) {
                try {
                    const { stdout } = await execPromise(
                        `${YT_DLP_COMMAND} --no-check-certificates --no-warnings --extractor-args "youtube:player_client=${client}" -g -f "bestaudio[ext=m4a]/bestaudio/best" "https://www.youtube.com/watch?v=${videoId}"`
                    );
                    const streamUrl = stdout.trim().split('\\n')[0];
                    if (streamUrl?.startsWith('http')) {
                        console.log(`[SmartAudio] yt-dlp -g success with ${client}`);
                        return streamUrl;
                    }
                } catch { /* try next */ }
            }
        } catch (e: any) {
            console.warn('[SmartAudio] yt-dlp -g failed:', e.message.slice(0, 80));
        }

        return null;
    }

'''

with open('backend/src/services/external-metadata.service.ts', 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = '    /**\n     * Helper to execute yt-dlp with automatic fallback'
end_marker = '    /**\n     * Fallback 1: Scrapes YouTube search page'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print(f'ERROR: markers not found. start={start_idx}, end={end_idx}')
    sys.exit(1)

new_content = content[:start_idx] + NEW_METHODS + content[end_idx:]

with open('backend/src/services/external-metadata.service.ts', 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f'Done. Replaced chars {start_idx}-{end_idx} ({end_idx - start_idx} chars) with {len(NEW_METHODS)} chars')
