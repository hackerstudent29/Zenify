import { PrismaClient } from '@prisma/client'
import fs from 'fs'

const prisma = new PrismaClient()

async function main() {
    const tracks = await prisma.track.findMany({
        select: {
            id: true,
            title: true,
            coverUrl: true,
        }
    })
    fs.writeFileSync('tracks_debug.json', JSON.stringify(tracks, null, 2))
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
