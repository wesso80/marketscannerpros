/**
 * Share-card copy and metadata for the five public pages we link to.
 * Static text only: no market data, no database, no paid APIs.
 */
import type { Metadata } from 'next';

export const SHARE_SITE_ORIGIN = 'https://marketscannerpros.app';
export const SHARE_SITE_NAME = 'MarketScannerPros';
export const SHARE_OG_WIDTH = 1200;
export const SHARE_OG_HEIGHT = 630;
const NOTE = 'General information only, not financial advice.';

/** Tickers only. Anything else is dropped so a shared URL cannot put arbitrary words on the card. */
const SYMBOL_RE = /^[A-Z0-9]{1,10}(?:[.-][A-Z0-9]{1,5})?$/;

export type SharePreviewId = 'today' | 'overview' | 'radar' | 'pricing';

export interface SharePreviewCard {
  id: SharePreviewId | 'symbol';
  /** File name under /public/og for the static card. Symbol pages with a ticker use /og/symbol/[symbol] instead. */
  file: string;
  kicker: string;
  pageName: string;
  line: string;
}

export const SHARE_PREVIEW_CARDS: Record<SharePreviewId | 'symbol', SharePreviewCard> = {
  today: {
    id: 'today',
    file: 'today.png',
    kicker: 'TODAY',
    pageName: 'Today',
    line: "Today's market, on one page.",
  },
  overview: {
    id: 'overview',
    file: 'overview.png',
    kicker: 'OVERVIEW',
    pageName: 'Overview',
    line: 'Regime, sectors and what changed.',
  },
  radar: {
    id: 'radar',
    file: 'daily-radar.png',
    kicker: 'DAILY RADAR',
    pageName: 'Daily Radar',
    line: "The session's regime and ranked names.",
  },
  pricing: {
    id: 'pricing',
    file: 'pricing.png',
    kicker: 'PRICING',
    pageName: 'Pricing',
    line: 'Free and Pro plans.',
  },
  symbol: {
    id: 'symbol',
    file: 'symbol.png',
    kicker: 'SYMBOL',
    pageName: 'Symbol',
    line: 'One symbol. Price context and the listed reasons.',
  },
};

const PAGES: Record<SharePreviewId, {
  path: string;
  title: string;
  description: string;
  robots?: Metadata['robots'];
}> = {
  today: {
    path: '/tools/start',
    title: 'Today',
    description: `Today's market on one page: regime and what changed. ${NOTE}`,
  },
  overview: {
    path: '/tools/command-center',
    title: 'Overview',
    description: `Overview of the session: regime, sectors and what changed. ${NOTE}`,
  },
  radar: {
    path: '/tools/msp-radar',
    title: 'Daily Radar',
    description: `Daily Radar: the session's regime and ranked names. ${NOTE}`,
    robots: { index: false, follow: false },
  },
  pricing: {
    path: '/pricing',
    title: 'Pricing',
    description: `Free, or Pro at $24.99/month or $249/year. ${NOTE}`,
  },
};

export function parseShareSymbol(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return null;
  let text = raw.trim();
  try { text = decodeURIComponent(text); } catch { return null; }
  const symbol = text.trim().toUpperCase();
  if (!SYMBOL_RE.test(symbol)) return null;
  return symbol;
}

export function symbolFromSearchParams(
  searchParams: { symbol?: string | string[] } | null | undefined,
): string | null {
  return parseShareSymbol(searchParams?.symbol);
}

function cardTitle(name: string): string {
  return `${name} — ${SHARE_SITE_NAME}`;
}

function imageMeta(path: string, alt: string) {
  return [{ url: path, width: SHARE_OG_WIDTH, height: SHARE_OG_HEIGHT, alt }];
}

function previewMetadata(input: {
  title: string;
  ogTitle: string;
  description: string;
  canonicalPath: string;
  imagePath: string;
  imageAlt: string;
  robots?: Metadata['robots'];
}): Metadata {
  const url = `${SHARE_SITE_ORIGIN}${input.canonicalPath}`;
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: url },
    ...(input.robots ? { robots: input.robots } : {}),
    openGraph: {
      type: 'website',
      url,
      siteName: SHARE_SITE_NAME,
      // absolute skips the root "%s | MarketScanner Pros" template, which would double the brand.
      title: { absolute: input.ogTitle },
      description: input.description,
      images: imageMeta(input.imagePath, input.imageAlt),
    },
    twitter: {
      card: 'summary_large_image',
      title: { absolute: input.ogTitle },
      description: input.description,
      images: [input.imagePath],
    },
  };
}

export function sharePreviewMetadata(id: SharePreviewId, description = PAGES[id].description): Metadata {
  const page = PAGES[id];
  const card = SHARE_PREVIEW_CARDS[id];
  const ogTitle = cardTitle(page.title);
  return previewMetadata({
    title: page.title,
    ogTitle,
    description,
    canonicalPath: page.path,
    imagePath: `/og/${card.file}`,
    imageAlt: ogTitle,
    robots: page.robots,
  });
}

export function symbolShareMetadata(symbol: string | null): Metadata {
  const card = SHARE_PREVIEW_CARDS.symbol;
  if (!symbol) {
    const ogTitle = cardTitle('Symbol');
    return previewMetadata({
      title: 'Symbol',
      ogTitle,
      description: `One symbol on one page: price context, regime and the listed reasons. ${NOTE}`,
      canonicalPath: '/tools/golden-egg',
      imagePath: `/og/${card.file}`,
      imageAlt: ogTitle,
      robots: { index: false, follow: false },
    });
  }
  const ogTitle = cardTitle(symbol);
  return previewMetadata({
    title: symbol,
    ogTitle,
    description: `${symbol} on one page: price context, regime and the listed reasons. ${NOTE}`,
    canonicalPath: `/tools/golden-egg?symbol=${encodeURIComponent(symbol)}`,
    imagePath: `/og/symbol/${encodeURIComponent(symbol)}`,
    imageAlt: ogTitle,
    robots: { index: false, follow: false },
  });
}
