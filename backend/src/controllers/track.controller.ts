import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { TrackService } from '../services/track.service';
import { CreateTrackInput, UpdateTrackInput, TrackQuery } from './track.schemas';

export class TrackController {
    private trackService: TrackService;

    constructor(server: FastifyInstance) {
        this.trackService = new TrackService(server);
    }

    create = async (req: FastifyRequest<{ Body: CreateTrackInput }>, reply: FastifyReply) => {
        const track = await this.trackService.create(req.body);
        return reply.status(201).send(track);
    }

    upload = async (req: FastifyRequest, reply: FastifyReply) => {
        // multipart must be enabled in route or globally
        // req.parts() returns an async iterator
        const parts = req.parts();
        const track = await this.trackService.upload(parts);
        return reply.status(201).send(track);
    }

    getAll = async (req: FastifyRequest<{ Querystring: TrackQuery }>, reply: FastifyReply) => {
        return this.trackService.findAll(req.query);
    }

    getFeatured = async (_req: FastifyRequest, _reply: FastifyReply) => {
        return this.trackService.getFeatured();
    }

    getTrending = async (_req: FastifyRequest, _reply: FastifyReply) => {
        return this.trackService.getTrending();
    }

    getOne = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        return this.trackService.findOne(req.params.id);
    }

    update = async (req: FastifyRequest<{ Params: { id: string }, Body: UpdateTrackInput }>, reply: FastifyReply) => {
        return this.trackService.update(req.params.id, req.body);
    }

    delete = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        await this.trackService.softDelete(req.params.id);
        return reply.status(204).send();
    }

    play = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        // Logic to return signed URL could go here if using Cloudinary
        // For now, we just increment play count
        const userId = req.user?.id;
        this.trackService.incrementPlayCount(req.params.id, userId);
        return reply.send({ status: 'playing' });
    }

    getLiked = async (req: FastifyRequest, reply: FastifyReply) => {
        const userId = req.user.id;
        return this.trackService.getLiked(userId);
    }

    toggleLike = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const userId = req.user.id;
        const result = await this.trackService.toggleLike(userId, req.params.id);
        return reply.send(result);
    }
}
