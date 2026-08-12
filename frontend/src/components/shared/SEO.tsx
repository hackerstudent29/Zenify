import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
}

export function SEO({
  title = 'Zenify - Modern Streaming',
  description = 'Listen to your favorite music ad-free, explore new artists, and curate your personal library.',
  image = 'https://listenzenify.vercel.app/favicon_z_512.png',
  url = 'https://listenzenify.vercel.app',
}: SEOProps) {
  const fullTitle = title === 'Zenify - Modern Streaming' ? title : `${title} | Zenify`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />

      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
    </Helmet>
  );
}
