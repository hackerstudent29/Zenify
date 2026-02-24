
const axios = require('axios');
async function test() {
    try {
        const res = await axios.get('https://www.google.com');
        console.log('Google status:', res.status);
    } catch (e) {
        console.log('Error:', e.message);
    }
}
test();
