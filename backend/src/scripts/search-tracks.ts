import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Searching database for notifications of user ramzendrum@gmail.com...");
    
    const notifications = await prisma.notification.findMany({
        where: {
            user: { email: 'ramzendrum@gmail.com' }
        },
        orderBy: {
            createdAt: 'desc'
        },
        take: 10
    });

    console.log(JSON.stringify(notifications, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
