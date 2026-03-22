const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Just find the last user who most likely is the one testing
    const users = await prisma.user.findMany({ 
        orderBy: { createdAt: 'desc' },
        take: 3
    });
    
    // For each user, set a valid public image if they don't have one (for testing)
    for (const user of users) {
        console.log(`Setting placeholder for ${user.email}`);
        await prisma.user.update({
            where: { id: user.id },
            data: { 
                avatarUrl: "https://ui-avatars.com/api/?name=" + encodeURIComponent(user.name || user.email) + "&background=random&color=fff&size=200"
            }
        });
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
}).finally(async () => {
    await prisma.$disconnect();
});
