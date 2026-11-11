import { Helmet } from 'react-helmet-async';

export interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string | string[];
  path?: string;
  image?: string;
  imageAlt?: string;
  type?: 'website' | 'article' | 'music.song' | 'music.album' | 'music.playlist' | 'profile';
  noindex?: boolean;
  jsonLd?: Record<string, any> | Array<Record<string, any>> | null;
}

const BASE_URL = 'https://listenzenify.vercel.app';
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`;
const DEFAULT_TITLE = 'Zenify – Free Music Player with Synced Lyrics & 8D Audio';
const DEFAULT_DESCRIPTION = 'Stream millions of songs with sub-second synchronized lyrics in 50+ languages, studio 3-band EQ, 8D spatial audio, and local file playback. Free & ad-free.';

export function SEO({
  title,
  description = DEFAULT_DESCRIPTION,
  keywords,
  path = '',
  image = DEFAULT_IMAGE,
  imageAlt = 'Zenify - Free Music Player with Synced Lyrics & 8D Audio',
  type = 'website',
  noindex = false,
  jsonLd,
}: SEOProps) {
  // Format title
  const rawTitle = title || DEFAULT_TITLE;
  const fullTitle = rawTitle.includes('Zenify') ? rawTitle : `${rawTitle} | Zenify`;

  // Truncate description at 155 chars
  const cleanDescription = description.length > 155 ? `${description.slice(0, 152).trim()}...` : description;

  // Format canonical URL: strip query/hash and trailing slash (except root)
  let cleanPath = (path || '').split('?')[0].split('#')[0];
  if (cleanPath && !cleanPath.startsWith('/')) {
    cleanPath = `/${cleanPath}`;
  }
  if (cleanPath.length > 1 && cleanPath.endsWith('/')) {
    cleanPath = cleanPath.slice(0, -1);
  }
  const canonicalUrl = cleanPath === '' || cleanPath === '/' ? `${BASE_URL}/` : `${BASE_URL}${cleanPath}`;

  // Image URL formatting
  const fullImage = image.startsWith('http') ? image : `${BASE_URL}${image.startsWith('/') ? '' : '/'}${image}`;

  const keywordContent = Array.isArray(keywords) ? keywords.join(', ') : keywords;
  const jsonLdItems = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={cleanDescription} />
      {keywordContent && <meta name="keywords" content={keywordContent} />}
      <link rel="canonical" href={canonicalUrl} />

      {/* Robots */}
      {noindex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
      )}

      {/* Open Graph */}
      <meta property="og:site_name" content="Zenify" />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={cleanDescription} />
      <meta property="og:image" content={fullImage} />
      <meta property="og:image:alt" content={imageAlt} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:locale" content="en_US" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@zenifymusic" />
      <meta name="twitter:url" content={canonicalUrl} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={cleanDescription} />
      <meta name="twitter:image" content={fullImage} />
      <meta name="twitter:image:alt" content={imageAlt} />

      {/* Structured Data (JSON-LD) */}
      {jsonLdItems.map((schema, idx) => (
        <script key={idx} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Helmet>
  );
}

export default SEO;
