const axios = require("axios");
const fs = require("fs");

async function test() {
    try {
        const res = await axios.get("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M", {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        // Find session data
        const sessionMatch = res.data.match(/<script id="session" data-testid="session" type="application\/json">({.*?})<\/script>/);
        if (sessionMatch) {
            const session = JSON.parse(sessionMatch[1]);
            const token = session.accessToken;
            console.log("Got token!", token.substring(0, 10));
            // Fetch playlist data
            const plRes = await axios.get("https://api.spotify.com/v1/playlists/37i9dQZF1DXcBWIGoYBM5M", {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            console.log("Tracks:", plRes.data.tracks.items.length);
            console.log("First Track:", plRes.data.tracks.items[0].track.name);
        } else {
            console.log("No session script found.");
        }
    } catch(err) { console.error(err.message); }
}
test();
