import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://marketscannerpros.app';
  const lastModified = new Date();

  // Core marketing pages
  const corePages = [
    '',
    '/pricing',
    '/partners',
    '/contact',
    '/guide',
    '/reviews',
    '/blog',
  ];

  // Legal pages
  const legalPages = [
    '/terms',
    '/privacy',
    '/disclaimer',
    '/cookie-policy',
    '/refund-policy',
    '/legal',
  ];

  // Tools pages (public landing pages)
  const toolsPages = [
    '/tools',
    '/tools/scanner',
    '/tools/ai-analyst',
    '/tools/portfolio',
    '/tools/journal',
    '/tools/backtest',
    '/tools/options',
    '/tools/economics',
    '/tools/news',
    '/tools/etf',
    '/tools/gainers-losers',
    '/tools/company-overview',
    '/tools/commodities',
  ];

  // Auth pages
  const authPages = [
    '/auth/login',
  ];

  // Combine all pages
  const allPages = [...corePages, ...legalPages, ...toolsPages, ...authPages];

  return allPages.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified,
    changeFrequency: path === '' ? 'daily' : 'weekly',
    priority: path === '' ? 1.0 : path.startsWith('/tools') ? 0.8 : 0.6,
  }));
}
