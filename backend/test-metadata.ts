
import axios from 'axios';

async function testFetch() {
    const url = 'https://open.spotify.com/track/4f96pZ3YmXREt9IrS8u69n'; // Badass
    try {
        console.log('Testing metadata fetch for:', url);
        const res = await axios.get(`http://localhost:3000/api/metadata/fetch?url=${encodeURIComponent(url)}&fetchAudio=true`);
        console.log('Response Status:', res.status);
        console.log('Response Data:', JSON.stringify(res.data, null, 2));
    } catch (err) {
        console.error('Fetch failed:', err.response?.data || err.message);
    }
}

testFetch();
