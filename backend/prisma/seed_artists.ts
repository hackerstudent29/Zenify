/// <reference types="node" />
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const artists = [
    { name: "Anirudh Ravichander", imageUrl: "https://i.scdn.co/image/ab6761610000e5eb4e6015504193d56733f37318", follower_count: 5200000, verified: true },
    { name: "Hip Hop Thamizha", imageUrl: "https://i.scdn.co/image/ab6761610000e5eb4e6015504193d56733f37318", follower_count: 3100000, verified: true },
    { name: "A.R. Rahman", imageUrl: "https://i.scdn.co/image/ab6761610000e5eb4e6015504193d56733f37318", follower_count: 8500000, verified: true },
    { name: "Yuvan Shankar Raja", imageUrl: "https://i.scdn.co/image/ab6761610000e5eb4e6015504193d56733f37318", follower_count: 4200000, verified: true },
    { name: "G.V. Prakash Kumar", imageUrl: "https://i.scdn.co/image/ab6761610000e5eb4e6015504193d56733f37318", follower_count: 2800000, verified: true },
    { name: "Harris Jayaraj", imageUrl: "https://i.scdn.co/image/ab6761610000e5eb4e6015504193d56733f37318", follower_count: 2500000, verified: true },
    { name: "Sai Abhyankar", imageUrl: "https://i.scdn.co/image/ab6761610000e5eb4e6015504193d56733f37318", follower_count: 1200000, verified: true },
    { name: "Ilayaraja", imageUrl: "https://i.scdn.co/image/ab6761610000e5eb4e6015504193d56733f37318", follower_count: 3500000, verified: true },
    { name: "Deva", imageUrl: "https://i.scdn.co/image/ab6761610000e5eb4e6015504193d56733f37318", follower_count: 1500000, verified: true },
    { name: "Santhosh Narayanan", imageUrl: "https://i.scdn.co/image/ab6761610000e5eb4e6015504193d56733f37318", follower_count: 2100000, verified: true },
    { name: "Sam CS", imageUrl: "https://i.scdn.co/image/ab6761610000e5eb4e6015504193d56733f37318", follower_count: 900000, verified: true },
    { name: "Sean Roldan", imageUrl: "https://i.scdn.co/image/ab6761610000e5eb4e6015504193d56733f37318", follower_count: 700000, verified: true },
    { name: "Leon James", imageUrl: "https://i.scdn.co/image/ab6761610000e5eb4e6015504193d56733f37318", follower_count: 500000, verified: true },
];

async function main() {
    for (const artist of artists) {
        await prisma.artist.upsert({
            where: { name: artist.name },
            update: {
                imageUrl: artist.imageUrl,
                follower_count: artist.follower_count,
                verified: artist.verified
            },
            create: {
                name: artist.name,
                imageUrl: artist.imageUrl,
                follower_count: artist.follower_count,
                verified: artist.verified
            },
        });
    }
    console.log("Seed completed!");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
