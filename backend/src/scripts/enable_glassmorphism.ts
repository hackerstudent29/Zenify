const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Starting preferences update for all users...");
    const users = await prisma.user.findMany({ select: { id: true, email: true } });
    
    for (const user of users) {
        console.log(`Updating preferences for ${user.email} (${user.id})...`);
        const pref = await prisma.userPreferences.findUnique({
            where: { userId: user.id }
        });
        
        if (pref) {
            const updated = await prisma.userPreferences.update({
                where: { userId: user.id },
                data: {
                    sidebarStyle: "glassmorphism",
                    globalPlayerStyle: "glassmorphism",
                    fullviewReactiveBg: true
                }
            });
            console.log(`  Updated preferences:`, updated);
        } else {
            const created = await prisma.userPreferences.create({
                data: {
                    userId: user.id,
                    sidebarStyle: "glassmorphism",
                    globalPlayerStyle: "glassmorphism",
                    fullviewReactiveBg: true
                }
            });
            console.log(`  Created preferences:`, created);
        }
    }
    console.log("All users successfully updated!");
}

main().catch(e => {
    console.error(e);
    process.exit(1);
}).finally(async () => {
    await prisma.$disconnect();
});
