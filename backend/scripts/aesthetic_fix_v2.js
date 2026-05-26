const axios = require('axios');

const API_BASE = 'http://127.0.0.1:3000/api';

const AESTHETIC_PHOTOS = [
    'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=1000&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1514525253361-b83f859b73c0?q=80&w=1000&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=1000&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1000&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=1000&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1511379938547-c1f69419868d?q=80&w=1000&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1478720568477-152d9b164e26?q=80&w=1000&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1496307653780-38ee777d1dc3?q=80&w=1000&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?q=80&w=1000&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=1000&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=1000&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?q=80&w=1000&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1516280440614-37939bbacd81?q=80&w=1000&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=1000&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=1000&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1518173946687-a4c8a3b7468e?q=80&w=1000&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?q=80&w=1000&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1453090927415-5f45085b65c0?q=80&w=1000&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1553356084-58ef4a67b2a7?q=80&w=1000&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop',
];

async function overhaulAesthetics() {
    try {
        console.log('🚀 Starting Comprehensive Aesthetic Overhaul (v2)...');

        const tracksRes = await axios.get(`${API_BASE}/tracks`);
        const tracks = tracksRes.data.items;

        console.log(`🎵 Found ${tracks.length} tracks.`);

        for (const track of tracks) {
            if (!track.coverUrl || track.coverUrl.includes('picsum') || track.coverUrl.includes('placeholder')) {
                const randomPhoto = AESTHETIC_PHOTOS[Math.floor(Math.random() * AESTHETIC_PHOTOS.length)];
                await axios.patch(`${API_BASE}/tracks/${track.id}`, { coverUrl: randomPhoto });
                console.log(`✅ Fixed Track: ${track.title}`);
            }
        }

        const artistsRes = await axios.get(`${API_BASE}/tracks/artists`);
        const artists = artistsRes.data;
        for (const artist of artists) {
            if (!artist.imageUrl || artist.imageUrl.includes('picsum')) {
                const randomPhoto = AESTHETIC_PHOTOS[Math.floor(Math.random() * AESTHETIC_PHOTOS.length)];
                await axios.patch(`${API_BASE}/tracks/artists/${artist.id}`, { imageUrl: randomPhoto });
                console.log(`✅ Fixed Artist: ${artist.name}`);
            }
        }

        console.log('✨ Aesthetic Overhaul Complete!');
    } catch (error) {
        console.error('❌ Overhaul failed:', error.message);
    }
}

overhaulAesthetics();
