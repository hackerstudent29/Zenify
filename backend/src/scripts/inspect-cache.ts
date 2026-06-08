import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

async function main() {
    console.log("Flushing Redis Cache to ensure frontend gets fresh data...");
    await redis.flushall();
    console.log("Cache flushed!");
}

main().catch(console.error).finally(() => {
    redis.quit();
});
