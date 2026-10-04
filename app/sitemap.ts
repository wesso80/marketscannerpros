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
    '/methodology',
    '/daily-pick',
    '/compliance-hub',
    '/intelligence',
    '/intelligence/global-m2',
    '/intelligence/fragility',
    '/intelligence/liquidity',
    '/blog',
    '/terms',
    '/privacy',
    '/disclaimer',
    '/cookie-policy',
    '/refund-policy',
  ];

  const toolsPages = [
    '/tools',
    '/tools/command-center',
    '/tools/scanner',
    '/tools/options',
    '/tools/golden-egg',
    '/tools/terminal',
    '/tools/research',
    '/tools/explorer',
    '/tools/dashboard',
    '/tools/crypto-intel',
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
