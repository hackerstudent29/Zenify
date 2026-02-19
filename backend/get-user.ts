import { prisma } from './src/utils/prisma';
async function run() {
    const u = await prisma.user.findFirst();
    console.log('USER_ID:', u?.id);
    await prisma.$disconnect();
}
run();
