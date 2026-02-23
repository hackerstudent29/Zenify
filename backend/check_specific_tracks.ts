import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const tracks = await prisma.track.findMany({
        where: {
            OR: [
                { title: { contains: 'Eternal Rain' } },
                { title: { contains: 'Static Rain' } },
                { title: { contains: 'Maari' } },
            ]
        },
        select: {
            id: true,
            title: true,
            coverUrl: true,
            audioUrl: true,
        }
    })
    console.log(JSON.stringify(tracks, null, 2))
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
