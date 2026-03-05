const axios = require("axios");

async function test() {
    try {
        const res = await axios.get("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M", {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' }
        });
        const html = res.data;
        const tracks = [];
        const matches = [...html.matchAll(/<meta\s+name="music:song"\s+content="https:\/\/open\.spotify\.com\/track\/([^"]+)"/g)];
        console.log("Found track matches:", matches.length);
        
        // Spotify puts track titles/artists in `<meta property="og:description"` somewhat or a <script id="initial-state">
        const initial = html.match(/<script id="initial-state" type="text\/plain">([^<]+)<\/script>/);
        if (initial) {
            const data = JSON.parse(Buffer.from(initial[1], 'base64').toString('utf-8'));
            console.log("Got initial state JSON length:", Object.keys(data).length);
        }
    } catch(err) { console.error(err.message); }
}
test();
