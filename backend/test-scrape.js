
const axios = require('axios');

async function scrapeMetadata(url) {
    try {
        console.log(`Scraping: ${url}`);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            }
        });
        const html = response.data;

        let metadata = {
            title: '',
            artist: '',
            cover: '',
            album: '',
            url: url
        };

        if (url.includes('spotify.com')) {
            // Spotify often has og:title as "Song Name - Single by Artist Name | Spotify"
            const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1];
            if (ogTitle) {
                if (ogTitle.includes(' - ')) {
                    const parts = ogTitle.split(' - ');
                    metadata.title = parts[0].trim();
                    metadata.artist = parts[1].split(' | ')[0].split(' - ')[0].replace('song by ', '').replace('Single by ', '').trim();
                } else {
                    metadata.title = ogTitle;
                }
            }
            metadata.cover = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
        } else if (url.includes('music.apple.com')) {
            metadata.title = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1];
            metadata.artist = html.match(/<meta name="apple:description" content="([^"]+)"/)?.[1] ||
                html.match(/<meta property="og:description" content="([^"]+)"/)?.[1];
            metadata.cover = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];

            // Refine artist from "Song Name by Artist Name"
            if (metadata.title && metadata.title.includes(' by ')) {
                const parts = metadata.title.split(' by ');
                metadata.title = parts[0].trim();
                metadata.artist = parts[1].trim();
            }
        }

        return metadata;
    } catch (err) {
        return { error: err.message };
    }
}

async function run() {
    const results = [];
    results.push(await scrapeMetadata('https://open.spotify.com/track/0VjIj97GzhYhR6pccv8ZMT'));
    results.push(await scrapeMetadata('https://music.apple.com/us/album/blinding-lights/1488400116?i=1488400117'));
    console.log(JSON.stringify(results, null, 2));
}

run();
