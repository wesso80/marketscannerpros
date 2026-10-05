/**
 * 1200x630 share card. Static text and the local logo only.
 * Satori needs display:flex on every element with more than one child, and literal colours.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { shareCardFonts } from '@/lib/share/font';
import { SHARE_OG_HEIGHT, SHARE_OG_WIDTH, type SharePreviewCard } from '@/lib/og/linkPreview';

const TEAL = '#2DD4BF';
const BG = '#0B1220';

let cachedLogo: string | null | undefined;

/** Local wordmark. The file is a JPEG saved with a .png name, so the MIME type follows the bytes. */
export function linkPreviewLogoSrc(): string | undefined {
  if (cachedLogo !== undefined) return cachedLogo ?? undefined;
  try {
    const buf = readFileSync(path.join(process.cwd(), 'public/logos/msp-logo.png'));
    const mime = buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg' : 'image/png';
    cachedLogo = `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    cachedLogo = null;
  }
  return cachedLogo ?? undefined;
}

export function LinkPreviewCard({
  kicker,
  pageName,
  line,
  logoSrc,
}: {
  kicker: string;
  pageName: string;
  line: string;
  logoSrc?: string;
}) {
  return (
    <div
      style={{
        width: SHARE_OG_WIDTH,
        height: SHARE_OG_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        background: BG,
        color: '#F8FAFC',
        fontFamily: 'Noto Sans',
      }}
    >
      <div style={{ display: 'flex', width: SHARE_OG_WIDTH, height: 12, background: TEAL }} />
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, padding: '52px 72px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {logoSrc ? (
            <img src={logoSrc} width={72} height={72} alt="" style={{ borderRadius: 16 }} />
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 72,
                height: 72,
                borderRadius: 16,
                background: TEAL,
                color: '#042F2E',
                fontSize: 22,
              }}
            >
              MSP
            </div>
          )}
          <div style={{ display: 'flex', marginLeft: 22, fontSize: 34, color: '#F8FAFC' }}>MarketScannerPros</div>
        </div>
        <div style={{ display: 'flex', marginTop: 56, fontSize: 22, letterSpacing: 3, color: TEAL }}>{kicker}</div>
        <div style={{ display: 'flex', marginTop: 10, fontSize: 84, color: '#F8FAFC' }}>{pageName}</div>
        <div style={{ display: 'flex', marginTop: 18, fontSize: 30, color: '#CBD5E1' }}>{line}</div>
        <div style={{ display: 'flex', flexGrow: 1 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', fontSize: 22, color: '#94A3B8' }}>General information only, not financial advice.</div>
          <div style={{ display: 'flex', fontSize: 22, color: TEAL }}>marketscannerpros.app</div>
        </div>
      </div>
    </div>
  );
}

export function cardFromSpec(spec: SharePreviewCard, logoSrc?: string) {
  return (
    <LinkPreviewCard kicker={spec.kicker} pageName={spec.pageName} line={spec.line} logoSrc={logoSrc} />
  );
}

export function linkPreviewImageResponse(spec: SharePreviewCard, logoSrc = linkPreviewLogoSrc()): ImageResponse {
  return new ImageResponse(cardFromSpec(spec, logoSrc), {
    width: SHARE_OG_WIDTH,
    height: SHARE_OG_HEIGHT,
    fonts: shareCardFonts(),
  });
}
