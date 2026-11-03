import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma';
import { config } from '../config/env';
import { TogetherRoomService } from '../services/together-room.service';

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function shareRoutes(server: FastifyInstance) {
  /**
   * SSR HTML Link Preview for crawlers and instant redirect for users
   * GET /s/:type/:id
   */
  server.get(
    '/s/:type/:id',
    async (request: FastifyRequest<{ Params: { type: string; id: string } }>, reply: FastifyReply) => {
      const { type, id } = request.params;
      const baseUrl = config.FRONTEND_URL.split(',')[0].trim();

      let title = 'Zenify – Free, Ad-Free Music Streaming';
      let description = 'Stream high-fidelity music without ads, subscription fees, or limits on Zenify.';
      let image = `${baseUrl}/images/banner.png`;
      let redirectPath = '/';
      let ogType = 'website';

      try {
        if (type === 'track') {
          const track = await prisma.track.findUnique({
            where: { id },
            include: { album: true, artist: true },
          });

          if (track) {
            const artistName = track.artist?.name || 'Artist';
            title = `${track.title} – ${artistName}`;
            description = `Listen to ${track.title} by ${artistName}${track.album?.title ? ` on ${track.album.title}` : ''} in high quality on Zenify.`;
            image = track.coverUrl || track.album?.coverUrl || image;
            redirectPath = `/track/${track.id}`;
            ogType = 'music.song';
          }
        } else if (type === 'album') {
          const album = await prisma.album.findUnique({
            where: { id },
            include: { artist: true },
          });

          if (album) {
            title = `${album.title} – ${album.artist?.name || 'Various Artists'}`;
            description = `Stream ${album.title} by ${album.artist?.name || 'Various Artists'} on Zenify.`;
            image = album.coverUrl || image;
            redirectPath = `/album/${album.id}`;
            ogType = 'music.album';
          }
        } else if (type === 'artist') {
          const artist = await prisma.artist.findUnique({ where: { id } });
          if (artist) {
            title = `${artist.name} on Zenify`;
            description = `Explore top songs, albums, and discography of ${artist.name} on Zenify.`;
            image = artist.imageUrl || image;
            redirectPath = `/artist/${artist.id}`;
            ogType = 'profile';
          }
        } else if (type === 'playlist') {
          const playlist = await prisma.playlist.findUnique({
            where: { id },
            include: { user: true },
          });
          if (playlist) {
            title = `${playlist.name} – Playlist by ${playlist.user?.name || 'Zenify'}`;
            description = playlist.description || `Listen to ${playlist.name} on Zenify.`;
            image = playlist.coverUrl || image;
            redirectPath = `/playlist/${playlist.id}`;
            ogType = 'music.playlist';
          }
        } else if (type === 'together') {
          const room = await TogetherRoomService.getRoom(id);
          if (room) {
            title = `Join Listen Together Session ${room.roomCode} on Zenify`;
            description = `Hop into a real-time synchronized music session with ${room.members.length} listeners.`;
            image = room.player.track?.coverUrl || image;
            redirectPath = `/together/${room.roomCode}`;
          } else {
            redirectPath = `/together`;
          }
        }
      } catch (err: any) {
        server.log.warn(`[ShareRoutes] Error resolving entity ${type}/${id}: ${err.message}`);
      }

      const fullTargetUrl = `${baseUrl}${redirectPath}`;
      const ogImageUrl = `${baseUrl}/api/s/${encodeURIComponent(type)}/${encodeURIComponent(id)}/og-image`;

      const safeTitle = escapeHtml(title);
      const safeDesc = escapeHtml(description);
      const safeImage = escapeHtml(image);
      const safeTarget = escapeHtml(fullTargetUrl);

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>

  <!-- Open Graph -->
  <meta property="og:type" content="${ogType}" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDesc}" />
  <meta property="og:image" content="${safeImage}" />
  <meta property="og:image:width" content="600" />
  <meta property="og:image:height" content="600" />
  <meta property="og:url" content="${safeTarget}" />
  <meta property="og:site_name" content="Zenify" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDesc}" />
  <meta name="twitter:image" content="${safeImage}" />

  <!-- Instant Browser Redirect for Humans -->
  <meta http-equiv="refresh" content="0; url=${safeTarget}" />
  <script>
    window.location.replace(${JSON.stringify(fullTargetUrl)});
  </script>

  <style>
    body {
      background-color: #121214;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      text-align: center;
    }
    .card {
      padding: 32px;
      max-width: 440px;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    img {
      width: 140px;
      height: 140px;
      border-radius: 14px;
      object-fit: cover;
      margin-bottom: 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    a {
      display: inline-block;
      margin-top: 16px;
      padding: 12px 24px;
      border-radius: 9999px;
      background: #ff2d55;
      color: #fff;
      text-decoration: none;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="card">
    <img src="${safeImage}" alt="${safeTitle}" />
    <h2>${safeTitle}</h2>
    <p>${safeDesc}</p>
    <a href="${safeTarget}">Listen on Zenify</a>
  </div>
</body>
</html>`;

      reply.type('text/html; charset=utf-8').send(html);
    }
  );
}

