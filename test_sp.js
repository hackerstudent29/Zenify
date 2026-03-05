const axios = require("axios");

async function test() {
    try {
        const res = await axios.get("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M", {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0.4472.124' }
        });
        const html = res.data;
        const songTags = html.match(/<meta\s+name="music:song"\s+content="[^"]+"/g);
        console.log("Found song tags:", songTags ? songTags.length : 0);
        
        const trackMatches = [...html.matchAll(/<meta\s+name="music:song"\s+content="https:\/\/open\.spotify\.com\/track\/([^"]+)"/g)];
        console.log("Track IDs:", trackMatches.map(m => m[1]).slice(0, 5));
        
        // Let's see if we can find titles. Is there JSON-LD? NO. Is there an initial state?
        // Let's search for some track titles
        let titles = [...html.matchAll(/<meta\s+property="music:song:title"\s+content="([^"]+)"/g)];
        console.log("Titles:", titles.length);
    } catch(err) { console.error(err); }
}
test();
