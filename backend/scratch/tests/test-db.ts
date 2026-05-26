import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    try {
        const testUser = await prisma.user.upsert({
            where: { email: 'test_assistant@example.com' },
            update: {},
            create: {
                email: 'test_assistant@example.com',
                password: 'hashed_password_placeholder',
                role: 'LISTENER',
                isVerified: true,
            },
        });
        console.log('✅ Database write successful:', testUser.id);
        await prisma.user.delete({ where: { id: testUser.id } });
        console.log('✅ Database delete successful');
    } catch (err) {
        console.error('❌ Database error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
