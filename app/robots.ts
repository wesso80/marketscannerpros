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
      // Social card crawlers need unrestricted access to the OG image route.
      // Listed individually so validators that use first-match rather than
      // longest-match precedence still resolve to Allow.
      { userAgent: 'Twitterbot', allow: '/' },
      { userAgent: 'facebookexternalhit', allow: '/' },
      { userAgent: 'LinkedInBot', allow: '/' },
      { userAgent: 'Slackbot-LinkExpanding', allow: '/' },
      { userAgent: 'Discordbot', allow: '/' },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
