import { ImageResponse } from 'next/og';
import { shareCardFonts } from '@/lib/share/font';
import { parseShareSymbol, SHARE_OG_HEIGHT, SHARE_OG_WIDTH, SHARE_PREVIEW_CARDS } from '@/lib/og/linkPreview';
import { LinkPreviewCard, linkPreviewLogoSrc } from '@/lib/og/linkPreviewCard';

export const runtime = 'nodejs';

/**
 * Share image for a Symbol page. The ticker is painted as text.
 * No quote, no database, no paid API.
 */
export async function GET(_req: Request, context: { params: Promise<{ symbol: string }> }): Promise<Response> {
  const { symbol: raw } = await context.params;
  const symbol = parseShareSymbol(raw);
  if (!symbol) {
    return new Response('Not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=60' },
    });
  }
  const base = SHARE_PREVIEW_CARDS.symbol;
  return new ImageResponse(
    (
      <LinkPreviewCard
        kicker={base.kicker}
        pageName={symbol}
        line={base.line}
        logoSrc={linkPreviewLogoSrc()}
      />
    ),
    {
      width: SHARE_OG_WIDTH,
      height: SHARE_OG_HEIGHT,
      fonts: shareCardFonts(),
      headers: {
        'cache-control': 'public, max-age=86400',
        'content-type': 'image/png',
        'x-content-type-options': 'nosniff',
      },
    },
  );
}
