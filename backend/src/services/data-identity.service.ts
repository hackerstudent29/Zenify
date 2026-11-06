import { prisma } from '../utils/prisma.js';
import {
  NormalizedTrack,
  NormalizedAlbum,
  NormalizedArtistRef
} from './catalog-provider.interface.js';

export class DataIdentityService {
  /**
   * Persists or updates an artist in PostgreSQL with their canonical provider ID.
   */
  static async syncArtist(artistRef: NormalizedArtistRef, bio?: string): Promise<any> {
    const providerId = String(artistRef.id).trim();
    const name = artistRef.name.trim();

    // 1. Try finding by canonical providerId
    if (providerId && !providerId.startsWith('unknown')) {
      const existingByProvider = await prisma.artist.findFirst({
        where: { providerId, provider: 'jiosaavn' }
      });

      if (existingByProvider) {
        return prisma.artist.update({
          where: { id: existingByProvider.id },
          data: {
            name: existingByProvider.name || name,
            imageUrl: artistRef.imageUrl || existingByProvider.imageUrl,
            bio: bio || existingByProvider.bio
          }
        });
      }
    }

    // 2. Try finding by exact name (case-insensitive)
    const existingByName = await prisma.artist.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } }
    });

    if (existingByName) {
      return prisma.artist.update({
        where: { id: existingByName.id },
        data: {
          providerId: providerId && !providerId.startsWith('unknown') ? providerId : existingByName.providerId,
          provider: 'jiosaavn',
          imageUrl: artistRef.imageUrl || existingByName.imageUrl,
          bio: bio || existingByName.bio
        }
      });
    }

    // 3. Create fresh artist
    return prisma.artist.create({
      data: {
        name,
        providerId: providerId && !providerId.startsWith('unknown') ? providerId : null,
        provider: 'jiosaavn',
        imageUrl: artistRef.imageUrl || null,
        bio: bio || null
      }
    });
  }

  /**
   * Persists or updates an album in PostgreSQL with its canonical provider ID.
   */
  static async syncAlbum(album: NormalizedAlbum): Promise<any> {
    const providerId = String(album.id).trim();
    const dbPrimaryArtist = await this.syncArtist(album.primaryArtist);

    let dbAlbum: any = null;

    if (providerId && !providerId.startsWith('unknown')) {
      dbAlbum = await prisma.album.findFirst({
        where: { providerId, provider: 'jiosaavn' }
      });
    }

    if (!dbAlbum) {
      dbAlbum = await prisma.album.findFirst({
        where: {
          title: { equals: album.title, mode: 'insensitive' },
          artistId: dbPrimaryArtist.id
        }
      });
    }

    if (dbAlbum) {
      dbAlbum = await prisma.album.update({
        where: { id: dbAlbum.id },
        data: {
          providerId: providerId && !providerId.startsWith('unknown') ? providerId : dbAlbum.providerId,
          coverUrl: album.coverUrl || dbAlbum.coverUrl,
          releaseDate: album.releaseDate || dbAlbum.releaseDate || null
        }
      });
    } else {
      dbAlbum = await prisma.album.create({
        data: {
          title: album.title,
          providerId: providerId && !providerId.startsWith('unknown') ? providerId : null,
          provider: 'jiosaavn',
          artistId: dbPrimaryArtist.id,
          coverUrl: album.coverUrl,
          releaseDate: album.releaseDate || null
        }
      });
    }

    // Sync child tracks if available
    if (album.tracks && album.tracks.length > 0) {
      for (const t of album.tracks) {
        await this.syncTrack(t, dbAlbum.id).catch(err => {
          console.warn(`[DataIdentity] Failed to sync track "${t.title}" in album "${album.title}":`, err.message);
        });
      }
    }

    return dbAlbum;
  }

  /**
   * Persists a track in PostgreSQL with canonical providerId, FK albumId, and TrackArtist join records.
   */
  static async syncTrack(track: NormalizedTrack, overrideAlbumDbId?: string): Promise<any> {
    const providerId = String(track.id).trim();
    const dbPrimaryArtist = await this.syncArtist(track.primaryArtist);

    let albumDbId = overrideAlbumDbId;
    if (!albumDbId && track.albumId && track.albumTitle) {
      const album = await this.syncAlbum({
        id: track.albumId,
        provider: 'jiosaavn',
        title: track.albumTitle,
        coverUrl: track.coverUrl,
        primaryArtist: track.primaryArtist,
        artists: track.artists,
        tracks: []
      });
      albumDbId = album.id;
    }

    let dbTrack: any = null;

    if (providerId && !providerId.startsWith('unknown')) {
      dbTrack = await prisma.track.findFirst({
        where: { providerId, provider: 'jiosaavn' }
      });
    }

    if (!dbTrack) {
      dbTrack = await prisma.track.findFirst({
        where: {
          title: { equals: track.title, mode: 'insensitive' },
          artistId: dbPrimaryArtist.id
        }
      });
    }

    if (dbTrack) {
      dbTrack = await prisma.track.update({
        where: { id: dbTrack.id },
        data: {
          providerId: providerId && !providerId.startsWith('unknown') ? providerId : dbTrack.providerId,
          albumId: albumDbId || dbTrack.albumId,
          coverUrl: track.coverUrl || dbTrack.coverUrl,
          audioUrl: track.audioUrl || dbTrack.audioUrl,
          duration: track.duration || dbTrack.duration,
          trackNumber: track.trackNumber || dbTrack.trackNumber,
          releaseDate: track.releaseDate || dbTrack.releaseDate || null,
          genre: track.genre || dbTrack.genre || 'Soundtrack',
          language: track.language || dbTrack.language || undefined,
          copyrightLabel: track.copyright || track.label || dbTrack.copyrightLabel || null
        },
        include: {
          artist: true,
          album: true
        }
      });
    } else {
      dbTrack = await prisma.track.create({
        data: {
          title: track.title,
          providerId: providerId && !providerId.startsWith('unknown') ? providerId : null,
          provider: 'jiosaavn',
          artistId: dbPrimaryArtist.id,
          albumId: albumDbId || null,
          coverUrl: track.coverUrl,
          audioUrl: track.audioUrl || '',
          duration: track.duration,
          trackNumber: track.trackNumber || 1,
          releaseDate: track.releaseDate || null,
          genre: track.genre || 'Soundtrack',
          language: track.language || undefined,
          copyrightLabel: track.copyright || track.label || null
        },
        include: {
          artist: true,
          album: true
        }
      });
    }

    // Sync TrackArtist join table for all artists and roles
    if (track.artists && track.artists.length > 0) {
      for (let i = 0; i < track.artists.length; i++) {
        const a = track.artists[i];
        try {
          const dbArtist = await this.syncArtist(a);
          const role = a.role || (i === 0 ? 'primary' : 'featured');

          await prisma.trackArtist.upsert({
            where: {
              trackId_artistId_role: {
                trackId: dbTrack.id,
                artistId: dbArtist.id,
                role
              }
            },
            update: {
              order: i
            },
            create: {
              trackId: dbTrack.id,
              artistId: dbArtist.id,
              role,
              order: i
            }
          });
        } catch (err: any) {
          // Continue if unique constraint is already satisfied
        }
      }
    }

    return dbTrack;
  }
}

