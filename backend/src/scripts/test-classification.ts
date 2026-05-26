import { AIArtistService } from '../services/ai-artist.service';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function main() {
    console.log("Testing classification for 'passo bem belto' by 'atlxs'...");
    
    const result = await AIArtistService.classifyTrack(
        "Some Track Title", 
        "atlxs", 
        "passo bem belto", 
        "Indie pop track"
    );

    console.log("Result:", result);
}

main().catch(e => console.error(e));
