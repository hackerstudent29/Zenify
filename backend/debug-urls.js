
const axios = require('axios');

async function scrapeMetadata(url) {
    try {
        console.log(`Scraping: ${url}`);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
            timeout: 10000
        });
        const html = response.data;

        let metadata = {
            title: '',
            artist: '',
            cover: '',
            html_snippet: html.substring(0, 500)
        };

        const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1];
        const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
        const ogDesc = html.match(/<meta property="og:description" content="([^"]+)"/)?.[1];

        if (url.includes('spotify.com')) {
            if (ogTitle) {
                if (ogTitle.includes(' - ')) {
                    const parts = ogTitle.split(' - ');
                    metadata.title = parts[0].trim();
                    metadata.artist = parts[1].split(' | ')[0].replace(/song by /i, '').replace(/Single by /i, '').trim();
                } else {
                    metadata.title = ogTitle;
                }
            }
            metadata.cover = ogImage;
        } else if (url.includes('music.apple.com')) {
            if (ogTitle && ogTitle.includes(' by ')) {
                const parts = ogTitle.split(' by ');
                metadata.title = parts[0].trim();
                metadata.artist = parts[1].trim();
            } else {
                metadata.title = ogTitle;
            }
            metadata.cover = ogImage;
        }

        return metadata;
    } catch (err) {
        return { error: err.message };
    }
}

async function run() {
    const urls = [
        'https://open.spotify.com/track/5yKz9IRNzuWJiwXERpfVY3?si=07ae487d30d14106',
        'https://music.apple.com/in/album/donu-donu-donu-the-dons-romance/998319386?i=998319461'
    ];

    for (const url of urls) {
        const res = await scrapeMetadata(url);
        console.log(`\nURL: ${url}`);
        console.log(JSON.stringify(res, null, 2));
    }
}

run();
