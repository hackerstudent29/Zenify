import axios from 'axios';

async function main() {
    try {
        console.log("Hitting API /api/tracks...");
        const res = await axios.get('http://localhost:3000/api/tracks?limit=10');
        console.log("Response status:", res.status);
        console.log("Response structure keys:", Object.keys(res.data));
        if (res.data.items && res.data.items.length > 0) {
            const first = res.data.items[0];
            console.log("First item keys:", Object.keys(first));
            console.log("First item title:", first.title);
            console.log("First item has lyrics:", first.lyrics !== undefined);
            console.log("First item has synced_lyrics:", first.synced_lyrics !== undefined);
            
            const goldenBrown = res.data.items.find((t: any) => t.title.includes("Golden Brown"));
            if (goldenBrown) {
                console.log("\nFound Golden Brown!");
                console.log("Golden Brown keys:", Object.keys(goldenBrown));
                console.log("Golden Brown lyrics length:", goldenBrown.lyrics ? goldenBrown.lyrics.length : 0);
                console.log("Golden Brown synced_lyrics count:", goldenBrown.synced_lyrics ? goldenBrown.synced_lyrics.length : 0);
                console.log("Golden Brown lyrics:", goldenBrown.lyrics);
                console.log("Golden Brown synced_lyrics:", goldenBrown.synced_lyrics);
            } else {
                console.log("\nGolden Brown not found in first 10 items.");
            }
        }
    } catch (e: any) {
        console.error("API request failed:", e.message);
    }
}

main();
