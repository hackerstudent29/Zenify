
import axios from 'axios';

async function testImport() {
    const API_URL = 'http://localhost:3000/api';
    console.log('Testing Import to:', API_URL);

    try {
        const importData = {
            title: "Rowdy Baby",
            artistName: "Dhanush & Dhee",
            audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
            coverUrl: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17",
            genre: "Kuthu",
            albumTitle: "Maari 2",
            trackNumber: 1,
            duration: 280
        };

        console.log('Sending import request...');
        const res = await axios.post(`${API_URL}/tracks/import-external`, importData);
        console.log('SUCCESS:', res.status, res.data);
    } catch (e: any) {
        console.error('FAILED:', e.response?.status, e.response?.data || e.message);
    }
}

testImport();
