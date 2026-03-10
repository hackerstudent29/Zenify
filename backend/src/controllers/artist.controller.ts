import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../utils/prisma';
import { z } from 'zod';

export const createArtistSchema = z.object({
    name: z.string().min(1),
    bio: z.string().optional(),
    role: z.string().optional().nullable(),
    birthDate: z.string().optional().nullable(),
    imageUrl: z.string().optional().nullable(),
    coverUrl: z.string().optional().nullable(),
    verified: z.boolean().optional().default(false),
    monthlyListeners: z.number().optional().default(0),
    totalStreams: z.number().optional().default(0),
});

export const updateArtistSchema = z.object({
    name: z.string().min(1).optional(),
    bio: z.string().optional(),
    role: z.string().optional().nullable(),
    birthDate: z.string().optional().nullable(),
    imageUrl: z.string().optional().nullable(),
    coverUrl: z.string().optional().nullable(),
    verified: z.boolean().optional(),
    monthlyListeners: z.number().optional(),
    totalStreams: z.number().optional(),
});

export class ArtistController {
    constructor(private server: any) { }

    getAll = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const artists = await prisma.artist.findMany({
                orderBy: { name: 'asc' },
                include: {
                    _count: {
                        select: { tracks: true, albums: true }
                    }
                }
            });
            return reply.send(artists);
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to fetch artists' });
        }
    };

    getOne = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
            const { id } = request.params;
            const artist = await prisma.artist.findUnique({
                where: { id },
                include: {
                    tracks: {
                        where: { deletedAt: null },
                        orderBy: { createdAt: 'desc' },
                        include: { album: true }
                    },
                    albums: {
                        orderBy: { releaseDate: 'desc' }
                    }
                }
            });

            if (!artist) {
                return reply.status(404).send({ error: 'Artist not found' });
            }

            return reply.send(artist);
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to fetch artist' });
        }
    };

    create = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const data = createArtistSchema.parse(request.body);

            const artist = await prisma.artist.create({
                data: {
                    name: data.name,
                    bio: data.bio,
                    role: data.role,
                    imageUrl: data.imageUrl,
                    coverUrl: data.coverUrl,
                    verified: data.verified,
                    birthDate: data.birthDate ? new Date(data.birthDate) : null,
                    monthlyListeners: data.monthlyListeners,
                    totalStreams: data.totalStreams,
                } as any
            });

            return reply.status(201).send(artist);
        } catch (error) {
            if (error instanceof z.ZodError) {
                return reply.status(400).send({ error: error.format() });
            }
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to create artist' });
        }
    };

    update = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
            const { id } = request.params;
            const data = updateArtistSchema.parse(request.body);

            const artist = await prisma.artist.update({
                where: { id },
                data: {
                    name: data.name,
                    bio: data.bio,
                    role: data.role,
                    imageUrl: data.imageUrl,
                    coverUrl: data.coverUrl,
                    verified: data.verified,
                    birthDate: data.birthDate === null ? null : (data.birthDate ? new Date(data.birthDate) : undefined),
                    monthlyListeners: data.monthlyListeners,
                    totalStreams: data.totalStreams,
                } as any
            });

            return reply.send(artist);
        } catch (error) {
            if (error instanceof z.ZodError) {
                return reply.status(400).send({ error: error.format() });
            }
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to update artist' });
        }
    };

    delete = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
            const { id } = request.params;

            // Check if artist has tracks or albums
            const tracksCount = await prisma.track.count({ where: { artistId: id, deletedAt: null } });
            const albumsCount = await prisma.album.count({ where: { artistId: id } });

            if (tracksCount > 0 || albumsCount > 0) {
                return reply.status(400).send({
                    error: `Cannot delete artist. They have ${tracksCount} tracks and ${albumsCount} albums. Move or delete them first.`
                });
            }

            await prisma.artist.delete({
                where: { id }
            });

            return reply.status(204).send();
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to delete artist' });
        }
    };
}
