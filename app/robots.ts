import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://marketscannerpros.app';
  
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/api/og/'],
        disallow: [
          '/api/',
          '/admin/',
          '/operator/',
          '/dashboard/',
          '/after-checkout/',
          '/launch/',
          '/_next/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
