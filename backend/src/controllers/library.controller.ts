import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma';
import { TRACK_LIST_SELECT } from '../services/track.service';

export class LibraryController {
  /**
   * GET /api/me/library
   * Returns the authenticated user's complete library:
   * - liked: tracks liked by this user
   * - artists: artists followed by this user
   * - albums: albums saved by this user
   * - playlists: playlists owned by this user
   */
  static async getLibrary(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      const [likes, followedArtists, savedAlbums, playlists] = await Promise.all([
        prisma.like.findMany({
          where: { userId, track: { deletedAt: null } },
          include: {
            track: {
              select: TRACK_LIST_SELECT
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.artistFollow.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.savedAlbum.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.playlist.findMany({
          where: { userId },
          include: {
            tracks: {
              orderBy: { addedAt: 'asc' },
              select: { trackId: true }
            }
          },
          orderBy: { updatedAt: 'desc' }
        })
      ]);

      const formattedPlaylists = playlists.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        coverUrl: p.coverUrl,
        tracks: p.tracks.map(t => t.trackId)
      }));

      const formattedArtists = followedArtists.map(a => ({
        name: a.artistName,
        cover: a.artistImage || '',
        browseId: a.browseId || a.artistProviderId
      }));

      const formattedAlbums = savedAlbums.map(a => ({
        id: a.id,
        title: a.title,
        artist: a.artist,
        cover: a.coverUrl || '',
        browseId: a.browseId,
        year: a.year
      }));

      const formattedLiked = likes.map(l => l.track);

      return reply.send({
        liked: formattedLiked,
        artists: formattedArtists,
        albums: formattedAlbums,
        playlists: formattedPlaylists
      });
    } catch (err: any) {
      req.log.error(`[LibraryController] getLibrary error: ${err.message}`);
      return reply.status(500).send({ error: 'Failed to fetch user library' });
    }
  }

  /**
   * POST /api/me/library/albums
   * Saves an album to user's library.
   */
  static async saveAlbum(
    req: FastifyRequest<{
      Body: {
        title: string;
        artist: string;
        coverUrl?: string;
        browseId?: string;
        year?: number;
      };
    }>,
    reply: FastifyReply
  ) {
    const userId = (req as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { title, artist, coverUrl, browseId, year } = req.body || {};
    if (!title || !artist) {
      return reply.status(400).send({ error: 'title and artist are required' });
    }

    try {
      const album = await prisma.savedAlbum.upsert({
        where: {
          userId_title_artist: {
            userId,
            title: title.trim(),
            artist: artist.trim()
          }
        },
        create: {
          userId,
          title: title.trim(),
          artist: artist.trim(),
          coverUrl: coverUrl?.trim(),
          browseId: browseId?.trim(),
          year: year || null
        },
        update: {
          coverUrl: coverUrl?.trim(),
          browseId: browseId?.trim(),
          year: year || undefined
        }
      });

      return reply.status(200).send({ status: 'saved', album });
    } catch (err: any) {
      req.log.error(`[LibraryController] saveAlbum error: ${err.message}`);
      return reply.status(500).send({ error: 'Failed to save album' });
    }
  }

  /**
   * DELETE /api/me/library/albums
   * Removes an album from user's library.
   */
  static async removeAlbum(
    req: FastifyRequest<{
      Body?: { title?: string; artist?: string; id?: string };
      Querystring?: { title?: string; artist?: string; id?: string };
    }>,
    reply: FastifyReply
  ) {
    const userId = (req as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const id = req.body?.id || req.query?.id;
    const title = (req.body?.title || req.query?.title)?.trim();
    const artist = (req.body?.artist || req.query?.artist)?.trim();

    try {
      if (id) {
        await prisma.savedAlbum.deleteMany({
          where: { id, userId }
        });
      } else if (title && artist) {
        await prisma.savedAlbum.deleteMany({
          where: { userId, title, artist }
        });
      } else {
        return reply.status(400).send({ error: 'id or (title and artist) required' });
      }

      return reply.status(200).send({ status: 'removed' });
    } catch (err: any) {
      req.log.error(`[LibraryController] removeAlbum error: ${err.message}`);
      return reply.status(500).send({ error: 'Failed to remove album' });
    }
  }

  /**
   * POST /api/me/library/sync
   * Batch sync local library changes to the user's database records.
   */
  static async syncLibrary(
    req: FastifyRequest<{
      Body: {
        albums?: Array<{ title: string; artist: string; cover?: string; browseId?: string }>;
        artists?: Array<{ name: string; cover?: string; browseId?: string }>;
      };
    }>,
    reply: FastifyReply
  ) {
    const userId = (req as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { albums, artists } = req.body || {};

    try {
      if (Array.isArray(albums)) {
        for (const a of albums) {
          if (!a.title || !a.artist) continue;
          await prisma.savedAlbum.upsert({
            where: {
              userId_title_artist: {
                userId,
                title: a.title.trim(),
                artist: a.artist.trim()
              }
            },
            create: {
              userId,
              title: a.title.trim(),
              artist: a.artist.trim(),
              coverUrl: a.cover?.trim(),
              browseId: a.browseId?.trim()
            },
            update: {
              coverUrl: a.cover?.trim(),
              browseId: a.browseId?.trim()
            }
          }).catch(() => {});
        }
      }

      if (Array.isArray(artists)) {
        for (const art of artists) {
          if (!art.name) continue;
          const providerId = art.browseId || `artist-${art.name.toLowerCase().trim()}`;
          await prisma.artistFollow.upsert({
            where: {
              userId_artistProviderId: {
                userId,
                artistProviderId: providerId
              }
            },
            create: {
              userId,
              artistProviderId: providerId,
              artistName: art.name.trim(),
              artistImage: art.cover?.trim(),
              browseId: art.browseId?.trim()
            },
            update: {
              artistImage: art.cover?.trim(),
              browseId: art.browseId?.trim()
            }
          }).catch(() => {});
        }
      }

      return reply.status(200).send({ status: 'synced' });
    } catch (err: any) {
      req.log.error(`[LibraryController] syncLibrary error: ${err.message}`);
      return reply.status(500).send({ error: 'Failed to sync library' });
    }
  }
}
