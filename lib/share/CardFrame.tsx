/**
 * Shared layout for the 1200×675 share cards (X's large image ratio). Rendered by next/og (satori), so every
 * element with more than one child uses display:flex and colours are literals.
 */
import type { ReactNode } from 'react';
import { SHARE_DISCLAIMER, SHARE_SITE, SHARE_THEME as T } from './theme';
import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH } from './validate';

export function CardFrame({ kicker, asOf, accent = T.accent, children, note }: {
  kicker: string;
  asOf: string;
  accent?: string;
  children: ReactNode;
  /** Optional data-quality or basis line shown above the disclaimer. */
  note?: string | null;
}) {
  return (
    <div
      style={{
        width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT, display: 'flex', flexDirection: 'column',
        background: `linear-gradient(135deg, ${T.bg} 0%, #0F172A 55%, #0A1628 100%)`, color: T.text,
        padding: '40px 56px 30px', position: 'relative',
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, width: SHARE_CARD_WIDTH, height: 6, background: accent, display: 'flex' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52, borderRadius: 12,
              background: T.accent, color: '#04130D', fontSize: 20, letterSpacing: 1,
            }}
          >
            MSP
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 16 }}>
            <div style={{ fontSize: 26, color: T.text, display: 'flex' }}>MarketScanner Pros</div>
            <div style={{ fontSize: 17, color: accent, letterSpacing: 2, display: 'flex' }}>{kicker.toUpperCase()}</div>
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 19, color: T.muted, textAlign: 'right' }}>{asOf}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, marginTop: 26, overflow: 'hidden' }}>{children}</div>

      <div style={{ display: 'flex', flexDirection: 'column', borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
        {note ? <div style={{ display: 'flex', fontSize: 15, color: T.warn, marginBottom: 6 }}>{note}</div> : null}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, color: T.faint }}>
          <div style={{ display: 'flex' }}>{SHARE_DISCLAIMER}</div>
          <div style={{ display: 'flex', color: T.muted }}>{SHARE_SITE}</div>
        </div>
      </div>
    </div>
  );
}

/** Small label-over-value cell. */
export function Stat({ label, value, color = T.text, width }: { label: string; value: string; color?: string; width?: number }) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12,
        padding: '12px 16px', marginRight: 12, ...(width ? { width } : { flexGrow: 1, flexBasis: 0 }),
      }}
    >
      <div style={{ display: 'flex', fontSize: 15, color: T.muted, letterSpacing: 1 }}>{label.toUpperCase()}</div>
      <div style={{ display: 'flex', fontSize: 30, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}
