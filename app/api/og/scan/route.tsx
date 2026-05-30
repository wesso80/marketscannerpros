import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * GET /api/og/scan
 *
 * Generates a 1200x630 PNG suitable for X / Open Graph cards. Public; takes
 * its inputs from query string only (no DB hit on the edge runtime). Intended
 * to be referenced from per-share pages e.g. /share/scan/[SYMBOL].
 *
 * Required:  symbol
 * Optional:  side ("LONG"|"SHORT"|"WATCH"), score (0-100), price,
 *            float ("4.2M"), shortPct, rvol, sector, headline, sub
 *
 * Branding follows site palette: bg #0F172A, accent #10B981 (long) / #EF4444
 * (short) / #F59E0B (watch). No external font fetch — uses system stack so
 * the edge render stays fast and offline-safe.
 */

const ACCENT = {
  LONG: 'var(--msp-bull)',
  SHORT: 'var(--msp-bear)',
  WATCH: 'var(--msp-warn)',
} as const;

type Side = keyof typeof ACCENT;

function isSide(v: string | null): v is Side {
  return v === 'LONG' || v === 'SHORT' || v === 'WATCH';
}

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const symbol = (sp.get('symbol') || 'MSP').toUpperCase().slice(0, 8);
  const sideRaw = (sp.get('side') || 'WATCH').toUpperCase();
  const side: Side = isSide(sideRaw) ? sideRaw : 'WATCH';
  const accent = ACCENT[side];
  const score = sp.get('score');
  const price = sp.get('price');
  const float = sp.get('float');
  const shortPct = sp.get('shortPct');
  const rvol = sp.get('rvol');
  const sector = sp.get('sector');
  const headline = sp.get('headline') || `${symbol} ${side} setup`;
  const sub = sp.get('sub') || 'MarketScanner Pros — educational analysis';

  type Stat = { label: string; value: string };
  const stats: Stat[] = [];
  if (score) stats.push({ label: 'OPP SCORE', value: `${score}` });
  if (price) stats.push({ label: 'PRICE', value: `$${price}` });
  if (float) stats.push({ label: 'FLOAT', value: float });
  if (shortPct) stats.push({ label: 'SHORT %', value: `${shortPct}%` });
  if (rvol) stats.push({ label: 'RVOL', value: `${rvol}x` });
  if (sector) stats.push({ label: 'SECTOR', value: sector });

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background:
            'linear-gradient(135deg, #0F172A 0%, #111827 60%, #0B1220 100%)',
          color: '#F8FAFC',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          padding: '56px 64px',
          position: 'relative',
        }}
      >
        {/* Accent bar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '12px',
            height: '100%',
            background: accent,
          }}
        />

        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              color: 'var(--msp-flat)',
              fontSize: 22,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                background: accent,
                borderRadius: '50%',
              }}
            />
            MarketScanner Pros
          </div>
          <div
            style={{
              display: 'flex',
              padding: '10px 18px',
              border: `2px solid ${accent}`,
              color: accent,
              borderRadius: '999px',
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '0.12em',
            }}
          >
            {side}
          </div>
        </div>

        {/* Symbol + headline */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: '40px',
            gap: '14px',
          }}
        >
          <div
            style={{
              fontSize: 132,
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: '-0.03em',
              color: '#F8FAFC',
              display: 'flex',
            }}
          >
            {symbol}
          </div>
          <div
            style={{
              fontSize: 38,
              fontWeight: 600,
              color: 'var(--msp-text)',
              lineHeight: 1.25,
              display: 'flex',
              maxWidth: '1070px',
            }}
          >
            {headline}
          </div>
        </div>

        {/* Stats row */}
        {stats.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '20px',
              marginTop: 'auto',
              marginBottom: '24px',
            }}
          >
            {stats.slice(0, 4).map((s) => (
              <div
                key={s.label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '14px',
                  padding: '16px 22px',
                  minWidth: '170px',
                }}
              >
                <div
                  style={{
                    fontSize: 16,
                    letterSpacing: '0.12em',
                    color: 'var(--msp-flat)',
                    textTransform: 'uppercase',
                    display: 'flex',
                  }}
                >
                  {s.label}
                </div>
                <div
                  style={{
                    fontSize: 36,
                    fontWeight: 700,
                    color: '#F8FAFC',
                    marginTop: 4,
                    display: 'flex',
                  }}
                >
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '16px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--msp-flat)',
            fontSize: 22,
          }}
        >
          <div style={{ display: 'flex' }}>{sub}</div>
          <div style={{ display: 'flex', color: accent, fontWeight: 600 }}>
            marketscannerpros.app
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'cache-control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400',
      },
    },
  );
}
