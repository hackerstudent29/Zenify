import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../utils/prisma';
import { z } from 'zod';

import { syncArtistMetadata } from '../utils/artist-sync';
import { uploadUrlToCloudinary } from '../utils/cloudinary';


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
            const rawArtists = await prisma.artist.findMany({
                orderBy: { name: 'asc' },
                include: {
                    _count: {
                        select: { tracks: true, albums: true }
                    }
                }
            });

            // Lazy enrichment - fix images on the fly for canonical artists
            const artists = await Promise.all(rawArtists.map(a => syncArtistMetadata(a)));

            const response = JSON.parse(JSON.stringify(artists, (key, value) =>
                typeof value === 'bigint' ? value.toString() : value
            ));

            return reply.send(response);
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
                        where: { 
                            deletedAt: null,
                            OR: [
                                { releaseStatus: 'PUBLISHED' },
                                { releaseStatus: 'SCHEDULED', scheduledAt: { lte: new Date() } }
                            ]
                        },
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

            const response = JSON.parse(JSON.stringify(artist, (key, value) =>
                typeof value === 'bigint' ? value.toString() : value
            ));

            return reply.send(response);
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to fetch artist' });
        }
    };

    create = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const data = createArtistSchema.parse(request.body);

            // Check if artist with this name already exists to avoid Prisma crash
            const existing = await prisma.artist.findUnique({
                where: { name: data.name }
            });

            if (existing) {
                return reply.status(400).send({ error: 'An artist with this name already exists.' });
            }

            // Auto-fetch missing details via AI / Web Scraping
            let bioToSave = data.bio;
            let dobToSave = (data.birthDate && data.birthDate.trim() !== "") ? new Date(data.birthDate) : null;
            let finalImageUrl = data.imageUrl || null;
            let finalCoverUrl = data.coverUrl || null;
            let roleToSave = data.role;

            if (!bioToSave || !dobToSave || !finalImageUrl || !finalCoverUrl || !roleToSave) {
                try {
                    const { AIArtistService } = await import('../services/ai-artist.service');
                    const enriched = await AIArtistService.enrichArtistProfile(data.name);
                    
                    if (!bioToSave && enriched.bio) bioToSave = enriched.bio;
                    if (!dobToSave && enriched.dob) dobToSave = enriched.dob;
                    if (!finalImageUrl && enriched.imageUrl) finalImageUrl = enriched.imageUrl;
                    if (!finalCoverUrl && enriched.coverUrl) finalCoverUrl = enriched.coverUrl;
                    if (!roleToSave && enriched.genre) roleToSave = enriched.genre;
                } catch (enrichErr) {
                    request.log.warn(`[ArtistController] AI enrichment failed for ${data.name}`);
                }
            }

            const imageUrl = finalImageUrl ? await uploadUrlToCloudinary(finalImageUrl, 'zenify/artists/profile') : null;
            const coverUrl = finalCoverUrl ? await uploadUrlToCloudinary(finalCoverUrl, 'zenify/artists/banner') : null;

            const artist = await prisma.artist.create({
                data: {
                    name: data.name,
                    bio: bioToSave,
                    role: roleToSave,
                    imageUrl,
                    coverUrl,
                    verified: data.verified ?? false,
                    birthDate: dobToSave,
                    monthlyListeners: data.monthlyListeners || 0,
                    totalStreams: BigInt(data.totalStreams || 0),
                }
            });

            // Reliable serialization for BigInt
            const response = JSON.parse(JSON.stringify(artist, (key, value) =>
                typeof value === 'bigint' ? value.toString() : value
            ));

            return reply.status(201).send(response);
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                return reply.status(400).send({ error: error.format() });
            }

            // Handle unique constraint violation specifically if findUnique was bypassed
            if (error.code === 'P2002') {
                return reply.status(400).send({ error: 'An artist with this name already exists.' });
            }

            request.log.error(error);
            return reply.status(500).send({ error: error.message || 'Failed to create artist' });
        }
    };

    update = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
            const { id } = request.params;
            const data = updateArtistSchema.parse(request.body);

            const imageUrl = data.imageUrl !== undefined ? (data.imageUrl ? await uploadUrlToCloudinary(data.imageUrl, 'zenify/artists/profile') : null) : undefined;
            const coverUrl = data.coverUrl !== undefined ? (data.coverUrl ? await uploadUrlToCloudinary(data.coverUrl, 'zenify/artists/banner') : null) : undefined;

            const artist = await prisma.artist.update({
                where: { id },
                data: {
                    name: data.name,
                    bio: data.bio,
                    role: data.role,
                    imageUrl,
                    coverUrl,
                    verified: data.verified,
                    birthDate: data.birthDate === null ? null : (data.birthDate ? new Date(data.birthDate) : undefined),
                    monthlyListeners: data.monthlyListeners,
                    totalStreams: data.totalStreams !== undefined ? BigInt(data.totalStreams) : undefined,
                }
            });

            const response = JSON.parse(JSON.stringify(artist, (key, value) =>
                typeof value === 'bigint' ? value.toString() : value
            ));

            return reply.send(response);
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
