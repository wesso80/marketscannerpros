'use client';

import type { TriggerLadderResult, TriggerRung } from '@/lib/intelligence/types';
import { STATE_STYLES, gateToSemantic } from '@/lib/intelligence/states';

/* ═══════════════════════════════════════════════════════════════════════════
   TriggerLadder — shows how close every required condition is to passing, and
   names the single primary blocker. More useful to a researcher than BUY/SELL.
   ════════════════════════════════════════════════════════════════════════════ */

function rungFill(rung: TriggerRung): number {
  if (rung.required <= 0) return 100;
  return Math.max(0, Math.min(100, (rung.current / rung.required) * 100));
}

export default function TriggerLadder({ ladder }: { ladder: TriggerLadderResult }) {
  return (
    <div
      style={{
        border: '1px solid var(--msp-border)',
        borderRadius: 'var(--msp-radius-card)',
        background: 'var(--msp-panel)',
        overflow: 'hidden',
      }}
    >
      {ladder.rungs.map((rung) => {
        const semantic = rung.passed ? 'strong-positive' : gateToSemantic(rung.status);
        const style = STATE_STYLES[semantic];
        const fill = rungFill(rung);
        const isBlocker = rung.gate === ladder.primaryBlocker;
        return (
          <div
            key={rung.gate}
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 92px 1fr 92px',
              alignItems: 'center',
              gap: 12,
              padding: '8px 14px',
              borderBottom: '1px solid var(--msp-border)',
              borderLeft: isBlocker ? `3px solid ${STATE_STYLES.critical.fg}` : '3px solid transparent',
            }}
          >
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--msp-text)' }}>{rung.gate}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--msp-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {rung.current} / {rung.required}
            </span>
            <div
              style={{
                position: 'relative',
                height: 8,
                borderRadius: 4,
                background: 'var(--msp-card-2)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: `${fill}%`,
                  background: style.fg,
                  opacity: 0.85,
                  borderRadius: 4,
                }}
              />
            </div>
            <span
              style={{
                justifySelf: 'end',
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 6,
                color: style.fg,
                background: style.bg,
                border: `1px solid ${style.border}`,
                whiteSpace: 'nowrap',
              }}
            >
              {rung.passed ? 'PASS' : `${rung.distance > 0 ? '+' : ''}${rung.distance}`}
            </span>
          </div>
        );
      })}

      <div style={{ padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
        {ladder.primaryBlocker && (
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: STATE_STYLES.critical.fg }}>
            PRIMARY BLOCKER: {ladder.primaryBlocker.toUpperCase()}
          </span>
        )}
        {ladder.nextClosest.length > 0 && (
          <span style={{ fontSize: '0.75rem', color: 'var(--msp-text-muted)' }}>
            Next closest to pass: {ladder.nextClosest.join(' / ').toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}
