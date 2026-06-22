import { uploadUrlToCloudinary, deleteFromCloudinary } from '../utils/cloudinary';
import { uploadUrlToR2, deleteUrlFromR2 } from '../utils/s3';

async function main() {
    console.log("--- TEST 1: Extract Proxy URL and Upload to Cloudinary ---");
    const proxyUrl = "http://localhost:3000/api/utils/proxy-image?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1511671782779-c97d3d27a1d4%3Fw%3D500";
    console.log(`Pasting proxy URL: ${proxyUrl}`);
    const cloudinaryUrl = await uploadUrlToCloudinary(proxyUrl, 'zenify/test');
    console.log(`Uploaded Cloudinary URL: ${cloudinaryUrl}`);
    if (cloudinaryUrl && cloudinaryUrl.includes('res.cloudinary.com')) {
        console.log("✅ Success: External proxy URL was resolved and uploaded to Cloudinary!");
    } else {
        console.log("❌ Failure: Proxy URL was not resolved/uploaded.");
    }

    console.log("\n--- TEST 2: Delete Old Cloudinary Asset ---");
    if (cloudinaryUrl && cloudinaryUrl.includes('res.cloudinary.com')) {
        console.log(`Deleting Cloudinary URL: ${cloudinaryUrl}`);
        const deleted = await deleteFromCloudinary(cloudinaryUrl);
        console.log(`Deletion Result: ${deleted}`);
        if (deleted) {
            console.log("✅ Success: Old Cloudinary asset was destroyed!");
        } else {
            console.log("❌ Failure: Asset could not be destroyed.");
        }
    }

    console.log("\n--- TEST 3: Upload URL to R2 ---");
    const audioTestUrl = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";
    console.log(`Downloading direct audio URL: ${audioTestUrl}`);
    const r2Url = await uploadUrlToR2(audioTestUrl, 'zenify/test-tracks');
    console.log(`Uploaded R2 URL: ${r2Url}`);
    if (r2Url && (r2Url.includes('r2.dev') || r2Url.includes('mock-r2'))) {
        console.log("✅ Success: External audio file was uploaded to R2!");
    } else {
        console.log("❌ Failure: Audio file was not uploaded to R2.");
    }

    console.log("\n--- TEST 4: Delete R2 Asset ---");
    if (r2Url) {
        console.log(`Deleting R2 URL: ${r2Url}`);
        await deleteUrlFromR2(r2Url);
        console.log("✅ Success: Delete command sent to R2!");
    }
}

main().catch(console.error);
