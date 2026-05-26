
const axios = require('axios');

async function testOEmbed(url) {
    try {
        console.log(`Testing OEmbed for: ${url}`);
        let oembedUrl = '';
        if (url.includes('spotify')) {
            oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
        } else if (url.includes('apple')) {
            oembedUrl = `https://itunes.apple.com/lookup?id=${url.match(/\/id(\d+)/)?.[1]}`;
        }

        if (!oembedUrl) {
            console.log("No OEmbed URL generated");
            return;
        }

        const response = await axios.get(oembedUrl);
        console.log('Response:', JSON.stringify(response.data, null, 2));
    } catch (err) {
        console.error("Error:", err.message);
        if (err.response) {
            console.error("Data:", err.response.data);
        }
    }
}

async function run() {
    await testOEmbed('https://open.spotify.com/track/4cOdzh0m2nf9Yv39vV9Rny');
    await testOEmbed('https://music.apple.com/us/album/never-gonna-give-you-up/1558533900?i=1558534271');
}

run();
