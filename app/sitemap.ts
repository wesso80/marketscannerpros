import { MetadataRoute } from 'next';
import { blogPosts } from './blog/posts-data';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://marketscannerpros.app';
  const lastModified = new Date();

  const corePages = [
    '',
    '/pricing',
    '/partners',
    '/contact',
    '/guide',
    '/guide/open-interest',
    '/blog',
    '/terms',
    '/privacy',
    '/disclaimer',
    '/cookie-policy',
    '/refund-policy',
  ];

  const toolsPages = [
    '/tools',
    '/tools/scanner',
    '/tools/ai-analyst',
    '/tools/ai-tools',
    '/tools/deep-analysis',
    '/tools/confluence-scanner',
    '/tools/options-confluence',
    '/tools/portfolio',
    '/tools/journal',
    '/tools/backtest',
    '/tools/alerts',
    '/tools/watchlists',
    '/tools/news',
    '/tools/market-movers',
    '/tools/macro',
    '/tools/economic-calendar',
    '/tools/company-overview',
    '/tools/commodities',
    '/tools/gainers-losers',
    '/tools/heatmap',
    '/tools/crypto',
    '/tools/crypto-dashboard',
    '/tools/crypto-explorer',
    '/tools/crypto-heatmap',
    '/tools/equity-explorer',
    '/tools/intraday-charts',
  ];

  const blogPages = blogPosts.map((post) => `/blog/${post.slug}`);

  const allPages = [...corePages, ...toolsPages, ...blogPages];

  return allPages.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified,
    changeFrequency: path === '' ? 'daily' : 'weekly',
    priority: path === '' ? 1.0 : path.startsWith('/tools') ? 0.8 : 0.6,
  }));
}
