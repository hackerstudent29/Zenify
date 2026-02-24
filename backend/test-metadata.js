
const axios = require('axios');

async function getMetadata(url) {
    try {
        console.log(`Fetching metadata for: ${url}`);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 10000
        });
        const html = response.data;

        // Try multiple patterns for title
        let title = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ||
            html.match(/<title>([^<]+)<\/title>/)?.[1];

        // Try multiple patterns for image
        let image = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ||
            html.match(/<meta name="twitter:image" content="([^"]+)"/)?.[1];

        // Try to extract artist and track title if it's combined (e.g. "Track Name by Artist")
        let artist = "";
        if (title && title.includes(" by ")) {
            const parts = title.split(" by ");
            artist = parts[1].split(" | ")[0].split(" - ")[0].trim();
            title = parts[0].trim();
        } else if (title && title.includes(" - ")) {
            const parts = title.split(" - ");
            artist = parts[0].trim();
            title = parts[1].trim();
        }

        const description = html.match(/<meta property="og:description" content="([^"]+)"/)?.[1] ||
            html.match(/<meta name="description" content="([^"]+)"/)?.[1];

        return { title, artist, image, description };
    } catch (err) {
        return { error: err.message };
    }
}

async function runTests() {
    const urls = [
        'https://open.spotify.com/track/4cOdzh0m2nf9Yv39vV9Rny', // Never Gonna Give You Up
        'https://music.apple.com/us/album/never-gonna-give-you-up/1558533900?i=1558534271'
    ];

    for (const url of urls) {
        const meta = await getMetadata(url);
        console.log(`\nURL: ${url}`);
        console.log(JSON.stringify(meta, null, 2));
    }
}

runTests();
