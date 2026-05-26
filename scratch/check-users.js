const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany({
        select: { id: true, email: true, role: true, isVerified: true }
    });
    console.log(JSON.stringify(users, null, 2));
}

main().catch(err => {
    console.error(err);
    process.exit(1);
}).finally(async () => {
    await prisma.$disconnect();
});
