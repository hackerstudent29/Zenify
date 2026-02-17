import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { PlaylistService } from '../services/playlist.service';
import { CreatePlaylistInput, UpdatePlaylistInput, AddTrackInput } from './playlist.schemas';

export class PlaylistController {
    private playlistService: PlaylistService;

    constructor(server: FastifyInstance) {
        this.playlistService = new PlaylistService(server);
    }

    create = async (req: FastifyRequest<{ Body: CreatePlaylistInput }>, reply: FastifyReply) => {
        const playlist = await this.playlistService.create(req.user.id, req.body);
        return reply.status(201).send(playlist);
    }

    getPublic = async (req: FastifyRequest, reply: FastifyReply) => {
        return this.playlistService.findAllPublic();
    }

    getMyPlaylists = async (req: FastifyRequest, reply: FastifyReply) => {
        return this.playlistService.findMyPlaylists(req.user.id);
    }

    getOne = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        return this.playlistService.findOne(req.params.id);
    }

    update = async (req: FastifyRequest<{ Params: { id: string }, Body: UpdatePlaylistInput }>, reply: FastifyReply) => {
        return this.playlistService.update(req.params.id, req.user.id, req.body);
    }

    delete = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        await this.playlistService.delete(req.params.id, req.user.id);
        return reply.status(204).send();
    }

    addTrack = async (req: FastifyRequest<{ Params: { id: string }, Body: AddTrackInput }>, reply: FastifyReply) => {
        await this.playlistService.addTrack(req.params.id, req.body.trackId, req.user.id);
        return reply.send({ message: 'Track added' });
    }

    removeTrack = async (req: FastifyRequest<{ Params: { id: string; trackId: string } }>, reply: FastifyReply) => {
        await this.playlistService.removeTrack(req.params.id, req.params.trackId, req.user.id);
        return reply.send({ message: 'Track removed' });
    }
}
