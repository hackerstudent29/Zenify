import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { config } from './config/env';

async function main() {
    console.log('Setting CORS policy for R2 bucket...');
    if (!config.R2_ACCESS_KEY_ID || !config.R2_SECRET_ACCESS_KEY || !config.R2_ENDPOINT || !config.R2_BUCKET_NAME) {
        console.error('Error: R2 credentials are not fully configured in your .env file.');
        return;
    }

    const s3Client = new S3Client({
        region: 'auto',
        endpoint: config.R2_ENDPOINT,
        credentials: {
            accessKeyId: config.R2_ACCESS_KEY_ID,
            secretAccessKey: config.R2_SECRET_ACCESS_KEY,
        },
    });

    const command = new PutBucketCorsCommand({
        Bucket: config.R2_BUCKET_NAME,
        CORSConfiguration: {
            CORSRules: [
                {
                    AllowedHeaders: ['Range', 'Content-Type', 'Accept', 'Origin'],
                    AllowedMethods: ['GET', 'HEAD', 'OPTIONS'],
                    AllowedOrigins: ['*'],
                    ExposeHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Type'],
                    MaxAgeSeconds: 3000,
                },
            ],
        },
    });

    try {
        const response = await s3Client.send(command);
        console.log('Successfully set CORS policy on R2 bucket:', config.R2_BUCKET_NAME);
        console.log('Response:', response);
    } catch (error) {
        console.error('Failed to set CORS policy:', error);
    }
}

main();
