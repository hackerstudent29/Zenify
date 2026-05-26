
import { seedRichArtistMetadata } from './src/scripts/enrich-artists';

async function main() {
    await seedRichArtistMetadata();
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
