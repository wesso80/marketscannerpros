import type { ReactNode } from 'react';

// Placeholder for engine pages that are scheduled but not yet ported. Keeps the
// navigation and status links valid without shipping a 404.
export default function EnginePlaceholder({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div>
      <header style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--msp-text)' }}>{title}</h1>
        <p style={{ margin: '4px 0 0', fontSize: '0.86rem', color: 'var(--msp-text-muted)' }}>{description}</p>
      </header>
      <div
        style={{
          padding: '24px 18px',
          borderRadius: 'var(--msp-radius-card)',
          border: '1px dashed var(--msp-border-strong)',
          background: 'var(--msp-panel)',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            fontSize: '0.68rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--msp-warn)',
            background: 'var(--msp-warn-tint)',
            border: '1px solid rgba(245,177,76,0.32)',
            borderRadius: 6,
            padding: '2px 8px',
          }}
        >
          In development
        </span>
        <p style={{ margin: '12px 0 0', fontSize: '0.84rem', color: 'var(--msp-text-muted)', maxWidth: 640 }}>
          This engine dashboard is scheduled in the analytics build-out. The Master Command Centre already
          consumes a mock version of this engine&apos;s output. The native spreadsheet view will land here once the
          engine is ported and parity-tested.
        </p>
        {children}
      </div>
    </div>
  );
}
