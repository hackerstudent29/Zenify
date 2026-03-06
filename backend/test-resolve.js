
const axios = require('axios');

async function testResolve(url) {
    try {
        console.log(`Testing: ${url}`);
        const res = await axios.get(url, {
            maxRedirects: 10,
            timeout: 5000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const resolvedUrl = res.request?._redirectable?._currentUrl || res.request?.res?.responseUrl || res.request?.responseURL || res.config?.url;
        console.log(`Resolved to: ${resolvedUrl}`);
        return resolvedUrl;
    } catch (err) {
        console.error(`Failed: ${err.message}`);
        return null;
    }
}

// Test with a sample spotify.link if available, or just a regular link
testResolve('https://open.spotify.com/track/4PTG3upXkbbrccK9I6GqbG');
