export type InnerTubeArtworkKind =
    | 'song'
    | 'album'
    | 'playlist'
    | 'video'
    | 'artist_avatar'
    | 'artist_banner';

export interface InnerTubeArtworkOptions {
    videoId?: string;
    kind?: InnerTubeArtworkKind;
    size?: number;
}

const GOOGLE_CDN_RE = /(googleusercontent\.com|ggpht\.com)/i;
const YTIMG_PATH_RE = /(?:ytimg\.com|img\.youtube\.com)\/vi(?:_webp)?\/([A-Za-z0-9_-]{6,20})\//i;
const GOOGLE_DIM_RE = /=(?:w(\d+)-h(\d+)|s(\d+))([^?#]*)?$/i;
const YT_LOW_RES_RE = /\/(?:default|mqdefault|sddefault|hqdefault|hq720)\.(?:jpg|webp)(?:\?.*)?$/i;

/**
 * Returns true if the URL encodes a wide landscape image (such as a YouTube Music
 * artist immersive hero banner like =w2880-h1200-p-l90-rj).
 */
export function isLandscapeBannerUrl(rawUrl?: string | null): boolean {
    if (!rawUrl) return false;
    const m = rawUrl.match(GOOGLE_DIM_RE);
    if (!m || !m[1] || !m[2]) return false;
    const w = parseInt(m[1], 10);
    const h = parseInt(m[2], 10);
    return w > h && w >= 1000;
}

/**
 * Upgrades raw InnerTube / Google CDN / YouTube thumbnail URLs into crisp HD
 * images while respecting aspect ratio for artist banners vs square covers.
 */
export function upgradeInnerTubeArtwork(
    rawUrl?: string | null,
    options: InnerTubeArtworkOptions = {}
): string {
    const { videoId, kind = 'song', size = 1200 } = options;
    let url = (rawUrl || '').trim();

    if (!url || url.includes('lh3.googleusercontent.com/s/v4/g')) {
        if (videoId) {
            const cleanId = videoId.replace(/^yt-/, '').trim();
            if (cleanId) return `https://i.ytimg.com/vi/${cleanId}/maxresdefault.jpg`;
        }
        return '';
    }

    if (url.startsWith('//')) {
        url = `https:${url}`;
    }

    // 1. Google / YouTube Music CDN (lh3.googleusercontent.com, yt3.ggpht.com, etc.)
    if (GOOGLE_CDN_RE.test(url)) {
        if (/=s0(?:$|[?#])/i.test(url)) {
            return url;
        }

        const m = url.match(GOOGLE_DIM_RE);
        const existingW = m ? parseInt(m[1] || m[3] || '0', 10) : 0;
        const existingH = m ? parseInt(m[2] || m[3] || '0', 10) : 0;
        const preserveLandscape = kind === 'artist_banner' || (existingW > existingH && existingW >= 1000);

        if (preserveLandscape && kind !== 'artist_avatar') {
            if (existingW >= 1920) {
                return url;
            }
            const bannerSuffix = '=w1920-h1080-p-l90-rj';
            return GOOGLE_DIM_RE.test(url)
                ? url.replace(GOOGLE_DIM_RE, bannerSuffix)
                : `${url}${bannerSuffix}`;
        }

        const target = Math.max(size, 1200);
        const keepPortraitCrop = kind === 'artist_avatar' || url.includes('-p') || url.includes('-c');
        const squareSuffix = keepPortraitCrop
            ? `=w${target}-h${target}-p-l90-rj`
            : `=w${target}-h${target}-l90-rj`;

        if (GOOGLE_DIM_RE.test(url)) {
            if (existingW >= target && existingW === existingH && kind !== 'artist_avatar') {
                return url;
            }
            return url.replace(GOOGLE_DIM_RE, squareSuffix);
        }

        return `${url}${squareSuffix}`;
    }

    // 2. YouTube Video Thumbnails (i.ytimg.com / i9.ytimg.com)
    // Strip ?sqp=...&rs=... dimensions/signatures when upgrading to 1280x720 maxresdefault.
    if (url.includes('ytimg.com') || url.includes('img.youtube.com')) {
        const idMatch = url.match(YTIMG_PATH_RE);
        const resolvedVid = idMatch?.[1] || videoId?.replace(/^yt-/, '').trim();
        if (resolvedVid && YT_LOW_RES_RE.test(url)) {
            return `https://i.ytimg.com/vi/${resolvedVid}/maxresdefault.jpg`;
        }
        return url.split('?')[0];
    }

    return url;
}

