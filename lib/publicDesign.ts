/** Build-time, opt-in public redesign rollout. Endpoints enforce their own access policy. */
export const publicDesignEnabled = () => process.env.NEXT_PUBLIC_PUBLIC_REDESIGN_ENABLED === 'true';

export const PUBLIC_DESTINATIONS = [
  { label: 'Overview', href: '/tools/command-center' },
  { label: 'Symbol', href: '/tools/golden-egg' },
  { label: 'Macro Outlook', href: '/tools/macro' },
  { label: 'Global M2 Intelligence', href: '/intelligence/global-m2' },
  { label: 'Portfolio', href: '/tools/workspace?tab=Portfolio' },
  { label: 'Journal', href: '/tools/workspace?tab=Journal' },
  { label: 'Learning', href: '/learn' },
] as const;

export const PUBLIC_LEGAL_LINKS = [
  { label: 'Terms', href: '/terms' }, { label: 'Privacy', href: '/privacy' },
  { label: 'Cookies', href: '/cookie-policy' }, { label: 'Research & risk disclosure', href: '/disclaimer' },
  { label: 'Refund policy', href: '/refund-policy' }, { label: 'Contact & support', href: '/contact' },
] as const;

const matches = (path: string, root: string) => path === root || path.startsWith(root + '/');
export function publicDesignScope(path: string): 'workspace' | 'website' | null {
  if (['/admin', '/operator', '/v2'].some(root => matches(path, root))) return null;
  if (matches(path, '/tools') || matches(path, '/intelligence') || path === '/learn') return 'workspace';
  if (['/', '/pricing', '/auth', '/account', ...PUBLIC_LEGAL_LINKS.map(link => link.href)].includes(path)) return 'website';
  return null;
}
export function publicDestination(path: string, tab: string | null): string | null {
  if (path === '/tools/workspace') {
    if (tab?.toLowerCase() === 'portfolio') return 'Portfolio';
    if (tab?.toLowerCase() === 'journal') return 'Journal';
    return null;
  }
  return PUBLIC_DESTINATIONS.find(item => item.href.split('?')[0] === path)?.label ?? null;
}
