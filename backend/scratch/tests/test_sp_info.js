const axios = require("axios");
const cheerio = require("cheerio");

async function test() {
    try {
        const res = await axios.get("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M", { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const _ = cheerio.load(res.data);
        console.log("Title", _('meta[property="og:title"]').attr('content'));
        console.log("Desc", _('meta[property="og:description"]').attr('content'));
        let tracksUrl = [];
        _('meta[name="music:song"]').each((i, el) => {
             tracksUrl.push(_(el).attr('content'));
        });
        console.log("Tracks in meta tag:", tracksUrl.length);
        
        let tracksUrl2 = [];
        _('meta[property="music:song"]').each((i, el) => {
             tracksUrl2.push(_(el).attr('content'));
        });
        console.log("Tracks in meta property:", tracksUrl2.length);
        
        // Single track
        const resT = await axios.get("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT", { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const _2 = cheerio.load(resT.data);
        console.log("T:Title", _2('meta[property="og:title"]').attr('content'));
        console.log("T:Desc", _2('meta[property="og:description"]').attr('content'));
    } catch(err) { console.error(err.message, err.stack); }
}
test();
